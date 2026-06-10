import addIcon from '@renderer/assets/add.svg'
import searchIcon from '@renderer/assets/search.svg'
import ActionButton from '@renderer/components/ActionButton'
import SearchBar from '@renderer/components/SearchBar'
import React from 'react'

// Materials feature section rendered inside the LeftPanel's Materials
// accordion. Mirrors the Geometry section: a create-action row plus a
// "Saved Materials" search. The Redux slice (saved-materials list, selection,
// search, async load) and the add flow land next.
export function Materials(): React.JSX.Element {
  // Stub for now — dispatches the add-material flow once the slice is in.
  const onAddMaterials = (): void => {}

  // Local search state for now; moves to the materials slice (client-side
  // filter selector) once the saved-materials list is wired.
  const [query, setQuery] = React.useState('')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <ActionButton label="Add Materials" icon={addIcon} onClick={onAddMaterials} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 font-['Geist'] text-[12px] font-normal leading-[15px] tracking-normal text-[#D3D3D3]">
          Saved Materials
        </span>
        <SearchBar
          ariaLabel="Search saved materials"
          icon={searchIcon}
          value={query}
          onChange={setQuery}
          placeholder="Search..."
          className="w-[125px]"
          inputClassName="h-5 text-[12px] bg-[#121212] placeholder:text-[#424242]"
          iconClassName="h-3 w-3 opacity-70"
          iconBgClassName="w-6 bg-[#424242]"
        />
      </div>

      {/* Saved Materials list — next step */}
    </div>
  )
}

export default Materials
