import React from 'react'

/**
 * Returns true on the single render where `value` flipped true → false.
 *
 * Lets a component auto-close a dialog on a request's loading→idle transition
 * without a useEffect (which would fire a cascading render). Pair it with the
 * request's error to close only on success:
 *
 *     if (useTransitionToFalse(loading) && !error && isOpen) setIsOpen(false)
 *
 * Adjusting state during render like this is React's documented derived-state
 * pattern — the same one CellInput uses for `lastSeenValue`.
 */
export function useTransitionToFalse(value: boolean): boolean {
  const [prev, setPrev] = React.useState(value)
  if (prev !== value) {
    setPrev(value)
    return prev && !value
  }
  return false
}
