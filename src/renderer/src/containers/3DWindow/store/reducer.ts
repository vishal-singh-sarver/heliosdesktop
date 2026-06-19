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
  OBJECT_GEOMETRY_REMOVED,
  RESET_SCENE,
  SELECT_SCENE_OBJECT
} from './constants'
import type { SceneLoadState, SceneState, ThreeDWindowState } from './types'

export const initialSceneState: SceneState = {
  objectIds: [],
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

      case OBJECT_GEOMETRY_LOADED: {
        const { objectId } = action.payload
        draft.sceneLoad.objectLoading = false
        draft.sceneLoad.selectionLoading = false
        draft.sceneLoad.meshReady = false
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
        if (!draft.scene.objectIds.includes(objectId)) {
          draft.scene.objectIds.push(objectId)
        }
        draft.scene.geometryVersion += 1
        draft.scene.fitVersion += 1
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
        // If the deleted object was selected, fall back to "All".
        if (draft.sceneLoad.selectedObjectId === removedId) {
          draft.sceneLoad.selectedObjectId = null
        }
        draft.scene.geometryVersion += 1
        // Reframe camera to remaining geometry after deletion.
        draft.scene.fitVersion += 1
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
