/**
 * Decimal validation utilities for restricting numeric values to 7 decimal places
 * Supports both manual input validation and import data truncation
 */

const MAX_DECIMALS = 7
const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

function unwrapQuotedValue(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function normalizeNumericInput(value: string): string | null {
  const normalized = unwrapQuotedValue(value)
  if (normalized === '' || normalized === '-') return normalized
  return NUMERIC_PATTERN.test(normalized) ? normalized : null
}

// Accepts complete numbers AND in-progress states ("", "-", "1.", "1e", "1e-",
// ".5") so a keystroke gate can reject non-numeric input without blocking a
// user mid-number. Scientific notation is permitted. Final NaN leftovers like
// "-" or "1e" are caught on commit by validateCellValue, not here.
//
// A LEADING '+' is deliberately rejected (the exponent's sign in "1e+5" is
// not — that one carries meaning). "+5" is not wrong so much as invisible:
// every validation passes, Number("+5") is 5, and the backend stores 5 — so the
// field silently reads back "5" on the next load and the user's keystroke has
// vanished with nothing having flagged it. Rejecting it at the keystroke puts
// '+' where '*' and '/' already are.
const PARTIAL_NUMERIC_PATTERN = /^-?(\d+(\.\d*)?|\.\d*)?([eE][+-]?\d*)?$/

export function isPartialNumericInput(value: string): boolean {
  return PARTIAL_NUMERIC_PATTERN.test(value.trim())
}

function expandScientificNotation(value: string): string | null {
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))[eE]([+-]?\d+)$/.exec(value)
  if (!match) return null

  const [, sign, wholeDigits = '', fractionDigitsFromWhole = '', fractionOnly = '', exponentRaw] =
    match
  const digits = `${wholeDigits}${fractionDigitsFromWhole}${fractionOnly}`
  const originalWholeLength = wholeDigits.length
  const exponent = Number(exponentRaw)

  if (!Number.isInteger(exponent)) return null

  const decimalIndex = originalWholeLength
  const shiftedIndex = decimalIndex + exponent

  if (digits === '') return '0'

  if (shiftedIndex <= 0) {
    return `${sign}0.${'0'.repeat(Math.abs(shiftedIndex))}${digits}`
  }

  if (shiftedIndex >= digits.length) {
    return `${sign}${digits}${'0'.repeat(shiftedIndex - digits.length)}`
  }

  return `${sign}${digits.slice(0, shiftedIndex)}.${digits.slice(shiftedIndex)}`
}

/**
 * Check if a string value contains more than the maximum allowed decimal places
 * @param value - String representation of a number
 * @returns true if value exceeds MAX_DECIMALS, false otherwise
 */
export function exceedsMaxDecimals(value: string): boolean {
  const normalized = normalizeNumericInput(value)
  if (normalized == null || normalized === '' || normalized === '-') return false

  const str = /[eE]/.test(normalized)
    ? (expandScientificNotation(normalized) ?? normalized)
    : normalized

  // Extract decimal part - handle both regular decimals and scientific notation
  const parts = str.split(/[eE]/)
  const mainPart = parts[0]
  const decimalMatch = /\.(\d+)/.exec(mainPart)

  if (!decimalMatch) return false // No decimals

  const decimals = decimalMatch[1]
  return decimals.length > MAX_DECIMALS
}

/**
 * Get the decimal count of a numeric string
 * @param value - String representation of a number
 * @returns Number of decimal places, or 0 if no decimals
 */
export function getDecimalCount(value: string): number {
  const normalized = normalizeNumericInput(value)
  if (normalized == null || normalized === '') return 0

  const str = /[eE]/.test(normalized)
    ? (expandScientificNotation(normalized) ?? normalized)
    : normalized
  const parts = str.split(/[eE]/)
  const mainPart = parts[0]
  const decimalMatch = /\.(\d+)/.exec(mainPart)

  if (!decimalMatch) return 0
  return decimalMatch[1].length
}

/**
 * Truncate a numeric string to the maximum allowed decimal places
 * Handles regular decimals and scientific notation
 * @param raw - String representation of a number
 * @returns Object containing the truncated value and whether truncation occurred
 */
export function truncateToMaxDecimals(raw: string): { value: string; truncated: boolean } {
  const normalized = normalizeNumericInput(raw)
  if (normalized == null) return { value: raw, truncated: false }
  if (normalized === '') return { value: raw, truncated: false }

  // Handle scientific notation by converting to decimal
  if (/[eE]/.test(normalized)) {
    const expanded = expandScientificNotation(normalized)
    if (expanded == null) return { value: raw, truncated: false }
    return truncateToMaxDecimals(expanded)
  }

  // For regular decimals
  const sign = normalized.startsWith('-') ? '-' : ''
  const unsigned = normalized.replace(/^[+-]/, '')
  const decimalIndex = unsigned.indexOf('.')

  if (decimalIndex < 0) {
    return { value: `${sign}${unsigned}`, truncated: false }
  }

  const whole = unsigned.slice(0, decimalIndex) || '0'
  const decimals = unsigned.slice(decimalIndex + 1)
  if (decimals.length <= MAX_DECIMALS) {
    return {
      value: `${sign}${whole}${decimals.length > 0 ? `.${decimals}` : ''}`,
      truncated: false
    }
  }

  return {
    value: `${sign}${whole}.${decimals.slice(0, MAX_DECIMALS)}`,
    truncated: true
  }
}

/**
 * Check if ANY values in a collection would be truncated
 * Useful for pre-checking before import
 * @param values - Array of string values to check
 * @returns true if any value would be truncated, false otherwise
 */
export function wouldTruncateAny(values: string[]): boolean {
  return values.some((v) => {
    const result = truncateToMaxDecimals(v)
    return result.truncated
  })
}

/**
 * Check if a value is a valid numeric string (integer or decimal)
 * @param value - String value to check
 * @returns true if valid number, false otherwise
 */
export function isValidNumber(value: string): boolean {
  const trimmed = unwrapQuotedValue(value)
  if (trimmed === '' || trimmed === '-') return true // Allow empty or just minus sign during typing

  return NUMERIC_PATTERN.test(trimmed)
}

/**
 * Validation messages
 */
export const VALIDATION_MESSAGES = {
  MANUAL_INPUT: 'Only 7 decimal places supported as input.',
  IMPORT_WARNING:
    'Only 7 decimal places have been taken for decimal values as more are not supported.',
  NUMERIC_ONLY: 'Only numeric values are allowed.'
}
