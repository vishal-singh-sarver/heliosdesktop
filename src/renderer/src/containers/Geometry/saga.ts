import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'
import * as actions from './actions'
import type {
  AddGeometryRequestedAction,
  DeleteNodeRequestedAction,
  ListNodesRequestedAction,
  RenameRequestedAction
} from './actions'
import {
  ADD_GEOMETRY_REQUESTED,
  DELETE_NODE_REQUESTED,
  LIST_NODES_REQUESTED,
  RENAME_REQUESTED
} from './constants'
import { formatName } from './naming'
import { selectCounters } from './selectors'
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
    yield call(service.renameGroup, projectId, scenarioId, id, name)
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

export default function* geometrySaga(): Generator {
  yield takeLatest(LIST_NODES_REQUESTED, listNodesWorker)
  yield takeEvery(ADD_GEOMETRY_REQUESTED, addGeometryWorker)
  yield takeEvery(RENAME_REQUESTED, renameWorker)
  yield takeEvery(DELETE_NODE_REQUESTED, deleteNodeWorker)
}
