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

export const ACTIVE_PROJECT_KEY = 'helios:activeProjectId'
export const ACTIVE_SCENARIO_KEY = 'helios:activeScenarioId'

/**
 * Wait for the main window (the one with #root) and switch wdio focus to it.
 * Helios shows a splash window first, so we poll handles and pick the latest.
 */
export async function waitForMainWindow(): Promise<void> {
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
 * Reliably REPLACE a controlled (Formik/React) input's value. setValue alone can
 * leave the previous value because React re-renders the input from state.
 */
export async function setInputValue(el: ReturnType<typeof $>, value: string): Promise<void> {
  await el.click()
  await browser.keys(['Control', 'a'])
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
