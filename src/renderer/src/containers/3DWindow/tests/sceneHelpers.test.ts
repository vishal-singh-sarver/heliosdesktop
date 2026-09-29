import { describe, expect, it } from 'vitest'
import { clippingForView } from '../ui/cameraRange'
import { gridParamsForView } from '../ui/SceneHelpers'

// The grid used to be derived from the scene's bounding box — a finite square
// parked at the origin, four times the geometry's extent. That made it behave
// like a ground object: zooming out shrank it into a small patch, and an empty
// scenario showed a bare 100x100 plane floating in the dark. It is now derived
// from the camera, which is why these tests take a view distance and no
// geometry at all — the signature is the change.
//
// The tests that lived here before pinned the geometry-derived sizing and the
// one-shot reset-view stamp that existed to paper over it (reset moved the
// camera but not the grid, so the grid had to be forced back to defaults). A
// camera-derived grid is correct by construction after a reset, so that whole
// subsystem is gone rather than re-tested.

const FOV = 50

/** Viewport height in world units at a given camera distance. */
function visibleHeight(distance: number): number {
  return 2 * distance * Math.tan((FOV * Math.PI) / 180 / 2)
}

/**
 * The three line spacings the shader actually draws at once: the finest decade,
 * which fades out as the camera pulls back, and the two above it.
 */
function drawnSpacings(distance: number): number[] {
  const { cellSize } = gridParamsForView(distance, FOV)
  return [cellSize, cellSize * 10, cellSize * 100]
}

// Seven orders of magnitude — a 10-unit ground up to the 1000000-unit one from
// the clipping bug, and in past both.
const DISTANCES = [0.1, 1, 16, 250, 5_000, 120_000, 1.7e6, 5e7]

describe('gridParamsForView — the grid tracks the camera, not the scene', () => {
  // THE property the grid was changed for. Spacings are powers of ten, so an
  // object's size always relates to a cell by a factor of ten. With the 1/2/5
  // rounding this replaced, a 10-unit ground sat inside 2 cells at one zoom and
  // 5 at another, which is no use for reading a dimension off the grid.
  it.each(DISTANCES)('spaces lines by a power of ten at distance %p', (distance) => {
    for (const spacing of drawnSpacings(distance)) {
      const exponent = Math.log10(spacing)
      expect(exponent).toBeCloseTo(Math.round(exponent), 10)
    }
  })

  // The same property stated the way it is actually looked at: how many cells
  // does a 10-unit ground cover? Ten, one, or a tenth — never two or five.
  it.each(DISTANCES)('puts a 10-unit ground on a power of ten of cells at %p', (distance) => {
    for (const spacing of drawnSpacings(distance)) {
      const cells = 10 / spacing
      expect(Math.log10(cells)).toBeCloseTo(Math.round(Math.log10(cells)), 10)
    }
  })

  // What the cross-fade buys. Decade steps are 10x apart, so any single level is
  // ten times too dense or ten times too sparse for most of the range — which is
  // why decades alone would look worse than the 1/2/5 rounding, not better.
  // Drawing three at once means one of them is always in a readable range.
  it.each(DISTANCES)('always has a readable set of lines on screen at %p', (distance) => {
    const counts = drawnSpacings(distance).map((s) => visibleHeight(distance) / s)
    expect(counts.some((c) => c >= 5 && c <= 55)).toBe(true)
  })

  // The level has to move CONTINUOUSLY with the camera — that continuity is the
  // cross-fade. If someone re-introduces rounding here the shader goes back to
  // swapping whole sets of lines in and out at once, which is the popping the
  // custom material exists to remove, and no other test would catch it.
  it.each(DISTANCES)('moves the level smoothly rather than in steps at %p', (distance) => {
    const step =
      gridParamsForView(distance * 1.01, FOV).level - gridParamsForView(distance, FOV).level
    expect(step).toBeCloseTo(Math.log10(1.01), 6)
  })

  // Zooming out has to grow the grid, not shrink it — the reported complaint.
  it('grows every dimension monotonically as the camera pulls back', () => {
    for (let i = 1; i < DISTANCES.length; i++) {
      const near = gridParamsForView(DISTANCES[i - 1], FOV)
      const far = gridParamsForView(DISTANCES[i], FOV)
      expect(far.level).toBeGreaterThan(near.level)
      expect(far.cellSize).toBeGreaterThanOrEqual(near.cellSize)
      expect(far.fadeDistance).toBeGreaterThan(near.fadeDistance)
    }
  })

  // A camera at the default pose, before anything is loaded. The old grid gave
  // a 100x100 plane here regardless of where the camera was. The finest decade
  // is 0.1 but is ~97% faded out at this level, so what reads on screen is the
  // 1-unit grid with bright lines every 10.
  it('produces a sane grid for an empty scenario at the default camera', () => {
    const { level, cellSize, sectionSize, fadeDistance } = gridParamsForView(16, FOV)
    expect(cellSize).toBe(0.1)
    expect(sectionSize).toBe(10)
    expect(fadeDistance).toBe(80)
    expect(level - Math.floor(level)).toBeGreaterThan(0.9) // finest nearly gone
  })

  // The camera distance comes from CameraControls, which can hand back 0 or NaN
  // before it has attached. A grid with a cell size of 0 or NaN is an infinite
  // loop in the shader's fract(), not a cosmetic problem.
  it.each([0, -5, NaN, Infinity])('falls back to a usable grid for %p', (bad) => {
    const { level, cellSize, sectionSize, fadeDistance } = gridParamsForView(bad, FOV)
    for (const value of [cellSize, sectionSize, fadeDistance]) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
    }
    expect(Number.isFinite(level)).toBe(true)
  })
})

// The infinite grid changed what the far plane has to cover, so these pin the
// seam between the two. AdaptiveClipping used to fold the grid's corners into
// the geometry's bounding box, which only worked while the grid was a finite
// square at the origin. It now rides under the camera and fades out at
// `fadeDistance`, so the numbers below are what that component computes for a
// scene with nothing in it but the grid.
describe('the grid and the clipping planes agree', () => {
  /** Camera height above the grid plane, at FitToScene's 50-degree elevation. */
  const heightAt = (distance: number): number => distance * Math.sin((50 * Math.PI) / 180)

  it.each(DISTANCES)('never clips the grid at distance %p', (distance) => {
    const height = heightAt(distance)
    const { fadeDistance } = gridParamsForView(distance, FOV)
    // Nearest visible grid fragment is straight down; furthest is at the fade
    // radius, out across the plane.
    const farDist = Math.hypot(fadeDistance, height)
    const { near, far } = clippingForView(height, farDist)

    expect(near).toBeLessThan(height) // the grid below the camera survives
    expect(far).toBeGreaterThan(farDist) // so does its outer edge
  })

  // Zooming out grows the fade radius, which grows the far plane. If the near
  // plane did not grow with it the depth buffer would run out exactly the way
  // the geometry did in the original bug — the failure this pairing exists to
  // avoid.
  it.each(DISTANCES)('keeps the depth-buffer ratio safe at distance %p', (distance) => {
    const height = heightAt(distance)
    const { fadeDistance } = gridParamsForView(distance, FOV)
    const { near, far } = clippingForView(height, Math.hypot(fadeDistance, height))

    expect(far / near).toBeLessThanOrEqual(1e6)
  })
})
