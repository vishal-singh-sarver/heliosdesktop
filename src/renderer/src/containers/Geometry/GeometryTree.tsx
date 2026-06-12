import Spinner from '@renderer/components/LoadingScreen/Spinner'
import {
  selectActiveProjectId,
  selectActiveScenarioId
} from 'containers/ProjectScreen/selectors'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { moveNodes } from './actions'
import messages from './messages'
import {
  selectGroupNamesLower,
  selectLoadError,
  selectLoadStatus,
  selectNameErrors,
  selectSearchQuery,
  selectSelectedIds,
  selectVisibleTree
} from './selectors'
import TreeRow from './TreeRow'

// Renders the Saved Geometries tree from the slice: a spinner while loading,
// the error copy on failure, an empty hint when there are no nodes, otherwise
// the ordered root rows (groups recurse into their children via TreeRow).
export function GeometryTree(): React.JSX.Element {
  const dispatch = useDispatch()
  const status = useSelector(selectLoadStatus)
  const error = useSelector(selectLoadError)
  const { nodesById, rootOrder } = useSelector(selectVisibleTree)
  const query = useSelector(selectSearchQuery)
  const selectedIds = useSelector(selectSelectedIds)
  const groupNamesLower = useSelector(selectGroupNamesLower)
  const nameErrors = useSelector(selectNameErrors)
  const projectId = useSelector(selectActiveProjectId)
  const scenarioId = useSelector(selectActiveScenarioId)

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner className="h-4 w-4 text-neutral-400" />
      </div>
    )
  }

  if (status === 'error') {
    return <p className="form-error-text py-2">{error ?? messages.loadError}</p>
  }

  if (rootOrder.length === 0) {
    // Distinguish "nothing saved" from "search matched nothing".
    const hint = query.trim() ? messages.noMatches : messages.emptyTree
    return <p className="py-2 text-[12px] text-neutral-500">{hint}</p>
  }

  // Dropping in the empty area (not on a row, which stops propagation) ungroups
  // the dragged nodes back to the root.
  const handleRootDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/x-geo')
    if (!raw || !projectId || !scenarioId) return
    let ids: string[] = []
    try {
      const parsed = JSON.parse(raw)
      ids = Array.isArray(parsed) ? parsed : []
    } catch {
      ids = []
    }
    if (ids.length) dispatch(moveNodes(projectId, scenarioId, ids, null))
  }

  return (
    <div
      className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleRootDrop}
    >
      {rootOrder.map((id) => (
        <TreeRow
          key={id}
          node={nodesById[id]}
          nodesById={nodesById}
          depth={0}
          projectId={projectId}
          scenarioId={scenarioId}
          selectedIds={selectedIds}
          groupNamesLower={groupNamesLower}
          nameErrors={nameErrors}
        />
      ))}
    </div>
  )
}

export default GeometryTree
