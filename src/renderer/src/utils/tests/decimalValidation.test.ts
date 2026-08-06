import { describe, expect, it } from 'vitest'
import {
  exceedsMaxDecimals,
  expandForDisplay,
  getDecimalCount,
  isIncompleteExponent,
  isPartialNumericInput,
  truncateToMaxDecimals,
  wouldTruncateAny
} from '../decimalValidation'

describe('decimalValidation utilities', () => {
  describe('isIncompleteExponent', () => {
    it('is true only for a value stopped mid-exponent', () => {
      expect(isIncompleteExponent('1e')).toBe(true)
      expect(isIncompleteExponent('1e-')).toBe(true)
      expect(isIncompleteExponent('1e+')).toBe(true)
      expect(isIncompleteExponent('1.5E')).toBe(true)
      expect(isIncompleteExponent(' 1e ')).toBe(true)
    })

    it('is false once the exponent has a digit, and for values with no exponent', () => {
      expect(isIncompleteExponent('1e9')).toBe(false)
      expect(isIncompleteExponent('1e-9')).toBe(false)
      expect(isIncompleteExponent('1')).toBe(false)
      expect(isIncompleteExponent('')).toBe(false)
      expect(isIncompleteExponent('-')).toBe(false)
    })

    it('does not excuse input that is simply wrong', () => {
      // "1e" is unfinished; "abc" is invalid. Only the first is suppressed.
      expect(isIncompleteExponent('abc')).toBe(false)
    })

    it('covers exactly the states where Number() is NaN but typing could continue', () => {
      for (const s of ['1e', '1e-', '1e+']) {
        expect(Number.isNaN(Number(s))).toBe(true)
        expect(isIncompleteExponent(s)).toBe(true)
      }
    })
  })

  describe('expandForDisplay', () => {
    it('expands complete scientific notation to plain decimal', () => {
      expect(expandForDisplay('1e3')).toBe('1000')
      expect(expandForDisplay('1e5')).toBe('100000')
      expect(expandForDisplay('1.5e3')).toBe('1500')
      expect(expandForDisplay('1e-3')).toBe('0.001')
      expect(expandForDisplay('-2.5e2')).toBe('-250')
      expect(expandForDisplay('1E3')).toBe('1000')
      expect(expandForDisplay('1e+3')).toBe('1000')
    })

    it('leaves plain decimals and in-progress states untouched', () => {
      expect(expandForDisplay('1000')).toBe('1000')
      expect(expandForDisplay('0.001')).toBe('0.001')
      expect(expandForDisplay('-0')).toBe('-0')
      expect(expandForDisplay('')).toBe('')
      expect(expandForDisplay('-')).toBe('-')
      expect(expandForDisplay('1e')).toBe('1e')
      expect(expandForDisplay('1e-')).toBe('1e-')
      expect(expandForDisplay('abc')).toBe('abc')
    })

    it('is value-preserving — Number() is unchanged by expansion', () => {
      for (const raw of ['1e3', '1.5e3', '1e-3', '-2.5e2', '1e21', '1e-9']) {
        expect(Number(expandForDisplay(raw))).toBe(Number(raw))
      }
    })

    it('does not truncate — an over-precise value stays intact so the guard can flag it', () => {
      expect(expandForDisplay('1e-9')).toBe('0.000000001')
      expect(exceedsMaxDecimals(expandForDisplay('1e-9'))).toBe(true)
    })

    it('expands past the point where JS would re-emit exponent form', () => {
      // JSON.stringify(1e21) is "1e+21" and String(1e-7) is "1e-7", so a
      // String(Number(x)) round-trip would reintroduce the notation here.
      expect(expandForDisplay('1e21')).toBe('1000000000000000000000')
      expect(expandForDisplay('1e-7')).toBe('0.0000001')
    })
  })

  describe('Add Column default-value decimal check', () => {
    it('catches exponent-form values the old split(".") count missed', () => {
      for (const v of ['1e-9', '1.23e-6', '1e-8']) {
        expect((v.split('.')[1]?.length ?? 0) > 7).toBe(false) // old check: passed
        expect(exceedsMaxDecimals(v)).toBe(true) // new check: caught
      }
    })

    it('still allows values at or under the limit', () => {
      for (const v of ['1e-7', '1e3', '0.1234567', '100']) {
        expect(exceedsMaxDecimals(v)).toBe(false)
      }
    })
  })

  describe('exceedsMaxDecimals', () => {
    it('should return true for values with more than 7 decimals', () => {
      expect(exceedsMaxDecimals('1.123456789')).toBe(true)
      expect(exceedsMaxDecimals('10.12345678')).toBe(true)
      expect(exceedsMaxDecimals('-5.987654321')).toBe(true)
    })

    it('should return false for values with 7 or fewer decimals', () => {
      expect(exceedsMaxDecimals('1.1234567')).toBe(false)
      expect(exceedsMaxDecimals('10.123456')).toBe(false)
      expect(exceedsMaxDecimals('-5.9876543')).toBe(false)
      expect(exceedsMaxDecimals('100')).toBe(false)
    })

    it('should handle empty strings and whitespace', () => {
      expect(exceedsMaxDecimals('')).toBe(false)
      expect(exceedsMaxDecimals('  ')).toBe(false)
      expect(exceedsMaxDecimals('-')).toBe(false)
    })

    it('should handle scientific notation', () => {
      expect(exceedsMaxDecimals('1.123456789e2')).toBe(false)
      expect(exceedsMaxDecimals('1.123456789e-2')).toBe(true)
      expect(exceedsMaxDecimals('1e10')).toBe(false)
    })

    it('should handle quoted and leading-dot decimals', () => {
      expect(exceedsMaxDecimals('"12.123456789"')).toBe(true)
      expect(exceedsMaxDecimals('.123456789')).toBe(true)
    })
  })

  describe('getDecimalCount', () => {
    it('should return correct decimal count', () => {
      expect(getDecimalCount('1.1')).toBe(1)
      expect(getDecimalCount('1.123456789')).toBe(9)
      expect(getDecimalCount('100')).toBe(0)
      expect(getDecimalCount('')).toBe(0)
      expect(getDecimalCount('"0.123456789"')).toBe(9)
    })
  })

  describe('truncateToMaxDecimals', () => {
    it('should truncate values with more than 7 decimals', () => {
      const result = truncateToMaxDecimals('1.123456789')
      expect(result.value).toBe('1.1234567')
      expect(result.truncated).toBe(true)
    })

    it('should not truncate values with 7 or fewer decimals', () => {
      const result = truncateToMaxDecimals('1.1234567')
      expect(result.value).toBe('1.1234567')
      expect(result.truncated).toBe(false)
    })

    it('should preserve whole numbers', () => {
      const result = truncateToMaxDecimals('100')
      expect(result.value).toBe('100')
      expect(result.truncated).toBe(false)
    })

    it('should handle negative numbers', () => {
      const result = truncateToMaxDecimals('-1.123456789')
      expect(result.value).toBe('-1.1234567')
      expect(result.truncated).toBe(true)
    })

    it('should handle empty strings', () => {
      const result = truncateToMaxDecimals('')
      expect(result.value).toBe('')
      expect(result.truncated).toBe(false)
    })

    it('should truncate quoted and leading-dot decimals', () => {
      expect(truncateToMaxDecimals('"12.123456789"')).toEqual({
        value: '12.1234567',
        truncated: true
      })
      expect(truncateToMaxDecimals('.123456789')).toEqual({
        value: '0.1234567',
        truncated: true
      })
    })
  })

  describe('wouldTruncateAny', () => {
    it('should return true if any value needs truncation', () => {
      const values = ['1.1234567', '1.123456789', '100']
      expect(wouldTruncateAny(values)).toBe(true)
    })

    it('should return false if no values need truncation', () => {
      const values = ['1.1234567', '100', '50.5']
      expect(wouldTruncateAny(values)).toBe(false)
    })

    it('should handle empty arrays', () => {
      expect(wouldTruncateAny([])).toBe(false)
    })

    it('should handle arrays with empty strings', () => {
      const values = ['', '1.1234567']
      expect(wouldTruncateAny(values)).toBe(false)
    })

    it('should detect truncation for quoted numeric strings', () => {
      expect(wouldTruncateAny(['"1.123456789"', '5'])).toBe(true)
    })
  })

  describe('isPartialNumericInput', () => {
    it('accepts complete numbers (positive, negative, float)', () => {
      for (const v of ['0', '1', '12', '-1', '1.5', '-12.34', '.5', '100000']) {
        expect(isPartialNumericInput(v)).toBe(true)
      }
    })

    it('accepts in-progress states so typing is not blocked', () => {
      for (const v of ['', '-', '1.', '.', '-1.']) {
        expect(isPartialNumericInput(v)).toBe(true)
      }
    })

    it('rejects a leading + , which would silently normalise away', () => {
      // "+5" passes every validation, and Number("+5") is 5 — so it saves as 5
      // and the field reads back "5" on the next load, with nothing having told
      // the user their keystroke was dropped. Blocked at the keystroke instead,
      // where '*' and '/' already are.
      for (const v of ['+', '+5', '+1.5', '+.5', '+0']) {
        expect(isPartialNumericInput(v)).toBe(false)
      }
    })

    it("still accepts the exponent's sign, which does carry meaning", () => {
      // '+' is only meaningless in the LEADING position: 1e+5 ≠ 1e-5.
      expect(isPartialNumericInput('1e+5')).toBe(true)
      expect(isPartialNumericInput('1e+')).toBe(true)
      expect(isPartialNumericInput('-2.5e+3')).toBe(true)
    })

    it('accepts scientific notation and its intermediate states', () => {
      for (const v of ['1e', '1e-', '1e+', '1e5', '1.5e6', '-2e-3', '.5e2']) {
        expect(isPartialNumericInput(v)).toBe(true)
      }
    })

    it('tolerates surrounding whitespace', () => {
      expect(isPartialNumericInput('  12.5  ')).toBe(true)
    })

    it('rejects non-numeric input', () => {
      for (const v of [
        'abc',
        '1a',
        '2.2.2.2.222',
        '1.2.3',
        '--1',
        '1ee5',
        '1e5.5',
        '1 2',
        '$5'
      ]) {
        expect(isPartialNumericInput(v)).toBe(false)
      }
    })
  })
})
