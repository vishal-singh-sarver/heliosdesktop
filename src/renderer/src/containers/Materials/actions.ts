import {
  ADD_LOCAL_MATERIAL,
  ADD_PARAMETER_GROUP,
  CLOSE_MATERIAL_DRAFT,
  LIST_MATERIALS_FAILED,
  LIST_MATERIALS_REQUESTED,
  LIST_MATERIALS_SUCCEEDED,
  OPEN_MATERIAL_DRAFT,
  REMOVE_MATERIAL,
  REMOVE_PARAMETER_GROUP,
  RENAME_MATERIAL_FAILED,
  RENAME_MATERIAL_REQUESTED,
  RENAME_MATERIAL_SUCCEEDED,
  SAVE_MATERIAL_FAILED,
  SAVE_MATERIAL_REQUESTED,
  SAVE_MATERIAL_SUCCEEDED,
  SELECT_MATERIAL,
  SET_MATERIAL_DRAFT_NAME,
  SET_MATERIAL_DRAFT_VALUE,
  SET_NAME_ERROR,
  SET_PARAMETER_GROUP_TYPE,
  SET_SEARCH_QUERY,
  TOGGLE_MATERIAL_VISIBILITY
} from './constants'
import type { Material, SaveMaterialInput } from './types'

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

// ── Right-panel material Properties draft ────────────────────────────────────
export type OpenMaterialDraftAction = { type: typeof OPEN_MATERIAL_DRAFT; name: string }
export type AddParameterGroupAction = { type: typeof ADD_PARAMETER_GROUP }
export type RemoveParameterGroupAction = {
  type: typeof REMOVE_PARAMETER_GROUP
  groupId: number
}
export type SetParameterGroupTypeAction = {
  type: typeof SET_PARAMETER_GROUP_TYPE
  groupId: number
  typeId: number | null
}
export type SetMaterialDraftValueAction = {
  type: typeof SET_MATERIAL_DRAFT_VALUE
  property: string
  value: string
}
export type SetMaterialDraftNameAction = { type: typeof SET_MATERIAL_DRAFT_NAME; name: string }
export type CloseMaterialDraftAction = { type: typeof CLOSE_MATERIAL_DRAFT }

export type SaveMaterialRequestedAction = {
  type: typeof SAVE_MATERIAL_REQUESTED
  payload: SaveMaterialInput
}
export type SaveMaterialSucceededAction = { type: typeof SAVE_MATERIAL_SUCCEEDED }
export type SaveMaterialFailedAction = { type: typeof SAVE_MATERIAL_FAILED; payload: string }

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
  | OpenMaterialDraftAction
  | AddParameterGroupAction
  | RemoveParameterGroupAction
  | SetParameterGroupTypeAction
  | SetMaterialDraftValueAction
  | SetMaterialDraftNameAction
  | CloseMaterialDraftAction
  | SaveMaterialRequestedAction
  | SaveMaterialSucceededAction
  | SaveMaterialFailedAction

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

// ── Right-panel material Properties draft ────────────────────────────────────

// Open the given (client-only) material in the right-panel Properties form. The
// material id is derived as `local-<name>` to match ADD_LOCAL_MATERIAL, so the
// draft edits the same row +Add Materials just appended.
export const openMaterialDraft = (name: string): OpenMaterialDraftAction => ({
  type: OPEN_MATERIAL_DRAFT,
  name
})

export const addParameterGroup = (): AddParameterGroupAction => ({ type: ADD_PARAMETER_GROUP })

export const removeParameterGroup = (groupId: number): RemoveParameterGroupAction => ({
  type: REMOVE_PARAMETER_GROUP,
  groupId
})

export const setParameterGroupType = (
  groupId: number,
  typeId: number | null
): SetParameterGroupTypeAction => ({ type: SET_PARAMETER_GROUP_TYPE, groupId, typeId })

export const setMaterialDraftValue = (
  property: string,
  value: string
): SetMaterialDraftValueAction => ({ type: SET_MATERIAL_DRAFT_VALUE, property, value })

export const setMaterialDraftName = (name: string): SetMaterialDraftNameAction => ({
  type: SET_MATERIAL_DRAFT_NAME,
  name
})

export const closeMaterialDraft = (): CloseMaterialDraftAction => ({ type: CLOSE_MATERIAL_DRAFT })

// Save Material — persist the draft as a global material group.
export const saveMaterialRequested = (input: SaveMaterialInput): SaveMaterialRequestedAction => ({
  type: SAVE_MATERIAL_REQUESTED,
  payload: input
})
export const saveMaterialSucceeded = (): SaveMaterialSucceededAction => ({
  type: SAVE_MATERIAL_SUCCEEDED
})
export const saveMaterialFailed = (error: string): SaveMaterialFailedAction => ({
  type: SAVE_MATERIAL_FAILED,
  payload: error
})
