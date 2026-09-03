import { useThree } from '@react-three/fiber'
import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { GpuGeometry } from '../api/geometryV2'
import type { LightingMode } from './materials'
import { createMaskMaterial, createMaterial } from './materials'
import { buildGpuGeometry } from './meshGeometry'
import { loadSceneTexture } from './textureCache'

interface GpuObjectMeshProps {
  gpu: GpuGeometry
  lightingMode?: LightingMode
  /** Cull back faces (FrontSide only) — appropriate for ground tiles. */
  backfaceCulling?: boolean
}

/**
 * Renders one object from a wire-format-v2 payload.
 *
 * The v1 component emits one <mesh> per texture group, each owning its own
 * BufferGeometry. Here there is a SINGLE geometry with a draw group per material
 * span, and the material prop is an array indexed by those groups. The draw-call
 * count is identical — Three issues one per group either way — but nothing had
 * to be sliced, re-indexed or copied to get there, because v2's indices are
 * already global.
 */
export function GpuObjectMesh({
  gpu,
  lightingMode = 'phong',
  backfaceCulling = false
}: GpuObjectMeshProps): React.JSX.Element | null {
  const invalidate = useThree((s) => s.invalidate)

  // Unlit shading samples no normal, so computing them would allocate a third
  // position-sized attribute for nothing — 192 MB on a 2000x2000 ground.
  const withNormals = lightingMode !== 'flat'
  const built = useMemo(() => buildGpuGeometry(gpu, withNormals), [gpu, withNormals])

  // Single-owner disposal, matching ObjectMesh: React's cleanup already runs
  // both before the next effect and on unmount, which is exactly the two cases.
  useEffect(() => {
    return () => built?.geometry.dispose()
  }, [built])

  const materials = useMemo(() => {
    if (!built) return []
    return built.groups.map((g) => {
      if (!g.textureFile) {
        return createMaterial(lightingMode, { vertexColors: true, backfaceCulling })
      }
      if (g.maskMode) {
        const mat = createMaskMaterial(null)
        const cached = loadSceneTexture(g.textureFile, (tex) => {
          mat.uniforms.maskTexture.value = tex
          mat.needsUpdate = true
          invalidate()
        })
        if (cached) mat.uniforms.maskTexture.value = cached
        return mat
      }
      const mat = createMaterial(lightingMode, { alphaTest: 0.5, backfaceCulling })
      const cached = loadSceneTexture(g.textureFile, (tex) => {
        ;(mat as THREE.MeshPhongMaterial).map = tex
        mat.needsUpdate = true
        invalidate()
      })
      if (cached) (mat as THREE.MeshPhongMaterial).map = cached
      return mat
    })
  }, [built, lightingMode, backfaceCulling, invalidate])

  useEffect(() => {
    // Through a Set: the engine keys groups uniquely so a material should appear
    // once, but disposing the same material twice on a shape change is the kind
    // of thing that only shows up as a blank mesh much later.
    return () => {
      for (const m of new Set(materials)) m.dispose()
    }
  }, [materials])

  if (!built) return null

  const isShadow = lightingMode === 'phong-shadows'

  return (
    <mesh
      geometry={built.geometry}
      material={materials}
      castShadow={isShadow}
      receiveShadow={isShadow}
      userData={{ isSceneGeometry: true }}
    />
  )
}

export default GpuObjectMesh
