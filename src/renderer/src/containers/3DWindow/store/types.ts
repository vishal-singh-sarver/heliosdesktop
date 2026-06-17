import type { ApiErrorPayload } from '../models/types'

export interface SceneState {
  // Objects whose parsed primitives are available in sceneCache.
  objectIds: number[]
  // Incremented whenever sceneCache contents change; the viewport keys
  // geometry rebuilds off this counter (primitives themselves stay out of
  // Redux — they are large and not serialization-friendly).
  geometryVersion: number
  // Incremented only when new geometry data is loaded (initial scene load,
  // object creation/update). Dropdown switches between cached objects do NOT
  // bump this — the camera should stay where the user left it.
  fitVersion: number
}

export interface SceneLoadState {
  // True while the scene-level binary geometry is loading.
  loading: boolean
  // True while a single object's geometry is being fetched (from right panel trigger).
  objectLoading: boolean
  // True while switching to an individual object (fetching its geometry).
  selectionLoading: boolean
  // False while meshes are being rebuilt after a geometry change; true once
  // SceneContent has finished building and the viewport is ready to display.
  meshReady: boolean
  error: ApiErrorPayload | null
  // Currently selected object id, or null for "All".
  selectedObjectId: number | null
}

export interface ThreeDWindowState {
  scene: SceneState
  sceneLoad: SceneLoadState
}
