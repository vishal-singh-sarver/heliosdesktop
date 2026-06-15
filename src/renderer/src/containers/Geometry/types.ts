// Domain types for the Geometry slice — imported by actions.ts, reducer.ts and
// selectors.ts to avoid circular deps. Everything here is plain JSON (no Dates,
// Maps, or class instances) so it is safe to hold in Redux.

// The five models shown in the Models dropdown / left-panel Models section.
export type ModelKey =
  | 'solar_position'
  | 'radiation'
  | 'energy_balance'
  | 'photosynthesis'
  | 'stomatal_conductance'

// Leaf kinds vs. a group container. Groups hold leaves only (single-level).
export type GeoNodeKind = 'ground' | 'imported' | 'group'

// Model visibility is mutually exclusive between the render-icon toggle
// (`all` / `none`) and the per-model dropdown (`custom`). When `none`, the
// dropdown is disabled (spec).
export type ModelVisibility =
  | { mode: 'all' | 'none' }
  | { mode: 'custom'; perModel: Record<ModelKey, boolean> }

// A node in the Saved Geometries tree — either a leaf geometry or a group.
export interface GeoNode {
  id: string
  name: string // "Ground.001" | "Group.001"
  kind: GeoNodeKind
  parentId: string | null // group id, or null at the root
  childIds: string[] // ordered children; always [] for leaves
  expanded: boolean // groups only (ignored for leaves)
  visibleInViewport: boolean // 👁 eye toggle
  modelVisibility: ModelVisibility // render icon / models dropdown
}

// Per-node optimistic-sync status (mirrors Weather's cellSync convention).
export type NodeSyncStatus = 'idle' | 'pending' | 'error'

// Tree load lifecycle for the active scenario.
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

// Monotonic counters drive the default names (Ground.001, Group.001).
export interface GeometryCounters {
  ground: number
  group: number
}

// ── Edit-object draft (right-panel Properties form) ─────────────────────────
//
// Clicking +Ground POSTs an object with default values immediately; the response
// opens this draft, populated with the persisted object's values. The draft is
// the in-progress edit for ONE object at a time (the active scenario's), keyed
// by raw string field values so inputs stay controlled. Save PATCHes the object;
// Cancel DELETEs it. The node is already in the tree (it exists on the backend).
export interface CreateDraft {
  objectId: string // backend id of the created object (PATCH/DELETE target)
  objectTypeId: number // catalog object type id (Ground = 1)
  objectName: string // catalog `object` name, e.g. "Ground"
  name: string // node name, e.g. "Ground.001" (read-only; rename is separate)
  values: Record<string, string> // catalog property name -> raw input value
  materialId: number | null // selected material (optional)
  saving: boolean
  saveError: string | null
}

// All geometry state for one scenario scope (keyed in the slice by
// `${projectId}::${scenarioId}`, matching the Weather *ByScope convention).
export interface ScenarioGeometry {
  nodesById: Record<string, GeoNode>
  rootOrder: string[] // top-level order (leaves + groups)
  selectedIds: string[]
  searchQuery: string
  counters: GeometryCounters
  syncById: Record<string, NodeSyncStatus>
  nameErrors: Record<string, string> // inline rename validation, keyed by node id
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

// ADD_GEOMETRY_REQUESTED — the saga computes the name (Ground.00N) and id, then
// sends only { id, name } to the backend/mock.
export interface AddGeometryRequestedPayload extends ScopeRef {
  kind: Extract<GeoNodeKind, 'ground' | 'imported'>
}

export interface AddGeometrySucceededPayload extends ScopeRef {
  id: string
  name: string
  kind: GeoNodeKind
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

// GROUP_NODES — drop leaf(s) onto a target leaf to create a new group holding
// both. MOVE_NODES — drop into an existing group, or to root (toGroupId: null).
export interface GroupNodesPayload extends ScopeRef {
  nodeIds: string[]
  targetId: string
}

export interface MoveNodesPayload extends ScopeRef {
  nodeIds: string[]
  toGroupId: string | null
}

export interface SetModelVisibilityPayload extends ScopeRef {
  id: string
  visibility: ModelVisibility
}
