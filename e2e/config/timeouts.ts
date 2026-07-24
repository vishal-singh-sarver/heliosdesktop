/**
 * Centralized explicit-wait budgets. Replaces the magic 5000/10000/15000/20000/
 * 30000 timeouts that were scattered across every spec and page object.
 *
 * Guidance:
 *  - SHORT   — a control that should already be present/settled (menus, errors).
 *  - MEDIUM  — a normal async UI settle (dialog open/close, row appears).
 *  - LONG    — a backend round-trip (create/rename/delete, reload-to-home).
 *  - XLONG   — heavy work: relaunch, large-file import, bulk row/column ops.
 *  - NEGATIVE_GATE — how long a gate that must STAY closed is observed before we
 *                    accept it never opened (used by staysDisabled-style checks).
 */
export const TIMEOUTS = {
  SHORT: 5_000,
  MEDIUM: 10_000,
  LONG: 20_000,
  XLONG: 30_000,
  RELAUNCH: 120_000,
  NEGATIVE_GATE: 3_000
} as const

export type TimeoutKey = keyof typeof TIMEOUTS
