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
import Geometry from '../pages/Geometry.page'
import Materials from '../pages/Materials.page'
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

/**
 * Force the main window to a fixed size, so a local run can reproduce CI's
 * geometry. Set HELIOS_E2E_VIEWPORT=WxH (e.g. 1024x768).
 *
 * Why this exists: the app sizes itself from the display work area, capped at
 * 1920x1080 (src/main/index.ts). A dev machine gives it ~1728 CSS px wide; the
 * CI runners' virtual displays give ~1024. Anything that only goes off-screen
 * at the NARROW width — the 30-column table's right-hand cells — therefore
 * passes locally and fails on every runner, on macOS AND Windows, which reads
 * like an OS difference and is not. Reproduce before fixing:
 *   HELIOS_E2E_VIEWPORT=1024x768 npx wdio run wdio.config.ts --spec <spec>
 *
 * MUST go through the Electron main process. browser.setWindowSize() issues
 * WebDriver `window/rect`, which needs the CDP command Browser.getWindowForTarget
 * — not implemented in this Electron build, so it throws the same
 * "unknown command" this harness already works around for scrollIntoView.
 */
async function applyViewportOverride(): Promise<void> {
  const spec = process.env['HELIOS_E2E_VIEWPORT']
  if (!spec) return
  const m = /^(\d+)x(\d+)$/.exec(spec.trim())
  if (!m) throw new Error(`HELIOS_E2E_VIEWPORT must look like 1024x768, got "${spec}"`)
  const [w, h] = [Number(m[1]), Number(m[2])]
  await browser.electron.execute(
    (electron, width: number, height: number) => {
      const win = electron.BrowserWindow.getAllWindows()[0]
      win?.setSize(width, height)
    },
    w,
    h
  )
}

export async function waitForMainWindow(): Promise<void> {
  await assertElectronBridge()
  // Track the last state each poll saw, so a timeout can say HOW FAR startup
  // got instead of just "never became available". On 2026-08-01 two ubuntu
  // specs failed here with no other evidence, and the three cases below need
  // completely different fixes:
  //   0 handles          -> the app process never opened a window (crash/stall
  //                         during init; check the app-startup.log dump)
  //   handles, no #root  -> a window exists but the renderer never mounted
  //                         (bundle/CSP/preload failure)
  //   an error every poll -> the driver connection itself is broken
  let last = 'no poll completed'
  try {
    await browser.waitUntil(
      async () => {
        try {
          const handles = await browser.getWindowHandles()
          if (handles.length === 0) {
            last = '0 window handles (no window opened yet)'
            return false
          }
          await browser.switchToWindow(handles[handles.length - 1])
          const hasRoot = await browser.execute(() => document.querySelector('#root') !== null)
          if (!hasRoot) {
            last = `${handles.length} handle(s) but no #root (renderer not mounted)`
            const url = await browser.getUrl().catch(() => '<url unavailable>')
            last += ` at ${url}`
          }
          return hasRoot
        } catch (err) {
          last = `poll threw: ${(err as Error).message}`
          return false
        }
      },
      { timeout: 30000 }
    )
  } catch {
    throw new Error(
      `Main window with #root never became available after 30s. Last observed: ${last}. ` +
        'If the app never opened a window, see the "Dump app startup + backend logs" step ' +
        'for app-startup.log.'
    )
  }
  await applyViewportOverride()
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
 * Call the backend DIRECTLY, from inside the renderer, using the same base URL
 * and session header the app itself uses.
 *
 * This is how a test reaches a state the UI cannot produce — most importantly a
 * REAL 404. e2e/support/faults.ts can only ever manufacture a connection
 * failure (status 0), by design, so it can never raise the scope-loss dialog,
 * which triggers on 404 and nothing else. Deleting a project out from under the
 * open window is the honest way to produce that, and it exercises the real
 * backend response rather than a synthesised one.
 *
 * The base URL comes from window.api.getBackendUrl() because the backend port
 * is chosen at runtime (it increments past anything already bound), so it is
 * not knowable from the test process. Pattern lifted from the network barrier
 * in projectscreen.test.ts, which inlined it before this existed.
 */
export async function backendFetch(
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: unknown }> {
  return browser.execute(
    async (p: string, opts: { method?: string; body?: string; headers?: Record<string, string> }) => {
      const w = window as unknown as {
        api?: { getBackendUrl?: () => Promise<string | null> }
        __APP_BASE_URL__?: string
      }
      const base = (await w.api?.getBackendUrl?.()) ?? w.__APP_BASE_URL__ ?? ''
      const sessionId = localStorage.getItem('helios_session_id') ?? ''
      const res = await fetch(`${base}${p}`, {
        method: opts.method ?? 'GET',
        headers: {
          accept: 'application/json',
          'session-id': sessionId,
          ...(opts.body ? { 'content-type': 'application/json' } : {}),
          ...(opts.headers ?? {})
        },
        ...(opts.body ? { body: opts.body } : {})
      })
      let parsed: unknown = null
      try {
        parsed = await res.json()
      } catch {
        parsed = null
      }
      return { status: res.status, body: parsed }
    },
    path,
    init
  )
}

/**
 * Delete a project behind the app's back, so the open window's next call 404s.
 *
 * Throws on a non-2xx: a test that believes it deleted the project, but did
 * not, would go on to assert that no scope dialog appeared and pass for
 * entirely the wrong reason.
 */
export async function deleteProjectViaBackend(projectId: string): Promise<void> {
  const res = await backendFetch(`/api/project/${projectId}`, { method: 'DELETE' })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `deleteProjectViaBackend(${projectId}) failed: HTTP ${res.status} ${JSON.stringify(res.body)}`
    )
  }
}

/**
 * Delete a scenario behind the app's back. Note the PLURAL `scenarios` segment —
 * the weather routes use the singular `scenario` and the two are not
 * interchangeable.
 */
export async function deleteScenarioViaBackend(
  projectId: string,
  scenarioId: string
): Promise<void> {
  const res = await backendFetch(`/api/project/${projectId}/scenarios/${scenarioId}`, {
    method: 'DELETE'
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `deleteScenarioViaBackend(${projectId}, ${scenarioId}) failed: ` +
        `HTTP ${res.status} ${JSON.stringify(res.body)}`
    )
  }
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
  // Wait for EITHER outcome, then report which one happened. A bare wait on
  // project-title cannot tell "create was rejected, dialog still open" (a real
  // bug, and instant) from "create succeeded but the screen is slow to mount"
  // (load). Both surfaced identically as
  //   element ("[data-testid=project-title]") still not displayed after 20000ms
  // which sent an investigation at the wrong layer. fillAndSubmitCreate
  // deliberately does not wait (see its comment: success navigates away,
  // failure keeps the dialog open), so this is the first point that can tell
  // them apart.
  try {
    await browser.waitUntil(
      async () =>
        (await ProjectScreen.projectTitle.isDisplayed().catch(() => false)) ||
        !(await HomePage.createDialog.isDisplayed().catch(() => true)),
      { timeout: TIMEOUTS.LONG }
    )
  } catch {
    const errs = await HomePage.createDialogErrors()
    throw new Error(
      `create for "${name}" never left the dialog after ${TIMEOUTS.LONG}ms. ` +
        (errs.length
          ? `The form is showing validation errors: ${errs.join(' | ')} — the submit was ` +
            'rejected, so this is a bad value being typed, not a slow app.'
          : 'No validation errors are shown, so the submit was accepted and the app is ' +
            'either slow to navigate or the create POST never resolved.')
    )
  }
  // Dialog is gone (or the title already rendered); now allow for a slow mount.
  await ProjectScreen.projectTitle.waitForDisplayed({
    timeout: TIMEOUTS.LONG,
    timeoutMsg: `create for "${name}" was accepted (dialog closed) but ProjectScreen never mounted`
  })
  // The first scenario loads after create; its id lands in localStorage once GET
  // resolves. Gate on that so the Weather table is ready for downstream asserts.
  await browser.waitUntil(async () => (await getStorage(ACTIVE_SCENARIO_KEY)) != null, {
    timeout: 20000,
    timeoutMsg: 'activeScenarioId never set after entering project'
  })
  const id = await getStorage(ACTIVE_PROJECT_KEY)
  if (!id) throw new Error('no activeProjectId after enterProject')
  // Do not hand back a screen whose coordinate header is still showing the
  // PREVIOUS project. ProjectScreen re-seeds both boxes with resetForm whenever
  // activeProject's id changes, so a test that starts typing before that lands
  // has its value wiped mid-edit — surfacing as `did not take the value "<x>"`,
  // or as an assertion on a value that silently reverted, on a DIFFERENT
  // coordinate test each run. We know exactly what the header must read, so wait
  // for it rather than for a heuristic settle.
  await ProjectScreen.waitForCoordinatesSeeded(lat, lon)
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
  // M2 wraps the workspace in tabs and lands on "3D Window"; Weather is mounted
  // only while its tab is active, so without this the table is not in the DOM at
  // all and every caller times out on the select-all checkbox below.
  await ProjectScreen.selectTab('weather')
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: TIMEOUTS.LONG })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: TIMEOUTS.LONG })
  return project
}

/**
 * Reopen a previously-created project BY NAME from Home in the same session:
 * go home, locate its row, double-click, and wait for the ProjectScreen to mount.
 * Consolidates the reopen sequence that was inlined across weather/projectscreen/
 * journey/persist specs.
 *
 * Lands on the Weather tab, like enterWeather. The tab state is component-local
 * (CenterWorkspace's useState), so a reopen resets it to 3D Window and the table
 * unmounts — every caller here is a persistence check that goes straight on to
 * assert against the reopened table.
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
  await ProjectScreen.selectTab('weather')
}

/**
 * True if `predicate` stays false for the whole NEGATIVE_GATE window — i.e. a gate
 * that is correctly never satisfied (submit stays disabled, dialog never opens).
 * Replaces the per-spec `staysDisabled` copies that hard-coded the 3s window.
 *
 * A predicate that THROWS is not the same as a gate that stayed closed, and the
 * difference is the whole value of this helper. The previous implementation
 * swallowed the throw inside the poll (`predicate().catch(() => false)`), so a
 * selector pointing at an unmounted form — or a typo — reported "the gate held"
 * and the assertion passed having observed nothing at all. That shape is silent
 * by construction: the test goes green, so nobody looks.
 *
 * So: a throw on SOME polls is tolerated (a form re-rendering mid-poll is
 * normal), but a predicate that threw on EVERY poll never evaluated the gate
 * once, and that is reported as a failure rather than a pass.
 */
export async function staysFalse(
  predicate: () => Promise<boolean>,
  timeout: number = TIMEOUTS.NEGATIVE_GATE
): Promise<boolean> {
  let polls = 0
  let throws = 0
  let lastErrorMessage = ''

  const becameTrue = await browser
    .waitUntil(
      async () => {
        polls += 1
        try {
          return await predicate()
        } catch (err) {
          throws += 1
          lastErrorMessage = err instanceof Error ? err.message : String(err)
          return false
        }
      },
      { timeout }
    )
    .then(() => true)
    .catch(() => false)

  if (polls > 0 && throws === polls) {
    throw new Error(
      `staysFalse never evaluated its predicate: all ${polls} poll(s) threw, so the ` +
        'gate was never observed. Reporting "stayed false" here would be a false pass — ' +
        'fix the selector or the precondition instead.\n' +
        `  last error: ${lastErrorMessage}`
    )
  }

  return becameTrue === false
}

/**
 * Enter a fresh project and wait until the Geometry panel is usable.
 *
 * Unlike enterWeather there is no selectTab(): the left panel is a sibling of
 * CenterWorkspace and is mounted whichever workspace tab is active.
 *
 * The wait matters. ProjectScreen fires four catalog loads on mount, and
 * `+ Ground` early-returns when the object-type catalog has not yet produced a
 * "Ground" type (Geometry/index.tsx onAddGround) — so a test that clicks too
 * early silently creates NOTHING and then fails on a missing row, pointing at
 * the wrong layer. Gating on the tree reaching a terminal state also covers the
 * initial listNodes GET.
 */
export async function enterGeometry(label = 'geo'): Promise<{ id: string; name: string }> {
  const project = await enterProject(label)
  await Geometry.panel.waitForDisplayed({
    timeout: TIMEOUTS.LONG,
    timeoutMsg: 'the Geometry panel never mounted on ProjectScreen'
  })
  await Geometry.waitForTree()
  await browser.waitUntil(async () => Geometry.addGroundButton.isEnabled().catch(() => false), {
    timeout: TIMEOUTS.LONG,
    timeoutMsg: '+ Ground never became enabled (object-type catalog likely never loaded)'
  })
  return project
}

/**
 * Enter a fresh project and wait until the Materials panel is usable.
 *
 * Like enterGeometry there is no selectTab(): the left panel is a sibling of
 * CenterWorkspace. The extra wait is on the material-type catalog, which gates
 * the type dropdown — pick a type before it lands and the list is empty.
 */
export async function enterMaterials(label = 'mat'): Promise<{ id: string; name: string }> {
  const project = await enterProject(label)
  await Materials.panel.waitForDisplayed({
    timeout: TIMEOUTS.LONG,
    timeoutMsg: 'the Materials panel never mounted on ProjectScreen'
  })
  await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
    timeout: TIMEOUTS.LONG,
    timeoutMsg: '+ Add Materials never became enabled'
  })
  return project
}
