import {
  ASSIGN_MATERIAL_SUCCEEDED,
  CREATE_OBJECT_SUCCEEDED,
  DELETE_NODE_SUCCEEDED,
  LIST_NODES_SUCCEEDED,
  TOGGLE_VIEWPORT,
  UNASSIGN_MATERIAL_SUCCEEDED,
  UPDATE_OBJECT_SUCCEEDED,
  VISIBILITY_SYNC_FAILED
} from 'containers/Geometry/constants'
import type {
  AssignMaterialSucceededAction,
  CreateObjectSucceededAction,
  ToggleViewportAction,
  UnassignMaterialSucceededAction,
  UpdateObjectSucceededAction,
  VisibilitySyncFailedAction
} from 'containers/Geometry/actions'
import { selectLoadStatus, selectNodesById } from 'containers/Geometry/selectors'
import type { GeoNode, LoadStatus } from 'containers/Geometry/types'
import { REMOVE_MATERIAL, SAVE_PARAMETER_GROUP_SUCCEEDED } from 'containers/Materials/constants'
import type {
  RemoveMaterialAction,
  SaveParameterGroupSucceededAction
} from 'containers/Materials/actions'
import { SET_ACTIVE_SCENARIO } from 'containers/ProjectScreen/constants'
import { selectActiveProjectId, selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import { all, call, delay, put, race, select, take, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
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
import { selectSceneLoad, selectSceneObjectIds, selectSceneObjects, selectSelectedObjectId } from './selectors'

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
  // Re-fetch when properties OR materials changed — a material assignment restyles
  // the object even with no property edit. Skip only a true no-op / name-only save
  // (neither changed), where the binary is identical.
  if (!action.payload.propsChanged && !action.payload.materialsChanged) return

  const objectId = Number(action.payload.objectId)

  // Don't re-add a hidden object to the scene. Editing a hidden geometry's
  // properties must not un-hide it — re-caching here would push it back into the
  // scene even though its eye icon (visibleInViewport) is closed. The updated
  // geometry is fetched fresh when the user un-hides it (see onViewportToggled).
  const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
  const node = nodesById[String(objectId)]
  if (node && !node.visibleInViewport) return

  try {
    yield* fetchAndCacheObjectGeometry(objectId, false)
  } catch {
    // Non-fatal.
  }
}

// A material was assigned to one-or-more objects (drag-and-drop). The material's
// appearance is baked into each object's binary geometry, so re-fetch every
// affected object to restyle it in place — mirroring onGeometryUpdated, and
// skipping hidden objects so an assignment never un-hides one.
export function* onMaterialAssigned(action: AssignMaterialSucceededAction): Generator {
  const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
  for (const rawId of action.objectIds) {
    const node = nodesById[rawId]
    if (node && !node.visibleInViewport) continue
    try {
      yield* fetchAndCacheObjectGeometry(Number(rawId), false)
    } catch {
      // Non-fatal — the object keeps its previous appearance until reloaded.
    }
  }
}

// Re-fetch the binary of every SHOWN object that uses `groupId` — the objects a
// material-library change (save/delete) actually restyles. The node carries its
// assigned material-group ids (seeded from the objects list, kept in sync on
// assign/unassign/save), so a save of a material used by nothing costs 0 fetches
// and one used by 1 ground costs 1 — instead of one per shown object.
function* refetchObjectsUsingGroup(groupId: string): Generator {
  const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
  for (const node of Object.values(nodesById)) {
    if (node.kind === 'group' || !node.visibleInViewport) continue
    if (!(node.materialGroupIds ?? []).includes(groupId)) continue
    try {
      yield* fetchAndCacheObjectGeometry(Number(node.id), false)
    } catch {
      // Non-fatal — the object keeps its previous appearance until reloaded.
    }
  }
}

// A material member was SAVED (Visualiser colour/texture edit). Restyle only the
// objects that use it. `materialId` is the material GROUP id.
export function* onMaterialSaved(action: SaveParameterGroupSucceededAction): Generator {
  yield* refetchObjectsUsingGroup(action.materialId)
}

// A whole material was DELETED. The objects using it revert (to their remaining
// material or the default soil) — reload just those. `id` is the group id.
export function* onMaterialDeleted(action: RemoveMaterialAction): Generator {
  yield* refetchObjectsUsingGroup(action.id)
}

// A material was UNASSIGNED from an object (the per-material trash in the object
// form). The object reverts to its remaining look — another assigned material, or
// the default soil — so re-fetch its binary to show that. Skips a hidden object
// so an unassign never un-hides one, mirroring onGeometryUpdated/onMaterialAssigned.
export function* onMaterialUnassigned(action: UnassignMaterialSucceededAction): Generator {
  const objectId = Number(action.objectId)
  const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
  const node = nodesById[String(objectId)]
  if (node && !node.visibleInViewport) return
  try {
    yield* fetchAndCacheObjectGeometry(objectId, false)
  } catch {
    // Non-fatal — the object keeps its previous appearance until reloaded.
  }
}

export function* onGeometryDeleted(): Generator {
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

    // No active project/scenario — nothing to load. Settle the scene as an
    // empty success so the loading overlay clears instead of staying stuck.
    if (!projectId || !scenarioId) {
      yield put(actions.loadSceneSucceeded())
      return
    }

    let objects = (yield select(selectSceneObjects)) as SceneObject[]

    // If the Geometry node tree is still being fetched (race: loadScene fires
    // before LIST_NODES_SUCCEEDED), wait for it instead of returning empty.
    // Only wait while a list is genuinely in flight — once the tree is already
    // loaded (or idle/errored), the scene is legitimately empty and waiting
    // would block on a LIST_NODES_SUCCEEDED that already fired (up to the 30s
    // timeout, leaving the loader stuck for empty projects).
    // This replaces the old LIST_NODES_SUCCEEDED → scenarioChangeWorker
    // watcher that caused duplicate binary API calls.
    if (objects.length === 0) {
      const loadStatus = (yield select(selectLoadStatus)) as LoadStatus
      if (loadStatus === 'loading') {
        yield race({
          nodes: take(LIST_NODES_SUCCEEDED),
          timeout: delay(30000)
        })
        objects = (yield select(selectSceneObjects)) as SceneObject[]
      }
    }

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

// Re-run the scene load once the Geometry tree finishes listing, but only if an
// earlier loadScene bailed before the tree was ready. On refresh, loadScene
// (fired by SET_ACTIVE_SCENARIO) can run before the Geometry panel has mounted
// and dispatched the tree fetch — so loadSceneWorker sees loadStatus 'idle',
// doesn't wait, and returns empty without fetching any binary geometry. When the
// tree then arrives we re-trigger the load here.
//
// Guards keep this from reintroducing the duplicate binary fetches that the old
// LIST_NODES_SUCCEEDED → scenarioChangeWorker watcher caused: skip when the
// scenario is empty, when the scene cache is already populated (load already
// completed), or when a load is currently in flight (let it finish). takeLatest
// coalesces bursts of LIST_NODES_SUCCEEDED.
export function* onNodesListed(): Generator {
  const projectId = (yield select(selectActiveProjectId)) as string | null
  const scenarioId = (yield select(selectActiveScenarioId)) as string | null
  if (!projectId || !scenarioId) return

  const objects = (yield select(selectSceneObjects)) as SceneObject[]
  if (objects.length === 0) return // empty scenario — nothing to render

  const cachedIds = (yield select(selectSceneObjectIds)) as number[]
  if (cachedIds.length > 0) return // scene already loaded — don't refetch

  const sceneLoad = (yield select(selectSceneLoad)) as { loading: boolean }
  if (sceneLoad.loading) return // a load is in flight — let it finish

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
  // Safety net for the boot/refresh race: if loadScene ran before the geometry
  // tree was ready and bailed, re-run it once the tree lists (see onNodesListed).
  yield takeLatest(LIST_NODES_SUCCEEDED, onNodesListed)

  yield takeLatest(SELECT_SCENE_OBJECT, selectSceneObjectWorker)

  // Listen to Geometry container events to keep the 3D viewport in sync.
  yield takeEvery(CREATE_OBJECT_SUCCEEDED, onGeometryCreated)
  yield takeEvery(UPDATE_OBJECT_SUCCEEDED, onGeometryUpdated)
  yield takeEvery(DELETE_NODE_SUCCEEDED, onGeometryDeleted)
  yield takeEvery(TOGGLE_VIEWPORT, onViewportToggled)
  yield takeEvery(VISIBILITY_SYNC_FAILED, onVisibilitySyncFailed)
  yield takeEvery(ASSIGN_MATERIAL_SUCCEEDED, onMaterialAssigned)
  yield takeEvery(UNASSIGN_MATERIAL_SUCCEEDED, onMaterialUnassigned)
  yield takeEvery(SAVE_PARAMETER_GROUP_SUCCEEDED, onMaterialSaved)
  yield takeEvery(REMOVE_MATERIAL, onMaterialDeleted)
}
