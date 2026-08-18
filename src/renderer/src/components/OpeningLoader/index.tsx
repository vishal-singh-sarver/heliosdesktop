import Dialog from '@renderer/components/Dialog'
import messages from '@renderer/containers/ProjectBoot/messages'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { cancelBoot, dismissBootError, retryBoot } from 'containers/ProjectBoot/actions'
import {
  selectBootActive,
  selectBootError,
  selectBootProgress
} from 'containers/ProjectBoot/selectors'
import ProgressBar from './ProgressBar'

/**
 * The "Opening" dialog shown while a project loads.
 *
 * Rendered from App, not from either screen, for two reasons: on a row click it
 * has to cover the home page while the project screen does not exist yet, and
 * on restart it has to cover the project screen from the very first frame. Same
 * component, same run, only the backdrop differs.
 */
function OpeningLoader(): React.JSX.Element | null {
  const dispatch = useDispatch()
  const active = useSelector(selectBootActive)
  const error = useSelector(selectBootError)
  const progress = useSelector(selectBootProgress)

  if (!active && !error) return null

  // Cancel and the header × are the same action: stop the load and go back to
  // the project list. On restart there is no screen behind the loader to return
  // to, so Home is the destination in both cases — one path, no half-loaded
  // project screen to explain.
  const onCancel = (): void => {
    dispatch(cancelBoot())
  }

  // A failure is only ever dispatched once the run has ended, so the race that
  // was listening for CANCEL_BOOT is gone by the time this dialog appears —
  // reusing onCancel here left both its buttons dead. This action has an
  // always-on watcher instead.
  const onDismissError = (): void => {
    dispatch(dismissBootError())
  }

  if (error) {
    return (
      <Dialog isOpen title={messages.error.title} onClose={onDismissError}>
        <p className="text-sm text-neutral-300">{error.message || messages.error.generic}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onDismissError}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
          >
            {messages.error.homeButton}
          </button>
          {/* Only offered when a retry could plausibly succeed. A 4xx means the
              ids are stale and the same request would fail the same way. */}
          {error.retryable && (
            <button
              type="button"
              onClick={() => dispatch(retryBoot())}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500"
            >
              {messages.error.retryButton}
            </button>
          )}
        </div>
      </Dialog>
    )
  }

  // Both halves come from the server: its `message`, and its own done/total
  // when it sends them. Nothing here is written by the frontend.
  const caption =
    progress.total > 0
      ? `${progress.label} ${messages.loader.counts(progress.done, progress.total)}`
      : progress.label

  return (
    <Dialog isOpen title={messages.loader.title} onClose={onCancel}>
      <p aria-live="polite" className="text-sm text-neutral-300">
        {caption}
      </p>
      <div className="flex items-center gap-3">
        <ProgressBar percent={progress.percent} label={caption} />
        <button
          type="button"
          onClick={onCancel}
          className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
        >
          {messages.loader.cancelButton}
        </button>
      </div>
    </Dialog>
  )
}

export default OpeningLoader
