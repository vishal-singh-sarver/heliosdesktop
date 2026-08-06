/*
 * Snackbar reducer
 *
 * The app's ONE toast queue: every notification in the app goes through here,
 * and `components/Snackbar/SnackbarHost` (mounted once at the root) is the only
 * thing that renders one. It is always-combined (like navigation) rather than
 * injected, so any container's saga can raise a toast without the snackbar slice
 * being mounted first — e.g. the Geometry saga reports a material-assignment
 * outcome here, and Weather reports an import warning.
 *
 * Toasts STACK rather than take turns: a second one raised while the first is
 * still up appears beneath it and both stay readable, the way desktop apps do
 * it. Each carries a unique `id` — the host runs one dismiss timer per toast and
 * removes that toast by id, so they expire independently and two identical
 * messages back-to-back are still two toasts.
 *
 * Nothing here removes a toast on its own. Both ways out — the dwell expiring and
 * being crowded out past MAX_VISIBLE — end in the host dispatching DISMISS once
 * the exit animation has played, so a toast is never yanked off screen between
 * two frames.
 */

// `info` is for a neutral, no-op outcome — nothing succeeded or failed, the
// action simply had nothing to do (e.g. re-assigning the material a geometry
// already carries), or a caveat worth reading (import truncated your decimals).
export type SnackbarVariant = 'success' | 'error' | 'info'

export interface SnackbarItem {
  id: number
  message: string
  variant: SnackbarVariant
  // Crowded out by a newer arrival. It no longer counts against MAX_VISIBLE and
  // has given up its place in the stack, but it stays in the list until the host
  // has played its exit and dispatched DISMISS — see the SHOW case.
  evicted?: boolean
}

export interface SnackbarState {
  // Oldest first — the host renders them top-to-bottom, so the newest sits
  // closest to the corner and older ones drift up as they arrive.
  toasts: SnackbarItem[]
  // Monotonic id source, so ids stay unique as items come and go.
  nextId: number
}

// How many toasts may HOLD A PLACE at once. A burst — say a save that fails for
// every row — must not paper the window over; past this the OLDEST goes, which
// is the one that has already had the most time to be read. A toast on its way
// out is briefly still on screen on top of these, playing its exit.
const MAX_VISIBLE = 3

export const SHOW_SNACKBAR = 'app/snackbar/SHOW' as const
export const DISMISS_SNACKBAR = 'app/snackbar/DISMISS' as const

export type ShowSnackbarAction = {
  type: typeof SHOW_SNACKBAR
  payload: { message: string; variant: SnackbarVariant }
  // Index signature required by Redux 5's UnknownAction type so dispatch
  // accepts this action without a cast.
  [extraProps: string]: unknown
}
export type DismissSnackbarAction = {
  type: typeof DISMISS_SNACKBAR
  payload: { id: number }
  [extraProps: string]: unknown
}
export type SnackbarAction = ShowSnackbarAction | DismissSnackbarAction

export function showSnackbar(
  message: string,
  variant: SnackbarVariant = 'success'
): ShowSnackbarAction {
  return { type: SHOW_SNACKBAR, payload: { message, variant } }
}

// Retires ONE toast. Takes an id because several can be on screen together —
// the timer that fires and the × the user clicks both mean a specific one.
export function dismissSnackbar(id: number): DismissSnackbarAction {
  return { type: DISMISS_SNACKBAR, payload: { id } }
}

export const initialState: SnackbarState = {
  toasts: [],
  nextId: 1
}

// Every toast currently on screen, oldest first.
export const selectSnackbarStack = (state: { snackbar: SnackbarState }): SnackbarItem[] =>
  state.snackbar.toasts

export default function snackbarReducer(
  state: SnackbarState = initialState,
  action: SnackbarAction
): SnackbarState {
  switch (action.type) {
    case SHOW_SNACKBAR: {
      const next = [
        ...state.toasts,
        { id: state.nextId, message: action.payload.message, variant: action.payload.variant }
      ]
      // Only toasts still holding a place count against the cap; an evicted one
      // is already on its way out.
      const standing = next.filter((t) => !t.evicted)
      const overflow = standing.length - MAX_VISIBLE
      if (overflow <= 0) return { toasts: next, nextId: state.nextId + 1 }

      // Over the cap: the ones that go are the ones that have been up longest.
      // They are MARKED rather than dropped — deleting them here unmounted the
      // card in the same frame the new one appeared, so the top message was
      // swapped out between two frames and read as the text CHANGING rather than
      // a toast leaving. Marked, it keeps rendering while the host plays its exit
      // (see SnackbarHost) and is removed by the DISMISS that follows.
      const evicting = new Set(standing.slice(0, overflow).map((t) => t.id))
      return {
        toasts: next.map((t) => (evicting.has(t.id) ? { ...t, evicted: true } : t)),
        nextId: state.nextId + 1
      }
    }
    case DISMISS_SNACKBAR:
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload.id) }
    default:
      return state
  }
}
