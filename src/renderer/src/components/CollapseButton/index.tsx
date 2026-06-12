import chevronIcon from '@renderer/assets/chevron_leftpanel.svg'
import React from 'react'

interface CollapseButtonProps {
  collapsed: boolean
  side: 'left' | 'right'
  onToggle: () => void
}

function CollapseButton({ collapsed, side, onToggle }: CollapseButtonProps): React.JSX.Element {
  // Chevron points toward the action the click will perform.
  // LeftPanel expanded  -> points left (collapse to the left).
  // LeftPanel collapsed -> points right (expand to the right).
  // RightPanel is mirrored.
  // The asset triangle points left by default; rotate 180deg to point right.
  const pointsLeft = side === 'left' ? !collapsed : collapsed

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      className="flex h-6 w-6 items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/60 hover:text-white"
    >
      <img
        src={chevronIcon}
        alt=""
        aria-hidden="true"
        className="h-2.5 w-auto"
        style={{ transform: pointsLeft ? 'none' : 'rotate(180deg)' }}
      />
    </button>
  )
}

export default CollapseButton
