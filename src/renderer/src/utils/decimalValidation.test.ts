import { describe, expect, it } from 'vitest'
import {
  exceedsMaxDecimals,
  getDecimalCount,
  isPartialNumericInput,
  isValidNumber,
  truncateToMaxDecimals,
  wouldTruncateAny
} from './decimalValidation'

describe('decimalValidation utilities', () => {
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
      for (const v of ['0', '1', '12', '-1', '+1', '1.5', '-12.34', '.5', '100000']) {
        expect(isPartialNumericInput(v)).toBe(true)
      }
    })

    it('accepts in-progress states so typing is not blocked', () => {
      for (const v of ['', '-', '+', '1.', '.', '-1.']) {
        expect(isPartialNumericInput(v)).toBe(true)
      }
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

  describe('isValidNumber', () => {
    it('accepts integers, decimals, signs, and complete scientific notation', () => {
      for (const v of [
        '0',
        '1',
        '12',
        '-3',
        '+2',
        '1.5',
        '-12.34',
        '.5',
        '100000',
        '1e5',
        '1.5e-3',
        '-2E10'
      ]) {
        expect(isValidNumber(v)).toBe(true)
      }
    })

    it('unwraps surrounding quotes before validating', () => {
      expect(isValidNumber('"12.5"')).toBe(true)
      expect(isValidNumber("'42'")).toBe(true)
    })

    it('treats empty, whitespace, and a lone minus as valid (allowed mid-typing)', () => {
      expect(isValidNumber('')).toBe(true)
      expect(isValidNumber('   ')).toBe(true)
      expect(isValidNumber('-')).toBe(true)
    })

    it('rejects garbage and incomplete numbers', () => {
      for (const v of ['abc', '1a', '2.2.2.2.222', '1.2.3', '--1', '1e', '1ee5', '1 2', '$5', '+']) {
        expect(isValidNumber(v)).toBe(false)
      }
    })
  })
})
