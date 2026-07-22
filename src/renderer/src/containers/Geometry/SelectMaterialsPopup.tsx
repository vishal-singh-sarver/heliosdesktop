import addWhiteIcon from '@renderer/assets/add_white.svg'
import searchIcon from '@renderer/assets/search.svg'
import SearchBar from '@renderer/components/SearchBar'
import React from 'react'

// A material row: the library id + name plus whether it's currently assigned to
// the ground (checked). The parent owns the checked state (it lives in the draft).
export interface SelectMaterialsItem {
  id: string
  name: string
  checked: boolean
}

interface SelectMaterialsPopupProps {
  // Selectable library materials (already filtered to exclude the ones saved on
  // the ground). Each carries its checked state.
  materials: SelectMaterialsItem[]
  // Toggling a row: `checked` is the NEW state — true adds the material to the
  // Materials section, false removes it. The parent dispatches add/remove.
  onToggleMaterial: (material: { id: string; name: string }, checked: boolean) => void
  // "+ Add New Material" — dummy for now.
  onAddNewMaterial: () => void
}

// The "Select Materials" popup. 240×343, 8px radius, #313131. A search field
// filters the list by name; each material is a checkbox row (blue when checked).
// When the library has no selectable materials it shows the empty state.
export default function SelectMaterialsPopup({
  materials,
  onToggleMaterial,
  onAddNewMaterial
}: SelectMaterialsPopupProps): React.JSX.Element {
  const [query, setQuery] = React.useState('')

  // Case-insensitive name filter. The empty state below keys off the full list
  // (materials), so a no-match search just shows an empty list, not "no records".
  const q = query.trim().toLowerCase()
  const visible = q ? materials.filter((m) => m.name.toLowerCase().includes(q)) : materials

  return (
    <div className="flex h-[343px] w-[240px] flex-col overflow-hidden rounded-[8px] bg-[#313131]">
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

          {/* Checkbox list — click a row to toggle. aria-pressed carries the
              checked state; the blue box + tick is the checked visual. */}
          <div className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto py-1">
            {visible.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={m.checked}
                onClick={() => onToggleMaterial({ id: m.id, name: m.name }, !m.checked)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] leading-[18px] text-white hover:bg-white/5"
              >
                <span className="min-w-0 truncate">{m.name}</span>
                {m.checked ? (
                  // Layered checked box: blue outer border → even 1px gap (popup
                  // bg shows through) → blue inner square with a dark checkmark
                  // punched out. All integers so the gap snaps evenly on every
                  // side: 19 − 2×2px border − 13px inner, /2 = 1px.
                  <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border-2 border-[#245AC5]">
                    <span className="flex h-[13px] w-[13px] items-center justify-center rounded-[3px] bg-[#245AC5]">
                      <svg viewBox="0 0 12 11" aria-hidden="true" className="h-[7px] w-[7px]">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M10.7464 0.274437L3.58641 7.18444L1.68641 5.15444C1.33641 4.82444 0.786406 4.80444 0.386406 5.08444C-0.00359413 5.37444 -0.113594 5.88444 0.126406 6.29444L2.37641 9.95444C2.59641 10.2944 2.97641 10.5044 3.40641 10.5044C3.81641 10.5044 4.20641 10.2944 4.42641 9.95444C4.78641 9.48444 11.6564 1.29444 11.6564 1.29444C12.5564 0.374437 11.4664 -0.435563 10.7464 0.264437V0.274437Z"
                          fill="#313131"
                        />
                      </svg>
                    </span>
                  </span>
                ) : (
                  <span className="h-[19px] w-[19px] shrink-0 rounded-[5px] border border-[#6b6b6b]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
