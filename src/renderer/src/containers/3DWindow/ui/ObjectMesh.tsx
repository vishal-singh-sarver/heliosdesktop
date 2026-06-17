import { useThree } from '@react-three/fiber'
import React, { useMemo } from 'react'
import * as THREE from 'three'
import type { PrimitiveInfo } from '../models/types'
import type { LightingMode } from './materials'
import { createMaskMaterial, createMaterial } from './materials'
import { buildTexturedGeometries } from './meshGeometry'
import { loadSceneTexture } from './textureCache'

interface ObjectMeshProps {
  primitives: PrimitiveInfo[]
  lightingMode?: LightingMode
  /** Cull back faces (FrontSide only) — used for ground tiles. */
  backfaceCulling?: boolean
}

/**
 * Renders one scene object's primitives, grouped by texture into a handful of
 * merged meshes (one draw call per texture group).
 */
export function ObjectMesh({
  primitives,
  lightingMode = 'phong',
  backfaceCulling = false
}: ObjectMeshProps): React.JSX.Element | null {
  const invalidate = useThree((s) => s.invalidate)

  const groups = useMemo(() => buildTexturedGeometries(primitives), [primitives])

  // One material per texture group; textures resolve through the module
  // cache and trigger invalidate() on async load (frameloop="demand").
  const { textureMaterials, maskMaterials } = useMemo(() => {
    const texMats = new Map<string, THREE.Material>()
    const mskMats = new Map<string, THREE.Material>()
    if (!groups) return { textureMaterials: texMats, maskMaterials: mskMats }

    for (const g of groups) {
      if (!g.textureFile) continue

      if (g.textureMaskMode) {
        if (mskMats.has(g.textureFile)) continue
        const mat = createMaskMaterial(null)
        const cached = loadSceneTexture(g.textureFile, (tex) => {
          mat.uniforms.maskTexture.value = tex
          mat.needsUpdate = true
          invalidate()
        })
        if (cached) mat.uniforms.maskTexture.value = cached
        mskMats.set(g.textureFile, mat)
      } else {
        if (texMats.has(g.textureFile)) continue
        const mat = createMaterial(lightingMode, { alphaTest: 0.5, backfaceCulling })
        const cached = loadSceneTexture(g.textureFile, (tex) => {
          ;(mat as THREE.MeshPhongMaterial).map = tex
          mat.needsUpdate = true
          invalidate()
        })
        if (cached) (mat as THREE.MeshPhongMaterial).map = cached
        texMats.set(g.textureFile, mat)
      }
    }
    return { textureMaterials: texMats, maskMaterials: mskMats }
  }, [groups, lightingMode, backfaceCulling, invalidate])

  const vertexColorMaterial = useMemo(
    () => createMaterial(lightingMode, { vertexColors: true, backfaceCulling }),
    [lightingMode, backfaceCulling]
  )

  if (!groups) return null

  const isShadow = lightingMode === 'phong-shadows'

  return (
    <group>
      {groups.map((g, idx) => {
        let mat: THREE.Material = vertexColorMaterial
        if (g.textureFile) {
          mat = g.textureMaskMode
            ? (maskMaterials.get(g.textureFile) ?? vertexColorMaterial)
            : (textureMaterials.get(g.textureFile) ?? vertexColorMaterial)
        }
        return (
          <mesh
            key={idx}
            geometry={g.geometry}
            material={mat}
            castShadow={isShadow}
            receiveShadow={isShadow}
            userData={{ isSceneGeometry: true }}
          />
        )
      })}
    </group>
  )
}

export default ObjectMesh
