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
 *  - The window is NEVER shown under E2E (`isHeadlessTestRun()` skips every
 *    `show()`), so `isVisible()` is false all run and must not be asserted.
 *    `maximize`/`unmaximize` and `setFullScreen` still mutate real state on a
 *    hidden window; `minimize` does not do so reliably and may not be
 *    recoverable, which is why there is no minimize helper here.
 *  - Menu dropdown items are `visibility: hidden` until the group is hovered,
 *    and are ALWAYS in the DOM. So `isDisplayed()` is the correct oracle for
 *    the hover reveal and `isExisting()` is meaningless.
 */
import { TIMEOUTS } from '../config/timeouts'

type El = ReturnType<typeof $>

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

  /**
   * Maximized state read from the MAIN process, not the renderer.
   *
   * Filters destroyed windows rather than taking `getAllWindows()[0]`: index 0
   * is the splash during startup, and although it is destroyed by the time
   * tests run, the filter makes that independent of timing.
   */
  async isMaximized(): Promise<boolean> {
    return browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      return win ? win.isMaximized() : false
    })
  }

  async isFullScreen(): Promise<boolean> {
    return browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      return win ? win.isFullScreen() : false
    })
  }

  /** Drive fullscreen from the main process so the REAL enter/leave events fire. */
  async setFullScreen(value: boolean): Promise<void> {
    await browser.electron.execute((electron, v: boolean) => {
      const win = electron.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      win?.setFullScreen(v)
    }, value)
  }

  /** Restore a maximized window. Used by afterEach so one test cannot leak geometry. */
  async unmaximize(): Promise<void> {
    await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      if (win?.isMaximized()) win.unmaximize()
    })
  }

  async windowSize(): Promise<{ width: number; height: number }> {
    return browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
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
        const win = electron.BrowserWindow.getAllWindows().find((x) => !x.isDestroyed())
        win?.setSize(w, h)
      },
      width,
      height
    )
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
