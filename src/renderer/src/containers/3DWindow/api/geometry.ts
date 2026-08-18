import { ApiError } from 'utils/api'
import { BASE_URL } from 'utils/constants'
import { getSessionId } from 'utils/session'
import type { PrimitiveInfo, Vec2UV, Vec3 } from '../models/types'
import { GEOMETRY_ROUTES } from './endpoints'

/**
 * Parse the backend's binary geometry wire format into PrimitiveInfo[].
 */
/**
 * Raised when the buffer runs out mid-primitive.
 *
 * Without this the failure surfaced as a bare RangeError thrown from inside
 * DataView, naming neither the object nor the byte — nothing to act on. A
 * truncated response is rare but it is exactly the case where a useful message
 * saves an afternoon.
 */
class GeometryParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeometryParseError'
  }
}

function parseBinaryPrimitives(buffer: ArrayBuffer): PrimitiveInfo[] {
  const view = new DataView(buffer)
  let offset = 0

  // Every read is preceded by this. The wire format is a walk driven by lengths
  // read out of the stream itself, so a single bad length would otherwise send
  // the cursor off the end of the buffer.
  //
  // `what` must be a plain string constant, never a template literal. This runs
  // several times per primitive, and an interpolated argument is built BEFORE
  // the call — so passing `primitive ${i} header` allocated a fresh string on
  // every primitive whether or not anything was wrong. On a large ground that
  // was hundreds of thousands of throwaway strings for a message that never
  // fires, and it made adding a ground visibly slower. The sentence is now
  // assembled only when it is about to be thrown.
  const need = (bytes: number, index: number, what: string): void => {
    if (offset + bytes > buffer.byteLength) {
      throw new GeometryParseError(
        `Geometry data is truncated at primitive ${index} (${what}): needed ${bytes} more ` +
          `byte(s) at offset ${offset}, buffer is ${buffer.byteLength} byte(s).`
      )
    }
  }

  if (buffer.byteLength < 4) {
    throw new GeometryParseError(
      `Geometry data is truncated: ${buffer.byteLength} byte(s), too short to hold a primitive count.`
    )
  }
  const count = view.getUint32(offset, true)
  offset += 4

  const primitives: PrimitiveInfo[] = new Array(count)
  for (let i = 0; i < count; i++) {
    need(8, i, 'header')
    const uuid = view.getInt32(offset, true)
    offset += 4
    const vertexCount = view.getUint32(offset, true)
    offset += 4

    need(vertexCount * 12, i, 'vertices')
    const vertices: Vec3[] = new Array(vertexCount)
    for (let v = 0; v < vertexCount; v++) {
      vertices[v] = {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true)
      }
      offset += 12
    }

    need(12, i, 'colour')
    const r = view.getFloat32(offset, true)
    const g = view.getFloat32(offset + 4, true)
    const b = view.getFloat32(offset + 8, true)
    offset += 12

    need(2, i, 'texture path length')
    const texPathLen = view.getUint16(offset, true)
    offset += 2

    let textureFile: string | undefined
    let textureMaskMode = false
    let uvs: Vec2UV[] | undefined

    if (texPathLen > 0) {
      need(texPathLen, i, 'texture path')
      const pathBytes = new Uint8Array(buffer, offset, texPathLen)
      let rawPath = new TextDecoder().decode(pathBytes)
      offset += texPathLen

      if (rawPath.startsWith('mask:')) {
        textureMaskMode = true
        rawPath = rawPath.substring(5)
      }
      textureFile = rawPath

      need(vertexCount * 8, i, 'texture coordinates')
      uvs = new Array(vertexCount)
      for (let vi = 0; vi < vertexCount; vi++) {
        uvs[vi] = {
          u: view.getFloat32(offset, true),
          v: view.getFloat32(offset + 4, true)
        }
        offset += 8
      }
    }

    primitives[i] = {
      uuid,
      vertices,
      color: { r, g, b },
      textureFile,
      textureMaskMode: textureMaskMode || undefined,
      uvs
    }
  }

  return primitives
}

// Requests that have STARTED but not yet settled, keyed by path.
//
// Two callers asking for the same object at the same moment would otherwise
// each start their own download. On a 231 MB scene that is the same bytes
// pulled twice, parsed twice, and queued twice behind the backend's per-
// scenario lock. The second caller joins the first instead.
//
// This mirrors the in-flight guard in ui/textureCache.ts, which exists on the
// texture path for exactly this reason — the geometry path never got one.
//
// Callers share the SAME array. Nothing mutates a parsed result today (it is
// stored in sceneCache and read for rendering), and nothing should start.
const inFlight = new Map<string, Promise<PrimitiveInfo[]>>()

/**
 * Fetch binary geometry from a URL path. Uses fetch (not utils/api) because
 * the response is a binary ArrayBuffer, not JSON.
 *
 * No abort signal: a high-resolution mesh is legitimately slow to serve, and
 * cutting it off failed a load that would have completed. Matches utils/api,
 * which carries no timeout either.
 */
async function fetchBinaryGeometry(path: string): Promise<PrimitiveInfo[]> {
  const joined = inFlight.get(path)
  if (joined) return joined

  const request = (async (): Promise<PrimitiveInfo[]> => {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'session-id': getSessionId() }
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ApiError(res.status, body || res.statusText || `Failed to load geometry: ${path}`)
    }

    const buffer = await res.arrayBuffer()
    return parseBinaryPrimitives(buffer)
  })()

  inFlight.set(path, request)
  try {
    return await request
  } finally {
    // Cleared once settled, success or failure, so a retry starts a fresh
    // request rather than replaying a stale rejection.
    inFlight.delete(path)
  }
}

/** Fetch and parse one object's geometry. */
export async function fetchObjectGeometryBinary(
  projectId: string,
  scenarioId: string,
  objectId: number
): Promise<PrimitiveInfo[]> {
  const path = GEOMETRY_ROUTES.objectGeometryBinary(projectId, scenarioId, objectId)
  return fetchBinaryGeometry(path)
}
