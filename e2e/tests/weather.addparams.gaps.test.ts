/**
 * Weather Add-Parameters / Add-Column GAP coverage — the cases the existing
 * weather.crud / weather.table / weather.import specs never reach.
 *
 * Built strictly against the REAL app behavior (AddColumnDialog.tsx +
 * DataTypeUnitPicker.tsx + the shared FormField/Dialog components):
 *  - The app enforces a SINGLE generic numeric bound (±1e6) + a 7-decimal limit
 *    on the default value (NOT per-parameter physical ranges) — see
 *    AddColumnDialog.validate / validation.ts. So per-parameter range cases
 *    (temp/radiation/pressure/humidity/wind/CO2/soil/turbidity) are out of scope.
 *  - Invalid-default error UI: FormField renders a red outline + aria-invalid on
 *    the input and a <p data-testid="error-defaultValue" role="alert"> with the
 *    message text. The literal word "Invalid" is NEVER rendered.
 *  - Dialog (native <dialog> showModal) closes on Esc (onCancel -> onClose), on
 *    the × (data-testid="dialog-close") and on Cancel. Backdrop click does NOT
 *    close it (no handler), so that is not asserted here.
 *  - Column name: required + max-30-chars (client) + backend uniqueness only —
 *    no char-class restriction (special chars accepted) and leading/trailing
 *    whitespace is trimmed before submit.
 *
 * Preamble/imports/beforeEach copied from the sibling weather specs, including
 * the local enterWeather() helper they each define at the top.
 */
import Weather from '../pages/Weather.page'
import { enterProject, reloadToHome, stubFileImport, waitForMainWindow } from '../support/harness'

const IMPORT_CSV = [
  'datetime,temperature',
  '2026-01-01T00:00:00Z,10',
  '2026-01-01T01:00:00Z,11'
].join('\n')

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

async function enterWeather(label = 'addparams'): Promise<{ id: string; name: string }> {
  const project = await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
  return project
}

describe('Weather add-column — invalid default error UI (AP15 / AP2 / AP30)', () => {
  it('a non-numeric default marks the field aria-invalid and shows the number error', async () => {
    await enterWeather('ap15num')
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'x')
    await Weather.setReactInput('[data-testid="input-defaultValue"]', 'abc')
    await Weather.acDefaultError.waitForDisplayed({ timeout: 10000 })
    await expect(Weather.acDefaultError).toHaveText('Default value must be a number.')
    // The field carries aria-invalid=true (FormField red-outline branch); submit disabled.
    await expect(Weather.acDefault).toHaveAttribute('aria-invalid', 'true')
    await expect(await Weather.acSubmit.isEnabled()).toBe(false)
    // The literal word "Invalid" is never rendered.
    await expect(await Weather.acDefaultError.getText()).not.toContain('Invalid')
  })

  it('a symbol-only default is rejected as non-numeric (AP30)', async () => {
    await enterWeather('ap30sym')
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'x')
    await Weather.setReactInput('[data-testid="input-defaultValue"]', '$%@')
    await Weather.acDefaultError.waitForDisplayed({ timeout: 10000 })
    await expect(Weather.acDefaultError).toHaveText('Default value must be a number.')
    await expect(Weather.acDefault).toHaveAttribute('aria-invalid', 'true')
    await expect(await Weather.acSubmit.isEnabled()).toBe(false)
  })

  it('a default beyond the 7-decimal limit shows the decimal error and disables submit', async () => {
    await enterWeather('ap15dec')
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'x')
    await Weather.setReactInput('[data-testid="input-defaultValue"]', '1.12345678')
    await Weather.acDefaultError.waitForDisplayed({ timeout: 10000 })
    await expect(Weather.acDefaultError).toHaveText(
      'Default value can have at most 7 decimal places.'
    )
    await expect(Weather.acDefault).toHaveAttribute('aria-invalid', 'true')
    await expect(await Weather.acSubmit.isEnabled()).toBe(false)
  })
})

describe('Weather add-column — default value back-fill (AP20)', () => {
  it('adding a column WITHOUT a default leaves existing rows empty', async () => {
    await enterWeather('ap20empty')
    await Weather.addRows(2)
    await Weather.addColumn('nodefault')
    const colId = await Weather.waitForColumn('nodefault')
    // With no default, the saga back-fills nothing -> every cell renders empty.
    const ids = await Weather.visibleRowIds()
    for (const rowId of ids) {
      await expect(Weather.cellInput(rowId, colId)).toHaveValue('')
    }
  })
})

describe('Weather add-column — dialog close behavior (AP31)', () => {
  it('Escape closes the dialog', async () => {
    await enterWeather('ap31esc')
    await Weather.openAddColumns()
    await browser.keys(['Escape'])
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('the × button closes the dialog', async () => {
    await enterWeather('ap31x')
    await Weather.openAddColumns()
    await Weather.dialogCloseButton(Weather.addColumnDialog).click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('Cancel closes the dialog', async () => {
    await enterWeather('ap31cancel')
    await Weather.openAddColumns()
    await Weather.acCancel.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather add-column — after a file import (AP36)', () => {
  it('adds a column after importing a CSV and back-fills the imported rows', async () => {
    await enterWeather('ap36import')
    await stubFileImport(IMPORT_CSV)
    await Weather.runImport()
    await Weather.waitForColumn('temperature')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: 20000,
      timeoutMsg: 'imported rows did not appear'
    })
    // Add a managed column WITH a default on top of the imported rows.
    await Weather.addColumn('postimport', { defaultValue: '7' })
    const colId = await Weather.waitForColumn('postimport')
    const ids = await Weather.visibleRowIds()
    for (const rowId of ids) {
      await browser.waitUntil(
        async () => (await Weather.cellInput(rowId, colId).getValue()) === '7',
        { timeout: 15000, timeoutMsg: 'default did not back-fill an imported row' }
      )
    }
  })
})

describe('Weather add-column — column name handling (AP38 / AP40 / AP39)', () => {
  it('accepts special characters in the column name (AP38)', async () => {
    await enterWeather('ap38special')
    const special = 'co2 (#1) %/m²'
    await Weather.addColumn(special)
    const colId = await Weather.waitForColumn(special)
    await expect(Weather.columnNameInput(colId)).toHaveValue(special)
  })

  it('trims leading/trailing whitespace and adds the column (AP40)', async () => {
    await enterWeather('ap40trim')
    // setReactInput drives the raw padded value; submit trims it (values.parameterName.trim()).
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', '   wind   ')
    await Weather.acSubmit.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    const colId = await Weather.waitForColumn('wind')
    await expect(Weather.columnNameInput(colId)).toHaveValue('wind')
  })

  it('accepts a long (valid, 30-char) name and renders it in the header (AP39)', async () => {
    await enterWeather('ap39long')
    const longName = 'a'.repeat(30)
    await Weather.addColumn(longName)
    const colId = await Weather.waitForColumn(longName)
    await expect(Weather.columnNameInput(colId)).toHaveValue(longName)
    await expect(Weather.columnHeader(colId)).toBeDisplayed()
  })
})

describe('Weather add-column — re-add a name after deleting it (AP41)', () => {
  it('allows re-adding a column name once the original column is deleted', async () => {
    await enterWeather('ap41readd')
    await Weather.addColumn('recycle')
    const colId = await Weather.waitForColumn('recycle')
    await Weather.deleteColumn(colId)
    await Weather.columnNameInput(colId).waitForExist({ reverse: true, timeout: 15000 })
    // The name is now free again — a second add must succeed (no server banner).
    await Weather.addColumn('recycle')
    const newColId = await Weather.waitForColumn('recycle')
    await expect(Weather.columnNameInput(newColId)).toHaveValue('recycle')
  })
})

describe('Weather add-column — data-type dropdown options (AP21)', () => {
  it('exposes a placeholder plus at least one real data type option', async () => {
    await enterWeather('ap21opts')
    await Weather.openAddColumns()
    const options = await Weather.acDataType.$$('option')
    // Index 0 is the placeholder ("Select data type"); ≥1 real catalog type follows.
    expect(options.length).toBeGreaterThan(1)
    await expect(options[0]).toHaveText('Select data type')
    // Every non-placeholder option carries a non-empty value + label.
    for (let i = 1; i < options.length; i++) {
      await expect(await options[i].getAttribute('value')).not.toBe('')
      await expect((await options[i].getText()).trim().length).toBeGreaterThan(0)
    }
    await Weather.acCancel.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather add-column — large dataset stays responsive (AP17 / AP18 / AP34)', () => {
  it('stays virtualized and the toolbar still works after many rows + columns', async () => {
    await enterWeather('ap18stress')
    // Add several managed columns, then a large block of rows.
    await Weather.addColumn('m1')
    await Weather.addColumn('m2')
    await Weather.addColumn('m3')
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) === 4, {
      timeout: 20000,
      timeoutMsg: 'expected 4 data columns (Date-Time + m1/m2/m3)'
    })
    await Weather.addRows(80)

    // Virtualization holds: a windowed subset renders, never all 80 rows.
    const rendered = await Weather.rowCount()
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(80)

    // The sticky header (Date-Time trigger + Action header) is still present.
    await expect(Weather.dateTimeHeaderTrigger).toBeDisplayed()
    await expect(Weather.actionHeader).toBeDisplayed()

    // The Add control remains usable under the large dataset: open + add one more
    // column and confirm it appears (deterministic, no timing-based perf assertion).
    await Weather.addColumn('m4')
    await Weather.waitForColumn('m4')
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) === 5, {
      timeout: 20000,
      timeoutMsg: 'add-column control did not work after the large dataset'
    })
  })
})
