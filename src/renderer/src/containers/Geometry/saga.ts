import { selectAllObjectTypes } from 'containers/ProjectScreen/selectors'
import type { ObjectTypeDef } from 'containers/ProjectScreen/types'
import { call, put, select, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
import * as actions from './actions'
import type {
  AddGeometryRequestedAction,
  CreateObjectRequestedAction,
  DeleteNodeRequestedAction,
  ListNodesRequestedAction,
  LoadObjectRequestedAction,
  RenameRequestedAction,
  UpdateObjectRequestedAction
} from './actions'
import {
  ADD_GEOMETRY_REQUESTED,
  CREATE_OBJECT_REQUESTED,
  DELETE_NODE_REQUESTED,
  LIST_NODES_REQUESTED,
  LOAD_OBJECT_REQUESTED,
  RENAME_REQUESTED,
  UPDATE_OBJECT_REQUESTED
} from './constants'
import { formatName } from './naming'
import { defaultValuesForObject } from './propertyBlueprint'
import {
  selectCounters,
  selectCreateDraft,
  selectDetailsById,
  selectNodesById
} from './selectors'
import * as service from './service'
import type { CreateDraft, GeoNode, GeometryCounters, ObjectDetail } from './types'

// Raw string form values → numeric properties for the backend (blank fields are
// dropped). Shared by create (defaults) and update (edited values).
function numericProperties(values: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [property, raw] of Object.entries(values)) {
    const trimmed = raw.trim()
    if (trimmed === '') continue
    out[property] = Number(trimmed)
  }
  return out
}

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

// +Ground: POST a new object with the blueprint's default values (Ground Size
// 10×10, Resolution 1×1, …), then open the right-panel form from the persisted
// object the backend returns. Materials are deferred (sent empty) until the
// materials-instance flow exists. takeLeading guards a double-click on +Ground.
export function* createObjectWorker(action: CreateObjectRequestedAction): Generator {
  const { projectId, scenarioId, objectTypeId, objectName, name } = action
  try {
    const objectTypes = (yield select(selectAllObjectTypes)) as ObjectTypeDef[]
    const objectType = objectTypes.find((o) => o.id === objectTypeId)
    const properties = numericProperties(defaultValuesForObject(objectType))
    const created = (yield call(service.createObject, projectId, scenarioId, {
      objectTypeId,
      name,
      properties,
      materials: []
    })) as service.CreatedObject
    yield put(
      actions.createObjectSucceeded(projectId, scenarioId, {
        node: created.node,
        values: created.values,
        objectTypeId,
        objectName
      })
    )
  } catch (err) {
    yield put(actions.createObjectFailed((err as Error).message))
  }
}

// Shallow equality for the flat numeric-property maps — used to skip the
// properties PATCH when nothing in the form's values actually changed.
function sameProperties(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((k) => a[k] === b[k])
}

// Save: persist ONLY what changed. Properties/visibility/group go through the
// update endpoint (§5.4); the name has its own endpoint (§5.5, no `name` field
// on update — they can't be one call). A rename-only save therefore fires just
// the rename; a properties-only save fires just the update. takeLeading guards
// a double-tap on Save.
export function* updateObjectWorker(action: UpdateObjectRequestedAction): Generator {
  const { projectId, scenarioId } = action
  const draft = (yield select(selectCreateDraft)) as CreateDraft | null
  if (!draft) return
  try {
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    const node = nodesById[draft.objectId]
    // Compare against the values cached when the form opened (or last saved).
    const detailsById = (yield select(selectDetailsById)) as Record<string, ObjectDetail>
    const original = detailsById[draft.objectId]
    const nextProps = numericProperties(draft.values)
    const propsChanged = !original || !sameProperties(nextProps, numericProperties(original.values))
    const nameChanged = !!node && draft.name !== node.name

    if (propsChanged) {
      yield call(service.updateObject, projectId, scenarioId, draft.objectId, {
        properties: nextProps,
        visibility: {
          viewport: node?.visibleInViewport ?? true,
          render: node ? node.modelVisibility.mode !== 'none' : true
        },
        groupId: node?.parentId ?? null
      })
    }
    if (nameChanged) {
      yield call(service.renameObject, projectId, scenarioId, draft.objectId, draft.name)
    }
    yield put(
      actions.updateObjectSucceeded(projectId, scenarioId, {
        objectId: draft.objectId,
        name: draft.name
      })
    )
  } catch (err) {
    yield put(actions.updateObjectFailed((err as Error).message))
  }
}

// Clicking a ground opens the right-panel form. Served from the per-scope cache
// if this object's detail was already fetched; otherwise GET it (and the reducer
// caches the result). takeLatest cancels a stale load on a fast re-click.
export function* loadObjectWorker(action: LoadObjectRequestedAction): Generator {
  const { projectId, scenarioId, id } = action
  try {
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    const node = nodesById[id]
    if (!node) return
    const detailsById = (yield select(selectDetailsById)) as Record<string, ObjectDetail>
    const cached = detailsById[id]
    if (cached) {
      yield put(actions.loadObjectSucceeded(projectId, scenarioId, { node, ...cached }))
      return
    }
    const loaded = (yield call(service.getObject, projectId, scenarioId, id)) as service.LoadedObject
    yield put(actions.loadObjectSucceeded(projectId, scenarioId, loaded))
  } catch (err) {
    yield put(actions.loadObjectFailed((err as Error).message))
  }
}

export default function* geometrySaga(): Generator {
  yield takeLatest(LIST_NODES_REQUESTED, listNodesWorker)
  yield takeEvery(ADD_GEOMETRY_REQUESTED, addGeometryWorker)
  yield takeEvery(RENAME_REQUESTED, renameWorker)
  yield takeEvery(DELETE_NODE_REQUESTED, deleteNodeWorker)
  yield takeLeading(CREATE_OBJECT_REQUESTED, createObjectWorker)
  yield takeLeading(UPDATE_OBJECT_REQUESTED, updateObjectWorker)
  yield takeLatest(LOAD_OBJECT_REQUESTED, loadObjectWorker)
}
