import checkIcon from '@renderer/assets/CheckIcon.svg'
import chevronDown from '@renderer/assets/ChevronDownIcon.svg'
import React from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, type AnchorRect } from 'utils/useAnchoredPosition'

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

// Distance from the control to the list, its clearance from the window edges, and
// the tallest it may get before scrolling internally. The max is also capped by
// the room on whichever side it opens, so it never runs off the screen.
const LIST_GAP = 4
const LIST_PADDING = 8
const LIST_MAX_HEIGHT = 240
// Far enough out that an unplaced list is never seen, while staying in the DOM
// (and the accessibility tree) so it can be read and clicked.
const OFFSCREEN = -9999

// True when a press landed on an element's scrollbar rather than its content.
// `clientWidth`/`clientHeight` exclude the scrollbars, so a coordinate past that
// edge but still inside the border box is the gutter — the only way to tell,
// since a scrollbar is not an element and cannot be hit-tested.
function isScrollbarPress(e: MouseEvent): boolean {
  const el = e.target
  if (!(el instanceof HTMLElement)) return false
  const rect = el.getBoundingClientRect()
  return e.clientX > rect.left + el.clientWidth || e.clientY > rect.top + el.clientHeight
}

// The nearest ancestor that can actually scroll — the panel a control sits in.
// `document.scrollingElement` is the last resort so a control on an unscrolled
// page still works.
function scrollableAncestorOf(el: HTMLElement): Element | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const { overflowY } = window.getComputedStyle(node)
    const scrollable = overflowY === 'auto' || overflowY === 'scroll'
    if (scrollable && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return document.scrollingElement
}

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
  // The list lives in a portal (see below), so it is NOT inside rootRef — every
  // "did this happen inside the control?" check has to consult it separately.
  const listElRef = React.useRef<HTMLElement | null>(null)
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

  // ── Where the list is drawn ────────────────────────────────────────────────
  //
  // In a PORTAL, positioned against the control, rather than absolutely inside
  // it. An absolute list is clipped by any scrolling ancestor, and this control
  // lives inside two of them (the Material Type cards list and the right panel).
  // A card low in that list opened its options inside the clip region, where they
  // could not be seen — and scrolling to reach them moved the control by the same
  // amount, so they never came into view.
  //
  // The hook re-measures on ancestor scroll, so the list stays glued to the
  // control as the panel scrolls under it.
  const listOpen = open && filtered.length > 0
  const getAnchorRect = React.useCallback((): AnchorRect | null => {
    const el = rootRef.current
    if (!el) return null
    const { top, left, width, height } = el.getBoundingClientRect()
    return { top, left, width, height }
  }, [])
  const { floatingRef, measurement } = useAnchoredPosition({
    open: listOpen,
    getAnchorRect,
    placement: 'bottom-start',
    gap: LIST_GAP,
    padding: LIST_PADDING
  })
  const setListEl = React.useCallback(
    (el: HTMLElement | null): void => {
      listElRef.current = el
      floatingRef(el)
    },
    [floatingRef]
  )

  // A list opening near the bottom of a panel has only a sliver of room, so it is
  // capped to that and shows a couple of rows behind its own scrollbar. On the
  // LAST card there is no way out of that: the panel is already at its scroll end,
  // so the outer scrollbar has nowhere to travel and the list can never be brought
  // into view.
  //
  // The panel is therefore given that much extra room at the bottom while the list
  // is open — enough for its scrollbar to move. It does NOT scroll on the user's
  // behalf: they scroll as much or as little as they want, the list follows its
  // control (the hook re-measures on scroll), and it grows as room opens up
  // beneath it. The borrowed space is handed back the moment the list closes.
  //
  // Runs once per open. `scrollHeight` is read rather than the rendered height
  // because the rendered one is already capped — it would under-report how much
  // room is missing.
  React.useEffect(() => {
    if (!listOpen) return
    const anchor = rootRef.current
    const list = listElRef.current
    if (!anchor || !list) return

    const wanted = Math.min(LIST_MAX_HEIGHT, list.scrollHeight)
    const bottom = anchor.getBoundingClientRect().bottom + LIST_GAP + wanted
    const shortfall = bottom - (window.innerHeight - LIST_PADDING)
    if (shortfall <= 0) return

    const panel = scrollableAncestorOf(anchor)
    if (!(panel instanceof HTMLElement)) return

    // What the panel can still scroll through on its own. If that already covers
    // the shortfall, the scrollbar can reach it — nothing to add.
    const remaining = panel.scrollHeight - panel.clientHeight - panel.scrollTop
    if (remaining >= shortfall) return

    const previousPadding = panel.style.paddingBottom
    const existing = parseFloat(window.getComputedStyle(panel).paddingBottom) || 0
    panel.style.paddingBottom = `${existing + (shortfall - remaining)}px`

    // Give the panel its shape back on close. Wherever the user scrolled to is
    // clamped by the browser as the content shrinks, so they are left looking at
    // real content rather than the blank space we borrowed.
    return () => {
      panel.style.paddingBottom = previousPadding
    }
    // Keyed on `listOpen` alone: re-running on every render would fight the user's
    // own scrolling.
  }, [listOpen])

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
      const target = e.target as Node
      // The list is portalled to <body>, so a press on an option is NOT inside
      // rootRef. Without the second check every option click read as an outside
      // press and closed the list before the click could land on it.
      if (rootRef.current?.contains(target) || listElRef.current?.contains(target)) return
      // Grabbing a SCROLLBAR is not leaving the field. The press lands on the
      // scrolling element, which is outside the control, so without this the list
      // shut the instant the panel's scrollbar was dragged — the one gesture a
      // user makes to bring the rest of the options into view.
      if (isScrollbarPress(e)) return
      setOpen(false)
      onBlur?.()
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
    const next = e.relatedTarget as Node | null
    if (rootRef.current?.contains(next) || listElRef.current?.contains(next)) return
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

      {listOpen &&
        createPortal(
          // Portalled to <body> and positioned against the control, so no
          // scrolling ancestor can clip it. Pinned to the control's bottom edge —
          // it never shifts with the selection the way a native popup did.
          //
          // Parked OFF-SCREEN until the first measurement lands (one pre-paint
          // pass), so it can't flash at the top-left corner on the way in. Off
          // screen rather than `visibility: hidden` on purpose: hiding it would
          // pull it out of the accessibility tree, and it is an open listbox — a
          // screen reader should find it, and so should a test.
          //
          // Width matches the control; height is capped by the room actually
          // below it, so the list can never run off the bottom of the window.
          <div
            ref={setListEl}
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? name}
            style={{
              position: 'fixed',
              top: measurement?.position?.top ?? OFFSCREEN,
              left: measurement?.position?.left ?? OFFSCREEN,
              width: measurement?.anchorRect.width,
              maxHeight: Math.min(LIST_MAX_HEIGHT, measurement?.available.height ?? LIST_MAX_HEIGHT)
            }}
            className={`scrollbar-custom-thin z-30 overflow-y-auto rounded border border-app-border py-1 shadow-lg ${listClassName}`}
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
          </div>,
          document.body
        )}
    </div>
  )
}
