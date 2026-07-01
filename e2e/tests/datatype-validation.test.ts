/**
 * Data-type / unit RANGE-VALIDATION sweep. For every rangeable catalog data
 * type: assign it to a fresh managed column, assert the is_base unit
 * auto-selects (the "default unit" check), then drive below-min / above-max /
 * in-range values against the base unit AND one alternate unit, asserting the
 * EXACT message the app surfaces (validation.ts formatRangeMessage).
 *
 * Ranges are HARDCODED from GET /api/data-types/ so a silent backend range
 * change goes red (independent oracle). One shared project + addRows(3): cell
 * validation is pure client-side (validateCellValue on the change event), so
 * setReactInput never blurs -> no backend PATCH -> fast and isolated per column.
 *
 * Excluded (can't be range-tested the same way): `check` (no units), `date_time`
 * (null ranges), and large-scale units (air_CO2 ppb max 3e6, Wh/m^2) whose
 * out-of-range value exceeds the global +/-1e6 keystroke bound and would hit the
 * global message, not the unit message.
 */
import Weather from '../pages/Weather.page'
import { enterProject, waitForBackendReady, waitForMainWindow } from '../support/harness'

/** One unit's range + the concrete literals the loop drives and asserts. */
interface UnitCase {
  /** Unit token as the header picker / dialog renders it (e.g. 'K', 'W/m^2'). */
  unit: string
  /** Backend unit id (is_base id for `base`). */
  unitId: number
  /** Below-min probe (omitted when the unit has no min). */
  below?: number
  /** Above-max probe (omitted when the unit has no max). */
  above?: number
  /** A value inside the range (no-false-positive guard). */
  inRange: number
  /** Exact validation message for an out-of-range value in THIS unit. */
  message: string
}

interface TypeCase {
  /** Raw catalog data_type string (rendered verbatim by picker + <select>). */
  dataType: string
  /** Managed-column name (<= 30 chars). */
  col: string
  base: UnitCase
  /** null when the type has a single unit (skip the alternate step). */
  alt: UnitCase | null
}

// Hardcoded from the provided GET /api/data-types/ response. Every below/above
// probe is a clean number within +/-1e6 and <= 7 decimals.
const TYPES: TypeCase[] = [
  {
    dataType: 'direct_horizontal_radiation_flux',
    col: 'rad_dir',
    base: { unit: 'W/m^2', unitId: 1, below: -1, above: 1501, inRange: 750, message: 'Value should be between 0 and 1500' },
    alt: { unit: 'kW/m^2', unitId: 2, below: -1, above: 2, inRange: 0.75, message: 'Value should be between 0 and 1.5' }
  },
  {
    dataType: 'diffuse_horizontal_radiation_flux',
    col: 'rad_dif',
    base: { unit: 'W/m^2', unitId: 3, below: -1, above: 1501, inRange: 750, message: 'Value should be between 0 and 1500' },
    alt: { unit: 'kW/m^2', unitId: 4, below: -1, above: 2, inRange: 0.75, message: 'Value should be between 0 and 1.5' }
  },
  {
    dataType: 'air_temperature',
    col: 'temp',
    base: { unit: 'K', unitId: 5, below: 222, above: 351, inRange: 286, message: 'Value should be between 223 and 350' },
    alt: { unit: 'C', unitId: 6, below: -51, above: 78, inRange: 13, message: 'Value should be between -50.15 and 76.85' }
  },
  {
    dataType: 'air_pressure',
    col: 'press',
    base: { unit: 'Pa', unitId: 8, below: 86999, above: 150001, inRange: 118500, message: 'Value should be between 87000 and 150000' },
    alt: { unit: 'kPa', unitId: 10, below: 86, above: 151, inRange: 118, message: 'Value should be between 87 and 150' }
  },
  {
    dataType: 'air_humidity',
    col: 'humid',
    base: { unit: '0-1', unitId: 14, below: -1, above: 2, inRange: 0.5, message: 'Value should be between 0 and 1' },
    alt: { unit: '0-100', unitId: 15, below: -1, above: 101, inRange: 50, message: 'Value should be between 0 and 100' }
  },
  {
    dataType: 'wind_speed',
    col: 'wind',
    base: { unit: 'm/s', unitId: 16, below: -1, above: 61, inRange: 30, message: 'Value should be between 0 and 60' },
    alt: { unit: 'km/h', unitId: 17, below: -1, above: 217, inRange: 108, message: 'Value should be between 0 and 216' }
  },
  {
    dataType: 'turbidity',
    col: 'turb',
    base: { unit: '0-1', unitId: 21, below: -1, above: 2, inRange: 0.5, message: 'Value should be between 0 and 1' },
    // min-only (max is null) -> only the below-min probe applies; message uses >=.
    alt: { unit: '>1', unitId: 22, below: 0, inRange: 5, message: 'Values should be ≥ 1' }
  },
  {
    dataType: 'beta_soil',
    col: 'soil',
    base: { unit: '0-1', unitId: 23, below: -1, above: 2, inRange: 0.5, message: 'Value should be between 0 and 1' },
    alt: null
  },
  {
    dataType: 'air_CO2',
    col: 'co2',
    base: { unit: 'ppm', unitId: 24, below: -1, above: 3001, inRange: 1500, message: 'Value should be between 0 and 3000' },
    // max-only (min is null) -> only the above-max probe applies; message uses <=.
    alt: { unit: 'kg/m³', unitId: 26, above: 1, inRange: 0.001, message: 'Values should be ≤ 0.005894' }
  }
]

/** Strip the header picker's decorative caret so the label compares to a token. */
const norm = (s: string): string => s.replace(/▾/g, '').trim()

let SHARED_ROW = ''

/**
 * Add a managed column choosing ONLY the data type, so the base (is_base) unit
 * auto-selects. Returns the new column's colId and the auto-selected unitId
 * (read from the dialog's unit <select> before submit).
 */
async function addTypedColumn(name: string, dataType: string): Promise<{ colId: string; unitId: string }> {
  await Weather.openAddColumns()
  await Weather.setReactInput('[data-testid="input-parameterName"]', name)
  await Weather.acDataType.selectByVisibleText(dataType)
  await browser.waitUntil(async () => (await Weather.acUnit.getValue()) !== '', {
    timeout: 10000,
    timeoutMsg: `data type "${dataType}" did not auto-select a unit`
  })
  const unitId = await Weather.acUnit.getValue()
  await Weather.acSubmit.click()
  await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
  const colId = await Weather.waitForColumn(name)
  return { colId, unitId }
}

/** Set a cell and assert it flags aria-invalid with the EXACT unit message. */
async function assertOutOfRange(colId: string, value: number, message: string): Promise<void> {
  await Weather.setReactInput(`[aria-label="${SHARED_ROW} ${colId}"]`, String(value))
  await browser.waitUntil(async () => (await Weather.cellInvalid(SHARED_ROW, colId)) === 'true', {
    timeout: 10000,
    timeoutMsg: `cell[${colId}] never became aria-invalid for out-of-range ${value}`
  })
  expect(await Weather.cellError(SHARED_ROW, colId)).toBe(message)
}

/** Set an in-range value and assert the flag clears (no false positive). */
async function assertInRange(colId: string, value: number): Promise<void> {
  await Weather.setReactInput(`[aria-label="${SHARED_ROW} ${colId}"]`, String(value))
  await browser.waitUntil(async () => (await Weather.cellInvalid(SHARED_ROW, colId)) === null, {
    timeout: 10000,
    timeoutMsg: `in-range ${value} did not clear aria-invalid on ${colId}`
  })
  expect(await Weather.cellError(SHARED_ROW, colId)).toBe(null)
}

/** Drive the below/above probes (whichever the unit has) + the in-range guard. */
async function exerciseUnit(colId: string, u: UnitCase): Promise<void> {
  if (u.below != null) await assertOutOfRange(colId, u.below, u.message)
  if (u.above != null) await assertOutOfRange(colId, u.above, u.message)
  await assertInRange(colId, u.inRange)
}

describe('Weather data types — per-type range validation sweep', () => {
  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
    await enterProject('dtvalid')
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
    // One shared row set is enough — each type edits row 0 of its own column.
    await Weather.addRows(3)
    const rows = await Weather.visibleRowIds()
    SHARED_ROW = rows[0]
  })

  for (const t of TYPES) {
    it(`${t.dataType}: is_base auto-selects, then base + alt unit ranges validate`, async function () {
      this.timeout(60000)

      // Add the column with ONLY the data type -> the is_base unit auto-selects.
      const { colId, unitId } = await addTypedColumn(t.col, t.dataType)
      // Default-unit check: the dialog auto-selected the catalog is_base unit id.
      expect(unitId).toBe(String(t.base.unitId))
      // ...and the header now shows that base unit's token.
      expect(norm(await Weather.headerPickerLabel(colId))).toBe(t.base.unit)

      // Base-unit range validation (exact messages from the backend bounds).
      await exerciseUnit(colId, t.base)

      // Alternate unit: switching re-derives a DIFFERENT range + message.
      if (t.alt) {
        const alt = t.alt
        await Weather.changeUnit(colId, t.alt.unit)
        await browser.waitUntil(
          async () => norm(await Weather.headerPickerLabel(colId)) === alt.unit,
          { timeout: 10000, timeoutMsg: `unit did not change to ${alt.unit}` }
        )
        await exerciseUnit(colId, t.alt)
      }
    })
  }
})
