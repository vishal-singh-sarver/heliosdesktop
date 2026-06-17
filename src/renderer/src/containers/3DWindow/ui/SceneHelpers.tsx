import { CameraControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { getAllCachedPrimitives } from '../store/sceneCache'

/**
 * Frames scene geometry whenever `fitVersion` changes by building the bounding
 * box directly from sceneCache vertex data — this avoids the scene-graph timing
 * race where R3F may not have committed meshes yet when the effect fires.
 *
 * Only fires on initial scene load / scene refresh (fitVersion bump).
 * Dropdown switches between cached objects do NOT trigger a re-frame so the
 * user's camera position is preserved.
 */
function FitToScene({ fitVersion }: { fitVersion: number }): null {
  const { camera, invalidate } = useThree()
  const controls = useThree((s) => s.controls) as CameraControls | null
  const lastFitVersion = useRef(-1)

  useEffect(() => {
    if (!controls) return

    // Only re-frame when fitVersion actually changes (scene load/refresh).
    if (fitVersion === lastFitVersion.current) return
    lastFitVersion.current = fitVersion

    const handle = requestAnimationFrame(() => {
      const box = new THREE.Box3()
      const pt = new THREE.Vector3()

      // Frame the full scene from all per-object cached primitives.
      const allPrimitives = getAllCachedPrimitives()
      for (const prim of allPrimitives) {
        for (const v of prim.vertices) {
          box.expandByPoint(pt.set(v.x, v.y, v.z))
        }
      }

      if (box.isEmpty()) return

      const center = new THREE.Vector3()
      const size = new THREE.Vector3()
      box.getCenter(center)
      box.getSize(size)

      const perspCam = camera as THREE.PerspectiveCamera

      const elevation = (50 * Math.PI) / 180
      const vFovHalf = (perspCam.fov * Math.PI) / 180 / 2
      const hFovHalf = Math.atan(Math.tan(vFovHalf) * perspCam.aspect)

      const distForY = (size.y / 2) / Math.cos(elevation) / Math.tan(vFovHalf)
      const distForX = (size.x / 2) / Math.tan(hFovHalf)
      const distance = Math.max(distForX, distForY) * 1.3

      perspCam.near = Math.max(0.01, distance * 0.0001)
      perspCam.far = Math.max(1000, distance * 20)
      perspCam.updateProjectionMatrix()

      const camX = center.x
      const camY = center.y - distance * Math.cos(elevation)
      const camZ = center.z + distance * Math.sin(elevation)

      controls.minDistance = perspCam.near * 10
      controls.maxDistance = Math.max(200, distance * 5)
      controls.setLookAt(camX, camY, camZ, center.x, center.y, center.z, false)
      controls.update(1 / 60)
      invalidate()
    })

    return () => cancelAnimationFrame(handle)
  }, [fitVersion, controls, camera, invalidate])

  return null
}

interface SceneHelpersProps {
  /** Bump to re-frame the camera on all scene geometry. */
  fitVersion: number
}

/** Ground grid (XY plane, Z-up), orientation gizmo and camera navigation. */
export function SceneHelpers({ fitVersion }: SceneHelpersProps): React.JSX.Element {
  return (
    <>
      {/* Large finite grid — real 3D mesh so depth-testing against scene
          geometry works correctly. polygonOffset pushes its depth slightly
          back so ground geometry at z=0 always occludes it. */}
      <Grid
        ref={(grid: THREE.Mesh | null) => {
          if (!grid) return
          const mat = grid.material as THREE.Material
          if (mat) {
            mat.polygonOffset = true
            mat.polygonOffsetFactor = 4
            mat.polygonOffsetUnits = 4
          }
        }}
        position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[4000, 4000]}
        cellSize={0.25}
        cellThickness={0.5}
        cellColor="#2d2d50"
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor="#3d3d60"
        fadeDistance={5000}
        fadeStrength={1}
      />

      {/* CameraControls damps rotate, pan AND zoom (unlike OrbitControls).
          maxPolarAngle=π allows rotating all the way under the ground. */}
      <CameraControls
        makeDefault
        smoothTime={0.25}
        draggingSmoothTime={0.125}
        minDistance={0.5}
        maxDistance={10000}
        maxPolarAngle={Math.PI}
        dollyToCursor
      />

      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport
          axisColors={['#e06060', '#45cc70', '#5599e0']}
          labelColor="white"
          labels={['X', 'Y', 'Z']}
        />
      </GizmoHelper>

      <FitToScene fitVersion={fitVersion} />
    </>
  )
}

export default SceneHelpers
