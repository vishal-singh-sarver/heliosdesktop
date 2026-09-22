import React from 'react'
import type { ApiErrorPayload } from '../../containers/HomePage/types'

interface ProjectsLoadErrorProps {
  error: ApiErrorPayload
  /** Omitted when the caller has no way to re-run the fetch — the button is
   *  then hidden rather than rendered dead. */
  onRetry?: () => void
}

/**
 * Shown when the recent-projects fetch FAILED, in place of the empty state.
 *
 * Failing and being empty used to look identical: HomePage read only `data` off
 * the selector and dropped `error`, so a backend that was down rendered "No
 * Projects Found. Please add a new Project." That is not a smaller version of
 * the truth, it is the opposite of it — the projects were on disk the whole
 * time, and the app was telling the user they had none.
 *
 * It cost a real investigation. A crash on Ubuntu orphaned the backend; the next
 * launch started a second one that could not read the database the first was
 * holding, and the screenshot on the bug report showed an empty project list.
 * The report was filed as data loss. It was not.
 *
 * Hence the reassurance line: it is the single most useful sentence on this
 * screen, because the user's first thought on seeing an empty list is that their
 * work is gone.
 */
function ProjectsLoadError({ error, onRetry }: ProjectsLoadErrorProps): React.JSX.Element {
  // status 0 is the reducer's marker for "never reached the server" — a dead or
  // still-starting backend, which is by far the likeliest case here. Anything
  // else did reach it, so the server's own message is more specific than
  // anything this component could invent.
  const detail =
    error.status === 0
      ? 'The Helios backend is not responding. It may still be starting up.'
      : error.message

  return (
    <div
      role="alert"
      data-testid="projects-load-error"
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p className="text-md font-medium text-white">Couldn&apos;t load your projects</p>

      <p className="max-w-md text-sm text-neutral-400">{detail}</p>

      <p className="max-w-md text-sm text-neutral-500">
        Your projects are still saved — this is a connection problem, not lost work.
      </p>

      {onRetry && (
        <button
          type="button"
          data-testid="projects-load-retry"
          onClick={onRetry}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export default ProjectsLoadError
