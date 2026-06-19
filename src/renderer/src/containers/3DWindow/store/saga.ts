import {
  CREATE_OBJECT_SUCCEEDED,
  DELETE_NODE_SUCCEEDED,
  LIST_NODES_SUCCEEDED,
  TOGGLE_VIEWPORT,
  UPDATE_OBJECT_SUCCEEDED,
  VISIBILITY_SYNC_FAILED
} from 'containers/Geometry/constants'
import type {
  CreateObjectSucceededAction,
  DeleteNodeSucceededAction,
  ToggleViewportAction,
  UpdateObjectSucceededAction,
  VisibilitySyncFailedAction
} from 'containers/Geometry/actions'
import { selectNodesById } from 'containers/Geometry/selectors'
import type { GeoNode } from 'containers/Geometry/types'
import { SET_ACTIVE_SCENARIO } from 'containers/ProjectScreen/constants'
import { selectActiveProjectId, selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import { all, call, put, select, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
import { ApiError } from 'utils/api'
import { fetchObjectGeometryBinary } from '../api/geometry'
import type { ApiErrorPayload, PrimitiveInfo, SceneObject } from '../models/types'
import * as actions from './actions'
import {
  LOAD_OBJECT_GEOMETRY_REQUESTED,
  LOAD_SCENE_REQUESTED,
  SELECT_SCENE_OBJECT
} from './constants'
import { clearTextureCache } from '../ui/textureCache'
import { clearSceneCache, getObjectPrimitives, removeObjectPrimitives, setObjectPrimitives } from './sceneCache'
import { selectSceneObjectIds, selectSceneObjects, selectSelectedObjectId } from './selectors'

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

function* fetchAndCacheObjectGeometry(objectId: number, autoSelect = true): Generator {
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
  yield put(
    autoSelect ? actions.objectGeometryLoaded(objectId) : actions.objectGeometryCached(objectId)
  )
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
// React to create/update events from the Geometry container so the 3D
// viewport stays in sync without the right panel dispatching extra actions.

export function* onGeometryCreated(action: CreateObjectSucceededAction): Generator {
  try {
    const objectId = Number(action.payload.node.id)
    yield* fetchAndCacheObjectGeometry(objectId, false)
  } catch {
    // Non-fatal — the object appears in the dropdown; geometry can be loaded
    // manually by selecting it.
  }
}

export function* onGeometryUpdated(action: UpdateObjectSucceededAction): Generator {
  // Skip rename-only updates — geometry data hasn't changed.
  if (!action.payload.propsChanged) return

  try {
    const objectId = Number(action.payload.objectId)
    yield* fetchAndCacheObjectGeometry(objectId, false)
  } catch {
    // Non-fatal.
  }
}

export function* onGeometryDeleted(_action: DeleteNodeSucceededAction): Generator {
  // The Geometry reducer has already removed the node (and children if group)
  // from nodesById. Compare our cached objectIds against the current visible
  // objects to find which ones were removed.
  const cachedIds = (yield select(selectSceneObjectIds)) as number[]
  const visibleObjects = (yield select(selectSceneObjects)) as SceneObject[]
  const visibleIdSet = new Set(visibleObjects.map((o) => o.id))

  for (const objectId of cachedIds) {
    if (!visibleIdSet.has(objectId)) {
      yield call(removeObjectPrimitives, objectId)
      yield put(actions.objectGeometryRemoved(objectId))
    }
  }
}

// ── Load scene worker ─────────────────────────────────────────────────────────
//
// Fetches binary geometry for every known object individually and caches each
// one. The "All" view is assembled from per-object caches at render time.

export function* loadSceneWorker(): Generator {
  try {
    // Clear stale caches from any previous project/scenario before loading.
    // Scene state is already reset by the LOAD_SCENE_REQUESTED reducer so the
    // loader stays visible throughout the fetch cycle.
    yield call(clearSceneCache)
    yield call(clearTextureCache)

    const projectId = (yield select(selectActiveProjectId)) as string | null
    const scenarioId = (yield select(selectActiveScenarioId)) as string | null

    if (!projectId || !scenarioId) return

    const objects = (yield select(selectSceneObjects)) as SceneObject[]

    if (objects.length === 0) {
      yield put(actions.loadSceneSucceeded())
      return
    }

    // Fetch all objects in parallel via the single-object binary API.
    const results = (yield all(
      objects.map((obj) => call(fetchObjectGeometryBinary, projectId, scenarioId, obj.id))
    )) as PrimitiveInfo[][]

    // Cache each object's primitives individually (no auto-select).
    for (let i = 0; i < objects.length; i++) {
      yield call(setObjectPrimitives, objects[i].id, results[i])
      yield put(actions.objectGeometryCached(objects[i].id))
    }

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
    if (selectedId === null) {
      // "All" selected — signal mesh ready since we render from per-object cache.
      yield put(actions.meshReady())
      return
    }

    // Use cached primitives if available — no API call needed.
    const cached = (yield call(getObjectPrimitives, selectedId)) as PrimitiveInfo[] | undefined
    if (cached) {
      yield put(actions.objectGeometryLoaded(selectedId))
      return
    }

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

// ── Viewport visibility toggle ────────────────────────────────────────────────
//
// When the eye icon is toggled in the left panel, the Geometry reducer has
// already flipped `visibleInViewport` optimistically. We read the post-flip
// value and either remove from cache (hidden) or fetch + cache (unhidden).
// Groups cascade to all children, so we collect all affected leaf node IDs.

function collectLeafIds(nodesById: Record<string, GeoNode>, id: string): number[] {
  const node = nodesById[id]
  if (!node) return []
  if (node.kind !== 'group') return [Number(id)]
  const ids: number[] = []
  for (const childId of node.childIds) {
    ids.push(...collectLeafIds(nodesById, childId))
  }
  return ids
}

export function* onViewportToggled(action: ToggleViewportAction): Generator {
  const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
  const node = nodesById[action.id]
  if (!node) return

  const leafIds = collectLeafIds(nodesById, action.id)

  for (const objectId of leafIds) {
    const leaf = nodesById[String(objectId)]
    if (!leaf) continue

    if (!leaf.visibleInViewport) {
      // Hidden — remove from cache and scene.
      yield call(removeObjectPrimitives, objectId)
      yield put(actions.objectGeometryRemoved(objectId))
    } else {
      // Unhidden — fetch geometry and add back to cache.
      try {
        yield* fetchAndCacheObjectGeometry(objectId, false)
      } catch {
        // Non-fatal.
      }
    }
  }
}

// When a viewport visibility API call fails, the Geometry reducer reverts the
// flip. We must undo our cache change as well (re-fetch if we removed, or
// remove if we added back).
export function* onVisibilitySyncFailed(action: VisibilitySyncFailedAction): Generator {
  if (action.field !== 'viewport') return

  const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
  const leafIds = collectLeafIds(nodesById, action.id)

  for (const objectId of leafIds) {
    const leaf = nodesById[String(objectId)]
    if (!leaf) continue

    // After revert: the node's visibility is the opposite of what we acted on.
    if (leaf.visibleInViewport) {
      // Was hidden (we removed from cache) → now visible again → re-fetch.
      try {
        yield* fetchAndCacheObjectGeometry(objectId, false)
      } catch {
        // Non-fatal.
      }
    } else {
      // Was unhidden (we added to cache) → now hidden again → remove.
      yield call(removeObjectPrimitives, objectId)
      yield put(actions.objectGeometryRemoved(objectId))
    }
  }
}

// ── Root watcher ──────────────────────────────────────────────────────────────

export default function* threeDWindowSaga(): Generator {
  yield takeLeading(LOAD_OBJECT_GEOMETRY_REQUESTED, loadObjectGeometryWorker)

  yield takeLatest(LOAD_SCENE_REQUESTED, loadSceneWorker)
  yield takeLatest(SET_ACTIVE_SCENARIO, scenarioChangeWorker)

  yield takeLatest(SELECT_SCENE_OBJECT, selectSceneObjectWorker)

  // When the Geometry node list arrives (initial load or refresh), fetch
  // binary data for all objects. This covers the race where loadScene()
  // fires before the node tree is populated.
  yield takeLatest(LIST_NODES_SUCCEEDED, scenarioChangeWorker)

  // Listen to Geometry container events to keep the 3D viewport in sync.
  yield takeEvery(CREATE_OBJECT_SUCCEEDED, onGeometryCreated)
  yield takeEvery(UPDATE_OBJECT_SUCCEEDED, onGeometryUpdated)
  yield takeEvery(DELETE_NODE_SUCCEEDED, onGeometryDeleted)
  yield takeEvery(TOGGLE_VIEWPORT, onViewportToggled)
  yield takeEvery(VISIBILITY_SYNC_FAILED, onVisibilitySyncFailed)
}
