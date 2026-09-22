# Testing

Two suites, with very different costs.

| | Unit | End-to-end |
|---|---|---|
| Runner | Vitest 4 + Testing Library | WebdriverIO 9 + `wdio-electron-service` |
| Environment | jsdom | A real Electron app driven by ChromeDriver |
| Needs a build? | No | **Yes** — `npm run build` first |
| Needs the backend? | No | Yes, the packaged sidecar |
| Runtime | Seconds | Minutes |

## Unit tests

```bash
npm test              # one-shot
npm run test:watch    # watch mode
npm run test:coverage
```

Tests live next to the code they cover (`foo.ts` → `foo.test.ts`), never in a parallel `__tests__`
tree. Path aliases (`components`, `containers`, `utils`, `store`, `@renderer`) are configured in
`vitest.config.ts` and mirror the app's own aliases.

!!! note "The timezone is pinned to UTC"
    `env: { TZ: 'UTC' }` in `vitest.config.ts`. Without it, a developer in IST and CI in UTC render
    the same instant differently — `Weather/saga`'s `fmtDate`/`fmtTime` use local-time getters. UTC
    is the lowest-surprise baseline and matches CI.

Sagas are the main thing worth testing here, and they are testable *because* every side effect
goes through `call`. `e2e/**`, `node_modules/**`, `out/**` and `dist/**` are excluded from the
unit run.

One module exists purely to be unit-testable: `src/main/backend-identity.ts` is split out of
`backend-manager.ts` because that module imports `electron`, which cannot load under Vitest — and
the identity comparison is the one piece of the reaper whose correctness decides whether a process
lives or dies.

## End-to-end tests

```bash
npm run e2e:build      # build, then run the full suite
npm run e2e            # run against an existing build
npm run e2e:smoke      # journey spec only
npm run e2e:typecheck
npm run e2e:report     # generate + open the Allure report
```

Layout:

```
e2e/
├── tests/         7 specs — app, homepage, projectscreen, journey,
│                  weather, uploadwizard, datatype-validation
├── pages/         page objects (HomePage, ProjectScreen, Weather)
├── support/       harness
├── config/        fixtures, reporting, timeouts
├── fixtures/      test data, incl. weather CSVs
└── persist/       the persistence suite (wdio.persist.config.ts)
```

### Headless is "never call show()"

Electron has **no real headless mode**. Chromium's `--headless` is silently ignored by the Electron
binary, and `webPreferences.offscreen` forces a frameless window — which would bypass the
`titleBarStyle` / traffic-light setup the app depends on. macOS has no Xvfb either.

What works: **never calling `show()`**. A never-shown `BrowserWindow` still runs the renderer, lays
out normally, and serves WebDriver clicks, keys and screenshots — it just never reaches the screen.
Paired with `app.dock.hide()` this makes a run fully invisible: no window, no dock icon, no focus
stealing.

```bash
HELIOS_E2E_HEADED=1 npm run e2e    # watch a run while debugging
```

### What the app does differently under test

`isUnderTestAutomation()` detects ChromeDriver by its injected `--user-data-dir` and remote
debugging flags. Under automation the app:

| Behaviour | Why |
|---|---|
| Does **not** override `userData` | Overriding it redirects Chromium's `DevToolsActivePort` file away from where ChromeDriver looks — "session not created" |
| Does **not** hold the single-instance lock | Otherwise the test instance quits if a dev instance is running |
| Raises the backend readiness timeout to 120 s | A loaded CI runner took 32.4 s to answer `/health` where six other sessions took 2–3.6 s |
| Disables renderer background throttling | General hygiene for a window that is hidden only because we never show it |

!!! warning "A correction preserved from the source"
    The throttling switches were originally added to chase
    `SEVERE: Timed out receiving message from renderer: 10.000` on the Windows runner. **They are
    not the fix for it.** That line comes from `attachFailureScreenshot` screenshotting the hidden
    window *after* a test has already failed — proven by an idle-vs-loaded A/B on a real Windows
    box. The switches are kept as test hygiene; do not cite them as that fix.

### Disk space is instrumented on purpose

`wdio.config.ts` prints free disk space and the biggest consumers after each spec. The Ubuntu CI
runner reached "Free space left: 0 MB" partway through a 7-spec run even after reclaiming ~20 GB up
front — and the symptom was **not** an out-of-space error. The app opened a window whose renderer
never mounted, so specs failed as renderer timeouts and hook failures that read like product bugs.
One line per spec turns "something ate 35 GB" into "spec N ate it".

The probes are best-effort and never throw; a failure in diagnostics must not fail the run.

!!! note "ELECTRON_RUN_AS_NODE"
    VS Code and other Electron-based hosts set `ELECTRON_RUN_AS_NODE=1`, which child processes
    inherit — making the Electron binary run as Node instead of launching the app. `wdio.config.ts`
    deletes it before spawning ChromeDriver.

## Backend tests

The backend has its own suite under `helios-desktop-backend/tests/`, run from inside the submodule
with its own virtualenv active. See that repository's `CONTRIBUTING.md`.

## Related

- [Dev loop](dev-loop.md)
- [CI/CD workflow](../ci-cd-workflow.md) — which suites run on which branch.
