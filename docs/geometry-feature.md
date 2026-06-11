# Saved Geometries — Implementation & Backend-Sync Guide

This document describes **everything** built for the Geometry feature (the
"Geometry" section of the left panel: Saved Geometries tree, create, select,
visibility, rename, drag-to-group, delete). It is exhaustive on purpose — it
covers the mock data, the mock API, the Redux slice, the components, the tests,
and **exactly what must be replaced to talk to the real backend**.

- **Status:** fully implemented and mock-backed. Full unit suite green.
- **Scope key:** all state is scoped per scenario by `` `${projectId}::${scenarioId}` ``.
- **Container:** `src/renderer/src/containers/Geometry/`
- **Mock toggle:** `VITE_USE_MOCK` env flag (currently `true`).

> TL;DR to go live: implement the 4 scenario-scoped backend endpoints in the
> contract below, make `GET …/objects` return the `GeoNode[]` shape (or add a
> mapper in `service.ts`), then set `VITE_USE_MOCK=false`. **No component,
> reducer, saga, or selector changes are required** — `service.ts` is the only
> seam.

---

## 1. The mock seam (the one thing that matters for backend sync)

Everything async flows through **`containers/Geometry/service.ts`**. The sagas
call `service.*` and never touch `api` or the mock directly. `service.ts`
chooses mock vs. real per call:

```ts
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export function listNodes(projectId, scenarioId): Promise<GeoNode[]> {
  if (USE_MOCK) return mockListNodes(projectId, scenarioId)
  return api.get<{ nodes: GeoNode[] }>(API_ROUTES.geometry.list(projectId, scenarioId))
            .then((res) => res.nodes)
}
```

The four service functions:

| Function | Mock | Real (when `USE_MOCK=false`) | Payload sent |
|---|---|---|---|
| `listNodes(projectId, scenarioId)` → `GeoNode[]` | `mockListNodes` | `GET API_ROUTES.geometry.list` → `{ nodes }` | — |
| `createGeometry(projectId, scenarioId, {id,name,kind})` → `void` | `mockCreateGeometry` | `POST API_ROUTES.geometry.create` | **`{ id, name }`** only |
| `renameGroup(projectId, scenarioId, id, name)` → `void` | `mockRenameGroup` | `PATCH API_ROUTES.geometry.rename` | `{ name }` |
| `deleteNode(projectId, scenarioId, id)` → `void` | `mockDeleteNode` | `DELETE API_ROUTES.geometry.remove` | — |

**To sync with the backend you only ever edit `service.ts`** (and possibly add
a response→`GeoNode` mapper — see §6).

---

## 2. Environment flag

Defined in `.env` and `.env.example` at the repo root:

```
VITE_USE_MOCK=true
```

- `true`  → Geometry served from the in-memory mock (`mockData.ts`).
- `false` (or unset) → Geometry hits the real backend via `api` + `API_ROUTES.geometry`.

Read once in `service.ts` as `import.meta.env.VITE_USE_MOCK === 'true'`.
Because it's read at module load, **changing it requires restarting `npm run dev`.**

---

## 3. Mock data — `containers/Geometry/mockData.ts`

A **stateful, per-scenario, in-memory fake backend**. It persists across calls
within a session (so adds/deletes stick), simulates latency, and can be forced
to error. Every returned node is a deep copy so Redux owns its data.

### 3.1 Seed (created lazily the first time a scope is read)

```
Ground.001            (id: geo-ground-1, root leaf)
Group.001             (id: geo-group-1, root group, collapsed) → children:
   ├─ Ground.003      (id: geo-ground-3)
   └─ Ground.004      (id: geo-ground-4)
Ground.002            (id: geo-ground-2, root leaf)
```

Because the seed has up to `Ground.004` and `Group.001`, the first "Add Ground"
produces `Ground.005`, the first new group is `Group.002` (counters seed from
existing names — see §9).

### 3.2 `mockConfig` (tweak at runtime from the devtools console to exercise UI states)

```ts
export const mockConfig = {
  latencyMs: 350,          // simulated network delay for every call
  forceListError: false,   // make mockListNodes reject  → "Unable to load Geometries"
  forceCreateError: false, // make mockCreateGeometry reject
  forceRenameError: false, // make mockRenameGroup reject → inline name error
  forceDeleteError: false  // make mockDeleteNode reject
}
```

### 3.3 Mock functions

- `mockListNodes(projectId, scenarioId): Promise<GeoNode[]>` — returns the scope's
  node list (deep-copied). Throws `Unable to load Geometries` if `forceListError`.
- `mockCreateGeometry(projectId, scenarioId, {id,name,kind}): Promise<void>` —
  pushes a new root leaf into the scope. Throws if `forceCreateError`.
- `mockRenameGroup(projectId, scenarioId, id, name): Promise<void>` — renames the
  node in-place. Throws if `forceRenameError`.
- `mockDeleteNode(projectId, scenarioId, id): Promise<void>` — removes the node
  **and its children** (for a group). Throws if `forceDeleteError`.
- `__resetMockStore()` — **test-only**, clears the store between cases.

> The mock store and seed are the **only** things to delete when the backend is
> live; nothing imports `mockData.ts` except `service.ts` and the mock tests.

---

## 4. API routes — `utils/constants.ts` → `API_ROUTES.geometry`

All scenario-scoped (mirroring the weather routes). The endpoints **do not exist
on the backend yet** — they are the agreed contract the mock matches.

```ts
geometry: {
  list:   (p, s)     => `/api/geometry/project/${p}/scenario/${s}/objects`,            // GET
  create: (p, s)     => `/api/geometry/project/${p}/scenario/${s}/objects`,            // POST { id, name }
  rename: (p, s, id) => `/api/geometry/project/${p}/scenario/${s}/objects/${id}`,       // PATCH { name }
  remove: (p, s, id) => `/api/geometry/project/${p}/scenario/${s}/objects/${id}`        // DELETE
}
```

---

## 5. Backend contract (what the backend team must build)

All routes are **scoped by `(project_id, scenario_id)`**. Today's backend
geometry routes (`backend-api/app/routers/geometry.py`) are **global** (a single
in-memory Helios context) and **not** scenario-scoped — that is the main backend
work. The infra exists: `ScenarioContext` already holds a per-scenario PyHelios
context + registry; the routes need to be re-scoped onto it.

| Method & path | Request body | Response | Notes |
|---|---|---|---|
| `GET /api/geometry/project/{pid}/scenario/{sid}/objects` | — | `{ "nodes": GeoNode[] }` | The tree for that scenario. See §6 for the node shape. |
| `POST …/objects` | `{ "id": string, "name": string }` | any (ignored) | Client owns the id. Full geometry params come **later** from the right-panel Properties form (separate task). |
| `PATCH …/objects/{id}` | `{ "name": string }` | any (ignored) | Rename a group. Should 4xx on duplicate/invalid → surfaces as inline error. |
| `DELETE …/objects/{id}` | — | any (ignored) | Delete a node; a group must also delete its children. |

**Things the backend must add beyond today's model** (today's `ProjectObject` /
registry only has `object_id, name, type, primitive_uuids, visible`):

1. **Scenario scoping** of all geometry routes (currently project-global/global).
2. **Tree structure**: `parentId` / `childIds` (groups). No group concept exists server-side yet.
3. **`expanded`** (UI state) — could be client-only; backend may ignore/persist.
4. **`visibleInViewport`** (eye) — a per-object viewport flag.
5. **`modelVisibility`** (`all` / `none` / per-model map over the 5 models).
6. **PATCH** rename endpoint (none exists today).
7. **Group create / nesting** if groups are persisted server-side (drag-to-group currently builds groups client-side; see §13).
8. **Ground "resolution"** field has no home in the current `TexturedTileRequest` schema — flag for the Properties-form task.

---

## 6. Data model — `containers/Geometry/types.ts`

```ts
type ModelKey = 'solar_position' | 'radiation' | 'energy_balance'
              | 'photosynthesis' | 'stomatal_conductance'

type GeoNodeKind = 'ground' | 'imported' | 'group'

type ModelVisibility =
  | { mode: 'all' | 'none' }                                  // render-icon hide/show all
  | { mode: 'custom'; perModel: Record<ModelKey, boolean> }   // per-model dropdown

interface GeoNode {
  id: string
  name: string                 // "Ground.001" | "Group.001" | custom group name
  kind: GeoNodeKind
  parentId: string | null      // group id, or null at root
  childIds: string[]           // ordered children; [] for leaves
  expanded: boolean            // groups only
  visibleInViewport: boolean   // eye toggle
  modelVisibility: ModelVisibility
}
```

Per-scenario slice sub-state and root:

```ts
interface ScenarioGeometry {
  nodesById: Record<string, GeoNode>
  rootOrder: string[]                       // top-level order (leaves + groups)
  selectedIds: string[]
  searchQuery: string
  counters: { ground: number; group: number }   // monotonic naming
  syncById: Record<string, 'idle'|'pending'|'error'>           // reserved (optimistic UX)
  nameErrors: Record<string, string>        // inline rename errors, keyed by node id
  loadStatus: 'idle' | 'loading' | 'loaded' | 'error'
  loadError: string | null
}

interface GeometryState { byScope: Record<string, ScenarioGeometry> }
```

> **Backend mapping note:** `service.listNodes` currently expects the backend to
> return `GeoNode[]` directly under `{ nodes }`. The real backend's object shape
> differs, so when wiring it up, add a small mapper inside `service.listNodes`
> (e.g. `backendObject → GeoNode`) rather than changing the slice. That keeps the
> reducer/selectors/components untouched.

Everything is plain JSON — no Dates/Maps/class instances (Redux-safe, per repo rule).

---

## 7. Redux slice

Files: `constants.ts`, `actions.ts`, `reducer.ts`, `selectors.ts`. Injected once
in `index.tsx` (`useInjectReducer({ key: 'geometry' })`, `useInjectSaga`).

### 7.1 Action constants (`constants.ts`) — prefix `app/Geometry/…`

| Group | Constants |
|---|---|
| Load tree | `LIST_NODES_REQUESTED` / `_SUCCEEDED` / `_FAILED` |
| Create | `ADD_GEOMETRY_REQUESTED` / `_SUCCEEDED` / `_FAILED` |
| Local UI | `SELECT`, `SET_SEARCH_QUERY`, `TOGGLE_EXPAND` |
| Visibility | `TOGGLE_VIEWPORT`, `SET_MODEL_VISIBILITY` |
| Rename | `RENAME_REQUESTED` / `_SUCCEEDED` / `_FAILED`, `SET_NAME_ERROR` |
| Group/move | `GROUP_NODES`, `MOVE_NODES` |
| Delete | `DELETE_NODE_REQUESTED` / `_SUCCEEDED` / `_FAILED` |

Action shape convention (matches Weather): scope fields (`projectId`,
`scenarioId`) live at the top level of the action; data goes under `payload`
(except small structural actions that carry named fields like `nodeIds`).

### 7.2 Reducer behavior (`reducer.ts`, Immer + switch)

- `scopeKey(projectId, scenarioId)` = `` `${projectId}::${scenarioId}` ``; `ensureScope` lazily creates a `ScenarioGeometry`.
- **LIST_NODES**: `_REQUESTED` → `loadStatus:'loading'`; `_SUCCEEDED` → normalize `payload` into `nodesById`+`rootOrder`, **seed `counters` from existing names** (`deriveCounters`); `_FAILED` → `loadStatus:'error'`+`loadError`.
- **SELECT**: single replaces selection; `multi:true` toggles membership.
- **SET_SEARCH_QUERY**: stores query.
- **TOGGLE_EXPAND**: flips a group's `expanded`.
- **TOGGLE_VIEWPORT**: flips `visibleInViewport`; **a group cascades to its children**.
- **SET_MODEL_VISIBILITY**: sets `modelVisibility`; **a group cascades to its children**.
- **RENAME_SUCCEEDED**: sets `name`, clears `nameErrors[id]`. **RENAME_FAILED**: sets `nameErrors[id]`. **SET_NAME_ERROR**: set/clear.
- **ADD_GEOMETRY_REQUESTED**: **bumps `counters[kind]`** synchronously (race-safe naming). **ADD_GEOMETRY_SUCCEEDED**: inserts the new leaf at root, selects it.
- **GROUP_NODES**: creates a new group (`Group.00N`) from `[targetId, …nodeIds]` (needs ≥2), reparents members, inserts the group at root, selects it, prunes empties.
- **MOVE_NODES**: moves nodes into `toGroupId` (or to root if `null` = ungroup); prunes now-empty groups.
- **DELETE_NODE_SUCCEEDED**: removes the node (a group also removes its `childIds`), cleans `selectedIds`/`nameErrors`, prunes empties.
- Helpers: `detach(s, id)` (unlink from parent/root), `pruneEmptyGroups(s)`.

### 7.3 Selectors (`selectors.ts`, reselect)

- `selectActiveScopeKey` (from ProjectScreen `selectActiveProjectId`/`selectActiveScenarioId`).
- `selectActiveGeometry` (the `ScenarioGeometry`, with a stable empty fallback).
- Fields: `selectNodesById`, `selectRootOrder`, `selectSelectedIds`, `selectSearchQuery`, `selectLoadStatus`, `selectLoadError`, `selectCounters`, `selectNameErrors`.
- `selectRootNodes` (unfiltered ordered roots).
- `selectVisibleTree` / `selectVisibleRootNodes` — **search filter**: case-insensitive; a group is kept if its name or any child matches; matched groups are force-expanded; empty query passes the real tree through.
- `selectGroupNamesLower` — lowercased set of all group names (for the rename uniqueness check, computed from the full node set).

---

## 8. Sagas — `containers/Geometry/saga.ts`

Root `geometrySaga` watchers:

| Watcher | Worker | Strategy |
|---|---|---|
| `LIST_NODES_REQUESTED` | `listNodesWorker` | `takeLatest` (cancels stale loads on scenario switch) |
| `ADD_GEOMETRY_REQUESTED` | `addGeometryWorker` | `takeEvery` |
| `RENAME_REQUESTED` | `renameWorker` | `takeEvery` (pessimistic — name changes on success) |
| `DELETE_NODE_REQUESTED` | `deleteNodeWorker` | `takeEvery` (pessimistic) |

- `addGeometryWorker`: reads the (already-bumped) counter via `select(selectCounters)`, builds `name = formatName(kind, counters[kind])`, makes `id = generateId()` (`geo-${crypto.randomUUID()}`), calls `service.createGeometry`, dispatches `_SUCCEEDED`.
- All workers dispatch `_FAILED` with `(err as Error).message` on throw.
- `generateId` is exported so saga tests can step over the `call`.

---

## 9. Naming & counters — `containers/Geometry/naming.ts`

- Names: `<Prefix>.NNN`, zero-padded — `Ground.001`, `Group.001`.
- `formatName(kind, n)`, `parseNameNumber(name)`, `deriveCounters(nodes)`.
- **Race-safe**: the reducer bumps `counters[kind]` on `ADD_GEOMETRY_REQUESTED`
  (synchronous), and the saga reads the bumped value — rapid double-adds never
  collide. A failed create leaves a gap (counters stay monotonic).
- On load, `deriveCounters` seeds counters from existing names so the next
  create continues the sequence (e.g. seed up to `Ground.004` → next `Ground.005`).

---

## 10. Model visibility — `containers/Geometry/models.ts`

- `MODELS` — the 5 models (key + label), in mockup order.
- `isModelOn(vis, key)`, `isAllHidden(vis)`, `toggleAllModels(vis)`, `toggleOneModel(vis, key)`.
- `all`/`none` (render-icon hide/show-all) and `custom` (per-model) modes are
  mutually exclusive by construction.
- **Current UI:** the cluster **render icon** toggles all (`toggleAllModels`); the
  **kebab (⋮) menu** lists the 5 per-model toggles (a hidden model shows a greyed
  row). `toggleAllModels`/`isAllHidden` remain in `models.ts` and are used by the
  cluster render icon.

---

## 11. Validation — `containers/Geometry/validation.ts`

`validateGroupName(value, existingLowercaseSet)` → error string | `null`:

- empty/whitespace → `"Name is required"`
- `> 20` chars (trimmed; internal spaces count) → `"Character limit exceeded"`
- duplicate among groups (case-insensitive) → `"Geometry name already exists"`

Used live while editing a group name; commit is blocked while invalid.

---

## 12. Components

All under `containers/Geometry/` unless noted.

| File | Role |
|---|---|
| `index.tsx` | Geometry section. Injects reducer+saga once; dispatches `listNodesRequested` on active-scenario change; renders the action row (`+ Ground` / `Import from File`), the "Saved Geometries" label + search, and `<GeometryTree>`. Search query lives in the slice. |
| `GeometryTree.tsx` | Reads the slice; renders spinner / error / empty / "no matches" / the tree. The empty area is a **root drop zone** (ungroup). |
| `TreeRow.tsx` | One row (leaf or group). Click = select; ⌘/Ctrl-click = multi. Double-click a **group** name = inline rename. Native HTML5 **drag** (leaves draggable; drop onto leaf=group, onto group=move-in). Hidden rows are dimmed (`opacity-50`). Renders the kebab + on-select cluster. Owns the delete confirm `Dialog`. |
| `RowActions.tsx` | Two exports: **`KebabMenu`** (always-visible ⋮; opens the per-model Models menu in a **portal**, left-aligned to the icon, so the panel's overflow can't clip it) and **`RowActions`** (the on-select cluster: **render (hide/show all models) · eye (viewport) · trash (delete) · drag handle**, shown for both leaves and groups). All icons are inline SVG (crisp, no `<img>` rasterization). |
| `GroupNameEditor.tsx` | Inline rename input: live validation (red error), Enter commits, Esc cancels, blur commits-if-valid. |
| `Loadable.tsx` | Generated lazy wrapper (unused — Geometry is imported directly). |

Reused/shared components touched:

- `components/Accordion/index.tsx` — collapsible section shell (Geometry / Materials / Models), with a per-section header icon + chevron + divider, and `grow` for equal-height distribution.
- `components/ActionButton/index.tsx` — the white pill buttons (Ground / Import; Add Materials). Extracted so Geometry and Materials share it.
- `components/SearchBar/index.tsx` — gained optional `className`, `inputClassName`, `iconClassName`, and an `iconBgClassName` swatch; refactored to a single flex row so the focus ring wraps the whole bar (used by Geometry, Materials, and existing search bars).
- `components/CollapseButton/index.tsx` — uses `chevron_leftpanel.svg`.
- `containers/LeftPanel/index.tsx` — hosts the three accordions (Geometry / Materials / Models) with equal-height flex layout; renders `<Geometry>` and `<Materials>`.

---

## 13. What is mocked vs. real today (quick reference)

| Concern | Today | When backend is live |
|---|---|---|
| Tree load / create / rename / delete | **mock** (`mockData.ts`) | flip `VITE_USE_MOCK=false`; implement §5 endpoints (+ list mapper in `service.ts`) |
| Grouping / moving / ungrouping | **client-side only** (reducer `GROUP_NODES`/`MOVE_NODES`) | needs a backend group model + persistence; add `groupNodes`/`moveNodes` service calls + sagas, or persist via the existing endpoints |
| Expand/collapse, selection, search | **client-side** (UI state) | stays client-side (no backend needed) |
| Viewport (eye) & model visibility | **client-side** in the slice | needs backend fields + a `setVisibility` endpoint to persist (currently not sent to any backend) |
| Add Ground payload | `{ id, name }` | same; full params later via the Properties form |

> **Grouping/visibility are not yet persisted to any backend** (no service calls
> for `GROUP_NODES`, `MOVE_NODES`, `TOGGLE_VIEWPORT`, `SET_MODEL_VISIBILITY`).
> When the backend supports them, add `service.*` functions + saga workers
> following the same `_REQUESTED/_SUCCEEDED/_FAILED` pattern.

---

## 14. Tests (co-located in `containers/Geometry/tests/`)

- `naming.test.ts` — `formatName` / `parseNameNumber` / `deriveCounters`.
- `models.test.ts` — `isModelOn` / `isAllHidden` / `toggleAllModels` / `toggleOneModel`.
- `validation.test.ts` — group-name rules.
- `mockData.test.ts` — seed, deep copies, create/rename/delete persistence, forced errors.
- `actions.test.ts` — every action creator shape.
- `reducer.test.ts` — load/counter-seed, select (single/multi), search, expand, viewport (+ group cascade), model visibility (+ cascade), rename success/failure, add, group/move/ungroup+prune, delete (leaf / group+children / prune).
- `selectors.test.ts` — active scope, field selectors, search filter.
- `saga.test.ts` — every worker (effects stepped) + the root watcher order.
- `GeometryTree.test.tsx` — render states, expand, select, eye toggle + dimming, render hide-all, kebab per-model toggle + greyed hidden row, rename (open/validate/commit), drag (group/move), delete confirm.
- `index.test.tsx` — smoke render + snapshot.

`__resetMockStore()` + `mockConfig.latencyMs = 0` are used in mock tests; the
delete tests mock `HTMLDialogElement.prototype.showModal/close` (jsdom lacks them).

Run just this feature:

```
npx vitest run src/renderer/src/containers/Geometry
```

---

## 15. Deferred / NOT in this feature (by design)

- **Right-panel Properties form** (Ground Size / Resolution / Position / Rotation / Tiles / Material) — separate task. Add Ground only emits `{ id, name }`.
- **3D viewport** (three.js) in the Center Workspace — deferred.
- **Import from File** flow — the button exists; the flow is not wired.
- **Materials / Models accordions** — Materials has the Add + search shell; Models toggles are not wired.
- **Persisting** grouping / visibility to a backend (see §13).

---

## 16. Go-live checklist

1. Backend: implement the 4 scenario-scoped endpoints in §5 (re-scope the
   existing global geometry routes onto `ScenarioContext`).
2. Make `GET …/objects` return `{ nodes: GeoNode[] }`, **or** add a
   `backendObject → GeoNode` mapper inside `service.listNodes`.
3. Add a `PATCH` rename endpoint and group-aware `DELETE`.
4. (Later) add endpoints + `service.*` + sagas for grouping/move and
   viewport/model-visibility persistence.
5. Set `VITE_USE_MOCK=false` (and remove `mockData.ts` + its test once stable).
6. `npm run dev` and verify the tree loads from the backend.
