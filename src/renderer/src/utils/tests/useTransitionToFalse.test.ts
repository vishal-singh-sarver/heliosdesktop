import { renderHook } from '@testing-library/react'
import { useTransitionToFalse } from '../useTransitionToFalse'

// The hook sets state DURING render, so React immediately renders again and the
// `true` is gone by the time the render settles — `result.current` would only
// ever show false. Callers consume it inline (`if (useTransitionToFalse(x))`)
// during the render that returns it, so the tests record every render instead
// of inspecting the final one.
function setup(initial: boolean): {
  seen: boolean[]
  rerender: (props: { v: boolean }) => void
} {
  const seen: boolean[] = []
  const { rerender } = renderHook(
    ({ v }: { v: boolean }) => {
      seen.push(useTransitionToFalse(v))
    },
    { initialProps: { v: initial } }
  )
  return { seen, rerender }
}

describe('useTransitionToFalse', () => {
  it('never fires on the first render, whatever the value', () => {
    expect(setup(false).seen).not.toContain(true)
    expect(setup(true).seen).not.toContain(true)
  })

  it('fires on the render where the value flips true → false', () => {
    const { seen, rerender } = setup(true)
    seen.length = 0

    rerender({ v: false })

    expect(seen).toContain(true)
  })

  it('fires exactly once for one transition', () => {
    const { seen, rerender } = setup(true)
    seen.length = 0

    rerender({ v: false })
    rerender({ v: false })

    expect(seen.filter(Boolean)).toHaveLength(1)
  })

  it('does not fire on the opposite transition, false → true', () => {
    const { seen, rerender } = setup(false)
    seen.length = 0

    rerender({ v: true })

    expect(seen).not.toContain(true)
  })
})
