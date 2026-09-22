import { produce } from 'immer'
import type { Reducer, UnknownAction } from 'redux'
import type { ThreeDWindowAction } from './actions'
import {
  LOAD_OBJECT_GEOMETRY_REQUESTED,
  LOAD_SCENE_FAILED,
  LOAD_SCENE_REQUESTED,
  LOAD_SCENE_SUCCEEDED,
  MESH_READY,
  OBJECT_GEOMETRY_CACHED,
  OBJECT_GEOMETRY_LOADED,
  OBJECT_GEOMETRY_PENDING,
  OBJECT_GEOMETRY_REMOVED,
  RESET_SCENE,
  SELECT_SCENE_OBJECT
} from './constants'
import type { SceneLoadState, SceneState, ThreeDWindowState } from './types'

export const initialSceneState: SceneState = {
  objectIds: [],
  pendingObjectIds: [],
  geometryVersion: 0,
  fitVersion: 0
}

export const initialSceneLoadState: SceneLoadState = {
  loading: false,
  objectLoading: false,
  selectionLoading: false,
  meshReady: true,
  error: null,
  selectedObjectId: null
}

export const initialState: ThreeDWindowState = {
  scene: initialSceneState,
  sceneLoad: initialSceneLoadState
}

const threeDWindowReducer: Reducer<ThreeDWindowState> = (
  state = initialState,
  rawAction: UnknownAction
) =>
  produce(state, (draft) => {
    const action = rawAction as ThreeDWindowAction
    switch (action.type) {
      // ── Individual object geometry load (from right panel) ──────────────

      case LOAD_OBJECT_GEOMETRY_REQUESTED:
        draft.sceneLoad.objectLoading = true
        draft.sceneLoad.error = null
        break

      // One object's binary started, or stopped, being on the wire. The two
      // arrivals below clear it themselves; this is dispatched with
      // `pending: false` only for the endings that are not an arrival — a fetch
      // the app cancelled, or one that failed — so a row can never be left
      // spinning for a download that is no longer happening.
      case OBJECT_GEOMETRY_PENDING: {
        const { objectId, pending } = action.payload
        draft.scene.pendingObjectIds = pending
          ? draft.scene.pendingObjectIds.includes(objectId)
            ? draft.scene.pendingObjectIds
            : [...draft.scene.pendingObjectIds, objectId]
          : draft.scene.pendingObjectIds.filter((id) => id !== objectId)
        break
      }

      case OBJECT_GEOMETRY_LOADED: {
        const { objectId } = action.payload
        draft.sceneLoad.objectLoading = false
        draft.sceneLoad.selectionLoading = false
        draft.sceneLoad.meshReady = false
        draft.scene.pendingObjectIds = draft.scene.pendingObjectIds.filter(
          (id) => id !== objectId
        )
        if (!draft.scene.objectIds.includes(objectId)) {
          draft.scene.objectIds.push(objectId)
        }
        // Auto-select the object whose geometry was just loaded.
        draft.sceneLoad.selectedObjectId = objectId
        draft.scene.geometryVersion += 1
        break
      }

      // Silent cache — registers geometry without changing the dropdown selection.
      case OBJECT_GEOMETRY_CACHED: {
        const { objectId } = action.payload
        draft.scene.pendingObjectIds = draft.scene.pendingObjectIds.filter(
          (id) => id !== objectId
        )
        if (!draft.scene.objectIds.includes(objectId)) {
          draft.scene.objectIds.push(objectId)
        }
        // geometryVersion only: the mesh rebuilds, the camera stays put.
        // FitToScene re-frames on every fitVersion change, so bumping it here
        // meant showing a hidden ground, creating one, saving an edit or
        // assigning a material each threw away the user's zoom and pan. The
        // scene is framed once on load (LOAD_SCENE_SUCCEEDED); after that the
        // camera belongs to the user.
        draft.scene.geometryVersion += 1
        break
      }

      // ── Scene load ──────────────────────────────────────────────────────

      case LOAD_SCENE_REQUESTED:
        // Clear previous scene data so stale geometry doesn't linger, while
        // keeping loading=true and meshReady=false so the loader stays visible
        // throughout the entire fetch cycle.
        draft.scene = { ...initialSceneState }
        draft.sceneLoad.loading = true
        draft.sceneLoad.objectLoading = false
        draft.sceneLoad.selectionLoading = false
        draft.sceneLoad.meshReady = false
        draft.sceneLoad.error = null
        draft.sceneLoad.selectedObjectId = null
        break

      case LOAD_SCENE_SUCCEEDED:
        draft.sceneLoad.loading = false
        draft.sceneLoad.selectedObjectId = null
        draft.scene.geometryVersion += 1
        // Bump fitVersion so the camera auto-frames the newly loaded scene.
        draft.scene.fitVersion += 1
        break

      case LOAD_SCENE_FAILED:
        draft.sceneLoad.loading = false
        draft.sceneLoad.meshReady = true
        draft.sceneLoad.error = action.payload
        // The load is over however it ended, so nothing is still on the wire.
        // Without this the row that was downloading when it failed would spin
        // for the rest of the session.
        draft.scene.pendingObjectIds = []
        break

      case SELECT_SCENE_OBJECT:
        draft.sceneLoad.selectedObjectId = action.payload.objectId
        draft.sceneLoad.selectionLoading = action.payload.objectId !== null
        draft.sceneLoad.meshReady = false
        // No geometryVersion bump — the selectedObjectId change in useMemo
        // dependencies is sufficient to trigger a mesh rebuild from cache.
        break

      case OBJECT_GEOMETRY_REMOVED: {
        const removedId = action.payload.objectId
        draft.scene.objectIds = draft.scene.objectIds.filter((id) => id !== removedId)
        // A download for something that has been deleted or hidden has nothing
        // left to arrive into.
        draft.scene.pendingObjectIds = draft.scene.pendingObjectIds.filter(
          (id) => id !== removedId
        )
        // If the deleted object was selected, fall back to "All". This DOES
        // re-frame, via FitToScene's selectedObjectId dependency — the view
        // genuinely changed to a different subject, which is the one case where
        // moving the camera is right.
        if (draft.sceneLoad.selectedObjectId === removedId) {
          draft.sceneLoad.selectedObjectId = null
        }
        // No fitVersion bump — hiding and deleting both land here, and neither
        // should pull the camera away from where the user put it.
        draft.scene.geometryVersion += 1
        break
      }

      case RESET_SCENE:
        draft.scene = { ...initialSceneState }
        draft.sceneLoad = { ...initialSceneLoadState }
        break

      case MESH_READY:
        draft.sceneLoad.meshReady = true
        break
    }
  })

export default threeDWindowReducer
