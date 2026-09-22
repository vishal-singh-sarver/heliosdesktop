import addWhiteIcon from '@renderer/assets/add_white.svg'
import checkIcon from '@renderer/assets/CheckIcon.svg'
import searchIcon from '@renderer/assets/search.svg'
import SearchBar from '@renderer/components/SearchBar'
import materialMessages from 'containers/Materials/messages'
import React from 'react'
import { showFullTextOnHover } from 'utils/truncationTooltip'

// A material row: the library id + name plus whether it's the one currently on
// the ground (selected). The parent owns the selected state (it lives in the
// draft).
export interface SelectMaterialsItem {
  id: string
  name: string
  selected: boolean
}

interface SelectMaterialsPopupProps {
  // The full library — including the material already saved on the ground, which
  // is what carries the tick. Each row carries its own selected state.
  materials: SelectMaterialsItem[]
  // Picking a row. A ground holds ONE material, so this replaces whatever was
  // selected rather than adding to it. Fires for EVERY row click, including the
  // already-selected one — the popup stays a dumb list and the parent, which
  // owns the draft, decides what a click means (replace, confirm, or report that
  // the material is already assigned).
  onSelectMaterial: (material: { id: string; name: string }) => void
  // "+ Add New Material", from the empty state below — the parent creates the
  // material and opens it in the right-panel Properties form, the same as the
  // left panel's +Add Materials.
  onAddNewMaterial: () => void
  // Cap from the surrounding AnchoredPopup: the room left beside the panel. A
  // short window shrinks the popup instead of pushing it past the viewport edge;
  // the list below scrolls to absorb the difference. Standalone (or whenever
  // there's room), the popup keeps its designed DEFAULT_HEIGHT.
  maxHeight?: number
}

// The Figma height. Also the cap — `maxHeight` only ever shrinks the popup, so a
// tall window doesn't stretch it past its designed size.
const DEFAULT_HEIGHT = 343

// The "Select Materials" popup. 240 wide × DEFAULT_HEIGHT (shrinking to fit a
// short window), 8px radius, #202020 — the same body colour as the read-only
// material properties popup it sits beside, so the two read as one surface.
// A search field filters the list by name;
// the list is a RADIO group — a ground carries a single material, so the one
// currently on it shows a blue tick at the left and picking another replaces it.
// When the library is empty it shows the empty state.
export default function SelectMaterialsPopup({
  materials,
  onSelectMaterial,
  onAddNewMaterial,
  maxHeight
}: SelectMaterialsPopupProps): React.JSX.Element {
  const [query, setQuery] = React.useState('')

  // Case-insensitive name filter. The big empty state below keys off the FULL
  // list (materials) — an empty library is "add one", which a no-match search is
  // not; that one gets the plain "no matches" line inside the list instead.
  const q = query.trim().toLowerCase()
  const visible = q ? materials.filter((m) => m.name.toLowerCase().includes(q)) : materials

  return (
    <div
      style={{ height: Math.min(DEFAULT_HEIGHT, maxHeight ?? DEFAULT_HEIGHT) }}
      className="flex w-[240px] flex-col overflow-hidden rounded-[8px] bg-[#202020]"
    >
      {/* Header */}
      <div className="shrink-0 border-b border-app-border px-4 py-3">
        <p className="text-[13px] font-normal leading-[15px] text-neutral-300">Select Materials</p>
      </div>

      {materials.length === 0 ? (
        /* Empty state */
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-app-border">
            <img src={searchIcon} alt="" aria-hidden="true" className="h-5 w-5 opacity-80" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold leading-tight text-white">No Material Found</p>
            <p className="text-sm text-neutral-300">No Record Found. Please add a new Material.</p>
          </div>
          <button
            type="button"
            onClick={onAddNewMaterial}
            className="mt-1 flex items-center gap-2 rounded-md bg-[#245AC5] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <img src={addWhiteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
            Add New Material
          </button>
        </div>
      ) : (
        <>
          {/* Search — reuses the shared SearchBar + search glyph. */}
          <div className="shrink-0 px-4 py-3">
            <SearchBar
              ariaLabel="Search materials"
              icon={searchIcon}
              value={query}
              onChange={setQuery}
              placeholder="Search..."
              className="w-full"
              inputClassName="h-8 text-[13px] bg-[#121212] placeholder:text-[#424242]"
              iconClassName="h-3.5 w-3.5 opacity-70"
              iconBgClassName="w-8 bg-[#424242]"
            />
          </div>

          {/* A search that matches nothing — the library itself is not empty, so
              this replaces the rows rather than the whole popup. Outside the
              radiogroup below: a group whose only child is a paragraph would be
              announced as an empty set of choices. */}
          {visible.length === 0 ? (
            <p className="min-h-0 flex-1 px-4 py-2 text-[13px]" style={{ color: '#7D7D7D' }}>
              {materialMessages.noMatches}
            </p>
          ) : (
            /* Radio list — click a row to make it THE material on the ground. The
               tick slot leads each row so the names line up; aria-checked carries
               the state to assistive tech. The horizontal padding is what gives
               each row's focus outline room to sit inside the popup instead of
               running flush to its edges. */
            <div
              role="radiogroup"
              aria-label="Select Materials"
              className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto px-2 py-1"
            >
              {visible.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={m.selected}
                  // Every click reports up, the selected row included — the parent
                  // answers a re-click with "already assigned" rather than the row
                  // swallowing it silently. It never toggles off: the ground always
                  // carries exactly one material, and clearing it is the trash
                  // icon's job, back in the Materials section.
                  onClick={() => onSelectMaterial({ id: m.id, name: m.name })}
                  // Keyboard focus reads as a rounded, inset, blue-bordered row —
                  // the same cue a selected row gets in the left-hand geometry tree
                  // (see TreeRow). The border is always present and transparent when
                  // unfocused, so focusing never shifts the row's contents.
                  className="flex w-full items-center gap-2 rounded border border-transparent px-2 py-3 text-left text-[15px] leading-[18px] text-white hover:bg-white/5 focus:outline-none focus-visible:border-[#245AC5] focus-visible:bg-[#2a2a2a]"
                >
                  {/* Fixed-width slot: reserved whether or not this row is the
                    selected one, so ticking a row never shifts any label. Same
                    white tick asset the FormField dropdowns use. */}
                  <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                    {m.selected && (
                      <img src={checkIcon} alt="" aria-hidden="true" className="w-3" />
                    )}
                  </span>
                  <span className="min-w-0 truncate" onMouseEnter={showFullTextOnHover}>
                    {m.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
