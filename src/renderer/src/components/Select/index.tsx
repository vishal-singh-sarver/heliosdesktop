import checkIcon from '@renderer/assets/CheckIcon.svg'
import chevronDown from '@renderer/assets/ChevronDownIcon.svg'
import React from 'react'

// The app's dropdown, replacing the native <select> everywhere.
//
// Why not a native <select>: the OS draws its popup anchored to the CURRENTLY
// SELECTED option, so the list jumps upward as soon as anything but the first
// entry is chosen. None of that is ours to style. Here the list is pinned with
// `top-full`, so it always hangs directly below the control.
//
// Two control shapes, one list and one state machine:
//   • searchable  — a text input you type into to filter, with the chevron as a
//                   separate toggle button (the material-type picker).
//   • plain       — a button showing the selected label (FormField's enums).

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  options: readonly SelectOption[]
  value: string
  placeholder: string
  onChange: (value: string) => void
  id?: string
  name?: string
  ariaLabel?: string
  disabled?: boolean
  // Type-to-filter. Off by default: short enum lists don't need it, and the
  // input-shaped control behaves differently enough to be opt-in.
  searchable?: boolean
  // Values listed but not selectable (e.g. a material type another card owns).
  disabledValues?: Set<string>
  // Prepend a row that clears the field — the empty <option> a native select
  // carried. FormField needs it; the type picker never had one.
  clearable?: boolean
  // Show a tick against the selected row.
  showTick?: boolean
  invalid?: boolean
  describedBy?: string
  // The control's own classes, so each caller keeps its existing look.
  className?: string
  // Appended to the list container — callers differ on background colour.
  listClassName?: string
  onBlur?: () => void
  onFocus?: () => void
}

export default function Select({
  options,
  value,
  placeholder,
  onChange,
  id,
  name,
  ariaLabel,
  disabled = false,
  searchable = false,
  disabledValues,
  clearable = false,
  showTick = false,
  invalid = false,
  describedBy,
  className = '',
  listClassName = '',
  onBlur,
  onFocus
}: SelectProps): React.JSX.Element {
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listId = React.useId()

  // The clear row and the real options share one index space, so the keyboard
  // walk and the rendering agree.
  const rows = React.useMemo<SelectOption[]>(
    () => (clearable ? [{ value: '', label: placeholder }, ...options] : [...options]),
    [clearable, options, placeholder]
  )
  const selected = rows.find((o) => o.value === value && o.value !== '') ?? null

  const q = searchable ? query.trim().toLowerCase() : ''
  const filtered = q === '' ? rows : rows.filter((o) => o.label.toLowerCase().includes(q))

  const isTaken = (opt: SelectOption): boolean => disabledValues?.has(opt.value) ?? false

  // Open from a closed state with a fresh (empty) query, so the full list shows;
  // no-op if already open, so clicking to reposition the caret keeps the text.
  // Highlight starts on the current selection rather than the top of the list.
  const openList = (): void => {
    if (disabled) return
    if (open) return
    const at = filtered.findIndex((o) => o.value === value)
    setQuery('')
    setHighlight(at >= 0 ? at : 0)
    setOpen(true)
  }

  // The chevron is a real toggle: it both opens AND closes the list. (A
  // searchable control's input only ever opens, so clicking into the text to
  // reposition the caret doesn't dismiss the list mid-typing.) Opening also
  // focuses the input, since the chevron suppresses the focus itself.
  const toggleList = (): void => {
    if (disabled) return
    if (open) {
      setOpen(false)
    } else {
      openList()
      if (searchable) inputRef.current?.focus()
    }
  }

  const commit = (opt: SelectOption | undefined): void => {
    if (!opt || isTaken(opt)) return
    onChange(opt.value)
    setOpen(false)
  }

  // Arrow keys walk past the taken options rather than landing on them.
  const nextSelectable = (from: number, step: 1 | -1): number => {
    for (let i = from; i >= 0 && i < filtered.length; i += step) {
      if (!isTaken(filtered[i])) return i
    }
    return highlight
  }

  // Close on an outside click and report the blur — the field is only "left"
  // once the list is dismissed, so validation fires when it used to.
  React.useEffect(() => {
    if (!open) return undefined
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        onBlur?.()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onBlur])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      // Opening from closed goes through openList, like every other way in — it
      // resets the query. Calling setOpen directly left the last search text in
      // place, so after committing a pick with Enter (or dismissing with Escape),
      // which both close WITHOUT clearing it, the next ArrowDown replaced the
      // selected label with that stale text and re-filtered the list to it.
      if (!open) {
        openList()
        return
      }
      setHighlight((h) => nextSelectable(Math.min(h + 1, filtered.length - 1), 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        openList()
        return
      }
      setHighlight((h) => nextSelectable(Math.max(h - 1, 0), -1))
    } else if (e.key === 'Home') {
      if (!open) return
      e.preventDefault()
      setHighlight(nextSelectable(0, 1))
    } else if (e.key === 'End') {
      if (!open) return
      e.preventDefault()
      setHighlight(nextSelectable(filtered.length - 1, -1))
    } else if (e.key === 'Enter') {
      const opt = filtered[highlight]
      if (open && opt && !isTaken(opt)) {
        e.preventDefault()
        commit(opt)
      }
    } else if (e.key === ' ' && !searchable) {
      // Space picks on a button control; in a search box it's a literal space.
      e.preventDefault()
      if (open) commit(filtered[highlight])
      else openList()
    } else if (e.key === 'Escape') {
      if (!open) return
      setOpen(false)
    }
  }

  // Focus leaving the control closes the list and reports the blur — but moving
  // between the control and its own list must not.
  const handleBlur = (e: React.FocusEvent): void => {
    if (rootRef.current?.contains(e.relatedTarget as Node)) return
    setOpen(false)
    onBlur?.()
  }

  return (
    <div ref={rootRef} className="relative">
      {searchable ? (
        <>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            id={id}
            name={name}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            value={open ? query : (selected?.label ?? '')}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              setHighlight(0)
            }}
            onFocus={() => {
              openList()
              onFocus?.()
            }}
            onClick={openList}
            onKeyDown={onKeyDown}
            onBlur={handleBlur}
            className={className}
          />
          {/* The chevron is its own button, not an overlay image: as a bare image
              it sat on top of the text input, so it showed the input's text
              (I-beam) cursor and its click fell through to the input — which only
              ever opens the list. As a button it toggles, and shows the pointer. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            // Keep the click from blurring/refocusing the input, which would
            // re-open the list via onFocus right after we closed it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleList}
            className="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center disabled:cursor-not-allowed"
          >
            <img
              src={chevronDown}
              alt=""
              aria-hidden="true"
              className="h-1.5 w-auto transition-transform duration-150"
              style={{ transform: open ? 'rotate(180deg)' : 'none' }}
            />
          </button>
        </>
      ) : (
        <button
          type="button"
          id={id}
          name={name}
          role="combobox"
          aria-controls={listId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={handleBlur}
          className={`${className} flex items-center justify-between gap-2 text-left`}
        >
          <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
          <img
            src={chevronDown}
            alt=""
            aria-hidden="true"
            className="h-1.5 w-auto shrink-0 transition-transform duration-150"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </button>
      )}

      {open && filtered.length > 0 && (
        // `top-full` is the point: the list is pinned to the control's bottom
        // edge, so it never shifts with the selection the way a native popup did.
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel ?? name}
          className={`scrollbar-custom-thin absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded border border-app-border py-1 shadow-lg ${listClassName}`}
        >
          {filtered.map((opt, i) => {
            // Already used elsewhere: still listed (so the user can see it
            // exists) but greyed out and unselectable.
            const taken = isTaken(opt)
            return (
              <button
                key={opt.value || '__clear__'}
                type="button"
                role="option"
                disabled={taken}
                aria-selected={opt.value === value}
                onMouseEnter={() => {
                  if (!taken) setHighlight(i)
                }}
                // mousedown would blur the control before the click lands,
                // closing the list out from under the pick.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(opt)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  taken
                    ? 'cursor-not-allowed text-neutral-600'
                    : `text-white hover:bg-neutral-700/50 ${
                        i === highlight ? 'bg-neutral-700/50' : ''
                      }`
                }`}
              >
                {/* Fixed-width slot, reserved on every row so ticking one never
                    shifts any label. */}
                {showTick && (
                  <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                    {opt.value === value && (
                      <img src={checkIcon} alt="" aria-hidden="true" className="w-3" />
                    )}
                  </span>
                )}
                <span className="min-w-0 truncate">{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
