import { useThree } from '@react-three/fiber'
import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { PrimitiveInfo } from '../models/types'
import type { LightingMode } from './materials'
import { createMaskMaterial, createMaterial } from './materials'
import type { GeometryGroup } from './meshGeometry'
import { buildTexturedGeometries } from './meshGeometry'
import { loadSceneTexture } from './textureCache'

interface ObjectMeshProps {
  primitives: PrimitiveInfo[]
  lightingMode?: LightingMode
  /** Cull back faces (FrontSide only) — used for ground tiles. */
  backfaceCulling?: boolean
}

/** Dispose all GPU resources in a list of geometry groups. */
function disposeGroups(groups: GeometryGroup[]): void {
  for (const g of groups) g.geometry.dispose()
}

/** Dispose all materials in the given maps and standalone material. */
function disposeMaterials(
  texMats: Map<string, THREE.Material>,
  mskMats: Map<string, THREE.Material>,
  vcMat: THREE.Material | null
): void {
  for (const m of texMats.values()) m.dispose()
  for (const m of mskMats.values()) m.dispose()
  vcMat?.dispose()
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

  // Release the previous geometries when they're replaced, and the current ones
  // on unmount. React's cleanup is the SINGLE owner of that: it already runs
  // before the next effect and on unmount, which is exactly both cases. This
  // used to also track the previous groups in a ref and dispose them in the
  // effect body — but since cleanup runs first, that body then disposed the very
  // same groups a second time.
  useEffect(() => {
    return () => {
      if (groups) disposeGroups(groups)
    }
  }, [groups])

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

  // Dispose all materials when they are replaced or on unmount — same single-owner
  // rule as the geometries above, for the same reason.
  useEffect(() => {
    return () => disposeMaterials(textureMaterials, maskMaterials, vertexColorMaterial)
  }, [textureMaterials, maskMaterials, vertexColorMaterial])

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
