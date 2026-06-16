import React from 'react'

interface ToolbarButtonProps {
  label: string
  icon: string
  iconPosition?: 'left' | 'right'
  onClick?: () => void
  bgColor?: string
  textColor?: string
  iconColor?: 'light' | 'dark'
  // 'md' (default) for the top toolbar; 'sm' for tight rows like the left-panel
  // create actions, where several buttons must share a narrow column.
  size?: 'sm' | 'md'
}

function ToolbarButton({
  label,
  icon,
  iconPosition = 'left',
  onClick,
  bgColor = '#000000',
  textColor = '#ffffff',
  iconColor = 'light',
  size = 'md'
}: ToolbarButtonProps): React.JSX.Element {
  // 'light' → force icon white (good on dark bg).
  // 'dark'  → force icon black (good on light bg).
  const iconFilter =
    iconColor === 'dark'
      ? '[filter:brightness(0)]'
      : '[filter:brightness(0)_invert(1)]'

  const sm = size === 'sm'
  const iconEl = (
    <img
      src={icon}
      alt=""
      aria-hidden="true"
      className={`${sm ? 'h-3.5 w-3.5' : 'h-4 w-4'} shrink-0 object-contain opacity-90 ${iconFilter}`}
    />
  )

  // Compact size trims the horizontal padding and gap so labelled buttons pack
  // into a narrow column without wrapping.
  const gap = sm ? 'gap-1' : 'gap-1.5'
  const paddingX = sm
    ? iconPosition === 'right'
      ? 'pl-2 pr-2.5'
      : 'pl-2 pr-2'
    : iconPosition === 'right'
      ? 'pl-3 pr-4'
      : 'pl-3 pr-3'

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ backgroundColor: bgColor, color: textColor }}
      className={`flex items-center ${gap} rounded-md border border-app-border ${paddingX} py-1.5 text-xs transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400`}
    >
      {iconPosition === 'left' && iconEl}
      <span>{label}</span>
      {iconPosition === 'right' && iconEl}
    </button>
  )
}

export default ToolbarButton
