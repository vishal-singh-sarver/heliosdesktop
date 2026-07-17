// Domain types for the Geometry slice — imported by actions.ts, reducer.ts and
// selectors.ts to avoid circular deps. Everything here is plain JSON (no Dates,
// Maps, or class instances) so it is safe to hold in Redux.

// Leaf kinds vs. a group container. Groups hold leaves only (single-level).
export type GeoNodeKind = 'ground' | 'imported' | 'group'

// Per-model visibility, keyed by the catalog model id (GET /api/catalog/
// model-types, §4.4). Mirrors the API's `visibility.models` map. A model id
// absent from the map defaults to visible (`true`).
export type ModelVisibility = Record<number, boolean>

// A node in the Saved Geometries tree — either a leaf geometry or a group.
export interface GeoNode {
  id: string
  name: string // "Ground.001" | "Group.001"
  kind: GeoNodeKind
  parentId: string | null // group id, or null at the root
  childIds: string[] // ordered children; always [] for leaves
  expanded: boolean // groups only (ignored for leaves)
  visibleInViewport: boolean // 👁 eye toggle → visibility.viewport
  renderEnabled: boolean // render icon (row) → visibility.render
  modelVisibility: ModelVisibility // per-model kebab toggles → visibility.models
}

// Tree load lifecycle for the active scenario.
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

// Cached per-object detail for the right-panel form, keyed by node id. Filled
// the first time a ground is fetched (or created/saved) so re-clicking it serves
// from memory instead of a fresh GET.
export interface ObjectDetail {
  values: Record<string, string>
  objectTypeId: number
  objectName: string
}

// ── Edit-object draft (right-panel Properties form) ─────────────────────────
//
// Clicking +Ground POSTs an object with default values immediately; the response
// opens this draft, populated with the persisted object's values. The draft is
// the in-progress edit for ONE object at a time (the active scenario's), keyed
// by raw string field values so inputs stay controlled. Save PATCHes the object;
// Cancel DELETEs it. The node is already in the tree (it exists on the backend).
export interface CreateDraft {
  objectId: string // backend id of the object (PATCH/DELETE target)
  objectTypeId: number // catalog object type id (Ground = 1)
  objectName: string // catalog `object` name, e.g. "Ground"
  name: string // node name, e.g. "Ground.001" (read-only; rename is separate)
  values: Record<string, string> // catalog property name -> raw input value
  materialId: number | null // selected material (optional)
  // true = just created via +Ground (Cancel DELETEs it); false = opened by
  // clicking an existing ground (Cancel just closes).
  isNew: boolean
  saving: boolean
  saveError: string | null
  // Backend rejection of a name change (e.g. a duplicate), shown below the name
  // field in THIS form only. Scoped to the draft — not the tree's shared
  // nameErrors map — so a rejected rename never leaks onto the left tree row
  // (whose committed name is still the valid old one) and can't go stale there.
  nameError: string | null
}

// All geometry state for one scenario scope (keyed in the slice by
// `${projectId}::${scenarioId}`, matching the Weather *ByScope convention).
export interface ScenarioGeometry {
  nodesById: Record<string, GeoNode>
  rootOrder: string[] // top-level order (leaves + groups)
  selectedIds: string[]
  searchQuery: string
  nameErrors: Record<string, string> // inline rename validation, keyed by node id
  detailsById: Record<string, ObjectDetail> // cached property values per object
  // The node +Ground just created, so its row can flash the "just appeared" cue.
  // Cleared once the cue has run (the tree dispatches it), so a remount can't
  // replay it.
  lastCreatedId: string | null
  loadStatus: LoadStatus
  loadError: string | null
}

// Slice root: one ScenarioGeometry per scope key, plus a single transient
// create-object draft (the right-panel Properties form, one at a time).
export interface GeometryState {
  byScope: Record<string, ScenarioGeometry>
  createDraft: CreateDraft | null
  // Bumped every time a create form is opened. The RightPanel watches this to
  // re-expand on each +Ground, even when a draft is already active and the user
  // had collapsed the panel (presence alone wouldn't change, so it wouldn't
  // re-trigger).
  createDraftNonce: number
}

// ── Action payload shapes ───────────────────────────────────────────────────
// Actions carry projectId + scenarioId; the reducer derives the scope key
// (same pattern as Weather).

export interface ScopeRef {
  projectId: string
  scenarioId: string
}

export interface SelectPayload extends ScopeRef {
  id: string
  multi: boolean
}

export interface RenameRequestedPayload extends ScopeRef {
  id: string
  name: string
}

export interface SetNameErrorPayload extends ScopeRef {
  id: string
  error: string | null
}

// MOVE_NODES — drop into an existing group, or to root (toGroupId: null).
// (GROUP_NODES carries `memberIds` directly on its action; see actions.ts.)
export interface MoveNodesPayload extends ScopeRef {
  nodeIds: string[]
  toGroupId: string | null
}

// SET_MODEL_ON — toggle one model (by catalog id) for one node.
export interface SetModelOnPayload extends ScopeRef {
  id: string
  modelId: number
  on: boolean
}
