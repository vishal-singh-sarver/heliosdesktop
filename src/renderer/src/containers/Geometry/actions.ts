import {
  ADD_GEOMETRY_FAILED,
  ADD_GEOMETRY_REQUESTED,
  ADD_GEOMETRY_SUCCEEDED,
  CLOSE_CREATE_FORM,
  CREATE_OBJECT_FAILED,
  CREATE_OBJECT_REQUESTED,
  CREATE_OBJECT_SUCCEEDED,
  DELETE_NODE_FAILED,
  DELETE_NODE_REQUESTED,
  DELETE_NODE_SUCCEEDED,
  GROUP_NODES,
  LIST_NODES_REQUESTED,
  MOVE_NODES,
  LIST_NODES_SUCCEEDED,
  LIST_NODES_FAILED,
  RENAME_FAILED,
  RENAME_REQUESTED,
  RENAME_SUCCEEDED,
  SELECT,
  SET_DRAFT_MATERIAL,
  SET_DRAFT_NAME,
  SET_DRAFT_VALUE,
  SET_MODEL_VISIBILITY,
  SET_NAME_ERROR,
  SET_SEARCH_QUERY,
  TOGGLE_EXPAND,
  TOGGLE_VIEWPORT,
  UPDATE_OBJECT_FAILED,
  UPDATE_OBJECT_REQUESTED,
  UPDATE_OBJECT_SUCCEEDED
} from './constants'
import type { GeoNode, ModelVisibility } from './types'

// The kinds creatable from the action row. Import-from-file is a separate flow.
export type CreatableKind = 'ground'

// ── Action types ────────────────────────────────────────────────────────────
//
// Type aliases (not interfaces) so each action is structurally assignable to
// redux's UnknownAction at dispatch sites (see Weather/actions.ts for why).
// Scope fields (projectId / scenarioId) live at the top level; payload carries
// the data — matching the Weather convention the reducer reads.

export type ListNodesRequestedAction = {
  type: typeof LIST_NODES_REQUESTED
  projectId: string
  scenarioId: string
}
export type ListNodesSucceededAction = {
  type: typeof LIST_NODES_SUCCEEDED
  projectId: string
  scenarioId: string
  payload: GeoNode[]
}
export type ListNodesFailedAction = {
  type: typeof LIST_NODES_FAILED
  projectId: string
  scenarioId: string
  payload: string
}
export type SelectAction = {
  type: typeof SELECT
  projectId: string
  scenarioId: string
  id: string
  multi: boolean
}
export type SetSearchQueryAction = {
  type: typeof SET_SEARCH_QUERY
  projectId: string
  scenarioId: string
  payload: string
}
export type ToggleExpandAction = {
  type: typeof TOGGLE_EXPAND
  projectId: string
  scenarioId: string
  id: string
}
export type ToggleViewportAction = {
  type: typeof TOGGLE_VIEWPORT
  projectId: string
  scenarioId: string
  id: string
}
export type SetModelVisibilityAction = {
  type: typeof SET_MODEL_VISIBILITY
  projectId: string
  scenarioId: string
  id: string
  payload: ModelVisibility
}
export type RenameRequestedAction = {
  type: typeof RENAME_REQUESTED
  projectId: string
  scenarioId: string
  id: string
  payload: string
}
export type RenameSucceededAction = {
  type: typeof RENAME_SUCCEEDED
  projectId: string
  scenarioId: string
  id: string
  payload: string
}
export type RenameFailedAction = {
  type: typeof RENAME_FAILED
  projectId: string
  scenarioId: string
  id: string
  payload: string
}
export type SetNameErrorAction = {
  type: typeof SET_NAME_ERROR
  projectId: string
  scenarioId: string
  id: string
  payload: string | null
}
export type GroupNodesAction = {
  type: typeof GROUP_NODES
  projectId: string
  scenarioId: string
  nodeIds: string[] // the dragged leaves
  targetId: string // the leaf they were dropped onto
  groupId: string // client-generated id for the new group
}
export type MoveNodesAction = {
  type: typeof MOVE_NODES
  projectId: string
  scenarioId: string
  nodeIds: string[]
  toGroupId: string | null // null = move to root (ungroup)
}
export type DeleteNodeRequestedAction = {
  type: typeof DELETE_NODE_REQUESTED
  projectId: string
  scenarioId: string
  id: string
}
export type DeleteNodeSucceededAction = {
  type: typeof DELETE_NODE_SUCCEEDED
  projectId: string
  scenarioId: string
  id: string
}
export type DeleteNodeFailedAction = {
  type: typeof DELETE_NODE_FAILED
  projectId: string
  scenarioId: string
  id: string
  payload: string
}
export type AddGeometryRequestedAction = {
  type: typeof ADD_GEOMETRY_REQUESTED
  projectId: string
  scenarioId: string
  payload: CreatableKind
}
export type AddGeometrySucceededAction = {
  type: typeof ADD_GEOMETRY_SUCCEEDED
  projectId: string
  scenarioId: string
  payload: { id: string; name: string; kind: CreatableKind }
}
export type AddGeometryFailedAction = {
  type: typeof ADD_GEOMETRY_FAILED
  projectId: string
  scenarioId: string
  payload: string
}

// ── Edit-object draft (right-panel Properties form) ─────────────────────────
export type SetDraftValueAction = {
  type: typeof SET_DRAFT_VALUE
  property: string
  payload: string
}
export type SetDraftNameAction = {
  type: typeof SET_DRAFT_NAME
  payload: string
}
export type SetDraftMaterialAction = {
  type: typeof SET_DRAFT_MATERIAL
  payload: number | null
}
export type CloseCreateFormAction = {
  type: typeof CLOSE_CREATE_FORM
}
// +Ground fires this; the saga POSTs an object with default values. Carries the
// catalog type + proposed name needed to build the create payload and open the
// form (no draft exists yet).
export type CreateObjectRequestedAction = {
  type: typeof CREATE_OBJECT_REQUESTED
  projectId: string
  scenarioId: string
  objectTypeId: number
  objectName: string
  name: string
}
// The POST resolved: the persisted node + its property values, plus the catalog
// type the form needs to render. The reducer inserts the node and opens the draft.
export type CreateObjectSucceededAction = {
  type: typeof CREATE_OBJECT_SUCCEEDED
  projectId: string
  scenarioId: string
  payload: {
    node: GeoNode
    values: Record<string, string>
    objectTypeId: number
    objectName: string
  }
}
export type CreateObjectFailedAction = {
  type: typeof CREATE_OBJECT_FAILED
  payload: string
}
// Save fires this; the saga PATCHes the draft's object. Succeeded closes the form.
export type UpdateObjectRequestedAction = {
  type: typeof UPDATE_OBJECT_REQUESTED
  projectId: string
  scenarioId: string
}
export type UpdateObjectSucceededAction = {
  type: typeof UPDATE_OBJECT_SUCCEEDED
  projectId: string
  scenarioId: string
}
export type UpdateObjectFailedAction = {
  type: typeof UPDATE_OBJECT_FAILED
  payload: string
}

export type GeometryAction =
  | ListNodesRequestedAction
  | ListNodesSucceededAction
  | ListNodesFailedAction
  | SelectAction
  | SetSearchQueryAction
  | ToggleExpandAction
  | ToggleViewportAction
  | SetModelVisibilityAction
  | RenameRequestedAction
  | RenameSucceededAction
  | RenameFailedAction
  | SetNameErrorAction
  | GroupNodesAction
  | MoveNodesAction
  | DeleteNodeRequestedAction
  | DeleteNodeSucceededAction
  | DeleteNodeFailedAction
  | AddGeometryRequestedAction
  | AddGeometrySucceededAction
  | AddGeometryFailedAction
  | SetDraftValueAction
  | SetDraftNameAction
  | SetDraftMaterialAction
  | CloseCreateFormAction
  | CreateObjectRequestedAction
  | CreateObjectSucceededAction
  | CreateObjectFailedAction
  | UpdateObjectRequestedAction
  | UpdateObjectSucceededAction
  | UpdateObjectFailedAction

// ── Action creators ──────────────────────────────────────────────────────────

export const listNodesRequested = (
  projectId: string,
  scenarioId: string
): ListNodesRequestedAction => ({ type: LIST_NODES_REQUESTED, projectId, scenarioId })

export const listNodesSucceeded = (
  projectId: string,
  scenarioId: string,
  nodes: GeoNode[]
): ListNodesSucceededAction => ({
  type: LIST_NODES_SUCCEEDED,
  projectId,
  scenarioId,
  payload: nodes
})

export const listNodesFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): ListNodesFailedAction => ({ type: LIST_NODES_FAILED, projectId, scenarioId, payload: error })

export const select = (
  projectId: string,
  scenarioId: string,
  id: string,
  multi = false
): SelectAction => ({ type: SELECT, projectId, scenarioId, id, multi })

export const setSearchQuery = (
  projectId: string,
  scenarioId: string,
  query: string
): SetSearchQueryAction => ({ type: SET_SEARCH_QUERY, projectId, scenarioId, payload: query })

export const toggleExpand = (
  projectId: string,
  scenarioId: string,
  id: string
): ToggleExpandAction => ({ type: TOGGLE_EXPAND, projectId, scenarioId, id })

export const toggleViewport = (
  projectId: string,
  scenarioId: string,
  id: string
): ToggleViewportAction => ({ type: TOGGLE_VIEWPORT, projectId, scenarioId, id })

export const renameRequested = (
  projectId: string,
  scenarioId: string,
  id: string,
  name: string
): RenameRequestedAction => ({ type: RENAME_REQUESTED, projectId, scenarioId, id, payload: name })

export const renameSucceeded = (
  projectId: string,
  scenarioId: string,
  id: string,
  name: string
): RenameSucceededAction => ({ type: RENAME_SUCCEEDED, projectId, scenarioId, id, payload: name })

export const renameFailed = (
  projectId: string,
  scenarioId: string,
  id: string,
  error: string
): RenameFailedAction => ({ type: RENAME_FAILED, projectId, scenarioId, id, payload: error })

export const setNameError = (
  projectId: string,
  scenarioId: string,
  id: string,
  error: string | null
): SetNameErrorAction => ({ type: SET_NAME_ERROR, projectId, scenarioId, id, payload: error })

export const deleteNodeRequested = (
  projectId: string,
  scenarioId: string,
  id: string
): DeleteNodeRequestedAction => ({ type: DELETE_NODE_REQUESTED, projectId, scenarioId, id })

export const deleteNodeSucceeded = (
  projectId: string,
  scenarioId: string,
  id: string
): DeleteNodeSucceededAction => ({ type: DELETE_NODE_SUCCEEDED, projectId, scenarioId, id })

export const deleteNodeFailed = (
  projectId: string,
  scenarioId: string,
  id: string,
  error: string
): DeleteNodeFailedAction => ({ type: DELETE_NODE_FAILED, projectId, scenarioId, id, payload: error })

export const groupNodes = (
  projectId: string,
  scenarioId: string,
  nodeIds: string[],
  targetId: string,
  groupId: string
): GroupNodesAction => ({ type: GROUP_NODES, projectId, scenarioId, nodeIds, targetId, groupId })

export const moveNodes = (
  projectId: string,
  scenarioId: string,
  nodeIds: string[],
  toGroupId: string | null
): MoveNodesAction => ({ type: MOVE_NODES, projectId, scenarioId, nodeIds, toGroupId })

export const setModelVisibility = (
  projectId: string,
  scenarioId: string,
  id: string,
  visibility: ModelVisibility
): SetModelVisibilityAction => ({
  type: SET_MODEL_VISIBILITY,
  projectId,
  scenarioId,
  id,
  payload: visibility
})

export const addGeometryRequested = (
  projectId: string,
  scenarioId: string,
  kind: CreatableKind
): AddGeometryRequestedAction => ({ type: ADD_GEOMETRY_REQUESTED, projectId, scenarioId, payload: kind })

export const addGeometrySucceeded = (
  projectId: string,
  scenarioId: string,
  node: { id: string; name: string; kind: CreatableKind }
): AddGeometrySucceededAction => ({
  type: ADD_GEOMETRY_SUCCEEDED,
  projectId,
  scenarioId,
  payload: node
})

export const addGeometryFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): AddGeometryFailedAction => ({ type: ADD_GEOMETRY_FAILED, projectId, scenarioId, payload: error })

// ── Edit-object draft creators ───────────────────────────────────────────────

export const setDraftValue = (property: string, value: string): SetDraftValueAction => ({
  type: SET_DRAFT_VALUE,
  property,
  payload: value
})

export const setDraftName = (name: string): SetDraftNameAction => ({
  type: SET_DRAFT_NAME,
  payload: name
})

export const setDraftMaterial = (materialId: number | null): SetDraftMaterialAction => ({
  type: SET_DRAFT_MATERIAL,
  payload: materialId
})

export const closeCreateForm = (): CloseCreateFormAction => ({ type: CLOSE_CREATE_FORM })

export const createObjectRequested = (
  projectId: string,
  scenarioId: string,
  objectTypeId: number,
  objectName: string,
  name: string
): CreateObjectRequestedAction => ({
  type: CREATE_OBJECT_REQUESTED,
  projectId,
  scenarioId,
  objectTypeId,
  objectName,
  name
})

export const createObjectSucceeded = (
  projectId: string,
  scenarioId: string,
  payload: {
    node: GeoNode
    values: Record<string, string>
    objectTypeId: number
    objectName: string
  }
): CreateObjectSucceededAction => ({
  type: CREATE_OBJECT_SUCCEEDED,
  projectId,
  scenarioId,
  payload
})

export const createObjectFailed = (error: string): CreateObjectFailedAction => ({
  type: CREATE_OBJECT_FAILED,
  payload: error
})

export const updateObjectRequested = (
  projectId: string,
  scenarioId: string
): UpdateObjectRequestedAction => ({ type: UPDATE_OBJECT_REQUESTED, projectId, scenarioId })

export const updateObjectSucceeded = (
  projectId: string,
  scenarioId: string
): UpdateObjectSucceededAction => ({ type: UPDATE_OBJECT_SUCCEEDED, projectId, scenarioId })

export const updateObjectFailed = (error: string): UpdateObjectFailedAction => ({
  type: UPDATE_OBJECT_FAILED,
  payload: error
})
