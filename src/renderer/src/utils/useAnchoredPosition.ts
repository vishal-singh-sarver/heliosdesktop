import React from 'react'

/** A viewport-space rectangle — the subset of DOMRect this module needs. */
export interface AnchorRect {
  top: number
  left: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface Position {
  top: number
  left: number
}

/**
 * Where the popup sits relative to its anchor.
 * - `left-start`  — beside the anchor, top edges aligned
 * - `left`        — beside the anchor, vertically centred on it
 * - `bottom-start`— below the anchor, left edges aligned
 *
 * There is deliberately no flip/auto-placement: the popups using this all live
 * on a fixed strip beside the right-hand panel, where clamping to the viewport
 * is what actually matters. Add a placement here when a caller needs one.
 */
export type Placement = 'left-start' | 'left' | 'bottom-start'

const DEFAULT_GAP = 8
const DEFAULT_PADDING = 8

/**
 * Keep `value` within [min, max]. When the popup is bigger than the space it has
 * (max < min) it pins to `min`, so it overflows the far edge rather than jumping
 * to a negative coordinate.
 */
function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.max(min, Math.min(value, max))
}

/**
 * The popup's viewport position, given a measured anchor and a measured popup.
 * Pure — the hook below supplies the measurements.
 */
export function placeFloating(
  anchor: AnchorRect,
  floating: Size,
  placement: Placement,
  viewport: Size,
  gap: number = DEFAULT_GAP,
  padding: number = DEFAULT_PADDING
): Position {
  let top: number
  let left: number

  switch (placement) {
    case 'left-start':
      left = anchor.left - floating.width - gap
      top = anchor.top
      break
    case 'left':
      left = anchor.left - floating.width - gap
      top = anchor.top + (anchor.height - floating.height) / 2
      break
    case 'bottom-start':
      left = anchor.left
      top = anchor.top + anchor.height + gap
      break
  }

  return {
    left: Math.round(clamp(left, padding, viewport.width - floating.width - padding)),
    top: Math.round(clamp(top, padding, viewport.height - floating.height - padding))
  }
}

/**
 * The space a popup has to work with in this placement, once the anchor, the gap
 * and the viewport padding are accounted for.
 *
 * Derived from the anchor alone — never from the popup's own size — so it is
 * known before the popup renders and callers can use it as a max-width/height
 * without creating a measurement cycle. Never negative: consumers cap themselves
 * with it, and a negative would collapse the popup entirely.
 */
export function availableSpace(
  anchor: AnchorRect,
  placement: Placement,
  viewport: Size,
  gap: number = DEFAULT_GAP,
  padding: number = DEFAULT_PADDING
): Size {
  switch (placement) {
    case 'left-start':
    case 'left':
      return {
        width: Math.max(0, anchor.left - gap - padding),
        height: Math.max(0, viewport.height - padding * 2)
      }
    case 'bottom-start':
      return {
        width: Math.max(0, viewport.width - anchor.left - padding),
        height: Math.max(0, viewport.height - (anchor.top + anchor.height + gap) - padding)
      }
  }
}

export interface UseAnchoredPositionOptions {
  open: boolean
  /**
   * The anchor's viewport rect, or null when it isn't mounted. Called on every
   * measure pass, so it can compose a rect from more than one element — the
   * Select Materials popup takes its x from the panel and its y from the button.
   * Keep it referentially stable (useCallback); a new identity restarts the
   * measure loop.
   */
  getAnchorRect: () => AnchorRect | null
  placement: Placement
  /** Distance from the anchor. Default 8. */
  gap?: number
  /** Minimum distance from the viewport edges. Default 8. */
  padding?: number
}

interface Measurement {
  anchorRect: AnchorRect
  available: Size
  /** Null until the popup has rendered at a non-zero size. */
  position: Position | null
}

export interface UseAnchoredPositionResult {
  /** Attach to the popup element — its size is measured to place it. */
  floatingRef: (el: HTMLElement | null) => void
  /** Null before the first measure lands. */
  measurement: Measurement | null
}

function sameRect(a: AnchorRect, b: AnchorRect): boolean {
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

function samePosition(a: Position | null, b: Position | null): boolean {
  if (a === null || b === null) return a === b
  return a.top === b.top && a.left === b.left
}

function same(a: Measurement | null, b: Measurement): boolean {
  return (
    a !== null &&
    sameRect(a.anchorRect, b.anchorRect) &&
    a.available.width === b.available.width &&
    a.available.height === b.available.height &&
    samePosition(a.position, b.position)
  )
}

/**
 * Keeps a popup glued to its trigger.
 *
 * Re-measures the anchor and the popup and re-derives the position on window
 * resize and after every render, skipping the state update when nothing moved.
 * That covers the cases a measure-once-on-open approach misses: the window being
 * resized out from under an open popup, and the popup being re-sized by its own
 * props.
 *
 * It deliberately does NOT poll. Nothing here tracks a popup through a CSS
 * transition or an ancestor scroll — no current caller needs it (their panels
 * unmount rather than animate, and their popups lay down a full-screen overlay
 * that stops the page scrolling). A caller that does need it should add the
 * observer here rather than measuring on its own.
 *
 * Measurement settles over two pre-paint passes: the first reads the anchor (so
 * the caller can size its popup against it), the second reads the resulting popup
 * and positions it. `position` stays null until then, and callers should keep the
 * popup hidden so it doesn't flash at the wrong spot.
 */
export function useAnchoredPosition({
  open,
  getAnchorRect,
  placement,
  gap = DEFAULT_GAP,
  padding = DEFAULT_PADDING
}: UseAnchoredPositionOptions): UseAnchoredPositionResult {
  const floatingElRef = React.useRef<HTMLElement | null>(null)
  const [measurement, setMeasurement] = React.useState<Measurement | null>(null)

  // Drop the previous measurement the moment the popup closes, so reopening
  // starts unpositioned rather than flashing at wherever the last one ended up.
  // Adjusting state during render (rather than in an effect) is React's own
  // pattern for reacting to a prop change, and avoids a wasted render pass.
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    setMeasurement(null)
  }

  const measure = React.useCallback((): void => {
    const el = floatingElRef.current
    const anchorRect = getAnchorRect()
    if (!el || !anchorRect) return

    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const rect = el.getBoundingClientRect()
    const next: Measurement = {
      anchorRect,
      available: availableSpace(anchorRect, placement, viewport, gap, padding),
      // A zero rect means the popup hasn't rendered its content yet (the caller
      // is still waiting on anchorRect to size it). Positioning against that
      // would be wrong, so hold off for one more pass.
      position:
        rect.width > 0 && rect.height > 0
          ? placeFloating(anchorRect, rect, placement, viewport, gap, padding)
          : null
    }
    setMeasurement((prev) => (same(prev, next) ? prev : next))
  }, [getAnchorRect, placement, gap, padding])

  // Re-measuring whenever the popup element is swapped in keeps the first pass
  // pre-paint, before the layout effect below has run.
  const floatingRef = React.useCallback(
    (el: HTMLElement | null): void => {
      floatingElRef.current = el
      if (el) measure()
    },
    [measure]
  )

  // Re-measure after every render. This is what settles the two-pass sequence
  // (anchor first, then the popup the caller sized against it) and what picks up
  // a popup re-sized by its props. Converges immediately — `measure` bails out of
  // the state update once nothing differs, so this can't loop.
  React.useLayoutEffect(() => {
    if (open) measure()
  })

  // The trigger moves when the window does — that's the case this exists for.
  // Only while open, so a closed popup costs nothing.
  React.useEffect(() => {
    if (!open) return
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, measure])

  return { floatingRef, measurement }
}
