/**
 * Centralized explicit-wait budgets. Replaces the magic 5000/10000/15000/20000/
 * 30000 timeouts that were scattered across every spec and page object.
 *
 * Guidance:
 *  - SHORT   — a control that should already be present/settled (menus, errors).
 *  - MEDIUM  — a normal async UI settle (dialog open/close, row appears).
 *  - LONG    — a backend round-trip (create/rename/delete, reload-to-home).
 *  - XLONG   — heavy work: relaunch, large-file import, bulk row/column ops.
 *  - MUTATION — a write that must survive a CI stall; see below.
 *  - NEGATIVE_GATE — how long a gate that must STAY closed is observed before we
 *                    accept it never opened (used by staysDisabled-style checks).
 *
 * On sizing MUTATION: these budgets were all chosen on a developer machine, but
 * the CI runners do not merely run slower — they FREEZE. On run 30765040961 one
 * of seven sessions took 32.4s to answer /health while the other six took
 * 2.0-3.6s (see the comment in src/main/backend-manager.ts). Any 20s wait on a
 * backend write is therefore under-provisioned by construction, and that is
 * exactly how it presents: run 30824713568 failed a single test on
 * windows-2022 with
 *   element ("[data-testid="add-column-dialog"]") still displayed after 20000ms
 * i.e. the POST behind the dialog simply had not come back yet.
 *
 * Widening this is close to free. Every call site is a waitUntil/waitForDisplayed
 * that returns the moment its condition holds, so a bigger ceiling costs nothing
 * on a healthy run; it only delays how fast a genuinely broken write is reported,
 * and the mocha per-test timeout (120s) still bounds that.
 *
 * Deliberately NOT applied to the whole table: NEGATIVE_GATE must stay small (it
 * is a "stays false" observation window, so growing it only slows the suite), and
 * MEDIUM/SHORT guard UI transitions that do not touch the backend.
 */
export const TIMEOUTS = {
  SHORT: 5_000,
  MEDIUM: 10_000,
  LONG: 20_000,
  XLONG: 30_000,
  /** A backend write (POST/PATCH/DELETE) that must outlast a runner freeze. */
  MUTATION: 60_000,
  RELAUNCH: 120_000,
  NEGATIVE_GATE: 3_000
} as const

export type TimeoutKey = keyof typeof TIMEOUTS
