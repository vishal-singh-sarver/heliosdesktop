import addWhiteIcon from '@renderer/assets/add_white.svg'
import searchIcon from '@renderer/assets/search.svg'
import React from 'react'

interface SelectMaterialsPopupProps {
  // "+ Add New Material" — dummy for now.
  onAddNewMaterial: () => void
}

// The "Select Materials" popup. Empty state for now: a magnifier, "No Material
// Found" copy, and a "+ Add New Material" action. 240×343, 8px radius, #313131.
// The search icon is the same asset the SearchBar uses.
export default function SelectMaterialsPopup({
  onAddNewMaterial
}: SelectMaterialsPopupProps): React.JSX.Element {
  return (
    <div className="flex h-[343px] w-[240px] flex-col overflow-hidden rounded-[8px] bg-[#313131]">
      {/* Header */}
      <div className="shrink-0 border-b border-app-border px-4 py-3">
        <p className="text-[13px] font-normal leading-[15px] text-neutral-300">Select Materials</p>
      </div>

      {/* Empty state */}
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
    </div>
  )
}
