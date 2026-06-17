import {
  CREATE_OBJECT_SUCCEEDED,
  DELETE_NODE_SUCCEEDED,
  UPDATE_OBJECT_SUCCEEDED
} from 'containers/Geometry/constants'
import type {
  CreateObjectSucceededAction,
  DeleteNodeSucceededAction,
  UpdateObjectSucceededAction
} from 'containers/Geometry/actions'
import { SET_ACTIVE_SCENARIO } from 'containers/ProjectScreen/constants'
import { selectActiveProjectId, selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import { call, put, select, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
import { ApiError } from 'utils/api'
import { fetchObjectGeometryBinary, fetchSceneGeometryBinary } from '../api/geometry'
import type { ApiErrorPayload, PrimitiveInfo } from '../models/types'
import * as actions from './actions'
import {
  LOAD_OBJECT_GEOMETRY_REQUESTED,
  LOAD_SCENE_REQUESTED,
  SELECT_SCENE_OBJECT
} from './constants'
import { removeObjectPrimitives, setObjectPrimitives, setSceneAllPrimitives } from './sceneCache'
import { selectSelectedObjectId } from './selectors'

function toErrorPayload(err: unknown): ApiErrorPayload {
  if (err instanceof ApiError) {
    return { status: err.status, message: err.message, fieldErrors: err.fieldErrors }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { status: 0, message, fieldErrors: {} }
}

// ── Load object geometry worker ─────────────────────────────────────────────
//
// Fetches binary geometry for a single object, caches it, and auto-selects it.
// Used both by the explicit loadObjectGeometry action and as a reaction to
// Geometry container events (create, update).

function* fetchAndCacheObjectGeometry(objectId: number): Generator {
  const projectId = (yield select(selectActiveProjectId)) as string | null
  const scenarioId = (yield select(selectActiveScenarioId)) as string | null

  if (!projectId || !scenarioId) return

  const primitives = (yield call(
    fetchObjectGeometryBinary,
    projectId,
    scenarioId,
    objectId
  )) as PrimitiveInfo[]

  yield call(setObjectPrimitives, objectId, primitives)
  yield put(actions.objectGeometryLoaded(objectId))
}

export function* loadObjectGeometryWorker(
  action: ReturnType<typeof actions.loadObjectGeometry>
): Generator {
  try {
    yield* fetchAndCacheObjectGeometry(action.payload.object.id)
  } catch (err) {
    yield put(actions.loadSceneFailed(toErrorPayload(err)))
  }
}

// ── Geometry event listeners ────────────────────────────────────────────────
//
// React to create/update/delete events from the Geometry container so the 3D
// viewport stays in sync without the right panel dispatching extra actions.

export function* onGeometryCreated(action: CreateObjectSucceededAction): Generator {
  try {
    const objectId = Number(action.payload.node.id)
    yield* fetchAndCacheObjectGeometry(objectId)
    // Refresh the "All" scene blob so it includes the new object.
    yield put(actions.loadScene())
  } catch {
    // Non-fatal — the object appears in the dropdown; geometry can be loaded
    // manually by selecting it.
  }
}

export function* onGeometryUpdated(action: UpdateObjectSucceededAction): Generator {
  try {
    const objectId = Number(action.payload.objectId)
    yield* fetchAndCacheObjectGeometry(objectId)
    // Refresh the "All" scene blob so it reflects the updated geometry.
    yield put(actions.loadScene())
  } catch {
    // Non-fatal.
  }
}

export function* onGeometryDeleted(action: DeleteNodeSucceededAction): Generator {
  const objectId = Number(action.id)
  yield call(removeObjectPrimitives, objectId)
  // Refresh the "All" scene blob so it reflects the deletion.
  yield put(actions.loadScene())
}

// ── Load scene worker ─────────────────────────────────────────────────────────

export function* loadSceneWorker(): Generator {
  try {
    const projectId = (yield select(selectActiveProjectId)) as string | null
    const scenarioId = (yield select(selectActiveScenarioId)) as string | null

    if (!projectId || !scenarioId) return

    const primitives = (yield call(
      fetchSceneGeometryBinary,
      projectId,
      scenarioId
    )) as PrimitiveInfo[]

    yield call(setSceneAllPrimitives, primitives)
    yield put(actions.loadSceneSucceeded())
  } catch (err) {
    yield put(actions.loadSceneFailed(toErrorPayload(err)))
  }
}

export function* scenarioChangeWorker(): Generator {
  yield put(actions.loadScene())
}

// ── Select scene object worker ───────────────────────────────────────────────

export function* selectSceneObjectWorker(): Generator {
  try {
    const selectedId = (yield select(selectSelectedObjectId)) as number | null
    if (selectedId === null) return

    const projectId = (yield select(selectActiveProjectId)) as string | null
    const scenarioId = (yield select(selectActiveScenarioId)) as string | null

    if (!projectId || !scenarioId) return

    const primitives = (yield call(
      fetchObjectGeometryBinary,
      projectId,
      scenarioId,
      selectedId
    )) as PrimitiveInfo[]

    yield call(setObjectPrimitives, selectedId, primitives)
    yield put(actions.objectGeometryLoaded(selectedId))
  } catch {
    // Selection fetch failure is non-fatal.
  }
}

// ── Root watcher ──────────────────────────────────────────────────────────────

export default function* threeDWindowSaga(): Generator {
  yield takeLeading(LOAD_OBJECT_GEOMETRY_REQUESTED, loadObjectGeometryWorker)

  yield takeLatest(LOAD_SCENE_REQUESTED, loadSceneWorker)
  yield takeLatest(SET_ACTIVE_SCENARIO, scenarioChangeWorker)

  yield takeLatest(SELECT_SCENE_OBJECT, selectSceneObjectWorker)

  // Listen to Geometry container events to keep the 3D viewport in sync.
  yield takeEvery(CREATE_OBJECT_SUCCEEDED, onGeometryCreated)
  yield takeEvery(UPDATE_OBJECT_SUCCEEDED, onGeometryUpdated)
  yield takeEvery(DELETE_NODE_SUCCEEDED, onGeometryDeleted)
}
