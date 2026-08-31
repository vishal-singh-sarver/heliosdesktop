import { cameraRangeFor, MAX_DOLLY_FACTOR } from '../ui/cameraRange'

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
