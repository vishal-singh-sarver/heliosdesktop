/**
 * Shared test data: coordinate seeds, validation boundaries, and numeric limits.
 * Replaces the magic coordinates/lengths/bounds that were repeated inline across
 * the HomePage, ProjectScreen and Weather specs.
 */

/** Default valid create-project coordinates (used by most provisioning flows). */
export const DEFAULT_COORDS = { lat: '12.34', lon: '56.78' } as const

/** Client-side coordinate validation boundaries. */
export const COORD_LIMITS = {
  LAT_MAX: '90',
  LAT_MIN: '-90',
  LAT_OVER: '91',
  LAT_UNDER: '-91',
  LON_MAX: '180',
  LON_MIN: '-180',
  LON_OVER: '181',
  LON_UNDER: '-181',
  MAX_DECIMALS: 7,
  /** In-range values carrying exactly 7 / 8 decimals (decimals-boundary tests). */
  LAT_7_DECIMALS: '89.1234567',
  LON_7_DECIMALS: '179.1234567',
  LAT_8_DECIMALS: '12.12345678'
} as const

/** Project-name length boundary. */
export const NAME_LIMITS = {
  MAX: 30,
  valid: 'a'.repeat(30),
  tooLong: 'a'.repeat(31)
} as const

/** Weather Add-Column / Add-Rows numeric bounds (mirror the app's schema). */
export const WEATHER_LIMITS = {
  COLUMN_NAME_MAX: 30,
  ROWS_MAX: 10_000,
  DELTA_HOURS_MAX: 24,
  CELL_DECIMALS_MAX: 7,
  /** Global cell value bound: |value| must be <= 1e6. */
  GLOBAL_CELL_BOUND: 1_000_000
} as const

/** Non-matching search terms used to force an empty project list. */
export const NO_MATCH_SEARCH = 'zzzqqq___nomatch'
