import { CameraControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getAllCachedPrimitives, getObjectPrimitives } from '../store/sceneCache'
import type { PrimitiveInfo } from '../models/types'

/**
 * Frames the camera to fit the currently visible geometry.
 *
 * Re-frames when:
 *  - fitVersion bumps (scene load, geometry create/update)
 *  - selectedObjectId changes (dropdown switch)
 *
 * Uses the selected object's primitives when one is picked, or all cached
 * primitives for the "All" view.
 */
function FitToScene({
  fitVersion,
  selectedObjectId
}: {
  fitVersion: number
  selectedObjectId: number | null
}): null {
  const { camera, invalidate } = useThree()
  const controls = useThree((s) => s.controls) as CameraControls | null
  const lastKey = useRef('')

  useEffect(() => {
    if (!controls) return

    const key = `${fitVersion}:${selectedObjectId}`
    if (key === lastKey.current) return
    lastKey.current = key

    const handle = requestAnimationFrame(() => {
      // Collect primitives for the current view.
      let primitives: PrimitiveInfo[]
      if (selectedObjectId !== null) {
        primitives = getObjectPrimitives(selectedObjectId) ?? []
      } else {
        primitives = getAllCachedPrimitives()
      }

      const box = new THREE.Box3()
      const pt = new THREE.Vector3()
      for (const prim of primitives) {
        for (const v of prim.vertices) {
          box.expandByPoint(pt.set(v.x, v.y, v.z))
        }
      }

      if (box.isEmpty()) return

      const center = new THREE.Vector3()
      box.getCenter(center)

      const sphere = new THREE.Sphere()
      box.getBoundingSphere(sphere)
      const radius = sphere.radius

      const perspCam = camera as THREE.PerspectiveCamera
      const vFovHalf = (perspCam.fov * Math.PI) / 180 / 2
      const distance = radius / Math.sin(vFovHalf)

      perspCam.near = Math.max(0.01, distance * 0.001)
      perspCam.far = distance * 10
      perspCam.updateProjectionMatrix()

      const elevation = (50 * Math.PI) / 180
      const camX = center.x
      const camY = center.y - distance * Math.cos(elevation)
      const camZ = center.z + distance * Math.sin(elevation)

      controls.minDistance = perspCam.near * 10
      controls.maxDistance = distance * 20
      controls.setLookAt(camX, camY, camZ, center.x, center.y, center.z, false)
      controls.update(1 / 60)
      invalidate()
    })

    return () => cancelAnimationFrame(handle)
  }, [fitVersion, selectedObjectId, controls, camera, invalidate])

  return null
}

interface GridParams {
  size: number
  cellSize: number
  sectionSize: number
  fadeDistance: number
}

/** Derive grid dimensions from the scene's bounding box so the grid
 *  always matches the model scale. */
function useAdaptiveGrid(geometryVersion: number, selectedObjectId: number | null): GridParams {
  return useMemo(() => {
    let primitives: PrimitiveInfo[]
    if (selectedObjectId !== null) {
      primitives = getObjectPrimitives(selectedObjectId) ?? []
    } else {
      primitives = getAllCachedPrimitives()
    }

    if (primitives.length === 0) {
      // Sensible defaults before any geometry is loaded
      return { size: 100, cellSize: 1, sectionSize: 10, fadeDistance: 150 }
    }

    const box = new THREE.Box3()
    const pt = new THREE.Vector3()
    for (const prim of primitives) {
      for (const v of prim.vertices) {
        box.expandByPoint(pt.set(v.x, v.y, v.z))
      }
    }

    const extentSize = new THREE.Vector3()
    box.getSize(extentSize)
    const maxExtent = Math.max(extentSize.x, extentSize.y, extentSize.z, 1)

    // Round cell size to a clean number: pick a power-of-10 that gives ~40-80 cells
    const rawCell = maxExtent / 50
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawCell)))
    const steps = [1, 2, 5, 10]
    let cellSize = magnitude
    for (const s of steps) {
      if (s * magnitude >= rawCell) {
        cellSize = s * magnitude
        break
      }
    }

    const sectionSize = cellSize * 10
    const size = maxExtent * 4
    const fadeDistance = size * 0.8

    return { size, cellSize, sectionSize, fadeDistance }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometryVersion proxies cache changes
  }, [geometryVersion, selectedObjectId])
}

interface SceneHelpersProps {
  fitVersion: number
  selectedObjectId: number | null
  geometryVersion: number
}

/** Ground grid (XY plane, Z-up), orientation gizmo and camera navigation. */
export function SceneHelpers({ fitVersion, selectedObjectId, geometryVersion }: SceneHelpersProps): React.JSX.Element {
  const grid = useAdaptiveGrid(geometryVersion, selectedObjectId)

  return (
    <>
      {/* Adaptive finite grid — scales cell/section sizes to the loaded
          geometry so it always looks proportional. polygonOffset pushes
          depth back so ground geometry at z=0 occludes it. */}
      <Grid
        ref={(gridMesh: THREE.Mesh | null) => {
          if (!gridMesh) return
          const mat = gridMesh.material as THREE.Material
          if (mat) {
            mat.polygonOffset = true
            mat.polygonOffsetFactor = 4
            mat.polygonOffsetUnits = 4
            mat.depthWrite = false
          }
        }}
        position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[grid.size, grid.size]}
        cellSize={grid.cellSize}
        cellThickness={0.6}
        cellColor="#8888bb"
        sectionSize={grid.sectionSize}
        sectionThickness={1.2}
        sectionColor="#666680"
        fadeDistance={grid.fadeDistance}
        fadeStrength={1.5}
        renderOrder={-1}
      />

      {/* CameraControls damps rotate, pan AND zoom (unlike OrbitControls).
          maxPolarAngle=π allows rotating all the way under the ground. */}
      <CameraControls
        makeDefault
        smoothTime={0.25}
        draggingSmoothTime={0.125}
        minDistance={0.5}
        maxDistance={Infinity}
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

      <FitToScene fitVersion={fitVersion} selectedObjectId={selectedObjectId} />
    </>
  )
}

export default SceneHelpers
