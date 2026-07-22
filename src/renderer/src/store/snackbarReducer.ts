/*
 * Snackbar reducer
 *
 * A single, app-global toast: the ONE message currently shown (or none). It is
 * always-combined (like navigation) rather than injected, so any container's
 * saga can raise a toast without the snackbar slice being mounted first — e.g.
 * the Geometry saga reports a material-assignment outcome here.
 *
 * Only one toast lives at a time: a new `showSnackbar` replaces whatever was on
 * screen. `key` increments on every show so the host's auto-dismiss timer
 * restarts even when two identical messages fire back-to-back.
 */

export type SnackbarVariant = 'success' | 'error'

export interface SnackbarState {
  message: string | null
  variant: SnackbarVariant
  key: number
}

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
  [extraProps: string]: unknown
}
export type SnackbarAction = ShowSnackbarAction | DismissSnackbarAction

export function showSnackbar(
  message: string,
  variant: SnackbarVariant = 'success'
): ShowSnackbarAction {
  return { type: SHOW_SNACKBAR, payload: { message, variant } }
}

export function dismissSnackbar(): DismissSnackbarAction {
  return { type: DISMISS_SNACKBAR }
}

export const initialState: SnackbarState = {
  message: null,
  variant: 'success',
  key: 0
}

export default function snackbarReducer(
  state: SnackbarState = initialState,
  action: SnackbarAction
): SnackbarState {
  switch (action.type) {
    case SHOW_SNACKBAR:
      return {
        message: action.payload.message,
        variant: action.payload.variant,
        key: state.key + 1
      }
    case DISMISS_SNACKBAR:
      // Keep `variant` so the exit doesn't flash the wrong colour; only the
      // message going null hides the toast.
      return { ...state, message: null }
    default:
      return state
  }
}
