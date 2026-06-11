import addIcon from '@renderer/assets/add.svg'
import searchIcon from '@renderer/assets/search.svg'
import uploadIcon from '@renderer/assets/Upload.svg'
import ActionButton from '@renderer/components/ActionButton'
import SearchBar from '@renderer/components/SearchBar'
import {
  selectActiveProjectId,
  selectActiveScenarioId
} from 'containers/ProjectScreen/selectors'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import { addGeometryRequested, listNodesRequested, setSearchQuery } from './actions'
import GeometryTree from './GeometryTree'
import reducer from './reducer'
import saga from './saga'
import { selectSearchQuery } from './selectors'

// Geometry feature section rendered inside the LeftPanel's Geometry accordion.
// Owns the geometry slice (saved-geometries tree, selection, search, async
// load) — injected once here. The create-action row is wired below; the tree
// and create flows land in the next tasks.
export function Geometry(): React.JSX.Element {
  useInjectReducer({ key: 'geometry', reducer: reducer as Reducer })
  useInjectSaga({ key: 'geometry', saga })

  const dispatch = useDispatch()
  const projectId = useSelector(selectActiveProjectId)
  const scenarioId = useSelector(selectActiveScenarioId)

  // Load the saved-geometries tree whenever the active scenario changes. We
  // dispatch and let the saga own the fetch (never call the service from a
  // component). takeLatest in the saga cancels a stale load on a fast switch.
  React.useEffect(() => {
    if (projectId && scenarioId) dispatch(listNodesRequested(projectId, scenarioId))
  }, [projectId, scenarioId, dispatch])

  const onAddGround = (): void => {
    if (projectId && scenarioId) dispatch(addGeometryRequested(projectId, scenarioId, 'ground'))
  }
  // Crop and Import-from-file are separate flows (deferred) — buttons shown,
  // but only Ground actually creates for now.
  const onAddCrop = (): void => {}
  const onImportFromFile = (): void => {}

  // Search query lives in the slice; a selector derives the filtered tree.
  const query = useSelector(selectSearchQuery)
  const onSearchChange = (value: string): void => {
    if (projectId && scenarioId) dispatch(setSearchQuery(projectId, scenarioId, value))
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap gap-2">
        <ActionButton label="Crop" icon={addIcon} onClick={onAddCrop} />
        <ActionButton label="Ground" icon={addIcon} onClick={onAddGround} />
        <ActionButton label="Import from File" icon={uploadIcon} onClick={onImportFromFile} />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="shrink-0 font-['Geist'] text-[12px] font-normal leading-[15px] tracking-normal text-[#D3D3D3]">
          Saved Geometries
        </span>
        <SearchBar
          ariaLabel="Search saved geometries"
          icon={searchIcon}
          value={query}
          onChange={onSearchChange}
          placeholder="Search..."
          className="w-[125px]"
          inputClassName="h-5 text-[12px] bg-[#121212] placeholder:text-[#424242]"
          iconClassName="h-3 w-3 opacity-70"
          iconBgClassName="w-6 bg-[#424242]"
        />
      </div>

      <GeometryTree />
    </div>
  )
}

export default Geometry
