import type { ApiErrorPayload, SceneObject } from '../models/types'
import {
  LOAD_OBJECT_GEOMETRY_REQUESTED,
  LOAD_SCENE_FAILED,
  LOAD_SCENE_REQUESTED,
  LOAD_SCENE_SUCCEEDED,
  OBJECT_GEOMETRY_LOADED,
  SELECT_SCENE_OBJECT
} from './constants'

// ── Load individual object geometry ─────────────────────────────────────────
// Dispatched by the right-side panel after it creates/saves an object.
// The saga fetches the binary geometry, caches it, and auto-selects it.

export const loadObjectGeometry = (object: SceneObject) => ({
  type: LOAD_OBJECT_GEOMETRY_REQUESTED,
  payload: { object }
})

export const objectGeometryLoaded = (objectId: number) => ({
  type: OBJECT_GEOMETRY_LOADED,
  payload: { objectId }
})

// ── Load scene ───────────────────────────────────────────────────────────────

export const loadScene = () => ({
  type: LOAD_SCENE_REQUESTED
})

export const loadSceneSucceeded = () => ({
  type: LOAD_SCENE_SUCCEEDED
})

export const loadSceneFailed = (error: ApiErrorPayload) => ({
  type: LOAD_SCENE_FAILED,
  payload: error
})

// ── Scene selector ───────────────────────────────────────────────────────────

export const selectSceneObject = (objectId: number | null) => ({
  type: SELECT_SCENE_OBJECT,
  payload: { objectId }
})

export type ThreeDWindowAction =
  | ReturnType<typeof loadObjectGeometry>
  | ReturnType<typeof objectGeometryLoaded>
  | ReturnType<typeof loadScene>
  | ReturnType<typeof loadSceneSucceeded>
  | ReturnType<typeof loadSceneFailed>
  | ReturnType<typeof selectSceneObject>
