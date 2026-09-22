import { divisorsOf, nextValid, prevValid, snapRepeat } from '../textureRepeat'

describe('divisorsOf', () => {
  it('lists every divisor, ascending', () => {
    expect(divisorsOf(10)).toEqual([1, 2, 5, 10])
    expect(divisorsOf(12)).toEqual([1, 2, 3, 4, 6, 12])
    expect(divisorsOf(1)).toEqual([1])
  })

  it('lists a perfect square root once, not twice', () => {
    expect(divisorsOf(36)).toEqual([1, 2, 3, 4, 6, 9, 12, 18, 36])
  })

  it('gives a prime only 1 and itself', () => {
    expect(divisorsOf(17)).toEqual([1, 17])
    // 21 is the case that rules out per-keystroke snapping: "2" — the first
    // character of the perfectly valid 21 — is not a divisor.
    expect(divisorsOf(21)).toEqual([1, 3, 7, 21])
  })

  it('returns an empty set for anything that is not a usable subdivision count', () => {
    // Number('') is 0 and Number('abc') is NaN, so these are the blank and
    // non-numeric resolution cases as they actually arrive from the form.
    expect(divisorsOf(0)).toEqual([])
    expect(divisorsOf(Number.NaN)).toEqual([])
    expect(divisorsOf(-10)).toEqual([])
    expect(divisorsOf(10.5)).toEqual([])
    expect(divisorsOf(Number.POSITIVE_INFINITY)).toEqual([])
  })

  it('refuses a count so large that trial division would hang the renderer', () => {
    // `count` arrives unvalidated, and the keystroke guard admits scientific
    // notation — so "9e30" is typeable into the resolution field. √9e30 is 3e15
    // iterations, inside a render. The ceiling turns that into "no valid set",
    // which is also the honest answer: the resolution is far past the catalog's
    // own maximum and is already blocking Save.
    const start = Date.now()
    expect(divisorsOf(9e30)).toEqual([])
    expect(divisorsOf(1e18)).toEqual([])
    expect(divisorsOf(1_000_001)).toEqual([])
    expect(Date.now() - start).toBeLessThan(100)

    // The ceiling itself is still computed.
    expect(divisorsOf(1_000_000)).toContain(1_000_000)
  })

  it('stays cheap at the catalog ceiling', () => {
    // Trial division to √25000 — the point is that the form can call this
    // inline on every render without memoising at the call site.
    expect(divisorsOf(25000)).toHaveLength(24)
    expect(divisorsOf(25000)[0]).toBe(1)
    expect(divisorsOf(25000).at(-1)).toBe(25000)
  })

  it('returns the same answer on a repeat call (memoised)', () => {
    expect(divisorsOf(10)).toEqual(divisorsOf(10))
  })
})

describe('snapRepeat', () => {
  const tenths = divisorsOf(10)

  it('snaps down to the nearest valid value', () => {
    expect(snapRepeat(9, tenths)).toBe(5)
    expect(snapRepeat(7, tenths)).toBe(5)
    expect(snapRepeat(4, tenths)).toBe(2)
    expect(snapRepeat(3, tenths)).toBe(2)
  })

  it('leaves an already-valid value alone', () => {
    for (const valid of tenths) expect(snapRepeat(valid, tenths)).toBe(valid)
  })

  it('clamps above the subdivision count to the count itself', () => {
    // The count is always its own largest divisor, so "snap down" doubles as
    // the upper clamp — no separate max check needed.
    expect(snapRepeat(20, tenths)).toBe(10)
    expect(snapRepeat(9999, tenths)).toBe(10)
  })

  it('snaps UP to the minimum below the range — nothing valid exists under 1', () => {
    expect(snapRepeat(0, tenths)).toBe(1)
    expect(snapRepeat(-4, tenths)).toBe(1)
  })

  it('returns null when the constraint cannot be evaluated', () => {
    // No usable resolution, or a value that never parsed — in both cases the
    // caller must leave the field alone rather than invent a number.
    expect(snapRepeat(5, [])).toBeNull()
    expect(snapRepeat(Number.NaN, tenths)).toBeNull()
  })
})

describe('nextValid / prevValid', () => {
  const tenths = divisorsOf(10)

  it('steps to the neighbouring valid value, not by one', () => {
    expect(nextValid(2, tenths)).toBe(5)
    expect(prevValid(5, tenths)).toBe(2)
  })

  it('steps out of a value that is not valid yet', () => {
    // Mid-edit the field can hold 7; ▼ lands where a blur would snap it, so the
    // stepper and the commit agree.
    expect(prevValid(7, tenths)).toBe(5)
    expect(nextValid(7, tenths)).toBe(10)
  })

  it('returns null at each end of the range', () => {
    expect(nextValid(10, tenths)).toBeNull()
    expect(prevValid(1, tenths)).toBeNull()
  })

  it('steps up from an empty field onto the minimum', () => {
    // The form passes 0 for a blank value, so ▲ opens the range at 1.
    expect(nextValid(0, tenths)).toBe(1)
    expect(prevValid(0, tenths)).toBeNull()
  })

  it('has nowhere to go with no usable resolution, or a resolution of 1', () => {
    expect(nextValid(1, [])).toBeNull()
    expect(prevValid(1, [])).toBeNull()
    expect(nextValid(1, divisorsOf(1))).toBeNull()
    expect(prevValid(1, divisorsOf(1))).toBeNull()
  })
})
