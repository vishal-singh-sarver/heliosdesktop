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

// Monotonic counters drive the default names (Ground.001, Group.001).
export interface GeometryCounters {
  ground: number
  group: number
}

// All geometry state for one scenario scope (keyed in the slice by
// `${projectId}::${scenarioId}`, matching the Weather *ByScope convention).
export interface ScenarioGeometry {
  nodesById: Record<string, GeoNode>
  rootOrder: string[] // top-level order (leaves + groups)
  selectedIds: string[]
  searchQuery: string
  counters: GeometryCounters
  nameErrors: Record<string, string> // inline rename validation, keyed by node id
  loadStatus: LoadStatus
  loadError: string | null
}

// Slice root: one ScenarioGeometry per scope key.
export interface GeometryState {
  byScope: Record<string, ScenarioGeometry>
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

// SET_MODEL_ON — toggle one model (by catalog id) for one node.
export interface SetModelOnPayload extends ScopeRef {
  id: string
  modelId: number
  on: boolean
}
