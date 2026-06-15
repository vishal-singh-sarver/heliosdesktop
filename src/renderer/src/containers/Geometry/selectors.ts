import { createSelector } from 'reselect'
import {
  selectActiveProjectId,
  selectActiveScenarioId
} from 'containers/ProjectScreen/selectors'
import type { RootState } from 'store/reducers'
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

// ── Field selectors ────────────────────────────────────────────────────────────

export const selectNodesById = createSelector(selectActiveGeometry, (g) => g.nodesById)
export const selectRootOrder = createSelector(selectActiveGeometry, (g) => g.rootOrder)
export const selectSelectedIds = createSelector(selectActiveGeometry, (g) => g.selectedIds)
export const selectSearchQuery = createSelector(selectActiveGeometry, (g) => g.searchQuery)
export const selectLoadStatus = createSelector(selectActiveGeometry, (g) => g.loadStatus)
export const selectLoadError = createSelector(selectActiveGeometry, (g) => g.loadError)
export const selectCounters = createSelector(selectActiveGeometry, (g) => g.counters)
export const selectNameErrors = createSelector(selectActiveGeometry, (g) => g.nameErrors)

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
