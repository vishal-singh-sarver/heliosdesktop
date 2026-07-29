import { describe, it, expect, beforeAll } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVirtualRows } from '../useVirtualRows'

beforeAll(() => {
  // jsdom doesn't ship ResizeObserver
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

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
})
