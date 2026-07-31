import {
  ADD_PARAMETER_GROUP,
  CLEAR_CREATE_HIGHLIGHT,
  CLOSE_MATERIAL_DRAFT,
  CREATE_MATERIAL_FAILED,
  CREATE_MATERIAL_REQUESTED,
  CREATE_MATERIAL_SUCCEEDED,
  DELETE_MATERIAL_FAILED,
  DELETE_MATERIAL_REQUESTED,
  DELETE_PARAMETER_GROUP_FAILED,
  DELETE_PARAMETER_GROUP_REQUESTED,
  LIST_MATERIALS_FAILED,
  LIST_MATERIALS_REQUESTED,
  LIST_MATERIALS_SUCCEEDED,
  LOAD_MATERIAL_DETAIL_REQUESTED,
  MATERIAL_DETAIL_LOADED,
  OPEN_SAVED_MATERIAL_FAILED,
  OPEN_SAVED_MATERIAL_LOADED,
  OPEN_SAVED_MATERIAL_REQUESTED,
  REMOVE_MATERIAL,
  REMOVE_PARAMETER_GROUP,
  RECORD_RECENT_COLOR,
  RENAME_MATERIAL_FAILED,
  RENAME_MATERIAL_REQUESTED,
  RENAME_MATERIAL_SUCCEEDED,
  SAVE_PARAMETER_GROUP_FAILED,
  SAVE_PARAMETER_GROUP_REQUESTED,
  SAVE_PARAMETER_GROUP_SUCCEEDED,
  SELECT_MATERIAL,
  SET_MATERIAL_DRAFT_NAME,
  SET_NAME_ERROR,
  SET_PARAMETER_GROUP_TYPE,
  SET_PARAMETER_GROUP_VALUE,
  SET_SEARCH_QUERY,
  UPLOAD_TEXTURE_FAILED,
  UPLOAD_TEXTURE_REQUESTED,
  UPLOAD_TEXTURE_SUCCEEDED
} from './constants'
import type { RecentColor } from 'utils/color'
import type { Material, MaterialGroupDetail, MaterialPropertyValues } from './types'

// ── Action types ────────────────────────────────────────────────────────────
// Type aliases (not interfaces) so each is structurally assignable to redux's
// UnknownAction at dispatch sites (matches the Geometry convention).

// The library is GLOBAL — the list is not scoped to a project or scenario.
export type ListMaterialsRequestedAction = {
  type: typeof LIST_MATERIALS_REQUESTED
}
export type ListMaterialsSucceededAction = {
  type: typeof LIST_MATERIALS_SUCCEEDED
  payload: Material[]
}
export type ListMaterialsFailedAction = {
  type: typeof LIST_MATERIALS_FAILED
  payload: string
}

// Materials are GLOBAL — creating one needs nothing but its name.
export type CreateMaterialRequestedAction = {
  type: typeof CREATE_MATERIAL_REQUESTED
  name: string
}
export type CreateMaterialSucceededAction = {
  type: typeof CREATE_MATERIAL_SUCCEEDED
  groupId: string
  name: string
}
export type CreateMaterialFailedAction = {
  type: typeof CREATE_MATERIAL_FAILED
  payload: string
}
export type ClearCreateHighlightAction = { type: typeof CLEAR_CREATE_HIGHLIGHT }

export type RenameMaterialRequestedAction = {
  type: typeof RENAME_MATERIAL_REQUESTED
  id: string
  name: string
  scenarioId: string | null
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
export type DeleteMaterialRequestedAction = {
  type: typeof DELETE_MATERIAL_REQUESTED
  id: string
  scenarioId: string | null
}
export type DeleteMaterialFailedAction = {
  type: typeof DELETE_MATERIAL_FAILED
  id: string
  payload: string
}

export type SelectMaterialAction = { type: typeof SELECT_MATERIAL; id: string }
export type SetSearchQueryAction = { type: typeof SET_SEARCH_QUERY; payload: string }

// ── Right-panel material Properties form ─────────────────────────────────────

export type OpenSavedMaterialRequestedAction = {
  type: typeof OPEN_SAVED_MATERIAL_REQUESTED
  id: string
}
export type OpenSavedMaterialLoadedAction = {
  type: typeof OPEN_SAVED_MATERIAL_LOADED
  detail: MaterialGroupDetail
}
export type OpenSavedMaterialFailedAction = {
  type: typeof OPEN_SAVED_MATERIAL_FAILED
  id: string
  payload: string
}
// Load a group's detail into the cache without opening the editor form.
export type LoadMaterialDetailRequestedAction = {
  type: typeof LOAD_MATERIAL_DETAIL_REQUESTED
  id: string
}
export type MaterialDetailLoadedAction = {
  type: typeof MATERIAL_DETAIL_LOADED
  detail: MaterialGroupDetail
}

export type AddParameterGroupAction = { type: typeof ADD_PARAMETER_GROUP }

// Every action that lands on ONE card carries `materialId` — the backend group
// the card belongs to — alongside `cardId`. `cardId` is a per-draft key that
// restarts at 1 for each material, so on its own it cannot tell material A's
// card 1 from material B's: an async result arriving after the user switched
// materials would be applied to whichever draft is open. The reducer checks
// `materialId` against the open draft before touching anything (see `withCard`
// in reducer.ts) and drops the result if they differ.
export type RemoveParameterGroupAction = {
  type: typeof REMOVE_PARAMETER_GROUP
  materialId: string
  cardId: number
}
export type SetParameterGroupTypeAction = {
  type: typeof SET_PARAMETER_GROUP_TYPE
  groupId: number
  typeId: number | null
}
export type SetParameterGroupValueAction = {
  type: typeof SET_PARAMETER_GROUP_VALUE
  groupId: number
  property: string
  value: string
}

// Everything the card's Save needs. `saved` picks POST (add) vs PATCH (update);
// `groupId` is the backend group, `cardId` the client card key.
export type SaveParameterGroupInput = {
  groupId: string
  cardId: number
  materialTypeId: number
  properties: MaterialPropertyValues
  saved: boolean
  scenarioId: string | null
  // An uploaded file (e.g. the spectral data file) the save is replacing/removing.
  // Deleted from disk after the save succeeds — the save drops the reference so the
  // delete no longer 409s in the active scenario. Best-effort (see the saga).
  obsoleteFilePath?: string
}
export type SaveParameterGroupRequestedAction = {
  type: typeof SAVE_PARAMETER_GROUP_REQUESTED
  payload: SaveParameterGroupInput
}
export type SaveParameterGroupSucceededAction = {
  type: typeof SAVE_PARAMETER_GROUP_SUCCEEDED
  materialId: string
  cardId: number
}
export type SaveParameterGroupFailedAction = {
  type: typeof SAVE_PARAMETER_GROUP_FAILED
  materialId: string
  cardId: number
  payload: string
}

export type DeleteParameterGroupInput = {
  groupId: string
  cardId: number
  materialTypeId: number | null
  saved: boolean
  scenarioId: string | null
}
export type DeleteParameterGroupRequestedAction = {
  type: typeof DELETE_PARAMETER_GROUP_REQUESTED
  payload: DeleteParameterGroupInput
}
export type DeleteParameterGroupFailedAction = {
  type: typeof DELETE_PARAMETER_GROUP_FAILED
  materialId: string
  cardId: number
  payload: string
}

// File-property upload — POST the file, then stage the returned path on success.
// `cardId` targets the draft card; `materialTypeId` + `groupId` address the backend
// member. `property` names the file property (default 'texture_file' for the
// Visualiser; 'spectral_data' for the Radiation spectral file).
export type UploadTextureInput = {
  groupId: string
  cardId: number
  materialTypeId: number
  file: File
  scenarioId: string | null
  property?: string
}
export type UploadTextureRequestedAction = {
  type: typeof UPLOAD_TEXTURE_REQUESTED
  payload: UploadTextureInput
}
export type UploadTextureSucceededAction = {
  type: typeof UPLOAD_TEXTURE_SUCCEEDED
  materialId: string
  cardId: number
  path: string
  property: string
}
export type UploadTextureFailedAction = {
  type: typeof UPLOAD_TEXTURE_FAILED
  materialId: string
  cardId: number
  payload: string
}

export type SetMaterialDraftNameAction = { type: typeof SET_MATERIAL_DRAFT_NAME; name: string }
export type CloseMaterialDraftAction = { type: typeof CLOSE_MATERIAL_DRAFT }

// A colour the user just saved onto a material, with the opacity it was saved
// at — prepended to the "Used colors" history.
export type RecordRecentColorAction = { type: typeof RECORD_RECENT_COLOR; color: RecentColor }

export type MaterialsAction =
  | ListMaterialsRequestedAction
  | ListMaterialsSucceededAction
  | ListMaterialsFailedAction
  | CreateMaterialRequestedAction
  | CreateMaterialSucceededAction
  | CreateMaterialFailedAction
  | ClearCreateHighlightAction
  | RenameMaterialRequestedAction
  | RenameMaterialSucceededAction
  | RenameMaterialFailedAction
  | SetNameErrorAction
  | RemoveMaterialAction
  | DeleteMaterialRequestedAction
  | DeleteMaterialFailedAction
  | SelectMaterialAction
  | SetSearchQueryAction
  | OpenSavedMaterialRequestedAction
  | OpenSavedMaterialLoadedAction
  | OpenSavedMaterialFailedAction
  | LoadMaterialDetailRequestedAction
  | MaterialDetailLoadedAction
  | AddParameterGroupAction
  | RemoveParameterGroupAction
  | SetParameterGroupTypeAction
  | SetParameterGroupValueAction
  | SaveParameterGroupRequestedAction
  | SaveParameterGroupSucceededAction
  | SaveParameterGroupFailedAction
  | DeleteParameterGroupRequestedAction
  | DeleteParameterGroupFailedAction
  | UploadTextureRequestedAction
  | UploadTextureSucceededAction
  | UploadTextureFailedAction
  | SetMaterialDraftNameAction
  | CloseMaterialDraftAction
  | RecordRecentColorAction

// ── Action creators ──────────────────────────────────────────────────────────

export const listMaterialsRequested = (): ListMaterialsRequestedAction => ({
  type: LIST_MATERIALS_REQUESTED
})
export const listMaterialsSucceeded = (materials: Material[]): ListMaterialsSucceededAction => ({
  type: LIST_MATERIALS_SUCCEEDED,
  payload: materials
})
export const listMaterialsFailed = (error: string): ListMaterialsFailedAction => ({
  type: LIST_MATERIALS_FAILED,
  payload: error
})

// +Add Materials — create the empty group, then open it in the form.
export const createMaterialRequested = (name: string): CreateMaterialRequestedAction => ({
  type: CREATE_MATERIAL_REQUESTED,
  name
})
export const createMaterialSucceeded = (
  groupId: string,
  name: string
): CreateMaterialSucceededAction => ({ type: CREATE_MATERIAL_SUCCEEDED, groupId, name })
export const createMaterialFailed = (error: string): CreateMaterialFailedAction => ({
  type: CREATE_MATERIAL_FAILED,
  payload: error
})
export const clearCreateHighlight = (): ClearCreateHighlightAction => ({
  type: CLEAR_CREATE_HIGHLIGHT
})

export const renameMaterialRequested = (
  id: string,
  name: string,
  scenarioId: string | null
): RenameMaterialRequestedAction => ({ type: RENAME_MATERIAL_REQUESTED, id, name, scenarioId })
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
export const deleteMaterialRequested = (
  id: string,
  scenarioId: string | null
): DeleteMaterialRequestedAction => ({ type: DELETE_MATERIAL_REQUESTED, id, scenarioId })
export const deleteMaterialFailed = (id: string, error: string): DeleteMaterialFailedAction => ({
  type: DELETE_MATERIAL_FAILED,
  id,
  payload: error
})

export const selectMaterial = (id: string): SelectMaterialAction => ({ type: SELECT_MATERIAL, id })
export const setSearchQuery = (query: string): SetSearchQueryAction => ({
  type: SET_SEARCH_QUERY,
  payload: query
})

// ── Right-panel material Properties form ─────────────────────────────────────

export const openSavedMaterialRequested = (id: string): OpenSavedMaterialRequestedAction => ({
  type: OPEN_SAVED_MATERIAL_REQUESTED,
  id
})
export const openSavedMaterialLoaded = (
  detail: MaterialGroupDetail
): OpenSavedMaterialLoadedAction => ({ type: OPEN_SAVED_MATERIAL_LOADED, detail })

export const loadMaterialDetailRequested = (id: string): LoadMaterialDetailRequestedAction => ({
  type: LOAD_MATERIAL_DETAIL_REQUESTED,
  id
})
export const materialDetailLoaded = (detail: MaterialGroupDetail): MaterialDetailLoadedAction => ({
  type: MATERIAL_DETAIL_LOADED,
  detail
})
export const openSavedMaterialFailed = (
  id: string,
  error: string
): OpenSavedMaterialFailedAction => ({ type: OPEN_SAVED_MATERIAL_FAILED, id, payload: error })

export const addParameterGroup = (): AddParameterGroupAction => ({ type: ADD_PARAMETER_GROUP })

export const removeParameterGroup = (
  materialId: string,
  cardId: number
): RemoveParameterGroupAction => ({
  type: REMOVE_PARAMETER_GROUP,
  materialId,
  cardId
})

export const setParameterGroupType = (
  groupId: number,
  typeId: number | null
): SetParameterGroupTypeAction => ({ type: SET_PARAMETER_GROUP_TYPE, groupId, typeId })

export const setParameterGroupValue = (
  groupId: number,
  property: string,
  value: string
): SetParameterGroupValueAction => ({ type: SET_PARAMETER_GROUP_VALUE, groupId, property, value })

export const saveParameterGroupRequested = (
  input: SaveParameterGroupInput
): SaveParameterGroupRequestedAction => ({ type: SAVE_PARAMETER_GROUP_REQUESTED, payload: input })
export const saveParameterGroupSucceeded = (
  materialId: string,
  cardId: number
): SaveParameterGroupSucceededAction => ({
  type: SAVE_PARAMETER_GROUP_SUCCEEDED,
  materialId,
  cardId
})
export const saveParameterGroupFailed = (
  materialId: string,
  cardId: number,
  error: string
): SaveParameterGroupFailedAction => ({
  type: SAVE_PARAMETER_GROUP_FAILED,
  materialId,
  cardId,
  payload: error
})

export const deleteParameterGroupRequested = (
  input: DeleteParameterGroupInput
): DeleteParameterGroupRequestedAction => ({
  type: DELETE_PARAMETER_GROUP_REQUESTED,
  payload: input
})
export const deleteParameterGroupFailed = (
  materialId: string,
  cardId: number,
  error: string
): DeleteParameterGroupFailedAction => ({
  type: DELETE_PARAMETER_GROUP_FAILED,
  materialId,
  cardId,
  payload: error
})

export const setMaterialDraftName = (name: string): SetMaterialDraftNameAction => ({
  type: SET_MATERIAL_DRAFT_NAME,
  name
})

export const closeMaterialDraft = (): CloseMaterialDraftAction => ({ type: CLOSE_MATERIAL_DRAFT })

export const recordRecentColor = (color: RecentColor): RecordRecentColorAction => ({
  type: RECORD_RECENT_COLOR,
  color
})

export const uploadTextureRequested = (
  input: UploadTextureInput
): UploadTextureRequestedAction => ({ type: UPLOAD_TEXTURE_REQUESTED, payload: input })
export const uploadTextureSucceeded = (
  materialId: string,
  cardId: number,
  path: string,
  // Defaults to the Visualiser texture property so existing callers are unchanged.
  property = 'texture_file'
): UploadTextureSucceededAction => ({
  type: UPLOAD_TEXTURE_SUCCEEDED,
  materialId,
  cardId,
  path,
  property
})
export const uploadTextureFailed = (
  materialId: string,
  cardId: number,
  error: string
): UploadTextureFailedAction => ({
  type: UPLOAD_TEXTURE_FAILED,
  materialId,
  cardId,
  payload: error
})
