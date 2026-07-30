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
 * Excluded: `check` (no units) and `date_time` (format "units", null ranges)
 * can't be range-tested at all. Per rangeable type we sweep the base + ONE
 * alternate unit; the remaining catalog units are simply not swept (e.g. Wh/m^2,
 * kWh/m^2/day, umol/m^2/s for radiation; hPa/atm/bar/mmHg for pressure). The one
 * unit that CANNOT be range-tested is air_CO2 `ppb` (max 3,000,000): an above-max
 * value exceeds the global +/-1e6 keystroke bound, so it would surface the global
 * message instead of the unit message.
 */
import ProjectScreen from '../pages/ProjectScreen.page'
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
// The column the current `it` created — deleted in afterEach so the shared
// project never accumulates enough columns to scroll a picker under the panel.
let currentColId: string | null = null

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

/**
 * Snapshot everything that explains a validation-assert failure, in ONE DOM read.
 *
 * These assertions fail intermittently (see the unit-conversion race noted at
 * the alt-unit switch below), and a bare "never showed X" message says nothing
 * about WHY. wdio's timeoutMsg is a static string built before the wait, so the
 * state has to be captured after the fact and appended to the error.
 *
 * The decisive fields are `value` (did the conversion overwrite our probe?) and
 * `invalid` vs `tip` (did the flag and the tooltip disagree?).
 */
async function cellDiagnostic(colId: string): Promise<string> {
  try {
    const snap = await browser.execute((cellLabel: string) => {
      const input = document.querySelector(`[aria-label="${cellLabel}"]`) as HTMLInputElement | null
      if (!input) return JSON.stringify({ error: 'cell input not in DOM' })
      const tip = input.parentElement?.querySelector('[aria-label^="Validation error:"]')
      return JSON.stringify({
        value: input.value,
        invalid: input.getAttribute('aria-invalid'),
        tip: tip?.getAttribute('aria-label') ?? null
      })
    }, `${SHARED_ROW} ${colId}`)
    return snap
  } catch (err) {
    return `(diagnostic read failed: ${(err as Error).message})`
  }
}

/** Re-throw a wait failure with the cell's live state appended. */
async function withCellDiagnostic<T>(colId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const state = await cellDiagnostic(colId)
    const header = await Weather.headerPickerLabel(colId).catch(() => '(header read failed)')
    throw new Error(
      `${(err as Error).message}\n  cell state at failure: ${state}\n  header unit: ${header}`
    )
  }
}

/** Set a cell and assert it flags aria-invalid with the EXACT unit message. */
async function assertOutOfRange(colId: string, value: number, message: string): Promise<void> {
  await Weather.setReactInput(`[aria-label="${SHARED_ROW} ${colId}"]`, String(value))
  // Wait for the EXACT thing we assert (the tooltip message), not the
  // aria-invalid proxy: the flag flips a render-tick before the tooltip mounts,
  // so "wait for flag, then read message once" races the render (observed
  // air_humidity flake — message read back null).
  await withCellDiagnostic(colId, () =>
    browser.waitUntil(async () => (await Weather.cellError(SHARED_ROW, colId)) === message, {
      timeout: 10000,
      timeoutMsg: `cell[${colId}] never showed "${message}" for out-of-range ${value}`
    })
  )
  expect(await Weather.cellInvalid(SHARED_ROW, colId)).toBe('true')
}

/** Set an in-range value and assert the flag clears (no false positive). */
async function assertInRange(colId: string, value: number): Promise<void> {
  await Weather.setReactInput(`[aria-label="${SHARED_ROW} ${colId}"]`, String(value))
  // Same discipline as assertOutOfRange: wait until the tooltip is GONE (the
  // asserted condition), then confirm the flag cleared with it.
  await withCellDiagnostic(colId, () =>
    browser.waitUntil(async () => (await Weather.cellError(SHARED_ROW, colId)) === null, {
      timeout: 10000,
      timeoutMsg: `in-range ${value} did not clear the validation message on ${colId}`
    })
  )
  expect(await Weather.cellInvalid(SHARED_ROW, colId)).toBe(null)
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
    // M2 wraps the workspace in tabs (default "3D Window"); activate Weather.
    await ProjectScreen.selectTab('weather')
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
    // One shared row set is enough — each type edits row 0 of its own column.
    await Weather.addRows(3)
    const rows = await Weather.visibleRowIds()
    SHARED_ROW = rows[0]
  })

  afterEach(async () => {
    // Delete the column this test created so the table stays small and every
    // fresh column's picker/listbox renders in the clickable-left zone.
    if (currentColId) {
      await browser.keys(['Escape']).catch(() => {})
      await Weather.deleteColumn(currentColId).catch(() => {})
      currentColId = null
    }
  })

  for (const t of TYPES) {
    const title = t.alt
      ? `${t.dataType}: is_base auto-selects, then base + alt unit ranges validate`
      : `${t.dataType}: is_base auto-selects, then base unit range validates`
    it(title, async function () {
      this.timeout(90000)
      // A failed before() leaves SHARED_ROW empty; skip cleanly instead of
      // timing out on a selector that can never match.
      if (!SHARED_ROW) this.skip()

      // Add the column with ONLY the data type -> the is_base unit auto-selects.
      const { colId, unitId } = await addTypedColumn(t.col, t.dataType)
      currentColId = colId
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
        // The header label is NOT enough to start probing. A unit-only change
        // runs updateColumnWorker -> buildConvertedColumnValues, which REWRITES
        // every cell in the column (the last base-unit probe value gets scaled,
        // e.g. -1 W/m^2 -> -0.001 kW/m^2), then PATCHes, then revalidates. The
        // header flips on the optimistic reducer write at the START of that
        // sequence, so probing here raced the conversion: assertOutOfRange's
        // value landed and was immediately overwritten by the converted value,
        // leaving the cell showing no error and the waitUntil timing out.
        //
        // Settle on the cell instead: park a known IN-RANGE value for the NEW
        // unit and wait for the error to clear. That can only hold once the
        // conversion has been applied and revalidateColumn has run against the
        // new unit, so the subsequent probes start from a quiet cell.
        await assertInRange(colId, alt.inRange)
        await exerciseUnit(colId, t.alt)
      }
    })
  }
})
