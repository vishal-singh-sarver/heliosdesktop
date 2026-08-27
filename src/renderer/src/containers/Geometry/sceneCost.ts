import { formatBytes } from 'utils/format'

// ── What a ground costs ──────────────────────────────────────────────────────
//
// Resolution accepts up to 25000 on each axis, and nothing anywhere warned that
// the number being typed was unaffordable. It is not a niche edge: a tester
// following an ordinary "add a ground" script set 1000x1000, and from then on
// the project could not be reopened at all — the backend spent >15 minutes
// inside loadXML and never finished.
//
// The cost is per CELL, and cells are the product of the two axes, so it grows
// quadratically while the input reads linearly. 500x500 is a quarter of a
// million; 1000x1000 is a million; 25000x25000 is six hundred and twenty-five
// million. Typing one more zero is a 100x jump, which is exactly the kind of
// thing a person cannot be expected to feel.
//
// Measured rather than modelled. This started at 1.4 KB, extrapolated from ONE
// macOS reading (a 1000x1000 ground at ~1.4 GB resident). The backend team then
// measured properly on Linux across 90k / 250k / 490k / 1M cells and got a
// consistent ~1.7 KB — so the single-point estimate was ~20% low. Their number
// wins: four points beat one, and erring high on a warning is the safe direction.
//
// Still only ever rendered as "roughly". It conveys the ORDER of the number, not
// a prediction, and the true figure moves with platform and allocator.
//
// It is also, today, an UNDER-estimate of what switching projects costs. Freeing
// a context returns nothing to the OS — glibc holds the arena, so opening A then
// B costs A+B rather than max(A,B) (measured: 1742 MB built, 1804 MB after the
// context was dropped and gc ran, 66 MB after malloc_trim). The backend is
// landing a malloc_trim on discard, which is why that is not baked in here: this
// constant describes ONE ground, and the transient double-hold is a bug being
// fixed rather than a property to teach the user.
const BYTES_PER_CELL = 1700

/** 500x500. Slow to save and reopen, but it does complete. */
export const CAUTION_CELLS = 250_000

/** 1000x1000 — the size that took the reported project past reopening at all. */
export const WARNING_CELLS = 1_000_000

export type CostLevel = 'ok' | 'caution' | 'warning'

export interface SceneCost {
  cells: number
  bytes: number
  level: CostLevel
}

function parseAxis(raw: string | undefined): number | null {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  // Rejects NaN, Infinity, 0, negatives and fractional input. A half-typed or
  // invalid value has its own per-field error already; guessing a cost from it
  // would put a second, contradictory message on screen.
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null
  return n
}

/**
 * The cost of a ground at this resolution, or null when it cannot be known yet.
 *
 * Null means "say nothing": either axis blank, mid-typed or invalid. That is the
 * common case while someone is still editing, and a warning that flickers in and
 * out on each keystroke is worse than no warning at all.
 */
export function groundCost(
  resolutionX: string | undefined,
  resolutionY: string | undefined
): SceneCost | null {
  const x = parseAxis(resolutionX)
  const y = parseAxis(resolutionY)
  if (x === null || y === null) return null

  const cells = x * y
  const level: CostLevel =
    cells >= WARNING_CELLS ? 'warning' : cells >= CAUTION_CELLS ? 'caution' : 'ok'

  return { cells, bytes: cells * BYTES_PER_CELL, level }
}

/**
 * The line shown under the Resolution row, or null when there is nothing to say.
 *
 * Names the consequence the user actually meets — a slow reopen, a project that
 * will not open — rather than the mechanism. "1,000,000 surfaces" is the honest
 * unit: it is what the number they typed really means.
 */
export function groundCostWarning(cost: SceneCost | null): string | null {
  if (cost === null || cost.level === 'ok') return null

  const cells = cost.cells.toLocaleString()
  const size = formatBytes(cost.bytes)

  if (cost.level === 'warning') {
    return (
      `${cells} surfaces, roughly ${size} of memory. A ground this size can take ` +
      `several minutes to save and reopen, and may not open at all on a machine ` +
      `with less memory free.`
    )
  }

  return `${cells} surfaces, roughly ${size} of memory. Saving and reopening this project will be slow.`
}
