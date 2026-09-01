import { CameraControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getAllCachedPrimitives, getObjectPrimitives } from '../store/sceneCache'
import type { PrimitiveInfo } from '../models/types'
import { cameraRangeFor, clippingForView } from './cameraRange'
import { createGridMaterial, updateGridMaterial } from './gridMaterial'

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
  selectedObjectId
}: {
  geometryVersion: number
  selectedObjectId: number | null
}): null {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls) as CameraControls | null
  // Recomputed only when the geometry does; the per-frame path just measures
  // against it. Null when nothing is cached — the grid alone still needs planes,
  // which is the empty-scenario case.
  const boxRef = useRef<THREE.Box3 | null>(null)

  useEffect(() => {
    const box = boundsOf(primitivesInView(selectedObjectId))
    boxRef.current = box.isEmpty() ? null : box
    // geometryVersion is not read here — it is the only signal React gets that
    // the module-level cache changed.
  }, [geometryVersion, selectedObjectId])

  useFrame(() => {
    const perspCam = camera as THREE.PerspectiveCamera
    const pos = perspCam.position

    // The grid has to be measured separately from the geometry, and it moved
    // when the grid became infinite. It used to be a finite square at the origin
    // whose corners could just be folded into the bounding box; now drei's
    // `followCamera` rides it under the camera and it fades out at
    // `fadeDistance` from the point directly below. So the furthest visible
    // grid fragment is the hypotenuse of that radius and the camera's height,
    // and the nearest is the point straight down. Without this the far plane
    // would wrap the geometry alone and cut the grid off in a ring.
    const gridFade = gridParamsForView(
      viewDistanceOf(controls, perspCam),
      perspCam.fov
    ).fadeDistance
    const height = Math.abs(pos.z)
    let nearDist = height
    let farDist = Math.hypot(gridFade, height)

    const box = boxRef.current
    if (box) {
      // Distance to the nearest point of the box — 0 inside it, and for a camera
      // hovering over a large flat ground, simply its height above the surface.
      // The bounding SPHERE would report a negative distance there and force the
      // near plane to its floor, which is the case that has to work.
      nearDist = Math.min(nearDist, box.distanceToPoint(pos))
      // Furthest corner. For an AABB the extreme along each axis is independent,
      // so this needs no loop over the eight corners.
      farDist = Math.max(
        farDist,
        Math.hypot(
          Math.max(pos.x - box.min.x, box.max.x - pos.x),
          Math.max(pos.y - box.min.y, box.max.y - pos.y),
          Math.max(pos.z - box.min.z, box.max.z - pos.z)
        )
      )
    }

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

export interface GridParams {
  /**
   * Continuous decade level. The finest lines drawn are 10^floor(level), and the
   * fractional part is how far they have faded towards the next decade.
   */
  level: number
  /** Spacing of the finest lines drawn, always a power of ten. */
  cellSize: number
  /** Spacing of the bright section lines, a hundred times the finest. */
  sectionSize: number
  /** Radius around the camera at which the grid has faded to nothing. */
  fadeDistance: number
}

/**
 * Roughly how many of the finest cells span the viewport's height at the moment
 * a decade takes over. The grid is re-derived from the camera every frame, so
 * this — not the scene's size — is what fixes the on-screen density.
 *
 * Because three decades are drawn at once, this is a floor rather than an exact
 * count: mid-transition the finest set is up to ten times denser than this while
 * fading out, with the next decade sitting at a tenth of it. There is always one
 * set in a readable range, which is the property the cross-fade buys.
 */
const GRID_TARGET_CELLS = 16

/** Fade radius as a multiple of the view distance. Tuning value. */
const GRID_FADE_FACTOR = 5

/**
 * Grid dimensions for a camera at `viewDistance`, in world units.
 *
 * The grid used to be derived from the GEOMETRY's bounding box — four times its
 * extent, cells at a fiftieth of it. That made it behave like a ground object:
 * a finite square parked at the origin, so zooming out shrank it into a small
 * patch and an empty scenario showed a bare 100x100 plane floating in the dark.
 *
 * Deriving it from the camera is what makes it read as a grid rather than a
 * surface. Spacings are powers of ten so an object's size always relates to a
 * cell by a factor of ten — a 10-unit ground is one cell or ten, never two or
 * five. See gridMaterial.ts for why decades need the cross-fade to work, and
 * why the two arrived together.
 */
export function gridParamsForView(viewDistance: number, fovDegrees: number): GridParams {
  const safeDistance = Number.isFinite(viewDistance) && viewDistance > 0 ? viewDistance : 1
  // World-space height of the viewport at the distance being looked at.
  const visibleHeight = 2 * safeDistance * Math.tan((fovDegrees * Math.PI) / 180 / 2)
  const idealCell = visibleHeight / GRID_TARGET_CELLS
  const level = Math.log10(idealCell)
  const cellSize = Math.pow(10, Math.floor(level))
  return {
    level,
    cellSize,
    sectionSize: cellSize * 100,
    fadeDistance: safeDistance * GRID_FADE_FACTOR
  }
}

/**
 * How far the camera is from what it is looking at.
 *
 * CameraControls' own orbit distance, which is exactly the zoom level and stays
 * meaningful when the camera is level with the grid plane — the camera's height
 * above the plane collapses to zero there while the view still stretches to the
 * horizon. Height is only the fallback for before the controls attach.
 */
function viewDistanceOf(controls: CameraControls | null, camera: THREE.Camera): number {
  const distance = controls?.distance
  if (typeof distance === 'number' && Number.isFinite(distance) && distance > 0) return distance
  return Math.max(Math.abs(camera.position.z), 1)
}

const GRID_COLORS = {
  // The viewport's original palette. Section lines are marked out by being
  // twice as thick, not by being brighter — sectionColor is in fact slightly
  // darker than cellColor, which is how the grid has always read.
  cell: '#8888bb',
  section: '#666680'
}

/**
 * The ground grid, pointed at the camera every frame.
 *
 * Written straight into the material's uniforms rather than through props: the
 * camera moves continuously, and re-rendering this subtree on every wheel tick
 * to pass a new number down is not something React should be asked to do.
 */
function AdaptiveGrid(): React.JSX.Element {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls) as CameraControls | null
  const material = useMemo(() => createGridMaterial(GRID_COLORS), [])

  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const perspCam = camera as THREE.PerspectiveCamera
    const params = gridParamsForView(viewDistanceOf(controls, perspCam), perspCam.fov)
    updateGridMaterial(
      material,
      perspCam.position.x,
      perspCam.position.y,
      params.level,
      params.fadeDistance
    )
  })

  // The quad is positioned entirely by the vertex shader, so no transform here.
  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

interface SceneHelpersProps {
  fitVersion: number
  selectedObjectId: number | null
  geometryVersion: number
}

/** Ground grid (XY plane, Z-up), orientation gizmo and camera navigation. */
export function SceneHelpers({
  fitVersion,
  selectedObjectId,
  geometryVersion
}: SceneHelpersProps): React.JSX.Element {
  return (
    <>
      {/* Sized from the CAMERA, not the geometry, so it reads as a grid at any
          zoom instead of shrinking away like a ground plane. */}
      <AdaptiveGrid />

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
      <AdaptiveClipping geometryVersion={geometryVersion} selectedObjectId={selectedObjectId} />
    </>
  )
}

export default SceneHelpers
