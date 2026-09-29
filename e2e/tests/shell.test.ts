/**
 * The application shell: window controls, the menu bar, the sidebar's active
 * state, and the scenario chip.
 *
 * Eight IPC channels and 14 of the 16 menu items had no E2E traffic at all
 * before this file; the window controls were covered only by unit tests that
 * stub window.api, so the real preload bridge was never exercised.
 *
 * ── Headless on every OS ──────────────────────────────────────────────────
 * This file must run with the window NEVER on screen — on Windows, on macOS, on
 * a Linux desktop, and on a display-less Linux server (where wdio wraps the
 * worker in xvfb-run: an X server with NO window manager). So no test changes
 * real window state in a way that maps the window:
 *  - Nothing maximizes. maximize() shows a hidden window on every OS, and under
 *    Xvfb it never takes effect at all. The Maximize test is commented out below.
 *  - Nothing enters real fullscreen. The fullscreen tests fire the window's own
 *    enter-/leave-full-screen events instead (Shell.emitFullScreenEvent), which
 *    runs the app's real listeners, the IPC channel and the Header — everything
 *    but the OS transition, which is the part that shows the window.
 *  - The size change (1024x768) is a plain setSize, which never maps a window.
 * And it is ENFORCED: before() arms a show guard, afterEach records every test
 * during which the window was shown or is visible (and hides it again), and the
 * root after() then FAILS THE SPEC FILE, naming those tests. Recorded rather
 * than thrown from afterEach on purpose: a throwing root afterEach reports the
 * offending test as PASSED and makes Mocha drop every later test in the file
 * from the counts. Skipped under HELIOS_E2E_HEADED=1.
 * One known blind spot, UNVERIFIED (no Mac run yet): on macOS Electron may
 * derive both 'show' and isVisible() from occlusion, so a Mac whose display is
 * asleep could let a show through unnoticed. Linux: negative control run.
 *
 * ── What is deliberately NOT here, and why ────────────────────────────────
 *
 *  - MAXIMIZE (commented out, 29 Sep 2026). See the note on the test itself.
 *  - The REAL fullscreen transition. Both fullscreen tests emit the window's
 *    enter-/leave-full-screen events instead, because a real setFullScreen maps
 *    the hidden window. So a change that stops the window actually reaching
 *    fullscreen while keeping those listeners would still pass here.
 *  - MINIMIZE. The window is never shown under E2E (isHeadlessTestRun skips
 *    every show()), and minimizing a never-shown window is OS-dependent: it may
 *    not flip Chromium's cached flag, and there is no guaranteed restore path
 *    back. A test that leaves the window minimized would poison every test
 *    after it. Recorded as a known gap rather than written unreliably.
 *  - The macOS traffic-light hover swap. WindowControls is only ever mounted
 *    with side="right"; on macOS the app uses native traffic lights. The
 *    side="left" branch is unreachable in the product — it belongs to the unit
 *    test, not here.
 *  - The macOS title-bar double-click strip (the bottom 17px of the 45px
 *    title-bar row, below the native ~28px zone, darwin only). What it does is the MACHINE's AppleActionOnDoubleClick
 *    preference, and one of the choices is Minimize — see MINIMIZE above.
 *
 * ── macOS ─────────────────────────────────────────────────────────────────
 * This suite runs on a Mac too, and the shell really is different there:
 *  - The renderer paints NO window controls (Header mounts WindowControls under
 *    `!isMac && !isFullScreen`); the OS draws native traffic lights, which are
 *    not in the DOM. No macOS renderer path calls window:toggleMaximize or
 *    window:close at all.
 *  - The title bar STAYS in fullscreen (`showTitleBar = isMac || !isFullScreen`).
 * So the tests of the painted Close button and of the title bar collapsing are
 * `itNotMac`, and `itMacOnly` pins what macOS ships instead. These platform
 * skips are declared, not commented out, so they are counted (trap 39).
 *
 * ── Ordering ──────────────────────────────────────────────────────────────
 * The Close test runs LAST and against a STUBBED handler. The real
 * window:close quits the app (close -> window-all-closed -> app.quit()), which
 * would kill every remaining test in the run.
 */
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Shell from '../pages/Shell.page'
import {
  deleteProjectViaBackend,
  enterProject,
  reloadToHome,
  staysFalse,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { TIMEOUTS } from '../config/timeouts'
import { TOOLBAR_LABELS } from '../constants/test-data'

let originalSize: { width: number; height: number } | null = null

// The worker runs on the same machine as the app it drives, so its platform IS
// the app's — 'the platform bridge answers with the real platform' asserts that.
const isMac = process.platform === 'darwin'
/** Behaviour of the painted title-bar controls, which macOS does not render. */
const itNotMac = isMac ? it.skip : it
/** What macOS ships instead. */
const itMacOnly = isMac ? it : it.skip

const WINDOW_CONTROL_LABELS = ['Minimize window', 'Maximize window', 'Close window']

/** A developer WATCHING the run (see src/main/index.ts): the window is meant to be visible. */
const headed = process.env['HELIOS_E2E_HEADED'] === '1'

/** Tests during which the window went on screen; reported by the root after(). */
const headlessViolations: string[] = []

before(async () => {
  await waitForMainWindow()
  await waitForBackendReady()
  // No keepOffDesktop() and no maximize/unmaximize baseline any more: both
  // existed only because tests here maximized and fullscreened for real, which
  // SHOWS the window (see the header). Nothing does now, so the window stays
  // exactly as every other spec has it — never shown, at the pinned
  // HELIOS_E2E_VIEWPORT size, which a hidden window takes exactly (no window
  // manager ever clamps it), so afterEach's size restore is always achievable.
  //
  // From here on, any show() of the main window is counted; afterEach records
  // the test that caused it, and after() fails the spec file (see the header).
  await Shell.armShowGuard()
})

after(() => {
  if (headlessViolations.length) {
    throw new Error(
      'the window was put ON SCREEN — this spec must stay headless on every OS. ' +
        `Offending tests: ${headlessViolations.join('; ')}`
    )
  }
})

beforeEach(async () => {
  await reloadToHome()
  // The size every afterEach restores. windowSize() already skips the splash;
  // capturing after the first reload is belt-and-braces on top of that.
  if (!originalSize) originalSize = await Shell.windowSize()
})

afterEach(async function () {
  // Never let window geometry leak into the next test: a maximized or
  // fullscreen window changes the renderer viewport, which moves everything.
  //
  // Every step is still caught — a failed restore must not mask the failure of
  // the test that just ran — but the failures are COLLECTED and the restore is
  // then VERIFIED, because all four used to be `.catch(() => {})` and nothing
  // checked the outcome. A silently-failed restore left the next test at the
  // wrong geometry, where it failed on something unrelated (`expect
  // isMaximized() toBe(false)` at the top of the very next test) with no hint
  // that teardown was the cause. This is the same class as the leaked-row guard
  // in geometry.test.ts, and it throws for the same reason: it corrupts LATER
  // tests, so failing here is the only place the diagnosis is still cheap.
  const problems: string[] = []
  const attempt = async (what: string, fn: () => Promise<unknown>): Promise<void> => {
    await fn().catch((err) => problems.push(`${what}: ${(err as Error).message}`))
  }

  // ONLY if actually fullscreen: setFullScreen(false) is itself a path that can
  // show the window on Windows, and no test enters real fullscreen any more.
  await attempt('leave fullscreen', async () => {
    if (await Shell.isFullScreen()) await Shell.setFullScreen(false)
  })
  await attempt('unmaximize', () => Shell.unmaximize())
  if (originalSize) {
    await attempt('restore size', () =>
      Shell.setWindowSize(originalSize!.width, originalSize!.height)
    )
  }

  // Confirm it actually landed, rather than trusting that no step threw.
  const state = await Shell.windowState().catch((err) => {
    problems.push(`could not read the window back: ${(err as Error).message}`)
    return null
  })
  if (state) {
    if (state.fullScreen) problems.push('still fullscreen')
    if (state.maximized) problems.push('still maximized')
    if (originalSize && (state.width !== originalSize.width || state.height !== originalSize.height)) {
      problems.push(
        `size is ${state.width}x${state.height}, expected ${originalSize.width}x${originalSize.height}`
      )
    }
  }

  // THE HEADLESS GUARD. Two oracles, because either alone can miss: the 'show'
  // count catches a window shown and hidden again within the test, and
  // isVisible() catches one shown by a path that emits no 'show'. RECORDED, not
  // thrown: rehide() below puts the window back, so later tests are safe to run,
  // and after() fails the file with the names (see the header).
  if (!headed) {
    const title = this.currentTest?.title ?? '<unknown test>'
    const shown = await Shell.takeShowCount().catch((err) => {
      headlessViolations.push(`"${title}": could not read the show guard: ${(err as Error).message}`)
      return 0
    })
    if (shown > 0 || state?.visible) {
      headlessViolations.push(`"${title}" (shown ${shown}x, visible after it: ${state?.visible})`)
    }
  }

  // LAST, and BEFORE any throw: a safety net so that one failure above does not
  // leave a window on the desktop for the rest of the file.
  await Shell.rehide().catch((err) => problems.push(`rehide: ${(err as Error).message}`))

  if (problems.length) {
    throw new Error(
      `shell teardown did not restore the window — ${problems.join('; ')}. ` +
        'Every later test in this file would have run at the wrong geometry.'
    )
  }
})

describe('shell — window controls over the real IPC bridge', () => {
  // COMMENTED OUT 29 Sep 2026, deliberately and at the owner's request — this
  // is NOT the accident trap 39 warns about, so do not convert it to it.skip
  // without asking. It no longer appears in the skip count.
  //
  // Why: it fails on a display-less Linux server. wdio runs the worker under
  // xvfb-run there, which has NO window manager, and on Linux it is the window
  // manager that carries out a maximize — so isMaximized() never turns true and
  // the first wait below times out ("clicking Maximize did not maximize the
  // BrowserWindow"). Passes on Windows and on a Linux desktop. Not on macOS
  // either way: there is no painted Maximize button to click there.
  //
  // itNotMac('Maximize toggles the window, and toggles it back', async () => {
  //   expect(await Shell.isMaximized()).toBe(false)
  //
  //   await Shell.maximizeButton.click()
  //   await browser.waitUntil(async () => Shell.isMaximized(), {
  //     timeout: TIMEOUTS.MEDIUM,
  //     timeoutMsg: 'clicking Maximize did not maximize the BrowserWindow'
  //   })
  //
  //   // The same control unmaximizes — the handler toggles on isMaximized().
  //   await Shell.maximizeButton.click()
  //   await browser.waitUntil(async () => (await Shell.isMaximized()) === false, {
  //     timeout: TIMEOUTS.MEDIUM,
  //     timeoutMsg: 'clicking Maximize again did not restore the window'
  //   })
  // })

  it('the platform bridge answers with the real platform', async () => {
    const reported = await browser.execute(async () => {
      const api = (window as unknown as { api?: { getPlatform?: () => Promise<string> } }).api
      return (await api?.getPlatform?.()) ?? null
    })
    expect(reported).toBe(process.platform)
  })

  itMacOnly('on macOS the renderer paints NO window controls — the OS traffic lights replace them', async () => {
    // Guard against passing for the wrong reason: the controls are hidden on
    // macOS because the RENDERER was told darwin, so check that first.
    const reported = await browser.execute(async () => {
      const api = (window as unknown as { api?: { getPlatform?: () => Promise<string> } }).api
      return (await api?.getPlatform?.()) ?? null
    })
    expect(reported).toBe('darwin')
    await expect(HomePage.header).toBeDisplayed()

    // Poll, never check once: useIsMac starts false, so all three flash in on
    // every Header mount until getPlatform() resolves. Fresh $() per poll.
    const anyControlExists = async (): Promise<boolean> => {
      for (const label of WINDOW_CONTROL_LABELS) {
        if (await $(`[aria-label="${label}"]`).isExisting()) return true
      }
      return false
    }
    await browser.waitUntil(async () => !(await anyControlExists()), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the renderer still paints window controls on macOS'
    })
    expect(await staysFalse(anyControlExists)).toBe(true)
  })

  // Not on macOS: the title bar deliberately stays in fullscreen there (below).
  itNotMac('entering fullscreen hides the title bar, and leaving restores it', async () => {
    // Driven by the window's OWN enter-/leave-full-screen events, emitted from
    // the main process, so the app's real listeners push window:fullScreenChange
    // into the renderer — WITHOUT the window going fullscreen. A real
    // setFullScreen maps the hidden window on Linux (and leaving it does on
    // Windows), which put this test on the desktop; see the header. F11 through
    // browser.keys is no alternative: it depends on window focus, which a
    // never-shown window does not reliably have, and it too goes fullscreen.
    const { id } = await enterProject('fs')
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    await Shell.emitFullScreenEvent(true)
    await ProjectScreen.projectTitle.waitForExist({
      reverse: true,
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the title bar did not collapse on entering fullscreen'
    })

    await Shell.emitFullScreenEvent(false)
    await ProjectScreen.projectTitle.waitForDisplayed({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the title bar did not come back on leaving fullscreen'
    })

    await reloadToHome()
    await deleteProjectViaBackend(id).catch(() => {})
  })

  itMacOnly('on macOS the title bar STAYS in fullscreen', async () => {
    // The macOS half of the test above. Header keeps the row on darwin because
    // the native traffic lights auto-hide and reveal on hover there.
    //
    // Driven by emitted events like the test above. This used to call a real
    // setFullScreen and SELF-SKIP when a hidden window was never given a macOS
    // fullscreen Space; the emitted event always arrives, so it now always runs.
    const { id } = await enterProject('fsmac')
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    // Record what the RENDERER hears. Without this the assertion below would
    // pass on `isMac` alone even if window:fullScreenChange never arrived, since
    // the title bar also stays when the renderer thinks it is NOT fullscreen.
    await browser.execute(() => {
      const w = window as unknown as {
        api: { onFullScreenChange: (cb: (v: boolean) => void) => () => void }
        __e2eFullScreen?: boolean[]
      }
      const seen: boolean[] = []
      w.__e2eFullScreen = seen
      w.api.onFullScreenChange((v) => seen.push(v))
    })

    try {
      await Shell.emitFullScreenEvent(true)
      await browser.waitUntil(
        async () =>
          browser.execute(() =>
            ((window as unknown as { __e2eFullScreen?: boolean[] }).__e2eFullScreen ?? []).includes(true)
          ),
        {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'enter-full-screen fired but the renderer never heard window:fullScreenChange'
        }
      )
      expect(
        await staysFalse(async () => !(await ProjectScreen.projectTitle.isDisplayed()))
      ).toBe(true)
    } finally {
      // Pass or fail, tell the renderer fullscreen is over before cleaning up.
      await Shell.emitFullScreenEvent(false).catch(() => {})
      await reloadToHome()
      await deleteProjectViaBackend(id).catch(() => {})
    }
  })
})

describe('shell — the menu bar', () => {
  it('every catalogued menu item is present', async () => {
    // Items are visibility:hidden until hover but ALWAYS in the DOM, so this
    // enumerates without opening anything.
    const labels = await Shell.menuItemLabels()
    for (const expected of TOOLBAR_LABELS) expect(labels).toContain(expected)
    expect(labels).toHaveLength(TOOLBAR_LABELS.length)
  })

  it('hovering a group REVEALS its items', async () => {
    // The one test of the hover mechanism itself: HomePage.clickMenuItem
    // deliberately bypasses it with a JS click, so `group-hover:visible` has
    // never been exercised end to end. isDisplayed() is the right oracle —
    // isExisting() is always true here.
    const item = Shell.menuItem('New Project')
    expect(await item.isDisplayed()).toBe(false)

    await Shell.hoverMenuGroup('File')
    await item.waitForDisplayed({
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: 'hovering File did not reveal its dropdown items'
    })
  })

  it('only New Project is wired on Home — the rest are inert', async () => {
    // clickMenuItem now THROWS on a missing item, so a renamed or deleted item
    // fails loudly instead of passing as "nothing happened".
    for (const label of ['Open Project', 'Import Project', 'Undo', 'Redo', 'Preferences']) {
      await HomePage.clickMenuItem(label)
      expect(await staysFalse(() => HomePage.createDialog.isDisplayed())).toBe(true)
      await expect(HomePage.projectsTable).toBeDisplayed()
    }

    await HomePage.clickMenuItem('New Project')
    await HomePage.createDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await HomePage.closeCreateDialogViaX()
  })

  it('the whole menu bar is inert on the ProjectScreen', async () => {
    // ProjectScreen passes onItemSelect={() => {}}, so even New Project does
    // nothing there. Nothing asserted this before.
    const { id } = await enterProject('menuinert')
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    await HomePage.clickMenuItem('New Project')
    expect(await staysFalse(() => HomePage.createDialog.isDisplayed())).toBe(true)
    await expect(ProjectScreen.projectTitle).toBeDisplayed()

    await reloadToHome()
    await deleteProjectViaBackend(id).catch(() => {})
  })
})

describe('shell — sidebar active state', () => {
  it('Home starts active and the clicked item takes over', async () => {
    // data-active is ALWAYS present as the literal "true"/"false", so compare
    // the value — absence is never the signal.
    expect(await Shell.sidebarActive('Home')).toBe(true)
    expect(await Shell.activeSidebarLabel()).toBe('Home')

    // "Open project" is a no-op action, but selecting it still marks it active:
    // the highlight is local state set on every click, independent of what the
    // item does.
    await Shell.sidebarButton('Open project').click()
    await browser.waitUntil(async () => (await Shell.activeSidebarLabel()) === 'Open project', {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'clicking a sidebar item did not move the active flag'
    })
    expect(await Shell.sidebarActive('Home')).toBe(false)
  })
})

describe('shell — the scenario controls are inert', () => {
  it('Add, Close and Rename scenario exist, are enabled, and do nothing', async () => {
    const { id } = await enterProject('scenchip')
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    const before = await Shell.scenarioChipText()
    expect(before).toContain('Scenario 1')

    for (const button of [
      Shell.renameScenarioButton,
      Shell.closeScenarioButton,
      Shell.addScenarioButton
    ]) {
      await expect(button).toBeDisplayed()
      expect(await button.isEnabled()).toBe(true)
      await button.click()
    }

    // Still one chip, still the same text, and no dialog opened.
    expect(await Shell.scenarioChipText()).toBe(before)
    expect(await staysFalse(() => $('dialog[open]').isDisplayed())).toBe(true)

    await reloadToHome()
    await deleteProjectViaBackend(id).catch(() => {})
  })
})

describe('shell — layout and close wiring', () => {
  it('the project screen stays usable at 1024x768', async () => {
    // The narrow CI display, reproduced. The app sizes from the display work
    // area, so a dev box gives ~1728 CSS px and every runner ~1024 — which is
    // the source of "passes locally, fails on every runner" clipping.
    const { id } = await enterProject('narrow')
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    await Shell.setWindowSize(1024, 768)

    await expect(ProjectScreen.projectTitle).toBeDisplayed()
    await expect(ProjectScreen.tab('3dwindow')).toBeDisplayed()
    await expect(ProjectScreen.tab('weather')).toBeDisplayed()
    // The right-hand end of the title bar, i.e. nothing clipped at 1024px. On
    // macOS that end is empty by design (native lights sit on the LEFT).
    if (!isMac) await expect(Shell.maximizeButton).toBeDisplayed()

    // And it is still operable, not merely painted.
    await ProjectScreen.selectTab('weather')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    await reloadToHome()
    await deleteProjectViaBackend(id).catch(() => {})
  })

  // LAST, and against a stub: the real handler quits the app.
  // Not on macOS: there is no painted Close button, and nothing in the renderer
  // calls window:close there.
  itNotMac('Close is wired to the window:close channel', async () => {
    await Shell.stubWindowClose()
    expect(await Shell.windowCloseCalls()).toBe(0)

    await Shell.closeButton.click()

    await browser.waitUntil(async () => (await Shell.windowCloseCalls()) === 1, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'clicking Close did not reach the window:close IPC channel'
    })
    // The app is still alive precisely because the handler was stubbed.
    await expect(HomePage.projectsTable).toBeDisplayed()
  })
})
