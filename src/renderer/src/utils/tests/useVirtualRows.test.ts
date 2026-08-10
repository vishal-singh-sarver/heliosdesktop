import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVirtualRows } from 'utils/useVirtualRows'

beforeAll(() => {
  // jsdom doesn't ship ResizeObserver
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

/** Builds a detached container whose clientHeight / scrollTop are test-driven. */
function makeContainer(clientHeight: number): {
  el: HTMLDivElement
  ref: { current: HTMLDivElement }
  setScrollTop: (v: number) => void
  setClientHeight: (v: number) => void
} {
  const el = document.createElement('div')
  let scrollTopVal = 0
  let clientHeightVal = clientHeight
  Object.defineProperty(el, 'clientHeight', { get: () => clientHeightVal, configurable: true })
  Object.defineProperty(el, 'scrollTop', { get: () => scrollTopVal, configurable: true })
  return {
    el,
    ref: { current: el },
    setScrollTop: (v) => {
      scrollTopVal = v
    },
    setClientHeight: (v) => {
      clientHeightVal = v
    }
  }
}

describe('useVirtualRows', () => {
  it('returns all rows when smaller than viewport', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientHeight', { value: 1000, configurable: true })
    const ref = { current: el }

    const { result } = renderHook(() =>
      useVirtualRows({ rowCount: 5, rowHeight: 100, containerRef: ref, overscan: 5 })
    )

    // 5 rows × 100px = 500px; viewport 1000px → start=0, end=rowCount
    expect(result.current).toEqual({ startIndex: 0, endIndex: 5 })
  })

  it('returns a degenerate empty window when the ref is null (no element to measure)', () => {
    const ref = { current: null }
    const { result } = renderHook(() =>
      useVirtualRows({ rowCount: 1000, rowHeight: 20, containerRef: ref, overscan: 5 })
    )
    // viewportHeight stays 0 → visibleCount = ceil(0/20) + 10 = 10; scrollTop 0.
    expect(result.current).toEqual({ startIndex: 0, endIndex: 10 })
  })

  it('windows to the middle of a long list on scroll', () => {
    const c = makeContainer(400)
    const { result } = renderHook(() =>
      useVirtualRows({ rowCount: 1000, rowHeight: 20, containerRef: c.ref, overscan: 5 })
    )

    // Before scrolling: scrollTop 0 → start 0.
    // visibleCount = ceil(400/20) + 5*2 = 20 + 10 = 30 → end = min(1000, 30) = 30
    expect(result.current).toEqual({ startIndex: 0, endIndex: 30 })

    // Scroll down 1000px (50 rows). start = max(0, floor(1000/20) - 5) = 50 - 5 = 45.
    // end = min(1000, 45 + 30) = 75.
    act(() => {
      c.setScrollTop(1000)
      c.el.dispatchEvent(new Event('scroll'))
    })
    expect(result.current).toEqual({ startIndex: 45, endIndex: 75 })
  })

  it('clamps startIndex to 0 when the overscan would push it negative', () => {
    const c = makeContainer(400)
    const { result } = renderHook(() =>
      useVirtualRows({ rowCount: 1000, rowHeight: 20, containerRef: c.ref, overscan: 5 })
    )

    // Scroll a tiny amount: floor(40/20) - 5 = 2 - 5 = -3 → clamped to 0.
    act(() => {
      c.setScrollTop(40)
      c.el.dispatchEvent(new Event('scroll'))
    })
    expect(result.current.startIndex).toBe(0)
    // visibleCount unchanged (viewport 400) → end = min(1000, 0 + 30) = 30
    expect(result.current.endIndex).toBe(30)
  })

  it('caps endIndex at rowCount when scrolled to the bottom', () => {
    const c = makeContainer(400)
    const { result } = renderHook(() =>
      useVirtualRows({ rowCount: 1000, rowHeight: 20, containerRef: c.ref, overscan: 5 })
    )

    // Scroll near the end: floor(19980/20) - 5 = 999 - 5 = 994.
    // start + visibleCount = 994 + 30 = 1024, but rowCount is 1000 → capped.
    act(() => {
      c.setScrollTop(19980)
      c.el.dispatchEvent(new Event('scroll'))
    })
    expect(result.current).toEqual({ startIndex: 994, endIndex: 1000 })
  })

  describe('ResizeObserver-driven recompute', () => {
    let originalRO: unknown
    let roCallback: (() => void) | null = null

    beforeAll(() => {
      originalRO = (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver
      ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        constructor(cb: () => void) {
          roCallback = cb
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    })

    afterEach(() => {
      roCallback = null
    })

    // Restore the no-op observer after this block so other suites are unaffected.
    afterEach(() => {
      ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalRO
    })

    it('recomputes the window when the container is resized', () => {
      const c = makeContainer(100)
      const { result } = renderHook(() =>
        useVirtualRows({ rowCount: 1000, rowHeight: 20, containerRef: c.ref, overscan: 5 })
      )

      // Initial: viewport 100 → visibleCount = ceil(100/20) + 10 = 5 + 10 = 15
      expect(result.current).toEqual({ startIndex: 0, endIndex: 15 })
      expect(typeof roCallback).toBe('function')

      // Grow the viewport, then fire the observer's measure callback.
      act(() => {
        c.setClientHeight(400)
        roCallback!()
      })
      // New viewport 400 → visibleCount = ceil(400/20) + 10 = 20 + 10 = 30
      expect(result.current).toEqual({ startIndex: 0, endIndex: 30 })
    })
  })
})
