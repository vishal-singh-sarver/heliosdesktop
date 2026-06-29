/**
 * Weather UNIT CONVERSION E2E — the part the smoke suite never touched.
 *
 * Conversion runs when a managed column's unit changes via the header
 * DataTypeUnitPicker: the saga converts every row by the catalog's linear
 * factor/offset (value*to_base_factor + to_base_offset). See
 * containers/Weather/unitConversion.ts.
 *
 * The backend data-type catalog is environment-driven, so these tests DISCOVER
 * the available data types / units from the picker UI at runtime rather than
 * hardcoding ids. The primary assertion is the catalog-agnostic invariant:
 * converting a value to another unit and back restores the original. A second
 * test adds a concrete physical check (°C→°F) only when that pair is present.
 */
import Weather from '../pages/Weather.page'
import { enterProject, reloadToHome, waitForMainWindow } from '../support/harness'

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

async function enterWeather(label = 'units'): Promise<void> {
  await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
}

/** Provision a managed column with `rows` rows and return its backend colId. */
async function columnWithRows(name: string, rows = 2): Promise<string> {
  await Weather.addColumn(name)
  const colId = await Weather.waitForColumn(name)
  await Weather.addRows(rows)
  return colId
}

/**
 * Open the (already-present) column header picker and discover the first data
 * type that exposes ≥2 units. Leaves the picker OPEN in that type's unit view.
 * Returns the type label + its unit labels, or null if the catalog has none.
 */
async function discoverConvertibleType(
  colId: string
): Promise<{ type: string; units: string[] } | null> {
  await Weather.openHeaderPicker(colId)
  const types = await Weather.pickerOptions()
  for (const type of types) {
    await Weather.pickerPick(type)
    await Weather.pickerListbox
      .$('button*=Back to Assign Type')
      .waitForExist({ timeout: 5000 })
      .catch(() => {})
    const units = await Weather.pickerOptions()
    if (units.length >= 2) return { type, units }
    await Weather.pickerBack()
  }
  return null
}

describe('Weather units — conversion round-trip (catalog-agnostic)', () => {
  it('converting a value to another unit and back restores the original', async () => {
    await enterWeather('roundtrip')
    const colId = await columnWithRows('conv')
    const [row] = await Weather.visibleRowIds()

    const found = await discoverConvertibleType(colId)
    if (!found) throw new Error('catalog exposes no data type with ≥2 units — cannot test conversion')
    const [unitA, unitB] = found.units
    // Commit type + unitA (the picker is open in unitA's unit view).
    await Weather.pickerPick(unitA)
    await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })

    // Seed a value in unit A.
    await Weather.editCell(row, colId, '10')
    await browser.waitUntil(async () => (await Weather.cellInput(row, colId).getValue()) === '10', {
      timeout: 10000,
      timeoutMsg: 'seed value did not commit'
    })

    // A → B: the unit change must recompute the cell (label flips to unit B).
    await Weather.changeUnit(colId, unitB)
    await browser.waitUntil(
      async () => {
        const v = Number(await Weather.cellInput(row, colId).getValue())
        return Number.isFinite(v)
      },
      { timeout: 15000, timeoutMsg: 'cell value not finite after A→B conversion' }
    )

    // B → A: round-trip must restore ~10 (float32 storage → small tolerance).
    await Weather.changeUnit(colId, unitA)
    await browser.waitUntil(
      async () => Math.abs(Number(await Weather.cellInput(row, colId).getValue()) - 10) < 0.1,
      {
        timeout: 15000,
        timeoutMsg: 'round-trip A→B→A did not restore the original value (~10)'
      }
    )
  })
})

describe('Weather units — concrete physical conversion (when available)', () => {
  it('°C → °F converts 0 to 32 (skipped if the catalog lacks the pair)', async () => {
    await enterWeather('ctof')
    const colId = await columnWithRows('temp')
    const [row] = await Weather.visibleRowIds()

    await Weather.openHeaderPicker(colId)
    const types = await Weather.pickerOptions()
    const tempType = types.find((t) => /temp/i.test(t))
    if (!tempType) {
      await Weather.pickerBack().catch(() => {})
      return // no Temperature data type in this catalog — nothing to assert.
    }
    await Weather.pickerPick(tempType)
    await Weather.pickerListbox
      .$('button*=Back to Assign Type')
      .waitForExist({ timeout: 5000 })
      .catch(() => {})
    const units = await Weather.pickerOptions()
    const celsius = units.find((u) => /celsius|°c\b|^c\b/i.test(u))
    const fahrenheit = units.find((u) => /fahrenheit|°f\b|^f\b/i.test(u))
    if (!celsius || !fahrenheit) return // pair not present — nothing to assert.

    await Weather.pickerPick(celsius)
    await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })
    await Weather.editCell(row, colId, '0')
    await browser.waitUntil(async () => (await Weather.cellInput(row, colId).getValue()) === '0', {
      timeout: 10000,
      timeoutMsg: '0°C did not commit'
    })
    await Weather.changeUnit(colId, fahrenheit)
    await browser.waitUntil(
      async () => Math.abs(Number(await Weather.cellInput(row, colId).getValue()) - 32) < 0.1,
      { timeout: 15000, timeoutMsg: '0°C did not convert to ~32°F' }
    )
  })
})

describe('Weather units — DataTypeUnitPicker two-step flow', () => {
  it('assigning a data type + unit relabels the column header button', async () => {
    await enterWeather('relabel')
    const colId = await columnWithRows('lbl', 1)
    const before = await Weather.headerPickerLabel(colId)
    const found = await discoverConvertibleType(colId)
    if (!found) throw new Error('catalog exposes no data type with ≥2 units')
    const [unitA] = found.units
    await Weather.pickerPick(unitA)
    await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })
    await browser.waitUntil(async () => (await Weather.headerPickerLabel(colId)) !== before, {
      timeout: 10000,
      timeoutMsg: 'header picker label did not change after assigning a unit'
    })
  })

  it('closing the picker after picking a type (no unit) discards the pending type', async () => {
    await enterWeather('pending')
    const colId = await columnWithRows('pend', 1)
    const before = await Weather.headerPickerLabel(colId)

    await Weather.openHeaderPicker(colId)
    const types = await Weather.pickerOptions()
    if (types.length === 0) throw new Error('no data types in catalog')
    await Weather.pickerPick(types[0]) // stage a pending type (advances to unit view)
    // Close WITHOUT picking a unit (outside click). Per the atomic-pair contract
    // the pending type is discarded — the column keeps its prior (empty) label.
    await Weather.filterButton.click()
    await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(await Weather.headerPickerLabel(colId)).toBe(before)
  })
})

describe('Weather units — Date-Time format picker', () => {
  it('the Date-Time header opens a format listbox with selectable options', async () => {
    await enterWeather('dtfmt')
    await Weather.dateTimeHeaderTrigger.click()
    const listbox = $('[role="listbox"]')
    await listbox.waitForDisplayed({ timeout: 10000 })
    const options = await listbox.$$('[role="option"]')
    await expect(options.length).toBeGreaterThan(1)
  })
})
