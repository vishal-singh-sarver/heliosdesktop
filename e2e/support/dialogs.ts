/**
 * Reading an OPEN confirmation dialog.
 *
 * Why this exists: every delete flow in Geometry and Materials goes through
 * components/Dialog, and until now the page objects only offered helpers that
 * drive a dialog straight to completion (deleteRow / cancelDelete). Nothing
 * could observe the dialog while it was open, which is why none of its copy —
 * the heading, the body, the button labels — has ever been asserted, and why
 * GEOMETRY_MSG.deleteTitle / deleteBody sat in the constants file with no
 * consumer.
 *
 * ── Three things that make a naive read wrong ─────────────────────────────
 *
 * 1. `[open]` IS LOAD-BEARING. components/Dialog always renders its <dialog>;
 *    `isOpen` only decides whether showModal() is called. TreeRow renders one
 *    per row, ObjectPropertiesForm renders another, and MaterialPropertiesForm
 *    renders TWO more (the whole material, and one per material-type card). A
 *    query without [open] matches a closed dialog belonging to some other row.
 *
 * 2. THE HEADER "×" IS NOT AN ACTION BUTTON. Dialog renders a
 *    `data-testid="dialog-close"` button in its <header>, outside the body
 *    div. Dialog's own bodyButtons() scopes to the body and therefore ignores
 *    it — so a test that reads `dialog[open] button` gets THREE entries where
 *    the component only ever considers two, and "the last button is the
 *    primary action" stops being true. `buttons` below is scoped to the body
 *    for exactly that reason; the × is reported separately as `closeButton`.
 *
 * 3. THE TWO HEADING SHAPES DIFFER. A geometry tree row renders two sibling
 *    <p> (`Delete "Ground.001"?` then the generic body); every other delete
 *    dialog renders <h3> + <p>. Reading "the h3" finds nothing on a tree row.
 *    `lines` collects both shapes in DOM order, and heading/body are just its
 *    first two entries.
 *
 * Reads are ONE browser.execute: a dialog's contents change as React commits,
 * and split reads can observe two different dialogs.
 */

import { TIMEOUTS } from '../config/timeouts'

export interface OpenDialog {
  /** Dialog's `title` prop, which components/Dialog puts on aria-label. */
  ariaLabel: string
  /** Headings and paragraphs in the BODY, in DOM order. */
  lines: string[]
  /** lines[0] — the sentence naming what is being acted on. */
  heading: string
  /** lines[1] — the consequence line, generic across both delete dialogs. */
  body: string
  /** Body action buttons in DOM order. EXCLUDES the header ×. */
  buttons: string[]
  /** Body buttons that are disabled — a subset of `buttons`. */
  disabledButtons: string[]
  /**
   * Label of the focused element, when focus is inside the dialog.
   *
   * Dialog focuses the first field, or — when there is none, which is the case
   * for every confirmation — the LAST enabled body button. Enter then triggers
   * that same button. So on a delete confirmation this reads "Delete", and
   * that is not a detail: it means opening the dialog and pressing Enter
   * deletes outright.
   */
  focused: string | null
  /** Whether the header × is present (it always is; asserted, never assumed). */
  hasCloseButton: boolean
}

/** How many dialogs are currently open. More than one is a bug in the app or a leak in the spec. */
export async function countOpenDialogs(): Promise<number> {
  return browser.execute(() => document.querySelectorAll('dialog[open]').length) as Promise<number>
}

/**
 * Snapshot the open dialog, or null when none is open.
 *
 * When several are open (which should never happen) this reads the FIRST in
 * DOM order and countOpenDialogs() is how a test proves there is only one.
 */
export async function readOpenDialog(): Promise<OpenDialog | null> {
  return browser.execute(() => {
    const d = document.querySelector('dialog[open]')
    if (!d) return null
    const text = (el: Element | null): string => (el?.textContent ?? '').trim()

    // The body is the sibling AFTER <header>. Falling back to the last element
    // child keeps this working if a caller ever renders a headerless dialog.
    const header = d.querySelector('header')
    const body = (header?.nextElementSibling ?? d.lastElementChild) as HTMLElement | null

    const lines = body
      ? Array.from(body.querySelectorAll('h1, h2, h3, h4, p'))
          .map(text)
          .filter((s) => s.length > 0)
      : []

    const bodyButtons = body ? Array.from(body.querySelectorAll('button')) : []
    const active = document.activeElement as HTMLElement | null

    return {
      ariaLabel: d.getAttribute('aria-label') ?? '',
      lines,
      heading: lines[0] ?? '',
      body: lines[1] ?? '',
      buttons: bodyButtons.map((b) => text(b)),
      disabledButtons: bodyButtons.filter((b) => b.disabled).map((b) => text(b)),
      focused:
        active && d.contains(active)
          ? (active.textContent ?? '').trim() || active.getAttribute('aria-label')
          : null,
      hasCloseButton: d.querySelector('[data-testid="dialog-close"]') !== null
    }
  }) as Promise<OpenDialog | null>
}

/** Wait for a dialog to open, then snapshot it. */
export async function waitForOpenDialog(timeout = TIMEOUTS.MEDIUM): Promise<OpenDialog> {
  await browser.waitUntil(async () => (await countOpenDialogs()) > 0, {
    timeout,
    timeoutMsg: 'no dialog opened'
  })
  const snap = await readOpenDialog()
  if (!snap) throw new Error('waitForOpenDialog: the dialog closed between the wait and the read')
  return snap
}

/** Click a body button of the open dialog by its exact label, in-page. */
export async function clickDialogButton(label: string): Promise<void> {
  await browser.execute((want: string) => {
    const d = document.querySelector('dialog[open]')
    if (!d) throw new Error('clickDialogButton: no dialog is open')
    const header = d.querySelector('header')
    const body = (header?.nextElementSibling ?? d.lastElementChild) as HTMLElement | null
    const btn = Array.from(body?.querySelectorAll('button') ?? []).find(
      (b) => (b.textContent ?? '').trim() === want
    )
    if (!btn) throw new Error(`clickDialogButton: no body button "${want}"`)
    ;(btn as HTMLElement).click()
  }, label)
}

/** Click the header × of the open dialog. */
export async function clickDialogClose(): Promise<void> {
  await browser.execute(() => {
    const btn = document.querySelector(
      'dialog[open] [data-testid="dialog-close"]'
    ) as HTMLElement | null
    if (!btn) throw new Error('clickDialogClose: no open dialog with a close button')
    btn.click()
  })
}

/**
 * Force-close any FULL-SCREEN overlay that is not a <dialog>.
 *
 * Trap 1 generalised. `closeAnyOpenDialog` handles native `showModal()` dialogs,
 * but the ImportWizard is not one — it is an ordinary div, and `wizardOpen` is
 * REDUX state, so it survives navigation and re-renders the moment the Weather
 * tab mounts again. One stray open therefore blocks every later test in the file
 * with `element click intercepted`, naming whatever was clicked rather than the
 * wizard. That is exactly what happened on a real run: one failing upload test
 * turned into 20 collateral failures.
 *
 * Closes by clicking the wizard's own Close control so the reducer actually sees
 * `importWizardClosed` — removing the node would leave the Redux flag set and the
 * wizard would come straight back on the next mount.
 *
 * Returns true when it actually closed something, so a caller can report a leak
 * instead of silently absorbing it.
 */
export async function sweepBlockingOverlays(): Promise<boolean> {
  return browser.execute(() => {
    let closed = false
    // The ImportWizard: a fixed, full-viewport backdrop with its own Close.
    const wiz = document.querySelector('[data-testid="import-wizard"]') as HTMLElement | null
    const byClass = Array.from(document.querySelectorAll('div')).find((d) =>
      d.className.includes('relative flex h-full items-center justify-center p-4')
    ) as HTMLElement | null
    const host = wiz ?? byClass
    if (host) {
      const close = (host.closest('div[class*="fixed"]') ?? host).querySelector(
        '[aria-label="Close"], [aria-label="Close dialog"], button[title="Close"]'
      ) as HTMLElement | null
      if (close) close.click()
      closed = true
    }
    // A portalled Select listbox left open sits above the panel the same way.
    const combo = document.querySelector('[role="combobox"][aria-expanded="true"]') as HTMLElement | null
    if (combo) {
      combo.click()
      closed = true
    }
    return closed
  }) as Promise<boolean>
}

/** Wait for every dialog to be closed. */
export async function waitForNoOpenDialog(timeout = TIMEOUTS.MEDIUM): Promise<void> {
  await browser.waitUntil(async () => (await countOpenDialogs()) === 0, {
    timeout,
    timeoutMsg: 'a dialog was still open'
  })
}
