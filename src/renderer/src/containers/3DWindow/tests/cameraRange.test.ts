import { cameraRangeFor, clippingForView, MAX_DOLLY_FACTOR } from '../ui/cameraRange'

// The reported failure: a 1000x1000 ground filled the viewport, and zooming out
// swept a straight horizontal cut down the screen until the scene was empty —
// the far plane slicing the flat ground — with zooming back in restoring it.
// Two independent ways the numbers could produce that, both pinned here.

describe('cameraRangeFor', () => {
  // A 1000x1000 flat ground at fov 50: radius ~707, framed from ~1673.
  const RADIUS = 707.1
  const FRAMED = RADIUS / Math.sin((50 * Math.PI) / 180 / 2)

  // THE invariant. `far` and `maxDistance` used to be picked separately —
  // `reach * 10` beside `reach * 20` — so the wheel could travel to twice the
  // distance the camera could see, and the whole back half of the zoom-out range
  // rendered nothing while still responding to the wheel.
  it('keeps the far plane beyond anything reachable at full zoom-out', () => {
    const range = cameraRangeFor(FRAMED, FRAMED, RADIUS)
    // Fully dollied out, the far side of the geometry sits maxDistance + radius
    // from the camera. The far plane has to be past that.
    expect(range.far).toBeGreaterThan(range.maxDistance + RADIUS)
  })

  // The invariant has to hold at every scale, not just the one that was
  // reported — a 10x10 ground reaches its dolly limit in the same number of
  // scroll clicks as a 1000x1000 one, because the dolly step is proportional.
  it.each([0.5, 7.07, 707.1, 25_000])('holds at radius %p', (radius) => {
    const framed = radius / Math.sin((50 * Math.PI) / 180 / 2)
    const range = cameraRangeFor(framed, framed, radius)
    expect(range.far).toBeGreaterThan(range.maxDistance + radius)
    expect(range.near).toBeGreaterThan(0)
    expect(range.near).toBeLessThan(range.far)
    expect(range.minDistance).toBeLessThan(range.maxDistance)
  })

  // Elongated geometry parks the camera closer than its bounding sphere asks
  // for (see SURFACE_FRAME_MARGIN), but the dolly range and the far plane still
  // have to cover the long axis — so they follow `reach`, not the framed
  // distance, while `near` follows where the camera actually is.
  it('sizes the range from reach, and the near plane from the framed distance', () => {
    const framed = 100
    const reach = 5000
    const range = cameraRangeFor(framed, reach, RADIUS)

    expect(range.maxDistance).toBe(reach * MAX_DOLLY_FACTOR)
    expect(range.far).toBeGreaterThan(range.maxDistance + RADIUS)
    expect(range.near).toBeCloseTo(0.1) // framed * 0.001
  })

  // A near plane at 0 is an invalid projection, and a near plane that scales
  // freely down with a tiny scene wrecks depth precision for the whole frustum.
  it('never lets the near plane collapse on a tiny scene', () => {
    expect(cameraRangeFor(0, 0, 0).near).toBe(0.01)
    expect(cameraRangeFor(0.0001, 0.0001, 0.0001).near).toBe(0.01)
  })
})

// The SECOND report: delete a 1000000x1000000 ground, create another with the
// same properties, and the replacement vanishes on zoom-out where the original
// had not. Nothing was clipped — the frustum ran out of depth buffer. These
// tests are written in terms of what the buffer can actually resolve rather than
// in terms of the constants, so they fail on the symptom, not on the arithmetic.
describe('clippingForView', () => {
  /**
   * Window-space depth of a fragment at view distance `d`, quantised to the
   * 24-bit buffer the renderer actually writes to.
   *
   * A value of exactly 1 is the cleared background: the fragment loses the depth
   * test and the geometry is simply not drawn, which is what the user saw.
   */
  function quantisedDepth(d: number, near: number, far: number): number {
    const z = 0.5 * ((far + near) / (far - near) + (-2 * far * near) / (d * (far - near))) + 0.5
    const steps = 2 ** 24 - 1
    return Math.round(Math.min(1, Math.max(0, z)) * steps) / steps
  }

  /** True if geometry at `d` is still distinguishable from the background. */
  function drawsAt(d: number, near: number, far: number): boolean {
    return quantisedDepth(d, near, far) < 1
  }

  // Half-diagonals of the two grounds from the report, both flat and centred.
  const BIG = Math.hypot(500_000, 500_000) // 1000000 x 1000000
  const SMALL = Math.hypot(5, 5) // 10 x 10

  // The exact failure. Zoomed out far enough to see the whole 1000000-unit
  // ground, every part of it has to survive the depth test — with the old
  // planes (near 0.0167 pinned by the 10x10 ground that framing last saw, far
  // widened to 3.6e7 by the new geometry) the ground rounded into the
  // background beyond ~5.5e5 and swept away as the user kept zooming out.
  it('keeps a 1000000-unit ground drawable when zoomed out to frame it', () => {
    const cameraDist = 1.7e6 // roughly where framing the whole ground parks it

    // What the app used to do, reproduced so the check above is not vacuous:
    // `near` left where framing the 10x10 ground put it, `far` widened to fit
    // the new one. Nothing here is out of range — it is all inside the far
    // plane — and the ground still does not draw.
    const strandedNear = (SMALL / Math.sin((50 * Math.PI) / 180 / 2)) * 0.001
    const widenedFar = 3.59e7
    expect(widenedFar).toBeGreaterThan(cameraDist + BIG) // not clipped...
    expect(drawsAt(cameraDist, strandedNear, widenedFar)).toBe(false) // ...just gone

    const { near, far } = clippingForView(cameraDist - BIG, cameraDist + BIG)
    expect(drawsAt(cameraDist - BIG, near, far)).toBe(true)
    expect(drawsAt(cameraDist, near, far)).toBe(true)
    expect(drawsAt(cameraDist + BIG, near, far)).toBe(true)
  })

  // The scale-independent version: whatever the scene size, everything between
  // the nearest surface and the furthest corner has to survive the depth test.
  // A 10x10 ground reaches its dolly limit in the same number of scroll clicks
  // as a 1000000x1000000 one, so a ratio that only works at one scale is not a
  // fix.
  it.each([
    ['tiny', 0.5],
    ['small ground', SMALL],
    ['large ground', BIG],
    ['huge', 2.5e7]
  ])('draws the whole scene at %s scale', (_label, radius) => {
    const cameraDist = radius * 2.4 // a typical framed distance for that size
    const nearDist = cameraDist - radius
    const farDist = cameraDist + radius
    const { near, far } = clippingForView(nearDist, farDist)

    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThan(nearDist) // nothing in front is clipped away
    expect(far).toBeGreaterThan(farDist) // nor anything behind
    for (const d of [nearDist, cameraDist, farDist]) {
      expect(drawsAt(d, near, far)).toBe(true)
    }
  })

  // Both grounds in one scene is the case no single fixed near/far can serve,
  // and the reason the planes are re-derived per frame. Zoomed in on the small
  // ground, the bounds still span the big one AND the grid drawn around it — the
  // small ground must draw anyway.
  //
  // This is what stops the ratio ceiling from becoming the mirror image of the
  // bug: it is enforced by raising `near`, so too tight a ceiling makes small
  // geometry vanish as the camera approaches it instead of as it retreats.
  it('draws a 10-unit ground zoomed in while a 1000000-unit one shares the scene', () => {
    const gridHalf = (4 * 1_000_000) / 2 // useAdaptiveGrid: 4x the extent
    const height = 20 // camera hovering just above the small ground
    const { near, far } = clippingForView(height, Math.hypot(gridHalf, gridHalf, height))

    expect(near).toBeLessThan(height) // the surface below is in front of the plane
    expect(drawsAt(height, near, far)).toBe(true) // ...and still resolvable
    expect(drawsAt(BIG, near, far)).toBe(true) // so is the big ground's far edge
  })

  // A camera inside the bounds reports nearDist 0 — the common case, since a
  // ground's box is flat and the camera sits above it.
  it('survives a camera sitting inside the scene bounds', () => {
    const { near, far } = clippingForView(0, BIG)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThan(far)
  })

  // Degenerate bounds must not produce an inverted frustum, which is an invalid
  // projection rather than a badly-scaled one.
  it('never inverts the frustum on a degenerate scene', () => {
    for (const [n, f] of [
      [0, 0],
      [0, 0.0001],
      [0.0001, 0.0001]
    ]) {
      const { near, far } = clippingForView(n, f)
      expect(near).toBeGreaterThan(0)
      expect(near).toBeLessThan(far)
    }
  })
})
