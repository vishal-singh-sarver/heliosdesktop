// Action types — `FEATURE/VERB_NOUN` SCREAMING_SNAKE_CASE.

// Load the persisted material library (§7.2). The only backend-wired flow today.
export const LIST_MATERIALS_REQUESTED = 'app/Materials/LIST_MATERIALS_REQUESTED' as const
export const LIST_MATERIALS_SUCCEEDED = 'app/Materials/LIST_MATERIALS_SUCCEEDED' as const
export const LIST_MATERIALS_FAILED = 'app/Materials/LIST_MATERIALS_FAILED' as const

// +Add Materials — append an unsaved, client-only Material.NNN row. The real
// create (POST §7.1) happens later from the right-panel form; until saved there,
// this row is ephemeral and disappears on the next list refresh.
export const ADD_LOCAL_MATERIAL = 'app/Materials/ADD_LOCAL_MATERIAL' as const
// Double-click rename → PATCH .../library/{id}/rename (§7.5). Local (unsaved)
// rows rename client-side only (no backend id to PATCH).
export const RENAME_MATERIAL_REQUESTED = 'app/Materials/RENAME_MATERIAL_REQUESTED' as const
export const RENAME_MATERIAL_SUCCEEDED = 'app/Materials/RENAME_MATERIAL_SUCCEEDED' as const
export const RENAME_MATERIAL_FAILED = 'app/Materials/RENAME_MATERIAL_FAILED' as const
// Clears a stale backend rename error (e.g. when the editor reopens).
export const SET_NAME_ERROR = 'app/Materials/SET_NAME_ERROR' as const
// Trash icon — drop the row from the client view (not yet backend-wired).
export const REMOVE_MATERIAL = 'app/Materials/REMOVE_MATERIAL' as const
// Eye icon — flip the client-side visibility flag.
export const TOGGLE_MATERIAL_VISIBILITY = 'app/Materials/TOGGLE_MATERIAL_VISIBILITY' as const
// Row selection + search.
export const SELECT_MATERIAL = 'app/Materials/SELECT_MATERIAL' as const
export const SET_SEARCH_QUERY = 'app/Materials/SET_SEARCH_QUERY' as const

// ── Right-panel material Properties draft (local-only) ───────────────────────
// +Add Materials opens the material in the right-panel Properties form. These
// mirror Geometry's draft actions; nothing is persisted yet (Save is disabled),
// so they only mutate the client draft. OPEN bumps a monotonic nonce the
// RightPanel watches to auto-expand (same mechanism as Geometry's createDraft).
export const OPEN_MATERIAL_DRAFT = 'app/Materials/OPEN_MATERIAL_DRAFT' as const
// "+ Add Material Type" — append a new, empty "Parameter Group.0N" to the draft.
export const ADD_PARAMETER_GROUP = 'app/Materials/ADD_PARAMETER_GROUP' as const
// A parameter group's trash — drop that group from the draft.
export const REMOVE_PARAMETER_GROUP = 'app/Materials/REMOVE_PARAMETER_GROUP' as const
// A parameter group's material-type Select — set (or clear) the group's type.
export const SET_PARAMETER_GROUP_TYPE = 'app/Materials/SET_PARAMETER_GROUP_TYPE' as const
// A parameter field edit.
export const SET_MATERIAL_DRAFT_VALUE = 'app/Materials/SET_MATERIAL_DRAFT_VALUE' as const
// Header rename input (kept in sync with the row via RENAME_MATERIAL).
export const SET_MATERIAL_DRAFT_NAME = 'app/Materials/SET_MATERIAL_DRAFT_NAME' as const
// Close the Properties form (draft discarded).
export const CLOSE_MATERIAL_DRAFT = 'app/Materials/CLOSE_MATERIAL_DRAFT' as const
