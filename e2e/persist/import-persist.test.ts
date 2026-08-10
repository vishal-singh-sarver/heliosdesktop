/**
 * Import + data-type/unit + validation persistence across a full relaunch.
 *
 * Runs under wdio.persist.config.ts (FIXED profile, so the SQLite DB survives an
 * in-run browser.reloadSession relaunch). Lives in its OWN spec file — and thus
 * its OWN fresh Electron session — on purpose: driving several relaunch tests in
 * a single session accumulates dangling CDP connections (a wdio-electron quirk
 * that surfaces as flaky "Cannot find context" errors, worst for the test that
 * also uses browser.electron.execute for the import stub). A dedicated session
 * keeps this deterministic; it passed in isolation but flaked when chained after
 * the other persistence tests in the same session.
 *
 * What it proves survives a create -> import -> assign type -> change unit ->
 * close -> reopen cycle: the imported rows, the imported cell value, the column's
 * data type + (changed) unit, and range validation re-arming from them.
 */

import { existsSync } from 'node:fs'
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import { selectAll, stubFileImport, waitForMainWindow } from '../support/harness'
import { PERSIST_DB, relaunchAndReopen } from './persist-helpers'
import { TIMEOUTS } from '../config/timeouts'
import { DEFAULT_COORDS } from '../constants/test-data'

/**
 * Type a value into a table cell via WebDriver keystrokes (NOT browser.execute)
 * and WITHOUT blurring. Keystrokes avoid the stale-CDP-context risk after a
 * relaunch, and no blur means no PATCH — so an out-of-range value stays flagged.
 * React's onChange still fires on the keys, so client validation runs.
 */
async function typeCell(rowId: string, colId: string, value: string): Promise<void> {
  const input = Weather.cellInput(rowId, colId)
  await input.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
  await input.click()
  await selectAll()
  await browser.keys(['Delete'])
  await input.addValue(value)
}

describe('Persistence — import + data type/unit + validation across relaunch', () => {
  it('imported rows + an assigned data type/unit + validation survive a full relaunch', async function () {
    this.timeout(180000)
    await waitForMainWindow()

    // The shared fixed profile may leave the app on a ProjectScreen (another spec
    // ran first); return to Home so the create flow below finds the sidebar.
    if (await ProjectScreen.goHomeButton.isDisplayed().catch(() => false)) {
      await ProjectScreen.goHome()
    }

    // 1) Create a project on the fixed profile and land on the Weather table.
    const name = `pimp-${Date.now().toString().slice(-6)}`.slice(0, 30)
    await HomePage.sidebarNewProject.waitForDisplayed({ timeout: TIMEOUTS.XLONG })
    await HomePage.openCreateDialogViaSidebar()
    await HomePage.fillAndSubmitCreate(name, DEFAULT_COORDS.lat, DEFAULT_COORDS.lon)
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    // 2) IMPORT a 2-row CSV (datetime + a numeric column). stubFileImport feeds the
    //    content to the (stubbed) native dialog; runImport drives the wizard to end.
    const csv = ['datetime,wxtemp', '2026-01-01T00:00:00Z,5', '2026-01-01T01:00:00Z,7'].join('\n')
    await stubFileImport(csv, 'persist-import.csv')
    await Weather.runImport()
    const impColId = await Weather.waitForColumn('wxtemp')
    await browser.waitUntil(async () => (await Weather.visibleRowIds()).length === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'imported rows never appeared'
    })
    const [impRow0] = await Weather.visibleRowIds()
    await browser.waitUntil(
      async () => (await Weather.cellInput(impRow0, impColId).getValue()) === '5',
      { timeout: 15000, timeoutMsg: 'imported value 5 never rendered' }
    )

    // 3) Add a managed column choosing ONLY the data type (the is_base unit K
    //    auto-selects — wait for it before submit), then CHANGE the unit to °C. The
    //    imported rows back-fill it. This type + changed unit is what we verify.
    await Weather.openAddColumns()
    await Weather.setReactInput('[data-testid="input-parameterName"]', 'trange')
    await Weather.acDataType.selectByVisibleText('air_temperature')
    await browser.waitUntil(async () => (await Weather.acUnit.getValue()) !== '', {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'base unit did not auto-select for air_temperature'
    })
    await Weather.acSubmit.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.LONG })
    const trColId = await Weather.waitForColumn('trange')
    await Weather.changeUnit(trColId, 'C')
    const unitLabel = async (colId: string): Promise<string> =>
      (await Weather.headerPickerLabel(colId)).replace(/▾/g, '').trim()
    await browser.waitUntil(async () => (await unitLabel(trColId)) === 'C', {
      timeout: 15000,
      timeoutMsg: 'unit did not change to °C before relaunch'
    })

    // 4) Sanity BEFORE relaunch: the assigned Celsius range validates (client-side;
    //    typeCell fires the change event without a backend write).
    await typeCell(impRow0, trColId, '999')
    await browser.waitUntil(async () => (await Weather.cellInvalid(impRow0, trColId)) === 'true', {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'out-of-range value did not flag before relaunch'
    })
    expect(await Weather.cellError(impRow0, trColId)).toBe('Value should be between -50.15 and 76.85')

    expect(existsSync(PERSIST_DB)).toBe(true)

    // 5) FULL relaunch on the SAME fixed profile, then reopen the project.
    const homeId = await relaunchAndReopen(name)
    await HomePage.row(homeId).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    // 6) ROWS survived: the two imported rows are back on the table.
    await browser.waitUntil(async () => (await Weather.visibleRowIds()).length === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'imported rows did not survive the relaunch'
    })
    const [reRow0] = await Weather.visibleRowIds()

    // 6a) Imported VALUE survived.
    const reImpColId = await Weather.waitForColumn('wxtemp')
    await expect(Weather.cellInput(reRow0, reImpColId)).toHaveValue('5')

    // 6b) TYPE + UNIT survived: the column still shows the assigned °C unit
    //     (re-derived from the persisted data_type_id + unit_id).
    const reTrColId = await Weather.waitForColumn('trange')
    await browser.waitUntil(async () => (await unitLabel(reTrColId)) === 'C', {
      timeout: 15000,
      timeoutMsg: 'assigned °C unit did not survive the relaunch'
    })

    // 6c) VALIDATION survived: the persisted unit re-arms range validation after a
    //     cold reload. An out-of-range value flags with the SAME Celsius message;
    //     an in-range value clears it (guards against "everything is invalid").
    await typeCell(reRow0, reTrColId, '999')
    await browser.waitUntil(async () => (await Weather.cellInvalid(reRow0, reTrColId)) === 'true', {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'validation did not re-arm after relaunch (out-of-range not flagged)'
    })
    expect(await Weather.cellError(reRow0, reTrColId)).toBe('Value should be between -50.15 and 76.85')

    await typeCell(reRow0, reTrColId, '20')
    await browser.waitUntil(async () => (await Weather.cellInvalid(reRow0, reTrColId)) === null, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'in-range value did not clear aria-invalid after relaunch'
    })

    // Leave the shared fixed profile on Home so another spec's fresh launch (same
    // profile) doesn't boot into this project's ProjectScreen.
    await ProjectScreen.goHome()
  })
})
