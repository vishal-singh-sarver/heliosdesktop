/**
 * The application shell: window controls, the menu bar, the sidebar's active
 * state, and the scenario chip.
 *
 * Eight IPC channels and 14 of the 16 menu items had no E2E traffic at all
 * before this file; the window controls were covered only by unit tests that
 * stub window.api, so the real preload bridge was never exercised.
 *
 * ── What is deliberately NOT here, and why ────────────────────────────────
 *
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
 * So the tests of the painted Maximize / Close buttons and of the title bar
 * collapsing are `itNotMac`, and `itMacOnly` pins what macOS ships instead.
 * The skips are declared, not commented out, so they are counted (trap 39).
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

/**
 * Leave fullscreen and make sure it STAYS left before returning.
 *
 * On macOS the transition is asynchronous, and afterEach reads the window state
 * immediately: a window still fullscreen at that moment throws there, and a
 * failed root afterEach aborts every remaining test in this file. An enter that
 * lands late (after we looked) would do the same, so after leaving we also hold
 * still for NEGATIVE_GATE and go round again if it came back on.
 */
async function leaveFullScreenAndSettle(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await Shell.isFullScreen()) {
      await Shell.armFullScreenEvents()
      await Shell.setFullScreen(false)
      await browser.waitUntil(async () => (await Shell.fullScreenEvents()).left, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'leave-full-screen never fired after setFullScreen(false)'
      })
    }
    if (await staysFalse(() => Shell.isFullScreen())) {
      await Shell.rehide()
      return
    }
  }
  throw new Error('the window kept returning to fullscreen after three attempts to leave it')
}

before(async () => {
  await waitForMainWindow()
  await waitForBackendReady()
  // This is the one spec that maximizes / fullscreens. maximize() SHOWS the
  // never-shown window (Electron documents no platform exception), and on
  // Windows leaving fullscreen does too. Make it invisible and click-through first so the
  // file stays as headless as every other one (see Shell.page.ts).
  await Shell.keepOffDesktop()
  // SETTLE THE BASELINE BEFORE ANY TEST MEASURES IT.
  //
  // Every other spec runs at the pinned HELIOS_E2E_VIEWPORT size, and an
  // offscreen window takes that size exactly — the window manager never sees it.
  // This spec is the one that maximizes, and maximize hands the window to the
  // WM, which clamps it to the DISPLAY WORK AREA and remembers the clamped
  // bounds as what unmaximize should restore. So a pinned 1600x1200 on a
  // 1002-tall display comes back 1600x1002 after the first maximize and can
  // never return to 1200.
  //
  // Doing one maximize/unmaximize round trip HERE means the baseline captured
  // below is a size the OS will actually grant, so afterEach's restore check
  // asserts something achievable instead of failing every single test. Safe
  // after keepOffDesktop(), which is what stops a maximize showing the window.
  // Each step is WAITED OUT: maximize/unmaximize are asynchronous WM
  // operations, and Shell.unmaximize() no-ops unless isMaximized() is already
  // true — so firing them back to back left the window MAXIMIZED and every test
  // then failed on its own first assertion.
  await Shell.maximize().catch(() => {})
  await browser
    .waitUntil(async () => Shell.isMaximized(), { timeout: TIMEOUTS.MEDIUM, interval: 100 })
    .catch(() => {})
  await Shell.unmaximize().catch(() => {})
  await browser
    .waitUntil(async () => !(await Shell.isMaximized()), {
      timeout: TIMEOUTS.MEDIUM,
      interval: 100
    })
    .catch(() => {})
  // maximize() shows a never-shown window (Electron documents no platform
  // exception), and nothing else would hide it again until the first afterEach.
  await Shell.rehide()
})

beforeEach(async () => {
  await reloadToHome()
  // The size every afterEach restores. windowSize() already skips the splash;
  // capturing after the first reload is belt-and-braces on top of that.
  if (!originalSize) originalSize = await Shell.windowSize()
})

afterEach(async () => {
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

  await attempt('leave fullscreen', () => Shell.setFullScreen(false))
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

  // LAST, and BEFORE any throw: the restores above can re-show the window on
  // Windows, and leaving it visible is worse than the geometry leak itself.
  await Shell.rehide().catch((err) => problems.push(`rehide: ${(err as Error).message}`))

  if (problems.length) {
    throw new Error(
      `shell teardown did not restore the window — ${problems.join('; ')}. ` +
        'Every later test in this file would have run at the wrong geometry.'
    )
  }
})

describe('shell — window controls over the real IPC bridge', () => {
  // Not on macOS: there is no painted Maximize button to click there.
  itNotMac('Maximize toggles the window, and toggles it back', async () => {
    expect(await Shell.isMaximized()).toBe(false)

    await Shell.maximizeButton.click()
    await browser.waitUntil(async () => Shell.isMaximized(), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'clicking Maximize did not maximize the BrowserWindow'
    })

    // The same control unmaximizes — the handler toggles on isMaximized().
    await Shell.maximizeButton.click()
    await browser.waitUntil(async () => (await Shell.isMaximized()) === false, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'clicking Maximize again did not restore the window'
    })
  })

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
    // Driven from the main process so the REAL enter/leave-full-screen events
    // fire and push window:fullScreenChange into the renderer. F11 through
    // browser.keys depends on window focus, which a never-shown window does not
    // reliably have.
    const { id } = await enterProject('fs')
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    await Shell.setFullScreen(true)
    await ProjectScreen.projectTitle.waitForExist({
      reverse: true,
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the title bar did not collapse on entering fullscreen'
    })

    await Shell.setFullScreen(false)
    await ProjectScreen.projectTitle.waitForDisplayed({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the title bar did not come back on leaving fullscreen'
    })
    // Leaving fullscreen flips a hidden window visible on Windows. Hide it only
    // AFTER the title is back: that proves leave-full-screen has fired, which on
    // macOS happens at the END of an asynchronous exit animation that a hide()
    // must not interrupt.
    await Shell.rehide()

    await reloadToHome()
    await deleteProjectViaBackend(id).catch(() => {})
  })

  itMacOnly('on macOS the title bar STAYS in fullscreen', async function () {
    // The macOS half of the test above. Header keeps the row on darwin because
    // the native traffic lights auto-hide and reveal on hover there.
    //
    // SELF-SKIPS when the window never enters fullscreen. A HIDDEN window (never
    // shown by the app; before() may have shown it briefly via maximize() and
    // hidden it again) may not be given a macOS fullscreen Space; Electron
    // documents nothing either way. The skip is counted, not hidden.
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

    let entered = false
    try {
      // Wait for the EVENT, not isFullScreen(): macOS transitions are async.
      await Shell.armFullScreenEvents()
      await Shell.setFullScreen(true)
      entered = await browser
        .waitUntil(async () => (await Shell.fullScreenEvents()).entered, {
          timeout: TIMEOUTS.MEDIUM
        })
        .then(() => true)
        .catch(() => false)

      if (entered) {
        await browser.waitUntil(
          async () =>
            browser.execute(() =>
              ((window as unknown as { __e2eFullScreen?: boolean[] }).__e2eFullScreen ?? []).includes(true)
            ),
          {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: 'the window entered fullscreen but the renderer never heard window:fullScreenChange'
          }
        )
        expect(
          await staysFalse(async () => !(await ProjectScreen.projectTitle.isDisplayed()))
        ).toBe(true)
      }
    } finally {
      // Before ANY exit, pass or fail or skip: the root afterEach reads the
      // window state at once, and a still-fullscreen window there aborts the file.
      await leaveFullScreenAndSettle()
      await reloadToHome()
      await deleteProjectViaBackend(id).catch(() => {})
    }

    if (!entered) {
      console.log(
        '[shell] "on macOS the title bar STAYS in fullscreen" skipped: the hidden ' +
          `window did not enter fullscreen within ${TIMEOUTS.MEDIUM}ms`
      )
      this.skip()
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
