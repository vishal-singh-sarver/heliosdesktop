/**
 * Persistence across app close/reopen — runs under wdio.persist.config.ts, which
 * pins a FIXED --user-data-dir so the SQLite DB + localStorage session-id survive
 * a full relaunch (browser.reloadSession reuses the same capabilities/appArgs).
 *
 * This is the real answer to "open the app, create a project, close it, open it
 * again — is the project still there?" — which the main suite CANNOT test because
 * each of its launches gets a throwaway profile (fresh empty DB).
 */

import { existsSync } from 'node:fs'
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import { waitForMainWindow } from '../support/harness'
import { PERSIST_DB, relaunchAndReopen } from './persist-helpers'
import { TIMEOUTS } from '../config/timeouts'
import { DEFAULT_COORDS } from '../constants/test-data'

describe('Persistence across app close/reopen', () => {
  it('a created project survives a full relaunch (fixed profile)', async () => {
    await waitForMainWindow()

    // 1) Create a project on this fixed profile.
    const name = `persist-${Date.now().toString().slice(-6)}`.slice(0, 30)
    await HomePage.sidebarNewProject.waitForDisplayed({ timeout: TIMEOUTS.XLONG })
    await HomePage.openCreateDialogViaSidebar()
    await HomePage.fillAndSubmitCreate(name, DEFAULT_COORDS.lat, DEFAULT_COORDS.lon)
    // Success navigates away from HomePage (and writes the active ids).
    await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.LONG })

    // Load-bearing pin check (reliable, filesystem-based): the backend wrote its
    // SQLite DB under the FIXED profile, proving the --user-data-dir was honored
    // (the app skipped its own userData override). If this is false, persistence
    // can't work — fail fast with a clear message.
    expect(existsSync(PERSIST_DB)).toBe(true)

    // 2) FULL relaunch on the SAME fixed profile, landing back on Home with the
    //    previously created project's row present.
    const id = await relaunchAndReopen(name)

    // 3) The reopened app shows Home, and the previously created project is there.
    await expect(HomePage.row(id)).toHaveText(name, { containing: true })
  })

  it('weather data survives a full relaunch (fixed profile)', async () => {
    await waitForMainWindow()

    // 1) Create a project — a successful create navigates to the ProjectScreen and
    //    writes the active ids, so we land on the project (not Home).
    const name = `pdata-${Date.now().toString().slice(-6)}`.slice(0, 30)
    await HomePage.sidebarNewProject.waitForDisplayed({ timeout: TIMEOUTS.XLONG })
    await HomePage.openCreateDialogViaSidebar()
    await HomePage.fillAndSubmitCreate(name, DEFAULT_COORDS.lat, DEFAULT_COORDS.lon)
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    // 2) Add REAL weather data: a managed column + a row, and edit the cell to a
    //    known value. This is the payload whose survival we actually verify.
    await Weather.addColumn('persistval')
    const colId = await Weather.waitForColumn('persistval')
    await Weather.addRows(1)
    const rowIds = await Weather.visibleRowIds()
    if (rowIds.length === 0) throw new Error('no weather row appeared after addRows')
    const rowId = rowIds[0]
    await Weather.editCell(rowId, colId, '42')
    // editCell commits on blur; wait until the cell input reflects the committed
    // value (the PATCH round-trips before relaunch) so we never relaunch mid-write.
    await browser.waitUntil(
      async () => (await Weather.cellInput(rowId, colId).getValue()) === '42',
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'edited cell never showed 42 before relaunch' }
    )

    // Filesystem proof the FIXED profile is honored — without it the DB is a
    // throwaway and nothing could persist.
    expect(existsSync(PERSIST_DB)).toBe(true)

    // 3) FULL relaunch on the SAME fixed profile, landing back on Home, then open
    //    the project.
    const homeId = await relaunchAndReopen(name)
    await HomePage.row(homeId).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    // 4) Re-resolve the column + row and ASSERT the edited cell value survived.
    //    Differential: if the DB weren't persisted (throwaway profile) the column
    //    would be missing and waitForColumn would time out; if the cell edit
    //    weren't persisted the value would not be '42' and this assertion fails.
    const reColId = await Weather.waitForColumn('persistval')
    const reRowIds = await Weather.visibleRowIds()
    if (reRowIds.length === 0) {
      throw new Error(
        `No weather rows after relaunch for "${name}". dbExists=${existsSync(PERSIST_DB)} ` +
          `colId=${reColId}`
      )
    }
    const reRowId = reRowIds[0]
    const survived = await Weather.cellInput(reRowId, reColId).getValue()
    if (survived !== '42') {
      const diag = await browser.execute(() => ({
        sessionAfter: localStorage.getItem('helios_session_id'),
        rowCount: document.querySelectorAll('[data-testid^="weather-row-"]').length
      }))
      throw new Error(
        `Weather cell did not survive relaunch: expected "42", got "${survived}". ` +
          `dbExists=${existsSync(PERSIST_DB)} reColId=${reColId} reRowId=${reRowId} ` +
          `diag=${JSON.stringify(diag)}`
      )
    }
    await expect(Weather.cellInput(reRowId, reColId)).toHaveValue('42')
  })
})
