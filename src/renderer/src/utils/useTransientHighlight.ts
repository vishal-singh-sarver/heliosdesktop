import React from 'react'

// How long a "this just appeared" cue stays on screen before fading out.
export const HIGHLIGHT_DURATION_MS = 1000

// The cue itself — a blue outline over a faint blue wash. Shared so a new
// Parameter Group card, a new material row and a new geometry row all flash the
// same way; the `transition-colors` on each target fades it back out.
export const HIGHLIGHT_CLASSES = 'border-blue-500 bg-blue-500/5'

// A one-shot "this just appeared" cue: returns `id` for `durationMs`, then calls
// `onExpire` and returns whatever the source now holds.
//
// `onExpire` must CLEAR the id at its source (local state, or the store via a
// dispatch) — that is what ends the cue, and it's also what stops a created id
// from flashing again every time the list remounts (e.g. collapsing and
// reopening the panel), long after the create.
export function useTransientHighlight<T>(
  id: T | null,
  onExpire: () => void,
  durationMs: number = HIGHLIGHT_DURATION_MS
): T | null {
  // The latest callback, read only when the timer fires — so passing an inline
  // arrow doesn't restart the timer on every render. Only a new id (or duration)
  // may do that.
  const expireRef = React.useRef(onExpire)
  React.useEffect(() => {
    expireRef.current = onExpire
  })

  React.useEffect(() => {
    if (id == null) return undefined
    const timer = window.setTimeout(() => expireRef.current(), durationMs)
    return () => window.clearTimeout(timer)
  }, [id, durationMs])

  return id
}

// Brings the element into view while `active`: a freshly added row or card can
// land below the fold of its scrolling list. `block: 'nearest'` scrolls that
// list only as far as it must, and never the page behind it.
export function useScrollIntoViewWhen<T extends HTMLElement>(
  active: boolean
): React.RefObject<T | null> {
  const ref = React.useRef<T>(null)
  React.useEffect(() => {
    if (!active) return
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [active])
  return ref
}
