import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'
import * as actions from './actions'
import type {
  AddGeometryRequestedAction,
  DeleteNodeRequestedAction,
  GroupNodesRequestedAction,
  ListNodesRequestedAction,
  MoveNodesRequestedAction,
  RenameRequestedAction
} from './actions'
import {
  ADD_GEOMETRY_REQUESTED,
  DELETE_NODE_REQUESTED,
  GROUP_NODES_REQUESTED,
  LIST_NODES_REQUESTED,
  MOVE_NODES_REQUESTED,
  RENAME_REQUESTED
} from './constants'
import { formatName } from './naming'
import { selectCounters, selectNodesById } from './selectors'
import * as service from './service'
import type { GeoNode, GeometryCounters } from './types'

// Loads the saved-geometries tree for a scenario. takeLatest cancels a stale
// load if the user switches scenario mid-request.
export function* listNodesWorker(action: ListNodesRequestedAction): Generator {
  const { projectId, scenarioId } = action
  try {
    const nodes = (yield call(service.listNodes, projectId, scenarioId)) as GeoNode[]
    yield put(actions.listNodesSucceeded(projectId, scenarioId, nodes))
  } catch (err) {
    yield put(actions.listNodesFailed(projectId, scenarioId, (err as Error).message))
  }
}

// Client-generated id; wrapped so the saga test can step over it. The backend
// receives this id (we send only { id, name }), so no reconcile is needed.
export const generateId = (): string => `geo-${crypto.randomUUID()}`

// Creates a Ground. The counter was already bumped by the reducer on the
// REQUESTED action, so reading it here yields this create's number.
export function* addGeometryWorker(action: AddGeometryRequestedAction): Generator {
  const { projectId, scenarioId } = action
  const kind = action.payload
  try {
    const counters = (yield select(selectCounters)) as GeometryCounters
    const name = formatName(kind, counters[kind])
    const id = (yield call(generateId)) as string
    yield call(service.createGeometry, projectId, scenarioId, { id, name, kind })
    yield put(actions.addGeometrySucceeded(projectId, scenarioId, { id, name, kind }))
  } catch (err) {
    yield put(actions.addGeometryFailed(projectId, scenarioId, (err as Error).message))
  }
}

// Persists a group rename. Pessimistic: the name changes only on success, so
// no rollback is needed; a backend rejection surfaces as an inline name error.
export function* renameWorker(action: RenameRequestedAction): Generator {
  const { projectId, scenarioId, id } = action
  const name = action.payload
  try {
    // Groups and leaves rename through different endpoints (§6.3 vs §5.5); pick
    // by the node's kind from state.
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    const renameFn = nodesById[id]?.kind === 'group' ? service.renameGroup : service.renameObject
    yield call(renameFn, projectId, scenarioId, id, name)
    yield put(actions.renameSucceeded(projectId, scenarioId, id, name))
  } catch (err) {
    yield put(actions.renameFailed(projectId, scenarioId, id, (err as Error).message))
  }
}

// Deletes a node (a group also drops its children). Pessimistic: the row is
// removed only on success, so a failed delete leaves the tree intact.
export function* deleteNodeWorker(action: DeleteNodeRequestedAction): Generator {
  const { projectId, scenarioId, id } = action
  try {
    yield call(service.deleteNode, projectId, scenarioId, id)
    yield put(actions.deleteNodeSucceeded(projectId, scenarioId, id))
  } catch (err) {
    yield put(actions.deleteNodeFailed(projectId, scenarioId, id, (err as Error).message))
  }
}

// Drop leaf→leaf → create a group server-side (§6.1), then insert the returned
// group (real id + name) into the slice. The optimistic local insert is gone:
// we wait for the POST so the id/name match what a later refetch returns.
export function* groupNodesWorker(action: GroupNodesRequestedAction): Generator {
  const { projectId, scenarioId, memberIds } = action
  try {
    const group = (yield call(
      service.createGroup,
      projectId,
      scenarioId,
      memberIds
    )) as service.CreatedGroup
    yield put(actions.groupNodesSucceeded(projectId, scenarioId, group))
  } catch (err) {
    yield put(actions.groupNodesFailed(projectId, scenarioId, (err as Error).message))
  }
}

// Drag leaf(s) into a group, between groups, or back to root → PATCH each
// object's group_id (§5.4), then apply the reparent locally on success.
export function* moveNodesWorker(action: MoveNodesRequestedAction): Generator {
  const { projectId, scenarioId, nodeIds, toGroupId } = action
  try {
    // Note each moved node's source group (before the move) so we can clean up
    // any group left empty afterwards.
    const before = (yield select(selectNodesById)) as Record<string, GeoNode>
    const sourceGroupIds = new Set<string>()
    for (const id of nodeIds) {
      const parentId = before[id]?.parentId
      if (parentId && parentId !== toGroupId) sourceGroupIds.add(parentId)
    }

    yield call(service.moveNodes, projectId, scenarioId, nodeIds, toGroupId)
    yield put(actions.moveNodesSucceeded(projectId, scenarioId, nodeIds, toGroupId))

    // The reducer prunes a group that just lost its last member; mirror that on
    // the backend with DELETE /groups (§6.4). A group still present after the
    // move kept other members, so we leave it. Best-effort: a failed/404 delete
    // (e.g. the backend already auto-removed it) is ignored — the move stands.
    const after = (yield select(selectNodesById)) as Record<string, GeoNode>
    for (const groupId of sourceGroupIds) {
      if (after[groupId]) continue
      try {
        yield call(service.deleteGroup, projectId, scenarioId, groupId)
      } catch {
        // cleanup is best-effort; the move already succeeded
      }
    }
  } catch (err) {
    yield put(actions.moveNodesFailed(projectId, scenarioId, (err as Error).message))
  }
}

export default function* geometrySaga(): Generator {
  yield takeLatest(LIST_NODES_REQUESTED, listNodesWorker)
  yield takeEvery(ADD_GEOMETRY_REQUESTED, addGeometryWorker)
  yield takeEvery(RENAME_REQUESTED, renameWorker)
  yield takeEvery(DELETE_NODE_REQUESTED, deleteNodeWorker)
  yield takeEvery(GROUP_NODES_REQUESTED, groupNodesWorker)
  yield takeEvery(MOVE_NODES_REQUESTED, moveNodesWorker)
}
