import deleteIcon from '@renderer/assets/delete.svg'
import React from 'react'
import messages from './messages'

interface SelectionActionBarProps {
  count: number
  onDelete: () => void
}

/**
 * Floating summary of the shift-click row highlight, with the bulk action.
 *
 * Presentational only — where it sits is the caller's business, the same split
 * Snackbar/SnackbarHost already uses. WeatherTable positions it; this just
 * draws the pill.
 *
 * Fixed 493x54 per the design, rather than hugging its content, so the pill
 * doesn't resize as the count goes from 1 to 266 — the text is pinned left, the
 * button right, and the gap between absorbs the difference.
 */
export default function SelectionActionBar({
  count,
  onDelete
}: SelectionActionBarProps): React.JSX.Element | null {
  // Nothing selected, nothing to say. Returning null here (rather than making
  // the caller guard) keeps the render site a one-liner — same as SnackbarHost.
  if (count === 0) return null

  return (
    <div
      data-testid="selection-action-bar"
      // The background MUST keep its alpha: backdrop-blur has nothing to blur
      // through behind an opaque fill, and would silently render as a no-op.
      className="flex h-[54px] w-[493px] items-center justify-between rounded-[16px] border border-app-border bg-[#202020]/50 px-6 shadow-[0px_4px_16px_0px_#00000026] backdrop-blur-[12px]"
    >
      <p className="text-sm text-neutral-400">
        <span className="font-medium text-white">{count}</span> {messages.selection.summary(count)}
      </p>

      <button
        type="button"
        onClick={onDelete}
        className="flex items-center gap-2 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
      >
        <img src={deleteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
        {messages.selection.deleteButton}
      </button>
    </div>
  )
}
