/**
 * Weather CRUD E2E — add/delete columns & rows, header rename + validation,
 * cell editing (optimistic + persisted across reopen) and numeric-format
 * rejection. Built from the verified matrix (design doc Section 5).
 *
 * Verified facts honored:
 *  - A freshly added column is backend-managed: its header is an input
 *    aria-label="Column {colId} name"; colId is the dynamic backend header id
 *    (resolved at runtime). Editable cell aria-label="{rowId} {colId}".
 *  - Add-dialog field errors use FormField error-{name}; the empty-required error
 *    only renders after the field is touched (submit touches all).
 *  - Add Column submit is disabled while errors.defaultValue is truthy.
 *  - Row ids are index-based and reset on every refetch — re-resolve after a mutation.
 *  - Network fault-injection cases are out of scope (no harness hook) — dropped.
 */
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import { enterProject, reloadToHome, uniqueName, waitForMainWindow } from '../support/harness'

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

async function enterWeather(label = 'crud'): Promise<{ id: string; name: string }> {
  const project = await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
  return project
}

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
})
