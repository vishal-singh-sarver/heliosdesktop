/**
 * Snackbar (toast) reading.
 *
 * Toasts render as `role="status" aria-live="polite"` and AUTO-DISMISS after
 * ~2500ms plus a ~160ms exit animation. That short life dictates how they must
 * be asserted:
 *
 *  - waitForToast() must be the NEXT statement after the action that raises it.
 *    Anything that waits on a backend round-trip first will miss the window.
 *  - Between two toast-producing actions, drain first — otherwise a stale toast
 *    can satisfy the next assertion and the test passes for the wrong reason.
 *
 * Deliberately NOT folded into save()/deleteRow(): coupling every mutating
 * helper to a 2.5s timer would make the whole suite hostage to it.
 */

import { TIMEOUTS } from '../config/timeouts'

/** Text of every toast currently on screen. */
export async function toastMessages(): Promise<string[]> {
  return (await browser.execute(() =>
    Array.from(document.querySelectorAll('[role="status"]'))
      .map((e) => (e.textContent || '').trim())
      .filter(Boolean)
  )) as string[]
}

/** Wait for a toast containing `text`. Poll fast — the window is ~2.5s. */
export async function waitForToast(text: string, timeout = TIMEOUTS.MEDIUM): Promise<void> {
  await browser.waitUntil(
    async () => (await toastMessages()).some((m) => m.includes(text)),
    {
      timeout,
      interval: 150,
      timeoutMsg: `no toast containing "${text}" appeared (it may have auto-dismissed before the check)`
    }
  )
}

/** Wait until no toast is on screen, so a stale one cannot satisfy a later assertion. */
export async function drainToasts(timeout = TIMEOUTS.MEDIUM): Promise<void> {
  await browser
    .waitUntil(async () => (await toastMessages()).length === 0, { timeout, interval: 200 })
    .catch(() => {
      // Best effort: a stuck toast should not fail an unrelated test.
    })
}
