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
 */

// `info` is for a neutral, no-op outcome — nothing succeeded or failed, the
// action simply had nothing to do (e.g. re-assigning the material a geometry
// already carries), or a caveat worth reading (import truncated your decimals).
export type SnackbarVariant = 'success' | 'error' | 'info'

export interface SnackbarItem {
  id: number
  message: string
  variant: SnackbarVariant
}

export interface SnackbarState {
  // Oldest first — the host renders them top-to-bottom, so the newest sits
  // closest to the corner and older ones drift up as they arrive.
  toasts: SnackbarItem[]
  // Monotonic id source, so ids stay unique as items come and go.
  nextId: number
}

// How many toasts may be on screen at once. A burst — say a save that fails for
// every row — must not paper the window over; past this the OLDEST goes, which
// is the one that has already had the most time to be read.
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
      return {
        // Keep the newest MAX_VISIBLE; the ones that fall off the top are the
        // ones that have been up longest.
        toasts: next.slice(-MAX_VISIBLE),
        nextId: state.nextId + 1
      }
    }
    case DISMISS_SNACKBAR:
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload.id) }
    default:
      return state
  }
}
