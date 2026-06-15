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

// ── Visibility: eye = 3D viewport, render icon / dropdown = models ───────────
export const TOGGLE_VIEWPORT = 'app/Geometry/TOGGLE_VIEWPORT' as const
export const SET_MODEL_VISIBILITY = 'app/Geometry/SET_MODEL_VISIBILITY' as const

// ── Rename a group (inline edit + validation) ───────────────────────────────
export const RENAME_REQUESTED = 'app/Geometry/RENAME_REQUESTED' as const
export const RENAME_SUCCEEDED = 'app/Geometry/RENAME_SUCCEEDED' as const
export const RENAME_FAILED = 'app/Geometry/RENAME_FAILED' as const
export const SET_NAME_ERROR = 'app/Geometry/SET_NAME_ERROR' as const

// ── Grouping (single level): leaf→leaf creates a group; leaf→group/root moves ─
export const GROUP_NODES = 'app/Geometry/GROUP_NODES' as const
export const MOVE_NODES = 'app/Geometry/MOVE_NODES' as const

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
