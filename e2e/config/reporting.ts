/**
 * Shared Allure reporting wiring for both wdio configs (main + persist).
 *
 * Provides:
 *  - `allureReporter` — the reporter tuple to spread into `reporters`.
 *  - `writeAllureEnvironment()` — dumps env/browser/OS details into
 *    allure-results/environment.properties (the "Environment" widget).
 *  - `attachFailureScreenshot()` — afterTest hook that captures + attaches a PNG
 *    when a test fails.
 *  - `ALLURE_RESULTS_DIR` — output directory (kept out of git).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { arch, platform, release } from 'node:os'

export const ALLURE_RESULTS_DIR = join(process.cwd(), 'allure-results')

/** Reporter tuple: spec (console) + allure (rich HTML). */
export const allureReporter: [string, Record<string, unknown>] = [
  'allure',
  {
    outputDir: ALLURE_RESULTS_DIR,
    // We drive most steps via page objects, not raw wdio commands — keep the
    // step tree readable and the screenshots meaningful (failures only).
    disableWebdriverStepsReporting: true,
    disableWebdriverScreenshotsReporting: true,
    addConsoleLogs: true
  }
]

/** Write Allure's Environment widget (shown at the top of the report overview). */
export function writeAllureEnvironment(extra: Record<string, string> = {}): void {
  const details: Record<string, string> = {
    Application: 'Helios GUI (Electron)',
    Browser: 'electron (Chromium via wdio-electron-service)',
    Platform: `${platform()} ${release()} (${arch()})`,
    Node: process.version,
    CI: process.env['CI'] ? 'true' : 'false',
    ...extra
  }
  mkdirSync(ALLURE_RESULTS_DIR, { recursive: true })
  const body = Object.entries(details)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  writeFileSync(join(ALLURE_RESULTS_DIR, 'environment.properties'), body, 'utf8')
}

/**
 * True when the e2e window is never shown (see isHeadlessTestRun in
 * src/main/index.ts — the runner process mirrors the same switch).
 */
function isHeadlessRun(): boolean {
  return process.env['HELIOS_E2E_HEADED'] !== '1'
}

/**
 * afterTest hook body: on failure, attach visual context to the Allure result.
 * Best-effort — a failure here never masks the real test error.
 *
 * DO NOT take a screenshot on a never-shown window. This one call is the ENTIRE
 * source of the "windows e2e renderer stall", which cost two investigations and
 * several $8-12 CI runs because nobody checked what actually emitted:
 *
 *   [SEVERE]:  Timed out receiving message from renderer: 10.000
 *   [WARNING]: screenshot failed, retrying timeout: Timed out receiving ...
 *
 * Those two lines are ONE takeScreenshot() from this hook. The renderer is not
 * throttled and not wedged — Page.captureScreenshot needs a fresh compositor
 * frame, and a hidden window under CPU pressure does not deliver one inside
 * chromedriver's 10s renderer budget, so the command times out and retries.
 *
 * Measured on a real Windows box, 2026-08-03. BOTH conditions are required —
 * this is why it never reproduced on a dev machine:
 *   - one deliberately-failing test, hidden, machine IDLE      -> 0 stalls
 *   - the same test, hidden, tree pinned to 2 cores vs 6 hogs  -> 1 SEVERE +
 *     1 retry, i.e. the exact 2-line CI signature
 *   - full suite, hidden, unconstrained: 336 tests, 7/7 specs  -> 0 stalls
 *   - full suite, hidden, under contention: every SEVERE was followed by
 *     "screenshot failed, retrying" — SEVERE count == retry count, no exceptions
 *   - the test's own assertion error is logged BEFORE the stall lines
 *
 * So the stall is DOWNSTREAM of a failure, never its cause. That also explains
 * the CI table previously dismissed as noise: runs with 1 failing test logged
 * exactly 2 stall lines, and m6 (30820985608) logged 0 because it passed 7/7 and
 * this hook never fired. "Stall count" was only ever "2 x failed tests".
 *
 * Skipping the capture here is cheap: the screenshot is of a window nobody can
 * see, it only fails when the run is already degraded, and it adds 10-20s to
 * every failure plus a SEVERE that reads like a product bug. getPageSource needs
 * no compositor frame, so it does not hit this path, and the DOM is the more
 * actionable artifact for the selector/timeout failures this suite produces.
 * Headed runs (HELIOS_E2E_HEADED=1) keep the real screenshot.
 */
export async function attachFailureScreenshot(passed: boolean): Promise<void> {
  if (passed) return
  try {
    // Lazy import so this module stays usable outside a live session.
    const allure = (await import('@wdio/allure-reporter')).default

    if (isHeadlessRun()) {
      const html = await browser.getPageSource()
      allure.addAttachment('DOM on failure', html, 'text/html')
      return
    }

    const png = await browser.takeScreenshot()
    allure.addAttachment('Screenshot on failure', Buffer.from(png, 'base64'), 'image/png')
  } catch {
    /* capture unavailable (session already torn down) — skip */
  }
}
