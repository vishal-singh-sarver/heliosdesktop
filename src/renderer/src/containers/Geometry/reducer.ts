import { produce } from 'immer'
import type { GeometryAction } from './actions'
import {
  ADD_GEOMETRY_REQUESTED,
  ADD_GEOMETRY_SUCCEEDED,
  DELETE_NODE_SUCCEEDED,
  GROUP_NODES_SUCCEEDED,
  LIST_NODES_REQUESTED,
  LIST_NODES_SUCCEEDED,
  LIST_NODES_FAILED,
  MOVE_NODES_SUCCEEDED,
  RENAME_FAILED,
  RENAME_SUCCEEDED,
  SELECT,
  SET_MODEL_ON,
  SET_NAME_ERROR,
  SET_SEARCH_QUERY,
  TOGGLE_EXPAND,
  TOGGLE_RENDER,
  TOGGLE_VIEWPORT,
  VISIBILITY_SYNC_FAILED
} from './constants'
import { anyModelOn } from './models'
import { deriveCounters } from './naming'
import type { GeoNode, GeometryState, ScenarioGeometry } from './types'

export type { GeometryState }

// Scope key matches the Weather convention so the same (project, scenario)
// pair addresses geometry and weather state identically.
export const scopeKey = (projectId: string, scenarioId: string): string =>
  `${projectId}::${scenarioId}`

export const emptyScenarioGeometry = (): ScenarioGeometry => ({
  nodesById: {},
  rootOrder: [],
  selectedIds: [],
  searchQuery: '',
  counters: { ground: 0, group: 0 },
  nameErrors: {},
  loadStatus: 'idle',
  loadError: null
})

export const initialState: GeometryState = { byScope: {} }

// Lazily create the per-scenario sub-state so reducers can write without a
// separate "init scope" action.
const ensureScope = (draft: GeometryState, key: string): ScenarioGeometry => {
  if (!draft.byScope[key]) draft.byScope[key] = emptyScenarioGeometry()
  return draft.byScope[key]
}

// Remove a node from wherever it currently lives (a group's childIds, or the
// root order). Does not touch its parentId — the caller sets the new parent.
function detach(s: ScenarioGeometry, id: string): void {
  const node = s.nodesById[id]
  if (!node) return
  if (node.parentId) {
    const parent = s.nodesById[node.parentId]
    if (parent) parent.childIds = parent.childIds.filter((c) => c !== id)
  } else {
    s.rootOrder = s.rootOrder.filter((r) => r !== id)
  }
}

// Enforce the "a group holds ≥2 geometries" rule after a member leaves (drag-out,
// delete, or being pulled into a new group). A group left with a single member is
// no longer a group: eject that member back to the root, then delete the group.
// (0-member groups are just deleted.)
function dissolveUndersizedGroups(s: ScenarioGeometry): void {
  for (const id of Object.keys(s.nodesById)) {
    const node = s.nodesById[id]
    if (node.kind !== 'group' || node.childIds.length >= 2) continue
    // Eject the lone remaining child (if any) back to the root.
    for (const childId of node.childIds) {
      const child = s.nodesById[childId]
      if (!child) continue
      child.parentId = null
      if (!s.rootOrder.includes(childId)) s.rootOrder.push(childId)
    }
    s.rootOrder = s.rootOrder.filter((r) => r !== id)
    s.selectedIds = s.selectedIds.filter((sid) => sid !== id)
    delete s.nodesById[id]
  }
}

// Apply a mutation to a node and, when it's a group, to each of its children —
// the cascade every visibility change shares. The callback mutates the draft
// node in place (Immer). No-op for a missing node.
function applyToNodeAndChildren(
  s: ScenarioGeometry,
  id: string,
  mutate: (node: GeoNode) => void
): void {
  const node = s.nodesById[id]
  if (!node) return
  mutate(node)
  if (node.kind === 'group') {
    for (const childId of node.childIds) {
      const child = s.nodesById[childId]
      if (child) mutate(child)
    }
  }
}

// Flip a node's viewport visibility. Its own inverse, so it serves both the
// optimistic toggle and the failure revert.
function flipViewport(s: ScenarioGeometry, id: string): void {
  const next = s.nodesById[id] && !s.nodesById[id].visibleInViewport
  applyToNodeAndChildren(s, id, (n) => {
    n.visibleInViewport = next
  })
}

// The render icon is a master switch: it sets the node's render bool AND every
// model to the same value (§5 — render off ⇒ all models false). `modelIds` is
// the catalog model list (every model gets set).
function setRenderAll(s: ScenarioGeometry, id: string, modelIds: number[], value: boolean): void {
  applyToNodeAndChildren(s, id, (n) => {
    n.renderEnabled = value
    for (const mid of modelIds) n.modelVisibility[mid] = value
  })
}

// Revert a failed render toggle: flip the render bool back and reset every model
// already in the map to that value. Self-inverse for a uniform prior state
// (which a render toggle always produces).
function flipRenderAll(s: ScenarioGeometry, id: string): void {
  const node = s.nodesById[id]
  if (!node) return
  const next = !node.renderEnabled
  applyToNodeAndChildren(s, id, (n) => {
    n.renderEnabled = next
    for (const key of Object.keys(n.modelVisibility)) n.modelVisibility[Number(key)] = next
  })
}

// Set one model's per-node visibility (by catalog id). `setModel` writes an
// explicit value (forward toggle); `flipModel` inverts the current value
// (failure revert — self-inverse restores the pre-toggle state).
function setModel(s: ScenarioGeometry, id: string, modelId: number, on: boolean): void {
  applyToNodeAndChildren(s, id, (n) => {
    n.modelVisibility[modelId] = on
  })
}

function flipModel(s: ScenarioGeometry, id: string, modelId: number): void {
  const node = s.nodesById[id]
  if (!node) return
  setModel(s, id, modelId, !(node.modelVisibility[modelId] ?? true))
}

const geometryReducer = (
  state: GeometryState = initialState,
  action: GeometryAction
): GeometryState =>
  produce(state, (draft) => {
    switch (action.type) {
      case LIST_NODES_REQUESTED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        s.loadStatus = 'loading'
        s.loadError = null
        break
      }

      case LIST_NODES_SUCCEEDED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        s.nodesById = {}
        s.rootOrder = []
        for (const node of action.payload) {
          s.nodesById[node.id] = node
          if (node.parentId === null) s.rootOrder.push(node.id)
        }
        // Seed the name counters from existing names so the next create
        // continues the sequence (Ground.005, not Ground.001).
        s.counters = deriveCounters(action.payload)
        s.loadStatus = 'loaded'
        s.loadError = null
        break
      }

      case LIST_NODES_FAILED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        s.loadStatus = 'error'
        s.loadError = action.payload
        break
      }

      case SELECT: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        if (action.multi) {
          const i = s.selectedIds.indexOf(action.id)
          if (i >= 0) s.selectedIds.splice(i, 1)
          else s.selectedIds.push(action.id)
        } else {
          s.selectedIds = [action.id]
        }
        break
      }

      case SET_SEARCH_QUERY: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        s.searchQuery = action.payload
        break
      }

      case TOGGLE_EXPAND: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const node = s.nodesById[action.id]
        if (node && node.kind === 'group') node.expanded = !node.expanded
        break
      }

      case TOGGLE_VIEWPORT: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        if (!s.nodesById[action.id]) break
        // Optimistic: flip now (cascading to a group's children); the saga
        // persists via PATCH and reverts on failure.
        flipViewport(s, action.id)
        break
      }

      case TOGGLE_RENDER: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const node = s.nodesById[action.id]
        if (!node) break
        // Master switch derived from the per-model state: if any model is on,
        // turn them all off; if all are off, turn them all on (a model id absent
        // from the map defaults to on). Render bool tracks the same value.
        const anyOn = action.modelIds.some((mid) => node.modelVisibility[mid] ?? true)
        setRenderAll(s, action.id, action.modelIds, !anyOn)
        break
      }

      case RENAME_SUCCEEDED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const node = s.nodesById[action.id]
        if (node) node.name = action.payload
        delete s.nameErrors[action.id]
        break
      }

      case RENAME_FAILED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        s.nameErrors[action.id] = action.payload
        break
      }

      case SET_NAME_ERROR: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        if (action.payload === null) delete s.nameErrors[action.id]
        else s.nameErrors[action.id] = action.payload
        break
      }

      case SET_MODEL_ON: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const node = s.nodesById[action.id]
        if (!node) break
        // Optimistic: set the one model (cascading to a group's children).
        setModel(s, action.id, action.modelId, action.on)
        // Keep render in sync with the per-model state: render is on iff any
        // model is on. The saga PATCHes both { models, render } together.
        const render = anyModelOn(node.modelVisibility, action.modelIds)
        applyToNodeAndChildren(s, action.id, (n) => {
          n.renderEnabled = render
        })
        break
      }

      case VISIBILITY_SYNC_FAILED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        // Revert the optimistic flip for whichever field's PATCH failed.
        if (action.field === 'viewport') flipViewport(s, action.id)
        else if (action.field === 'render') flipRenderAll(s, action.id)
        else if (action.modelId !== undefined) flipModel(s, action.id, action.modelId)
        break
      }

      case DELETE_NODE_SUCCEEDED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const node = s.nodesById[action.id]
        if (!node) break
        // A group takes its children with it.
        const toRemove = node.kind === 'group' ? [action.id, ...node.childIds] : [action.id]
        detach(s, action.id) // unlink from root or its parent group
        for (const id of toRemove) delete s.nodesById[id]
        s.rootOrder = s.rootOrder.filter((r) => !toRemove.includes(r))
        s.selectedIds = s.selectedIds.filter((sid) => !toRemove.includes(sid))
        for (const id of toRemove) delete s.nameErrors[id]
        // Removing a leaf may leave its parent group empty.
        dissolveUndersizedGroups(s)
        break
      }

      case GROUP_NODES_SUCCEEDED: {
        // The group was created on the backend; insert it with the server-owned
        // id + name (so it survives a refetch). Members that still exist get
        // reparented under it and pulled out of the root.
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const { id, name, memberIds } = action.payload
        const members = memberIds.filter((memberId) => s.nodesById[memberId])
        if (members.length < 2) break

        for (const memberId of members) detach(s, memberId)
        s.nodesById[id] = {
          id,
          name,
          kind: 'group',
          parentId: null,
          childIds: members,
          expanded: true,
          visibleInViewport: true,
          renderEnabled: true,
          modelVisibility: {}
        }
        for (const memberId of members) s.nodesById[memberId].parentId = id
        s.rootOrder.push(id)
        s.selectedIds = [id]
        dissolveUndersizedGroups(s)
        break
      }

      case MOVE_NODES_SUCCEEDED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const target = action.toGroupId ? s.nodesById[action.toGroupId] : null
        // Reject a move into a non-existent or non-group target.
        if (action.toGroupId && (!target || target.kind !== 'group')) break

        for (const id of action.nodeIds) {
          const node = s.nodesById[id]
          if (!node || id === action.toGroupId) continue
          detach(s, id)
          node.parentId = action.toGroupId
          if (action.toGroupId) {
            const group = s.nodesById[action.toGroupId]
            if (!group.childIds.includes(id)) group.childIds.push(id)
          } else if (!s.rootOrder.includes(id)) {
            s.rootOrder.push(id)
          }
        }
        // A move out can leave the source group with <2 members; dissolve it
        // (ejecting the lone remaining geometry to the root).
        dissolveUndersizedGroups(s)
        break
      }

      case ADD_GEOMETRY_REQUESTED: {
        // Bump the counter synchronously so concurrent adds get distinct names;
        // the saga reads the bumped value to build the name. A failed create
        // simply leaves a gap in the sequence (counters stay monotonic).
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        s.counters[action.payload] += 1
        break
      }

      case ADD_GEOMETRY_SUCCEEDED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const { id, name, kind } = action.payload
        const node: GeoNode = {
          id,
          name,
          kind,
          parentId: null,
          childIds: [],
          expanded: false,
          visibleInViewport: true,
          renderEnabled: true,
          modelVisibility: {}
        }
        s.nodesById[id] = node
        s.rootOrder.push(id)
        s.selectedIds = [id]
        break
      }
    }
  })

export default geometryReducer
