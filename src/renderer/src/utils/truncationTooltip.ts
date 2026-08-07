import type React from 'react'

// The hover behind the app's "what does that clipped label actually say?"
// tooltip, which <TruncationTooltip /> draws.
//
// The browser's own `title` tooltip did this for free, but it waits about a
// second before appearing — far too long for a name the UI has already cut off,
// and not configurable. So the hover is recorded here and drawn on our timing
// instead.
//
// A module store rather than context: every truncated label in the app feeds ONE
// tooltip, so a provider wrapping them all would buy nothing.

export interface TruncatedHover {
  /** The clipped element — the tooltip positions itself against it. */
  anchor: HTMLElement
  /** Its text, in full. */
  text: string
}

// Long enough that sweeping the pointer down a list doesn't flash a tooltip on
// every clipped row it crosses; short enough to still read as instant.
const SHOW_DELAY = 100

// scrollWidth and clientWidth are rounded to whole pixels, so a label that fits
// can still report one more than the other. Without this slack that rounding
// raises a tooltip repeating text already fully on screen.
const CLIP_TOLERANCE = 1

let hover: TruncatedHover | null = null
// The label the pointer is on NOW, which is not the one being shown until the
// delay elapses. Kept so a hide can tell "the pointer left" from "another label
// has since taken over" — see hideFullTextFor.
let pending: HTMLElement | null = null
let timer: number | undefined
const listeners = new Set<() => void>()

function set(next: TruncatedHover | null): void {
  if (hover === next) return
  hover = next
  listeners.forEach((listener) => listener())
}

export function subscribeToTruncatedHover(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Identity only changes in set(), which is what useSyncExternalStore needs to
// stop re-rendering.
export function getTruncatedHover(): TruncatedHover | null {
  return hover
}

export function hideFullText(): void {
  window.clearTimeout(timer)
  pending = null
  set(null)
}

// Hide on behalf of one particular label, ignored once another has taken the
// hover. Moving between two adjacent clipped rows dispatches the old row's
// leave BEFORE the new row's enter, so an unconditional hide here would cancel
// the tooltip the new row just scheduled.
function hideFullTextFor(anchor: HTMLElement): void {
  if (pending !== anchor) return
  hideFullText()
}

// Where an element keeps its text. A name shown in an <input> (the Materials
// and Geometry panel headers, which are inputs so the pencil can unlock them for
// renaming) has none of its own — it's the value.
function fullTextOf(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) return el.value
  return el.textContent ?? ''
}

/**
 * onMouseEnter for any element carrying `truncate`.
 *
 * `scrollWidth` is how wide the text WANTS to be and `clientWidth` how much room
 * it got, so wider means clipped — a label that fits raises no tooltip at all,
 * rather than one repeating what is already on screen. The text is read off the
 * element itself, so no call site has to restate its own label.
 *
 * The matching "pointer left" is bound here rather than asked of every call
 * site, which keeps this to a single prop wherever it's used. It also has to
 * cover the delay window: leaving before the tooltip has appeared must still
 * cancel it.
 */
export function showFullTextOnHover(e: React.MouseEvent<HTMLElement>): void {
  const anchor = e.currentTarget
  hideFullText()
  if (anchor.scrollWidth <= anchor.clientWidth + CLIP_TOLERANCE) return

  pending = anchor
  // Read the text when the tooltip actually fires, not on entry: most hovers are
  // cancelled inside the delay, and a name edited during it would otherwise show
  // its pre-edit value.
  timer = window.setTimeout(() => set({ anchor, text: fullTextOf(anchor) }), SHOW_DELAY)
  // `once` takes care of removal; a leave that arrives after something else
  // already hid the tooltip is a no-op.
  anchor.addEventListener('mouseleave', () => hideFullTextFor(anchor), { once: true })
}
