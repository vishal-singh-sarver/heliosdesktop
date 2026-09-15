import { execSync } from 'node:child_process'
import { join } from 'node:path'
import type { Options } from '@wdio/types'
import { reapOrphans } from './e2e/config/reap'
import { allureReporter, writeAllureEnvironment } from './e2e/config/reporting'

// VS Code and other Electron-based hosts set ELECTRON_RUN_AS_NODE=1 in their environment.
// Child processes inherit this, causing the Electron binary to run as Node.js instead of
// launching the app. Delete it here before wdio spawns ChromeDriver + Electron.
delete process.env['ELECTRON_RUN_AS_NODE']

// Keep chromedriver in the checkout instead of os.tmpdir().
//
// @wdio/utils resolves the driver from WEBDRIVER_CACHE_DIR before falling back
// to the temp dir, and it only checks that the executable EXISTS before
// deciding not to download. A temp cleaner that empties %TEMP%\chromedriver but
// leaves the folder therefore made wdio refuse to re-download (CLAUDE.md §2.4),
// and a shared temp cache also stops the reaper telling this checkout's
// chromedriver from another project's. `.cache/` is gitignored. Workers inherit
// the launcher's env and re-load this file, so every startWebDriver sees it.
// `??=` keeps an explicit override (e.g. a CI cache path).
process.env['WEBDRIVER_CACHE_DIR'] ??= join(process.cwd(), '.cache', 'wdio')

// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronPath: string = require('electron')

/**
 * Print free disk space, and the biggest space consumers under the repo, after
 * each spec.
 *
 * The ubuntu CI runner reaches "Free space left: 0 MB" partway through a
 * 7-spec run even after the workflow reclaims ~20GB up front, and the symptom
 * is NOT an out-of-space error - the app opens a window whose renderer never
 * mounts, so specs fail as renderer timeouts and hook failures that read like
 * product bugs. One line per spec turns "something ate 35GB" into "spec N ate
 * it", which is the difference between fixing this and guessing again.
 *
 * Best-effort and never throws: this is diagnostics, and a failure here must
 * not fail the run. Linux/macOS only - `df`/`du` in this form are not portable
 * to the Windows runner.
 */
function logDiskUsage(label: string): void {
  if (process.platform === 'win32') return
  try {
    const free = execSync("df -h / | tail -1 | awk '{print $3\" used, \"$4\" free (\"$5\")\"}'", {
      encoding: 'utf8'
    }).trim()
    console.log(`[disk:${label}] ${free}`)
    // Top consumers inside the workspace. Depth 2 keeps it to a few lines while
    // still separating e.g. node_modules from out/ from allure-results.
    const top = execSync(
      `du -sh ${process.cwd()}/* 2>/dev/null | sort -rh | head -6 | tr '\\n' ' | '`,
      { encoding: 'utf8' }
    ).trim()
    if (top) console.log(`[disk:${label}] workspace: ${top}`)
    // Also probe OUTSIDE the workspace. Electron writes user data (cache, GPU
    // cache, Local Storage, crash dumps) under ~/.config/<app> on Linux, and a
    // per-session leak there would be invisible in the workspace figures above
    // — which is exactly the shape of "35GB vanished and the repo looks fine".
    // Where the SPIKE actually lives. The workspace and $HOME probes above are
    // byte-identical between a 36G baseline sample and a 51G/57G spike sample,
    // so the 14-21G is somewhere neither of them looks. Sweep the whole root
    // filesystem one level down (-x stays on / so we never walk a mount) and
    // print anything over 1G, which names the directory without dumping a tree.
    // `sudo -n` (never prompt) so a dev machine without passwordless sudo just
    // fails this one probe instead of hanging. Wrapped separately from the
    // others: a throw here must not skip the $HOME sweep below.
    try {
      const root = execSync(
        `sudo -n du -xh --max-depth=2 --threshold=1G / 2>/dev/null | sort -rh | head -8 | tr '\\n' ' | '`,
        { encoding: 'utf8' }
      ).trim()
      if (root) console.log(`[disk:${label}] root>1G: ${root}`)
    } catch {
      /* no passwordless sudo (normal on a dev machine) - CI runners have it */
    }
    const home = execSync(
      `du -sh ${process.env['HOME']}/.config/* ${process.env['HOME']}/.cache/* 2>/dev/null | sort -rh | head -4 | tr '\\n' ' | '`,
      { encoding: 'utf8' }
    ).trim()
    if (home) console.log(`[disk:${label}] home: ${home}`)
  } catch {
    /* diagnostics only */
  }
}

// Orphan reaping lives in e2e/config/reap.ts, shared with wdio.persist.config.ts.
//
// NOT Linux-only. It was originally gated to Linux on the assumption that the
// leak was specific to the native Linux backend binary; a macOS CI run
// (2026-07-29) disproved that, ending with EIGHT orphaned Electron +
// heliosgui_backend groups that the runner had to terminate itself. The leak is a
// property of how the service kills Electron (no before-quit), so it applies to
// every platform. Until 15 Sep 2026 it was a silent no-op on Windows — see the
// header of reap.ts for why the POSIX body could not simply be un-gated.

export const config: Options.Testrunner = {
  runner: 'local',

  // E2E specs — separate from Vitest unit tests
  //
  // `[!_]` skips scratch probes (`_probe-*.test.ts`): they measure something once
  // and assert nothing, and _probe-weather-cancel.test.ts broke in every full run
  // because its second iteration started on the ProjectScreen the first one left.
  // Done in the glob, NOT with `exclude`: @wdio/config applies `exclude` even to
  // an explicit --spec, so an exclude made a probe impossible to run at all. An
  // explicit `--spec ./e2e/tests/_probe-x.test.ts` bypasses this glob.
  specs: ['./e2e/tests/**/[!_]*.test.ts'],
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

  // Silence the `webdriver` logger's WARN tier specifically.
  //
  // It emits "Request encountered a stale element - terminating request" every
  // time an element reference goes stale — which, against a React tree that
  // re-renders under a virtualized list, is constant: a single homepage run
  // produced ~156 of them and they crowded out real output. They are NOT
  // failures. WebdriverIO catches the staleness, re-finds the element and
  // retries transparently (verified in a --logLevel debug trace: each warning
  // is immediately followed by a successful retry), and the same tier carries
  // "element not interactable" warnings for clicks that are likewise retried.
  //
  // ERROR still comes through, so a genuinely unrecoverable WebDriver failure
  // is still visible. Drop this override (or set 'warn') when debugging a
  // selector/timing problem — the retry chatter is useful there.
  logLevels: {
    webdriver: 'error',
    // Silence the CDP bridge logger entirely. Its only ERROR in a healthy run is
    //   "Timeout exceeded to get the ContextId"
    // which is an upstream bug rather than a failure: connect() never clears the
    // setTimeout that races the Runtime.executionContextCreated listener, so the
    // orphaned timer calls log.error at exactly cdpBridgeTimeout even though the
    // context arrived in ~13ms and the promise already resolved (the paired
    // reject() is a no-op). It appears in runs that pass 100/100 and is purely a
    // function of the spec outlasting the timer — see the cdpBridgeTimeout note
    // below for why raising the value makes it worse, not better.
    //
    // Losing this logger costs nothing: a genuinely dead bridge is caught by
    // assertElectronBridge in e2e/support/harness.ts, which fails the spec with
    // a real diagnostic instead of a log line nobody can act on.
    'electron-service:bridge': 'silent'
  },

  // Run every spec, everywhere, and fail at the end with the full picture.
  //
  // `bail` is a LAUNCHER-level kill switch, not a per-spec one: on the Nth
  // failure the scheduler empties `specs` for every remaining spec FILE
  // (@wdio/cli launcher `_runSpecs`), so `bail: 1` reports the first failing
  // spec and silently skips the rest. That cost real money on 2026-07-31 -
  // two full release runs (~$8) surfaced three unrelated failures one at a
  // time, and ubuntu never reached 5 of the 7 specs at all, so nobody knew
  // whether they passed. A run that names every failure is cheaper than three
  // runs that each name one.
  //
  // This previously bailed in CI to bound a different problem: when the app
  // cannot START, every test fails the same way and each first burns its own
  // waitforTimeout (10s) or mocha timeout (120s). A macOS run on 2026-07-29
  // spent 1h50m producing ~104 identical "element wasn't found" failures
  // downstream of one root cause. That case is now bounded by two things that
  // did not exist then, both better targeted than bail:
  //   - assertElectronBridge (e2e/support/harness.ts) probes the bridge once
  //     per session and throws a real diagnostic immediately, so a dead app
  //     fails in ~1 minute on its own.
  //   - the 60-minute timeout on the "Run Integration Checks" step caps the
  //     spend directly. bail bounds test COUNT; a timeout bounds COST, which
  //     was the actual concern.
  //
  // If a cascade ever does slip past both, prefer a small cap (bail: 3-5) over
  // returning to 1 - it still surveys most specs.
  bail: 0,

  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // NOTE: do NOT raise cdpBridgeTimeout to silence
  //   "ERROR electron-service:bridge: Timeout exceeded to get the ContextId"
  // It is an upstream bug, not a real timeout, and raising the value makes it
  // WORSE. ElectronCdpBridge.connect() races a Runtime.executionContextCreated
  // listener against a setTimeout(cdpBridgeTimeout) that it never clears. The
  // context arrives in ~13ms (measured) and resolves the promise; the orphaned
  // timer still fires at the full timeout and calls log.error unconditionally.
  // The reject() is a no-op on an already-settled promise, which is why the
  // line appears in runs that pass 100/100.
  //
  // Consequence: the log lands at exactly cdpBridgeTimeout after session start,
  // so a LOWER value fires sooner and short specs exit before it ever runs. At
  // 30s it reliably fired in every spec that ran longer than 30s. Left at the
  // 10s default deliberately. The real fix is upstream (clear the timer on
  // resolve); the bridge probe in e2e/support/harness.ts is what actually
  // guards against a genuinely dead bridge.
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
    logDiskUsage('onPrepare')
    writeAllureEnvironment()
  },

  // No afterTest failure-capture hook — see the block comment in
  // e2e/config/reporting.ts. Attaching from `afterTest` cannot work (the allure
  // result is already closed, so every attachment was orphaned), and taking a
  // screenshot of the never-shown e2e window is what produced the bogus
  // "Timed out receiving message from renderer" stalls on the Windows runner.
  // The failure reason already lives in the allure result's statusDetails, and
  // ci-main.yml uploads allure-results as an artifact.

  /**
   * Name the element that actually swallowed an intercepted click.
   *
   * chromedriver has two shapes for this. When the target is COVERED it names
   * both sides:
   *   Element <button ...> is not clickable at point (926, 22).
   *   Other element would receive the click: <div id="probe-overlay" ...>
   * But CI run 30703357707 (30-columns test, windows-2022) produced the bare
   * form, with neither clause:
   *   element click intercepted: Element is not clickable at point (1103, 226)
   * which is what you get when the point is not in the viewport at all. A sweep
   * of seven viewport widths (1024-1600) plus full-spec runs did not reproduce
   * it locally, so that remains an inference from the message shape.
   *
   * `inViewport` is therefore the field that matters: it separates "something is
   * painted over the control" from "the control scrolled off-screen", which need
   * completely different fixes. elementFromPoint names the culprit in the first
   * case and returns null in the second.
   *
   * Runs only on the intercepted-click path, so a healthy run pays nothing.
   * Best-effort and never throws: this must not convert a click failure into a
   * hook failure and bury the original error.
   */
  afterCommand: async function (commandName, _args, _result, error) {
    if (!error || !/element click intercepted/i.test(error.message ?? '')) return
    const m = /at point \((\d+),\s*(\d+)\)/.exec(error.message ?? '')
    if (!m) return
    const [x, y] = [Number(m[1]), Number(m[2])]
    try {
      const info = await browser.execute(
        (px: number, py: number) => {
          const el = document.elementFromPoint(px, py)
          const describe = (n: Element | null): string =>
            n
              ? `<${n.tagName.toLowerCase()}${n.id ? ` id="${n.id}"` : ''}` +
                `${n.className && typeof n.className === 'string' ? ` class="${n.className}"` : ''}>`
              : 'null'
          return {
            atPoint: describe(el),
            parent: describe(el?.parentElement ?? null),
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            inViewport: px <= window.innerWidth && py <= window.innerHeight
          }
        },
        x,
        y
      )
      console.log(
        `[click-intercepted] ${commandName} at (${x},${y}) — viewport ${info.viewport} ` +
          `(point in viewport: ${info.inViewport}); element at point: ${info.atPoint} ` +
          `inside ${info.parent}`
      )
    } catch {
      /* diagnostics only — never mask the real click error */
    }
  },

  // After each spec's session ends, kill any orphaned backend the app left behind.
  // maxInstances is 1, so no other session is active — a lingering backend is dead
  // weight. Prevents backends piling up across a full-suite run.
  //
  // Backends ONLY, on every platform. Do not reap Electron here: at this point a
  // HEALTHY app is still alive by design — its Node main process has finished
  // quitting and prints "Waiting for the debugger to disconnect...", because
  // wdio-electron-service's inspector connection lives in THIS worker and closes
  // only when the worker exits, after this hook. Measured 15 Sep 2026 on Windows:
  // reaping Electron here killed a healthy app after every spec, even with a 20s
  // grace (which only added 20s per spec file). A genuinely orphaned Electron
  // tree is taken by onComplete (after every worker has exited) and by the next
  // run's onPrepare. Note afterSession does NOT fire when session creation fails
  // either.
  afterSession: function () {
    reapOrphans('afterSession', false)
    logDiskUsage('afterSession')
  },

  // Final safety net once the whole run finishes (or is interrupted): sweep both
  // orphaned backends AND any lingering wdio-launched Electron from out/main.
  onComplete: function () {
    reapOrphans('onComplete', true, 20_000)
    logDiskUsage('onComplete')
  },
}
