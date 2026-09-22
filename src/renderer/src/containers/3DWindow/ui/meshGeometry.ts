import * as THREE from 'three'
import type { GpuGeometry, GpuGroup } from '../api/geometryV2'
import type { PrimitiveInfo } from '../models/types'
import { startTimer } from '../perf/metrics'

export interface GeometryGroup {
  geometry: THREE.BufferGeometry
  textureFile: string | null // null = vertex-colored (untextured) group
  textureMaskMode: boolean
}

/**
 * Partition primitives by texture file and build one BufferGeometry per group.
 * Untextured primitives share a vertex-colored group; textured primitives
 * sharing a texture share a group with UV attributes. Quads are split into
 * two triangles; n-gons are fan-triangulated.
 */
export function buildTexturedGeometries(primitives: PrimitiveInfo[]): GeometryGroup[] | null {
  // Measured HERE rather than at the call site so the count covers every caller.
  // The count is the number that matters: SceneContent rebuilds the whole merged
  // scene once per object that lands, so a 12-object load reports `build x12`
  // where it should report `build x1`.
  const endBuild = startTimer('build')
  try {
    return buildGroups(primitives)
  } finally {
    endBuild()
  }
}

function buildGroups(primitives: PrimitiveInfo[]): GeometryGroup[] | null {
  // Key "" = untextured; mask-mode primitives get a separate "mask:" key.
  const groups = new Map<string, PrimitiveInfo[]>()
  for (const prim of primitives) {
    const key =
      prim.textureMaskMode && prim.textureFile ? `mask:${prim.textureFile}` : prim.textureFile || ''
    const arr = groups.get(key)
    if (arr) arr.push(prim)
    else groups.set(key, [prim])
  }

  const result: GeometryGroup[] = []

  for (const [texKey, groupPrims] of groups) {
    const isMaskMode = texKey.startsWith('mask:')
    const isTextured = texKey !== '' && !isMaskMode
    const hasUVs = isTextured || isMaskMode
    const hasColors = !isTextured // vertex colors for untextured and mask-mode

    const positions: number[] = []
    const colors: number[] = []
    const uvArray: number[] = []
    const indices: number[] = []
    let vertexOffset = 0

    for (const prim of groupPrims) {
      const verts = prim.vertices
      const { r, g, b } = prim.color

      for (let vi = 0; vi < verts.length; vi++) {
        positions.push(verts[vi].x, verts[vi].y, verts[vi].z)
        if (hasColors) colors.push(r, g, b)
        if (hasUVs && prim.uvs) uvArray.push(prim.uvs[vi].u, prim.uvs[vi].v)
      }

      // Fan from vertex 0. This is the whole triangulation: a triangle is a
      // one-step fan and a quad a two-step one, so the separate 3- and 4-vertex
      // branches that used to sit here emitted exactly these indices. They only
      // existed to compute a face index per primitive, and that went with the
      // map below. A count under 3 runs zero iterations, which is the right
      // answer for a degenerate primitive.
      for (let i = 1; i < verts.length - 1; i++) {
        indices.push(vertexOffset, vertexOffset + i, vertexOffset + i + 1)
      }
      vertexOffset += verts.length
    }

    if (positions.length === 0) continue

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    if (hasUVs) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2))
    }
    if (hasColors) {
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    }
    geo.setIndex(indices)
    geo.computeVertexNormals()

    const actualTexFile = isMaskMode ? texKey.substring(5) : isTextured ? texKey : null
    result.push({
      geometry: geo,
      textureFile: actualTexFile,
      textureMaskMode: isMaskMode
    })
  }

  return result.length > 0 ? result : null
}


// ── Wire format v2 ───────────────────────────────────────────────────────────

export interface GpuMesh {
  /** ONE geometry for the whole object. Draw groups mark the material spans. */
  geometry: THREE.BufferGeometry
  /** Parallel to the geometry's draw groups: groups[i] uses material i. */
  groups: GpuGroup[]
}

/**
 * Build a single BufferGeometry from a v2 payload, with one draw group per
 * material span.
 *
 * No per-vertex work happens here at all. The attributes wrap the response
 * buffer's memory directly, and the index buffer is used exactly as the engine
 * wrote it — v2's indices are GLOBAL vertex indices, which is what makes
 * addGroup() viable. Splitting this into one geometry per group would instead
 * mean subtracting vertexStart from every index: 24 million subtractions on an
 * 8M-triangle scene, to end up with the same number of draw calls.
 *
 * `withNormals` is false for unlit (flat) shading, where computeVertexNormals is
 * pure waste — it is an O(vertices) pass that also allocates a third position-
 * sized attribute, 192 MB on a 2000x2000 ground, for data no shader reads.
 */
export function buildGpuGeometry(gpu: GpuGeometry, withNormals = true): GpuMesh | null {
  if (gpu.totalVerts === 0 || gpu.totalTris === 0) return null

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(gpu.positions, 3))

  // Both arrays are always present in the payload, but a group only reads the
  // one its flags claim. Attaching an attribute nothing samples would upload it
  // to the GPU for nothing.
  if (gpu.groups.some((g) => g.hasUVs)) {
    geo.setAttribute('uv', new THREE.BufferAttribute(gpu.uvs, 2))
  }
  if (gpu.groups.some((g) => g.hasColors)) {
    geo.setAttribute('color', new THREE.BufferAttribute(gpu.colors, 3))
  }

  geo.setIndex(new THREE.BufferAttribute(gpu.indices, 1))

  for (let i = 0; i < gpu.groups.length; i++) {
    const g = gpu.groups[i]
    geo.addGroup(g.triangleStart * 3, g.triangleCount * 3, i)
  }

  if (withNormals) geo.computeVertexNormals()

  return { geometry: geo, groups: gpu.groups }
}
