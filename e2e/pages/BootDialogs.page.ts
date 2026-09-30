/**
 * The three project-boot dialogs: the Opening loader, the boot error, and the
 * scope-lost notice.
 *
 * Why a dedicated page object rather than support/dialogs.ts
 * ─────────────────────────────────────────────────────────
 * `readOpenDialog()` reads the FIRST `dialog[open]` in DOM order. These three
 * mount as the last children of App's root (App.tsx renders <OpeningLoader />
 * and <ScopeLostDialog /> after the screen), so any panel confirmation left
 * open anywhere else in the tree wins that race and the generic reader silently
 * describes the wrong dialog. Everything here is addressed by
 * `dialog[aria-label="…"][open]` instead, which is unambiguous — none of the
 * three carries a data-testid, but all three titles are unique app-wide.
 *
 * State model worth knowing before writing assertions:
 *  - None of the three exists in the DOM when idle. OpeningLoader returns null
 *    unless `active || error`; ScopeLostDialog returns null unless `loss`. So
 *    `isExisting()` is a valid oracle here, unlike most of this app's UI which
 *    hides with CSS and stays mounted.
 *  - The loader and the scope dialog can never be open at the same time:
 *    SCOPE_LOST sets `active = false` and `error = null` in the same reducer case.
 *  - BOOT_FAILED deliberately leaves `active = true`, so the loader SWAPS in
 *    place into the error dialog rather than unmounting and remounting.
 *  - `Retry` renders only when the failure is retryable — `!(400 <= status < 500)`.
 *    `Go to Home` is always present.
 */
import { TIMEOUTS } from '../config/timeouts'
import { BOOT_MSG } from '../constants/messages'

type El = ReturnType<typeof $>

class BootDialogsPage {
  /** Any open dialog with this exact aria-label (the component's `title` prop). */
  dialog(title: string): El {
    return $(`dialog[aria-label="${title}"][open]`)
  }

  get openingDialog(): El {
    return this.dialog(BOOT_MSG.loaderTitle)
  }
  get errorDialog(): El {
    return this.dialog(BOOT_MSG.errorTitle)
  }
  get scopeDialog(): El {
    return this.dialog(BOOT_MSG.scopeTitle)
  }

  get progressBar(): El {
    return this.openingDialog.$('[role="progressbar"]')
  }

  // ----- Waits -----

  async waitForOpening(timeout = TIMEOUTS.MEDIUM): Promise<void> {
    await this.openingDialog.waitForExist({
      timeout,
      timeoutMsg:
        'the Opening loader never appeared. A boot completes in well under 100ms, so this ' +
        'needs installApiLatency/installSseLatency to be observable at all.'
    })
  }

  async waitForError(timeout = TIMEOUTS.LONG): Promise<void> {
    await this.errorDialog.waitForExist({
      timeout,
      timeoutMsg: `the "${BOOT_MSG.errorTitle}" dialog never appeared`
    })
  }

  async waitForScope(timeout = TIMEOUTS.LONG): Promise<void> {
    await this.scopeDialog.waitForExist({
      timeout,
      timeoutMsg: `the "${BOOT_MSG.scopeTitle}" dialog never appeared`
    })
  }

  // ----- Reads -----

  /**
   * `aria-valuenow` on the progress bar, or null if it is not mounted.
   * The bar clamps and rounds, so this is always an integer 0-100.
   */
  async progressValue(): Promise<number | null> {
    return browser.execute((title: string) => {
      const bar = document.querySelector(
        `dialog[aria-label="${title}"][open] [role="progressbar"]`
      )
      if (!bar) return null
      const raw = bar.getAttribute('aria-valuenow')
      return raw === null ? null : Number(raw)
    }, BOOT_MSG.loaderTitle)
  }

  /**
   * The loader's caption. It is the BACKEND's `message` verbatim — the frontend
   * writes no fallback — so it is legitimately '' on the first frame, before
   * any progress event has landed.
   */
  async caption(): Promise<string | null> {
    return browser.execute((title: string) => {
      const p = document.querySelector(`dialog[aria-label="${title}"][open] p`)
      return p ? (p.textContent ?? '').trim() : null
    }, BOOT_MSG.loaderTitle)
  }

  /** The single body paragraph of the error or scope dialog. */
  async bodyText(title: string): Promise<string | null> {
    return browser.execute((t: string) => {
      const p = document.querySelector(`dialog[aria-label="${t}"][open] p`)
      return p ? (p.textContent ?? '').trim() : null
    }, title)
  }

  /**
   * Body button labels in DOM order, EXCLUDING the header ×.
   *
   * The × sits outside the body div, so a bare `dialog button` list has one
   * more entry than the component's own action set — the same trap
   * support/dialogs.ts documents.
   */
  async buttons(title: string): Promise<string[]> {
    return browser.execute((t: string) => {
      const dlg = document.querySelector(`dialog[aria-label="${t}"][open]`)
      if (!dlg) return []
      return Array.from(dlg.querySelectorAll('button'))
        .filter((b) => b.getAttribute('data-testid') !== 'dialog-close')
        .map((b) => (b.textContent ?? '').trim())
        .filter(Boolean)
    }, title)
  }

  /** True when the boot error offers Retry — i.e. the failure was retryable. */
  async hasRetry(): Promise<boolean> {
    return (await this.buttons(BOOT_MSG.errorTitle)).includes(BOOT_MSG.errorRetry)
  }

  /**
   * aria-labels of every open dialog, app-wide.
   *
   * The oracle for the scope-loss LATCH: a dead project fails every in-flight
   * call at once, and `reported` exists so the user gets one dialog rather than
   * ten. Asserting a length of 1 here is what pins that.
   */
  async openDialogTitles(): Promise<string[]> {
    return browser.execute(() =>
      Array.from(document.querySelectorAll('dialog[open]')).map(
        (d) => d.getAttribute('aria-label') ?? ''
      )
    )
  }

  // ----- Actions -----

  /**
   * Click a body button by its exact label, scoped to one dialog.
   *
   * Clicked in-page rather than through WebDriver: these dialogs are modal
   * (showModal puts them in the top layer) and a sibling overlay left by a
   * failed step would otherwise intercept and blame the wrong element.
   */
  async clickButton(title: string, label: string): Promise<void> {
    const clicked = await browser.execute(
      (t: string, l: string) => {
        const dlg = document.querySelector(`dialog[aria-label="${t}"][open]`)
        if (!dlg) return false
        const btn = Array.from(dlg.querySelectorAll('button')).find(
          (b) =>
            b.getAttribute('data-testid') !== 'dialog-close' && (b.textContent ?? '').trim() === l
        ) as HTMLElement | undefined
        if (!btn) return false
        btn.click()
        return true
      },
      title,
      label
    )
    if (!clicked) {
      const open = await this.openDialogTitles()
      throw new Error(
        `No "${label}" button in an open dialog titled "${title}".\n` +
          `  open dialogs: ${open.length ? open.join(', ') : '(none)'}`
      )
    }
  }

  /** Cancel an in-progress boot from the loader. */
  async cancelBoot(): Promise<void> {
    await this.clickButton(BOOT_MSG.loaderTitle, BOOT_MSG.loaderCancel)
  }

  async retryBoot(): Promise<void> {
    await this.clickButton(BOOT_MSG.errorTitle, BOOT_MSG.errorRetry)
  }

  async goHomeFromError(): Promise<void> {
    await this.clickButton(BOOT_MSG.errorTitle, BOOT_MSG.errorHome)
  }

  async goHomeFromScope(): Promise<void> {
    await this.clickButton(BOOT_MSG.scopeTitle, BOOT_MSG.scopeHome)
  }
}

export default new BootDialogsPage()
