import addIcon from '@renderer/assets/add.svg'
import searchIcon from '@renderer/assets/search.svg'
import SearchBar from '@renderer/components/SearchBar'
import ToolbarButton from '@renderer/components/ToolbarButton'
import { selectActiveProjectId } from 'containers/ProjectScreen/selectors'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import { addLocalMaterial, listMaterialsRequested, setSearchQuery } from './actions'
import MaterialRow from './MaterialRow'
import messages from './messages'
import reducer from './reducer'
import saga from './saga'
import {
  selectLoadError,
  selectLoadStatus,
  selectMaterialNamesLower,
  selectNameErrors,
  selectNextMaterialName,
  selectSearchQuery,
  selectSelectedId,
  selectVisibleMaterials
} from './selectors'

// Materials feature section rendered inside the LeftPanel's Materials accordion.
// The Saved Materials list is loaded from the persisted project library (§7.2).
// +Add Materials appends an unsaved, client-only Material.NNN placeholder; the
// real create (right-panel form → POST §7.1) lands later, so an unsaved row
// disappears on the next list refresh.
export function Materials(): React.JSX.Element {
  useInjectReducer({ key: 'materials', reducer: reducer as Reducer })
  useInjectSaga({ key: 'materials', saga })

  const dispatch = useDispatch()
  const projectId = useSelector(selectActiveProjectId)
  const materials = useSelector(selectVisibleMaterials)
  const selectedId = useSelector(selectSelectedId)
  const nextName = useSelector(selectNextMaterialName)
  const query = useSelector(selectSearchQuery)
  const loadStatus = useSelector(selectLoadStatus)
  const loadError = useSelector(selectLoadError)
  const namesLower = useSelector(selectMaterialNamesLower)
  const nameErrors = useSelector(selectNameErrors)

  // Load the persisted library whenever the active project changes. We dispatch
  // and let the saga own the fetch (never call the service from a component).
  React.useEffect(() => {
    if (projectId) dispatch(listMaterialsRequested(projectId))
  }, [projectId, dispatch])

  // +Add Materials appends a client-only Material.NNN placeholder (not persisted
  // until the create-form flow saves it).
  const onAddMaterials = (): void => {
    dispatch(addLocalMaterial(nextName))
  }

  const onSearchChange = (value: string): void => {
    dispatch(setSearchQuery(value))
  }

  const showEmpty = materials.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap gap-2">
        <ToolbarButton
          label="Add Materials"
          icon={addIcon}
          size="sm"
          bgColor="#ffffff"
          textColor="#000000"
          iconColor="dark"
          onClick={onAddMaterials}
        />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="shrink-0 font-['Geist'] text-[12px] font-normal leading-[15px] tracking-normal text-[#D3D3D3]">
          {messages.savedMaterials}
        </span>
        <SearchBar
          ariaLabel="Search saved materials"
          icon={searchIcon}
          value={query}
          onChange={onSearchChange}
          placeholder={messages.searchPlaceholder}
          className="w-[125px]"
          inputClassName="h-5 text-[12px] bg-[#121212] placeholder:text-[#424242]"
          iconClassName="h-3 w-3 opacity-70"
          iconBgClassName="w-6 bg-[#424242]"
        />
      </div>

      {loadStatus === 'error' && (
        <span className="form-error-text px-1" style={{ color: '#F04438' }}>
          {loadError ?? messages.loadError}
        </span>
      )}

      <div className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto pt-1">
        {showEmpty ? (
          <p className="px-1 py-2 text-[12px] text-neutral-500">
            {loadStatus === 'loading'
              ? messages.loading
              : query.trim()
                ? messages.noMatches
                : messages.empty}
          </p>
        ) : (
          materials.map((material) => (
            <MaterialRow
              key={material.id}
              material={material}
              selected={material.id === selectedId}
              projectId={projectId}
              existingNames={namesLower}
              nameError={nameErrors[material.id]}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default Materials
