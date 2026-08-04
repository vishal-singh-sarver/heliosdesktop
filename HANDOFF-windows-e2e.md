# RESOLVED: the "Windows e2e renderer stall" was never a renderer stall

Investigated on a real Windows box on 2026-08-03. **The conclusion in the
original handoff was wrong**, and this file now records what actually happens so
nobody spends another $8-12 CI run on the throttling theory. The original text is
preserved in git history (`9ed62a0`).

---

## What the stall actually is

```
[SEVERE]:  Timed out receiving message from renderer: 10.000
[WARNING]: screenshot failed, retrying timeout: Timed out receiving message from renderer: 10.000
```

Those two lines are **one `browser.takeScreenshot()` call** made by
`attachFailureScreenshot` (`e2e/config/reporting.ts`), wired to `afterTest` in
`wdio.config.ts`. It runs **only when a test has already failed**.

`Page.captureScreenshot` needs a fresh compositor frame. Our e2e window is never
shown (`isHeadlessTestRun()` never calls `show()`), and a hidden window under CPU
pressure does not produce one inside chromedriver's 10s renderer budget — so the
command times out and retries.

**The stall is downstream of a failure, never its cause.**

## The evidence

Measured locally, full suite at `HELIOS_E2E_VIEWPORT=1024x768`, hidden:

| Configuration | Failing tests | Stall lines |
|---|---|---|
| Full suite, unconstrained (20 cores) | 0 | **0** |
| Full suite, pinned to 4 cores | 0 | **0** |
| Full suite, 2 cores + 4 competing busy loops | many | many, **1:1 with screenshot retries** |
| 1 deliberately-failing test, machine idle | 1 | **0** |
| 1 deliberately-failing test, 2 cores + 6 busy loops | 1 | **2 — the exact CI signature** |

Both ingredients are required — a failed test **and** a starved renderer. That is
precisely why it never reproduced on a dev machine.

Two further checks:

- Across a whole contended run, **every** `SEVERE` line was followed by
  `screenshot failed, retrying`. SEVERE count == retry count, no exceptions.
- The failing test's own assertion error is printed **before** the stall lines.

### Controlled A/B (identical load, one failing test)

| | failing | SEVERE | screenshot retry |
|---|---|---|---|
| original code | 1 | 1 | 1 |
| with the fix | 1 | **0** | **0** |

## Where the original analysis went wrong

- **"2 stalls per run" was 1 screenshot.** The `[SEVERE]` line and the
  `[WARNING] screenshot failed, retrying` line are the same event; the retry
  message quotes the timeout text, so a naive grep counts it twice. Stall lines
  only ever equalled **2 x failed tests**.
- **Run m6 was the control, not noise.** It logged 0 stalls *because it passed
  7/7* — no failure, so the hook never fired. The handoff explicitly said not to
  trust it; it was the datum that disproves the whole theory.
- **"The stall precedes the failure by 1-2s"** compared a chromedriver timestamp
  against the *spec reporter's* summary line, which is printed later. The
  assertion error itself comes first.
- **The two earlier fixes had no effect because they target a mechanism that was
  never involved.** `backgroundThrottling: false` and the
  `disable-renderer-backgrounding` / `-background-timer-throttling` /
  `-backgrounding-occluded-windows` switches are unrelated to
  `Page.captureScreenshot` needing a frame.

## What changed

`e2e/config/reporting.ts` — under a hidden run, attach the DOM
(`getPageSource`, needs no compositor frame) instead of a screenshot. Headed runs
(`HELIOS_E2E_HEADED=1`) keep the real screenshot.

`src/main/index.ts` — the throttling flag and switches are **kept** (not
throttling a test renderer is reasonable hygiene) but their comments no longer
claim they fix this stall.

## The "one flaky test per run" — three unrelated bugs

Resolved separately by reading the actual job logs (`gh run view <job> --log`)
rather than inferring from test names. Only one of the three was a timeout.

| Run | Real error | Cause |
|---|---|---|
| r3 / 30703357707 | `element click intercepted ... at point (1103, 226)` | toolbar unreachable once the table scrolls |
| m5 / 30780330034 | `{"value":"-1","invalid":null,"tip":null}`, unit `kW/m^2` | a change event swallowed mid unit-conversion — validation never ran |
| m7 / 30824713568 | `add-column-dialog still displayed after 20000ms` | create POST slower than the 20s budget |

Fixes: toolbar buttons now click in-page (matching the four conversions already
in `Weather.page.ts` for the same reason); `TIMEOUTS.MUTATION` (60s) for backend
writes; and the range probes re-dispatch the value on each poll so a lost change
event retries instead of deadlocking.

`-1` is out of range for **both** W/m^2 (0-1500) and kW/m^2 (0-1.5), so m5 cannot
be explained by which unit was active — that cell was genuinely never validated.
The comment guarding it claimed the dump was "a snapshot of a frozen renderer",
citing the SEVERE lines; that inference died with the stall theory above.

## What is still open

**Neither of these reproduces locally.** Five load models were tried — 4 cores,
2 cores, 2 cores + busy loops, periodic 25s whole-machine freezes, and the
unconstrained baseline. They produced either nothing or the *wrong* failure mode
(mocha per-test timeouts, which none of the CI failures are). The fixes come from
CI logs; CI is the only real test of them.

**Two may be masking product bugs, and both deserve their own investigation:**

- *Toolbar interception.* "Click intercepted" means something is painted over the
  button at that point. If a real user can be blocked from the toolbar once the
  table scrolls horizontally, that is a UI defect — and the in-page click now
  hides it from the suite.
- *Validation after a unit change.* If `validateCellValue` genuinely does not
  re-run for a keystroke that lands during `updateColumnWorker`, then a user
  typing an out-of-range value at that moment sees no error at all.

Judge future runs on **failed-test count**, never on stall lines — those were only
ever a function of failures, and the hook that produced them is gone.

## Reproducing the stall on demand

Pin the whole tree to few cores against competing load. `cmd /c start /affinity`
sets the mask at creation and children inherit it, so chromedriver, Electron and
the backend all share the budget (verified: parent and child both reported `15`):

```
cmd /c start "e2e" /affinity 3 /wait run-suite.cmd     # cores 0-1
```

with several busy-loop processes pinned to the same mask. Add a spec containing a
deliberately failing test to trigger the capture hook directly.

## Environment notes for the next Windows box

- The pyhelios build hardcodes the `Visual Studio 17 2022` CMake generator
  (`pyhelios/build_scripts/build_helios.py`), so it fails on a machine with only
  VS 2026. Either install VS 2022 Build Tools, or drop the prebuilt
  `libhelios.dll` from the `pyhelios3d` wheel (same version as the pinned
  submodule) into `helios-desktop-backend/pyhelios/pyhelios_build/build/lib/` —
  `build_binary.ps1` probes exactly that path and skips the source build.
- Node 22 (`.nvmrc`) matters: npm 11 (Node 24) gates install scripts behind
  `allow-scripts`.
