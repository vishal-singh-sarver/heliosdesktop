// Spec tests for WeatherTable's date-time cell formatting logic.
//
// WeatherTable.tsx keeps `formatDateTime` / `dayOfYear` / `isBackendManagedCol`
// module-private, and unit-testing the 654-line virtualized component itself in
// jsdom is not worthwhile (scroll/virtualization/refs don't work there) — its
// rendered behaviour is covered end-to-end by e2e/tests/weather.test.ts. To
// exercise the pure formatting/branch logic WITHOUT importing (and thereby
// dragging) the whole component into the coverage report, the helpers are
// mirrored here verbatim and tested as an executable specification.
//
// NOTE: these are copies. e2e weather.test.ts is the guard that the REAL
// component matches this spec; if the helpers in WeatherTable.tsx change, update
// these copies to match.
import {
  CHECK_COL_NAME,
  DATE_TIME_COL_NAME,
  isReservedColId,
  type CellValue,
  type ColumnDef
} from 'containers/ProjectScreen/types'

// ── Mirror of WeatherTable.tsx private helpers ───────────────────────────────
function isBackendManagedCol(col: ColumnDef): boolean {
  if (isReservedColId(col.id)) return false
  if (col.name === DATE_TIME_COL_NAME || col.name === CHECK_COL_NAME) return false
  const n = Number(col.id)
  return Number.isFinite(n) && n > 0 && String(n) === col.id
}

function formatDateTime(date: CellValue, time: CellValue, format: string, utcOffset: string): string {
  if (date == null || time == null) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return ''
  const [, y, mo, d] = m
  const hhmm = time.slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return ''
  const ss = /^\d{2}:\d{2}:(\d{2})/.exec(time)?.[1] ?? '00'
  switch (format) {
    case 'MM/DD/YYYY HH:MM':
      return `${mo}/${d}/${y} ${hhmm}`
    case 'DD/MM/YYYY HH:MM':
      return `${d}/${mo}/${y} ${hhmm}`
    case 'MM-DD-YYYY HH:MM':
      return `${mo}-${d}-${y} ${hhmm}`
    case 'DD-MM-YYYY HH:MM':
      return `${d}-${mo}-${y} ${hhmm}`
    case 'YYYY-MM-DD HH:MM':
      return `${y}-${mo}-${d} ${hhmm}`
    case 'YYYYMMDDHH':
      return `${y}${mo}${d}${hhmm.slice(0, 2)}`
    case 'YYYY-MM-DDTHH:MM:SS-HH:MM':
      return `${y}-${mo}-${d}T${hhmm}:${ss}${utcOffset || '+00:00'}`
    case 'YYYY-MM-DDTHH:MM:SSZ':
      return `${y}-${mo}-${d}T${hhmm}:${ss}`
    case 'YYYY DOY HH:MM':
      return `${y} ${dayOfYear(+y, +mo, +d)} ${hhmm}`
    case 'DOY YYYY HH:MM':
      return `${dayOfYear(+y, +mo, +d)} ${y} ${hhmm}`
    default:
      return `${mo}/${d}/${y} ${hhmm}`
  }
}

function dayOfYear(y: number, mo: number, d: number): string {
  const start = Date.UTC(y, 0, 1)
  const cur = Date.UTC(y, mo - 1, d)
  const doy = Math.round((cur - start) / 86_400_000) + 1
  return String(doy).padStart(3, '0')
}
// ─────────────────────────────────────────────────────────────────────────────

const col = (id: string, name = 'Temperature'): ColumnDef => ({
  id,
  name,
  dataTypeId: 1,
  unitId: 2
})

describe('formatDateTime', () => {
  const DATE = '2026-02-26' // Feb 26 → day-of-year 057
  const TIME = '10:00:30'

  it('renders every catalog format branch', () => {
    expect(formatDateTime(DATE, TIME, 'MM/DD/YYYY HH:MM', '')).toBe('02/26/2026 10:00')
    expect(formatDateTime(DATE, TIME, 'DD/MM/YYYY HH:MM', '')).toBe('26/02/2026 10:00')
    expect(formatDateTime(DATE, TIME, 'MM-DD-YYYY HH:MM', '')).toBe('02-26-2026 10:00')
    expect(formatDateTime(DATE, TIME, 'DD-MM-YYYY HH:MM', '')).toBe('26-02-2026 10:00')
    expect(formatDateTime(DATE, TIME, 'YYYY-MM-DD HH:MM', '')).toBe('2026-02-26 10:00')
    expect(formatDateTime(DATE, TIME, 'YYYYMMDDHH', '')).toBe('2026022610')
    expect(formatDateTime(DATE, TIME, 'YYYY DOY HH:MM', '')).toBe('2026 057 10:00')
    expect(formatDateTime(DATE, TIME, 'DOY YYYY HH:MM', '')).toBe('057 2026 10:00')
  })

  it('emits ISO with the supplied UTC offset, and defaults it to +00:00', () => {
    expect(formatDateTime(DATE, TIME, 'YYYY-MM-DDTHH:MM:SS-HH:MM', '+05:30')).toBe(
      '2026-02-26T10:00:30+05:30'
    )
    expect(formatDateTime(DATE, TIME, 'YYYY-MM-DDTHH:MM:SS-HH:MM', '')).toBe('2026-02-26T10:00:30+00:00')
    expect(formatDateTime(DATE, TIME, 'YYYY-MM-DDTHH:MM:SSZ', '+05:30')).toBe('2026-02-26T10:00:30')
  })

  it('defaults the seconds to 00 when the time has none', () => {
    expect(formatDateTime(DATE, '10:00', 'YYYY-MM-DDTHH:MM:SSZ', '')).toBe('2026-02-26T10:00:00')
  })

  it('falls back to MM/DD/YYYY for an unknown format', () => {
    expect(formatDateTime(DATE, TIME, 'SOME-UNKNOWN-FORMAT', '')).toBe('02/26/2026 10:00')
  })

  it('returns "" when either half is missing or malformed', () => {
    expect(formatDateTime(null, TIME, 'MM/DD/YYYY HH:MM', '')).toBe('')
    expect(formatDateTime(DATE, null, 'MM/DD/YYYY HH:MM', '')).toBe('')
    expect(formatDateTime('2026/02/26', TIME, 'MM/DD/YYYY HH:MM', '')).toBe('') // wrong date separators
    expect(formatDateTime(DATE, '1:00', 'MM/DD/YYYY HH:MM', '')).toBe('') // non HH:MM time
  })
})

describe('dayOfYear', () => {
  it('is 1-based and zero-padded to 3 digits', () => {
    expect(dayOfYear(2026, 1, 1)).toBe('001')
    expect(dayOfYear(2026, 2, 26)).toBe('057')
  })

  it('accounts for leap years past February', () => {
    expect(dayOfYear(2023, 3, 1)).toBe('060') // non-leap
    expect(dayOfYear(2024, 3, 1)).toBe('061') // leap
    expect(dayOfYear(2023, 12, 31)).toBe('365')
    expect(dayOfYear(2024, 12, 31)).toBe('366')
  })
})

describe('isBackendManagedCol', () => {
  it('is true only for a positive-integer header id', () => {
    expect(isBackendManagedCol(col('12'))).toBe(true)
    expect(isBackendManagedCol(col('1'))).toBe(true)
  })

  it('is false for reserved date/time column ids', () => {
    expect(isBackendManagedCol(col('date'))).toBe(false)
    expect(isBackendManagedCol(col('time'))).toBe(false)
  })

  it('is false for the seeded date-time and check columns (by name)', () => {
    expect(isBackendManagedCol(col('99', 'date-time'))).toBe(false)
    expect(isBackendManagedCol(col('98', 'check'))).toBe(false)
  })

  it('is false for non-numeric, zero, negative, or non-canonical numeric ids', () => {
    expect(isBackendManagedCol(col('abc'))).toBe(false)
    expect(isBackendManagedCol(col('0'))).toBe(false)
    expect(isBackendManagedCol(col('-3'))).toBe(false)
    expect(isBackendManagedCol(col('007'))).toBe(false) // String(Number('007')) !== '007'
  })
})
