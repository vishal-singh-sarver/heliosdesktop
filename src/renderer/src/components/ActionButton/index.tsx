import React from 'react'

interface ActionButtonProps {
  label: string
  icon: string
  onClick: () => void
}

// White pill button used for left-panel create actions (Geometry's Crop /
// Ground / Import from File, Materials' Add Materials). Matches the light
// buttons in the left-panel mockup.
function ActionButton({ label, icon, onClick }: ActionButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md bg-white px-3 py-1.5 font-['Geist'] text-[12px] font-bold leading-[15px] tracking-normal text-[#344054] hover:bg-neutral-200"
    >
      <img src={icon} alt="" aria-hidden="true" className="h-3 w-3 shrink-0" />
      {label}
    </button>
  )
}

export default ActionButton
