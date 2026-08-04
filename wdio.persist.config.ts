import { join } from 'node:path'
import { rmSync, mkdirSync } from 'node:fs'
import type { Options } from '@wdio/types'
import { allureReporter, writeAllureEnvironment } from './e2e/config/reporting'

// VS Code / Electron hosts set ELECTRON_RUN_AS_NODE=1; clear it so the Electron
// binary launches the app instead of running as Node.
delete process.env['ELECTRON_RUN_AS_NODE']

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

  logLevel: 'debug',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: ['electron'],
  framework: 'mocha',
  reporters: ['spec', allureReporter],
  // Generous: a relaunch re-runs the backend health check.
  mochaOpts: { ui: 'bdd', timeout: 120000 },

  // Start from a clean profile so the suite is deterministic; tolerate a busy DB
  // file on teardown (the backend may still hold the SQLite handle briefly).
  onPrepare() {
    writeAllureEnvironment({ Suite: 'persistence (fixed profile)' })
    try {
      rmSync(PERSIST_PROFILE, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
    mkdirSync(PERSIST_PROFILE, { recursive: true })
  },

  // No afterTest failure-capture hook — see e2e/config/reporting.ts.
  onComplete() {
    try {
      rmSync(PERSIST_PROFILE, { recursive: true, force: true })
    } catch {
      /* the relaunched backend may still hold the DB file open — best effort */
    }
  }
}
