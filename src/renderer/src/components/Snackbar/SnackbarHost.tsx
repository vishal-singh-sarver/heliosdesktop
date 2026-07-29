import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState } from '@renderer/store/reducers'
import { dismissSnackbar } from '@renderer/store/snackbarReducer'
import Snackbar from './Snackbar'

// Auto-dismiss delay for a toast (ms). Long enough to read a short line,
// short enough to get out of the way; the user can also close it early.
const AUTO_DISMISS_MS = 4000

// The app-global toast outlet: renders the ONE snackbar the store holds and
// auto-dismisses it. Mounted once at the app root so any container's saga can
// raise a toast via `showSnackbar` without owning any UI itself.
export default function SnackbarHost(): React.JSX.Element | null {
  const dispatch = useDispatch()
  const { message, variant, key } = useSelector((state: RootState) => state.snackbar)

  // Restart the timer on every show — keyed on `key`, which increments even when
  // the same message fires twice, so a repeat toast still gets a full dwell.
  React.useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(() => dispatch(dismissSnackbar()), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [key, message, dispatch])

  if (!message) return null
  return (
    <Snackbar message={message} variant={variant} onDismiss={() => dispatch(dismissSnackbar())} />
  )
}
