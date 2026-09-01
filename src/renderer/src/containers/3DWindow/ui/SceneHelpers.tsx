import { CameraControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getAllCachedPrimitives, getObjectPrimitives } from '../store/sceneCache'
import type { PrimitiveInfo } from '../models/types'
import { cameraRangeFor, clippingForView } from './cameraRange'

/**
 * How many multiples of an object's median extent to frame when the camera
 * distance is capped for elongated geometry. Larger = zoomed further out.
 */
const SURFACE_FRAME_MARGIN = 2.5

/** Primitives for the current view: the selected object, or everything. */
function primitivesInView(selectedObjectId: number | null): PrimitiveInfo[] {
  return selectedObjectId !== null
    ? (getObjectPrimitives(selectedObjectId) ?? [])
    : getAllCachedPrimitives()
}

/** Axis-aligned bounds of a set of primitives. Empty if there are none. */
function boundsOf(primitives: PrimitiveInfo[]): THREE.Box3 {
  const box = new THREE.Box3()
  const pt = new THREE.Vector3()
  for (const prim of primitives) {
    for (const v of prim.vertices) {
      box.expandByPoint(pt.set(v.x, v.y, v.z))
    }
  }
  return box
}

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
      const box = boundsOf(primitivesInView(selectedObjectId))
      if (box.isEmpty()) return

      const center = new THREE.Vector3()
      box.getCenter(center)

      const size = new THREE.Vector3()
      box.getSize(size)

      const sphere = new THREE.Sphere()
      box.getBoundingSphere(sphere)
      const radius = sphere.radius

      const perspCam = camera as THREE.PerspectiveCamera
      const vFovHalf = (perspCam.fov * Math.PI) / 180 / 2
      const sinHalf = Math.sin(vFovHalf)

      // Distance that frames the entire bounding sphere in view.
      const fitAll = radius / sinHalf

      // Extreme-aspect geometry (e.g. a very long, shallow ground) has a
      // bounding sphere dominated by its longest axis. Framing the whole sphere
      // parks the camera so far away that the smaller dimensions collapse to a
      // sub-pixel sliver and the viewport looks empty. Cap the camera distance
      // to a few multiples of the object's median extent so the surface stays
      // readable; the user pans to explore the long axis. For roughly cubic
      // geometry the median ≈ the radius, so the cap never binds and normal
      // framing is preserved.
      const medianExtent = [size.x, size.y, size.z].sort((a, b) => a - b)[1]
      const fitSurface = (medianExtent * SURFACE_FRAME_MARGIN) / sinHalf
      const distance = Math.min(fitAll, fitSurface)

      // The dolly range must still span the full geometry even when the camera
      // is capped close — the long axis can extend far beyond `distance`.
      const reach = Math.max(fitAll, distance)
      // Dolly limits only. The clipping planes are AdaptiveClipping's, derived
      // per frame from where the camera actually is rather than from where this
      // routine parked it — see rule 3 in cameraRange.ts.
      const range = cameraRangeFor(distance, reach, radius)

      const elevation = (50 * Math.PI) / 180
      const camX = center.x
      const camY = center.y - distance * Math.cos(elevation)
      const camZ = center.z + distance * Math.sin(elevation)

      controls.minDistance = range.minDistance
      controls.maxDistance = range.maxDistance
      controls.setLookAt(camX, camY, camZ, center.x, center.y, center.z, false)
      controls.update(1 / 60)
      invalidate()
    })

    return () => cancelAnimationFrame(handle)
  }, [fitVersion, selectedObjectId, controls, camera, invalidate])

  return null
}

/**
 * Keeps the DOLLY LIMIT big enough for whatever geometry is on screen, WITHOUT
 * moving the camera.
 *
 * FitToScene sets the limits when it frames, but it only runs on scene load and
 * selection changes — deliberately not on geometry changes, because re-framing
 * would throw away the user's zoom and pan. Add a ground far larger than the
 * framed scene and the wheel would stop at the old scene's `maxDistance`, well
 * before the new ground fits in view.
 *
 * This runs on geometry changes and only ever WIDENS. Narrowing is left to
 * FitToScene: pulling `maxDistance` in below where the user is currently parked
 * would have CameraControls clamp on the next update and jerk the camera — fine
 * during a deliberate re-frame, unacceptable as a side effect of saving an edit.
 * So a scene that grows gets the room it needs, and a scene that shrinks simply
 * keeps more room than it strictly needs until the next real re-frame.
 *
 * It no longer touches the clipping planes. Widening `far` here while `near`
 * stayed pinned to the last framed scene is what produced the second report in
 * cameraRange.ts — AdaptiveClipping owns both planes now, and owns them
 * together.
 */
function DollyLimitForGeometry({
  geometryVersion,
  selectedObjectId
}: {
  geometryVersion: number
  selectedObjectId: number | null
}): null {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls) as CameraControls | null

  useEffect(() => {
    if (!controls) return

    // Same deferral as FitToScene: geometryVersion bumps as each object lands in
    // the cache, so read it a frame later rather than mid-commit.
    const handle = requestAnimationFrame(() => {
      const box = boundsOf(primitivesInView(selectedObjectId))
      if (box.isEmpty()) return

      const sphere = new THREE.Sphere()
      box.getBoundingSphere(sphere)

      const perspCam = camera as THREE.PerspectiveCamera
      const fit = sphere.radius / Math.sin((perspCam.fov * Math.PI) / 180 / 2)
      const range = cameraRangeFor(fit, fit, sphere.radius)

      if (range.maxDistance > controls.maxDistance) {
        controls.maxDistance = range.maxDistance
      }
    })

    return () => cancelAnimationFrame(handle)
  }, [geometryVersion, selectedObjectId, controls, camera])

  return null
}

/**
 * How much the planes must move before they are rewritten. Purely to skip work
 * while the camera is still; the frustum is loose enough that 2% is invisible.
 */
const CLIP_UPDATE_THRESHOLD = 0.02

/**
 * The single owner of the camera's near and far planes.
 *
 * Re-derives both every rendered frame from the camera's current distance to the
 * scene bounds, instead of from whatever the last camera-framing call happened
 * to see. That is the whole fix for the second report in cameraRange.ts: a scene
 * mixing a 10-unit ground with a 1000000-unit one has NO fixed near/far a 24-bit
 * depth buffer can carry at every zoom level, so any value chosen at framing
 * time is wrong for some later camera position — and the failure it produces
 * (geometry rounding into the cleared background on zoom-out) looks exactly like
 * the far-plane clipping the previous fix addressed.
 *
 * A tight, camera-relative frustum sidesteps the whole problem: the depth buffer
 * only ever has to span what is on screen right now.
 *
 * Runs in useFrame rather than on an effect because the camera moves without
 * React knowing — the wheel and the orbit drag go straight through
 * CameraControls. frameloop is "demand", so this costs nothing while the view is
 * idle: no camera movement, no frames, no work. CameraControls is rendered
 * before this component and so ticks first, meaning the position read here is
 * already this frame's.
 */
function AdaptiveClipping({
  geometryVersion,
  selectedObjectId,
  gridSize
}: {
  geometryVersion: number
  selectedObjectId: number | null
  /** Width of the ground grid, which reaches well past the geometry. */
  gridSize: number
}): null {
  const { camera } = useThree()
  // Recomputed only when the scene does; the per-frame path just measures
  // against it. Null only if there is nothing at all to measure.
  const boxRef = useRef<THREE.Box3 | null>(null)

  useEffect(() => {
    const box = boundsOf(primitivesInView(selectedObjectId))
    // The grid is drawn too, and useAdaptiveGrid sizes it to four times the
    // geometry's extent — so a frustum wrapped around the geometry alone would
    // cut straight through it while it is still well inside its fade. It sits
    // on the XY plane at the origin.
    const half = gridSize / 2
    box.expandByPoint(new THREE.Vector3(-half, -half, 0))
    box.expandByPoint(new THREE.Vector3(half, half, 0))
    boxRef.current = box.isEmpty() ? null : box
    // geometryVersion is not read here — it is the only signal React gets that
    // the module-level cache changed.
  }, [geometryVersion, selectedObjectId, gridSize])

  useFrame(() => {
    const box = boxRef.current
    if (!box) return

    const perspCam = camera as THREE.PerspectiveCamera
    const pos = perspCam.position

    // Distance to the nearest point of the box — 0 inside it, and for a camera
    // hovering over a large flat ground, simply its height above the surface.
    // The bounding SPHERE would report a negative distance there and force the
    // near plane to its floor, which is the case that has to work.
    const nearDist = box.distanceToPoint(pos)
    // Furthest corner. For an AABB the extreme along each axis is independent,
    // so this needs no loop over the eight corners.
    const farDist = Math.hypot(
      Math.max(pos.x - box.min.x, box.max.x - pos.x),
      Math.max(pos.y - box.min.y, box.max.y - pos.y),
      Math.max(pos.z - box.min.z, box.max.z - pos.z)
    )

    const { near, far } = clippingForView(nearDist, farDist)
    const moved =
      Math.abs(near - perspCam.near) > perspCam.near * CLIP_UPDATE_THRESHOLD ||
      Math.abs(far - perspCam.far) > perspCam.far * CLIP_UPDATE_THRESHOLD
    if (!moved) return

    perspCam.near = near
    perspCam.far = far
    perspCam.updateProjectionMatrix()
  })

  return null
}

interface GridParams {
  size: number
  cellSize: number
  sectionSize: number
  fadeDistance: number
}

export const DEFAULT_GRID: GridParams = {
  size: 100,
  cellSize: 1,
  sectionSize: 10,
  fadeDistance: 150
}

/**
 * Identifies the scene state the grid is derived from. Reset-view stamps this
 * at click time and the grid shows defaults for as long as the stamp still
 * matches — i.e. until geometry or selection moves on.
 *
 * Selection is part of the stamp, not just geometryVersion: picking "All" in
 * the dropdown dispatches only meshReady() and does NOT bump geometryVersion
 * (see store/saga.ts selectSceneObjectWorker), so keying on geometry alone
 * would strand the grid on defaults after reset -> "All".
 */
export function gridStamp(geometryVersion: number, selectedObjectId: number | null): string {
  return `${geometryVersion}:${selectedObjectId}`
}

/**
 * True once the scene has moved past the stamp, meaning the reset it recorded
 * has been used up and the stamp should be dropped.
 *
 * A reset is one-shot: it holds the grid at defaults until the next geometry or
 * selection change, then stops applying — the behaviour of the counter this
 * replaced. A stamp that is kept forever instead re-fires whenever the scene
 * returns to the state it was taken in (select B, reset, select A, select B
 * again), which is not a thing the user asked for. Selection alone is enough to
 * hit that, since picking an object does not bump geometryVersion.
 *
 * Kept out of useAdaptiveGrid so that hook stays pure; the owner of the stamp
 * calls this while rendering and drops the stamp itself. See Viewport3D.
 */
export function isGridResetSpent(
  gridResetAt: string | null,
  geometryVersion: number,
  selectedObjectId: number | null
): boolean {
  return gridResetAt !== null && gridResetAt !== gridStamp(geometryVersion, selectedObjectId)
}

/** Derive grid dimensions from the scene's bounding box so the grid
 *  always matches the model scale.  While gridResetAt still matches the
 *  current scene the grid stays at defaults (camera reset to origin). */
export function useAdaptiveGrid(
  geometryVersion: number,
  selectedObjectId: number | null,
  gridResetAt: string | null
): GridParams {
  return useMemo(() => {
    // After a view-reset, return defaults until the scene moves on. Comparing
    // stamps keeps this pure — the previous version latched a ref during
    // render, so a render React discarded could consume the reset and leave
    // the grid unchanged. Two values compared on every render cannot be spent.
    if (gridResetAt !== null && gridResetAt === gridStamp(geometryVersion, selectedObjectId)) {
      return DEFAULT_GRID
    }

    const primitives = primitivesInView(selectedObjectId)
    if (primitives.length === 0) {
      return DEFAULT_GRID
    }

    const box = boundsOf(primitives)

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
  }, [geometryVersion, selectedObjectId, gridResetAt])
}

interface SceneHelpersProps {
  fitVersion: number
  selectedObjectId: number | null
  geometryVersion: number
  /** Scene stamp captured when reset-view was last pressed; see gridStamp. */
  gridResetAt?: string | null
}

/** Ground grid (XY plane, Z-up), orientation gizmo and camera navigation. */
export function SceneHelpers({
  fitVersion,
  selectedObjectId,
  geometryVersion,
  gridResetAt = null
}: SceneHelpersProps): React.JSX.Element {
  const grid = useAdaptiveGrid(geometryVersion, selectedObjectId, gridResetAt)

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
      {/* The wheel must reach far enough to see a ground added after the last
          re-frame, not just the scene that was framed. */}
      <DollyLimitForGeometry
        geometryVersion={geometryVersion}
        selectedObjectId={selectedObjectId}
      />
      {/* Clipping planes follow the CAMERA, every frame. Rendered after
          CameraControls above so it reads this frame's position. */}
      <AdaptiveClipping
        geometryVersion={geometryVersion}
        selectedObjectId={selectedObjectId}
        gridSize={grid.size}
      />
    </>
  )
}

export default SceneHelpers
