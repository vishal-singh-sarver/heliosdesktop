/**
 * Project boot and scope-loss recovery.
 *
 * These are the app's failure surfaces: the "Opening" loader, the "Could not
 * open project" dialog with Retry / Go to Home, and the blocking "Project
 * unavailable" notice raised when the open project or scenario is deleted
 * underneath the user. Before this file none of them had a single test — the
 * scope dialog was referenced only NEGATIVELY, by two geometry tests asserting
 * it does not appear.
 *
 * Its own spec file on purpose: it deliberately breaks the app, and wdio gives
 * each spec file a throwaway user-data dir, so a fault or a half-deleted
 * project cannot leak into another suite.
 *
 * ── Two mechanics that shape every test here ──────────────────────────────
 *
 * 1. A boot completes in 64-97ms (the app's own `[boot] … total Nms` telemetry).
 *    The loader is therefore NOT observable by a normal wait — anything that
 *    asserts on it must first slow the boot with installApiLatency /
 *    installSseLatency. The error and scope dialogs are unaffected: they
 *    persist until dismissed.
 *
 * 2. e2e/support/faults.ts can only produce a CONNECTION FAILURE (status 0), by
 *    design, so it can never raise scope loss — utils/scopeError classifies on
 *    404 and nothing else. Scope tests therefore delete through the real
 *    backend (deleteProjectViaBackend / deleteScenarioViaBackend) and let the
 *    app meet a genuine 404.
 *
 * ── FINDING: progress captions are unobservable on a RE-OPEN ─────────────
 *
 * The loader's caption is the backend's `message` verbatim, emitted by the
 * /init stream as it builds the scenario ("Loading scenario context",
 * "Preparing geometry", "Saving scenario"). None of them appears when a project
 * is re-opened: scenario_service.py:92 returns the cached context immediately
 * once `sctx.initialized` is set, so the staged work — and its messages — never
 * runs a second time. The saga also returns on isInitDone BEFORE dispatching
 * progress, so the `done` event's own "Scenario ready" is never rendered either.
 *
 * A caption assertion is therefore only reachable on a scenario's FIRST
 * initialisation, which happens inside project creation and navigates away on
 * its own. Left untested deliberately rather than written against a premise
 * that does not hold — installSseLatency() in e2e/support/faults.ts exists and
 * works, and is the tool if that path ever becomes reachable.
 *
 * ── Choosing WHICH call to fail, and why it decides the copy ──────────────
 *
 * With no machine-readable `code` on the response (the project routes send a
 * bare string), scopeError falls back to matching the ACTIVE IDS against
 * `${url} ${message}`, and checks the scenario id FIRST:
 *
 *     if (activeScenarioId && haystack.includes(activeScenarioId)) return 'scenario'
 *     return 'project'
 *
 * Weather routes are `/api/weather/project/{pid}/scenario/{sid}/…` — they carry
 * BOTH ids, so a weather call always classifies as 'scenario' even when the
 * whole project is gone. To assert the PROJECT copy the failing request must
 * carry the project id only, which is why that test commits a coordinate
 * (PATCH /api/project/{id}) rather than switching tabs.
 */
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import BootDialogs from '../pages/BootDialogs.page'
import {
  ACTIVE_PROJECT_KEY,
  ACTIVE_SCENARIO_KEY,
  createNamedReturnHome,
  deleteProjectViaBackend,
  deleteScenarioViaBackend,
  enterProject,
  enterWeather,
  getStorage,
  reloadToHome,
  uniqueName,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import {
  clearApiFaults,
  clearApiLatency,
  installApiFault,
  installApiLatency
} from '../support/faults'
import { TIMEOUTS } from '../config/timeouts'
import { BOOT_MSG } from '../constants/messages'

before(async () => {
  await waitForMainWindow()
  await waitForBackendReady()
})

beforeEach(async () => {
  await reloadToHome()
})

afterEach(async () => {
  // Faults and latency live in the renderer, so a refresh already clears them —
  // but reloadToHome() runs at the START of the next test, which would leave a
  // rule armed across the gap. Clear both explicitly.
  await clearApiFaults()
  await clearApiLatency()
})

// ══ Boot failure, Retry, and Go to Home ═══════════════════════════════════

describe('project boot — failure and recovery', () => {
  it('a failed boot raises the error dialog and offers Retry', async () => {
    const { id } = await createNamedReturnHome(uniqueName('bootfail'))

    // Match the project id, NOT '/api/project/', which would also fault
    // '/api/project/recent' and break the list this test has to click.
    await installApiFault('GET', `/api/project/${id}`)
    await HomePage.openProject(id)

    await BootDialogs.waitForError()
    // status 0 (a refused connection) is retryable: retryable = !(4xx).
    expect(await BootDialogs.hasRetry()).toBe(true)
    expect(await BootDialogs.buttons(BOOT_MSG.errorTitle)).toEqual([
      BOOT_MSG.errorHome,
      BOOT_MSG.errorRetry
    ])
    // The body is the transport error, not the generic fallback.
    expect((await BootDialogs.bodyText(BOOT_MSG.errorTitle))?.length).toBeGreaterThan(0)
  })

  it('Retry recovers the project once the backend is reachable again', async () => {
    const { id } = await createNamedReturnHome(uniqueName('bootretry'))

    await installApiFault('GET', `/api/project/${id}`)
    await HomePage.openProject(id)
    await BootDialogs.waitForError()

    await clearApiFaults()
    await BootDialogs.retryBoot()

    await ProjectScreen.projectTitle.waitForDisplayed({
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'Retry did not re-open the project'
    })
    await browser.waitUntil(async () => (await getStorage(ACTIVE_SCENARIO_KEY)) !== null, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'the recovered boot never wrote activeScenarioId'
    })
  })

  it('Go to Home from a failed boot clears BOTH persisted ids', async () => {
    const { id } = await createNamedReturnHome(uniqueName('boothome'))

    await installApiFault('GET', `/api/project/${id}`)
    await HomePage.openProject(id)
    await BootDialogs.waitForError()

    await BootDialogs.goHomeFromError()

    await HomePage.projectsTable.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    // All-or-nothing: reveal() writes both ids together, and dismissing must
    // leave neither behind or the next launch restores into a dead project.
    expect(await getStorage(ACTIVE_PROJECT_KEY)).toBe(null)
    expect(await getStorage(ACTIVE_SCENARIO_KEY)).toBe(null)
  })
})

// ══ The Opening loader — only observable under injected latency ════════════

describe('project boot — the Opening loader', () => {
  it('shows a progress bar while the project loads', async () => {
    const { id } = await createNamedReturnHome(uniqueName('bootslow'))

    // BOOT_PROGRESS(project, 0) is dispatched BEFORE the GET, so holding the GET
    // holds the loader on screen at 0% with the caption still empty.
    await installApiLatency('GET', `/api/project/${id}`, 3000)
    await HomePage.openProject(id)

    await BootDialogs.waitForOpening()
    expect(await BootDialogs.progressBar.isExisting()).toBe(true)

    const percent = await BootDialogs.progressValue()
    expect(percent).not.toBe(null)
    expect(percent).toBeGreaterThanOrEqual(0)
    expect(percent).toBeLessThanOrEqual(100)

    // Cancel is the loader's only body button, which is also why Enter cancels.
    expect(await BootDialogs.buttons(BOOT_MSG.loaderTitle)).toEqual([BOOT_MSG.loaderCancel])
  })

  it('Cancel during a boot returns Home and writes NO ids', async () => {
    const { id } = await createNamedReturnHome(uniqueName('bootcancel'))

    await installApiLatency('GET', `/api/project/${id}`, 5000)
    await HomePage.openProject(id)

    await BootDialogs.waitForOpening()
    await BootDialogs.cancelBoot()

    await HomePage.projectsTable.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    expect(await getStorage(ACTIVE_PROJECT_KEY)).toBe(null)
    expect(await getStorage(ACTIVE_SCENARIO_KEY)).toBe(null)
  })
})

// ══ Scope loss ═════════════════════════════════════════════════════════════

describe('scope loss — the project or scenario is deleted underneath you', () => {
  it('a deleted PROJECT raises the project copy and returns Home', async () => {
    const { id } = await enterProject('scopeproj')
    await ProjectScreen.waitForCoordinatesSeeded()

    await deleteProjectViaBackend(id)

    // A coordinate commit PATCHes /api/project/{id} — the project id WITHOUT the
    // scenario id, which is what makes this classify as 'project'. A weather
    // call would carry both and report 'scenario' instead.
    //
    // Committed IN-PAGE, not through setCoordinate.
    //
    // setCoordinate drives a WebDriver click (replaceValue starts with
    // el.click(), and the blur is a click on the sibling). Once ANY background
    // 404 has raised the scope dialog — the mesh fetch, the weather refresh, the
    // scenario poll, all of which carry BOTH ids — that modal's ::backdrop
    // covers the viewport and the click is intercepted. The PATCH then never
    // leaves, so the only project-scoped request in this screen never happens,
    // and the assertion below reads the 'scenario' copy instead. Which one won
    // was a race: an archived run shows this test broken with 'the "Project
    // unavailable" dialog never appeared'.
    //
    // The in-page commit cannot be intercepted, so the PATCH is guaranteed to go
    // out and the classification is deterministic. Still tolerant of a throw:
    // the 404 also trips ProjectScreen's separate isStaleIdError path (any 4xx ->
    // bounceToHome), which unmounts the header mid-helper. The dialog is the
    // assertion; how the helper ended is not.
    await ProjectScreen.commitCoordinateInPage('latitude', '41.5').catch(() => {})

    await BootDialogs.waitForScope()
    expect(await BootDialogs.bodyText(BOOT_MSG.scopeTitle)).toBe(BOOT_MSG.scopeProject)
    expect(await BootDialogs.buttons(BOOT_MSG.scopeTitle)).toEqual([BOOT_MSG.scopeHome])

    await BootDialogs.goHomeFromScope()
    await HomePage.projectsTable.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    expect(await getStorage(ACTIVE_PROJECT_KEY)).toBe(null)
    expect(await getStorage(ACTIVE_SCENARIO_KEY)).toBe(null)
  })

  it('a deleted SCENARIO raises the scenario copy', async () => {
    const project = await enterWeather('scopescen')
    const scenarioId = await getStorage(ACTIVE_SCENARIO_KEY)
    if (!scenarioId) throw new Error('no activeScenarioId after entering the project')

    await deleteScenarioViaBackend(project.id, scenarioId)

    // A WRITE is required, not a tab switch: switching to Weather only mounts a
    // component that reads from the store, so it issues no request and nothing
    // ever 404s. Add Rows POSTs to
    // /api/weather/project/{pid}/scenario/{sid}/addRow, which carries BOTH ids —
    // and scopeError checks the scenario id first, so this is the scenario case.
    await Weather.addRows(1).catch(() => {})

    await BootDialogs.waitForScope()
    expect(await BootDialogs.bodyText(BOOT_MSG.scopeTitle)).toBe(BOOT_MSG.scopeScenario)
  })

  it('two different failing calls still raise only ONE dialog', async () => {
    const project = await enterWeather('scopelatch')
    await deleteProjectViaBackend(project.id)

    // Two DIFFERENT scoped requests against a project that no longer exists: a
    // weather write and a project PATCH. Without the `reported` latch in
    // scopeError each failure would raise its own dialog and they would stack.
    // The SECOND call must be committed in-page for the same reason as the test
    // above, and here the consequence was worse: the first call has ALREADY
    // raised the modal by the time this runs, so the click was intercepted every
    // time and the project PATCH was NEVER sent. The `.catch(() => {})` hid it,
    // and this test — whose whole subject is that TWO failures raise ONE dialog —
    // was asserting the invariant against a single failure. It could not have
    // caught a regression in scopeError's `reported` latch.
    await Weather.addRows(1).catch(() => {})
    await ProjectScreen.commitCoordinateInPage('latitude', '41.5').catch(() => {})

    await BootDialogs.waitForScope()

    // Exactly ONE scope dialog is the invariant. Other dialogs may legitimately
    // still be open — the Add Rows dialog stays up because its POST failed — so
    // asserting on the TOTAL count would be asserting something else entirely.
    const titles = await BootDialogs.openDialogTitles()
    expect(titles.filter((t) => t === BOOT_MSG.scopeTitle)).toHaveLength(1)
  })

  it('opening a STALE row shows scope loss, not a boot error', async () => {
    // Pins ProjectBoot/saga.ts:311 — a 404 during boot returns early WITHOUT
    // dispatching BOOT_FAILED, because scopeError has already raised the
    // blocking dialog and stacking a second message would be noise.
    const { id } = await createNamedReturnHome(uniqueName('stalerow'))
    await deleteProjectViaBackend(id)

    await HomePage.openProject(id)

    await BootDialogs.waitForScope()
    expect(await BootDialogs.bodyText(BOOT_MSG.scopeTitle)).toBe(BOOT_MSG.scopeProject)
    // The two dialogs are mutually exclusive: SCOPE_LOST sets active=false and
    // error=null in the same reducer case.
    expect(await BootDialogs.errorDialog.isExisting()).toBe(false)
    expect(await BootDialogs.openingDialog.isExisting()).toBe(false)
  })
})
