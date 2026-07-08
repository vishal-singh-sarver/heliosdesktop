/**
 * Weather table E2E — toolbar, virtualized table, column/row CRUD, header
 * rename, cell editing, unit conversion, the Add-Column / Add-Rows dialogs,
 * and Delete Data. Each test self-provisions a fresh project (enterProject)
 * and asserts only on its own rows/columns. One intentional RED finding:
 * the delete-row route bug (see the "delete row" block).
 */

import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import type { WeatherCatalogType, WeatherCatalogUnit } from '../pages/Weather.page'
import { enterProject, reloadToHome, stubFileImport, waitForMainWindow } from '../support/harness'

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

/** Enter a project and land on the seeded Weather table. */
async function enterWeather(label = 'wx'): Promise<{ id: string; name: string }> {
  const project = await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
  return project
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

/** Affine catalog conversion (mirrors unitConversion.ts): base = v*factor + offset. */
function convert(
  value: number,
  from: { to_base_factor: number; to_base_offset: number },
  to: { to_base_factor: number; to_base_offset: number }
): number {
  const base = value * from.to_base_factor + from.to_base_offset
  return (base - to.to_base_offset) / to.to_base_factor
}

/**
 * Map the two discovered picker unit labels back to their catalog records (which
 * carry to_base_factor/offset) so a concrete converted value can be predicted.
 * Units render as "unit" or "unit (alias)" in the picker; both from+to must live
 * in the SAME data type (disambiguates tokens like '0-1' shared across types).
 * Returns null if the pair can't be resolved — the caller then falls back.
 */
function findConvertPair(
  catalog: WeatherCatalogType[],
  unitLabels: string[]
): { from: WeatherCatalogUnit; to: WeatherCatalogUnit } | null {
  const [labelA, labelB] = unitLabels
  const matches = (label: string, u: WeatherCatalogUnit): boolean =>
    label === u.unit || label === (u.alias ? `${u.unit} (${u.alias})` : u.unit)
  for (const type of catalog) {
    const from = type.units.find((u) => matches(labelA, u))
    const to = type.units.find((u) => matches(labelB, u))
    if (from && to && from.id !== to.id) return { from, to }
  }
  return null
}

const deleteImport = {
  dialogTitle: 'Delete',
  heading: 'Delete Data',
  body: 'Are you sure you want to delete this? This action cannot be undone.',
  confirmButton: 'Delete',
  cancelButton: 'Cancel'
} as const

/** Open the delete-import dialog from the toolbar (data must already exist). */
async function openDeleteDialog(): Promise<void> {
  await Weather.deleteDataButton.click()
  await Weather.deleteImportDialog.waitForDisplayed({ timeout: 10000 })
}

const IMPORT_CSV = [
  'datetime,temperature',
  '2026-01-01T00:00:00Z,10',
  '2026-01-01T01:00:00Z,11'
].join('\n')

describe('Weather — toolbar', () => {
  it('renders Filter / Add Columns / Add Rows / Upload File / Delete Data', async () => {
    await enterWeather('tb')
    await expect(Weather.filterButton).toBeDisplayed()
    await expect(Weather.addColumnsButton).toBeDisplayed()
    await expect(Weather.addRowsButton).toBeDisplayed()
    await expect(Weather.uploadFileButton).toBeDisplayed()
    await expect(Weather.deleteDataButton).toBeDisplayed()
  })

  it('disables Delete Data on an empty scenario (no data)', async () => {
    await enterWeather('del')
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(false)
  })
  // FINDING (not tested): the Filter button is wired to an undefined onFilter -> no-op.
})

describe('Weather — table structure (seeded empty scenario)', () => {
  it('shows the select-all checkbox, the Date-Time header, and the Action header', async () => {
    await enterWeather('struct')
    await expect(Weather.selectAllCheckbox).toBeDisplayed()
    await expect(Weather.dateTimeHeaderTrigger).toBeDisplayed()
    await expect(Weather.actionHeader).toBeDisplayed()
  })

  it('shows exactly one data column (Date-Time) before any column is added', async () => {
    await enterWeather('cols')
    await expect(await Weather.dataColumnCount()).toBe(1)
  })

  it('has an empty body (no rows) before any row is added', async () => {
    await enterWeather('empty')
    await expect(await Weather.rowCount()).toBe(0)
  })

  it('the select-all checkbox is enabled and starts unchecked', async () => {
    await enterWeather('sa')
    await expect(Weather.selectAllCheckbox).toBeEnabled()
    await expect(await Weather.selectAllCheckbox.isSelected()).toBe(false)
  })
})

describe('Weather — Add Columns dialog open/close', () => {
  it('opens from the toolbar', async () => {
    await enterWeather('ac')
    await Weather.openAddColumns()
    await expect(Weather.addColumnDialog).toBeDisplayed()
    await expect(Weather.acName).toBeDisplayed()
  })

  it('Cancel closes it', async () => {
    await enterWeather('acc')
    await Weather.openAddColumns()
    await Weather.acCancel.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('the × button closes it', async () => {
    await enterWeather('acx')
    await Weather.openAddColumns()
    await Weather.dialogCloseButton(Weather.addColumnDialog).click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('Escape closes it', async () => {
    await enterWeather('ace')
    await Weather.openAddColumns()
    await browser.keys(['Escape'])
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather — Add Rows dialog open/close', () => {
  it('opens from the toolbar', async () => {
    await enterWeather('ar')
    await Weather.openAddRows()
    await expect(Weather.addRowsDialog).toBeDisplayed()
    await expect(Weather.arNumberOfRows).toBeDisplayed()
  })

  it('Cancel closes it', async () => {
    await enterWeather('arc')
    await Weather.openAddRows()
    await Weather.arCancel.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('Escape closes it', async () => {
    await enterWeather('are')
    await Weather.openAddRows()
    await browser.keys(['Escape'])
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather — row selection', () => {
  it('renders the rows that were added', async () => {
    await enterWeather('rows')
    await Weather.addRows(3)
    await expect(await Weather.rowCount()).toBe(3)
  })

  it('select-all flips every row checkbox (and back)', async () => {
    await enterWeather('selall')
    await Weather.addRows(3)
    const ids = await Weather.visibleRowIds()
    const initial = await Weather.rowCheckbox(ids[0]).isSelected()
    await Weather.selectAllCheckbox.click()
    for (const rowId of ids) {
      await browser.waitUntil(
        async () => (await Weather.rowCheckbox(rowId).isSelected()) === !initial,
        { timeout: 10000, timeoutMsg: `row ${rowId} did not flip after select-all` }
      )
    }
    await Weather.selectAllCheckbox.click()
    for (const rowId of ids) {
      await browser.waitUntil(
        async () => (await Weather.rowCheckbox(rowId).isSelected()) === initial,
        { timeout: 10000, timeoutMsg: `row ${rowId} did not flip back` }
      )
    }
  })

  it('an individual row checkbox toggles', async () => {
    await enterWeather('selrow')
    await Weather.addRows(2)
    const [first] = await Weather.visibleRowIds()
    const initial = await Weather.rowCheckbox(first).isSelected()
    await Weather.rowCheckbox(first).click()
    await browser.waitUntil(
      async () => (await Weather.rowCheckbox(first).isSelected()) === !initial,
      { timeout: 10000, timeoutMsg: 'row checkbox did not toggle' }
    )
    await Weather.rowCheckbox(first).click()
    await browser.waitUntil(
      async () => (await Weather.rowCheckbox(first).isSelected()) === initial,
      { timeout: 10000, timeoutMsg: 'row checkbox did not toggle back' }
    )
  })

  it('select-all reflects the checked-by-default rows and toggles them off then on', async () => {
    await enterWeather('selallhdr')
    await Weather.addRows(3)
    const ids = await Weather.visibleRowIds()
    // New rows arrive checked by default (backend check='1'), so select-all and
    // every row checkbox start CHECKED — not unchecked.
    await expect(await Weather.selectAllCheckbox.isSelected()).toBe(true)
    for (const rowId of ids) {
      await expect(await Weather.rowCheckbox(rowId).isSelected()).toBe(true)
    }
    // Click select-all -> unchecks every row; the header box clears too.
    await Weather.selectAllCheckbox.click()
    for (const rowId of ids) {
      await browser.waitUntil(async () => !(await Weather.rowCheckbox(rowId).isSelected()), {
        timeout: 10000,
        timeoutMsg: `row ${rowId} still checked after deselect-all`
      })
    }
    await browser.waitUntil(async () => !(await Weather.selectAllCheckbox.isSelected()), {
      timeout: 10000,
      timeoutMsg: 'select-all did not clear after deselecting every row'
    })
    // Click again -> re-checks every row; the header box refills.
    await Weather.selectAllCheckbox.click()
    for (const rowId of ids) {
      await browser.waitUntil(async () => Weather.rowCheckbox(rowId).isSelected(), {
        timeout: 10000,
        timeoutMsg: `row ${rowId} not re-checked after select-all`
      })
    }
    await browser.waitUntil(async () => Weather.selectAllCheckbox.isSelected(), {
      timeout: 10000,
      timeoutMsg: 'select-all did not refill when every row is checked'
    })
  })

  it('checking and unchecking a single row updates the select-all header box', async () => {
    await enterWeather('partialcheck')
    await Weather.addRows(3)
    const ids = await Weather.visibleRowIds()
    // All rows checked by default -> select-all checked.
    await expect(await Weather.selectAllCheckbox.isSelected()).toBe(true)
    // Uncheck ONE row -> that row clears and select-all is no longer "all checked".
    await Weather.rowCheckbox(ids[0]).click()
    await browser.waitUntil(async () => !(await Weather.rowCheckbox(ids[0]).isSelected()), {
      timeout: 10000,
      timeoutMsg: 'the clicked row did not uncheck'
    })
    await browser.waitUntil(async () => !(await Weather.selectAllCheckbox.isSelected()), {
      timeout: 10000,
      timeoutMsg: 'select-all stayed checked after one row was unchecked'
    })
    // The untouched rows stay checked.
    await expect(await Weather.rowCheckbox(ids[1]).isSelected()).toBe(true)
    // Re-check the row -> select-all fills again.
    await Weather.rowCheckbox(ids[0]).click()
    await browser.waitUntil(async () => Weather.rowCheckbox(ids[0]).isSelected(), {
      timeout: 10000,
      timeoutMsg: 'the clicked row did not re-check'
    })
    await browser.waitUntil(async () => Weather.selectAllCheckbox.isSelected(), {
      timeout: 10000,
      timeoutMsg: 'select-all did not refill after re-checking the row'
    })
  })
})

describe('Weather — virtualization', () => {
  it('renders only a windowed subset of rows for a large dataset', async () => {
    await enterWeather('virt')
    // 100 rows is far above any plausible visible window + overscan (a 1080px
    // window fits ~40 rows max), so the rendered count must stay well under it.
    await Weather.addRows(100)
    const rendered = await Weather.rowCount()
    // Virtualization: some rows render, but never the whole 100-row dataset.
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(100)
  })

  it('renders unique rowIds within the virtualized window', async () => {
    await enterWeather('virtuniq')
    await Weather.addRows(100)
    const ids = await Weather.visibleRowIds()
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('scrolling the body to the bottom renders later rows and lets you edit one', async () => {
    const project = await enterWeather('vscroll')
    void project
    const colId = await columnWithRows('v', 100)
    const firstWindow = await Weather.visibleRowIds()
    expect(firstWindow.length).toBeGreaterThan(0)
    expect(firstWindow.length).toBeLessThan(100)

    // Drive the real scroll: find the scrollable ancestor of a rendered cell (the
    // bodyRef div, overflow-auto) and jump it to the bottom → onBodyScroll
    // recomputes the window (jsdom can't do this, so unit tests can't cover it).
    await browser.execute(() => {
      const cell = document.querySelector('[data-testid^="weather-cell-"]') as HTMLElement | null
      let el: HTMLElement | null = cell
      while (el && !(el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'visible')) {
        el = el.parentElement
      }
      if (el) el.scrollTop = el.scrollHeight
    })

    // A later window must now be rendered — rows absent from the initial window.
    await browser.waitUntil(
      async () => {
        const now = await Weather.visibleRowIds()
        return now.length > 0 && now.some((id) => !firstWindow.includes(id))
      },
      { timeout: 10000, timeoutMsg: 'scrolling the body revealed no new rows' }
    )

    // And a now-visible far-down row is editable end-to-end.
    const nowIds = await Weather.visibleRowIds()
    const newRow = nowIds.find((id) => !firstWindow.includes(id)) ?? nowIds[nowIds.length - 1]
    await Weather.editCell(newRow, colId, '7')
    await browser.waitUntil(async () => (await Weather.cellInput(newRow, colId).getValue()) === '7', {
      timeout: 10000,
      timeoutMsg: 'a far-down row did not accept an edit after scrolling'
    })
  })
})

describe('Weather — multi-column header structure', () => {
  it('adds two managed columns and shows three data-column headers', async () => {
    await enterWeather('multicol')
    await Weather.addColumn('alpha')
    await Weather.addColumn('beta')
    await expect(await Weather.dataColumnCount()).toBe(3)
    const alphaCol = await Weather.waitForColumn('alpha')
    const betaCol = await Weather.waitForColumn('beta')
    await expect(Weather.columnHeader(alphaCol)).toBeDisplayed()
    await expect(Weather.columnHeader(betaCol)).toBeDisplayed()
  })
})

describe('Weather CRUD — add column', () => {
  it('adds a managed column whose header shows the name', async () => {
    await enterWeather('addcol')
    await Weather.addColumn('temperature')
    const colId = await Weather.waitForColumn('temperature')
    await expect(Weather.columnNameInput(colId)).toHaveValue('temperature')
  })

  it('back-fills existing rows with the default value', async () => {
    await enterWeather('coldef')
    await Weather.addRows(2)
    await Weather.addColumn('pressure', { defaultValue: '5' })
    const colId = await Weather.waitForColumn('pressure')
    const [first] = await Weather.visibleRowIds()
    await browser.waitUntil(async () => (await Weather.cellInput(first, colId).getValue()) === '5', {
      timeout: 15000,
      timeoutMsg: 'default value did not back-fill the cell'
    })
  })
})

describe('Weather CRUD — add column validation', () => {
  it('empty name shows the required error on submit and keeps the dialog open', async () => {
    await enterWeather('acreq')
    await Weather.openAddColumns()
    await Weather.acSubmit.click() // submitForm touches all fields
    await Weather.acNameError.waitForDisplayed({ timeout: 10000 })
    await expect(Weather.acNameError).toHaveText('Column name is required.')
    await expect(Weather.addColumnDialog).toBeDisplayed()
  })

  it('a 31-character name shows the too-long error', async () => {
    await enterWeather('aclong')
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'a'.repeat(31))
    await Weather.acNameError.waitForDisplayed({ timeout: 10000 })
    await expect(Weather.acNameError).toHaveText('Column name must have 30 characters or fewer.')
  })

  it('a non-numeric default value shows the number error and disables submit', async () => {
    await enterWeather('acnum')
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'x')
    await Weather.setReactInput('[data-testid="input-defaultValue"]', 'abc')
    await Weather.acDefaultError.waitForDisplayed({ timeout: 10000 })
    await expect(Weather.acDefaultError).toHaveText('Default value must be a number.')
    await expect(await Weather.acSubmit.isEnabled()).toBe(false)
  })

  it('a duplicate column name shows the server error and keeps the dialog open', async () => {
    await enterWeather('acdup')
    await Weather.addColumn('dup')
    await Weather.waitForColumn('dup')
    // Second 'dup' must be rejected by the backend (unique name) -> server banner.
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'dup')
    await Weather.acSubmit.click()
    await Weather.acServerError.waitForDisplayed({ timeout: 15000 })
    await expect(Weather.addColumnDialog).toBeDisplayed()
  })

  it('a default value beyond the global bound shows the error and disables submit', async () => {
    await enterWeather('acbound')
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'x')
    // 9999999 > 1e6 global bound -> default-value error, submit disabled.
    await Weather.setReactInput('[data-testid="input-defaultValue"]', '9999999')
    await Weather.acDefaultError.waitForDisplayed({ timeout: 10000 })
    await expect(await Weather.acSubmit.isEnabled()).toBe(false)
  })

  it('a whitespace-only name shows the required error on submit', async () => {
    await enterWeather('acws')
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', '   ')
    await Weather.acSubmit.click() // submitForm touches all fields
    await Weather.acNameError.waitForDisplayed({ timeout: 10000 })
    await expect(Weather.acNameError).toHaveText('Column name is required.')
  })
})

describe('Weather CRUD — add column data-type/unit wiring', () => {
  it('enables the unit select only after a data type is chosen', async () => {
    await enterWeather('acunit')
    await Weather.openAddColumns()
    // Before any data type is selected the unit select is disabled.
    await expect(await Weather.acUnit.isEnabled()).toBe(false)
    // Catalog is dynamic — index 0 is the placeholder, index 1 is the first real type.
    await Weather.acDataType.selectByIndex(1)
    await browser.waitUntil(async () => Weather.acUnit.isEnabled(), {
      timeout: 10000,
      timeoutMsg: 'unit select never became enabled after choosing a data type'
    })
    await expect(await Weather.acUnit.isEnabled()).toBe(true)
    await Weather.acCancel.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather CRUD — rename column + header validation', () => {
  it('renames a column via the header and persists the new name', async () => {
    await enterWeather('rename')
    await Weather.addColumn('aaa')
    const colId = await Weather.waitForColumn('aaa')
    await Weather.renameColumn(colId, 'bbb')
    await browser.waitUntil(async () => (await Weather.columnNameInput(colId).getValue()) === 'bbb', {
      timeout: 15000,
      timeoutMsg: 'renamed column did not persist'
    })
  })

  it('clearing the header name shows the required error', async () => {
    await enterWeather('hdrreq')
    await Weather.addColumn('ccc')
    const colId = await Weather.waitForColumn('ccc')
    const input = Weather.columnNameInput(colId)
    await input.click()
    await browser.keys(['Control', 'a'])
    await browser.keys(['Delete'])
    await expect($('p=Column name is required.')).toBeDisplayed()
  })
})

describe('Weather CRUD — rename column header enforcement (max-30 + duplicate)', () => {
  // OUTCOME (D3 finding): BOTH rules ARE enforced on the header-rename path, so
  // both tests pass differentially (they go red if the rule were removed):
  //  (a) max-30 — enforced CLIENT-side only. HeaderEditor.validateColumnName
  //      blocks >30 chars: handleNameBlur sets the error and returns WITHOUT
  //      calling onPatch, so the rename never reaches the saga. (The backend
  //      rename PATCH itself accepts up to 100 chars — see
  //      schemas/weather_header.py WeatherDataHeaderUpdateRequest — so the
  //      30-char cap lives entirely in the renderer.) We prove non-persistence
  //      by reopening the project and checking the canonical name is unchanged.
  //  (b) duplicate — enforced SERVER-side. update_header returns HTTP 409
  //      "name '…' already exists in scenario"; updateColumnFailed writes it to
  //      columnNameErrors[colId], which HeaderEditor surfaces inline. (The app
  //      intentionally keeps the typed text on screen rather than reverting it.)

  it('(a) renaming a column to a 31-char name is rejected and never persists', async () => {
    const { name } = await enterWeather('rnmax')
    await Weather.addColumn('short')
    const colId = await Weather.waitForColumn('short')
    const tooLong = 'a'.repeat(31)
    await Weather.renameColumn(colId, tooLong)
    // The client-side >30 error shows. This is the rule under test: the backend
    // rename PATCH accepts up to 100 chars, so a 31-char name is blocked ONLY by
    // HeaderEditor.validateColumnName (handleNameBlur returns before onPatch).
    // Differential: drop the 30-char client rule and this banner disappears.
    await expect($('p=Column name must have 30 characters or fewer.')).toBeDisplayed()

    // Prove the rename never reached the backend: reopen the project from Home
    // (canonical names come from the backend) and confirm the column is still
    // 'short' and the 31-char name was never committed. If the rule were
    // removed the PATCH would have persisted the 31-char name and this fails.
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const homeId = await HomePage.rowIdForName(name)
    if (homeId === null) throw new Error(`could not find Home row for ${name}`)
    await HomePage.row(homeId).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    const reColId = await Weather.waitForColumn('short')
    await expect(Weather.columnNameInput(reColId)).toHaveValue('short')
    await expect(await Weather.colIdForName(tooLong)).toBe(null)
  })

  it('(b) renaming a column to an existing column name is rejected (server 409, inline error)', async () => {
    await enterWeather('rndup')
    await Weather.addColumn('keepme')
    const keepId = await Weather.waitForColumn('keepme')
    await Weather.addColumn('tochange')
    const colId = await Weather.waitForColumn('tochange')
    // Renaming 'tochange' to the already-taken 'keepme' must be rejected by the
    // backend (409 "name … already exists in scenario"). The app keeps the
    // typed text on screen (by design — optimistic apply is NOT rolled back on
    // a name clash) but surfaces the rejection as an inline error under the
    // offending column's name input. Differential: if the backend uniqueness
    // check were removed, the rename would SUCCEED and NO error would appear,
    // so this goes red.
    await Weather.renameColumn(colId, 'keepme')
    const errorP = Weather.columnNameError(colId)
    await browser.waitUntil(async () => errorP.isExisting(), {
      timeout: 15000,
      timeoutMsg: 'no inline error appeared after a duplicate-name rename (409 not surfaced)'
    })
    await expect(errorP).toBeDisplayed()
    // The surfaced backend message is "name '…' already exists in scenario".
    expect((await errorP.getText()).toLowerCase()).toContain('already exists')
    // The ORIGINAL 'keepme' column is a distinct, untouched column with no error.
    expect(keepId).not.toBe(colId)
    await expect(Weather.columnNameInput(keepId)).toHaveValue('keepme')
    await expect(await Weather.columnNameError(keepId).isExisting()).toBe(false)
  })
})

describe('Weather CRUD — delete column', () => {
  it('confirm removes the column', async () => {
    await enterWeather('delcol')
    await Weather.addColumn('zzz')
    const colId = await Weather.waitForColumn('zzz')
    await Weather.deleteColumn(colId)
    await Weather.columnNameInput(colId).waitForExist({ reverse: true, timeout: 15000 })
  })

  it('cancel keeps the column', async () => {
    await enterWeather('delcolc')
    await Weather.addColumn('keepcol')
    const colId = await Weather.waitForColumn('keepcol')
    await Weather.deleteColumnButton(colId).click()
    await Weather.deleteColumnDialog.waitForDisplayed({ timeout: 10000 })
    await Weather.deleteColumnDialog.$('button=Cancel').click()
    await Weather.deleteColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(Weather.columnNameInput(colId)).toBeDisplayed()
  })
})

describe('Weather CRUD — delete row', () => {
  // This test asserts the CORRECT behavior and therefore FAILS until the bug is
  // fixed — by design: a real defect must be reported, not hidden. Confirming a
  // row delete should remove the row, but it does not: the frontend posts to
  // `.../scenario/{id}/deleteRow` (utils/constants.ts), while the backend only
  // exposes `POST .../scenario/{id}/delete` (weather.py:135) — /deleteRow 404s,
  // so deleteRowWorker rolls back the optimistic removal and the row reappears.
  //
  // FIX IS NOT A ONE-LINE ROUTE SWAP (see service.ts deleteRowsRequest):
  //   1. ROUTE + BODY. /delete expects a DeleteRequest OBJECT `{ row: { date, time } }`
  //      with `extra="forbid"` (schemas/weather.py). The frontend sends a bare ARRAY
  //      `[{ date, time }]`, so pointing at API_ROUTES.weather.delete alone turns the
  //      404 into a 422 — the body must also change to `{ row: { date, time } }`.
  //   2. SEMANTIC GAP. The backend "row delete" does NOT drop the timestamp; it NaNs
  //      every column at that (date, time) via updateTimeseriesData(..., NaN)
  //      (weather_service.py:1411+). Unless the grid drops all-empty rows, the row
  //      stays visible (blank) and this count==1 assertion still fails. A true
  //      "remove row" likely needs a backend change (backend-api submodule).
  // Also update service.test.ts when the request changes.
  it('confirm removes the row', async () => {
    await enterWeather('delrow')
    await Weather.addRows(2)
    const ids = await Weather.visibleRowIds()
    await Weather.deleteRow(ids[0])
    await browser.waitUntil(async () => (await Weather.rowCount()) === 1, {
      timeout: 15000,
      timeoutMsg:
        'Row NOT deleted (count stayed 2). BUG: frontend POSTs /deleteRow but the ' +
        'backend route is /delete (weather.py:135) -> 404 -> optimistic delete rolls ' +
        'back. Fix: deleteRowsRequest should use API_ROUTES.weather.delete.'
    })
    await expect(await Weather.rowCount()).toBe(1)
  })

  it('cancel keeps the row', async () => {
    await enterWeather('delrowc')
    await Weather.addRows(1)
    const [first] = await Weather.visibleRowIds()
    await Weather.deleteRowButton(first).click()
    await Weather.deleteRowDialog.waitForDisplayed({ timeout: 10000 })
    await Weather.deleteRowDialog.$('button=Cancel').click()
    await Weather.deleteRowDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(await Weather.rowCount()).toBe(1)
  })
})

describe('Weather CRUD — bulk add (multiple columns / rows)', () => {
  it('adds several columns and they all appear', async () => {
    await enterWeather('multicol')
    await Weather.addColumn('alpha')
    await Weather.addColumn('beta')
    await Weather.addColumn('gamma')
    // date-time + the 3 added = 4 data columns
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) === 4, {
      timeout: 15000,
      timeoutMsg: 'expected 4 data columns (Date-Time + alpha/beta/gamma)'
    })
    await Weather.waitForColumn('alpha')
    await Weather.waitForColumn('beta')
    await Weather.waitForColumn('gamma')
  })

  it('adds several rows and the count matches exactly', async () => {
    await enterWeather('multirow')
    await Weather.addRows(5)
    await browser.waitUntil(async () => (await Weather.rowCount()) === 5, {
      timeout: 15000,
      timeoutMsg: 'expected exactly 5 rows'
    })
  })

  it('adds rows in two batches and they accumulate', async () => {
    await enterWeather('batch')
    await Weather.addRows(5, { startDate: '2026-01-01' })
    await Weather.addRows(3, { startDate: '2027-06-01' })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 8, {
      timeout: 20000,
      timeoutMsg: 'expected 8 rows after two batches (5 + 3)'
    })
  })
})

describe('Weather CRUD — add rows validation', () => {
  it('rejects a numberOfRows above the max and at zero', async () => {
    await enterWeather('arnummax')
    await Weather.openAddRows()
    // 10001 > 10000 upper bound -> field error.
    await Weather.setReactInput('[data-testid="input-numberOfRows"]', '10001')
    await Weather.arError('numberOfRows').waitForDisplayed({ timeout: 10000 })
    // 0 < 1 lower bound -> field error.
    await Weather.setReactInput('[data-testid="input-numberOfRows"]', '0')
    await Weather.arError('numberOfRows').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.arError('numberOfRows')).toBeDisplayed()
  })

  it('rejects a deltaHours above the max and at zero', async () => {
    await enterWeather('ardelta')
    await Weather.openAddRows()
    // 25 > 24 upper bound -> field error.
    await Weather.setReactInput('[data-testid="input-deltaHours"]', '25')
    await Weather.arError('deltaHours').waitForDisplayed({ timeout: 10000 })
    // 0 < 1 lower bound -> field error.
    await Weather.setReactInput('[data-testid="input-deltaHours"]', '0')
    await Weather.arError('deltaHours').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.arError('deltaHours')).toBeDisplayed()
  })

  it('pre-seeds start date/time and delta from the last row on reopen', async () => {
    await enterWeather('arseed')
    await Weather.addRows(2)
    // Reopening prefills Start Date/Time from the last row + delta, and delta carries over.
    await Weather.openAddRows()
    await browser.waitUntil(
      async () => {
        const d = await Weather.arStartDate.getValue()
        const t = await Weather.arStartTime.getValue()
        const dh = await Weather.arDeltaHours.getValue()
        return d.length > 0 && t.length > 0 && dh.length > 0
      },
      { timeout: 10000, timeoutMsg: 'Add Rows did not pre-seed start date/time/delta on reopen' }
    )
    await expect(await Weather.arStartDate.getValue()).not.toBe('')
    await expect(await Weather.arStartTime.getValue()).not.toBe('')
    await expect(await Weather.arDeltaHours.getValue()).not.toBe('')
    await Weather.arCancel.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('accumulates two batches across a year boundary', async () => {
    await enterWeather('aryear')
    await Weather.addRows(2, { startDate: '2026-12-31' })
    await Weather.addRows(2, { startDate: '2027-01-01' })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 4, {
      timeout: 20000,
      timeoutMsg: 'expected 4 rows after two batches across a year boundary (2 + 2)'
    })
  })

  it('requires a start date and a start time (fresh empty scenario)', async () => {
    await enterWeather('arreq')
    await Weather.openAddRows()
    // A fresh scenario seeds Start Date/Time empty; both are required on submit.
    await Weather.setReactInput('[data-testid="input-numberOfRows"]', '2')
    await Weather.arSubmit.click() // submitForm touches all fields -> required errors surface
    await Weather.arError('startDate').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.arError('startDate')).toHaveText('Start date is required.')
    await expect(Weather.arError('startTime')).toHaveText('Start time is required.')
    await expect(Weather.addRowsDialog).toBeDisplayed() // blocked, dialog stays open
    await Weather.arCancel.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('rejects numberOfRows above the 10000 max and accepts the boundary', async () => {
    await enterWeather('armax')
    await Weather.openAddRows()
    await Weather.setReactInput('[data-testid="input-numberOfRows"]', '10001')
    await Weather.arError('numberOfRows').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.arError('numberOfRows')).toHaveText('Number of rows must be 10000 or fewer.')
    // The boundary value 10000 is accepted -> the error clears (no row addition).
    await Weather.setReactInput('[data-testid="input-numberOfRows"]', '10000')
    await Weather.arError('numberOfRows').waitForDisplayed({ reverse: true, timeout: 10000 })
    await Weather.arCancel.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('rejects deltaHours above the 24 max and accepts the boundary', async () => {
    await enterWeather('armaxdelta')
    await Weather.openAddRows()
    await Weather.setReactInput('[data-testid="input-deltaHours"]', '25')
    await Weather.arError('deltaHours').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.arError('deltaHours')).toHaveText('Delta must be 24 hours or fewer.')
    await Weather.setReactInput('[data-testid="input-deltaHours"]', '24')
    await Weather.arError('deltaHours').waitForDisplayed({ reverse: true, timeout: 10000 })
    await Weather.arCancel.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather Add Rows — field validation gaps', () => {
  // Seed the THREE non-target fields with valid values, leaving the target
  // invalid, so the asserted error is unambiguously the target's. submitForm
  // touches every field + runs validate; the dialog stays open on any error.
  const VALID = {
    numberOfRows: '5',
    startDate: '2026-01-01',
    startTime: '00:00',
    deltaHours: '1'
  } as const

  type ArField = 'numberOfRows' | 'startDate' | 'startTime' | 'deltaHours'

  /** Set every non-target field valid, then drive the target to `value`. */
  async function seedExcept(target: ArField, value: string): Promise<void> {
    for (const field of ['numberOfRows', 'startDate', 'startTime', 'deltaHours'] as ArField[]) {
      const v = field === target ? value : VALID[field]
      await Weather.setReactInput(`[data-testid="input-${field}"]`, v)
    }
  }

  /** Each case: seed, submit, assert exact message + dialog stays open. */
  async function expectArError(target: ArField, value: string, message: string): Promise<void> {
    await Weather.openAddRows()
    await seedExcept(target, value)
    await Weather.arSubmit.click() // submitForm marks all touched + validates
    await Weather.arError(target).waitForDisplayed({ timeout: 10000 })
    await expect(Weather.arError(target)).toHaveText(message)
    // Validation blocks the submit -> the dialog must remain open.
    await expect(Weather.addRowsDialog).toBeDisplayed()
    await Weather.arCancel.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  }

  it('numberOfRows empty -> "Number of rows is required."', async () => {
    await enterWeather('argapnr')
    await expectArError('numberOfRows', '', 'Number of rows is required.')
  })

  it('startDate empty -> "Start date is required."', async () => {
    await enterWeather('argapsd')
    await expectArError('startDate', '', 'Start date is required.')
  })

  it('startDate 1899-12-31 -> year-range error', async () => {
    await enterWeather('argapsdyr')
    await expectArError(
      'startDate',
      '1899-12-31',
      'Start date year must be between 1900 and 3000.'
    )
  })

  it('startTime empty -> "Start time is required."', async () => {
    await enterWeather('argapst')
    await expectArError('startTime', '', 'Start time is required.')
  })

  it('startTime 25:99 -> 24-hour-format error (en-dash range)', async () => {
    await enterWeather('argapstfmt')
    await expectArError(
      'startTime',
      '25:99',
      'Start time must be in 24-hour format (00:00–23:59).'
    )
  })

  it('deltaHours empty -> "Delta is required."', async () => {
    await enterWeather('argapdh')
    await expectArError('deltaHours', '', 'Delta is required.')
  })

  it('numberOfRows input guard rejects non-digit keystrokes (stays empty)', async () => {
    await enterWeather('argapguard')
    await Weather.openAddRows()
    // Real keystrokes (not the setReactInput bypass) go through the controlled
    // onChange whose /^\d*$/ gate drops any value containing a non-digit, so the
    // field never accepts "abc". Differential: if the guard were removed the
    // letters would land and this would fail.
    await Weather.arNumberOfRows.click()
    await Weather.arNumberOfRows.addValue('1a2b3')
    // Digits land; letters are dropped by the /^\d*$/ onChange guard. Asserting the
    // surviving '123' (not just an empty field) keeps the signal off the default ''.
    await expect(Weather.arNumberOfRows).toHaveValue('123')
    // The dialog is still open and usable.
    await expect(Weather.addRowsDialog).toBeDisplayed()
    await Weather.arCancel.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather CRUD — columns at scale (30 columns + delete / rename / default)', () => {
  it('adds 30 columns then back-fills a defaulted column, renames one, deletes one', async function () {
    this.timeout(180000)
    await enterWeather('cols30')
    await Weather.addRows(2) // so a defaulted column's back-fill is observable
    // Add 30 managed columns: Date-Time + 30 = 31 data columns.
    for (let i = 1; i <= 30; i++) {
      await Weather.addColumn(`col${i}`)
    }
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) === 31, {
      timeout: 120000,
      timeoutMsg: 'expected 31 data columns (Date-Time + 30 managed)'
    })
    // Default value: a 31st managed column with a default back-fills both rows.
    await Weather.addColumn('withdefault', { defaultValue: '9' })
    const defCol = await Weather.waitForColumn('withdefault')
    for (const rowId of await Weather.visibleRowIds()) {
      await browser.waitUntil(async () => (await Weather.cellInput(rowId, defCol).getValue()) === '9', {
        timeout: 15000,
        timeoutMsg: 'default value did not back-fill a row at scale'
      })
    }
    // Rename one of the 30 columns -> the header reflects the new name.
    const c5 = await Weather.waitForColumn('col5')
    await Weather.renameColumn(c5, 'col5renamed')
    await browser.waitUntil(async () => (await Weather.columnNameInput(c5).getValue()) === 'col5renamed', {
      timeout: 15000,
      timeoutMsg: 'rename did not persist at scale'
    })
    // Delete a column -> it disappears and the data-column count drops by one.
    const c10 = await Weather.waitForColumn('col10')
    await Weather.deleteColumn(c10)
    await Weather.columnNameInput(c10).waitForExist({ reverse: true, timeout: 15000 })
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) === 31, {
      timeout: 20000,
      timeoutMsg: 'expected 31 data columns after delete (Date-Time + 30 + withdefault - 1)'
    })
  })
})

describe('Weather CRUD — cell editing', () => {
  it('persists an edited cell value across a reopen of the project', async () => {
    const { name } = await enterWeather('celledit')
    await Weather.addColumn('val')
    const colId = await Weather.waitForColumn('val')
    await Weather.addRows(1)
    const [row] = await Weather.visibleRowIds()
    await Weather.editCell(row, colId, '42')
    await browser.waitUntil(async () => (await Weather.cellInput(row, colId).getValue()) === '42', {
      timeout: 15000,
      timeoutMsg: 'cell did not show the committed value'
    })
    // Reopen the SAME project from Home (backend session persists in-run) and
    // confirm the value survived the round-trip. Row/col are re-resolved.
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const homeId = await HomePage.rowIdForName(name)
    await HomePage.row(homeId as string).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    const colId2 = await Weather.waitForColumn('val')
    const [row2] = await Weather.visibleRowIds()
    await expect(Weather.cellInput(row2, colId2)).toHaveValue('42')
  })

  it('rejects non-numeric keystrokes in a numeric cell', async () => {
    await enterWeather('cellnum')
    await Weather.addColumn('num')
    const colId = await Weather.waitForColumn('num')
    await Weather.addRows(1)
    const [row] = await Weather.visibleRowIds()
    const input = Weather.cellInput(row, colId)
    await input.click()
    await input.addValue('abc')
    // Non-numeric keystrokes never reach the draft -> value stays empty.
    await expect(input).toHaveValue('')
  })

  it('rejects keystrokes that exceed 7 decimal places or the global bound', async () => {
    await enterWeather('cellguard')
    await Weather.addColumn('g')
    const colId = await Weather.waitForColumn('g')
    await Weather.addRows(1)
    const [row] = await Weather.visibleRowIds()
    const input = Weather.cellInput(row, colId)

    // (a) the 8th decimal keystroke is rejected -> draft never reaches 8 decimals.
    await input.click()
    await browser.keys(['Control', 'a'])
    await browser.keys(['Delete'])
    await input.addValue('1.12345678')
    const decimalValue = await input.getValue()
    expect(decimalValue).not.toBe('1.12345678')
    const decimals = decimalValue.includes('.') ? decimalValue.split('.')[1].length : 0
    expect(decimals <= 7).toBe(true)

    // (b) a value above the global ±1e6 bound is blocked keystroke-by-keystroke.
    await input.click()
    await browser.keys(['Control', 'a'])
    await browser.keys(['Delete'])
    await input.addValue('9999999')
    await expect(await input.getValue()).not.toBe('9999999')
  })
})

describe('Weather cell — global-bound validation (aria-invalid + tooltip)', () => {
  it('an injected out-of-global-bound value marks the cell invalid with the bound message', async () => {
    await enterWeather('cellbound')
    await Weather.addColumn('gb')
    const colId = await Weather.waitForColumn('gb')
    await Weather.addRows(1)
    const [row] = await Weather.visibleRowIds()

    // The CellInput keystroke gate refuses out-of-bound characters, so typing
    // can't reach this state — inject the value via input/change events to force
    // the commit path. validateCellValue (no unit assigned -> global branch)
    // flags it and CellInput sets aria-invalid + the tooltip. Differential: if
    // validateCellValue's global bound were removed, neither would appear.
    await Weather.setReactInput(`[aria-label="${row} ${colId}"]`, '2000000')

    await browser.waitUntil(async () => (await Weather.cellInvalid(row, colId)) === 'true', {
      timeout: 10000,
      timeoutMsg: 'cell never became aria-invalid after an out-of-global-bound value'
    })
    await expect(await Weather.cellInvalid(row, colId)).toBe('true')
    const message = await Weather.cellError(row, colId)
    expect(message).not.toBe(null)
    expect(message ?? '').toContain('Value should be between -1000000 and 1000000')
  })

  it('an in-bound value leaves the cell valid (no false positive)', async () => {
    await enterWeather('cellboundok')
    await Weather.addColumn('gbok')
    const colId = await Weather.waitForColumn('gbok')
    await Weather.addRows(1)
    const [row] = await Weather.visibleRowIds()
    // A value well within ±1e6 must NOT trip the validator — guards the test
    // above from being vacuous (it isn't asserting "any value is invalid").
    await Weather.setReactInput(`[aria-label="${row} ${colId}"]`, '500000')
    await browser.waitUntil(
      async () => (await Weather.cellInput(row, colId).getValue()) === '500000',
      { timeout: 10000, timeoutMsg: 'in-bound value did not land in the cell' }
    )
    await expect(await Weather.cellInvalid(row, colId)).toBe(null)
    await expect(await Weather.cellError(row, colId)).toBe(null)
  })
})

describe('Weather units — unit-range validation (catalog-bounded unit)', () => {
  // The global ±1e6 bound is covered above; this covers the UNIT-specific range
  // (DataUnitDef.min/max → validation.ts). With data present, assigning a bounded
  // unit must flag a value outside that unit's range with its own message.
  // Catalog-dependent: skips cleanly if no unit exposes a finite, in-global bound
  // (same defensive pattern as the °C→°F conversion test).
  it("flags a value outside the assigned unit's min/max range", async function () {
    type CatalogUnit = { unit: string; alias: string; min: number | null; max: number | null }
    type CatalogType = { data_type: string; units: CatalogUnit[] }

    await enterWeather('unitrange')
    const colId = await columnWithRows('ur', 1)
    const [row] = await Weather.visibleRowIds()

    // Pull the catalog (units carry min/max) from the backend the app is talking
    // to. Any failure → null → the test skips rather than falsely fails.
    const catalog = await browser.execute(async () => {
      try {
        const api = (window as unknown as { api?: { getBackendUrl?: () => Promise<string | null> } }).api
        const base = (await api?.getBackendUrl?.()) ?? ''
        const res = await fetch(`${base}/api/data-types/`)
        return res.ok ? await res.json() : null
      } catch {
        return null
      }
    })
    const types: CatalogType[] = (catalog as { data_types?: CatalogType[] } | null)?.data_types ?? []

    // Find a bounded (type, unit) the picker actually offers, with the bound
    // comfortably inside the global ±1e6 so the unit message (not the global one)
    // is the one that trips. Assign it via the header picker.
    await Weather.openHeaderPicker(colId)
    const typeOptions = await Weather.pickerOptions()
    let bound: { min: number | null; max: number | null } | null = null
    for (const t of types) {
      if (!typeOptions.includes(t.data_type)) continue
      const u = t.units.find(
        (x) =>
          (Number.isFinite(x.min) || Number.isFinite(x.max)) &&
          (x.max == null || x.max < 999_999) &&
          (x.min == null || x.min > -999_999)
      )
      if (!u) continue
      await Weather.pickerPick(t.data_type)
      const unitOptions = await Weather.pickerOptions()
      const label = unitOptions.find(
        (l) =>
          l === u.alias ||
          l === u.unit ||
          l.startsWith(`${u.alias} (`) ||
          l.startsWith(`${u.unit} (`)
      )
      if (!label) {
        await Weather.pickerBack()
        continue
      }
      await Weather.pickerPick(label)
      await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })
      bound = { min: u.min, max: u.max }
      break
    }
    if (!bound) {
      await browser.keys(['Escape'])
      this.skip()
      return
    }

    // Derive an out-of-range and an in-range value from whichever bound(s) exist.
    const { min, max } = bound
    let over: number
    let inside: number
    if (min != null && max != null) {
      over = max + 1
      inside = (min + max) / 2
    } else if (max != null) {
      over = max + 1
      inside = max - 1
    } else if (min != null) {
      over = min - 1
      inside = min + 1
    } else {
      this.skip()
      return
    }

    // Out-of-unit-range → aria-invalid with the unit message (NOT the global one).
    await Weather.setReactInput(`[aria-label="${row} ${colId}"]`, String(over))
    await browser.waitUntil(async () => (await Weather.cellInvalid(row, colId)) === 'true', {
      timeout: 10000,
      timeoutMsg: 'cell never became aria-invalid for an out-of-unit-range value'
    })
    const message = await Weather.cellError(row, colId)
    expect(message ?? '').toContain('should be')
    expect(message ?? '').not.toContain('1000000')

    // An in-range value clears the flag (guards against "everything is invalid").
    await Weather.setReactInput(`[aria-label="${row} ${colId}"]`, String(inside))
    await browser.waitUntil(async () => (await Weather.cellInvalid(row, colId)) === null, {
      timeout: 10000,
      timeoutMsg: 'in-range value did not clear aria-invalid'
    })
  })
})

describe('Weather units — conversion round-trip (catalog-agnostic)', () => {
  it('A→B converts to the exact catalog-derived value, and B→A restores the original', async () => {
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
    const SEED = 10
    await Weather.editCell(row, colId, String(SEED))
    await browser.waitUntil(
      async () => (await Weather.cellInput(row, colId).getValue()) === String(SEED),
      { timeout: 10000, timeoutMsg: 'seed value did not commit' }
    )

    // Predict the EXACT converted value from the two units' catalog factors, so a
    // no-op / disabled conversion FAILS (the old test asserted only Number.isFinite,
    // which any unconverted value passes). If the catalog is unreachable, fall back
    // to "the value must change from the seed" — which still rejects a no-op.
    const catalog = await Weather.fetchCatalog()
    const pair = catalog ? findConvertPair(catalog, found.units) : null
    const expectedB = pair ? convert(SEED, pair.from, pair.to) : null
    // Discovery picks arbitrary units; a pair that maps SEED → ~SEED couldn't tell
    // a real conversion from a no-op. Assert we resolved a discriminating pair.
    if (expectedB != null) expect(Math.abs(expectedB - SEED)).toBeGreaterThan(1e-6)

    // A → B: the unit change must recompute the cell to the concrete converted value.
    await Weather.changeUnit(colId, unitB)
    await browser.waitUntil(
      async () => {
        const v = Number(await Weather.cellInput(row, colId).getValue())
        if (!Number.isFinite(v)) return false
        return expectedB == null
          ? Math.abs(v - SEED) > 1e-6 // fallback: value must change from the seed
          : Math.abs(v - expectedB) <= Math.abs(expectedB) * 1e-3 + 1e-4 // exact
      },
      {
        timeout: 15000,
        timeoutMsg:
          expectedB == null
            ? `A→B (${unitA}→${unitB}) did not change ${SEED} — conversion looks like a no-op`
            : `A→B (${unitA}→${unitB}) expected ~${expectedB}, but the cell showed a different value`
      }
    )

    // B → A: round-trip must restore ~10 (float32 storage → small tolerance).
    await Weather.changeUnit(colId, unitA)
    await browser.waitUntil(
      async () => Math.abs(Number(await Weather.cellInput(row, colId).getValue()) - SEED) < 0.1,
      {
        timeout: 15000,
        timeoutMsg: 'round-trip A→B→A did not restore the original value (~10)'
      }
    )
  })
})

describe('Weather units — concrete physical conversion (when available)', () => {
  it('°C ⇄ °F: 0°C converts to 32°F and back to 0°C (skipped if the catalog lacks the pair)', async function () {
    this.timeout(60000)
    await enterWeather('ctof')
    const colId = await columnWithRows('temp')
    const [row] = await Weather.visibleRowIds()

    await Weather.openHeaderPicker(colId)
    const types = await Weather.pickerOptions()
    const tempType = types.find((t) => /temp/i.test(t))
    if (!tempType) {
      await Weather.pickerBack().catch(() => {})
      this.skip() // no Temperature data type — mark SKIPPED (not a silent green pass).
    }
    await Weather.pickerPick(tempType)
    await Weather.pickerListbox
      .$('button*=Back to Assign Type')
      .waitForExist({ timeout: 5000 })
      .catch(() => {})
    const units = await Weather.pickerOptions()
    const celsius = units.find((u) => /celsius|°c\b|^c\b/i.test(u))
    const fahrenheit = units.find((u) => /fahrenheit|°f\b|^f\b/i.test(u))
    if (!celsius || !fahrenheit) this.skip() // pair absent — mark SKIPPED, not passed.

    await Weather.pickerPick(celsius)
    await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })
    await Weather.editCell(row, colId, '0')
    await browser.waitUntil(async () => (await Weather.cellInput(row, colId).getValue()) === '0', {
      timeout: 10000,
      timeoutMsg: '0°C did not commit'
    })

    // Forward: 0°C → 32°F.
    await Weather.changeUnit(colId, fahrenheit)
    await browser.waitUntil(
      async () => Math.abs(Number(await Weather.cellInput(row, colId).getValue()) - 32) < 0.1,
      { timeout: 15000, timeoutMsg: '0°C did not convert to ~32°F' }
    )

    // Reverse: 32°F → 0°C (the direction the old test never checked).
    await Weather.changeUnit(colId, celsius)
    await browser.waitUntil(
      async () => Math.abs(Number(await Weather.cellInput(row, colId).getValue())) < 0.1,
      { timeout: 15000, timeoutMsg: '32°F did not convert back to ~0°C' }
    )
  })
})

describe('Weather units — per-type conversion against the live catalog (both directions)', () => {
  // One test PER data type: assign its base unit, seed an in-range value, then for
  // each OTHER catalog unit assert changeUnit recomputes the cell to
  // convert(seed, base, alt) using the catalog's REAL to_base_factor/offset, and
  // that switching back restores the seed (the reverse direction). This
  // value-verifies every catalog factor — kg/m³, kWh/m²/day, µmol/m²/s,
  // atm/bar/mmHg, mph/knots/ft/s, ppb — that the °C⇄°F test and the range-only
  // datatype-validation sweep never exercise. Split per type (like
  // datatype-validation.test.ts) so one flake can't sink the rest and a bad
  // factor names its own unit. A type the catalog lacks self-skips (never green).

  // Seed expressed in the BASE unit and inside its catalog range, so every
  // converted value stays within the ±1e6 global cell bound and is float32-
  // representable. `match` picks the catalog data_type; `name` titles the test.
  const TYPES: Array<{ name: string; match: RegExp; seed: number }> = [
    { name: 'air_temperature', match: /temperature/i, seed: 300 }, // base K
    { name: 'air_pressure', match: /pressure/i, seed: 100000 }, // base Pa
    { name: 'wind_speed', match: /wind/i, seed: 10 }, // base m/s
    { name: 'air_CO2', match: /co2/i, seed: 400 }, // base ppm
    { name: 'direct radiation', match: /direct.*radiat/i, seed: 750 }, // base W/m²
    { name: 'diffuse radiation', match: /diffuse.*radiat/i, seed: 750 }, // base W/m²
    { name: 'air_humidity', match: /humid/i, seed: 0.5 }, // base 0-1
    { name: 'turbidity', match: /turbid/i, seed: 0.5 } // base 0-1
  ]

  // Relative tolerance for float32 backend storage (mirrors the round-trip test).
  const near = (v: number, expected: number): boolean =>
    Number.isFinite(v) && Math.abs(v - expected) <= Math.abs(expected) * 1e-3 + 1e-4

  // An alt is swept only if BOTH its seed and converted value stay within ±1e6.
  const inBounds = (seed: number, base: WeatherCatalogUnit, alt: WeatherCatalogUnit): boolean => {
    const c = convert(seed, base, alt)
    return Math.abs(seed) <= 1e6 && Number.isFinite(c) && Math.abs(c) <= 1e6
  }

  for (const spec of TYPES) {
    it(`${spec.name}: every unit converts to and from base at the exact catalog value`, async function () {
      this.timeout(120000)
      // Provision FIRST — enter → column+rows → fetch catalog — the exact order
      // of the proven round-trip test, so a seedable cell + the header picker
      // exist before any catalog lookup.
      await enterWeather('conv')
      const colId = await columnWithRows('cv')
      const [row] = await Weather.visibleRowIds()

      const catalog = await Weather.fetchCatalog()
      if (!catalog) this.skip() // backend unreachable → SKIP, never a silent green.
      const type = catalog.find((t) => spec.match.test(t.data_type) && t.units.length >= 2)
      if (!type) this.skip() // catalog lacks this convertible type → SKIP, not green.
      const base = type.units.find((u) => u.is_base) ?? type.units[0]
      const alts = type.units.filter((u) => u.id !== base.id && inBounds(spec.seed, base, u))
      if (alts.length === 0) this.skip()

      // Assign the type + base unit through the header picker. Rendered type/unit
      // labels can be prettified, so resolve them from what the picker shows (via
      // the catalog) and confirm we landed on THIS type before committing.
      await Weather.openHeaderPicker(colId)
      // The picker renders each type option as the raw data_type
      // (DataTypeUnitPicker.tsx), and two types can share unit labels (direct vs
      // diffuse radiation), so we MUST select by the type name, not by units.
      const typeLabels = await Weather.pickerOptions()
      const typeLabel =
        typeLabels.find((tl) => tl === type.data_type) ??
        typeLabels.find((tl) => spec.match.test(tl))
      if (!typeLabel) {
        throw new Error(
          `header picker never surfaced "${type.data_type}" (saw: ${typeLabels.join(', ')})`
        )
      }
      await Weather.pickerPick(typeLabel)
      await Weather.pickerListbox
        .$('button*=Back to Assign Type')
        .waitForExist({ timeout: 5000 })
        .catch(() => {})

      // Map each of THIS type's units to the label the picker shows for it
      // ("unit" or "unit (alias)"), scoped to the selected type only.
      const shownUnitLabels = await Weather.pickerOptions()
      const matchUnit = (label: string, u: WeatherCatalogUnit): boolean =>
        label === u.unit || label === (u.alias ? `${u.unit} (${u.alias})` : u.unit)
      const labelOf = (u: WeatherCatalogUnit): string =>
        shownUnitLabels.find((l) => matchUnit(l, u)) ?? (u.alias ? `${u.unit} (${u.alias})` : u.unit)
      const baseLabel = labelOf(base)

      // Commit the base unit (picker is in this type's unit view).
      await Weather.pickerPick(baseLabel)
      await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })

      for (const alt of alts) {
        // Re-seed in the base unit so each leg is an independent assertion.
        await Weather.editCell(row, colId, String(spec.seed))
        await browser.waitUntil(
          async () => (await Weather.cellInput(row, colId).getValue()) === String(spec.seed),
          { timeout: 10000, timeoutMsg: `seed ${spec.seed} did not commit for ${type.data_type}` }
        )

        const expected = convert(spec.seed, base, alt)
        await Weather.changeUnit(colId, labelOf(alt))
        await browser.waitUntil(
          async () => near(Number(await Weather.cellInput(row, colId).getValue()), expected),
          {
            timeout: 15000,
            timeoutMsg: `${type.data_type}: ${base.unit}→${alt.unit} of ${spec.seed} expected ~${expected} (factor ${alt.to_base_factor}, offset ${alt.to_base_offset})`
          }
        )

        // Reverse direction: back to base must restore the seed.
        await Weather.changeUnit(colId, baseLabel)
        await browser.waitUntil(
          async () => near(Number(await Weather.cellInput(row, colId).getValue()), spec.seed),
          {
            timeout: 15000,
            timeoutMsg: `${type.data_type}: ${alt.unit}→${base.unit} did not restore ${spec.seed}`
          }
        )
      }
    })
  }
})

describe('Weather — reopen persistence & un-assign (audit additions)', () => {
  // Reopen the SAME project from Home in-session (the backend session survives
  // during a run) and land back on its Weather table — mirrors the celledit
  // persist test. These assert that state re-read FROM the backend matches what
  // the optimistic UI showed, so a write that never persisted is caught.
  async function reopen(name: string): Promise<void> {
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const homeId = await HomePage.rowIdForName(name)
    if (!homeId) throw new Error(`project row "${name}" not found on Home`)
    await HomePage.row(homeId).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  }

  it('a toggled per-row checkbox persists across a reopen', async () => {
    const { name } = await enterWeather('chkpersist')
    await Weather.addColumn('c')
    await Weather.waitForColumn('c')
    await Weather.addRows(2)
    const ids = await Weather.visibleRowIds()
    const initial = await Weather.rowCheckbox(ids[0]).isSelected()
    await Weather.rowCheckbox(ids[0]).click()
    await browser.waitUntil(
      async () => (await Weather.rowCheckbox(ids[0]).isSelected()) === !initial,
      { timeout: 10000, timeoutMsg: 'row checkbox did not toggle' }
    )
    await reopen(name)
    const ids2 = await Weather.visibleRowIds()
    // Row order is stable, so ids2[0] is the same row — assert the PERSISTED state.
    await expect(await Weather.rowCheckbox(ids2[0]).isSelected()).toBe(!initial)
  })

  it('an out-of-range (flagged) numeric cell value persists across a reopen', async function () {
    this.timeout(90000)
    const { name } = await enterWeather('oobpersist')
    const colId = await columnWithRows('oob', 1)
    const [row] = await Weather.visibleRowIds()
    const catalog = await Weather.fetchCatalog()
    if (!catalog) this.skip()
    // Pick any type whose unit has a finite max well within the ±1e6 global bound.
    let target: { type: string; unit: string; over: string } | null = null
    for (const t of catalog) {
      const u = t.units.find((x) => x.max != null && Math.ceil(x.max) + 10 < 1_000_000)
      if (u) {
        target = { type: t.data_type, unit: u.unit, over: String(Math.ceil(u.max as number) + 10) }
        break
      }
    }
    if (!target) this.skip()
    const tgt = target
    await Weather.assignDataTypeUnit(colId, tgt.type, tgt.unit)
    // Above-max but < ±1e6: the keystroke gate admits it, validateCellValue flags
    // it, and the app POSTs the flagged value. On reopen it must round-trip.
    await Weather.editCell(row, colId, tgt.over)
    await browser.waitUntil(async () => (await Weather.cellInput(row, colId).getValue()) === tgt.over, {
      timeout: 15000,
      timeoutMsg: 'out-of-range value did not commit'
    })
    await browser.waitUntil(async () => (await Weather.cellInvalid(row, colId)) === 'true', {
      timeout: 10000,
      timeoutMsg: 'out-of-range value was not flagged aria-invalid'
    })
    await reopen(name)
    const colId2 = await Weather.waitForColumn('oob')
    const [row2] = await Weather.visibleRowIds()
    await expect(Weather.cellInput(row2, colId2)).toHaveValue(tgt.over)
  })

  it('"Back to Assign Type" un-assigns a committed type + unit and the null survives a reopen', async () => {
    const { name } = await enterWeather('unassign')
    const colId = await columnWithRows('unassign', 1)
    const emptyLabel = await Weather.headerPickerLabel(colId)
    const found = await discoverConvertibleType(colId)
    if (!found) throw new Error('catalog exposes no data type with ≥2 units')
    await Weather.pickerPick(found.units[0])
    await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })
    await browser.waitUntil(async () => (await Weather.headerPickerLabel(colId)) !== emptyLabel, {
      timeout: 10000,
      timeoutMsg: 'header did not relabel after assigning a unit'
    })
    // Reopen the picker (a committed column opens into unit view) and click "Back
    // to Assign Type" → PATCHes {dataTypeId:null, unitId:null} (DataTypeUnitPicker
    // handleBackToAssignType, no pending type). Close the now type-view popover.
    await Weather.openHeaderPicker(colId)
    await Weather.pickerListbox.$('button*=Back to Assign Type').click()
    await Weather.filterButton.click()
    await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 }).catch(() => {})
    await browser.waitUntil(async () => (await Weather.headerPickerLabel(colId)) === emptyLabel, {
      timeout: 10000,
      timeoutMsg: 'header did not revert to unassigned after Back to Assign Type'
    })
    await reopen(name)
    const colId2 = await Weather.waitForColumn('unassign')
    await expect(await Weather.headerPickerLabel(colId2)).toBe(emptyLabel)
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

  it('picking a Date-Time format changes the rendered date-time cells', async () => {
    await enterWeather('dtapply')
    // Seed date-time values so the merged date-time cells render real dates.
    await Weather.addRows(2)
    const colId = await Weather.dateTimeColId()
    const [row] = await Weather.visibleRowIds()
    const before = await Weather.dateTimeCellText(row, colId)
    expect(before.length).toBeGreaterThan(0)

    // Catalog-agnostic: find a NON-selected format whose pattern differs from
    // the currently selected one. With a single format the picker can't change
    // anything, so self-skip (like the unit-conversion tests).
    await Weather.openDateTimeFormatPicker()
    const options = await Weather.dateTimeFormatOptions()
    const selected = options.find((o) => o.selected)?.text ?? ''
    const target = options.find((o) => !o.selected && o.text !== selected)
    if (!target) {
      await Weather.dateTimeHeaderTrigger.click() // close the listbox
      return // catalog exposes only one usable format — nothing to assert.
    }
    await Weather.pickDateTimeFormat(target.text)

    // The SAME cell must re-render to a different string once the new unitId is
    // patched + formatDateTime runs. Differential: if picking a format didn't
    // re-format the cells, the text would stay `before` and this would fail.
    await browser.waitUntil(
      async () => (await Weather.dateTimeCellText(row, colId)) !== before,
      {
        timeout: 15000,
        timeoutMsg: `date-time cell text did not change after picking "${target.text}"`
      }
    )
    const after = await Weather.dateTimeCellText(row, colId)
    expect(after).not.toBe(before)

    // Shape sanity for the common ordered patterns: the chosen pattern's lead
    // token determines the rendered cell's leading run.
    if (target.text.startsWith('YYYY-MM-DD')) {
      // ISO date -> leads with a 4-digit year then a dash.
      expect(/^\d{4}-\d{2}-\d{2}/.test(after)).toBe(true)
    } else if (target.text.startsWith('MM/DD/YYYY') || target.text.startsWith('DD/MM/YYYY')) {
      // Slash formats -> dd/dd/yyyy ordering.
      expect(/^\d{2}\/\d{2}\/\d{4}/.test(after)).toBe(true)
    }
  })
})

describe('Weather Delete Data — dialog copy', () => {
  it('shows the exact heading and body strings from messages.deleteImport', async () => {
    await enterWeather('copy')
    await Weather.addRows(1)
    await openDeleteDialog()
    // The dialog title ('Delete') is the <h2>; the confirmation heading is the <h3>.
    await expect(Weather.deleteImportDialog.$('h3')).toHaveText(deleteImport.heading)
    await expect(Weather.deleteImportDialog.$('p')).toHaveText(deleteImport.body)
  })

  it('labels the buttons Cancel and Delete (not Yes/No)', async () => {
    await enterWeather('btns')
    await Weather.addRows(1)
    await openDeleteDialog()
    await expect(Weather.deleteImportDialog.$(`button=${deleteImport.cancelButton}`)).toBeDisplayed()
    await expect(Weather.deleteImportDialog.$(`button=${deleteImport.confirmButton}`)).toBeDisplayed()
  })

  it('uses the dialogTitle string in the dialog header and aria-label', async () => {
    await enterWeather('title')
    await Weather.addRows(1)
    await openDeleteDialog()
    await expect(Weather.deleteImportDialog).toHaveAttribute(
      'aria-label',
      deleteImport.dialogTitle
    )
    await expect(Weather.deleteImportDialog.$('h2')).toHaveText(deleteImport.dialogTitle)
  })
})

describe('Weather Delete Data — Escape cancels', () => {
  it('Escape closes the dialog and keeps the data', async () => {
    await enterWeather('esc')
    await Weather.addRows(2)
    await expect(await Weather.rowCount()).toBe(2)
    await openDeleteDialog()
    await browser.keys(['Escape'])
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(await Weather.rowCount()).toBe(2)
    // Delete Data is still available because the rows survived.
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(true)
  })
})

describe('Weather Delete Data — modal focus & inertness', () => {
  it('focuses an element inside the dialog when it opens', async () => {
    await enterWeather('focus')
    await Weather.addRows(1)
    await openDeleteDialog()
    // showModal() focuses the first focusable (the × Close button) and the active
    // element must live inside the open <dialog>.
    const focusInside = await browser.execute(() => {
      const dialog = document.querySelector('[data-testid="delete-import-dialog"]')
      const active = document.activeElement
      return dialog != null && active != null && dialog.contains(active)
    })
    expect(focusInside).toBe(true)
  })

  it('opens as a modal <dialog> (background made inert via showModal)', async () => {
    await enterWeather('modal')
    await Weather.addRows(1)
    await openDeleteDialog()
    // A modal native dialog reports matches(':modal'); this is what makes the
    // backdrop inert and the rest of the page non-interactive.
    const isModal = await browser.execute(() => {
      const dialog = document.querySelector<HTMLDialogElement>(
        '[data-testid="delete-import-dialog"]'
      )
      return dialog != null && dialog.open && dialog.matches(':modal')
    })
    expect(isModal).toBe(true)
  })
})

describe('Weather Delete Data — single dialog instance', () => {
  it('rapid clicks on Delete Data open exactly one dialog', async () => {
    await enterWeather('rapid')
    await Weather.addRows(2)
    // Fire three clicks in immediate succession. A real WebDriver click on the
    // 2nd/3rd is intercepted by the modal the 1st opens (that interception IS the
    // dedup we want, but it throws), so dispatch all three in-page, then assert
    // only ONE dialog opened.
    await browser.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        '[aria-label="Delete uploaded weather file"]'
      )
      btn?.click()
      btn?.click()
      btn?.click()
    })
    await Weather.deleteImportDialog.waitForDisplayed({ timeout: 10000 })
    // Exactly one delete-import-dialog node exists and it is shown once.
    const dialogs = await $$('[data-testid="delete-import-dialog"]')
    expect(dialogs.length).toBe(1)
    await expect(Weather.deleteImportDialog).toBeDisplayed()
    // No crash: the data is untouched and Cancel still closes the single dialog.
    await Weather.deleteImportDialog.$(`button=${deleteImport.cancelButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(await Weather.rowCount()).toBe(2)
  })
})

describe('Weather Delete Data — a11y tab order', () => {
  it('Tab moves focus to the Cancel and Delete buttons', async () => {
    await enterWeather('tab')
    await Weather.addRows(1)
    await openDeleteDialog()
    // Walk forward with Tab and collect the focused button labels; the native
    // <dialog> focus scope must reach both action buttons.
    const seen = new Set<string>()
    const cancel = deleteImport.cancelButton
    const confirm = deleteImport.confirmButton
    for (let i = 0; i < 6; i++) {
      const label = await browser.execute(() => {
        const el = document.activeElement as HTMLElement | null
        return el && el.tagName === 'BUTTON' ? (el.textContent ?? '').trim() : null
      })
      if (label === cancel) seen.add(cancel)
      if (label === confirm) seen.add(confirm)
      if (seen.has(cancel) && seen.has(confirm)) break
      await browser.keys(['Tab'])
    }
    expect(seen.has(cancel)).toBe(true)
    expect(seen.has(confirm)).toBe(true)
  })
})

describe('Weather Delete Data — confirm clears the table', () => {
  it('confirming a large dataset clears every row and re-disables Delete Data', async () => {
    await enterWeather('large')
    await Weather.addRows(500)
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 20000,
      timeoutMsg: 'large dataset never rendered'
    })
    await openDeleteDialog()
    await Weather.deleteImportDialog.$(`button=${deleteImport.confirmButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: 30000,
      timeoutMsg: 'large dataset did not clear after Delete Data'
    })
    // Blank state: with no data, Delete Data disables again.
    await browser.waitUntil(async () => !(await Weather.deleteDataButton.isEnabled()), {
      timeout: 15000,
      timeoutMsg: 'Delete Data stayed enabled after clearing all data'
    })
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(false)
  })

  it('after delete the table returns to a single Date-Time column', async () => {
    await enterWeather('blank')
    await Weather.addColumn('temperature')
    await Weather.waitForColumn('temperature')
    await Weather.addRows(2)
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) === 2, {
      timeout: 15000,
      timeoutMsg: 'expected Date-Time + temperature columns before delete'
    })
    await openDeleteDialog()
    await Weather.deleteImportDialog.$(`button=${deleteImport.confirmButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: 20000,
      timeoutMsg: 'rows did not clear after Delete Data'
    })
    // Managed columns are removed too — only the Date-Time column remains.
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) === 1, {
      timeout: 20000,
      timeoutMsg: 'managed columns were not removed after Delete Data'
    })
    await expect(await Weather.colIdForName('temperature')).toBe(null)
  })
})

describe('Weather Delete Data — cancel keeps everything', () => {
  it('Cancel keeps the rows, columns and an enabled Delete Data button', async () => {
    await enterWeather('keep')
    await Weather.addColumn('pressure')
    const colId = await Weather.waitForColumn('pressure')
    await Weather.addRows(2)
    const beforeCols = await Weather.dataColumnCount()
    await openDeleteDialog()
    await Weather.deleteImportDialog.$(`button=${deleteImport.cancelButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(await Weather.rowCount()).toBe(2)
    await expect(await Weather.dataColumnCount()).toBe(beforeCols)
    await expect(Weather.columnNameInput(colId)).toBeDisplayed()
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(true)
  })
})

describe('Weather Delete Data — persistence across reopen', () => {
  it('the deletion survives reopening the same project', async () => {
    const { name } = await enterWeather('persist')
    await Weather.addRows(3)
    await expect(await Weather.rowCount()).toBe(3)
    await openDeleteDialog()
    await Weather.deleteImportDialog.$(`button=${deleteImport.confirmButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: 20000,
      timeoutMsg: 'rows did not clear after Delete Data'
    })

    // Reopen the SAME project from Home (backend session persists within the run).
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const homeId = await HomePage.rowIdForName(name)
    if (homeId === null) throw new Error(`could not find Home row for ${name}`)
    await HomePage.row(homeId).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })

    // Data stays deleted, and Delete Data is disabled again (no data).
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: 20000,
      timeoutMsg: 'deleted rows reappeared after reopening the project'
    })
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(false)
  })
})

describe('Weather add-column — invalid default error UI', () => {
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

  it('a symbol-only default is rejected as non-numeric', async () => {
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

describe('Weather add-column — default value back-fill', () => {
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

describe('Weather add-column — dialog close behavior', () => {
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

describe('Weather add-column — after a file import', () => {
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

describe('Weather add-column — column name handling', () => {
  it('accepts special characters in the column name', async () => {
    await enterWeather('ap38special')
    const special = 'co2 (#1) %/m²'
    await Weather.addColumn(special)
    const colId = await Weather.waitForColumn(special)
    await expect(Weather.columnNameInput(colId)).toHaveValue(special)
  })

  it('trims leading/trailing whitespace and adds the column', async () => {
    await enterWeather('ap40trim')
    // setReactInput drives the raw padded value; submit trims it (values.parameterName.trim()).
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', '   wind   ')
    await Weather.acSubmit.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    const colId = await Weather.waitForColumn('wind')
    await expect(Weather.columnNameInput(colId)).toHaveValue('wind')
  })

  it('accepts a long (valid, 30-char) name and renders it in the header', async () => {
    await enterWeather('ap39long')
    const longName = 'a'.repeat(30)
    await Weather.addColumn(longName)
    const colId = await Weather.waitForColumn(longName)
    await expect(Weather.columnNameInput(colId)).toHaveValue(longName)
    await expect(Weather.columnHeader(colId)).toBeDisplayed()
  })
})

describe('Weather add-column — re-add a name after deleting it', () => {
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

describe('Weather add-column — data-type dropdown options', () => {
  it('exposes a placeholder plus at least one real data type option', async () => {
    await enterWeather('ap21opts')
    await Weather.openAddColumns()
    const optionEls = await Weather.acDataType.$$('option')
    const values: string[] = []
    const texts: string[] = []
    for (const opt of optionEls) {
      values.push((await opt.getAttribute('value')) ?? '')
      texts.push((await opt.getText()).trim())
    }
    // Index 0 is the placeholder ("Select data type"); ≥1 real catalog type follows.
    expect(values.length).toBeGreaterThan(1)
    expect(texts[0]).toBe('Select data type')
    // Every non-placeholder option carries a non-empty value + label.
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).not.toBe('')
      expect(texts[i].length).toBeGreaterThan(0)
    }
    await Weather.acCancel.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather add-column — large dataset stays responsive', () => {
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

describe('Weather add-column — submit with data type + auto-selected unit', () => {
  // GAP 1: the existing "data-type/unit wiring" test (line ~404) selects a type,
  // checks the unit select enables, then CANCELS — it never submits, so neither
  // the base-unit auto-select (AddColumnDialog.tsx handleDataTypeChange ~162-175,
  // which sets unitId to `units.find(is_base) ?? units[0]`) nor the CREATED
  // column carrying that type/unit is exercised. Here we SUBMIT with only a data
  // type chosen (no unit override) and assert the new column's header picker
  // label reflects the auto-selected base unit — i.e. the type+unit landed on
  // the column. Catalog-agnostic: pick the FIRST real type the dialog offers and
  // read the expected base-unit label from the backend catalog; self-skip only
  // if the catalog exposes no selectable data type.
  it("the created column's header shows the auto-selected base unit", async function () {
    await enterWeather('gap1auto')

    // The unassigned header-picker label (DataTypeUnitPicker buttonLabel: no
    // unit + no type -> 'Data Type'). This is the "empty" state the differential
    // guards against.
    const UNASSIGNED_LABEL = 'Data Type'

    await Weather.openAddColumns()
    // Read the first REAL data-type option (index 0 is the "Select data type"
    // placeholder). This is catalog-agnostic: whatever type the app offers first.
    const typeOptions = await Weather.acDataType.$$('option')
    let firstType = ''
    for (const opt of typeOptions) {
      const value = (await opt.getAttribute('value')) ?? ''
      if (value !== '') {
        firstType = (await opt.getText()).trim()
        break
      }
    }
    if (firstType === '') {
      await Weather.acCancel.click()
      this.skip() // catalog exposes no selectable data type — nothing to assert.
      return
    }

    // Resolve which unit the dialog will AUTO-SELECT for this type from the same
    // catalog the app uses: base unit (is_base) else the first unit. The header
    // picker button then renders `unit.unit` (DataTypeUnitPicker buttonLabel).
    const catalog = await Weather.fetchCatalog()
    const catType = catalog?.find((t) => t.data_type === firstType)
    const baseUnit: WeatherCatalogUnit | undefined =
      catType?.units.find((u) => u.is_base) ?? catType?.units[0]
    if (!baseUnit) {
      await Weather.acCancel.click()
      this.skip() // the first type has no units — can't assert an auto-selected unit.
      return
    }

    // Select ONLY the data type — do NOT touch the unit select, so the base-unit
    // auto-select (handleDataTypeChange) is what carries a unit into submit.
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'autoUnit')
    await Weather.acDataType.selectByVisibleText(firstType)
    // The auto-select must land: the unit <select> now has a non-empty value.
    await browser.waitUntil(async () => (await Weather.acUnit.getValue()) !== '', {
      timeout: 10000,
      timeoutMsg: 'data-type change did not auto-select a unit (unitId stayed empty)'
    })
    await Weather.acSubmit.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 20000 })

    // The created column's header picker label must reflect the assigned unit.
    // The picker button also renders a decorative ▾ caret alongside the label
    // text, so normalize it out before comparing (getText concatenates both).
    const norm = (s: string): string => s.replace(/▾/g, '').trim()
    const colId = await Weather.waitForColumn('autoUnit')
    await browser.waitUntil(
      async () => norm(await Weather.headerPickerLabel(colId)) === baseUnit.unit,
      {
        timeout: 15000,
        timeoutMsg:
          `header picker label never became the base unit "${baseUnit.unit}" ` +
          '(type/unit was dropped on submit?)'
      }
    )
    const label = norm(await Weather.headerPickerLabel(colId))
    // Differential: if the dialog dropped the type/unit on submit, the column
    // would carry no unit and the label would be the unassigned 'Data Type'
    // (or the bare type name) — never the base unit's `unit` string.
    expect(label).toBe(baseUnit.unit)
    expect(label).not.toBe(UNASSIGNED_LABEL)
    expect(label).not.toBe(firstType)
  })
})

describe('Weather add-column — default value unit-range validation', () => {
  // GAP 2: AddColumnDialog.tsx validate (~83-94) runs validateCellValue on the
  // default value once a type + unit WITH a min/max range is assigned. An
  // out-of-range default sets formik.errors.defaultValue, which (a) surfaces the
  // range message (validation.ts formatRangeMessage ~44-49) and (b) gates the
  // submit button (disabled={loading || Boolean(errors.defaultValue)}) so the
  // dialog stays open. We probe the catalog for a bounded unit comfortably inside
  // the global ±1e6 (so the UNIT message trips, not the global one), assign it in
  // the dialog, and assert both the OUT-of-range rejection AND an IN-range accept
  // (differential control). Self-skips if no bounded unit exists.
  it('rejects an out-of-unit-range default and accepts an in-range one', async function () {
    await enterWeather('gap2range')

    const catalog = await Weather.fetchCatalog()
    if (!catalog) {
      // Catalog fetch failed (backend unreachable) — cannot probe ranges.
      this.skip()
      return
    }

    // Find a (type, unit) whose unit carries a finite bound well inside the
    // global ±1e6, so validateCellValue emits the UNIT message rather than the
    // global one. Same defensive bound as the existing cell unit-range test.
    let picked:
      | { type: WeatherCatalogType; unit: WeatherCatalogUnit; min: number | null; max: number | null }
      | null = null
    for (const type of catalog) {
      const unit = type.units.find(
        (u) =>
          (Number.isFinite(u.min) || Number.isFinite(u.max)) &&
          (u.max == null || u.max < 999_999) &&
          (u.min == null || u.min > -999_999)
      )
      if (unit) {
        picked = { type, unit, min: unit.min, max: unit.max }
        break
      }
    }
    if (!picked) {
      // No catalog unit exposes a finite in-global-bound min/max range.
      this.skip()
      return
    }

    const { min, max } = picked
    // Derive an OUT-of-range and an IN-range value from whichever bound(s) exist.
    let over: number
    let inside: number
    if (min != null && max != null) {
      over = max + 1
      inside = (min + max) / 2
    } else if (max != null) {
      over = max + 1
      inside = max - 1
    } else {
      // min-only bound.
      over = (min as number) - 1
      inside = (min as number) + 1
    }
    // The exact message formatRangeMessage produces for this unit's bounds.
    const expectedMessage =
      min != null && max != null
        ? `Value should be between ${min} and ${max}`
        : max != null
          ? `Values should be ≤ ${max}`
          : `Values should be ≥ ${min}`

    // Open the dialog, assign the bounded type + unit, and set an OUT-of-range
    // default. Selecting the type auto-selects a base unit, so we OVERRIDE with
    // the exact bounded unit label the <select> renders.
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'ranged')
    await Weather.acDataType.selectByVisibleText(picked.type.data_type)
    await browser.waitUntil(async () => Weather.acUnit.isEnabled(), {
      timeout: 10000,
      timeoutMsg: 'unit select never enabled after choosing the bounded data type'
    })
    await Weather.acUnit.selectByVisibleText(Weather.unitSelectLabel(picked.unit))
    await Weather.setReactInput('[data-testid="input-defaultValue"]', String(over))

    // (a) OUT-of-range -> the unit range message shows AND submit is gated.
    await Weather.acDefaultError.waitForDisplayed({ timeout: 10000 })
    await expect(Weather.acDefaultError).toHaveText(expectedMessage)
    // Not the GLOBAL bound message — this is the UNIT-specific range.
    expect(await Weather.acDefaultError.getText()).not.toContain('1000000')
    await expect(await Weather.acSubmit.isEnabled()).toBe(false)
    // Submit is gated -> the dialog stays open (clicking does nothing).
    await Weather.acSubmit.click()
    await expect(Weather.addColumnDialog).toBeDisplayed()

    // (b) IN-range control -> the range error clears and submit re-enables. This
    // guards the test from being vacuous ("any default is rejected").
    await Weather.setReactInput('[data-testid="input-defaultValue"]', String(inside))
    await Weather.acDefaultError.waitForDisplayed({ reverse: true, timeout: 10000 })
    await browser.waitUntil(async () => Weather.acSubmit.isEnabled(), {
      timeout: 10000,
      timeoutMsg: 'submit stayed gated for an in-range default (false positive)'
    })
    await expect(await Weather.acSubmit.isEnabled()).toBe(true)

    await Weather.acCancel.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})
