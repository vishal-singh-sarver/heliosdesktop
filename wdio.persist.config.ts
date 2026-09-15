import { join } from 'node:path'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import type { Options } from '@wdio/types'
import { reapOrphans } from './e2e/config/reap'
import { allureReporter, writeAllureEnvironment } from './e2e/config/reporting'

// VS Code / Electron hosts set ELECTRON_RUN_AS_NODE=1; clear it so the Electron
// binary launches the app instead of running as Node.
delete process.env['ELECTRON_RUN_AS_NODE']

// Keep chromedriver in the checkout instead of os.tmpdir() — see the same line in
// wdio.config.ts. `.cache/` is gitignored; `??=` keeps an explicit override.
process.env['WEBDRIVER_CACHE_DIR'] ??= join(process.cwd(), '.cache', 'wdio')

/**
 * Persistence suite — runs in ISOLATION from the main suite.
 *
 * The main suite relies on a fresh, empty DB per launch (ChromeDriver's throwaway
 * --user-data-dir). This suite instead pins a FIXED profile dir so the SQLite DB
 * + localStorage session-id survive an in-run browser.reloadSession() relaunch —
 * which is how we test "create -> close -> reopen -> still there". Do NOT add the
 * fixed dir to the main wdio.config.ts.
 *
 * The app's isUnderTestAutomation() matches the injected --user-data-dir and
 * SKIPS its own userData override, so the backend's HELIOS_DATA_DIR (and thus the
 * SQLite file) lands under PERSIST_PROFILE/backend-data and persists.
 */
const PERSIST_PROFILE = join(process.cwd(), '.wdio-persist-profile')

/**
 * Stop the run from a LAUNCHER hook, for real.
 *
 * Throwing does not do it. runLauncherHook in @wdio/cli rethrows only an
 * `instanceof SevereServiceError` of ITS class — the ESM build of webdriverio —
 * while this config is loaded as CommonJS and would import the separate CJS
 * class, so the check fails and the launcher logs "Error in hook" and starts the
 * workers anyway. Nothing has been spawned when onPrepare runs, so exiting is
 * safe.
 */
function abortRun(message: string): never {
  console.error(`[persist] ${message}`)
  process.exit(1)
}

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./e2e/persist/**/*.test.ts'],
  exclude: [],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        appEntryPoint: join(process.cwd(), 'out', 'main', 'index.js'),
        appArgs:
          process.platform === 'linux'
            ? ['--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${PERSIST_PROFILE}`]
            : [`--user-data-dir=${PERSIST_PROFILE}`]
      }
    }
  ],

  // Same logging policy as wdio.config.ts, whose comments explain each line:
  // 'debug' here dumped every WebDriver request/response plus recovered
  // stale-element retries into the console for tests that deliberately sit
  // through a 40s save debounce. Opt back in with `--logLevel debug`.
  logLevel: 'warn',
  logLevels: {
    webdriver: 'error',
    'electron-service:bridge': 'silent'
  },
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: ['electron'],
  framework: 'mocha',
  reporters: ['spec', allureReporter],
  // Generous: a relaunch re-runs the backend health check, the weather specs wait
  // out the backend's 30s save debounce before relaunching, and closing the app
  // after that save has been measured at 70-75s. 120s was overrun, and a
  // this.timeout() inside a test did not raise it.
  mochaOpts: { ui: 'bdd', timeout: 300000 },

  // Start from a clean profile so the suite is deterministic.
  //
  // Reap FIRST. On Windows a leftover backend from an earlier, abnormally ended
  // run still holds backend-data/*.db open, and rmSync cannot delete an open file
  // there (force only ignores ENOENT). The failure used to be swallowed, so the
  // suite silently started on the PREVIOUS run's database. It now aborts instead
  // — a persistence suite on a stale DB proves nothing.
  onPrepare() {
    const clear = reapOrphans('persist:onPrepare', true)
    // Only Windows scopes its concurrency guard to THIS checkout. The POSIX guard
    // counts wdio runs of any project on the machine, so on POSIX keep the old
    // behaviour and always wipe.
    if (!clear && process.platform === 'win32') {
      abortRun('another wdio run of this checkout is active; refusing to wipe the shared profile')
    }
    try {
      rmSync(PERSIST_PROFILE, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
    } catch (err) {
      abortRun(
        `could not clear ${PERSIST_PROFILE} (${(err as Error).message}) — ` +
          "the suite would start on a previous run's database"
      )
    }
    if (existsSync(PERSIST_PROFILE)) {
      abortRun(`${PERSIST_PROFILE} still exists after removal — refusing to start on a stale database`)
    }
    mkdirSync(PERSIST_PROFILE, { recursive: true })
    // Only once nothing can abort: the aborts exist for "another run is active",
    // and this rewrites the allure-results/environment.properties that run uses.
    writeAllureEnvironment({ Suite: 'persistence (fixed profile)' })
  },

  // No afterTest failure-capture hook — see e2e/config/reporting.ts.
  onComplete() {
    reapOrphans('persist:onComplete', true, 20_000)
    try {
      rmSync(PERSIST_PROFILE, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
    } catch (err) {
      // The relaunched backend may still hold the DB file open — best effort.
      console.warn(`[persist] profile not removed: ${(err as Error).message}`)
    }
  }
}
