/**
 * Reader for the engine's "wire format v2" — the buffer packGPUBuffers emits.
 *
 * The whole point is that it decodes NOTHING. v1 walks the payload and builds a
 * JS object per vertex, per uv and per primitive; those objects live in V8's
 * pointer-compression cage, which is a hard 4 GB in Electron regardless of how
 * much RAM the machine has, and a 2000x2000 ground needs ~4.4 GB of them. This
 * reader instead returns TypedArray VIEWS over the response buffer. A view costs
 * a few dozen bytes of cage space no matter how large the geometry is, because
 * the bytes themselves are external memory.
 *
 * Layout, from the C++ writer (pyhelios_wrapper_context.cpp, packGPUBuffers):
 *
 *   header      16 B   version(u8) flags(u8) groupCount(u16)
 *                      totalVerts(u32) totalTris(u32) primCount(u32)
 *   descriptors 19 B + pathLen, per group:
 *                      vertexStart(u32) vertexCount(u32)
 *                      triangleStart(u32) triangleCount(u32)
 *                      pathLen(u16) flags(u8) path(bytes)
 *               then padded up to a 4-byte boundary
 *   arrays      positions f32x3 | colors f32x3 | uvs f32x2
 *               indices u32x3   | faceToUuid u32
 *
 * Indices are GLOBAL vertex indices, not per-group. That is deliberate and it is
 * what lets the renderer build ONE BufferGeometry and mark the groups with
 * addGroup() — slicing per group would mean subtracting vertexStart from every
 * index, which is 24M subtractions on an 8M-triangle scene for no benefit.
 */

const HEADER_SIZE = 16
const DESCRIPTOR_FIXED = 19
const SUPPORTED_VERSION = 2

const FLAG_MASK_MODE = 0x01
const FLAG_HAS_UVS = 0x02
const FLAG_HAS_COLORS = 0x04

/** Thrown when the buffer is not a v2 payload we can read. */
export class GpuParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GpuParseError'
  }
}

export interface GpuGroup {
  /** First vertex of this group in the shared arrays. */
  vertexStart: number
  vertexCount: number
  /** First triangle of this group — x3 gives the index-buffer offset. */
  triangleStart: number
  triangleCount: number
  textureFile: string | null
  maskMode: boolean
  hasUVs: boolean
  hasColors: boolean
}

export interface GpuGeometry {
  positions: Float32Array
  colors: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  /** triangle index → primitive uuid. A view, so it costs nothing to carry. */
  faceToUuid: Uint32Array
  groups: GpuGroup[]
  totalVerts: number
  totalTris: number
  primitiveCount: number
}

/**
 * Parse a v2 buffer into views over it. Returns null for an empty body, which is
 * what an object with no primitives legitimately serves.
 *
 * Throws GpuParseError rather than letting a TypedArray constructor raise a bare
 * RangeError: a truncated response is rare, but it is exactly the case where the
 * message has to name what was expected — the same reasoning as the `need()`
 * guard in the v1 reader.
 */
export function parseGpuBuffers(buffer: ArrayBuffer): GpuGeometry | null {
  if (buffer.byteLength === 0) return null

  if (buffer.byteLength < HEADER_SIZE) {
    throw new GpuParseError(
      `Geometry buffer is truncated: ${buffer.byteLength} byte(s), too short for a ${HEADER_SIZE}-byte header.`
    )
  }

  const view = new DataView(buffer)
  const version = view.getUint8(0)
  if (version !== SUPPORTED_VERSION) {
    throw new GpuParseError(
      `Unsupported geometry wire format: version ${version} (this build reads version ${SUPPORTED_VERSION}).`
    )
  }

  const groupCount = view.getUint16(2, true)
  const totalVerts = view.getUint32(4, true)
  const totalTris = view.getUint32(8, true)
  const primitiveCount = view.getUint32(12, true)

  // ── Group descriptors ──────────────────────────────────────────────────────
  const groups: GpuGroup[] = new Array(groupCount)
  const decoder = new TextDecoder()
  let offset = HEADER_SIZE

  for (let i = 0; i < groupCount; i++) {
    if (offset + DESCRIPTOR_FIXED > buffer.byteLength) {
      throw new GpuParseError(
        `Geometry buffer is truncated in group descriptor ${i}: needed ${DESCRIPTOR_FIXED} byte(s) ` +
          `at offset ${offset}, buffer is ${buffer.byteLength} byte(s).`
      )
    }

    const vertexStart = view.getUint32(offset, true)
    const vertexCount = view.getUint32(offset + 4, true)
    const triangleStart = view.getUint32(offset + 8, true)
    const triangleCount = view.getUint32(offset + 12, true)
    const pathLen = view.getUint16(offset + 16, true)
    const flags = view.getUint8(offset + 18)
    offset += DESCRIPTOR_FIXED

    if (offset + pathLen > buffer.byteLength) {
      throw new GpuParseError(
        `Geometry buffer is truncated in group ${i}'s texture path: needed ${pathLen} byte(s) ` +
          `at offset ${offset}, buffer is ${buffer.byteLength} byte(s).`
      )
    }

    // One decode per GROUP. v1 decoded the same path once per primitive, which
    // on a million-patch ground was a million separate copies of one string.
    const textureFile = pathLen > 0 ? decoder.decode(new Uint8Array(buffer, offset, pathLen)) : null
    offset += pathLen

    groups[i] = {
      vertexStart,
      vertexCount,
      triangleStart,
      triangleCount,
      textureFile,
      maskMode: (flags & FLAG_MASK_MODE) !== 0,
      hasUVs: (flags & FLAG_HAS_UVS) !== 0,
      hasColors: (flags & FLAG_HAS_COLORS) !== 0
    }
  }

  // ── Arrays ─────────────────────────────────────────────────────────────────
  // The writer pads to 4 bytes here so every view below starts aligned; a
  // misaligned byteOffset makes the TypedArray constructor throw.
  const arraysStart = (offset + 3) & ~3

  const positionsLen = totalVerts * 3
  const colorsLen = totalVerts * 3
  const uvsLen = totalVerts * 2
  const indicesLen = totalTris * 3

  const positionsAt = arraysStart
  const colorsAt = positionsAt + positionsLen * 4
  const uvsAt = colorsAt + colorsLen * 4
  const indicesAt = uvsAt + uvsLen * 4
  const faceToUuidAt = indicesAt + indicesLen * 4
  const required = faceToUuidAt + totalTris * 4

  if (required > buffer.byteLength) {
    throw new GpuParseError(
      `Geometry buffer is truncated: header declares ${totalVerts} vertices and ${totalTris} ` +
        `triangles, needing ${required} byte(s), but the buffer is ${buffer.byteLength} byte(s).`
    )
  }

  return {
    positions: new Float32Array(buffer, positionsAt, positionsLen),
    colors: new Float32Array(buffer, colorsAt, colorsLen),
    uvs: new Float32Array(buffer, uvsAt, uvsLen),
    indices: new Uint32Array(buffer, indicesAt, indicesLen),
    faceToUuid: new Uint32Array(buffer, faceToUuidAt, totalTris),
    groups,
    totalVerts,
    totalTris,
    primitiveCount
  }
}
