import addIcon from '@renderer/assets/add.svg'
import searchIcon from '@renderer/assets/search.svg'
import uploadIcon from '@renderer/assets/Upload.svg'
import ActionButton from '@renderer/components/ActionButton'
import SearchBar from '@renderer/components/SearchBar'
import React from 'react'

// Geometry feature section rendered inside the LeftPanel's Geometry accordion.
// The create-action row is wired here; the Redux slice (saved-geometries tree,
// selection, search, async load) and the actual create flows land next.
export function Geometry(): React.JSX.Element {
  // Stubs for now — these dispatch their respective flows once the slice is in.
  const onAddCrop = (): void => {}
  const onAddGround = (): void => {}
  const onImportFromFile = (): void => {}

  // Local search state for now; moves to the geometry slice (client-side
  // filter selector) once the saved-geometries tree is wired.
  const [query, setQuery] = React.useState('')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <ActionButton label="Crop" icon={addIcon} onClick={onAddCrop} />
        <ActionButton label="Ground" icon={addIcon} onClick={onAddGround} />
        <ActionButton label="Import from File" icon={uploadIcon} onClick={onImportFromFile} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 font-['Geist'] text-[12px] font-normal leading-[15px] tracking-normal text-[#D3D3D3]">
          Saved Geometries
        </span>
        <SearchBar
          ariaLabel="Search saved geometries"
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

      {/* Saved Geometries tree — next step */}
    </div>
  )
}

export default Geometry
