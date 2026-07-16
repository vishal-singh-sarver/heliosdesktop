import addWhiteIcon from '@renderer/assets/add_white.svg'
import searchIcon from '@renderer/assets/search.svg'
import React from 'react'

interface SelectMaterialsPopupProps {
  // Saved-library materials to list (just id + name for now).
  materials: { id: string; name: string }[]
  // Clicking a row picks that material (client-side for now — no backend yet).
  onSelectMaterial: (material: { id: string; name: string }) => void
  // "+ Add New Material" — dummy for now.
  onAddNewMaterial: () => void
}

// The "Select Materials" popup. 240×343, 8px radius, #313131. When the library
// has materials it lists their names; otherwise it shows the empty state. The
// search icon is the same asset the SearchBar uses.
export default function SelectMaterialsPopup({
  materials,
  onSelectMaterial,
  onAddNewMaterial
}: SelectMaterialsPopupProps): React.JSX.Element {
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
        /* Name list (no checkboxes yet — click a name to pick it) */
        <div className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto py-1">
          {materials.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMaterial(m)}
              className="block w-full truncate px-4 py-3 text-left text-[15px] leading-[18px] text-white hover:bg-white/5"
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
