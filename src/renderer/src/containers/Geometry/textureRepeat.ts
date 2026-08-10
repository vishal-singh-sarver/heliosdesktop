// ── Texture Repeat: the divisor constraint ───────────────────────────────────
//
// A ground is subdivided into `resolution_x × resolution_y` cells, and the
// Texture Repeat counts (texture_x / texture_y) tile a texture across those
// cells. A repeat only lands on cell boundaries when it DIVIDES the subdivision
// count exactly — repeat 3 across 10 subdivisions would cut cells in thirds, so
// the engine floors it. The valid set for an axis is therefore the divisors of
// that axis's resolution: 10 → {1, 2, 5, 10}.
//
// The rule is per-axis and independent: texture_x is checked against
// resolution_x, texture_y against resolution_y.
//
// This module is pure arithmetic + copy formatting — no React, no store — so the
// rule can be tested on its own and reused if the same constraint shows up on
// another object type.

// Trial division costs √count iterations, and `count` arrives UNVALIDATED — it
// is whatever is in the resolution field this keystroke, before the catalog's
// range check has any say. The keystroke guard admits scientific notation, so
// "9e30" is typeable, and √9e30 is 3e15 iterations: a permanent freeze of the
// renderer, during a render.
//
// So there is a hard ceiling. Above it the valid set is reported as empty —
// which is exactly right, not a fudge: a resolution beyond this is far past the
// catalog's own maximum (25000), so it is already failing its range validation
// and blocking Save. Suppressing the constraint there means the repeat field is
// left alone while the resolution is nonsense, and picks the rule back up the
// moment the resolution is something the engine could accept.
const MAX_SUBDIVISION_COUNT = 1_000_000

// divisorsOf is called on every render of the properties form (once per axis).
// The answer only depends on the subdivision count, so memoize it. Resolution is
// capped at 25000 by the catalog, so entries are small; the cap below is a guard
// against a pathological input stream, not a real memory concern.
const MAX_CACHE_ENTRIES = 64
const divisorCache = new Map<number, readonly number[]>()

// Every divisor of `count`, ascending. Trial division to √count — at the
// catalog's 25000 ceiling that's ~158 iterations, so this is cheap enough to
// call inline.
//
// Returns [] for anything that isn't a usable subdivision count: a blank or
// non-numeric resolution (Number('') is 0, Number('abc') is NaN), a decimal, or
// a value below 1. An empty set is the caller's signal that the constraint can't
// be evaluated yet — NOT that nothing is valid.
export function divisorsOf(count: number): readonly number[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_SUBDIVISION_COUNT) return []
  const cached = divisorCache.get(count)
  if (cached) return cached

  // Divisors come in pairs (i, count/i) straddling √count: collect the small
  // half ascending and the large half descending, then reverse the latter, so
  // the result is sorted without a sort pass.
  const small: number[] = []
  const large: number[] = []
  for (let i = 1; i * i <= count; i++) {
    if (count % i !== 0) continue
    small.push(i)
    const pair = count / i
    // A perfect square's root pairs with itself — don't list it twice.
    if (pair !== i) large.push(pair)
  }
  large.reverse()
  const divisors: readonly number[] = small.concat(large)

  if (divisorCache.size >= MAX_CACHE_ENTRIES) divisorCache.clear()
  divisorCache.set(count, divisors)
  return divisors
}

// The value the engine would actually use for `value`: the largest valid one at
// or below it. 7 across 10 subdivisions → 5; 50 → 10 (the count is always its
// own largest divisor, so this doubles as the upper clamp).
//
// Values BELOW the minimum are the one exception to "snap down": there is
// nothing valid under 1, so 0 and negatives snap UP to 1 rather than being
// rejected. Callers distinguish the two cases by comparing against the input.
//
// Returns null when `divisors` is empty (resolution not usable) or the value
// isn't finite — in both cases there is nothing to snap to and the caller should
// leave the field alone.
export function snapRepeat(value: number, divisors: readonly number[]): number | null {
  if (divisors.length === 0 || !Number.isFinite(value)) return null
  let best = divisors[0]
  for (const divisor of divisors) {
    if (divisor > value) break
    best = divisor
  }
  return best
}

// The next valid value strictly above `value` — what the ▲ stepper and ArrowUp
// move to. Deliberately keyed off "strictly above" rather than "index + 1" so it
// also works from a value that isn't valid yet (mid-edit): 7 across 10 → 10.
// Returns null at the top of the range, where the stepper is disabled.
export function nextValid(value: number, divisors: readonly number[]): number | null {
  if (!Number.isFinite(value)) return null
  return divisors.find((divisor) => divisor > value) ?? null
}

// The previous valid value strictly below `value` (▼ / ArrowDown). From an
// invalid 7 across 10 this gives 5 — the same place a blur would snap it, so the
// two paths agree. Returns null at the bottom of the range.
export function prevValid(value: number, divisors: readonly number[]): number | null {
  if (!Number.isFinite(value)) return null
  for (let i = divisors.length - 1; i >= 0; i--) {
    if (divisors[i] < value) return divisors[i]
  }
  return null
}
