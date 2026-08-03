# Handoff: Windows e2e renderer stall

You are picking this up on a **real Windows machine**. Everything below was
diagnosed from CI logs on macOS, where the failure cannot be reproduced. That
limitation is why this is being handed off — the previous agent guessed twice
and was wrong twice, at ~$8–12 per CI run. **Reproduce before you change
anything.**

Branch: `debug/windows-e2e-stall`, cut from `main` at `c586ae1`.

---

## The failure

`weather.test.ts` and `datatype-validation.test.ts` fail one test per run on
`windows-2022` CI. **A different test each run** — that is the key symptom. It
is not one broken test; it is whichever assertion happens to be in flight when
the renderer stalls.

| CI run | stalls | failing test |
|---|---|---|
| r3 / 30703357707 | 2 | `adds 30 columns then back-fills a defaulted column…` |
| m5 / 30780330034 | 2 | `direct_horizontal_radiation_flux: is_base auto-selects…` |
| **m6 / 30820985608** | **0** | *(none — 7/7 passed)* |
| m7 / 30824713568 | 2 | `allows re-adding a column name once the original column is deleted` |

The stall signature in the job log:

```
WARN chromedriver: [SEVERE]: Timed out receiving message from renderer: 10.000
WARN chromedriver: [WARNING]: screenshot failed, retrying timeout: Timed out receiving message from renderer: 10.000
```

## What the evidence actually shows

Read this before forming a theory — some of it contradicts the commit messages
on this branch.

**1. "2 stalls" is really 1 stall + 1 echo.** Every run logs exactly 2, and
exactly 1 of them is `screenshot failed, retrying`. That second line is the
failure-screenshot hook (`attachFailureScreenshot` in `e2e/config/reporting.ts`,
wired to `afterTest` in `wdio.config.ts`) hitting the same wedged renderer. So
there is **one** real stall per run.

**2. The stall PRECEDES the failure by 1–2 seconds.** Verified across three
runs:

```
r3:  STALL 14:47:22.928   →  FAIL 14:50:19.852
m5:  STALL 03:06:56.573   →  FAIL 03:06:58.611
m7:  STALL 15:25:58.677   →  FAIL 15:25:59.897
```

It is a **cause**, not an artifact of the failure. Do not dismiss it as
screenshot noise.

**3. The 10.000 is exactly chromedriver's 10s renderer budget.** The renderer
stops answering for the full window, and whatever WebDriver command is in
flight burns its entire timeout.

**4. Backend chatter appears near the stall but is probably unrelated.** In m7:

```
WARN chromedriver: [Backend stderr] WARNING (Context::deleteTimeseriesVariable):
  Timeseries variable 'recycle' does not exist
```

This appears in passing runs too. Note it, do not anchor on it.

## What has already been tried (and did NOT fix it)

Do not redo these.

| Change | Commit | Result on Windows |
|---|---|---|
| `backgroundThrottling: false` on the main window, under `isHeadlessTestRun()` | `54d61ef` | **no effect** — stalls stayed at 2. Fixed ubuntu and macOS (both 0 stalls). |
| `disable-renderer-backgrounding`, `disable-background-timer-throttling`, `disable-backgrounding-occluded-windows` command-line switches | `2f8804b` | **no effect.** Verified applied (`app.commandLine.hasSwitch()` returns true; `"renderer backgrounding/throttling switches applied"` logged in all 7 sessions). |

The reasoning behind those was [electron#31016](https://github.com/electron/electron/issues/31016):
`backgroundThrottling: false` covers *occluded* and *minimized* windows on
Windows but **not hidden** ones, and our e2e window is hidden
(`isHeadlessTestRun()` never calls `show()` — see `src/main/index.ts`). That
mechanism explains why ubuntu/macOS were fixed and Windows was not, but the
switches that should have covered the hidden case did not help.

**Beware run m6.** It logged 0 stalls and passed 7/7, and the previous agent
called the fix "confirmed" on that basis. The next run (m7, same code) was back
to 2. One zero-stall run against a baseline of 2 is noise. **Do not declare
success on a single green run — count stalls across at least 3.**

## How to reproduce locally

The app sizes its window to the display work area capped at 1920×1080
(`src/main/index.ts`). A dev machine gives ~1728 CSS px; CI runners give ~1024.
Some failures only appear at the narrow width, so always reproduce at CI
geometry:

```powershell
npm install
npm run build
$env:HELIOS_E2E_VIEWPORT="1024x768"
npx wdio run wdio.config.ts --spec e2e/tests/weather.test.ts
```

`HELIOS_E2E_VIEWPORT` is implemented in `applyViewportOverride()` in
`e2e/support/harness.ts` (it resizes via the Electron main process —
`browser.setWindowSize()` throws `unknown command: Browser.getWindowForTarget`
on this Electron build).

To watch the run instead of running hidden — **this is likely the single most
informative experiment**, since the whole theory is about a hidden window:

```powershell
$env:HELIOS_E2E_HEADED="1"
```

If the stall disappears when headed, the hidden-window theory is right and the
remaining question is which mechanism still throttles it. If it stalls headed
too, the theory is wrong and the cause is elsewhere.

Useful counts from a local log:

```powershell
Select-String -Path <log> -Pattern "Timed out receiving message from renderer" | Measure-Object
```

## Suggested lines of attack, roughly in order

1. **Headed vs hidden** (above). Cheapest, highest information.
2. **Does it reproduce at all locally?** If a Windows dev box never stalls, the
   cause is CI-environment-specific (resource contention, virtual display,
   Defender) and the fix is more likely tolerance than elimination.
3. **Narrow to a single spec/test.** `weather.test.ts` `[0-6]` is the usual
   victim; `--spec` it in a loop and count stalls over ~10 runs to get a rate.
4. **`--disable-hang-monitor`** — not yet tried, and specifically relevant to
   renderer-unresponsiveness in automation.
5. **Check whether the splash window matters.** The app opens a splash
   `BrowserWindow` then the main window (`src/main/index.ts`). Two windows,
   one hidden, is exactly the shape that trips Chromium visibility handling.
   Nobody has tested whether skipping the splash under e2e changes anything.
6. **If it cannot be eliminated**, make the suite tolerant: raise the remaining
   20s waits on Windows only, and consider whether
   `attachFailureScreenshot` should be skipped on Windows (its retry doubles
   every stall and adds 10s to every failure).

## Constraints

- **Do not change shipped behaviour to fix a test.** Both existing fixes are
  gated on `isHeadlessTestRun()`; keep that discipline. A real user's hidden
  window *should* throttle to save battery.
- **`bail: 0`** in `wdio.config.ts` is deliberate — every spec runs so one run
  reports every failure. Do not set it back to 1.
- **Do not delete `/opt/hostedtoolcache`** in any workflow (breaks `setup-node`),
  and keep `Free disk space (Linux)` *before* `setup-node`.
- House rules are in `CLAUDE.md` — notably no `console.log` in committed code
  outside `src/main/**` and `scripts/**`, and no AI-authorship trailers in
  commit messages.

## Definition of done

- Root cause identified, or explicitly documented as un-reproducible locally
  with evidence.
- **Stall count 0 across at least 3 consecutive local runs** at
  `HELIOS_E2E_VIEWPORT=1024x768`, not one.
- `npm run lint`, `npm test`, `npm run e2e:typecheck` all clean.
- Findings written into the commit message, including anything that was tried
  and did *not* work — that is as valuable as the fix.
- Commit to `debug/windows-e2e-stall` and push. It will be fetched and merged
  back from the other side.

## Orientation

- `wdio.config.ts` — runner config: `bail: 0`, `maxInstances: 1`, orphan reaper,
  `logDiskUsage`, Linux `appArgs` (`--no-sandbox --disable-dev-shm-usage`).
- `e2e/support/harness.ts` — `waitForMainWindow` (reports *how far* startup got),
  `enterProject` (distinguishes rejected vs accepted-but-slow creates),
  `applyViewportOverride`.
- `e2e/pages/Weather.page.ts` — `focusInput` / `commitBlur`, both in-page
  because coordinate clicks fail once the table scrolls horizontally.
- `src/main/index.ts` — `isUnderTestAutomation()`, `isHeadlessTestRun()`, window
  creation, the throttling switches.
- `src/main/backend-manager.ts` — backend spawn; startup timeout is 120s under
  automation, 30s shipped.
