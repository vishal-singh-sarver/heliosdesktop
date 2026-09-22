/**
 * Decimal validation utilities for restricting numeric values to 7 decimal places
 * Supports both manual input validation and import data truncation
 */

const MAX_DECIMALS = 7
const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

// The widest expansion expandExponent will build. Both of its padding branches
// call '0'.repeat() with a count bounded by |shiftedIndex|, and V8 caps a string
// at ~2^29 characters: "1e-999999999" asks for a billion zeros and throws
// RangeError (one digit shorter it merely allocates ~100MB and stalls the
// renderer). 1000 sits comfortably past IEEE-754 — beyond |exponent| ≈ 324 a
// double is already ±Infinity or 0, so there is no real value left out there.
//
// Deliberately NOT tied to MAX_DECIMALS. Expansion must be able to produce MORE
// than 7 decimals ("1e-9" -> "0.000000001") so exceedsMaxDecimals can flag them;
// a MAX_DECIMALS-sized bound would refuse exactly the values it exists to catch.
const MAX_EXPANSION_DIGITS = 1000

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

function expandExponent(value: string): string | null {
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

  // Past this the value is Infinity or 0 as a double anyway, and building the
  // string would throw. Callers treat null as "leave it alone", which is the
  // right answer for a value no validator can do anything useful with.
  if (Math.abs(shiftedIndex) > MAX_EXPANSION_DIGITS) return null

  if (shiftedIndex <= 0) {
    return `${sign}0.${'0'.repeat(Math.abs(shiftedIndex))}${digits}`
  }

  if (shiftedIndex >= digits.length) {
    return `${sign}${digits}${'0'.repeat(shiftedIndex - digits.length)}`
  }

  return `${sign}${digits.slice(0, shiftedIndex)}.${digits.slice(shiftedIndex)}`
}

// "1.5e3" -> "1500". Null when the value isn't a COMPLETE number in exponent
// form, or when expanding it would build an absurd string.
function expandScientificNotation(value: string): string | null {
  const expanded = expandExponent(value)
  if (expanded == null) return null
  // The mantissa's own leading zeros survive the shift: "0.5e6" builds "0500000"
  // and "0.12e3" builds "0120" — the right NUMBER written the wrong way. Harmless
  // while this only fed decimal counting, but expandForDisplay puts the result on
  // screen, into redux, and (weather cells, a new column's default) into the PATCH
  // body verbatim, so it has to be cleaned here rather than left to the caller.
  //
  // Never crosses the decimal point and never empties the string: the lookahead
  // demands a DIGIT and '.' is not one, so "0.0005" comes back untouched while
  // "000000" (from "0e5") comes back as "0" and "-000000" as "-0" — the signed
  // zero isBelowMin relies on is preserved.
  return expanded.replace(/^([+-]?)0+(?=\d)/, '$1')
}

/**
 * True for the in-progress exponent states a user passes THROUGH on the way to a
 * complete number: "1e", "1e-", "1e+", "1.5E".
 *
 * Number() is NaN for every one of them, so committed-value validation calls them
 * "not a number" — which means an error flashes the instant the 'e' is typed and
 * clears again on the next keystroke. The value is not wrong, it is unfinished.
 * Callers suppress the live error while this is true and let blur (which ends the
 * typing run) surface it, so a field genuinely LEFT at "1e" still reports.
 *
 * Deliberately narrower than "Number() is NaN": "1e" is unfinished, "abc" is
 * wrong, and only the first deserves the benefit of the doubt.
 */
// ANCHORED. An unanchored /[eE][+-]?$/ never checked what came BEFORE the 'e',
// so it was true for every word ending in one — "none", "true", "Temperature",
// "apple" — and for junk like "1e5e". Where a keystroke gate runs first
// (isPartialNumericInput, in the Geometry/Materials forms and the weather cell)
// that never showed. Add Column's Default Value has no such gate, so typing
// "none" there suppressed "Default value must be a number." and left the user
// with a disabled Add button and nothing on screen explaining why.
//
// The mantissa is \d* rather than \d+ on purpose: a bare "e" (or ".e", "-e") is
// reachable by deleting the digits out of "1e" mid-edit, and it was suppressed
// before this change. Requiring a digit would start flashing an error on that
// keystroke — the exact thing this function exists to prevent — so the anchor
// only narrows the cases that caused the bug.
const INCOMPLETE_EXPONENT_PATTERN = /^[+-]?(?:\d*(?:\.\d*)?|\.\d*)[eE][+-]?$/

export function isIncompleteExponent(value: string): boolean {
  return INCOMPLETE_EXPONENT_PATTERN.test(value.trim())
}

/**
 * Blur-time DISPLAY normalizer: "1e3" -> "1000".
 *
 * Value-preserving — it changes how a number is WRITTEN, never what it is. Every
 * validator in the app funnels through Number(), and Number("1e3") is
 * Number("1000"), so a field's error state is identical before and after. That's
 * what lets callers expand on blur without re-deriving validation.
 *
 * Deliberately does NOT truncate. truncateToMaxDecimals would turn "1e-9" into
 * "0.0000000" — silently zero; expanding alone keeps the value intact so
 * exceedsMaxDecimals can flag it instead.
 *
 * Anything that isn't a COMPLETE number in exponent form comes back untouched:
 * plain decimals, "", "-", and the in-progress states above. So partial input
 * still fails on commit exactly as it does today.
 */
export function expandForDisplay(value: string): string {
  const trimmed = value.trim()
  if (!/[eE]/.test(trimmed) || !NUMERIC_PATTERN.test(trimmed)) return value
  return expandScientificNotation(trimmed) ?? value
}

/**
 * How many digits land after the decimal point once the exponent is applied,
 * derived from the exponent ARITHMETIC rather than from the expanded string.
 *
 * Counting the expansion cannot answer for "1e-999999999" — that is a billion
 * decimal places, and building the string throws RangeError. Formik's validate
 * has no .catch, so the rejection froze Add Column's error map and left the Add
 * button enabled but inert. This returns 999999999 without allocating anything.
 *
 * It also keeps two opposite failures apart. "1e-999999999" genuinely exceeds the
 * limit; "1e1000000" has ZERO decimals and is merely out of range. A "couldn't
 * expand it, call it too many decimals" fallback would put "Only 7 decimal places
 * supported" under a value with none — and because the callers below are blocking
 * keystroke gates, refuse the character too.
 *
 * Exact, not an approximation: for every value that CAN be expanded it agrees
 * with counting the expanded fraction digit for digit.
 */
function decimalPlaces(normalized: string): number {
  const match = /^[+-]?(?:\d+(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(normalized)
  if (!match) return 0
  const fraction = `${match[1] ?? ''}${match[2] ?? ''}`
  const exponent = match[3] === undefined ? 0 : Number(match[3])
  return Math.max(0, fraction.length - exponent)
}

/**
 * Check if a string value contains more than the maximum allowed decimal places
 * @param value - String representation of a number
 * @returns true if value exceeds MAX_DECIMALS, false otherwise
 */
export function exceedsMaxDecimals(value: string): boolean {
  const normalized = normalizeNumericInput(value)
  if (normalized == null || normalized === '' || normalized === '-') return false
  return decimalPlaces(normalized) > MAX_DECIMALS
}

/**
 * Get the decimal count of a numeric string
 * @param value - String representation of a number
 * @returns Number of decimal places, or 0 if no decimals
 */
export function getDecimalCount(value: string): number {
  const normalized = normalizeNumericInput(value)
  if (normalized == null || normalized === '') return 0
  return decimalPlaces(normalized)
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
