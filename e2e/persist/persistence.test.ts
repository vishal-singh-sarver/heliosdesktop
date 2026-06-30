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
import { join } from 'node:path'
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'

const ACTIVE_PROJECT_KEY = 'helios:activeProjectId'
const ACTIVE_SCENARIO_KEY = 'helios:activeScenarioId'

// Must match PERSIST_PROFILE in wdio.persist.config.ts.
const PERSIST_PROFILE = join(process.cwd(), '.wdio-persist-profile')
const PERSIST_DB = join(PERSIST_PROFILE, 'backend-data', 'heliosgui.db')

async function waitForMainWindow(): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const handles = await browser.getWindowHandles()
        if (handles.length === 0) return false
        await browser.switchToWindow(handles[handles.length - 1])
        return await browser.execute(() => document.querySelector('#root') !== null)
      } catch {
        return false
      }
    },
    { timeout: 30000, timeoutMsg: 'Main window with #root never became available' }
  )
}

describe('Persistence across app close/reopen', () => {
  it('a created project survives a full relaunch (fixed profile)', async () => {
    await waitForMainWindow()

    // 1) Create a project on this fixed profile.
    const name = `persist-${Date.now().toString().slice(-6)}`.slice(0, 30)
    await HomePage.sidebarNewProject.waitForDisplayed({ timeout: 30000 })
    await HomePage.openCreateDialogViaSidebar()
    await HomePage.fillAndSubmitCreate(name, '12.34', '56.78')
    // Success navigates away from HomePage (and writes the active ids).
    await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 20000 })

    // Load-bearing pin check (reliable, filesystem-based): the backend wrote its
    // SQLite DB under the FIXED profile, proving the --user-data-dir was honored
    // (the app skipped its own userData override). If this is false, persistence
    // can't work — fail fast with a clear message.
    expect(existsSync(PERSIST_DB)).toBe(true)

    // 2) Clear active ids so the REOPEN lands on home (else pickInitialScreen()
    //    boots straight to the project screen with both ids set).
    const sessionBefore = await browser.execute(
      (p: string, s: string) => {
        try {
          localStorage.removeItem(p)
          localStorage.removeItem(s)
          return localStorage.getItem('helios_session_id')
        } catch {
          return null
        }
      },
      ACTIVE_PROJECT_KEY,
      ACTIVE_SCENARIO_KEY
    )

    // 3) FULL relaunch — a brand new Electron process, SAME fixed profile, so the
    //    SQLite DB persists on disk.
    await browser.reloadSession()
    await waitForMainWindow()

    // The wdio relaunch hard-kills the old Electron process, so Chromium never
    // flushes localStorage to the profile — the reopened app mints a NEW
    // session-id and would filter the persisted project out of /recent. A real
    // packaged app flushes localStorage on graceful quit, keeping the session.
    // Re-inject the original session-id to faithfully simulate the same user
    // reopening, then refresh so getSessionId() reads it before the first /recent.
    await browser.execute((sid: string) => {
      try {
        localStorage.setItem('helios_session_id', sid)
      } catch {
        /* storage disabled */
      }
    }, sessionBefore as string)
    await browser.refresh()
    await waitForMainWindow()
    await HomePage.header.waitForDisplayed({ timeout: 30000 })

    // 4) The reopened app shows Home, and the previously created project is there.
    const found = await browser.waitUntil(
      async () => (await HomePage.rowIdForName(name)) !== null,
      { timeout: 20000 }
    ).then(() => true).catch(() => false)

    if (!found) {
      const diag = await browser.execute(() => ({
        sessionAfter: localStorage.getItem('helios_session_id'),
        keys: Object.keys(localStorage),
        rowCount: document.querySelectorAll('[data-testid^="row-"]').length
      }))
      throw new Error(
        `Project "${name}" not found after relaunch. dbExists=${existsSync(PERSIST_DB)} ` +
          `sessionBefore=${sessionBefore} diag=${JSON.stringify(diag)}`
      )
    }
    const id = await HomePage.rowIdForName(name)
    if (id === null) throw new Error(`Row id for ${name} not found after relaunch`)
    await expect(HomePage.row(id)).toHaveText(name, { containing: true })
  })

  it('weather data survives a full relaunch (fixed profile)', async () => {
    await waitForMainWindow()

    // 1) Create a project — a successful create navigates to the ProjectScreen and
    //    writes the active ids, so we land on the project (not Home).
    const name = `pdata-${Date.now().toString().slice(-6)}`.slice(0, 30)
    await HomePage.sidebarNewProject.waitForDisplayed({ timeout: 30000 })
    await HomePage.openCreateDialogViaSidebar()
    await HomePage.fillAndSubmitCreate(name, '12.34', '56.78')
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 20000 })
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: 20000 })

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
      { timeout: 20000, timeoutMsg: 'edited cell never showed 42 before relaunch' }
    )

    // Filesystem proof the FIXED profile is honored — without it the DB is a
    // throwaway and nothing could persist.
    expect(existsSync(PERSIST_DB)).toBe(true)

    // 3) Capture the session-id and clear the active ids so the REOPEN lands on
    //    Home (else pickInitialScreen() boots straight to the project screen).
    const sessionBefore = await browser.execute(
      (p: string, s: string) => {
        try {
          localStorage.removeItem(p)
          localStorage.removeItem(s)
          return localStorage.getItem('helios_session_id')
        } catch {
          return null
        }
      },
      ACTIVE_PROJECT_KEY,
      ACTIVE_SCENARIO_KEY
    )

    // 4) FULL relaunch — brand new Electron process, SAME fixed profile, so the
    //    SQLite DB (with the column + the edited cell) persists on disk.
    await browser.reloadSession()
    await waitForMainWindow()

    // Re-inject the original session-id (the hard-killed process never flushed
    // localStorage, so the reopened app would otherwise mint a new id and filter
    // the project out of /recent), then refresh so getSessionId() reads it.
    await browser.execute((sid: string) => {
      try {
        localStorage.setItem('helios_session_id', sid)
      } catch {
        /* storage disabled */
      }
    }, sessionBefore as string)
    await browser.refresh()
    await waitForMainWindow()
    await HomePage.header.waitForDisplayed({ timeout: 30000 })

    // 5) Find the project on Home and open it.
    const found = await browser.waitUntil(
      async () => (await HomePage.rowIdForName(name)) !== null,
      { timeout: 20000 }
    ).then(() => true).catch(() => false)
    if (!found) {
      const diag = await browser.execute(() => ({
        sessionAfter: localStorage.getItem('helios_session_id'),
        keys: Object.keys(localStorage),
        rowCount: document.querySelectorAll('[data-testid^="row-"]').length
      }))
      throw new Error(
        `Project "${name}" not found after relaunch. dbExists=${existsSync(PERSIST_DB)} ` +
          `sessionBefore=${sessionBefore} diag=${JSON.stringify(diag)}`
      )
    }
    const homeId = await HomePage.rowIdForName(name)
    if (homeId === null) throw new Error(`Row id for ${name} not found after relaunch`)
    await HomePage.row(homeId).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 20000 })
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: 20000 })

    // 6) Re-resolve the column + row and ASSERT the edited cell value survived.
    //    Differential: if the DB weren't persisted (throwaway profile) the column
    //    would be missing and waitForColumn would time out; if the cell edit
    //    weren't persisted the value would not be '42' and this assertion fails.
    const reColId = await Weather.waitForColumn('persistval')
    const reRowIds = await Weather.visibleRowIds()
    if (reRowIds.length === 0) {
      throw new Error(
        `No weather rows after relaunch for "${name}". dbExists=${existsSync(PERSIST_DB)} ` +
          `colId=${reColId} sessionBefore=${sessionBefore}`
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
          `sessionBefore=${sessionBefore} diag=${JSON.stringify(diag)}`
      )
    }
    await expect(Weather.cellInput(reRowId, reColId)).toHaveValue('42')
  })
})
