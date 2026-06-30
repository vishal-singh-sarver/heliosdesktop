/**
 * Helios end-to-end JOURNEY — one project carried through the full lifecycle on
 * a single fresh project: create (real dialog) → land on the seeded Weather
 * table → import a REAL provider CSV → add a defaulted managed column (back-fill)
 * → edit a cell → return Home (active scenario cleared, project id retained) → reopen the SAME project
 * (column + edited cell PERSISTED) → rename from Home → delete from Home.
 *
 * Every step asserts a post-condition that is DIFFERENTIAL: it goes red if the
 * step's feature/validation were broken (the import column/value, the back-fill,
 * the cell commit, the persist-on-reopen, the rename PATCH, the delete). Mirrors
 * weather.test.ts / uploadwizard.test.ts preamble + patterns exactly.
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
  reloadToHome,
  setInputValue,
  stubRealFile,
  uniqueName,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'

before(async () => {
  await waitForMainWindow()
  // Heavy real-file imports are timing-sensitive; make sure the backend is up
  // before the first import so we don't pay cold-start inside a timed test.
  await waitForBackendReady()
})

beforeEach(async () => {
  await reloadToHome()
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

describe('Helios end-to-end journey', () => {
  it('creates → imports a real file → defaults+edits → reopens (persisted) → renames → deletes', async function () {
    // Imports + backend writes + a project reopen are slow; give the whole
    // journey headroom under the 120s global mocha cap.
    this.timeout(120000)

    // ── 1. Create the project via the REAL create dialog with explicit coords.
    const { id, name } = await enterProject('journey', '45.5', '-120.25')
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 20000 })
    await expect(ProjectScreen.projectTitle).toBeDisplayed()
    // enterProject only returns once activeScenarioId is set — confirm the
    // create actually provisioned a scenario (differential vs a failed create).
    expect(await getStorage(ACTIVE_PROJECT_KEY)).toBe(id)
    expect(await getStorage(ACTIVE_SCENARIO_KEY)).not.toBe(null)

    // ── 2. Weather is the default mount on the project screen.
    await expect(ProjectScreen.weatherSentinel).toBeDisplayed()
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })

    // ── 3. Import the REAL provider CSV (ISO datetime column). Ascending sort →
    // row 0 is 2026-05-12T00:00:00 with temp 64.6 and humidity 70.98 (file row 1).
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
    // The first imported value matches the file (stored float32 → assert with
    // tolerance). Differential: a broken/mismapped import yields a different
    // number (or NaN) here.
    const [firstRow] = await Weather.visibleRowIds()
    const humidity = await numericCell(firstRow, humidityCol)
    if (Math.abs(humidity - 70.98) > 0.01) {
      throw new Error(`humidity[row0] = ${humidity}, expected ~70.98 from the file`)
    }

    // ── 4. Add a managed column WITH a default → it back-fills the imported rows.
    await Weather.addColumn('note', { defaultValue: '7' })
    const noteCol = await Weather.waitForColumn('note')
    // Pick a SECOND imported row whose note we leave untouched, so its back-fill
    // remains observable after we edit row 0 below (and survives the reopen).
    const rowsAfterAdd = await Weather.visibleRowIds()
    const editRow = rowsAfterAdd[0]
    const keepRow = rowsAfterAdd[1]
    // Back-fill is differential: if the default never reached existing rows this
    // stays empty and times out.
    await browser.waitUntil(async () => (await Weather.cellInput(keepRow, noteCol).getValue()) === '7', {
      timeout: 20000,
      timeoutMsg: 'default value did not back-fill an imported row'
    })

    // ── 5. Edit a cell to a value DISTINCT from the default (so the assertion
    // can't pass on the back-fill alone) and confirm the commit.
    await Weather.editCell(editRow, noteCol, '42')
    await browser.waitUntil(async () => (await Weather.cellInput(editRow, noteCol).getValue()) === '42', {
      timeout: 15000,
      timeoutMsg: 'edited cell did not show the committed value'
    })

    // ── 5b. Edit the coordinates in the project-screen header. Longitude drives
    // the UTC offset, so committing a far-band longitude must RECOMPUTE the UTC
    // (differential: a broken commit/recompute leaves the seeded offset). Edit
    // longitude FIRST and wait for the recompute so the subsequent latitude
    // commit reads the already-updated longitude (no stale-revert race).
    const seededUtc = await ProjectScreen.getUtcValue()
    await ProjectScreen.setCoordinate('longitude', '78.486')
    await browser.waitUntil(async () => (await ProjectScreen.getUtcValue()) !== seededUtc, {
      timeout: 15000,
      timeoutMsg: 'UTC offset never recomputed after committing a new longitude'
    })
    await ProjectScreen.setCoordinate('latitude', '17.385')
    // The backend derives utc_offset from BOTH lat and lon, so editing latitude
    // also re-derives UTC. Latitude has no header signal though, and going Home
    // would cancel an in-flight PATCH — so poll the session-scoped project until
    // the latitude write is durable, and take the backend's final utc_offset as
    // the source of truth for the persistence assertion below.
    let committedUtc = ''
    await browser.waitUntil(
      async () => {
        const utc = await browser.execute(async (pid: string) => {
          try {
            const bridge = (window as unknown as { api?: { getBackendUrl?: () => Promise<string | null> } }).api
            const base = (await bridge?.getBackendUrl?.()) ?? ''
            // The app scopes project reads by a session-id header (utils/api.ts);
            // a raw fetch without it can't resolve the project, so send it too.
            const sid = localStorage.getItem('helios_session_id') ?? ''
            const res = await fetch(`${base}/api/project/${pid}`, { headers: { 'session-id': sid } })
            if (!res.ok) return null
            const j = (await res.json()) as { project?: { latitude?: number; utc_offset?: string } }
            const lat = j.project?.latitude
            if (lat == null || Math.abs(lat - 17.385) >= 0.01) return null
            return j.project?.utc_offset ?? null
          } catch {
            return null
          }
        }, id)
        if (utc == null) return false
        committedUtc = utc
        return true
      },
      { timeout: 10000, timeoutMsg: 'latitude PATCH never reached the backend' }
    )

    // ── 6. Click the Helios logo → land on Home. ProjectScreen's unmount cleanup
    // clears the active SCENARIO id, but the project id is intentionally RETAINED
    // (boot auto-restore needs both ids — see the documented contract in
    // projectscreen.test.ts). Assert that real contract; differential: a no-op
    // nav would leave the scenario id set.
    const projectIdBeforeHome = await getStorage(ACTIVE_PROJECT_KEY)
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    await browser.waitUntil(async () => (await getStorage(ACTIVE_SCENARIO_KEY)) === null, {
      timeout: 10000,
      timeoutMsg: 'activeScenarioId was not cleared after going Home'
    })
    expect(await getStorage(ACTIVE_SCENARIO_KEY)).toBe(null)
    expect(await getStorage(ACTIVE_PROJECT_KEY)).toBe(projectIdBeforeHome)

    // ── 7. Reopen the SAME project from Home → the added column AND the edited
    // cell PERSISTED (re-resolve colId/rowId; backend session survives in-run).
    const homeId = await HomePage.rowIdForName(name)
    if (!homeId) throw new Error(`project "${name}" missing from Home after going back`)
    await HomePage.row(homeId).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: 20000 })
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    const noteCol2 = await Weather.waitForColumn('note')
    const rows2 = await Weather.visibleRowIds()
    const editRow2 = rows2[0]
    const keepRow2 = rows2[1]
    // The edited value survived the round-trip…
    await expect(Weather.cellInput(editRow2, noteCol2)).toHaveValue('42')
    // …and the un-edited back-filled cell did too (column + default persisted).
    await expect(Weather.cellInput(keepRow2, noteCol2)).toHaveValue('7')

    // The lat/lon edited in step 5b also persisted. UTC offset is the backend's
    // derived string (assert exactly); coords store as float32 → assert numeric
    // with tolerance. Differential: a dropped PATCH shows the create-time coords.
    const lonReopened = Number(await ProjectScreen.getCoordValue('longitude'))
    if (Math.abs(lonReopened - 78.486) > 0.01) {
      throw new Error(`longitude did not persist: got ${lonReopened}, expected ~78.486`)
    }
    const latReopened = Number(await ProjectScreen.getCoordValue('latitude'))
    if (Math.abs(latReopened - 17.385) > 0.01) {
      throw new Error(`latitude did not persist: got ${latReopened}, expected ~17.385`)
    }
    expect(await ProjectScreen.getUtcValue()).toBe(committedUtc)

    // ── 8. Rename the project from Home via the kebab → the row reflects it.
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const renameId = await HomePage.rowIdForName(name)
    if (!renameId) throw new Error(`project "${name}" missing from Home before rename`)
    const newName = uniqueName('jrenamed')
    await HomePage.openRowMenu(name)
    await HomePage.requestRename(renameId)
    await expect(HomePage.renameNameInput).toHaveValue(name)
    await setInputValue(HomePage.renameNameInput, newName)
    await HomePage.renameSaveButton.click()
    await HomePage.renameDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
    // Differential: a failed PATCH would leave the OLD name on the row.
    await browser.waitUntil(async () => (await HomePage.row(renameId).getText()).includes(newName), {
      timeout: 15000,
      timeoutMsg: 'row never showed the new name after rename'
    })
    expect(await HomePage.rowIdForName(newName)).toBe(renameId)
    expect(await HomePage.rowIdForName(name)).toBe(null)

    // ── 9. Delete the project from Home via the kebab → the row is gone.
    await HomePage.openRowMenu(newName)
    await HomePage.requestDelete(renameId)
    await HomePage.confirmDelete()
    await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
    await browser.waitUntil(async () => !(await HomePage.row(renameId).isExisting()), {
      timeout: 15000,
      timeoutMsg: 'deleted row never disappeared'
    })
    // Differential: a failed delete would leave the row resolvable by name.
    expect(await HomePage.rowIdForName(newName)).toBe(null)
  })
})
