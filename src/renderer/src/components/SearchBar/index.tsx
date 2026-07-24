import React from 'react'

interface SearchBarProps {
  ariaLabel: string
  icon: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

function SearchBar({
  ariaLabel,
  icon,
  value,
  placeholder,
  onChange
}: SearchBarProps): React.JSX.Element {
  return (
    <div className="relative w-56">
      <img
        src={icon}
        alt=""
        className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-70"
      />
      <input
        data-testid="searchbar"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded border border-app-border bg-dark pl-8 pr-3 text-sm text-neutral-200 outline-none focus:border-neutral-500"
      />
    </div>
  )
}

export default SearchBar
