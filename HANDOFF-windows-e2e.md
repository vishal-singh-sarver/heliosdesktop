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

## What is still open

**The actual red build is one ordinary flaky test per run**, a different one each
time, caused by `windows-2022` runner slowness. That is the real remaining issue,
and it is unaffected by this change — the fix removes the misleading 20s stall
and the SEVERE line, not the flake.

Corroboration that these runners genuinely freeze for tens of seconds: see the
comment in `src/main/backend-manager.ts` — on CI run 30765040961, one of seven
sessions took **32.4s** to answer `/health` while the other six took 2.0-3.6s.

Suggested next step: treat it as tolerance/flake management (widen the tightest
waits on Windows, or add bounded spec retries), and judge it on **failed-test
count**, not on stall lines — those are now a strict function of failures.

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
