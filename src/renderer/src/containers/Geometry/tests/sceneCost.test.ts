import { CAUTION_CELLS, WARNING_CELLS, groundCost, groundCostWarning } from '../sceneCost'

describe('groundCost', () => {
  it('multiplies the two axes — the cost is cells, not the number typed', () => {
    // The whole reason this exists. The input reads linearly and the cost grows
    // quadratically, so 100 → 1000 in one box is a 100x jump, not a 10x one.
    expect(groundCost('100', '100')?.cells).toBe(10_000)
    expect(groundCost('1000', '1000')?.cells).toBe(1_000_000)
  })

  it('says nothing while a value is blank or mid-typed', () => {
    // Null means "render no line". A warning that flickers on every keystroke
    // is worse than none, and an invalid value already has its own field error —
    // a second, contradictory message beside it would only confuse.
    expect(groundCost('', '100')).toBeNull()
    expect(groundCost('100', '')).toBeNull()
    expect(groundCost('1e', '100')).toBeNull()
    expect(groundCost('abc', '100')).toBeNull()
    expect(groundCost('-5', '100')).toBeNull()
    expect(groundCost('0', '100')).toBeNull()
    expect(groundCost('5.5', '100')).toBeNull()
  })

  it('grades the default ground as free', () => {
    // Resolution defaults to 1x1. The overwhelmingly common case must stay
    // silent, or the notice becomes noise that gets ignored when it matters.
    expect(groundCost('1', '1')?.level).toBe('ok')
    expect(groundCostWarning(groundCost('1', '1'))).toBeNull()
  })

  it('cautions at the threshold and warns at the reported size', () => {
    expect(groundCost('500', '500')?.cells).toBe(CAUTION_CELLS)
    expect(groundCost('500', '500')?.level).toBe('caution')

    // 1000x1000 is the resolution from the bug report — the project could not be
    // reopened afterwards at all.
    expect(groundCost('1000', '1000')?.cells).toBe(WARNING_CELLS)
    expect(groundCost('1000', '1000')?.level).toBe('warning')
  })

  it('grades on the product, so a lopsided ground is judged fairly', () => {
    // 2000x500 costs exactly what 1000x1000 costs. Grading on either axis alone
    // would call this one safe.
    expect(groundCost('2000', '500')?.level).toBe('warning')
    expect(groundCost('25000', '1')?.level).toBe('ok')
  })
})

describe('groundCostWarning', () => {
  it('reports surfaces and memory, not resolution', () => {
    const warning = groundCostWarning(groundCost('1000', '1000'))
    expect(warning).toContain('1,000,000 surfaces')
    expect(warning).toContain('GB')
  })

  it('escalates the consequence at the warning level', () => {
    expect(groundCostWarning(groundCost('500', '500'))).toContain('slow')
    expect(groundCostWarning(groundCost('1000', '1000'))).toContain('may not open')
  })

  it('returns null for anything it should stay quiet about', () => {
    expect(groundCostWarning(null)).toBeNull()
    expect(groundCostWarning(groundCost('10', '10'))).toBeNull()
  })
})
