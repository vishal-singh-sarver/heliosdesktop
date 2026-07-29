import { execSync } from 'node:child_process'
import { join } from 'node:path'
import type { Options } from '@wdio/types'
import type { Frameworks } from '@wdio/types'
import {
  allureReporter,
  attachFailureScreenshot,
  writeAllureEnvironment
} from './e2e/config/reporting'

// VS Code and other Electron-based hosts set ELECTRON_RUN_AS_NODE=1 in their environment.
// Child processes inherit this, causing the Electron binary to run as Node.js instead of
// launching the app. Delete it here before wdio spawns ChromeDriver + Electron.
delete process.env['ELECTRON_RUN_AS_NODE']

// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronPath: string = require('electron')

/**
 * Reap orphaned test child-processes. When wdio-electron-service hard-kills
 * Electron (session teardown / reloadSession) or the run is force-killed,
 * Electron's before-quit/will-quit backend cleanup never runs, so the spawned
 * heliosgui_backend — and sometimes the out/main Electron itself — is reparented
 * to init and keeps holding its port. These pile up across specs and break later
 * runs, so we sweep them here.
 *
 * We match ONLY this checkout's paths and kill BY PID (never `pkill -f`, which
 * could hit unrelated processes). Electron matches also require the WebDriver
 * automation flag so a separately-running `npm run dev` app is never touched.
 *
 * NOT Linux-only. This was originally gated to Linux on the assumption that the
 * leak was specific to the native Linux backend binary; a macOS CI run
 * (2026-07-29) disproved that, ending with EIGHT orphaned
 * Electron + heliosgui_backend groups that the runner had to terminate itself:
 *   Terminate orphan process: pid (39070) (Electron Helper)
 *   Terminate orphan process: pid (38755) (heliosgui_backe)
 *   ... x8 groups
 * The leak is a property of how the service kills Electron (no before-quit), so
 * it applies to any POSIX platform. Windows is excluded because `ps -eo` does
 * not exist there and the kill would need a different implementation.
 */
function reapOrphans(label: string, includeElectron: boolean): void {
  if (process.platform === 'win32') return
  const backendScope = join(process.cwd(), 'resources', 'backend')
  const electronScope = join(process.cwd(), 'out', 'main')
  try {
    const ps = execSync('ps -eo pid=,args=', { encoding: 'utf8' })
    const lines = ps.split('\n')
    // Concurrency guard: if a SECOND wdio run is active, do NOT reap. Our
    // path-based match can't tell that run's LIVE Electron/backend from orphans,
    // and killing them fails its tests ("disconnected: not connected to
    // DevTools"). Each `wdio run` has exactly one node_modules/.bin/wdio process;
    // >1 means another run overlaps. Whichever run is last standing cleans up.
    const activeRuns = lines.filter((l) => /node_modules\/\.bin\/wdio\b/.test(l)).length
    if (activeRuns > 1) {
      console.log(`[reap:${label}] another wdio run is active — skipping to avoid cross-kill`)
      return
    }
    const killed: number[] = []
    for (const line of lines) {
      const m = line.match(/^\s*(\d+)\s+(.*)$/)
      if (!m) continue
      const pid = Number(m[1])
      const args = m[2]
      if (pid === process.pid) continue
      const isBackend = args.includes(backendScope)
      const isElectron =
        includeElectron && args.includes(electronScope) && args.includes('--test-type=webdriver')
      if (!isBackend && !isElectron) continue
      try {
        process.kill(pid, 'SIGKILL')
        killed.push(pid)
      } catch {
        /* already exited */
      }
    }
    if (killed.length) {
      console.log(`[reap:${label}] killed ${killed.length} orphaned process(es): ${killed.join(', ')}`)
    }
  } catch (err) {
    console.warn(`[reap:${label}] sweep failed:`, (err as Error).message)
  }
}

export const config: Options.Testrunner = {
  runner: 'local',

  // E2E specs — separate from Vitest unit tests
  specs: ['./e2e/tests/**/*.test.ts'],
  exclude: [],

  // Electron only supports a single instance
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        // appEntryPoint is converted to --app=<path> by the service; no need for appBinaryPath
        appEntryPoint: join(process.cwd(), 'out', 'main', 'index.js'),
        // Required on Linux: Chromium sandbox needs setuid root; pass flags before entry point
        appArgs: process.platform === 'linux'
          ? ['--no-sandbox', '--disable-dev-shm-usage']
          : [],
      },
    },
  ],

  // 'warn' keeps the output legible: a failing element wait no longer dumps a
  // full Chrome stacktrace on every ~poll (which at 'debug' ballooned a single
  // failing run to ~1M log lines). Override for deep debugging with
  //   npx wdio run wdio.config.ts --logLevel debug
  logLevel: 'warn',

  // Stop after N failures. CI bails on the first one; locally 0 (run everything)
  // is more useful for seeing the whole picture at once.
  //
  // Why CI bails: when the app itself cannot start, EVERY test fails the same
  // way, and each one first burns its own waitforTimeout (10s) or mocha timeout
  // (120s). A macOS run on 2026-07-29 spent 1h50m producing ~104 identical
  // "element wasn't found" failures downstream of a single root cause
  // ("Timeout exceeded to get the ContextId"). The 104th failure teaches nothing
  // the 1st did not, so paying a runner for it - 10x billing on macOS - is pure
  // waste. Bailing surfaces the same signal in ~1 minute.
  bail: process.env['CI'] ? 1 : 0,

  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: ['electron'],

  framework: 'mocha',
  reporters: ['spec', allureReporter],

  mochaOpts: {
    ui: 'bdd',
    // Heavy real-file imports (e.g. NSRDB NLR*.csv at 8784 rows) revalidate every
    // row in the renderer on each mapping interaction; 60s is too tight under load.
    timeout: 120000,
  },

  // Seed the Allure Environment widget (browser / platform / node details) before
  // the run starts.
  //
  // Also sweep orphans left by a PREVIOUS run before spawning anything: a run
  // that was force-killed (CI cancellation, job timeout) leaves backends holding
  // ports, and this is the only hook that fires before the first session.
  onPrepare: function () {
    reapOrphans('onPrepare', true)
    writeAllureEnvironment()
  },

  // Attach a screenshot to the Allure result whenever a test fails.
  afterTest: async function (_test, _context, result: Frameworks.TestResult) {
    await attachFailureScreenshot(result.passed)
  },

  // After each spec's session ends, kill any orphaned backend the app left behind.
  // maxInstances is 1, so no other session is active — a lingering backend is dead
  // weight. Prevents backends piling up across a full-suite run.
  afterSession: function () {
    reapOrphans('afterSession', false)
  },

  // Final safety net once the whole run finishes (or is interrupted): sweep both
  // orphaned backends AND any lingering wdio-launched Electron from out/main.
  onComplete: function () {
    reapOrphans('onComplete', true)
  },
}
