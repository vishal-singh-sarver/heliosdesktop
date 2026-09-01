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
 *
 * The follow-up report is the other half of the same story, and it is why
 * `clippingForView` below exists. Delete a 1000000x1000000 ground, create
 * another one with the same properties, and the new one vanishes on zoom-out —
 * while the ground it replaced, byte for byte identical, had not. The far plane
 * was innocent this time: deleting the selected ground falls the dropdown back
 * to "All", which re-frames on the 10x10 ground that is left and pins `near` at
 * 0.0167. Creating the replacement widens `far` to 3.6e7 and never touches
 * `near`, because widening was all rule 2 above was written to do.
 *
 * A far/near ratio of 2.1e9 does not clip anything. It runs out of DEPTH BUFFER:
 * window depth is 1 - near/d, so past d/near ~ 3.4e7 every fragment rounds to
 * the same 24-bit value as the cleared background and loses the depth test. The
 * ground disappears from the far edge inward and comes back on zoom-in, which is
 * indistinguishable on screen from the far-plane clipping above — the same
 * symptom, a different cause, and the reason the first fix did not cover it.
 *
 * So a third rule, which no amount of care at framing time can satisfy:
 *
 *  3. The planes belong to WHERE THE CAMERA IS, not to where it was last parked.
 *     A scene holding a 10-unit ground and a 1000000-unit one has no single
 *     near/far a 24-bit buffer can carry across every zoom level, so the planes
 *     have to be re-derived from the camera's actual distance to the geometry as
 *     it moves. `clippingForView` does that per frame; `cameraRangeFor` is left
 *     owning the dolly limits, which do belong to the framing.
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

/**
 * The widest far/near a 24-bit depth buffer can carry.
 *
 * A fragment at distance d gets window depth 1 - near/d. The buffer resolves
 * steps of 2^-24, so once d/near passes ~3.4e7 the fragment rounds to exactly
 * the cleared value and fails the depth test — it is not clipped, it is simply
 * no longer distinguishable from the background. That cliff is the bug; 1e6
 * keeps a 34x margin from it.
 *
 * Not tighter than that, because this ceiling is enforced by RAISING the near
 * plane, which clips anything closer. In a scene holding both a 10-unit ground
 * and a 1000000-unit one the far plane sits around 3e6, so 1e6 puts the floor at
 * ~3 units — close enough to the surface to zoom into the small ground. At 1e5
 * the floor is ~30 units and the small ground disappears as you approach it,
 * trading this bug for its mirror image.
 */
const MAX_DEPTH_RATIO = 1e6

/**
 * Where the near plane sits as a fraction of the distance to the nearest
 * geometry. Half, so the plane stays clear of the surface the user is flying
 * towards even while the camera moves between frames.
 */
const NEAR_FRACTION = 0.5

export interface Clipping {
  near: number
  far: number
}

/**
 * The clipping planes for a camera that is HERE, right now.
 *
 * Both inputs are measured from the camera to the scene's bounding box, so they
 * shrink as the user zooms in and grow as they pull out — which is the point.
 * Deriving the planes per frame keeps the frustum wrapped tightly around
 * whatever is actually on screen, so the depth buffer never has to span the
 * whole scene at once. That is what lets a 10-unit ground and a 1000000-unit one
 * share a scene: at any given moment the camera is only ever looking at one
 * scale's worth of it.
 *
 * @param nearDist distance from the camera to the closest point of the scene
 *   box — 0 when the camera is inside it.
 * @param farDist distance from the camera to the box's furthest corner.
 */
export function clippingForView(nearDist: number, farDist: number): Clipping {
  const far = Math.max(MIN_NEAR * 10, farDist * FAR_MARGIN)
  // The ratio floor is the only term that can push the plane past geometry the
  // camera can see, and it only reaches within far/MAX_DEPTH_RATIO of it — a
  // few units in a scene spanning a million. Linear depth has nothing left to
  // offer that close to a scene that large, so the floor wins there on purpose.
  const near = Math.max(MIN_NEAR, nearDist * NEAR_FRACTION, far / MAX_DEPTH_RATIO)
  // Degenerate scenes only: a box smaller than MIN_NEAR would otherwise hand
  // back an inverted frustum, which is an invalid projection.
  return { near: Math.min(near, far * 0.5), far }
}
