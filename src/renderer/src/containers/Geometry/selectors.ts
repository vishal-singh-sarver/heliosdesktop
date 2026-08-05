import { createSelector } from 'reselect'
import {
  selectActiveProjectId,
  selectActiveScenarioId,
  selectModelTypes
} from 'containers/ProjectScreen/selectors'
import type { RootState } from 'store/reducers'
import { formatName, nextAvailableNumber } from './naming'
import { emptyScenarioGeometry, initialState, scopeKey, type GeometryState } from './reducer'
import type { GeoNode, ScenarioGeometry } from './types'

// ── Domain ──────────────────────────────────────────────────────────────────

const selectGeometryDomain = (state: RootState): GeometryState =>
  (state as RootState & { geometry?: GeometryState }).geometry ?? initialState

// Stable empty sub-state so selectors keep referential identity when the
// active scenario has no geometry yet (avoids needless re-renders).
const EMPTY_SCENARIO: ScenarioGeometry = emptyScenarioGeometry()

// ── Active scope ──────────────────────────────────────────────────────────────

export const selectActiveScopeKey = createSelector(
  selectActiveProjectId,
  selectActiveScenarioId,
  (projectId, scenarioId) =>
    projectId && scenarioId ? scopeKey(projectId, scenarioId) : null
)

export const selectActiveGeometry = createSelector(
  selectGeometryDomain,
  selectActiveScopeKey,
  (domain, key): ScenarioGeometry =>
    key ? (domain.byScope[key] ?? EMPTY_SCENARIO) : EMPTY_SCENARIO
)

// ── Catalog (model ids) ──────────────────────────────────────────────────────

// The catalog model ids, memoized so the render-icon master switch and the kebab
// menu share one stable array instead of each re-deriving modelTypes.map(m => m.id)
// on every render.
export const selectModelIds = createSelector(selectModelTypes, (modelTypes) =>
  modelTypes.map((m) => m.id)
)

// ── Field selectors ────────────────────────────────────────────────────────────

export const selectNodesById = createSelector(selectActiveGeometry, (g) => g.nodesById)
export const selectDetailsById = createSelector(selectActiveGeometry, (g) => g.detailsById)
export const selectRootOrder = createSelector(selectActiveGeometry, (g) => g.rootOrder)
export const selectSelectedIds = createSelector(selectActiveGeometry, (g) => g.selectedIds)
export const selectSearchQuery = createSelector(selectActiveGeometry, (g) => g.searchQuery)
export const selectLoadStatus = createSelector(selectActiveGeometry, (g) => g.loadStatus)
export const selectLoadError = createSelector(selectActiveGeometry, (g) => g.loadError)
export const selectNameErrors = createSelector(selectActiveGeometry, (g) => g.nameErrors)
// Nodes whose DELETE is in flight — the row and the right-panel form disable their
// trash while an id is here, so a pessimistic delete can't be fired twice.
export const selectDeletingIds = createSelector(selectActiveGeometry, (g) => g.deletingIds)
// The row +Ground just created — drives its transient "just appeared" cue.
export const selectLastCreatedId = createSelector(selectActiveGeometry, (g) => g.lastCreatedId)

// Lowercased names of all groups in the active scenario — used for the unique-
// name check while renaming (computed from the full, unfiltered node set).
export const selectGroupNamesLower = createSelector(selectNodesById, (nodesById) => {
  const names = new Set<string>()
  for (const node of Object.values(nodesById)) {
    if (node.kind === 'group') names.add(node.name.toLowerCase())
  }
  return names
})

// Same, for leaf geometries — geometry names are unique per project in their own
// namespace (distinct from group names), so a ground rename checks against these.
export const selectLeafNamesLower = createSelector(selectNodesById, (nodesById) => {
  const names = new Set<string>()
  for (const node of Object.values(nodesById)) {
    if (node.kind !== 'group') names.add(node.name.toLowerCase())
  }
  return names
})

// ── Filtered tree (search) ──────────────────────────────────────────────────
//
// Case-insensitive. A leaf is kept when its name matches. A group is kept when
// its own name matches (then all children show) OR any child matches (then only
// matching children show); matched groups are force-expanded so results are
// visible regardless of their stored expanded flag. With an empty query the
// real nodesById/rootOrder pass through unchanged (referentially stable).
export interface VisibleTree {
  nodesById: Record<string, GeoNode>
  rootOrder: string[]
}

export const selectVisibleTree = createSelector(
  selectNodesById,
  selectRootOrder,
  selectSearchQuery,
  (nodesById, rootOrder, query): VisibleTree => {
    const q = query.trim().toLowerCase()
    if (!q) return { nodesById, rootOrder }

    const matches = (name: string): boolean => name.toLowerCase().includes(q)
    const outNodes: Record<string, GeoNode> = {}
    const outRoot: string[] = []

    for (const id of rootOrder) {
      const node = nodesById[id]
      if (!node) continue

      if (node.kind === 'group') {
        const children = node.childIds.map((cid) => nodesById[cid]).filter(Boolean)
        const groupMatches = matches(node.name)
        const keptChildren = groupMatches ? children : children.filter((c) => matches(c.name))
        if (groupMatches || keptChildren.length > 0) {
          outNodes[node.id] = {
            ...node,
            expanded: true,
            childIds: keptChildren.map((c) => c.id)
          }
          for (const c of keptChildren) outNodes[c.id] = c
          outRoot.push(node.id)
        }
      } else if (matches(node.name)) {
        outNodes[node.id] = node
        outRoot.push(node.id)
      }
    }

    return { nodesById: outNodes, rootOrder: outRoot }
  }
)

export const selectVisibleRootNodes = createSelector(
  selectVisibleTree,
  ({ nodesById, rootOrder }): GeoNode[] => rootOrder.map((id) => nodesById[id]).filter(Boolean)
)

// ── Create-object draft (right-panel Properties form) ────────────────────────
//
// The draft lives at the slice root (one at a time), not per-scope, so it reads
// straight off the domain.

export const selectCreateDraft = createSelector(selectGeometryDomain, (d) => d.createDraft)

export const selectHasCreateDraft = createSelector(selectCreateDraft, (draft) => draft !== null)

// Monotonic open counter — the RightPanel re-expands whenever this changes.
export const selectCreateDraftNonce = createSelector(
  selectGeometryDomain,
  (d) => d.createDraftNonce
)

// Next auto-generated Ground name, derived live from the current tree: scan
// every existing geometry (roots + group children) and pick the lowest unused
// Ground.NNN — gap-filling, so {001, 002, 015} suggests 003, not 016. Computed
// from the node set so it always reflects the latest backend list.
export const selectNextGroundName = createSelector(selectNodesById, (nodesById) =>
  formatName('ground', nextAvailableNumber(Object.values(nodesById), 'ground'))
)
