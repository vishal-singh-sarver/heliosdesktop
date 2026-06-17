import chevronDown from '@renderer/assets/ChevronDownIcon.svg'
import React from 'react'

interface AccordionProps {
  title: string
  open: boolean
  onToggle: () => void
  children?: React.ReactNode
  // Optional leading icon (e.g. the ⊕ next to "Geometry" in the mockup).
  icon?: string
  // When true the open section grows to share the available height equally
  // with its open siblings (flex-1); when false it shrinks to its content.
  // The parent passes `grow={open}` so closed sections collapse to the header.
  grow?: boolean
}

// Pure presentational collapsible shell. Controlled — the parent owns `open`
// so it can distribute height across sibling accordions. The chevron points
// down when closed and rotates to point up when open.
function Accordion({
  title,
  open,
  onToggle,
  children,
  icon,
  grow = false
}: AccordionProps): React.JSX.Element {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-lg bg-[#313131] ${
        open && grow ? 'flex-1' : 'flex-none'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex shrink-0 items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-[13px] font-normal leading-[15px] tracking-normal text-neutral-200">
          {icon && <img src={icon} alt="" aria-hidden="true" className="h-3.5 w-auto shrink-0" />}
          {title}
        </span>
        <img
          src={chevronDown}
          alt=""
          aria-hidden="true"
          className="h-1.5 w-auto transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <>
          <div className="shrink-0 border-t border-app-border" />
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3">{children}</div>
        </>
      )}
    </section>
  )
}

export default Accordion
