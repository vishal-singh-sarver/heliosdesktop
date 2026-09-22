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

// The slack for the sub-pixel comparison below. Small enough to catch a label
// overflowing by a fraction of a pixel, wide enough that measuring the text and
// laying it out disagreeing in the last decimal doesn't count as clipped.
const SUBPIXEL_TOLERANCE = 0.5

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

// One canvas for the whole app: measuring text on it needs no DOM node and no
// layout pass, unlike cloning the label somewhere off-screen to read its width.
// It also works for an <input>, whose text is a value rather than a node a Range
// could be put around.
let measureContext: CanvasRenderingContext2D | null = null

function measureText(el: HTMLElement, text: string): number {
  // Only a working context is kept. Caching a null would pin the first answer
  // forever, and the environment that has no canvas at all is the test one.
  measureContext ||= document.createElement('canvas').getContext('2d')
  // No 2D context — fall back to the whole-pixel check alone rather than
  // guessing at a width.
  if (!measureContext) return 0

  const style = window.getComputedStyle(el)
  // Built by hand rather than read off `style.font`: the shorthand is empty in
  // some engines, and every part of it matters to the width.
  measureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return measureContext.measureText(text).width
}

// The label's content box, with the fraction intact — getBoundingClientRect
// measures the border box, so padding and borders come back off.
function contentWidthOf(el: HTMLElement): number {
  const style = window.getComputedStyle(el)
  const inset =
    (parseFloat(style.paddingLeft) || 0) +
    (parseFloat(style.paddingRight) || 0) +
    (parseFloat(style.borderLeftWidth) || 0) +
    (parseFloat(style.borderRightWidth) || 0)
  return el.getBoundingClientRect().width - inset
}

/**
 * Whether the label is showing less than its full text.
 *
 * Two passes, because one is not enough. `scrollWidth` and `clientWidth` are
 * ROUNDED to whole pixels, which makes them blind to a narrow overflow: a label
 * that fits at 172.4px and one that overflows to 173.0px both report 173 against
 * 172, so the tolerance that keeps the first quiet silences the second too.
 *
 * That blind spot is not an edge case. `text-overflow: ellipsis` does not shave
 * off a pixel of text — to fit the ellipsis glyph it drops whole CHARACTERS, so
 * a name overflowing by one pixel still visibly loses two letters. And geometry
 * names are capped at 20 characters (Geometry/validation.ts), so essentially
 * every one that overflows its column overflows it by a pixel or two — the tree
 * never raised a tooltip at all until this second pass existed.
 *
 * So: the cheap whole-pixel test settles the clear cases, and anything closer is
 * decided by measuring the text against the box with the fraction kept.
 */
function isClipped(el: HTMLElement): boolean {
  if (el.scrollWidth > el.clientWidth + CLIP_TOLERANCE) return true

  const text = fullTextOf(el)
  if (!text) return false

  const width = measureText(el, text)
  if (width === 0) return false

  return width > contentWidthOf(el) + SUBPIXEL_TOLERANCE
}

/**
 * onMouseEnter for any element carrying `truncate`.
 *
 * A label showing its text in full raises no tooltip, rather than one repeating
 * what is already on screen — see isClipped for how that is decided. The text is
 * read off the element itself, so no call site has to restate its own label.
 *
 * The matching "pointer left" is bound here rather than asked of every call
 * site, which keeps this to a single prop wherever it's used. It also has to
 * cover the delay window: leaving before the tooltip has appeared must still
 * cancel it.
 */
export function showFullTextOnHover(e: React.MouseEvent<HTMLElement>): void {
  const anchor = e.currentTarget
  hideFullText()
  if (!isClipped(anchor)) return

  pending = anchor
  // Read the text when the tooltip actually fires, not on entry: most hovers are
  // cancelled inside the delay, and a name edited during it would otherwise show
  // its pre-edit value.
  timer = window.setTimeout(() => set({ anchor, text: fullTextOf(anchor) }), SHOW_DELAY)
  // `once` takes care of removal; a leave that arrives after something else
  // already hid the tooltip is a no-op.
  anchor.addEventListener('mouseleave', () => hideFullTextFor(anchor), { once: true })
}
