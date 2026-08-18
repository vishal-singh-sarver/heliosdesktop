import React from 'react'

interface ProgressBarProps {
  /**
   * 0–100, straight from the backend. The bar has no animation and no
   * estimate of its own: it moves when the server reports movement and holds
   * still otherwise. A bar that sits at one value is reporting a server that
   * is working without saying so — not a stuck bar.
   */
  percent: number
  /**
   * The server's message. Empty until it has said something, which is why the
   * accessible name falls back to a fixed one — a progressbar with an empty
   * aria-label is announced as unnamed.
   */
  label: string
}

function ProgressBar({ percent, label }: ProgressBarProps): React.JSX.Element {
  const rounded = Math.round(Math.min(Math.max(percent, 0), 100))

  return (
    <div
      role="progressbar"
      aria-label={label || 'Opening project'}
      aria-valuenow={rounded}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative h-4 flex-1 overflow-hidden rounded-sm bg-neutral-700"
    >
      <div
        className="h-full rounded-sm bg-blue-600 transition-[width] duration-200 ease-out"
        style={{ width: `${rounded}%` }}
      />
    </div>
  )
}

export default ProgressBar
