import React from 'react'

interface SidebarButtonProps {
  label: string
  icon: string
  isActive?: boolean
  onClick: () => void
  'data-testid'?: string
}

function SidebarButton({
  label,
  icon,
  isActive = false,
  onClick,
  'data-testid': dataTestId
}: SidebarButtonProps): React.JSX.Element {
  return (
    <button
      data-testid={dataTestId}
      data-active={isActive}
      aria-label={`Sidebar ${label}`}
      onClick={onClick}
      className={`flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition ${
        isActive
          ? 'bg-panel text-white'
          : 'text-neutral-300 hover:bg-panel hover:text-white hover:ring-1 hover:ring-app-border/80'
      }`}
    >
      <img src={icon} className="h-5 w-5 opacity-80" />
      {label}
    </button>
  )
}

export default SidebarButton
