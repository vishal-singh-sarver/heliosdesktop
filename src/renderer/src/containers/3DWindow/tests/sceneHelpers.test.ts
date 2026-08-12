import { renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PrimitiveInfo } from '../models/types'
import { clearSceneCache, setObjectPrimitives } from '../store/sceneCache'
import { DEFAULT_GRID, gridStamp, useAdaptiveGrid } from '../ui/SceneHelpers'

// The grid sizes itself off the scene's bounding box, which lives in the
// module-level sceneCache rather than in Redux. These tests drive the real
// cache (the same thing saga.test.ts does) instead of mocking it, so the
// arithmetic under test runs against the data shape the app actually stores.

/** One primitive spanning the origin to `extent` along X. */
function boxOfExtent(extent: number): PrimitiveInfo {
  return {
    uuid: 1,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: extent, y: 0, z: 0 }
    ],
    color: { r: 1, g: 1, b: 1 }
  }
}

// Worked through by hand from the cellSize algorithm, so a change to the
// rounding steps fails loudly here rather than silently reshaping the grid:
//   extent 100 -> rawCell 2   -> magnitude 1   -> cellSize 2
//   extent  20 -> rawCell 0.4 -> magnitude 0.1 -> cellSize 0.5
const GRID_FOR_100 = { size: 400, cellSize: 2, sectionSize: 20, fadeDistance: 320 }
const GRID_FOR_20 = { size: 80, cellSize: 0.5, sectionSize: 5, fadeDistance: 64 }

afterEach(() => clearSceneCache())

describe('useAdaptiveGrid — deriving the grid from geometry', () => {
  it('falls back to defaults when nothing is cached', () => {
    const { result } = renderHook(() => useAdaptiveGrid(0, null, null))
    expect(result.current).toEqual(DEFAULT_GRID)
  })

  it('sizes the grid to every cached object when nothing is selected', () => {
    setObjectPrimitives(1, [boxOfExtent(100)])
    setObjectPrimitives(2, [boxOfExtent(20)])

    const { result } = renderHook(() => useAdaptiveGrid(1, null, null))
    expect(result.current).toEqual(GRID_FOR_100)
  })

  it('sizes the grid to just the selected object', () => {
    setObjectPrimitives(1, [boxOfExtent(100)])
    setObjectPrimitives(2, [boxOfExtent(20)])

    const { result } = renderHook(() => useAdaptiveGrid(1, 2, null))
    expect(result.current).toEqual(GRID_FOR_20)
  })

  it('falls back to defaults when the selected object is not cached', () => {
    setObjectPrimitives(1, [boxOfExtent(100)])

    const { result } = renderHook(() => useAdaptiveGrid(1, 99, null))
    expect(result.current).toEqual(DEFAULT_GRID)
  })

  it('recomputes when geometryVersion bumps, since the cache is invisible to React', () => {
    setObjectPrimitives(1, [boxOfExtent(20)])
    const { result, rerender } = renderHook(
      ({ v }: { v: number }) => useAdaptiveGrid(v, null, null),
      { initialProps: { v: 1 } }
    )
    expect(result.current).toEqual(GRID_FOR_20)

    // A cache write alone must NOT be picked up — geometryVersion is the only
    // signal the hook has that the cache changed.
    setObjectPrimitives(2, [boxOfExtent(100)])
    expect(result.current).toEqual(GRID_FOR_20)

    rerender({ v: 2 })
    expect(result.current).toEqual(GRID_FOR_100)
  })
})

// Reset-view stamps the scene state it was pressed at; the grid shows defaults
// for as long as that stamp still describes the current scene. `reset` below
// stands in for what Viewport3D's click handler stores.
type ResetProps = { v: number; sel: number | null; reset: string | null }

describe('useAdaptiveGrid — reset-view behaviour', () => {
  it('returns defaults when a reset lands, even with geometry cached', () => {
    setObjectPrimitives(1, [boxOfExtent(100)])
    const { result, rerender } = renderHook(
      ({ v, sel, reset }: ResetProps) => useAdaptiveGrid(v, sel, reset),
      { initialProps: { v: 1, sel: null, reset: null } as ResetProps }
    )
    expect(result.current).toEqual(GRID_FOR_100)

    rerender({ v: 1, sel: null, reset: gridStamp(1, null) })
    expect(result.current).toEqual(DEFAULT_GRID)
  })

  it('goes back to adaptive values on the next geometry change', () => {
    setObjectPrimitives(1, [boxOfExtent(100)])
    const reset = gridStamp(1, null)
    const { result, rerender } = renderHook(
      ({ v, sel, reset: r }: ResetProps) => useAdaptiveGrid(v, sel, r),
      { initialProps: { v: 1, sel: null, reset } as ResetProps }
    )
    expect(result.current).toEqual(DEFAULT_GRID)

    rerender({ v: 2, sel: null, reset })
    expect(result.current).toEqual(GRID_FOR_100)
  })

  // Selecting "All" in the dropdown dispatches only meshReady() and does NOT
  // bump geometryVersion (store/saga.ts selectSceneObjectWorker), so selection
  // is an independent way out of the post-reset default. Pinned because a fix
  // keyed on geometryVersion alone would silently regress this path.
  it('goes back to adaptive values when the selection changes instead', () => {
    setObjectPrimitives(1, [boxOfExtent(100)])
    setObjectPrimitives(2, [boxOfExtent(20)])
    const reset = gridStamp(1, null)
    const { result, rerender } = renderHook(
      ({ v, sel, reset: r }: ResetProps) => useAdaptiveGrid(v, sel, r),
      { initialProps: { v: 1, sel: null, reset } as ResetProps }
    )
    expect(result.current).toEqual(DEFAULT_GRID)

    rerender({ v: 1, sel: 2, reset })
    expect(result.current).toEqual(GRID_FOR_20)
  })

  it('stays on defaults while nothing about the scene has changed', () => {
    setObjectPrimitives(1, [boxOfExtent(100)])
    const { result, rerender } = renderHook(
      ({ v, sel, reset }: ResetProps) => useAdaptiveGrid(v, sel, reset),
      { initialProps: { v: 1, sel: null, reset: gridStamp(1, null) } as ResetProps }
    )
    expect(result.current).toEqual(DEFAULT_GRID)

    // Pressing reset again with an unchanged scene re-stamps the same value,
    // and the grid keeps showing defaults.
    rerender({ v: 1, sel: null, reset: gridStamp(1, null) })
    expect(result.current).toEqual(DEFAULT_GRID)
  })

  // The whole point of the rewrite: the old version latched a ref during
  // render, so it could only fire once. Re-rendering with identical inputs
  // used to consume the latch and silently drop back to adaptive values.
  it('keeps returning defaults across repeated renders with identical inputs', () => {
    setObjectPrimitives(1, [boxOfExtent(100)])
    const props: ResetProps = { v: 1, sel: null, reset: gridStamp(1, null) }
    const { result, rerender } = renderHook(
      ({ v, sel, reset }: ResetProps) => useAdaptiveGrid(v, sel, reset),
      { initialProps: props }
    )

    for (let i = 0; i < 5; i++) {
      rerender({ ...props })
      expect(result.current).toEqual(DEFAULT_GRID)
    }
  })

  // The app mounts under React.StrictMode (main.tsx), which double-invokes
  // component bodies. A stamp comparison is unaffected by construction; this
  // pins that, so a future rewrite that reintroduces render-phase state has to
  // clear the same bar. (Note: the old ref latch also passed this in practice
  // — StrictMode was not enough to surface its one-shot flaw.)
  it('survives StrictMode double-invocation', () => {
    setObjectPrimitives(1, [boxOfExtent(100)])
    const { result } = renderHook(
      ({ v, sel, reset }: ResetProps) => useAdaptiveGrid(v, sel, reset),
      {
        wrapper: StrictMode,
        initialProps: { v: 1, sel: null, reset: gridStamp(1, null) } as ResetProps
      }
    )
    expect(result.current).toEqual(DEFAULT_GRID)
  })
})
