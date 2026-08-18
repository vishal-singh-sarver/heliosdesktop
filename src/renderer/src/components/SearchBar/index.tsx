import React from 'react'

interface SearchBarProps {
  ariaLabel: string
  icon: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  // Override the container width/layout. Defaults to a fixed `w-56`; callers in
  // tight panels can pass e.g. `w-[125px]` or `flex-1`.
  className?: string
  // Input sizing/colours (height, text size, background, placeholder colour).
  // Defaults to `h-8 text-sm`. The leading icon is a separate flex cell, so no
  // left padding is needed here.
  inputClassName?: string
  // Leading glyph size/opacity. Default `h-4 w-4 opacity-70`.
  iconClassName?: string
  // The grey icon cell (width + background). Full-height by virtue of the flex
  // row, so it always matches the bar height. Default `w-8 bg-[#424242]`;
  // shared by every search bar in the app — pass `w-6` for compact panels.
  iconBgClassName?: string
}

// Single bordered flex row: [icon cell][input]. Keeping the icon as a real
// flex cell (rather than an absolute overlay) means its height always equals
// the bar's, and the focus highlight lives on the whole container — not just
// the input — via `focus-within`. The input's own focus outline is suppressed
// so it doesn't get clipped by the container's rounded corners.
function SearchBar({
  ariaLabel,
  icon,
  value,
  placeholder,
  onChange,
  className = 'w-56',
  inputClassName = 'h-8 text-sm',
  iconClassName = 'h-4 w-4 opacity-70',
  iconBgClassName = 'w-8 bg-[#424242]'
}: SearchBarProps): React.JSX.Element {
  return (
    <div
      className={`flex items-stretch overflow-hidden rounded border border-app-border focus-within:border-[#245AC5] ${className}`}
    >
      <span className={`flex shrink-0 items-center justify-center ${iconBgClassName}`}>
        <img src={icon} alt="" aria-hidden="true" className={iconClassName} />
      </span>
      <input
        data-testid="searchbar"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`min-w-0 flex-1 border-0 bg-dark px-2 text-neutral-200 outline-none focus-visible:outline-none ${inputClassName}`}
      />
    </div>
  )
}

export default SearchBar
