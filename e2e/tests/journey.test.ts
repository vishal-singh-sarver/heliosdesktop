/**
 * Helios SMOKE JOURNEY — one comprehensive happy-flow that carries a single
 * project through every feature, hitting each distinct validation once, then
 * creates sibling projects and cleans up. Phases run in order and CHAIN (no
 * beforeEach reset): each `it` continues the app state from the previous one, so
 * a failure names the exact phase and later phases still run (no bail).
 *
 * Coverage: create (+ create-dialog validation) → coordinate validation + UTC →
 * import a real CSV → manual Add-Rows (+ validation) → managed columns (default
 * back-fill + column-name validation) → cell edit + cell validation (non-numeric
 * gate, unit range, global ±1e6) → unit conversion round-trip → row selection →
 * delete column + delete row → multiple projects (coexist + switch) → reopen
 * (everything persisted) → rename → delete cleanup.
 *
 * Phase 9 delete-row asserts the deleted row actually disappears. Because the
 * table is virtualized, it checks that the SPECIFIC deleted row unmounts (not a
 * rendered-row count, which shifts when the delete-click scrolls the window).
 * Every phase is a differential green assertion.
 *
 * Run: npm run e2e:smoke  (wdio --spec ./e2e/tests/journey.test.ts)
 */

import { join } from 'node:path'
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import {
  ACTIVE_PROJECT_KEY,
  ACTIVE_SCENARIO_KEY,
  enterProject,
  getStorage,
  setInputValue,
  stubRealFile,
  uniqueName,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'

before(async () => {
  await waitForMainWindow()
  // Heavy real-file imports are timing-sensitive; make sure the backend is up
  // before the first import so we don't pay cold-start inside a timed phase.
  await waitForBackendReady()
})

const FIX = join(process.cwd(), 'e2e', 'fixtures', 'weather')
const fixture = (name: string): string => join(FIX, name)

/** Read a numeric cell value as a finite number (throws with context otherwise). */
async function numericCell(rowId: string, colId: string): Promise<number> {
  const raw = await Weather.cellInput(rowId, colId).getValue()
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new Error(`cell[${rowId}/${colId}] = "${raw}" is not numeric`)
  return n
}

/** Return Home and reopen a project by name, landing back on its Weather table. */
async function reopen(name: string): Promise<void> {
  await ProjectScreen.goHome()
  await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
  const homeId = await HomePage.rowIdForName(name)
  if (!homeId) throw new Error(`project "${name}" not found on Home`)
  await HomePage.row(homeId).doubleClick()
  await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
  // M2 wraps the workspace in tabs (default "3D Window"); activate Weather.
  await ProjectScreen.selectTab('weather')
  await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: 20000 })
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
}

describe('Helios smoke journey', () => {
  // Shared state threaded across the phases.
  const A = { id: '', name: '' }
  const B = { id: '', name: '' }
  const C = { id: '', name: '' }
  let committedUtc = ''
  let importedRowCount = 0

  it('1. create project A — an invalid coordinate is blocked, then a valid create lands on Weather', async function () {
    this.timeout(60000)
    const name = uniqueName('smoke')
    await HomePage.openCreateDialogViaSidebar()
    await HomePage.createDialog.waitForDisplayed({ timeout: 15000 })
    await setInputValue(HomePage.createNameInput, name)
    await setInputValue(HomePage.createLonInput, '-120.25')
    // Invalid latitude (out of [-90, 90]) → Create is BLOCKED (disabled, or the
    // dialog stays open on submit). Handle both shapes.
    await setInputValue(HomePage.createLatInput, '95')
    if (await HomePage.createSubmitButton.isEnabled()) {
      await HomePage.createSubmitButton.click()
      expect(await HomePage.createDialog.isDisplayed()).toBe(true)
    } else {
      expect(await HomePage.createSubmitButton.isEnabled()).toBe(false)
    }
    // Fix latitude → create succeeds and navigates to the project screen.
    await setInputValue(HomePage.createLatInput, '45.5')
    await browser.waitUntil(async () => HomePage.createSubmitButton.isEnabled(), {
      timeout: 8000,
      timeoutMsg: 'Create never became enabled with valid coordinates'
    })
    await HomePage.createSubmitButton.click()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 20000 })
    await browser.waitUntil(async () => (await getStorage(ACTIVE_SCENARIO_KEY)) != null, {
      timeout: 20000,
      timeoutMsg: 'activeScenarioId never set after create'
    })
    const id = await getStorage(ACTIVE_PROJECT_KEY)
    if (!id) throw new Error('no active project id after create')
    A.id = id
    A.name = name
    // M2 wraps the workspace in tabs (default "3D Window"); activate Weather.
    await ProjectScreen.selectTab('weather')
    await expect(ProjectScreen.weatherSentinel).toBeDisplayed()
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
  })

  it('2. coordinate validation on the header, then commit a valid longitude (UTC recomputes)', async () => {
    const utc0 = await ProjectScreen.getUtcValue()
    // Out-of-range latitude → aria-invalid (latitude never drives UTC).
    await ProjectScreen.setCoordinate('latitude', '95')
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('latitude')) === 'true', {
      timeout: 10000,
      timeoutMsg: 'out-of-range latitude was not flagged'
    })
    await ProjectScreen.setCoordinate('latitude', '45.5')
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('latitude')) === null, {
      timeout: 10000,
      timeoutMsg: 'valid latitude did not clear aria-invalid'
    })
    // Out-of-range longitude → aria-invalid AND UTC not recomputed (commit-gated).
    await ProjectScreen.setCoordinate('longitude', '200')
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('longitude')) === 'true', {
      timeout: 10000,
      timeoutMsg: 'out-of-range longitude was not flagged'
    })
    expect(await ProjectScreen.getUtcValue()).toBe(utc0)
    // > 7 decimals → aria-invalid.
    await ProjectScreen.setCoordinate('latitude', '12.12345678')
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('latitude')) === 'true', {
      timeout: 10000,
      timeoutMsg: '>7-decimal latitude was not flagged'
    })
    await ProjectScreen.setCoordinate('latitude', '45.5')
    // Non-numeric → aria-invalid.
    await ProjectScreen.setCoordinate('longitude', 'abc')
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('longitude')) === 'true', {
      timeout: 10000,
      timeoutMsg: 'non-numeric longitude was not flagged'
    })
    // Commit a valid far-band longitude → UTC recomputes; capture for the reopen.
    await ProjectScreen.setCoordinate('longitude', '78.486')
    await browser.waitUntil(async () => (await ProjectScreen.getUtcValue()) !== utc0, {
      timeout: 10000,
      timeoutMsg: 'UTC offset did not recompute after committing a valid longitude'
    })
    committedUtc = await ProjectScreen.getUtcValue()
  })

  it('3. import a real provider CSV and verify the data is consistent', async function () {
    this.timeout(60000)
    await stubRealFile(fixture('davis, ca yesterday.csv'))
    const imported = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SS' }
    })
    expect(imported).toBe(true)
    const humidityCol = await Weather.waitForColumn('humidity')
    await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 1, {
      timeout: 30000,
      timeoutMsg: 'davis import did not produce rows'
    })
    // First imported humidity matches the file (stored float32 → tolerance).
    const [firstRow] = await Weather.visibleRowIds()
    const humidity = await numericCell(firstRow, humidityCol)
    if (Math.abs(humidity - 70.98) > 0.01) {
      throw new Error(`humidity[row0] = ${humidity}, expected ~70.98 from the file`)
    }
  })

  it('4. add rows manually — invalid input is gated, then a valid submit grows the table', async function () {
    this.timeout(60000)
    importedRowCount = await Weather.rowCount()
    await Weather.openAddRows()
    // Dialog seeds start date/time from the last imported row (async effect).
    await browser.waitUntil(async () => (await Weather.arStartDate.getValue()) !== '', {
      timeout: 10000,
      timeoutMsg: 'Add-Rows did not seed its start date'
    })
    const seededDate = await Weather.arStartDate.getValue()
    // Invalid count (0) → submit is gated, dialog stays open.
    await Weather.setReactInput('[data-testid="input-numberOfRows"]', '0')
    await Weather.arSubmit.click()
    expect(await Weather.addRowsDialog.isDisplayed()).toBe(true)
    // Invalid (empty) start date → still gated.
    await Weather.setReactInput('[data-testid="input-numberOfRows"]', '3')
    await Weather.setReactInput('[data-testid="input-startDate"]', '')
    await Weather.arSubmit.click()
    expect(await Weather.addRowsDialog.isDisplayed()).toBe(true)
    // Fix the start date → 3 rows are added.
    await Weather.setReactInput('[data-testid="input-startDate"]', seededDate)
    await Weather.arSubmit.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    await browser.waitUntil(async () => (await Weather.rowCount()) === importedRowCount + 3, {
      timeout: 20000,
      timeoutMsg: `expected ${importedRowCount + 3} rows after manually adding 3`
    })
  })

  it('5. add managed columns (default back-fill + no-default) with column-name validation', async function () {
    this.timeout(60000)
    // Column-name validation: an empty name is gated.
    await Weather.openAddColumns()
    if (await Weather.acSubmit.isEnabled()) {
      await Weather.setReactInput('[data-testid="input-parameterName"]', 'x')
      await Weather.setReactInput('[data-testid="input-parameterName"]', '')
      await Weather.acSubmit.click()
      expect(await Weather.addColumnDialog.isDisplayed()).toBe(true)
    } else {
      expect(await Weather.acSubmit.isEnabled()).toBe(false)
    }
    await Weather.acCancel.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })

    // A column WITH a default → it back-fills the imported rows.
    await Weather.addColumn('note', { defaultValue: '7' })
    const noteCol = await Weather.waitForColumn('note')
    const rows = await Weather.visibleRowIds()
    await browser.waitUntil(async () => (await Weather.cellInput(rows[1], noteCol).getValue()) === '7', {
      timeout: 20000,
      timeoutMsg: 'default value did not back-fill an imported row'
    })

    // A duplicate name ("note") is rejected — the dialog stays open.
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'note')
    await Weather.acSubmit.click()
    await browser.pause(1000)
    expect(await Weather.addColumnDialog.isDisplayed()).toBe(true)
    await Weather.acCancel.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })

    // A column WITHOUT a default (used for cell/unit validation next).
    await Weather.addColumn('measure')
    await Weather.waitForColumn('measure')

    // Edit note[row0] to a value distinct from the default (the persist target).
    await Weather.editCell(rows[0], noteCol, '42')
    await browser.waitUntil(async () => (await Weather.cellInput(rows[0], noteCol).getValue()) === '42', {
      timeout: 15000,
      timeoutMsg: 'edited note cell did not commit'
    })
  })

  it('6. cell validation — non-numeric gate, unit range, and the global ±1e6 bound', async function () {
    this.timeout(60000)
    const measureCol = await Weather.waitForColumn('measure')
    const [row] = await Weather.visibleRowIds()
    // Non-numeric keystrokes never reach the draft (the CellInput gate).
    const cell = Weather.cellInput(row, measureCol)
    await cell.click()
    await cell.addValue('abc')
    await expect(cell).toHaveValue('')

    // Assign a bounded unit so range validation arms.
    await Weather.assignDataTypeUnit(measureCol, 'air_temperature', 'K')
    // Above the unit's max → the unit range message. IMPORTANT: gate on the error
    // MESSAGE itself, not aria-invalid. aria-invalid flips on the <input> a beat
    // before the validation tooltip mounts; gating on aria-invalid and then
    // reading cellError races the tooltip render under load and reads null
    // (setReactInput = change only, no blur, so the committed value is untouched).
    await Weather.setReactInput(`[aria-label="${row} ${measureCol}"]`, '500')
    await browser.waitUntil(
      async () => (await Weather.cellError(row, measureCol)) === 'Value should be between 223 and 350',
      { timeout: 10000, timeoutMsg: 'unit-range message (223–350) never appeared for 500 K' }
    )
    // Beyond the global ±1e6 hard bound → the GLOBAL message wins over the unit one.
    await Weather.setReactInput(`[aria-label="${row} ${measureCol}"]`, '2000000')
    await browser.waitUntil(
      async () =>
        (await Weather.cellError(row, measureCol)) === 'Value should be between -1000000 and 1000000.',
      { timeout: 10000, timeoutMsg: 'global ±1e6 message never appeared for 2000000' }
    )
    // Commit a valid in-range value → flag + message clear; leaves 300 K committed
    // for the conversion phase.
    await Weather.editCell(row, measureCol, '300')
    await browser.waitUntil(async () => (await Weather.cellError(row, measureCol)) === null, {
      timeout: 10000,
      timeoutMsg: 'validation error did not clear for in-range 300 K'
    })
    await browser.waitUntil(async () => (await Weather.cellInvalid(row, measureCol)) === null, {
      timeout: 10000,
      timeoutMsg: 'in-range value did not clear aria-invalid'
    })
  })

  it('7. unit conversion round-trip — 300 K → °C → K restores', async function () {
    this.timeout(60000)
    const measureCol = await Weather.waitForColumn('measure')
    const [row] = await Weather.visibleRowIds()
    // 300 K → 26.85 °C (affine: C = K − 273.15).
    await Weather.changeUnit(measureCol, 'C')
    await browser.waitUntil(
      async () => Math.abs((await numericCell(row, measureCol)) - 26.85) < 0.2,
      { timeout: 15000, timeoutMsg: '300 K did not convert to ~26.85 °C' }
    )
    // Back to K → restores ~300 (float32 storage → small tolerance).
    await Weather.changeUnit(measureCol, 'K')
    await browser.waitUntil(async () => Math.abs((await numericCell(row, measureCol)) - 300) < 0.5, {
      timeout: 15000,
      timeoutMsg: '°C did not convert back to ~300 K'
    })
  })

  it('8. row selection — a row checkbox and select-all toggle', async () => {
    const rows = await Weather.visibleRowIds()
    const initial = await Weather.rowCheckbox(rows[0]).isSelected()
    await Weather.rowCheckbox(rows[0]).click()
    await browser.waitUntil(async () => (await Weather.rowCheckbox(rows[0]).isSelected()) === !initial, {
      timeout: 10000,
      timeoutMsg: 'row checkbox did not toggle'
    })
    // Select-all selects every visible row…
    await Weather.selectAllCheckbox.click()
    await browser.waitUntil(async () => Weather.rowCheckbox(rows[rows.length - 1]).isSelected(), {
      timeout: 10000,
      timeoutMsg: 'select-all did not select the last row'
    })
    // …and toggling it again clears them, leaving a clean state.
    await Weather.selectAllCheckbox.click()
    await browser.waitUntil(async () => !(await Weather.rowCheckbox(rows[0]).isSelected()), {
      timeout: 10000,
      timeoutMsg: 'select-all did not clear the rows'
    })
  })

  it('9. delete a column and a row (both are removed)', async function () {
    this.timeout(60000)
    // Delete the measure column → it disappears.
    const measureCol = await Weather.waitForColumn('measure')
    await Weather.deleteColumn(measureCol)
    await browser.waitUntil(async () => (await Weather.colIdForName('measure')) === null, {
      timeout: 15000,
      timeoutMsg: 'measure column did not disappear after delete'
    })

    // Delete the LAST (manually-added) row and assert it is actually removed.
    // We target the last row so phase 11's note[row0]/note[row1] persistence
    // checks stay on the untouched imported rows.
    //
    // The table is VIRTUALIZED, so counting rendered rows (rowCount) is NOT a
    // reliable signal here: clicking the last row's delete button scrolls the
    // body to the bottom, which shifts the virtual window — after the delete the
    // rendered-row count no longer equals countBefore - 1 (that only holds when
    // every row fits on screen without scrolling, as in the 2-row weather test).
    // Instead assert the SPECIFIC deleted row disappears from the DOM. The click
    // leaves us scrolled to the bottom where that row lives, so a genuine removal
    // unmounts it while an optimistic rollback (row reappears) keeps it — the
    // assertion stays differential without depending on the windowed count.
    const rowsBefore = await Weather.visibleRowIds()
    const deletedId = rowsBefore[rowsBefore.length - 1]
    await Weather.deleteRow(deletedId)
    await Weather.row(deletedId).waitForExist({
      reverse: true,
      timeout: 15000,
      timeoutMsg:
        `delete-row did not remove row "${deletedId}" — it reappeared (optimistic ` +
        `rollback). Check the /deleteRow route and delete_rows semantics (backend-api).`
    })
  })

  it('10. multiple projects coexist and switching shows the right one', async function () {
    this.timeout(90000)
    // Create two sibling projects with distinct coordinates.
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const b = await enterProject('smokeB', '10.5', '20.5')
    B.id = b.id
    B.name = b.name
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const c = await enterProject('smokeC', '-33.9', '18.4')
    C.id = c.id
    C.name = c.name
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })

    // All three coexist in the Home list.
    expect(await HomePage.rowIdForName(A.name)).not.toBe(null)
    expect(await HomePage.rowIdForName(B.name)).not.toBe(null)
    expect(await HomePage.rowIdForName(C.name)).not.toBe(null)

    // Open B → it shows ITS OWN coordinates (not A's or C's stale data).
    const bId = await HomePage.rowIdForName(B.name)
    await HomePage.row(bId as string).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await browser.waitUntil(
      async () => Math.abs(Number(await ProjectScreen.getCoordValue('latitude')) - 10.5) < 0.01,
      { timeout: 15000, timeoutMsg: "project B did not show its own latitude (10.5)" }
    )
    expect(Math.abs(Number(await ProjectScreen.getCoordValue('longitude')) - 20.5)).toBeLessThan(0.01)
  })

  it('11. reopen project A — column, default back-fill, edited cell, and coordinates persisted', async function () {
    this.timeout(60000)
    await reopen(A.name)
    const noteCol = await Weather.waitForColumn('note')
    const rows = await Weather.visibleRowIds()
    // The edited cell and the untouched back-filled cell both survived.
    await expect(Weather.cellInput(rows[0], noteCol)).toHaveValue('42')
    await expect(Weather.cellInput(rows[1], noteCol)).toHaveValue('7')
    // Coordinates + backend-derived UTC survived (float32 coords → tolerance).
    const lon = Number(await ProjectScreen.getCoordValue('longitude'))
    if (Math.abs(lon - 78.486) > 0.01) {
      throw new Error(`committed longitude did not persist: got ${lon}, expected ~78.486`)
    }
    const lat = Number(await ProjectScreen.getCoordValue('latitude'))
    if (Math.abs(lat - 45.5) > 0.01) {
      throw new Error(`create-time latitude did not persist: got ${lat}, expected ~45.5`)
    }
    expect(await ProjectScreen.getUtcValue()).toBe(committedUtc)
  })

  it('11b. sweep project A empty — delete every managed column, then every row', async function () {
    this.timeout(180000)
    // Runs AFTER the phase-11 persistence checks so it can tear the table all the
    // way down without disturbing the note[row0]/note[row1] assertions. Deleting
    // ~two dozen rows one by one exercises the delete-row path at volume (the
    // single-delete in phase 9 only proved it once). We are on project A's Weather
    // table (reopened in phase 11).
    await Weather.deleteAllManagedColumns()
    await expect((await Weather.managedColumnIds()).length).toBe(0)
    await Weather.deleteAllRows()
    await expect(await Weather.rowCount()).toBe(0)
  })

  it('12. rename project A, then delete A, B, and C from Home', async function () {
    this.timeout(60000)
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    // Rename A.
    const renameId = await HomePage.rowIdForName(A.name)
    if (!renameId) throw new Error(`project "${A.name}" missing before rename`)
    const renamed = uniqueName('smokeRenamed')
    await HomePage.openRowMenu(A.name)
    await HomePage.requestRename(renameId)
    await expect(HomePage.renameNameInput).toHaveValue(A.name)
    await setInputValue(HomePage.renameNameInput, renamed)
    await HomePage.renameSaveButton.click()
    await HomePage.renameDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
    await browser.waitUntil(async () => (await HomePage.row(renameId).getText()).includes(renamed), {
      timeout: 15000,
      timeoutMsg: 'row never showed the new name after rename'
    })
    expect(await HomePage.rowIdForName(A.name)).toBe(null)
    A.name = renamed

    // Delete all three so the shared backend session does not accumulate.
    for (const name of [A.name, B.name, C.name]) {
      const id = await HomePage.rowIdForName(name)
      if (!id) throw new Error(`project "${name}" missing before delete`)
      await HomePage.openRowMenu(name)
      await HomePage.requestDelete(id)
      await HomePage.confirmDelete()
      await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
      await browser.waitUntil(async () => (await HomePage.rowIdForName(name)) === null, {
        timeout: 15000,
        timeoutMsg: `project "${name}" was not removed after delete`
      })
    }
  })
})
