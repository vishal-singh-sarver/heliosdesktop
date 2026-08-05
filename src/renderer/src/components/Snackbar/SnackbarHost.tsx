import {
  dismissSnackbar,
  selectSnackbarStack,
  type SnackbarItem
} from '@renderer/store/snackbarReducer'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Snackbar from './Snackbar'

// Auto-dismiss delay for a toast (ms). Long enough to read a short line,
// short enough to get out of the way; the user can also close it early.
const AUTO_DISMISS_MS = 2500
// Must match --animate-toast-out's duration in index.css. The toast is removed
// from the store only after this, so the exit has time to play — React unmounts
// the element the instant the store drops it, which would cut the animation off
// before its first frame.
const EXIT_MS = 160

// One toast, its dwell timer, and its exit. Both timers live HERE, per toast,
// rather than in the host: several are on screen at once and each has to expire
// on its own clock, counted from when it arrived — a single shared timer would
// tie a new toast's life to whatever was already up.
function TimedSnackbar({
  item,
  onDismiss
}: {
  item: SnackbarItem
  onDismiss: (id: number) => void
}): React.JSX.Element {
  // Leaving, but still on screen playing its exit. Local, not store state: it
  // describes this element's animation, and nothing outside cares.
  const [leaving, setLeaving] = React.useState(false)

  // The dwell. Ends by starting the exit, not by removing the toast.
  React.useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [item.id])

  // …and the exit hands it to the store once the animation has played out.
  React.useEffect(() => {
    if (!leaving) return undefined
    const timer = setTimeout(() => onDismiss(item.id), EXIT_MS)
    return () => clearTimeout(timer)
  }, [leaving, item.id, onDismiss])

  return (
    // The wrapper animates so the card stays a plain, position-agnostic box.
    // `animate-toast-out` replaces the enter animation outright — same property,
    // so the last one declared wins and the toast can't try to do both.
    <div className={leaving ? 'animate-toast-out' : 'animate-toast-in'}>
      <Snackbar message={item.message} variant={item.variant} onDismiss={() => setLeaving(true)} />
    </div>
  )
}

// The app-global toast outlet: renders the whole stack bottom-right and retires
// each toast on its own timer. Mounted once at the app root so any container's
// saga can raise a toast via `showSnackbar` without owning any UI itself — this
// is the ONLY place in the app that renders a <Snackbar/>.
export default function SnackbarHost(): React.JSX.Element | null {
  const dispatch = useDispatch()
  const toasts = useSelector(selectSnackbarStack)

  // Stable, so a re-render can't restart a toast's timer and leave it up longer
  // than its dwell.
  const handleDismiss = React.useCallback((id: number) => dispatch(dismissSnackbar(id)), [dispatch])

  if (toasts.length === 0) return null
  return (
    // Bottom-right, out of the way of the panels and the toolbar the user is
    // working in. Oldest first, so the newest arrival sits closest to the corner
    // and the stack grows upward — nothing already on screen moves under the
    // cursor. `items-end` keeps every card flush to the right whatever its
    // width; the container ignores pointer events so the gaps between cards
    // don't block the canvas underneath.
    <div className="pointer-events-none fixed bottom-7 right-7 z-[100] flex max-w-[calc(100vw-3.5rem)] flex-col items-end gap-2">
      {toasts.map((item) => (
        <TimedSnackbar key={item.id} item={item} onDismiss={handleDismiss} />
      ))}
    </div>
  )
}
