import addIcon from '@renderer/assets/add.svg'
import searchIcon from '@renderer/assets/search.svg'
import SearchBar from '@renderer/components/SearchBar'
import ToolbarButton from '@renderer/components/ToolbarButton'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import { useTransientHighlight } from 'utils/useTransientHighlight'
import {
  clearCreateHighlight,
  createMaterialRequested,
  listMaterialsRequested,
  setSearchQuery
} from './actions'
import MaterialRow from './MaterialRow'
import messages from './messages'
import reducer from './reducer'
import saga from './saga'
import {
  selectActionError,
  selectCreateError,
  selectCreateStatus,
  selectLastCreatedId,
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
  const materials = useSelector(selectVisibleMaterials)
  const selectedId = useSelector(selectSelectedId)
  const nextName = useSelector(selectNextMaterialName)
  const query = useSelector(selectSearchQuery)
  const loadStatus = useSelector(selectLoadStatus)
  const loadError = useSelector(selectLoadError)
  const namesLower = useSelector(selectMaterialNamesLower)
  const nameErrors = useSelector(selectNameErrors)
  const createStatus = useSelector(selectCreateStatus)
  const createError = useSelector(selectCreateError)
  // A row click whose GET failed, or a delete the backend refused — neither has a
  // row or field of its own, so both surface here alongside the load/create errors.
  const actionError = useSelector(selectActionError)
  // +Add Materials appends its row at the bottom of the list, which can be below
  // the fold — the row flashes and scrolls itself into view so it's obvious which
  // one just appeared. Same cue the Properties form gives a new card.
  const lastCreatedId = useSelector(selectLastCreatedId)
  const highlightedId = useTransientHighlight(lastCreatedId, () =>
    dispatch(clearCreateHighlight())
  )

  // The material library is GLOBAL — it isn't scoped to a project or scenario, so
  // it loads once when the section mounts rather than per active project. We
  // dispatch and let the saga own the fetch (never call the service from a
  // component).
  // Ref-guarded so StrictMode's deliberate second run of this effect does not
  // fetch the material library twice on every project open. A real navigation
  // destroys the component, so returning to the screen still refreshes it.
  const materialsRequestedRef = React.useRef(false)
  React.useEffect(() => {
    if (materialsRequestedRef.current) return
    materialsRequestedRef.current = true
    dispatch(listMaterialsRequested())
  }, [dispatch])

  // +Add Materials creates the material on the backend straight away as an EMPTY
  // group (POST /library/groups), named with the next free Material.NNN (the same
  // gap-filling scheme as Geometry's Ground.NNN). The saga opens the returned
  // group in the right-panel Properties form, where each parameter group is then
  // saved onto it. Mirrors Geometry's +Ground, which likewise creates the object
  // and opens its Properties form.
  const onAddMaterials = (): void => {
    if (createStatus === 'creating') return
    dispatch(createMaterialRequested(nextName))
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
        <span className="shrink-0 font-main text-[13px] font-normal leading-[15px] tracking-normal text-[#D3D3D3]">
          {messages.savedMaterials}
        </span>
        <SearchBar
          ariaLabel="Search saved materials"
          icon={searchIcon}
          value={query}
          onChange={onSearchChange}
          placeholder={messages.searchPlaceholder}
          className="w-[125px]"
          inputClassName="h-5 text-[13px] bg-[#121212] placeholder:text-[#424242]"
          iconClassName="h-3 w-3 opacity-70"
          iconBgClassName="w-6 bg-[#424242]"
        />
      </div>

      {loadStatus === 'error' && (
        <span className="form-error-text px-1" style={{ color: '#F04438' }}>
          {loadError ?? messages.loadError}
        </span>
      )}

      {createStatus === 'error' && (
        <span className="form-error-text px-1" style={{ color: '#F04438' }}>
          {createError ?? messages.createError}
        </span>
      )}

      {actionError != null && (
        <span className="form-error-text px-1" style={{ color: '#F04438' }}>
          {actionError}
        </span>
      )}

      <div className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto pt-1">
        {showEmpty ? (
          <p className="px-1 py-2 text-[13px]" style={{ color: '#7D7D7D' }}>
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
              highlighted={material.id === highlightedId}
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
