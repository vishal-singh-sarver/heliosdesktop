import {
  ADD_LOCAL_MATERIAL,
  LIST_MATERIALS_FAILED,
  LIST_MATERIALS_REQUESTED,
  LIST_MATERIALS_SUCCEEDED,
  REMOVE_MATERIAL,
  RENAME_MATERIAL_FAILED,
  RENAME_MATERIAL_REQUESTED,
  RENAME_MATERIAL_SUCCEEDED,
  SELECT_MATERIAL,
  SET_NAME_ERROR,
  SET_SEARCH_QUERY,
  TOGGLE_MATERIAL_VISIBILITY
} from './constants'
import type { Material } from './types'

// ── Action types ────────────────────────────────────────────────────────────
// Type aliases (not interfaces) so each is structurally assignable to redux's
// UnknownAction at dispatch sites (matches the Geometry convention).

export type ListMaterialsRequestedAction = {
  type: typeof LIST_MATERIALS_REQUESTED
  projectId: string
}
export type ListMaterialsSucceededAction = {
  type: typeof LIST_MATERIALS_SUCCEEDED
  payload: Material[]
}
export type ListMaterialsFailedAction = {
  type: typeof LIST_MATERIALS_FAILED
  payload: string
}
export type AddLocalMaterialAction = { type: typeof ADD_LOCAL_MATERIAL; name: string }
export type RenameMaterialRequestedAction = {
  type: typeof RENAME_MATERIAL_REQUESTED
  projectId: string
  id: string
  name: string
}
export type RenameMaterialSucceededAction = {
  type: typeof RENAME_MATERIAL_SUCCEEDED
  id: string
  name: string
}
export type RenameMaterialFailedAction = {
  type: typeof RENAME_MATERIAL_FAILED
  id: string
  payload: string
}
export type SetNameErrorAction = {
  type: typeof SET_NAME_ERROR
  id: string
  payload: string | null
}
export type RemoveMaterialAction = { type: typeof REMOVE_MATERIAL; id: string }
export type ToggleMaterialVisibilityAction = {
  type: typeof TOGGLE_MATERIAL_VISIBILITY
  id: string
}
export type SelectMaterialAction = { type: typeof SELECT_MATERIAL; id: string }
export type SetSearchQueryAction = { type: typeof SET_SEARCH_QUERY; payload: string }

export type MaterialsAction =
  | ListMaterialsRequestedAction
  | ListMaterialsSucceededAction
  | ListMaterialsFailedAction
  | AddLocalMaterialAction
  | RenameMaterialRequestedAction
  | RenameMaterialSucceededAction
  | RenameMaterialFailedAction
  | SetNameErrorAction
  | RemoveMaterialAction
  | ToggleMaterialVisibilityAction
  | SelectMaterialAction
  | SetSearchQueryAction

// ── Action creators ──────────────────────────────────────────────────────────

export const listMaterialsRequested = (projectId: string): ListMaterialsRequestedAction => ({
  type: LIST_MATERIALS_REQUESTED,
  projectId
})
export const listMaterialsSucceeded = (materials: Material[]): ListMaterialsSucceededAction => ({
  type: LIST_MATERIALS_SUCCEEDED,
  payload: materials
})
export const listMaterialsFailed = (error: string): ListMaterialsFailedAction => ({
  type: LIST_MATERIALS_FAILED,
  payload: error
})

export const addLocalMaterial = (name: string): AddLocalMaterialAction => ({
  type: ADD_LOCAL_MATERIAL,
  name
})

export const renameMaterialRequested = (
  projectId: string,
  id: string,
  name: string
): RenameMaterialRequestedAction => ({ type: RENAME_MATERIAL_REQUESTED, projectId, id, name })

export const renameMaterialSucceeded = (
  id: string,
  name: string
): RenameMaterialSucceededAction => ({ type: RENAME_MATERIAL_SUCCEEDED, id, name })

export const renameMaterialFailed = (id: string, error: string): RenameMaterialFailedAction => ({
  type: RENAME_MATERIAL_FAILED,
  id,
  payload: error
})

export const setNameError = (id: string, error: string | null): SetNameErrorAction => ({
  type: SET_NAME_ERROR,
  id,
  payload: error
})

export const removeMaterial = (id: string): RemoveMaterialAction => ({ type: REMOVE_MATERIAL, id })

export const toggleMaterialVisibility = (id: string): ToggleMaterialVisibilityAction => ({
  type: TOGGLE_MATERIAL_VISIBILITY,
  id
})

export const selectMaterial = (id: string): SelectMaterialAction => ({ type: SELECT_MATERIAL, id })

export const setSearchQuery = (query: string): SetSearchQueryAction => ({
  type: SET_SEARCH_QUERY,
  payload: query
})
