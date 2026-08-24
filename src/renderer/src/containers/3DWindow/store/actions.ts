import type { ApiErrorPayload, SceneObject } from '../models/types'
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

/**
 * Registers cached geometry without auto-selecting the object.
 *
 * Deliberately does NOT re-frame the camera. Showing a hidden ground, creating
 * one, saving an edit and assigning a material all land here, and every one of
 * them used to yank the view back to a default framing — losing whatever zoom
 * and pan the user had set up. The camera is the user's to move: only the
 * initial scene load (LOAD_SCENE_SUCCEEDED), picking an object in the dropdown,
 * and Reset View frame it now.
 */
export const objectGeometryCached = (objectId: number) => ({
  type: OBJECT_GEOMETRY_CACHED,
  payload: { objectId }
})

/**
 * Mark one object's binary as in flight, or no longer in flight.
 *
 * `pending: false` is for the endings that are not an arrival — a fetch the app
 * cancelled itself, or one that failed. The two arrivals clear it on their own,
 * so a caller that succeeds never has to say so twice.
 */
export const objectGeometryPending = (objectId: number, pending = true) => ({
  type: OBJECT_GEOMETRY_PENDING,
  payload: { objectId, pending }
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

// ── Object geometry removed ──────────────────────────────────────────────────

// Leaves the camera alone, exactly like objectGeometryCached — hiding a ground
// with the eye icon and deleting one both land here, and neither is a reason to
// throw away the user's view.
export const objectGeometryRemoved = (objectId: number) => ({
  type: OBJECT_GEOMETRY_REMOVED,
  payload: { objectId }
})

// ── Reset scene ─────────────────────────────────────────────────────────────
// Clears the 3D viewport when the active project changes.

export const resetScene = () => ({
  type: RESET_SCENE
})

// ── Mesh ready ──────────────────────────────────────────────────────────────
// Dispatched by SceneContent after meshes have been built and are ready to
// display. The loader overlay stays visible until this fires.

export const meshReady = () => ({
  type: MESH_READY
})

export type ThreeDWindowAction =
  | ReturnType<typeof loadObjectGeometry>
  | ReturnType<typeof objectGeometryLoaded>
  | ReturnType<typeof objectGeometryCached>
  | ReturnType<typeof objectGeometryPending>
  | ReturnType<typeof loadScene>
  | ReturnType<typeof loadSceneSucceeded>
  | ReturnType<typeof loadSceneFailed>
  | ReturnType<typeof selectSceneObject>
  | ReturnType<typeof objectGeometryRemoved>
  | ReturnType<typeof resetScene>
  | ReturnType<typeof meshReady>
