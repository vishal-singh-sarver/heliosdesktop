import { buildTexturedGeometries } from '../ui/meshGeometry'
import type { PrimitiveInfo } from '../models/types'

// Characterisation tests for the geometry builder.
//
// Written BEFORE removing the per-triangle faceToUuid map, so the removal can be
// shown to change nothing that reaches the GPU. Everything asserted here is an
// attribute or index the renderer actually draws from; nothing asserts the
// builder's internal bookkeeping.

const xyz = (x: number, y: number, z: number): { x: number; y: number; z: number } => ({ x, y, z })

function prim(uuid: number, verts: Array<[number, number, number]>, over: Partial<PrimitiveInfo> = {}): PrimitiveInfo {
  return {
    uuid,
    vertices: verts.map(([x, y, z]) => xyz(x, y, z)),
    color: { r: 1, g: 0, b: 0 },
    ...over
  }
}

const TRI: Array<[number, number, number]> = [[0, 0, 0], [1, 0, 0], [0, 1, 0]]
const QUAD: Array<[number, number, number]> = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]
const PENTAGON: Array<[number, number, number]> = [
  [0, 0, 0], [1, 0, 0], [2, 1, 0], [1, 2, 0], [0, 1, 0]
]

const idx = (g: ReturnType<typeof buildTexturedGeometries>, i = 0): number[] =>
  Array.from(g![i].geometry.getIndex()!.array)

const attr = (g: ReturnType<typeof buildTexturedGeometries>, name: string, i = 0): number[] | null => {
  const a = g![i].geometry.getAttribute(name)
  return a ? Array.from(a.array) : null
}

describe('buildTexturedGeometries — triangulation', () => {
  it('emits one triangle for a 3-vertex primitive', () => {
    expect(idx(buildTexturedGeometries([prim(1, TRI)]))).toEqual([0, 1, 2])
  })

  it('splits a quad into two triangles sharing the 0-2 diagonal', () => {
    expect(idx(buildTexturedGeometries([prim(1, QUAD)]))).toEqual([0, 1, 2, 0, 2, 3])
  })

  it('fan-triangulates an n-gon from vertex 0', () => {
    expect(idx(buildTexturedGeometries([prim(1, PENTAGON)]))).toEqual([0, 1, 2, 0, 2, 3, 0, 3, 4])
  })

  it('offsets each primitive past the vertices of the ones before it', () => {
    // The bug this pins: a vertexOffset that fails to advance makes every
    // primitive after the first index into the wrong vertices, which draws as a
    // shredded mesh rather than an obvious error.
    expect(idx(buildTexturedGeometries([prim(1, QUAD), prim(2, QUAD)]))).toEqual([
      0, 1, 2, 0, 2, 3,
      4, 5, 6, 4, 6, 7
    ])
  })

  it('drops a degenerate primitive with fewer than 3 vertices from the index', () => {
    const groups = buildTexturedGeometries([prim(1, [[0, 0, 0], [1, 0, 0]]), prim(2, TRI)])
    // The 2-vertex primitive still contributes positions, so the triangle's
    // indices start at 2.
    expect(idx(groups)).toEqual([2, 3, 4])
  })
})

describe('buildTexturedGeometries — attributes', () => {
  it('gives an untextured group positions and vertex colours, but no uv', () => {
    const g = buildTexturedGeometries([prim(1, TRI, { color: { r: 0.25, g: 0.5, b: 0.75 } })])
    expect(attr(g, 'position')).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
    expect(attr(g, 'color')).toEqual([0.25, 0.5, 0.75, 0.25, 0.5, 0.75, 0.25, 0.5, 0.75])
    expect(attr(g, 'uv')).toBeNull()
  })

  it('gives a textured group uv but no vertex colours', () => {
    const g = buildTexturedGeometries([
      prim(1, TRI, { textureFile: 'dirt.jpg', uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0, v: 1 }] })
    ])
    expect(attr(g, 'uv')).toEqual([0, 0, 1, 0, 0, 1])
    expect(attr(g, 'color')).toBeNull()
  })

  it('gives a mask-mode group BOTH uv and vertex colours', () => {
    // Mask mode reads alpha from the texture but colours the fragment from the
    // vertex colour, so it is the one group that needs both.
    const g = buildTexturedGeometries([
      prim(1, TRI, {
        textureFile: 'leaf.png',
        textureMaskMode: true,
        uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0, v: 1 }]
      })
    ])
    expect(attr(g, 'uv')).not.toBeNull()
    expect(attr(g, 'color')).not.toBeNull()
  })

  it('computes normals so lit materials have something to shade with', () => {
    const g = buildTexturedGeometries([prim(1, TRI)])
    expect(attr(g, 'normal')).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1])
  })
})

describe('buildTexturedGeometries — grouping', () => {
  it('merges primitives sharing a texture into ONE group', () => {
    const uvs = [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0, v: 1 }]
    const g = buildTexturedGeometries([
      prim(1, TRI, { textureFile: 'dirt.jpg', uvs }),
      prim(2, TRI, { textureFile: 'dirt.jpg', uvs })
    ])
    expect(g).toHaveLength(1)
    expect(g![0].textureFile).toBe('dirt.jpg')
    expect(idx(g)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('separates different textures, and untextured, into their own groups', () => {
    const uvs = [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0, v: 1 }]
    const g = buildTexturedGeometries([
      prim(1, TRI),
      prim(2, TRI, { textureFile: 'dirt.jpg', uvs }),
      prim(3, TRI, { textureFile: 'grass.jpg', uvs })
    ])
    expect(g).toHaveLength(3)
    expect(g!.map((x) => x.textureFile)).toEqual([null, 'dirt.jpg', 'grass.jpg'])
  })

  it('keeps mask-mode separate from plain use of the SAME texture file', () => {
    const uvs = [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0, v: 1 }]
    const g = buildTexturedGeometries([
      prim(1, TRI, { textureFile: 'leaf.png', uvs }),
      prim(2, TRI, { textureFile: 'leaf.png', textureMaskMode: true, uvs })
    ])
    expect(g).toHaveLength(2)
    // The "mask:" key prefix must be stripped back off — the material loads the
    // real filename.
    expect(g!.map((x) => [x.textureFile, x.textureMaskMode])).toEqual([
      ['leaf.png', false],
      ['leaf.png', true]
    ])
  })

  it('returns null for no primitives at all', () => {
    expect(buildTexturedGeometries([])).toBeNull()
  })
})

// ── Wire format v2 builder ───────────────────────────────────────────────────

import { buildGpuGeometry } from '../ui/meshGeometry'
import type { GpuGeometry } from '../api/geometryV2'

function gpu(over: Partial<GpuGeometry> = {}): GpuGeometry {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    colors: new Float32Array(12),
    uvs: new Float32Array(8),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    faceToUuid: new Uint32Array([7, 7]),
    groups: [{
      vertexStart: 0, vertexCount: 4, triangleStart: 0, triangleCount: 2,
      textureFile: null, maskMode: false, hasUVs: false, hasColors: true
    }],
    totalVerts: 4,
    totalTris: 2,
    primitiveCount: 1,
    ...over
  }
}

describe('buildGpuGeometry', () => {
  it('wraps the payload arrays without copying them', () => {
    const g = gpu()
    const mesh = buildGpuGeometry(g)!
    // Identity, not equality: a copy would put the geometry back in the JS heap.
    expect(mesh.geometry.getAttribute('position').array).toBe(g.positions)
    expect(mesh.geometry.getIndex()!.array).toBe(g.indices)
  })

  it('uses the engine indices verbatim — no per-group rebasing', () => {
    const g = gpu({
      groups: [
        { vertexStart: 0, vertexCount: 4, triangleStart: 0, triangleCount: 1, textureFile: null, maskMode: false, hasUVs: false, hasColors: true },
        { vertexStart: 4, vertexCount: 4, triangleStart: 1, triangleCount: 1, textureFile: 'd.jpg', maskMode: false, hasUVs: true, hasColors: false }
      ],
      indices: new Uint32Array([0, 1, 2, 4, 5, 6]),
      totalVerts: 8, totalTris: 2,
      positions: new Float32Array(24), colors: new Float32Array(24), uvs: new Float32Array(16)
    })
    expect(Array.from(buildGpuGeometry(g)!.geometry.getIndex()!.array)).toEqual([0, 1, 2, 4, 5, 6])
  })

  it('emits one draw group per material span, in index units', () => {
    const g = gpu({
      groups: [
        { vertexStart: 0, vertexCount: 4, triangleStart: 0, triangleCount: 2, textureFile: null, maskMode: false, hasUVs: false, hasColors: true },
        { vertexStart: 4, vertexCount: 6, triangleStart: 2, triangleCount: 4, textureFile: 'd.jpg', maskMode: false, hasUVs: true, hasColors: false }
      ],
      totalVerts: 10, totalTris: 6,
      positions: new Float32Array(30), colors: new Float32Array(30), uvs: new Float32Array(20),
      indices: new Uint32Array(18)
    })
    expect(buildGpuGeometry(g)!.geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 12, materialIndex: 1 }
    ])
  })

  it('attaches uv only when some group samples a texture', () => {
    expect(buildGpuGeometry(gpu())!.geometry.getAttribute('uv')).toBeUndefined()
    const textured = gpu({
      groups: [{ vertexStart: 0, vertexCount: 4, triangleStart: 0, triangleCount: 2, textureFile: 'd.jpg', maskMode: false, hasUVs: true, hasColors: false }]
    })
    expect(buildGpuGeometry(textured)!.geometry.getAttribute('uv')).toBeDefined()
  })

  it('skips normals for unlit shading, where nothing reads them', () => {
    expect(buildGpuGeometry(gpu(), false)!.geometry.getAttribute('normal')).toBeUndefined()
    expect(buildGpuGeometry(gpu(), true)!.geometry.getAttribute('normal')).toBeDefined()
  })

  it('returns null for an empty payload', () => {
    expect(buildGpuGeometry(gpu({ totalVerts: 0, totalTris: 0 }))).toBeNull()
  })
})
