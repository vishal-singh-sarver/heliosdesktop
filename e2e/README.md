# Helios E2E (WebdriverIO + Mocha)

End-to-end tests that drive the **built** Electron app via `wdio-electron-service`.

## Run

```bash
npm run e2e:build      # build the app, then run the main suite (e2e/tests/**)
npm run e2e            # run against an already-built app (skips the build)
npm run e2e:persist    # build + the persistence suite (separate fixed-profile config)
```

Both require the Python backend submodule built into `out/`. The main suite uses
a **throwaway profile per launch**, so every ChromeDriver launch starts with a
**fresh, empty backend DB**.

## Layout

```
e2e/
  pages/         Page objects (HomePage, ProjectScreen, Weather) — all selectors live here
  support/       harness.ts — shared before()/beforeEach() helpers, file-dialog stubs
  tests/         specs (app, homepage, projectscreen, weather, uploadwizard)
  persist/       persistence suite (runs under wdio.persist.config.ts)
  fixtures/
    weather/     REAL provider weather files used by uploadwizard.test.ts (vendored)
```

## State model (why each test self-provisions)

There is **no per-test DB reset**. Because each ChromeDriver launch gets a fresh
empty DB, the very first test asserts the empty state and **every other test
creates its own project(s) and asserts only on its own rows** — never absolute
counts. `beforeEach` calls `reloadToHome()` (an in-session renderer refresh that
preserves the backend session, so projects created earlier in the run persist).

## "Why do I see multiple windows / multiple app instances during a run?"

This is expected and intentional — we deliberately leave it as-is:

1. **Two windows per launch (splash → main).** On startup the main process shows
   a lightweight **splash window** while the backend boots, then opens the main
   window and destroys the splash once the renderer signals `app:ready`
   (`src/main/index.ts`). So a single launch briefly shows two windows.
2. **One Electron instance per spec file.** WebdriverIO starts a **fresh session
   per spec file**, and with the Electron service that means a **new Electron
   process per spec** (`app.test.ts`, `homepage.test.ts`, `projectscreen.test.ts`,
   `weather.test.ts`, `uploadwizard.test.ts`). `maxInstances: 1` only serializes them; it does not
   merge them into one process. The whole-run effect is several sequential app
   startups.

This per-spec isolation is **load-bearing**: it is what gives each spec the fresh
empty DB the state model above relies on (e.g. HomePage's "starts empty" test).
The single-instance lock is intentionally skipped under automation
(`isUnderTestAutomation()` in `src/main/index.ts`) so a dev instance never kills —
or is killed by — the test instance.

## Import Wizard test hooks

The Import Wizard's Date/Time-mapping step is instrumented with stable
`data-testid`s so tests can drive **manual** date/time mapping (not just
auto-mapped files):

- date modes `dt-datemode-{parts|string|julian|datetime}`, time modes
  `dt-timemode-{parts|string|compact}`
- column selects `dt-{day|month|year|julianYear|julianDay|date|datetime|hour|minute|time-string|time-compact}`
- format selects `dt-date-format`, `dt-datetime-format`
- data step `dt-delimiter`, `dt-header-skip`; review step `dt-select-all`, `dt-col-<header>`

Drive them with `Weather.importWithMapping(mapping)` (see `pages/Weather.page.ts`,
type `ImportMapping`).

## Known findings (intentionally RED / documented limitations)

This test asserts the **correct** behavior and fails until the underlying app
issue is addressed — it is a finding, not a flake, and app logic is intentionally
left unchanged:

- **Row delete** (`weather.test.ts`): the frontend POSTs `…/deleteRow` but the
  backend route is `…/delete` → 404 → the optimistic delete rolls back and the row
  reappears. Fix: point `deleteRowsRequest` at `API_ROUTES.weather.delete`.

**Confirmed-correct rejections** (`uploadwizard.test.ts`, passing — not findings):
CIMIS.csv (the trailing whitespace-only CRLF line is correctly rejected, so the
wizard's Next stays gated on the File step) and USW.csv (its year-less
`MM-DDTHH:MM:SS` DATE matches no wizard datetime format, so no mapping yields a
valid row) are asserted as **expected** behavior.
