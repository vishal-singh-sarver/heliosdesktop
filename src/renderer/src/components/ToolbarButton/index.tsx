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
  // create actions, where several buttons must share a narrow column; 'xs' packs
  // 'sm' into a fixed 24px height, to sit level with the h-6 icon buttons it
  // shares a row with (the material Properties header's pencil and trash).
  size?: 'sm' | 'md' | 'xs'
  disabled?: boolean
  // Native tooltip — used to explain WHY a disabled button can't be pressed.
  title?: string
  // Overrides the accessible name when the visible label is shorter than the
  // action it performs (e.g. a "Material Type" pill that adds a material type).
  ariaLabel?: string
  className?: string
}

function ToolbarButton({
  label,
  icon,
  iconPosition = 'left',
  onClick,
  bgColor = '#000000',
  textColor = '#ffffff',
  iconColor = 'light',
  size = 'md',
  disabled = false,
  title,
  ariaLabel,
  className = ''
}: ToolbarButtonProps): React.JSX.Element {
  // 'light' → force icon white (good on dark bg).
  // 'dark'  → force icon black (good on light bg).
  const iconFilter =
    iconColor === 'dark'
      ? '[filter:brightness(0)]'
      : '[filter:brightness(0)_invert(1)]'

  // 'xs' is 'sm' with its height pinned rather than left to the padding.
  const sm = size === 'sm' || size === 'xs'
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
  // Every other size takes its height from the padding; 'xs' states it outright
  // so it matches the icon buttons beside it exactly. The two are exclusive, so
  // neither has to out-specify the other.
  const height = size === 'xs' ? 'h-6 py-0' : 'py-1.5'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{ backgroundColor: bgColor, color: textColor }}
      className={`flex items-center ${gap} rounded-md border border-app-border ${paddingX} ${height} text-xs transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40 ${className}`.trim()}
    >
      {iconPosition === 'left' && iconEl}
      <span>{label}</span>
      {iconPosition === 'right' && iconEl}
    </button>
  )
}

export default ToolbarButton
