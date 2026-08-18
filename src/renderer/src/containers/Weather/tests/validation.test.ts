import type { ColumnDef, DataTypeDef } from 'containers/ProjectScreen/types'
import { validateCellValue } from '../validation'

// Build a minimal DataTypeDef list shaped like the wire response. Fields not
// touched by the validator are filled with cheap defaults so the fixture
// doesn't drift if the type grows.
function makeDataTypes(): DataTypeDef[] {
  return [
    {
      id: 1,
      data_type: 'Temperature',
      description: '',
      created_at: '',
      updated_at: '',
      units: [
        {
          id: 10,
          unit: 'C',
          alias: '°C',
          data_type_id: 1,
          min: -50,
          max: 50,
          to_base_factor: 1,
          to_base_offset: 0,
          is_base: true,
          created_at: '',
          updated_at: ''
        },
        {
          id: 11,
          unit: 'K',
          alias: '',
          data_type_id: 1,
          min: 0,
          max: null,
          to_base_factor: 1,
          to_base_offset: -273.15,
          is_base: false,
          created_at: '',
          updated_at: ''
        },
        {
          id: 12,
          unit: 'pct',
          alias: '%',
          data_type_id: 1,
          min: null,
          max: 100,
          to_base_factor: 1,
          to_base_offset: 0,
          is_base: false,
          created_at: '',
          updated_at: ''
        },
        {
          id: 13,
          unit: 'free',
          alias: 'free',
          data_type_id: 1,
          min: null,
          max: null,
          to_base_factor: 1,
          to_base_offset: 0,
          is_base: false,
          created_at: '',
          updated_at: ''
        }
      ]
    }
  ]
}

const baseCol: ColumnDef = {
  id: 'temp',
  name: 'Temperature',
  dataTypeId: 1,
  unitId: 10
}

describe('validateCellValue', () => {
  // ── Empty / unconfigured cases — short-circuit to null ────────────────────

  it('returns null for an empty value', () => {
    expect(validateCellValue('', { col: baseCol, dataTypes: makeDataTypes() })).toBeNull()
  })

  it('returns null for whitespace-only value (treated as empty)', () => {
    expect(validateCellValue('   ', { col: baseCol, dataTypes: makeDataTypes() })).toBeNull()
  })

  it('returns null when column has no dataTypeId', () => {
    const col = { ...baseCol, dataTypeId: null }
    expect(validateCellValue('999', { col, dataTypes: makeDataTypes() })).toBeNull()
  })

  it('returns null when column has no unitId', () => {
    const col = { ...baseCol, unitId: null }
    expect(validateCellValue('999', { col, dataTypes: makeDataTypes() })).toBeNull()
  })

  // ── No-unit branch: still rejects non-numeric / out-of-bound input ────────

  it('flags non-numeric input even when the column has no unit', () => {
    const col = { ...baseCol, unitId: null }
    expect(validateCellValue('2.2.2.2.222', { col, dataTypes: makeDataTypes() })).toBe(
      'Value must be a number'
    )
  })

  it('flags a dangling sign (NaN) when the column has no unit', () => {
    const col = { ...baseCol, dataTypeId: null }
    expect(validateCellValue('-', { col, dataTypes: makeDataTypes() })).toBe('Value must be a number')
  })

  it('flags a number beyond ±1e6 when the column has no unit', () => {
    const col = { ...baseCol, unitId: null }
    expect(validateCellValue('2000000', { col, dataTypes: makeDataTypes() })).toBe(
      'Value should be between -1000000 and 1000000.'
    )
  })

  it('returns null when dataType id does not exist in catalog', () => {
    const col = { ...baseCol, dataTypeId: 999 }
    expect(validateCellValue('5', { col, dataTypes: makeDataTypes() })).toBeNull()
  })

  it('returns null when unit id does not exist in catalog', () => {
    const col = { ...baseCol, unitId: 999 }
    expect(validateCellValue('5', { col, dataTypes: makeDataTypes() })).toBeNull()
  })

  it('returns null when the unit has neither min nor max', () => {
    const col = { ...baseCol, unitId: 13 }
    expect(validateCellValue('999', { col, dataTypes: makeDataTypes() })).toBeNull()
  })

  // ── NaN / non-numeric input ──────────────────────────────────────────────

  it('flags non-numeric input with an alias-led message', () => {
    expect(validateCellValue('abc', { col: baseCol, dataTypes: makeDataTypes() })).toBe(
      '°C must be a number'
    )
  })

  it('falls back to raw unit string when alias is missing', () => {
    const col = { ...baseCol, unitId: 11 }
    expect(validateCellValue('abc', { col, dataTypes: makeDataTypes() })).toBe('K must be a number')
  })

  // ── Bounded ranges ───────────────────────────────────────────────────────

  it('returns null when value is within both min and max', () => {
    expect(validateCellValue('25', { col: baseCol, dataTypes: makeDataTypes() })).toBeNull()
  })

  it('returns null at the lower bound (inclusive)', () => {
    expect(validateCellValue('-50', { col: baseCol, dataTypes: makeDataTypes() })).toBeNull()
  })

  it('returns null at the upper bound (inclusive)', () => {
    expect(validateCellValue('50', { col: baseCol, dataTypes: makeDataTypes() })).toBeNull()
  })

  it('flags value below min with the two-sided range message', () => {
    expect(validateCellValue('-100', { col: baseCol, dataTypes: makeDataTypes() })).toBe(
      'Value should be between -50 and 50'
    )
  })

  it('flags value above max with the two-sided range message', () => {
    expect(validateCellValue('100', { col: baseCol, dataTypes: makeDataTypes() })).toBe(
      'Value should be between -50 and 50'
    )
  })

  // ── Global ±1e6 bound wins even while a unit is configured ────────────────

  it('flags a value beyond +1e6 with the global message even when a unit is configured', () => {
    // baseCol has unit 10 (min -50, max 50). The global hard bound is checked
    // before the unit range, so its message wins over the unit-range message.
    expect(validateCellValue('2000000', { col: baseCol, dataTypes: makeDataTypes() })).toBe(
      'Value should be between -1000000 and 1000000.'
    )
  })

  it('flags a value below -1e6 with the global message even when a unit is configured', () => {
    expect(validateCellValue('-2000000', { col: baseCol, dataTypes: makeDataTypes() })).toBe(
      'Value should be between -1000000 and 1000000.'
    )
  })

  // ── One-sided ranges ─────────────────────────────────────────────────────

  it('uses ≥ format when only min is set', () => {
    const col = { ...baseCol, unitId: 11 }
    expect(validateCellValue('-1', { col, dataTypes: makeDataTypes() })).toBe('Values should be ≥ 0')
  })

  it('returns null when value is at or above min and there is no max', () => {
    const col = { ...baseCol, unitId: 11 }
    expect(validateCellValue('999', { col, dataTypes: makeDataTypes() })).toBeNull()
  })

  it('uses ≤ format when only max is set', () => {
    const col = { ...baseCol, unitId: 12 }
    expect(validateCellValue('150', { col, dataTypes: makeDataTypes() })).toBe(
      'Values should be ≤ 100'
    )
  })

  it('returns null when value is at or below max and there is no min', () => {
    const col = { ...baseCol, unitId: 12 }
    expect(validateCellValue('-50', { col, dataTypes: makeDataTypes() })).toBeNull()
  })

  // ── Whitespace handling — values are trimmed before parsing ──────────────

  it('trims surrounding whitespace before parsing', () => {
    expect(validateCellValue('  25  ', { col: baseCol, dataTypes: makeDataTypes() })).toBeNull()
  })
})
