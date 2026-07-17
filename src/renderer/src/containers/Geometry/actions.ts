import {
  CLEAR_CREATE_HIGHLIGHT,
  CLOSE_CREATE_FORM,
  CREATE_OBJECT_FAILED,
  CREATE_OBJECT_REQUESTED,
  CREATE_OBJECT_SUCCEEDED,
  DELETE_NODE_FAILED,
  DELETE_NODE_REQUESTED,
  DELETE_NODE_SUCCEEDED,
  GROUP_NODES_REQUESTED,
  GROUP_NODES_SUCCEEDED,
  GROUP_NODES_FAILED,
  LOAD_OBJECT_FAILED,
  LOAD_OBJECT_REQUESTED,
  LOAD_OBJECT_SUCCEEDED,
  LIST_NODES_REQUESTED,
  MOVE_NODES_REQUESTED,
  REORDER_NODES,
  MOVE_NODES_SUCCEEDED,
  MOVE_NODES_FAILED,
  LIST_NODES_SUCCEEDED,
  LIST_NODES_FAILED,
  RENAME_FAILED,
  RENAME_REQUESTED,
  RENAME_SUCCEEDED,
  SELECT,
  SET_DRAFT_MATERIAL,
  SET_DRAFT_NAME,
  SET_DRAFT_VALUE,
  SET_MODEL_ON,
  SET_NAME_ERROR,
  SET_SEARCH_QUERY,
  TOGGLE_EXPAND,
  TOGGLE_RENDER,
  TOGGLE_VIEWPORT,
  UPDATE_OBJECT_FAILED,
  UPDATE_OBJECT_REQUESTED,
  UPDATE_OBJECT_SUCCEEDED,
  VISIBILITY_SYNC_FAILED
} from './constants'
import type { GeoNode } from './types'

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
export type ToggleRenderAction = {
  type: typeof TOGGLE_RENDER
  projectId: string
  scenarioId: string
  id: string
  // All catalog model ids — the render icon is a master switch that sets every
  // model to the new render value (§5: render off ⇒ all models false).
  modelIds: number[]
}
export type SetModelOnAction = {
  type: typeof SET_MODEL_ON
  projectId: string
  scenarioId: string
  id: string
  modelId: number
  on: boolean
  // All catalog model ids — needed to keep the render flag (any model on) in sync.
  modelIds: number[]
}
// Which optimistic toggle a sync result refers to — drives the FAILED revert.
// For 'model', `modelId` identifies which per-model flag to flip back.
export type VisibilityField = 'viewport' | 'render' | 'model'
export type VisibilitySyncFailedAction = {
  type: typeof VISIBILITY_SYNC_FAILED
  projectId: string
  scenarioId: string
  id: string
  field: VisibilityField
  modelId?: number
  payload: string
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
export type GroupNodesRequestedAction = {
  type: typeof GROUP_NODES_REQUESTED
  projectId: string
  scenarioId: string
  memberIds: string[] // target + dragged leaves, in member order
}
export type GroupNodesSucceededAction = {
  type: typeof GROUP_NODES_SUCCEEDED
  projectId: string
  scenarioId: string
  payload: { id: string; name: string; memberIds: string[] } // server-owned id + name
}
export type GroupNodesFailedAction = {
  type: typeof GROUP_NODES_FAILED
  projectId: string
  scenarioId: string
  payload: string
}
export type MoveNodesRequestedAction = {
  type: typeof MOVE_NODES_REQUESTED
  projectId: string
  scenarioId: string
  nodeIds: string[]
  toGroupId: string | null // null = move to root (ungroup)
}
export type MoveNodesSucceededAction = {
  type: typeof MOVE_NODES_SUCCEEDED
  projectId: string
  scenarioId: string
  nodeIds: string[]
  toGroupId: string | null
}
export type MoveNodesFailedAction = {
  type: typeof MOVE_NODES_FAILED
  projectId: string
  scenarioId: string
  payload: string
}
// Client-only reorder: drop on the edge of a row to place the dragged leaf at
// root just before/after the target row.
export type ReorderNodesAction = {
  type: typeof REORDER_NODES
  projectId: string
  scenarioId: string
  nodeIds: string[]
  targetId: string
  position: 'before' | 'after'
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
export type ClearCreateHighlightAction = {
  type: typeof CLEAR_CREATE_HIGHLIGHT
  projectId: string
  scenarioId: string
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
  // The saved object id, so the reducer can keep the form open showing the saved
  // values. The name is not part of Save — it commits on blur — so it isn't here.
  payload: { objectId: string; propsChanged: boolean }
}
export type UpdateObjectFailedAction = {
  type: typeof UPDATE_OBJECT_FAILED
  payload: string
}
// Clicking a ground fires this; the saga GETs its detail. Succeeded opens the
// form (the node is already in the tree).
export type LoadObjectRequestedAction = {
  type: typeof LOAD_OBJECT_REQUESTED
  projectId: string
  scenarioId: string
  id: string
}
export type LoadObjectSucceededAction = {
  type: typeof LOAD_OBJECT_SUCCEEDED
  projectId: string
  scenarioId: string
  payload: {
    node: GeoNode
    values: Record<string, string>
    objectTypeId: number
    objectName: string
  }
}
export type LoadObjectFailedAction = {
  type: typeof LOAD_OBJECT_FAILED
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
  | ToggleRenderAction
  | SetModelOnAction
  | VisibilitySyncFailedAction
  | RenameRequestedAction
  | RenameSucceededAction
  | RenameFailedAction
  | SetNameErrorAction
  | GroupNodesRequestedAction
  | GroupNodesSucceededAction
  | GroupNodesFailedAction
  | MoveNodesRequestedAction
  | ReorderNodesAction
  | MoveNodesSucceededAction
  | MoveNodesFailedAction
  | DeleteNodeRequestedAction
  | DeleteNodeSucceededAction
  | DeleteNodeFailedAction
  | SetDraftValueAction
  | SetDraftNameAction
  | SetDraftMaterialAction
  | CloseCreateFormAction
  | CreateObjectRequestedAction
  | CreateObjectSucceededAction
  | CreateObjectFailedAction
  | ClearCreateHighlightAction
  | UpdateObjectRequestedAction
  | UpdateObjectSucceededAction
  | UpdateObjectFailedAction
  | LoadObjectRequestedAction
  | LoadObjectSucceededAction
  | LoadObjectFailedAction

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

export const toggleRender = (
  projectId: string,
  scenarioId: string,
  id: string,
  modelIds: number[]
): ToggleRenderAction => ({ type: TOGGLE_RENDER, projectId, scenarioId, id, modelIds })

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

export const groupNodesRequested = (
  projectId: string,
  scenarioId: string,
  memberIds: string[]
): GroupNodesRequestedAction => ({ type: GROUP_NODES_REQUESTED, projectId, scenarioId, memberIds })

export const groupNodesSucceeded = (
  projectId: string,
  scenarioId: string,
  group: { id: string; name: string; memberIds: string[] }
): GroupNodesSucceededAction => ({
  type: GROUP_NODES_SUCCEEDED,
  projectId,
  scenarioId,
  payload: group
})

export const groupNodesFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): GroupNodesFailedAction => ({ type: GROUP_NODES_FAILED, projectId, scenarioId, payload: error })

export const moveNodesRequested = (
  projectId: string,
  scenarioId: string,
  nodeIds: string[],
  toGroupId: string | null
): MoveNodesRequestedAction => ({
  type: MOVE_NODES_REQUESTED,
  projectId,
  scenarioId,
  nodeIds,
  toGroupId
})

export const reorderNodes = (
  projectId: string,
  scenarioId: string,
  nodeIds: string[],
  targetId: string,
  position: 'before' | 'after'
): ReorderNodesAction => ({
  type: REORDER_NODES,
  projectId,
  scenarioId,
  nodeIds,
  targetId,
  position
})

export const moveNodesSucceeded = (
  projectId: string,
  scenarioId: string,
  nodeIds: string[],
  toGroupId: string | null
): MoveNodesSucceededAction => ({
  type: MOVE_NODES_SUCCEEDED,
  projectId,
  scenarioId,
  nodeIds,
  toGroupId
})

export const moveNodesFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): MoveNodesFailedAction => ({ type: MOVE_NODES_FAILED, projectId, scenarioId, payload: error })

export const setModelOn = (
  projectId: string,
  scenarioId: string,
  id: string,
  modelId: number,
  on: boolean,
  modelIds: number[]
): SetModelOnAction => ({
  type: SET_MODEL_ON,
  projectId,
  scenarioId,
  id,
  modelId,
  on,
  modelIds
})

export const visibilitySyncFailed = (
  projectId: string,
  scenarioId: string,
  id: string,
  field: VisibilityField,
  error: string,
  modelId?: number
): VisibilitySyncFailedAction => ({
  type: VISIBILITY_SYNC_FAILED,
  projectId,
  scenarioId,
  id,
  field,
  modelId,
  payload: error
})

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
export const clearCreateHighlight = (
  projectId: string,
  scenarioId: string
): ClearCreateHighlightAction => ({ type: CLEAR_CREATE_HIGHLIGHT, projectId, scenarioId })

export const updateObjectRequested = (
  projectId: string,
  scenarioId: string
): UpdateObjectRequestedAction => ({ type: UPDATE_OBJECT_REQUESTED, projectId, scenarioId })

export const updateObjectSucceeded = (
  projectId: string,
  scenarioId: string,
  payload: { objectId: string; propsChanged: boolean }
): UpdateObjectSucceededAction => ({ type: UPDATE_OBJECT_SUCCEEDED, projectId, scenarioId, payload })

export const updateObjectFailed = (error: string): UpdateObjectFailedAction => ({
  type: UPDATE_OBJECT_FAILED,
  payload: error
})

export const loadObjectRequested = (
  projectId: string,
  scenarioId: string,
  id: string
): LoadObjectRequestedAction => ({ type: LOAD_OBJECT_REQUESTED, projectId, scenarioId, id })

export const loadObjectSucceeded = (
  projectId: string,
  scenarioId: string,
  payload: {
    node: GeoNode
    values: Record<string, string>
    objectTypeId: number
    objectName: string
  }
): LoadObjectSucceededAction => ({ type: LOAD_OBJECT_SUCCEEDED, projectId, scenarioId, payload })

export const loadObjectFailed = (error: string): LoadObjectFailedAction => ({
  type: LOAD_OBJECT_FAILED,
  payload: error
})
