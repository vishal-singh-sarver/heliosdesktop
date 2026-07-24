import React from 'react'

interface CollapseButtonProps {
  collapsed: boolean
  side: 'left' | 'right'
  onToggle: () => void
  /** Optional test-id forwarded to the button — lets callers disambiguate the
   *  two panels, whose aria-labels ('Expand panel'/'Collapse panel') are identical. */
  dataTestId?: string
}

function CollapseButton({
  collapsed,
  side,
  onToggle,
  dataTestId
}: CollapseButtonProps): React.JSX.Element {
  // Chevron points toward the action the click will perform.
  // LeftPanel expanded  -> points left (collapse to the left).
  // LeftPanel collapsed -> points right (expand to the right).
  // RightPanel is mirrored.
  const pointsLeft = side === 'left' ? !collapsed : collapsed

  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={dataTestId}
      aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      className="flex h-6 w-6 items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/60 hover:text-white"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: pointsLeft ? 'rotate(0deg)' : 'rotate(180deg)' }}
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  )
}

export default CollapseButton
