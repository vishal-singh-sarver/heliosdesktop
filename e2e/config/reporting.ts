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
 * afterTest hook body: on failure, attach a full-page screenshot to the Allure
 * result so a red test carries visual context. Best-effort — a screenshot
 * failure never masks the real test error.
 */
export async function attachFailureScreenshot(passed: boolean): Promise<void> {
  if (passed) return
  try {
    // Lazy import so this module stays usable outside a live session.
    const allure = (await import('@wdio/allure-reporter')).default
    const png = await browser.takeScreenshot()
    allure.addAttachment('Screenshot on failure', Buffer.from(png, 'base64'), 'image/png')
  } catch {
    /* screenshot unavailable (session already torn down) — skip */
  }
}
