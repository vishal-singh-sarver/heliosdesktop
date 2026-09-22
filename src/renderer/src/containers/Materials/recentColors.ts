import { STORAGE_KEYS } from 'utils/storageKeys'
import { clamp, rgbEquals, toChannel, type RecentColor } from 'utils/color'

// The "Used colors" history: a GLOBAL, most-recent-first list of the visualisation
// colours the user has actually saved onto a material, each with the opacity it
// was saved at. Capped, de-duped, and mirrored to localStorage so it survives an
// app restart. The reducer owns the in-memory list; this module is only the
// persistence + parse seam.

export const RECENT_COLORS_LIMIT = 8

// The opacity an entry takes when it carries none: a colour saved before the
// history stored opacity (a v1 localStorage entry), or one whose save payload
// left the field out. 100 is the picker's own default — fully opaque — so a
// legacy swatch keeps behaving exactly as it did.
export const DEFAULT_RECENT_OPACITY = 100

// Snap to a whole 0-100 — the catalog's opacity property is an integer percent.
function toOpacity(n: number): number {
  return clamp(Math.round(n), 0, 100)
}

// Accept only well-formed {r,g,b} integers — a hand-edited or stale localStorage
// value must never crash the picker or seed garbage swatches. `opacity` is
// OPTIONAL here: entries written before the history carried it are still valid,
// and normalizeRecentColors gives them the default.
function isRecentColor(value: unknown): value is Partial<RecentColor> {
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

// Snap channels + opacity and drop duplicates/overflow — the single normaliser
// both the loader and the "prepend a new colour" path funnel through.
//
// De-duping is on the RGB alone, NOT on (rgb, opacity): two entries of the same
// colour would render as two identical swatches (nothing in the row shows
// opacity), so the user would see a duplicate they can't tell apart. One swatch
// per colour, carrying the opacity of its most recent save.
export function normalizeRecentColors(colors: Partial<RecentColor>[]): RecentColor[] {
  const out: RecentColor[] = []
  for (const raw of colors) {
    const c: RecentColor = {
      r: toChannel(raw.r ?? 0),
      g: toChannel(raw.g ?? 0),
      b: toChannel(raw.b ?? 0),
      opacity:
        typeof raw.opacity === 'number' && Number.isFinite(raw.opacity)
          ? toOpacity(raw.opacity)
          : DEFAULT_RECENT_OPACITY
    }
    if (out.some((existing) => rgbEquals(existing, c))) continue
    out.push(c)
    if (out.length >= RECENT_COLORS_LIMIT) break
  }
  return out
}

// Prepend a freshly-used colour: move it to the front (de-duped) and cap. Re-
// saving a colour at a new opacity refreshes the stored one, because the new
// entry leads and the older duplicate is dropped.
export function prependRecentColor(list: RecentColor[], color: RecentColor): RecentColor[] {
  return normalizeRecentColors([color, ...list])
}

// Read the persisted list. Any failure (no localStorage, bad JSON, wrong shape)
// yields an empty list rather than throwing — the picker just starts with no
// history.
export function loadRecentColors(): RecentColor[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(STORAGE_KEYS.recentColors)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeRecentColors(parsed.filter(isRecentColor))
  } catch {
    return []
  }
}

// Mirror the list to localStorage. Silent on failure (private mode / quota) —
// persistence is a nicety, not a correctness requirement.
export function saveRecentColors(colors: RecentColor[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.recentColors, JSON.stringify(normalizeRecentColors(colors)))
  } catch {
    // ignore
  }
}
