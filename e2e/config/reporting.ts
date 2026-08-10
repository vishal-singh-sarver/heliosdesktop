/**
 * Shared Allure reporting wiring for both wdio configs (main + persist).
 *
 * Provides:
 *  - `allureReporter` — the reporter tuple to spread into `reporters`.
 *  - `writeAllureEnvironment()` — dumps env/browser/OS details into
 *    allure-results/environment.properties (the "Environment" widget).
 *  - `ALLURE_RESULTS_DIR` — output directory (kept out of git).
 *
 * There is deliberately NO failure-screenshot hook — see the block comment below
 * before adding one back.
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

/*
 * REMOVED: attachFailureScreenshot(), the `afterTest` failure-screenshot hook.
 *
 * It never worked, and on Windows CI it actively cost us three investigations.
 * Do not reinstate it from `afterTest` — both halves below are measured, not
 * argued (2026-08-03, on a real Windows box).
 *
 * 1. It could never attach anything. @wdio/allure-reporter's onTestFail calls
 *    _endTest() and CLOSES the result before wdio invokes the `afterTest` hook,
 *    so an addAttachment() issued from that hook arrives after the test is
 *    finished. The blob is written to allure-results but nothing links it.
 *    Evidence from this repo's own results: 1914 result files, 18 orphaned
 *    *-attachment.png blobs on disk, and 0 linked attachments across every
 *    result AND container. The Allure report has never shown one of these.
 *
 * 2. On a hidden window it fabricated a "renderer stall". These two lines
 *
 *      [SEVERE]:  Timed out receiving message from renderer: 10.000
 *      [WARNING]: screenshot failed, retrying timeout: Timed out receiving ...
 *
 *    are ONE browser.takeScreenshot() from this hook, fired only AFTER a test
 *    had already failed. Page.captureScreenshot needs a fresh compositor frame;
 *    isHeadlessTestRun() never calls show(), and a hidden window under CPU
 *    pressure does not deliver one inside chromedriver's 10s renderer budget.
 *    Both conditions are required, which is why it never reproduced locally:
 *      - 1 failing test, hidden, machine IDLE                -> 0 stall lines
 *      - same test, hidden, 2 cores vs 6 busy loops          -> the exact
 *                                                              2-line CI signature
 *      - full suite, hidden, unconstrained (336 tests, 7/7)  -> 0 stall lines
 *      - full suite under contention: every SEVERE followed by
 *        "screenshot failed, retrying" — counts equal, no exceptions
 *    So the "stall" was downstream of a failure, never its cause, and the CI
 *    stall count was only ever 2 x failed tests. Run m6 (30820985608) logged 0
 *    because it passed 7/7 and this hook never fired.
 *
 * What actually carries the failure reason is the Allure result JSON itself:
 * statusDetails.message + statusDetails.trace, written by the reporter with no
 * help from us. ci-main.yml now uploads allure-results as an artifact so that
 * survives the runner — previously a red run left no e2e evidence at all.
 *
 * If visual context is ever genuinely wanted, it has to be captured DURING the
 * test (while the result is still open), not from `afterTest`.
 */
