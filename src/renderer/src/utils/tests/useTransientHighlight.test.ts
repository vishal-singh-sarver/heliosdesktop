import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIGHLIGHT_DURATION_MS, useTransientHighlight } from '../useTransientHighlight'

describe('useTransientHighlight', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('cues the id, then expires it so the source can clear it', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useTransientHighlight('12', onExpire))

    expect(result.current).toBe('12')
    // Still on screen right up to the deadline.
    act(() => void vi.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 1))
    expect(onExpire).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1))
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('ends the cue once the source clears the id', () => {
    // The source clearing the id is what actually ends the cue — the hook reports
    // whatever it currently holds.
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useTransientHighlight(id, () => {}),
      { initialProps: { id: '12' as string | null } }
    )
    expect(result.current).toBe('12')

    rerender({ id: null })
    expect(result.current).toBeNull()
  })

  it('does not arm a timer with nothing to cue', () => {
    const onExpire = vi.fn()
    renderHook(() => useTransientHighlight(null, onExpire))

    act(() => void vi.advanceTimersByTime(HIGHLIGHT_DURATION_MS * 2))
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('re-renders do not restart the countdown', () => {
    // The callback is read from a ref, so an inline arrow (what every call site
    // passes) must not re-arm the timer and strand the cue on screen.
    const onExpire = vi.fn()
    const { rerender } = renderHook(() => useTransientHighlight('12', onExpire))

    act(() => void vi.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 10))
    rerender()
    act(() => void vi.advanceTimersByTime(10))

    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('restarts the cue for a newly created id', () => {
    // Creating a second item mid-cue gives that item a FULL cue, rather than
    // inheriting the leftover of the first one's countdown.
    const onExpire = vi.fn()
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useTransientHighlight(id, onExpire),
      { initialProps: { id: '12' } }
    )

    act(() => void vi.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 100))
    rerender({ id: '13' })
    expect(result.current).toBe('13')

    // The first id's timer was dropped, so nothing fires at its old deadline.
    act(() => void vi.advanceTimersByTime(200))
    expect(onExpire).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(HIGHLIGHT_DURATION_MS - 200))
    expect(onExpire).toHaveBeenCalledTimes(1)
  })
})
