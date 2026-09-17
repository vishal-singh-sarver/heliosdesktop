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
 *    `show()`), so `isVisible()` is false all run and must not be asserted.
 *    `maximize`/`unmaximize` and `setFullScreen` still mutate real state on a
 *    hidden window; `minimize` does not do so reliably and may not be
 *    recoverable, which is why there is no minimize helper here.
 *  - BUT `maximize()` SHOWS a hidden window (Electron: "This will also show
 *    (but not focus) the window if it isn't being displayed already" — the
 *    docs give no platform qualifier, so do not assume Windows only), and on
 *    Windows leaving fullscreen flips it visible too. Measured 15 Sep 2026 on
 *    Windows with a window watcher: this was the ONLY spec in the whole run
 *    that put anything on the desktop — a 1536x816 window at 0,0 that stayed
 *    up for the rest of the file. `keepOffDesktop()` and `rehide()` below are
 *    what make this spec as headless as every other one.
 *  - On macOS fullscreen transitions are ASYNCHRONOUS (electron.d.ts, notes on
 *    setFullScreen and isFullScreen): the state is only trustworthy once
 *    enter-/leave-full-screen has fired. Use armFullScreenEvents() and
 *    fullScreenEvents() rather than trusting an immediate isFullScreen().
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

  /** Drive fullscreen from the main process so the REAL enter/leave events fire. */
  async setFullScreen(value: boolean): Promise<void> {
    await browser.electron.execute((electron, v: boolean) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      win?.setFullScreen(v)
    }, value)
  }

  /**
   * Arm one-shot recorders for the main window's `enter-full-screen` and
   * `leave-full-screen` events, both starting false. Re-arming starts a fresh
   * record; listeners from an earlier arm only ever write to their own record.
   */
  async armFullScreenEvents(): Promise<void> {
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      if (!win) throw new Error('armFullScreenEvents: no main window')
      const record = { entered: false, left: false }
      ;(globalThis as unknown as Record<string, unknown>)['__e2eFullScreenEvents'] = record
      win.once('enter-full-screen', () => {
        record.entered = true
      })
      win.once('leave-full-screen', () => {
        record.left = true
      })
    })
  }

  /** What the recorders armed by armFullScreenEvents() have seen so far. */
  async fullScreenEvents(): Promise<{ entered: boolean; left: boolean }> {
    return browser.electron.execute(() => {
      const record = (globalThis as unknown as Record<string, unknown>)['__e2eFullScreenEvents'] as
        | { entered: boolean; left: boolean }
        | undefined
      return record ? { entered: record.entered, left: record.left } : { entered: false, left: false }
    })
  }

  /**
   * Maximize from the main process.
   *
   * Only the `before()` baseline settle uses this — the TESTS maximize by
   * clicking the real title-bar button, which is the behaviour under test.
   * Electron's maximize() also SHOWS a hidden window (documented with no platform
   * qualifier), so callers must have run keepOffDesktop() first and rehide()
   * after (see the header).
   */
  async maximize(): Promise<void> {
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      win?.maximize()
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
        fullScreen: win ? win.isFullScreen() : false
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
   * Make the window invisible and click-through at the OS level BEFORE any test
   * can show it. Call once, in before(): the BrowserWindow outlives renderer
   * refreshes (reloadToHome), so it holds for the whole spec file.
   *
   *  - setOpacity(0): a maximize/fullscreen that shows the window paints nothing.
   *    It must be set BEFORE fullscreen — Chromium restores the saved ex-style on
   *    leaving fullscreen, so opacity applied during it would be lost.
   *  - setSkipTaskbar(true): on Windows this is only ITaskbarList::DeleteTab, which
   *    removes a button that already exists — on a never-shown window it is
   *    inert, so a button CAN appear while a maximize keeps the window shown
   *    (~0.4s measured). rehide() is what removes it. Kept for headed-style
   *    windows that were shown before this call.
   *  - setIgnoreMouseEvents(true): OS-level pass-through only. WebDriver input
   *    arrives through CDP Input.* straight into the renderer, which this does
   *    not touch — the suite already drives a never-shown window that way.
   *
   * Scoped to this spec on purpose. It is the only one that can show the window,
   * and a layered (alpha) top-level window is an untested path for the WebGL
   * canvas every other spec mounts.
   */
  async keepOffDesktop(): Promise<void> {
    if (headed()) return
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !w.webContents.getURL().includes('helios-splash')
      )
      if (!win) throw new Error('keepOffDesktop: no main window')
      win.setOpacity(0)
      win.setSkipTaskbar(true)
      win.setIgnoreMouseEvents(true)
    })
  }

  /**
   * Put the window back into the never-shown state isHeadlessTestRun() starts it
   * in. Call AFTER unmaximize/setFullScreen(false): on Windows both restore
   * through a path that re-shows the window, so hiding first would be undone.
   * hide() is safe for the renderer: backgroundThrottling is off under e2e
   * (src/main/index.ts), so a hidden-again window behaves like a never-shown one.
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
