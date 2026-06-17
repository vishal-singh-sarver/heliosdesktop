import * as THREE from 'three'
import type { PrimitiveInfo } from '../models/types'

export interface GeometryGroup {
  geometry: THREE.BufferGeometry
  textureFile: string | null // null = vertex-colored (untextured) group
  textureMaskMode: boolean
  // faceIndex → primitive UUID (for click-to-select later).
  faceToUuid: Map<number, number>
}

/**
 * Partition primitives by texture file and build one BufferGeometry per group.
 * Untextured primitives share a vertex-colored group; textured primitives
 * sharing a texture share a group with UV attributes. Quads are split into
 * two triangles; n-gons are fan-triangulated.
 */
export function buildTexturedGeometries(primitives: PrimitiveInfo[]): GeometryGroup[] | null {
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
    const faceToUuid = new Map<number, number>()
    let vertexOffset = 0

    for (const prim of groupPrims) {
      const verts = prim.vertices
      const { r, g, b } = prim.color

      for (let vi = 0; vi < verts.length; vi++) {
        positions.push(verts[vi].x, verts[vi].y, verts[vi].z)
        if (hasColors) colors.push(r, g, b)
        if (hasUVs && prim.uvs) uvArray.push(prim.uvs[vi].u, prim.uvs[vi].v)
      }

      if (verts.length === 3) {
        const faceIdx = indices.length / 3
        indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2)
        faceToUuid.set(faceIdx, prim.uuid)
      } else if (verts.length === 4) {
        const faceIdx = indices.length / 3
        indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2)
        indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 3)
        faceToUuid.set(faceIdx, prim.uuid)
        faceToUuid.set(faceIdx + 1, prim.uuid)
      } else if (verts.length > 4) {
        for (let i = 1; i < verts.length - 1; i++) {
          const faceIdx = indices.length / 3
          indices.push(vertexOffset, vertexOffset + i, vertexOffset + i + 1)
          faceToUuid.set(faceIdx, prim.uuid)
        }
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
      textureMaskMode: isMaskMode,
      faceToUuid
    })
  }

  return result.length > 0 ? result : null
}
