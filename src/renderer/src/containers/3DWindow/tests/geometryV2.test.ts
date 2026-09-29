import { GpuParseError, parseGpuBuffers } from '../api/geometryV2'

// Builds a wire-format-v2 buffer exactly as the C++ writer does
// (pyhelios_wrapper_context.cpp packGPUBuffers), so these tests pin the reader
// against the real layout rather than against itself.
function buildV2(groups: Array<{
  vertexStart: number; vertexCount: number
  triangleStart: number; triangleCount: number
  texture?: string; mask?: boolean; uvs?: boolean; colors?: boolean
}>, totalVerts: number, totalTris: number, primCount = 0): ArrayBuffer {
  const enc = new TextEncoder()
  const paths = groups.map((g) => (g.texture ? enc.encode(g.texture) : new Uint8Array(0)))
  const descBytes = groups.reduce((n, _, i) => n + 19 + paths[i].length, 0)
  const alignedDescEnd = (16 + descBytes + 3) & ~3
  const size =
    alignedDescEnd + totalVerts * 12 + totalVerts * 12 + totalVerts * 8 + totalTris * 12 + totalTris * 4

  const buf = new ArrayBuffer(size)
  const u8 = new Uint8Array(buf)
  const dv = new DataView(buf)

  u8[0] = 2
  u8[1] = 0
  dv.setUint16(2, groups.length, true)
  dv.setUint32(4, totalVerts, true)
  dv.setUint32(8, totalTris, true)
  dv.setUint32(12, primCount, true)

  let off = 16
  groups.forEach((g, i) => {
    dv.setUint32(off, g.vertexStart, true); off += 4
    dv.setUint32(off, g.vertexCount, true); off += 4
    dv.setUint32(off, g.triangleStart, true); off += 4
    dv.setUint32(off, g.triangleCount, true); off += 4
    dv.setUint16(off, paths[i].length, true); off += 2
    let flags = 0
    if (g.mask) flags |= 0x01
    if (g.uvs) flags |= 0x02
    if (g.colors) flags |= 0x04
    u8[off] = flags; off += 1
    u8.set(paths[i], off); off += paths[i].length
  })
  return buf
}

describe('parseGpuBuffers — header and layout', () => {
  it('reads the header and returns zero-copy views over the SAME buffer', () => {
    const buf = buildV2([{ vertexStart: 0, vertexCount: 4, triangleStart: 0, triangleCount: 2, colors: true }], 4, 2, 1)
    const g = parseGpuBuffers(buf)!

    expect(g.totalVerts).toBe(4)
    expect(g.totalTris).toBe(2)
    // Zero-copy is the entire point: a copy would put the geometry back in the
    // JS heap, which is the cage pressure this format exists to avoid.
    expect(g.positions.buffer).toBe(buf)
    expect(g.indices.buffer).toBe(buf)
    expect(g.positions).toHaveLength(12)
    expect(g.indices).toHaveLength(6)
    expect(g.faceToUuid).toHaveLength(2)
  })

  it('places every array at its aligned offset so the views line up', () => {
    // 1 group, no texture: descriptors end at 16+19=35, aligned to 36.
    const buf = buildV2([{ vertexStart: 0, vertexCount: 4, triangleStart: 0, triangleCount: 2, colors: true }], 4, 2)
    const g = parseGpuBuffers(buf)!
    expect(g.positions.byteOffset).toBe(36)
    expect(g.colors.byteOffset).toBe(36 + 4 * 12)
    expect(g.uvs.byteOffset).toBe(36 + 4 * 24)
    expect(g.indices.byteOffset).toBe(36 + 4 * 32)
    expect(g.faceToUuid.byteOffset).toBe(36 + 4 * 32 + 2 * 12)
  })

  it('writes real vertex data through the view', () => {
    const buf = buildV2([{ vertexStart: 0, vertexCount: 3, triangleStart: 0, triangleCount: 1, colors: true }], 3, 1)
    new Float32Array(buf, 36, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0])
    expect(Array.from(parseGpuBuffers(buf)!.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
  })
})

describe('parseGpuBuffers — groups', () => {
  it('decodes flags and texture path per group', () => {
    const buf = buildV2([
      { vertexStart: 0, vertexCount: 4, triangleStart: 0, triangleCount: 2, colors: true },
      { vertexStart: 4, vertexCount: 4, triangleStart: 2, triangleCount: 2, texture: 'dirt.jpg', uvs: true },
      { vertexStart: 8, vertexCount: 4, triangleStart: 4, triangleCount: 2, texture: 'leaf.png', mask: true, uvs: true, colors: true }
    ], 12, 6)
    const g = parseGpuBuffers(buf)!

    expect(g.groups).toHaveLength(3)
    expect(g.groups[0]).toMatchObject({ textureFile: null, maskMode: false, hasColors: true, hasUVs: false })
    expect(g.groups[1]).toMatchObject({ textureFile: 'dirt.jpg', maskMode: false, hasUVs: true, hasColors: false })
    expect(g.groups[2]).toMatchObject({ textureFile: 'leaf.png', maskMode: true, hasUVs: true, hasColors: true })
  })

  it('keeps triangle ranges, which become BufferGeometry draw groups', () => {
    const buf = buildV2([
      { vertexStart: 0, vertexCount: 4, triangleStart: 0, triangleCount: 2, colors: true },
      { vertexStart: 4, vertexCount: 6, triangleStart: 2, triangleCount: 4, texture: 't.jpg', uvs: true }
    ], 10, 6)
    const g = parseGpuBuffers(buf)!
    expect(g.groups.map((x) => [x.triangleStart, x.triangleCount])).toEqual([[0, 2], [2, 4]])
  })
})

describe('parseGpuBuffers — refusals', () => {
  it('returns null for an empty body (an object with no primitives)', () => {
    expect(parseGpuBuffers(new ArrayBuffer(0))).toBeNull()
  })

  it('rejects a version it does not understand rather than misreading it', () => {
    const buf = buildV2([{ vertexStart: 0, vertexCount: 3, triangleStart: 0, triangleCount: 1, colors: true }], 3, 1)
    new Uint8Array(buf)[0] = 3
    expect(() => parseGpuBuffers(buf)).toThrow(GpuParseError)
    expect(() => parseGpuBuffers(buf)).toThrow(/version 3/)
  })

  it('rejects a truncated buffer instead of building views past the end', () => {
    // A short read here would produce a RangeError from the TypedArray
    // constructor with nothing naming the object — the same failure mode the v1
    // reader's `need()` guard exists to prevent.
    const buf = buildV2([{ vertexStart: 0, vertexCount: 100, triangleStart: 0, triangleCount: 50, colors: true }], 100, 50)
    expect(() => parseGpuBuffers(buf.slice(0, 200))).toThrow(GpuParseError)
  })

  it('rejects a header too short to hold its own fields', () => {
    expect(() => parseGpuBuffers(new ArrayBuffer(8))).toThrow(GpuParseError)
  })
})
