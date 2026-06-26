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
})
