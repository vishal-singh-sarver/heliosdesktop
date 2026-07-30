/**
 * Shared E2E harness — the verified preamble + helpers from the HomePage suite,
 * extracted so every spec (HomePage, ProjectScreen, Weather) reuses ONE copy
 * instead of drifting. New here vs homepage.test.ts: enterProject() (provision a
 * project and LAND on the project screen) and stubFileDialog() (drive the native
 * file picker from the main process for import tests).
 *
 * `browser`, `$`, `$$`, `expect` are wdio globals (typed via e2e/tsconfig.json) —
 * no imports needed.
 */
import { readFileSync } from 'node:fs'
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import { TIMEOUTS } from '../config/timeouts'

export const ACTIVE_PROJECT_KEY = 'helios:activeProjectId'
export const ACTIVE_SCENARIO_KEY = 'helios:activeScenarioId'

/**
 * Wait for the main window (the one with #root) and switch wdio focus to it.
 * Helios shows a splash window first, so we poll handles and pick the latest.
 */
let bridgeProbed = false

/**
 * Assert the Electron CDP bridge is live, once per spec-file session.
 *
 * When the bridge fails to connect, wdio-electron-service does NOT fail the
 * session: it logs at ERROR, returns undefined, and swaps browser.electron.*
 * for stubs that throw "CDP bridge is not available, API is disabled". The run
 * then looks normal until something touches browser.electron — so the failure
 * surfaces far from its cause, in whichever spec happens to stub a file dialog.
 *
 * This lives in waitForMainWindow (which every spec's before() already calls)
 * rather than a wdio `before`/`beforeSuite` hook on purpose: browser.electron
 * is not attached yet when `before` fires, and a throw from EITHER hook —
 * including a SevereServiceError — is swallowed by the runner, which still
 * reports the spec as passing. A throw from inside the spec's own before()
 * genuinely fails it.
 */
async function assertElectronBridge(): Promise<void> {
  if (bridgeProbed) return
  bridgeProbed = true
  let underlying: string
  try {
    const ok = await browser.electron?.execute(() => true)
    if (ok === true) return
    underlying = `probe returned ${JSON.stringify(ok)}`
  } catch (err) {
    underlying = (err as Error).message
  }
  throw new Error(
    'Electron CDP bridge is unavailable — browser.electron.* is stubbed out, so the ' +
      'file-dialog stubs in this harness cannot work and any spec using them would ' +
      `fail misleadingly later.\n  underlying error: ${underlying}\n` +
      '  Usual causes: an orphaned Electron/backend from a previous run is holding the ' +
      'debugger port, or a second wdio run is active — check with\n' +
      "    ps -eo pid=,args= | grep -E 'wdio|heliosgui_backend'\n" +
      '  or the app crashed during startup (see the app-startup.log dump in CI).\n' +
      '  On a slow machine, raise cdpBridgeTimeout in wdio.config.ts.'
  )
}

export async function waitForMainWindow(): Promise<void> {
  await assertElectronBridge()
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

/**
 * Wait until the Python backend process reports running, so the first import in a
 * spec doesn't race a cold backend (the heavy real-file imports are timing-
 * sensitive). Best-effort: resolves quietly if the api bridge isn't present yet.
 */
export async function waitForBackendReady(timeout = 30000): Promise<void> {
  await browser.waitUntil(
    async () =>
      browser.execute(async () => {
        const api = (window as unknown as { api?: { getBackendStatus?: () => Promise<{ running: boolean }> } }).api
        if (!api?.getBackendStatus) return false
        try {
          return (await api.getBackendStatus()).running === true
        } catch {
          return false
        }
      }),
    { timeout, timeoutMsg: 'backend never reported running' }
  )
}

let nameCounter = 0
/** Unique project name, <= 30 chars so it passes client-side validation. */
export function uniqueName(label: string): string {
  nameCounter += 1
  const ts = Date.now().toString().slice(-6)
  return `e2e-${label}-${ts}-${nameCounter}`.slice(0, 30)
}

/**
 * The platform's "select all" modifier.
 *
 * MUST be Meta (Command) on macOS. Control+A there does NOT select all — it is
 * the emacs-style "move caret to start of line" binding, so the subsequent
 * Delete removes nothing and the new text is typed at the FRONT of the old
 * value. That silently produced "38.5412.34" in the create-project latitude
 * field (default 38.54 + typed 12.34), which fails validation, so the dialog
 * stayed open and every `waitForDisplayed({ reverse: true })` on the projects
 * table timed out. Linux/Windows still need Control.
 *
 * clearValue() is NOT an alternative: on these controlled (Formik/React) inputs
 * React re-renders the old value straight back, giving the same append bug.
 */
export const SELECT_ALL_KEY = process.platform === 'darwin' ? 'Meta' : 'Control'

/**
 * Select the whole value of the focused field, cross-platform. Callers must have
 * focused/clicked the field first.
 */
export async function selectAll(): Promise<void> {
  await browser.keys([SELECT_ALL_KEY, 'a'])
}

/**
 * Reliably REPLACE a controlled (Formik/React) input's value. setValue alone can
 * leave the previous value because React re-renders the input from state.
 */
export async function setInputValue(el: ReturnType<typeof $>, value: string): Promise<void> {
  await el.click()
  await selectAll()
  await browser.keys(['Delete'])
  if (value.length) await el.addValue(value)
}

/** Read a localStorage value from the renderer. */
export async function getStorage(key: string): Promise<string | null> {
  return browser.execute((k: string) => localStorage.getItem(k), key)
}

/**
 * Return to HomePage in the SAME session: clear the active ids (so
 * pickInitialScreen -> 'home') and refresh the renderer. Backend session-id
 * survives, so projects created earlier in the run still exist.
 */
export async function reloadToHome(): Promise<void> {
  await browser.execute(
    (projectKey: string, scenarioKey: string) => {
      try {
        localStorage.removeItem(projectKey)
        localStorage.removeItem(scenarioKey)
      } catch {
        /* storage disabled */
      }
    },
    ACTIVE_PROJECT_KEY,
    ACTIVE_SCENARIO_KEY
  )
  await browser.refresh()
  await waitForMainWindow()
  await HomePage.header.waitForDisplayed({ timeout: 30000 })
}

/**
 * Create a project and RETURN HOME with its row present. Mirrors homepage.test.ts
 * createNamed — used by the navigation/entry tests that then double-click / press
 * Enter on the row.
 */
export async function createNamedReturnHome(name: string): Promise<{ id: string; name: string }> {
  if (name.length > 30) throw new Error(`name too long for create: ${name}`)
  await HomePage.openCreateDialogViaSidebar()
  await HomePage.fillAndSubmitCreate(name, '12.34', '56.78')
  await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 20000 })
  await reloadToHome()
  await browser.waitUntil(async () => (await HomePage.rowIdForName(name)) !== null, {
    timeout: 15000,
    timeoutMsg: `Row for "${name}" never appeared after create`
  })
  const id = await HomePage.rowIdForName(name)
  if (id === null) throw new Error(`Could not resolve row id for ${name}`)
  return { id, name }
}

/**
 * Provision a project and LAND on the ProjectScreen. A successful create
 * navigates straight to the project screen and writes the active ids, so we wait
 * for the ProjectScreen-only project-title (header/menubar are shared with
 * HomePage and are NOT a reliable discriminator) and for the scenario to load.
 * Coordinates default to the HomePage seed (12.34 / 56.78).
 */
export async function enterProject(
  label = 'proj',
  lat = '12.34',
  lon = '56.78'
): Promise<{ id: string; name: string }> {
  const name = uniqueName(label)
  await HomePage.openCreateDialogViaSidebar()
  await HomePage.fillAndSubmitCreate(name, lat, lon)
  await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 20000 })
  // The first scenario loads after create; its id lands in localStorage once GET
  // resolves. Gate on that so the Weather table is ready for downstream asserts.
  await browser.waitUntil(async () => (await getStorage(ACTIVE_SCENARIO_KEY)) != null, {
    timeout: 20000,
    timeoutMsg: 'activeScenarioId never set after entering project'
  })
  const id = await getStorage(ACTIVE_PROJECT_KEY)
  if (!id) throw new Error('no activeProjectId after enterProject')
  return { id, name }
}

/**
 * Drive the CSV import without a native OS dialog: re-register the main-process
 * IPC handlers so `dialog:openFile` resolves to a fake path and `fs:readFile`
 * returns `content` (the import saga calls openFile then readFile — see
 * Weather/saga.ts pickFileWorker). Channel names mirror preload's window.api.
 * Re-stub per test; handlers persist for the spec file's app session only.
 */
export async function stubFileImport(content: string, filename = 'fixture.csv'): Promise<void> {
  await browser.electron.execute(
    (electron, c: string, fn: string) => {
      const ipc = electron.ipcMain
      const path = '/tmp/' + fn
      ipc.removeHandler('dialog:openFile')
      ipc.handle('dialog:openFile', () => path)
      ipc.removeHandler('fs:readFile')
      ipc.handle('fs:readFile', () => c)
    },
    content,
    filename
  )
}

/**
 * Stub ONLY the native file dialog to return a real on-disk path, leaving
 * `fs:readFile` untouched so the actual file is read end-to-end. Use to import
 * real fixture files (verifies parsing of genuine CSV/TSV/XML content).
 */
export async function stubRealFile(absPath: string): Promise<void> {
  // Read the genuine fixture HERE in the test (node) process, then feed it to the
  // fs:readFile handler. A prior stubFileImport() replaces the global fs:readFile
  // with one returning stale inline content, and IPC handlers persist for the
  // whole spec-file app session — so we must re-stub fs:readFile with the REAL
  // file's content, not leave the previous import test's handler in place.
  const content = readFileSync(absPath, 'utf-8')
  await browser.electron.execute(
    (electron, p: string, c: string) => {
      const ipc = electron.ipcMain
      ipc.removeHandler('dialog:openFile')
      ipc.handle('dialog:openFile', () => p)
      ipc.removeHandler('fs:readFile')
      ipc.handle('fs:readFile', () => c)
    },
    absPath,
    content
  )
}

/** Stub the file dialog to return null (user-cancelled the picker). */
export async function stubFileCancel(): Promise<void> {
  await browser.electron.execute((electron) => {
    const ipc = electron.ipcMain
    ipc.removeHandler('dialog:openFile')
    ipc.handle('dialog:openFile', () => null)
  })
}

/**
 * Enter a project and land on the seeded Weather table (its select-all + Date-Time
 * header displayed). Shared by the weather and upload specs, which previously each
 * defined their own copy.
 */
export async function enterWeather(label = 'wx'): Promise<{ id: string; name: string }> {
  const project = await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: TIMEOUTS.LONG })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: TIMEOUTS.LONG })
  return project
}

/**
 * Reopen a previously-created project BY NAME from Home in the same session:
 * go home, locate its row, double-click, and wait for the ProjectScreen to mount.
 * Consolidates the reopen sequence that was inlined across weather/projectscreen/
 * journey/persist specs.
 */
export async function reopenByName(name: string): Promise<void> {
  await reloadToHome()
  await browser.waitUntil(async () => (await HomePage.rowIdForName(name)) !== null, {
    timeout: TIMEOUTS.LONG,
    timeoutMsg: `Row for "${name}" never appeared on reopen`
  })
  const id = await HomePage.rowIdForName(name)
  if (id === null) throw new Error(`Could not resolve row id for ${name}`)
  await HomePage.row(id).doubleClick()
  await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
}

/**
 * True if `predicate` stays false for the whole NEGATIVE_GATE window — i.e. a gate
 * that is correctly never satisfied (submit stays disabled, dialog never opens).
 * Replaces the per-spec `staysDisabled` copies that hard-coded the 3s window.
 */
export async function staysFalse(
  predicate: () => Promise<boolean>,
  timeout: number = TIMEOUTS.NEGATIVE_GATE
): Promise<boolean> {
  const becameTrue = await browser
    .waitUntil(async () => predicate().catch(() => false), { timeout })
    .then(() => true)
    .catch(() => false)
  return becameTrue === false
}
