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
  // Fix: point deleteRowsRequest at API_ROUTES.weather.delete (the correct path
  // already exists in constants) + update service.test.ts. This goes green once
  // the row is actually deleted.
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
