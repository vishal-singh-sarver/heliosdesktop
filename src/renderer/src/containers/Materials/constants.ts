// Action types — `FEATURE/VERB_NOUN` SCREAMING_SNAKE_CASE.

// Load the persisted material library (GET /library/groups).
export const LIST_MATERIALS_REQUESTED = 'app/Materials/LIST_MATERIALS_REQUESTED' as const
export const LIST_MATERIALS_SUCCEEDED = 'app/Materials/LIST_MATERIALS_SUCCEEDED' as const
export const LIST_MATERIALS_FAILED = 'app/Materials/LIST_MATERIALS_FAILED' as const

// +Add Materials — create the material on the backend straight away as an EMPTY
// group (POST /library/groups). The returned group id opens the right-panel
// Properties form, where each parameter group is then saved onto it.
export const CREATE_MATERIAL_REQUESTED = 'app/Materials/CREATE_MATERIAL_REQUESTED' as const
export const CREATE_MATERIAL_SUCCEEDED = 'app/Materials/CREATE_MATERIAL_SUCCEEDED' as const
export const CREATE_MATERIAL_FAILED = 'app/Materials/CREATE_MATERIAL_FAILED' as const

// Double-click rename (PUT /library/groups/{id}).
export const RENAME_MATERIAL_REQUESTED = 'app/Materials/RENAME_MATERIAL_REQUESTED' as const
export const RENAME_MATERIAL_SUCCEEDED = 'app/Materials/RENAME_MATERIAL_SUCCEEDED' as const
export const RENAME_MATERIAL_FAILED = 'app/Materials/RENAME_MATERIAL_FAILED' as const
// Clears a stale backend rename error (e.g. when the editor reopens).
export const SET_NAME_ERROR = 'app/Materials/SET_NAME_ERROR' as const

// Drop a material row from the client view (dispatched by the delete saga on
// success).
export const REMOVE_MATERIAL = 'app/Materials/REMOVE_MATERIAL' as const
// Delete the whole material — DELETE /library/groups/{id}. Confirmed via a dialog
// first (left row + right form). Pessimistic: the row goes only on success.
export const DELETE_MATERIAL_REQUESTED = 'app/Materials/DELETE_MATERIAL_REQUESTED' as const
export const DELETE_MATERIAL_FAILED = 'app/Materials/DELETE_MATERIAL_FAILED' as const

// Eye icon — flip the client-side visibility flag.
export const TOGGLE_MATERIAL_VISIBILITY = 'app/Materials/TOGGLE_MATERIAL_VISIBILITY' as const
// Row selection + search.
export const SELECT_MATERIAL = 'app/Materials/SELECT_MATERIAL' as const
export const SET_SEARCH_QUERY = 'app/Materials/SET_SEARCH_QUERY' as const

// ── Right-panel material Properties form ─────────────────────────────────────
// Open a SAVED material: clicking a row fetches it (GET /library/groups/{id});
// LOADED populates the form with one card per member, each already `saved`.
export const OPEN_SAVED_MATERIAL_REQUESTED = 'app/Materials/OPEN_SAVED_MATERIAL_REQUESTED' as const
export const OPEN_SAVED_MATERIAL_LOADED = 'app/Materials/OPEN_SAVED_MATERIAL_LOADED' as const
export const OPEN_SAVED_MATERIAL_FAILED = 'app/Materials/OPEN_SAVED_MATERIAL_FAILED' as const

// Load a group's member/property detail into the cache WITHOUT opening the
// editor form — used by the geometry Materials popup to show a picked material's
// properties. Reuses the same detailsById cache + GET as OPEN_SAVED_MATERIAL,
// minus the form side effect.
export const LOAD_MATERIAL_DETAIL_REQUESTED = 'app/Materials/LOAD_MATERIAL_DETAIL_REQUESTED' as const
export const MATERIAL_DETAIL_LOADED = 'app/Materials/MATERIAL_DETAIL_LOADED' as const

// "+ Add Material Type" — append a new, empty "Parameter Group.0N" card (client
// -side until its own Save persists it).
export const ADD_PARAMETER_GROUP = 'app/Materials/ADD_PARAMETER_GROUP' as const
// Drop a card from the form (dispatched by the card-delete saga on success, and
// directly for a card that was never saved).
export const REMOVE_PARAMETER_GROUP = 'app/Materials/REMOVE_PARAMETER_GROUP' as const
// A card's material-type Select — set (or clear) its type. Locked once saved.
export const SET_PARAMETER_GROUP_TYPE = 'app/Materials/SET_PARAMETER_GROUP_TYPE' as const
// A property edit inside one card (values are per-card, not shared).
export const SET_PARAMETER_GROUP_VALUE = 'app/Materials/SET_PARAMETER_GROUP_VALUE' as const

// A card's own Save button: POST /groups/{id}/materials the first time, then
// PATCH /groups/{id}/materials/{typeId} on every later save.
export const SAVE_PARAMETER_GROUP_REQUESTED =
  'app/Materials/SAVE_PARAMETER_GROUP_REQUESTED' as const
export const SAVE_PARAMETER_GROUP_SUCCEEDED =
  'app/Materials/SAVE_PARAMETER_GROUP_SUCCEEDED' as const
export const SAVE_PARAMETER_GROUP_FAILED = 'app/Materials/SAVE_PARAMETER_GROUP_FAILED' as const

// A card's Delete: DELETE /groups/{id}/materials/{typeId} when it was saved,
// otherwise just drop the card.
export const DELETE_PARAMETER_GROUP_REQUESTED =
  'app/Materials/DELETE_PARAMETER_GROUP_REQUESTED' as const
export const DELETE_PARAMETER_GROUP_FAILED = 'app/Materials/DELETE_PARAMETER_GROUP_FAILED' as const

// Header rename input + closing the form.
export const SET_MATERIAL_DRAFT_NAME = 'app/Materials/SET_MATERIAL_DRAFT_NAME' as const
export const CLOSE_MATERIAL_DRAFT = 'app/Materials/CLOSE_MATERIAL_DRAFT' as const
