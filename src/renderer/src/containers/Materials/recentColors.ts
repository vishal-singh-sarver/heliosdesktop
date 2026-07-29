import { STORAGE_KEYS } from 'utils/storageKeys'
import { rgbEquals, toChannel, type RgbColor } from 'utils/color'

// The "Used colors" history: a GLOBAL, most-recent-first list of the visualisation
// colours the user has actually saved onto a material. Capped, de-duped, and
// mirrored to localStorage so it survives an app restart. The reducer owns the
// in-memory list; this module is only the persistence + parse seam.

export const RECENT_COLORS_LIMIT = 8

// Accept only well-formed {r,g,b} integers — a hand-edited or stale localStorage
// value must never crash the picker or seed garbage swatches.
function isRgb(value: unknown): value is RgbColor {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    typeof c.r === 'number' &&
    typeof c.g === 'number' &&
    typeof c.b === 'number' &&
    Number.isFinite(c.r) &&
    Number.isFinite(c.g) &&
    Number.isFinite(c.b)
  )
}

// Snap channels and drop duplicates/overflow — the single normaliser both the
// loader and the "prepend a new colour" path funnel through.
export function normalizeRecentColors(colors: RgbColor[]): RgbColor[] {
  const out: RgbColor[] = []
  for (const raw of colors) {
    const c = { r: toChannel(raw.r), g: toChannel(raw.g), b: toChannel(raw.b) }
    if (out.some((existing) => rgbEquals(existing, c))) continue
    out.push(c)
    if (out.length >= RECENT_COLORS_LIMIT) break
  }
  return out
}

// Prepend a freshly-used colour: move it to the front (de-duped) and cap.
export function prependRecentColor(list: RgbColor[], color: RgbColor): RgbColor[] {
  return normalizeRecentColors([color, ...list])
}

// Read the persisted list. Any failure (no localStorage, bad JSON, wrong shape)
// yields an empty list rather than throwing — the picker just starts with no
// history.
export function loadRecentColors(): RgbColor[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(STORAGE_KEYS.recentColors)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeRecentColors(parsed.filter(isRgb))
  } catch {
    return []
  }
}

// Mirror the list to localStorage. Silent on failure (private mode / quota) —
// persistence is a nicety, not a correctness requirement.
export function saveRecentColors(colors: RgbColor[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.recentColors, JSON.stringify(normalizeRecentColors(colors)))
  } catch {
    // ignore
  }
}
