// Action types for the Geometry slice. Prefix + `as const` follow the project
// convention (`app/<Container>/<ACTION>`); async flows use the
// _REQUESTED / _SUCCEEDED / _FAILED triplet.

// ── Load the saved-geometries tree (per scenario) ───────────────────────────
export const LIST_NODES_REQUESTED = 'app/Geometry/LIST_NODES_REQUESTED' as const
export const LIST_NODES_SUCCEEDED = 'app/Geometry/LIST_NODES_SUCCEEDED' as const
export const LIST_NODES_FAILED = 'app/Geometry/LIST_NODES_FAILED' as const

// ── Create a geometry (Ground). The payload to the backend is just the
//    generated { id, name } for now; the full params come from the right-panel
//    Properties form later (separate task). ─────────────────────────────────
export const ADD_GEOMETRY_REQUESTED = 'app/Geometry/ADD_GEOMETRY_REQUESTED' as const
export const ADD_GEOMETRY_SUCCEEDED = 'app/Geometry/ADD_GEOMETRY_SUCCEEDED' as const
export const ADD_GEOMETRY_FAILED = 'app/Geometry/ADD_GEOMETRY_FAILED' as const

// ── Local UI state (no async) ───────────────────────────────────────────────
export const SELECT = 'app/Geometry/SELECT' as const
export const SET_SEARCH_QUERY = 'app/Geometry/SET_SEARCH_QUERY' as const
export const TOGGLE_EXPAND = 'app/Geometry/TOGGLE_EXPAND' as const

// ── Visibility: eye = viewport, render icon = render, kebab = per-model ──────
// All three apply optimistically in the reducer, then a saga persists each via
// PATCH /objects/{id} { visibility } (§5.4): TOGGLE_VIEWPORT → { viewport },
// TOGGLE_RENDER → { render }, SET_MODEL_ON → { models: { "<id>": bool } }. On a
// failed PATCH the saga dispatches FAILED, which reverts the optimistic flip
// (by field, and modelId for a per-model revert).
export const TOGGLE_VIEWPORT = 'app/Geometry/TOGGLE_VIEWPORT' as const
export const TOGGLE_RENDER = 'app/Geometry/TOGGLE_RENDER' as const
export const SET_MODEL_ON = 'app/Geometry/SET_MODEL_ON' as const
export const VISIBILITY_SYNC_FAILED = 'app/Geometry/VISIBILITY_SYNC_FAILED' as const

// ── Rename a group (inline edit + validation) ───────────────────────────────
export const RENAME_REQUESTED = 'app/Geometry/RENAME_REQUESTED' as const
export const RENAME_SUCCEEDED = 'app/Geometry/RENAME_SUCCEEDED' as const
export const RENAME_FAILED = 'app/Geometry/RENAME_FAILED' as const
export const SET_NAME_ERROR = 'app/Geometry/SET_NAME_ERROR' as const

// ── Grouping (single level): leaf→leaf creates a group (persisted via
//    POST /groups); leaf→group/root moves. The create flow is the async
//    triplet; MOVE is still local-only (separate PATCH task). ────────────────
export const GROUP_NODES_REQUESTED = 'app/Geometry/GROUP_NODES_REQUESTED' as const
export const GROUP_NODES_SUCCEEDED = 'app/Geometry/GROUP_NODES_SUCCEEDED' as const
export const GROUP_NODES_FAILED = 'app/Geometry/GROUP_NODES_FAILED' as const
// Move leaf(s) into a group, between groups, or back to root — persisted via
// PATCH /objects/{id} { group_id } (§5.4).
export const MOVE_NODES_REQUESTED = 'app/Geometry/MOVE_NODES_REQUESTED' as const
export const MOVE_NODES_SUCCEEDED = 'app/Geometry/MOVE_NODES_SUCCEEDED' as const
export const MOVE_NODES_FAILED = 'app/Geometry/MOVE_NODES_FAILED' as const

// ── Delete a node. A leaf deletes itself; a group also removes its children. ─
export const DELETE_NODE_REQUESTED = 'app/Geometry/DELETE_NODE_REQUESTED' as const
export const DELETE_NODE_SUCCEEDED = 'app/Geometry/DELETE_NODE_SUCCEEDED' as const
export const DELETE_NODE_FAILED = 'app/Geometry/DELETE_NODE_FAILED' as const

// ── Create-then-edit object (right-panel Properties form). +Ground POSTs an
//    object with default values immediately (CREATE_OBJECT), which opens the
//    form populated from the response; Save PATCHes it (UPDATE_OBJECT); Cancel
//    DELETEs it (reuses DELETE_NODE + CLOSE_CREATE_FORM). ─
export const SET_DRAFT_VALUE = 'app/Geometry/SET_DRAFT_VALUE' as const
export const SET_DRAFT_NAME = 'app/Geometry/SET_DRAFT_NAME' as const
export const SET_DRAFT_MATERIAL = 'app/Geometry/SET_DRAFT_MATERIAL' as const
export const CLOSE_CREATE_FORM = 'app/Geometry/CLOSE_CREATE_FORM' as const
export const CREATE_OBJECT_REQUESTED = 'app/Geometry/CREATE_OBJECT_REQUESTED' as const
export const CREATE_OBJECT_SUCCEEDED = 'app/Geometry/CREATE_OBJECT_SUCCEEDED' as const
export const CREATE_OBJECT_FAILED = 'app/Geometry/CREATE_OBJECT_FAILED' as const
export const UPDATE_OBJECT_REQUESTED = 'app/Geometry/UPDATE_OBJECT_REQUESTED' as const
export const UPDATE_OBJECT_SUCCEEDED = 'app/Geometry/UPDATE_OBJECT_SUCCEEDED' as const
export const UPDATE_OBJECT_FAILED = 'app/Geometry/UPDATE_OBJECT_FAILED' as const
// Clicking a ground GETs its detail and opens the form to view/edit it.
export const LOAD_OBJECT_REQUESTED = 'app/Geometry/LOAD_OBJECT_REQUESTED' as const
export const LOAD_OBJECT_SUCCEEDED = 'app/Geometry/LOAD_OBJECT_SUCCEEDED' as const
export const LOAD_OBJECT_FAILED = 'app/Geometry/LOAD_OBJECT_FAILED' as const
