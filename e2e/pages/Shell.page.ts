/**
 * The application shell: window controls, the menu bar, the sidebar's active
 * state, and the scenario chip.
 *
 * Platform and headless facts that decide what is assertable here
 * ──────────────────────────────────────────────────────────────
 *  - `WindowControls` carries NO data-testid. Every button is addressable only
 *    by aria-label: "Minimize window", "Maximize window", "Close window".
 *  - It is only ever mounted with side="right" (Header renders it under
 *    `!isMac && !isFullScreen`). The macOS traffic-light hover swap in the
 *    side="left" branch is unreachable in the shipped app — leave it to the
 *    unit test rather than treating it as an E2E gap.
 *  - ON macOS NONE OF THE THREE BUTTONS EXIST once getPlatform() has resolved:
 *    the OS draws native traffic lights, which are not in the DOM. They DO
 *    flash in on every Header mount, because useIsMac starts false — so poll
 *    for their absence, never check it once. macOS also keeps the title bar in
 *    fullscreen (`showTitleBar = isMac || !isFullScreen`). shell.test.ts
 *    branches on darwin for exactly these two facts.
 *  - The window is NEVER shown under E2E (`isHeadlessTestRun()` skips every
 *    `show()`), and this page object must never be the thing that shows it.
 *    HEADLESS ON EVERY OS, INCLUDING A DISPLAY-LESS LINUX SERVER (Xvfb, no
 *    window manager), so there is deliberately NO helper that changes real
 *    window state in a way that maps the window:
 *      - `maximize()` SHOWS a hidden window on every OS (Electron: "This will
 *        also show (but not focus) the window"), and under Xvfb it never even
 *        takes effect — there is no window manager to carry it out (measured
 *        29 Sep 2026: shown, isMaximized() false for good).
 *      - A real `setFullScreen(true)` maps a hidden window on Linux (measured
 *        under Xvfb, 29 Sep 2026), and on Windows LEAVING fullscreen does.
 *      - `setOpacity(0)`, which the old keepOffDesktop() relied on, is
 *        `@platform win32,darwin` — a no-op on Linux, where a maximized window
 *        therefore really appeared on the desktop.
 *    Fullscreen is driven with emitFullScreenEvent() instead, and
 *    armShowGuard()/takeShowCount() let shell.test.ts fail the spec file,
 *    naming every test during which the window was shown.
 *  - `minimize` does not mutate a hidden window reliably and may not be
 *    recoverable, which is why there is no minimize helper here.
 *  - Menu dropdown items are `visibility: hidden` until the group is hovered,
 *    and are ALWAYS in the DOM. So `isDisplayed()` is the correct oracle for
 *    the hover reveal and `isExisting()` is meaningless.
 *  - Every main-process helper picks the main window by EXCLUDING the splash
 *    (it loads a temp `helios-splash.html`). The splash is created first and
 *    lives until the renderer's `app:ready`, which is later than
 *    waitForMainWindow() returns — so `getAllWindows()[0]` or the first
 *    undestroyed window can be the 1000x600 splash.
 */
import { TIMEOUTS } from '../config/timeouts'

type El = ReturnType<typeof $>

/** True when the developer asked to WATCH the run (see src/main/index.ts). */
const headed = (): boolean => process.env['HELIOS_E2E_HEADED'] === '1'

class ShellPage {
  // ----- Window controls (aria-label only; no testids exist) -----

  get maximizeButton(): El {
    return $('[aria-label="Maximize window"]')
  }
  get minimizeButton(): El {
    return $('[aria-label="Minimize window"]')
  }
  get closeButton(): El {
    return $('[aria-label="Close window"]')
  }

  /** Maximized state read from the MAIN process, not the renderer. */
  async isMaximized(): Promise<boolean> {
    return browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      return win ? win.isMaximized() : false
    })
  }

  async isFullScreen(): Promise<boolean> {
    return browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      return win ? win.isFullScreen() : false
    })
  }

  /**
   * Real fullscreen, from the main process. TEARDOWN SAFETY NET ONLY — no test
   * may call it: it maps a hidden window on Linux (and leaving it does on
   * Windows). afterEach calls setFullScreen(false) only if isFullScreen() is
   * already true, which nothing in the spec should ever cause.
   */
  async setFullScreen(value: boolean): Promise<void> {
    await browser.electron.execute((electron, v: boolean) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      win?.setFullScreen(v)
    }, value)
  }

  /**
   * Fire the main window's OWN `enter-full-screen` / `leave-full-screen` event
   * without changing the window.
   *
   * The app's listeners on those events (src/main/index.ts) send
   * `window:fullScreenChange` through the preload bridge to the Header, so this
   * still exercises the main-process wiring, the IPC channel and the renderer's
   * reaction — everything except the OS actually entering fullscreen, which
   * cannot be done headless (see the header). Measured under Xvfb, 29 Sep 2026:
   * the listeners fire, and the window stays hidden, unmaximized and at its size.
   */
  async emitFullScreenEvent(entered: boolean): Promise<void> {
    await browser.electron.execute((electron, e: boolean) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      if (!win) throw new Error('emitFullScreenEvent: no main window')
      win.emit(e ? 'enter-full-screen' : 'leave-full-screen')
    }, entered)
  }

  /**
   * Count every time the main window is shown, from now on. Call once, in
   * before(): the BrowserWindow outlives renderer refreshes (reloadToHome), so
   * the listener holds for the whole spec file. Arming twice does not add a
   * second listener.
   */
  async armShowGuard(): Promise<void> {
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      if (!win) throw new Error('armShowGuard: no main window')
      const g = globalThis as unknown as Record<string, unknown>
      g['__e2eShowCount'] = 0
      if (g['__e2eShowGuardArmed']) return
      g['__e2eShowGuardArmed'] = true
      win.on('show', () => {
        g['__e2eShowCount'] = ((g['__e2eShowCount'] as number) ?? 0) + 1
      })
    })
  }

  /** How many times the window was shown since the last call, then reset to 0. */
  async takeShowCount(): Promise<number> {
    return browser.electron.execute(() => {
      const g = globalThis as unknown as Record<string, unknown>
      const n = (g['__e2eShowCount'] as number) ?? 0
      g['__e2eShowCount'] = 0
      return n
    })
  }

  /** Restore a maximized window. Used by afterEach so one test cannot leak geometry. */
  async unmaximize(): Promise<void> {
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      if (win?.isMaximized()) win.unmaximize()
    })
  }

  /**
   * Size AND both geometry flags in ONE main-process round trip.
   *
   * Used by the afterEach restore check. Reading isFullScreen(), isMaximized()
   * and windowSize() separately is three round-trips against a window that the
   * teardown is actively putting back, so the three can disagree — an
   * unmaximize landing between calls reports "not maximized" at the old size.
   * One read cannot tear.
   */
  async windowState(): Promise<{
    width: number
    height: number
    maximized: boolean
    fullScreen: boolean
    visible: boolean
  }> {
    return browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      const b = win ? win.getBounds() : { width: 0, height: 0 }
      return {
        width: b.width,
        height: b.height,
        maximized: win ? win.isMaximized() : false,
        fullScreen: win ? win.isFullScreen() : false,
        visible: win ? win.isVisible() : false
      }
    })
  }

  async windowSize(): Promise<{ width: number; height: number }> {
    return browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      const b = win ? win.getBounds() : { width: 0, height: 0 }
      return { width: b.width, height: b.height }
    })
  }

  /**
   * Resize through the main process.
   *
   * `browser.setWindowSize()` does NOT work in this Electron build: it issues
   * WebDriver `window/rect`, which needs the CDP command
   * Browser.getWindowForTarget, and that is unimplemented here — the same gap
   * the harness works around for scrollIntoView.
   */
  async setWindowSize(width: number, height: number): Promise<void> {
    await browser.electron.execute(
      (electron, w: number, h: number) => {
        const win = electron.BrowserWindow.getAllWindows().find(
          (x) => !x.isDestroyed() && !x.webContents.getURL().includes('helios-splash')
        )
        win?.setSize(w, h)
      },
      width,
      height
    )
  }

  /**
   * Put the window back into the never-shown state isHeadlessTestRun() starts it
   * in. A SAFETY NET: nothing in the spec should show the window, and the show
   * guard fails the test if something does — this only stops that one failure
   * leaving a window on the desktop for the rest of the file. Call AFTER
   * unmaximize/setFullScreen(false): on Windows both restore through a path that
   * re-shows the window, so hiding first would be undone. hide() is safe for
   * the renderer: backgroundThrottling is off under e2e (src/main/index.ts), so
   * a hidden-again window behaves like a never-shown one.
   */
  async rehide(): Promise<void> {
    if (headed()) return
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      if (win?.isVisible()) win.hide()
    })
  }

  /**
   * Replace the `window:close` IPC handler with a recorder.
   *
   * Clicking Close for real ends the Electron process — `win.close()` →
   * `window-all-closed` → `app.quit()` — which would kill every remaining test
   * in the run. Stubbing turns the assertion into "the button is wired to the
   * right channel", which is the part that can actually regress. Same technique
   * the harness already uses for `dialog:openFile`.
   */
  async stubWindowClose(): Promise<void> {
    await browser.electron.execute((electron) => {
      const ipc = electron.ipcMain
      const w = globalThis as unknown as Record<string, unknown>
      w['__e2eWindowCloseCalls'] = 0
      ipc.removeHandler('window:close')
      ipc.handle('window:close', () => {
        w['__e2eWindowCloseCalls'] = ((w['__e2eWindowCloseCalls'] as number) ?? 0) + 1
        return 'stubbed'
      })
    })
  }

  /** How many times the stubbed `window:close` handler was invoked. */
  async windowCloseCalls(): Promise<number> {
    return browser.electron.execute(() => {
      const w = globalThis as unknown as Record<string, unknown>
      return (w['__e2eWindowCloseCalls'] as number) ?? 0
    })
  }

  // ----- Menu bar -----

  get menubar(): El {
    return $('[data-testid="menubar"]')
  }

  /** A dropdown item. The testid is the label verbatim, spaces included. */
  menuItem(label: string): El {
    return $(`[data-testid="menu-${label}"]`)
  }

  /**
   * Hover a top-level group ("File", "Edit", …) to reveal its dropdown.
   *
   * There is no state and no aria-expanded — the panel is `invisible` and
   * Tailwind's `group-hover:visible` is the whole mechanism, so a real pointer
   * move is the only way to exercise it. `HomePage.clickMenuItem` deliberately
   * bypasses this with a JS click, which is why the reveal itself has never
   * been tested.
   */
  async hoverMenuGroup(label: string): Promise<void> {
    const trigger = this.menubar.$(`button=${label}`)
    await trigger.waitForExist({
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: `no menu-bar group button labelled "${label}"`
    })
    await trigger.moveTo()
  }

  /** Every menu item testid currently in the DOM, in document order. */
  async menuItemLabels(): Promise<string[]> {
    return browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid^="menu-"]')).map((el) =>
        (el.getAttribute('data-testid') ?? '').replace(/^menu-/, '')
      )
    )
  }

  // ----- Sidebar (HomePage only) -----

  sidebarButton(label: string): El {
    return $(`[data-testid="sidebar-${label}"]`)
  }

  /**
   * The sidebar's active flag. `data-active` is ALWAYS present as the literal
   * string "true"/"false", so absence is never the signal — compare the value.
   */
  async sidebarActive(label: string): Promise<boolean> {
    return browser.execute(
      (l: string) =>
        document.querySelector(`[data-testid="sidebar-${l}"]`)?.getAttribute('data-active') ===
        'true',
      label
    )
  }

  /** Which sidebar item is currently marked active, if any. */
  async activeSidebarLabel(): Promise<string | null> {
    return browser.execute(() => {
      const el = document.querySelector('[data-testid^="sidebar-"][data-active="true"]')
      return el ? (el.getAttribute('data-testid') ?? '').replace(/^sidebar-/, '') : null
    })
  }

  // ----- Scenario chip (ProjectScreen) -----

  get scenarioChip(): El {
    return $('[data-testid="scenario-chip"]')
  }
  get renameScenarioButton(): El {
    return $('[aria-label="Rename scenario"]')
  }
  get closeScenarioButton(): El {
    return $('[aria-label="Close scenario"]')
  }
  get addScenarioButton(): El {
    return $('[aria-label="Add scenario"]')
  }

  /** Chip text. Hardcoded to "Scenario 1" in the component — not data-driven. */
  async scenarioChipText(): Promise<string> {
    return (await this.scenarioChip.getText()).trim()
  }
}

export default new ShellPage()
