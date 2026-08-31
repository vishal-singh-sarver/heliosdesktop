/**
 * The camera's clipping planes and dolly limits, derived together from the
 * scene's size.
 *
 * These four numbers are not independent, and the bug that prompted this file is
 * what happens when they are set apart from each other — or not set at all.
 *
 * A 1000x1000 ground added to a scene that had loaded with a 10x10 one rendered
 * with a far plane still sized for the small scene (~167 units). The ground came
 * up filling the viewport, and zooming out swept a straight horizontal cut down
 * the screen — the far plane slicing the flat ground — until the whole scene was
 * gone. Zooming back in restored it. Clipping is reversible and edge-shaped,
 * which is what told it apart from culling.
 *
 * Two rules come out of that, and this module exists so both hold everywhere:
 *
 *  1. The far plane has to cover the furthest thing the camera can be looking at
 *     when dollied all the way out: `maxDistance` (camera to orbit target) plus
 *     `radius` (target to the far side of the geometry). Picking them
 *     separately — the old `far = reach * 10` beside `maxDistance = reach * 20` —
 *     let the wheel travel twice as far as the camera could see.
 *  2. Whoever changes the geometry has to re-derive these, not only whoever
 *     moves the camera. That was the actual failure above: the planes lived
 *     inside the camera-framing routine, which deliberately does not re-run when
 *     geometry changes (it would throw away the user's zoom and pan).
 */

/** How far out of the framed distance the user may dolly. */
export const MAX_DOLLY_FACTOR = 20

// A little air beyond the furthest point, so geometry is not clipped exactly as
// the dolly hits its stop — that would leave the failure sitting on the boundary
// the user is most likely to rest against.
const FAR_MARGIN = 1.05

// Never nearer than this, whatever the scene scale. A near plane at 0 is invalid
// and a tiny one wrecks depth precision across the whole frustum.
const MIN_NEAR = 0.01

export interface CameraRange {
  near: number
  far: number
  minDistance: number
  maxDistance: number
}

/**
 * @param framedDistance where the camera is being parked. Sets the near plane,
 *   which is about how close the user may get — not how far out they may go.
 * @param reach how far the geometry actually extends. The dolly range is a
 *   multiple of this. Equals framedDistance except for elongated geometry, where
 *   the camera is parked closer than the bounding sphere alone would ask for.
 * @param radius the geometry's bounding-sphere radius, measured from the orbit
 *   target — how far past the target the far plane still has to reach.
 */
export function cameraRangeFor(framedDistance: number, reach: number, radius: number): CameraRange {
  const near = Math.max(MIN_NEAR, framedDistance * 0.001)
  const maxDistance = reach * MAX_DOLLY_FACTOR
  return {
    near,
    far: (maxDistance + radius) * FAR_MARGIN,
    minDistance: near * 10,
    maxDistance
  }
}
