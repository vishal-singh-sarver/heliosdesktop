// Domain types for the Geometry slice — imported by actions.ts, reducer.ts and
// selectors.ts to avoid circular deps. Everything here is plain JSON (no Dates,
// Maps, or class instances) so it is safe to hold in Redux.

// Leaf kinds vs. a group container. Groups hold leaves only (single-level).
//
// The leaf kinds mirror how the geometry entered the scenario — +Ground, +Crop
// or Import from File — which is what picks the row's icon in the tree.
// `ground` and `crop` are the catalog's two object types (migration 017);
// `imported` is anything that arrived as a file. Only +Ground creates today, so
// `crop` is a kind nothing produces yet — it exists so the mapping is complete
// rather than silently falling through to the file icon later.
export type GeoNodeKind = 'ground' | 'crop' | 'imported' | 'group'

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
  // Material-GROUP ids assigned to this leaf (from the objects-list
  // `material_groups`), kept in sync on assign/unassign/save. Lets the 3D viewport
  // re-fetch ONLY the objects that use a saved/deleted material instead of all
  // shown objects. Optional/absent = none known yet (treated as []). Groups don't
  // carry materials, so it stays undefined for group nodes.
  materialGroupIds?: string[]
}

// Tree load lifecycle for the active scenario.
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

// One material-GROUP assignment on an object, as shown under the form's
// Materials row. Baseline rows (parsed from the object GET's `material_groups`)
// carry `materials` — the group's per-type resolved property values, for the
// read-only properties popup; a freshly-picked row has only id+name until the
// object is reloaded. `stale`/`drift` flag a library mismatch (group deleted, or
// a frozen member whose values drifted from the library).
export interface DraftMaterialGroup {
  groupId: string // backend material-GROUP id (stringified), = PATCH group_id
  name: string
  materials?: {
    materialTypeId: number
    materialTypeName: string
    properties: Record<string, number | string | boolean | null>
  }[]
  stale?: boolean
  drift?: boolean
}

// Cached per-object detail for the right-panel form, keyed by node id. Filled
// the first time a ground is fetched (or created/saved) so re-clicking it serves
// from memory instead of a fresh GET.
export interface ObjectDetail {
  values: Record<string, string>
  objectTypeId: number
  objectName: string
  materialGroups: DraftMaterialGroup[] // assigned material groups (from the GET)
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
  // Material-GROUP assignments shown under the form's Materials row: the GET
  // baseline ∪ freshly-picked groups (deduped by groupId).
  materials: DraftMaterialGroup[]
  // Group ids already assigned on the backend (seeded from the GET). Save only
  // PATCHes the groups NOT in this set — the object PATCH is ADD-only, so
  // re-sending an already-assigned group would 409.
  materialBaseline: string[]
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
  // Nodes whose DELETE is in flight. The delete is pessimistic, so the row (and
  // the right-panel form) stay on screen until it lands — without this, a second
  // confirm in that window fired a second DELETE that 404'd on the already-gone
  // object, so one action produced both a success AND a failure toast. Scoped per
  // scenario because object ids are scenario-local. Mirrors Materials' deletingIds.
  deletingIds: string[]
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
  // True from the +Ground POST leaving until it resolves. Slice-level like
  // createDraft (only one create runs at a time) and read by the toolbar to
  // disable +Ground while the request is in flight.
  creating: boolean
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
