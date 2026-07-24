/**
 * Persist-suite-only helpers. A full relaunch (browser.reloadSession + session-id
 * re-injection) is specific to the fixed-profile persistence specs and is NOT part
 * of the main harness, so it lives here and is shared by persistence.test.ts and
 * import-persist.test.ts instead of being re-inlined in each.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import HomePage from '../pages/HomePage.page'
import { ACTIVE_PROJECT_KEY, ACTIVE_SCENARIO_KEY, waitForMainWindow } from '../support/harness'
import { TIMEOUTS } from '../config/timeouts'

/** Must match PERSIST_PROFILE in wdio.persist.config.ts. */
export const PERSIST_PROFILE = join(process.cwd(), '.wdio-persist-profile')
/** The backend's SQLite DB under the fixed profile — proof the profile was honored. */
export const PERSIST_DB = join(PERSIST_PROFILE, 'backend-data', 'heliosgui.db')

/**
 * The proven relaunch->reopen sequence: clear the active ids (so pickInitialScreen
 * lands on Home rather than booting into the project), capture the session-id,
 * hard-relaunch on the SAME fixed profile, re-inject the session-id (the killed
 * process never flushed localStorage, so a fresh id would filter the project out of
 * /recent), refresh so getSessionId() reads it, then find the project row on Home.
 *
 * Returns the found Home row id. Callers that need the project OPEN double-click the
 * returned row and wait for the ProjectScreen at the call site (per-call extra waits
 * differ), while the create-survives test asserts on the Home row directly.
 */
export async function relaunchAndReopen(name: string): Promise<string> {
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

  // FULL relaunch — a brand new Electron process, SAME fixed profile, so the SQLite
  // DB persists on disk.
  await browser.reloadSession()
  await waitForMainWindow()

  // Re-inject the original session-id (the hard-killed process never flushed
  // localStorage), then refresh so getSessionId() reads it before the first /recent.
  await browser.execute((sid: string) => {
    try {
      localStorage.setItem('helios_session_id', sid)
    } catch {
      /* storage disabled */
    }
  }, sessionBefore as string)
  await browser.refresh()
  await waitForMainWindow()
  await HomePage.header.waitForDisplayed({ timeout: TIMEOUTS.XLONG })

  const found = await browser
    .waitUntil(async () => (await HomePage.rowIdForName(name)) !== null, { timeout: TIMEOUTS.LONG })
    .then(() => true)
    .catch(() => false)
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
  return homeId
}
