import { produce } from 'immer'
import type { Reducer, UnknownAction } from 'redux'
import type { ThreeDWindowAction } from './actions'
import {
  LOAD_OBJECT_GEOMETRY_REQUESTED,
  LOAD_SCENE_FAILED,
  LOAD_SCENE_REQUESTED,
  LOAD_SCENE_SUCCEEDED,
  OBJECT_GEOMETRY_LOADED,
  SELECT_SCENE_OBJECT
} from './constants'
import type { SceneLoadState, SceneState, ThreeDWindowState } from './types'

export const initialSceneState: SceneState = {
  objectIds: [],
  geometryVersion: 0
}

export const initialSceneLoadState: SceneLoadState = {
  loading: false,
  objectLoading: false,
  selectionLoading: false,
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
        if (!draft.scene.objectIds.includes(objectId)) {
          draft.scene.objectIds.push(objectId)
        }
        // Auto-select the object whose geometry was just loaded.
        draft.sceneLoad.selectedObjectId = objectId
        draft.scene.geometryVersion += 1
        break
      }

      // ── Scene load ──────────────────────────────────────────────────────

      case LOAD_SCENE_REQUESTED:
        draft.sceneLoad.loading = true
        draft.sceneLoad.error = null
        break

      case LOAD_SCENE_SUCCEEDED:
        draft.sceneLoad.loading = false
        draft.sceneLoad.selectedObjectId = null
        draft.scene.geometryVersion += 1
        break

      case LOAD_SCENE_FAILED:
        draft.sceneLoad.loading = false
        draft.sceneLoad.error = action.payload
        break

      case SELECT_SCENE_OBJECT:
        draft.sceneLoad.selectedObjectId = action.payload.objectId
        draft.sceneLoad.selectionLoading = action.payload.objectId !== null
        draft.scene.geometryVersion += 1
        break
    }
  })

export default threeDWindowReducer
