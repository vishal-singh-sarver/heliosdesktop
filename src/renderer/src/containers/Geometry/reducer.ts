import { produce } from 'immer'
import type { GeometryAction } from './actions'
import {
  ADD_GEOMETRY_REQUESTED,
  ADD_GEOMETRY_SUCCEEDED,
  CLOSE_CREATE_FORM,
  CREATE_OBJECT_FAILED,
  CREATE_OBJECT_REQUESTED,
  CREATE_OBJECT_SUCCEEDED,
  DELETE_NODE_SUCCEEDED,
  GROUP_NODES,
  LIST_NODES_REQUESTED,
  LIST_NODES_SUCCEEDED,
  LIST_NODES_FAILED,
  LOAD_OBJECT_SUCCEEDED,
  MOVE_NODES,
  RENAME_FAILED,
  RENAME_SUCCEEDED,
  SELECT,
  SET_DRAFT_MATERIAL,
  SET_DRAFT_NAME,
  SET_DRAFT_VALUE,
  SET_MODEL_VISIBILITY,
  SET_NAME_ERROR,
  SET_SEARCH_QUERY,
  TOGGLE_EXPAND,
  TOGGLE_VIEWPORT,
  UPDATE_OBJECT_FAILED,
  UPDATE_OBJECT_REQUESTED,
  UPDATE_OBJECT_SUCCEEDED
} from './constants'
import { deriveCounters, formatName } from './naming'
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
  syncById: {},
  nameErrors: {},
  detailsById: {},
  loadStatus: 'idle',
  loadError: null
})

export const initialState: GeometryState = { byScope: {}, createDraft: null, createDraftNonce: 0 }

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

// Drop any group left with no children (e.g. after its last child was dragged
// out). Keeps the single-level tree free of empty group husks.
function pruneEmptyGroups(s: ScenarioGeometry): void {
  for (const id of Object.keys(s.nodesById)) {
    const node = s.nodesById[id]
    if (node.kind === 'group' && node.childIds.length === 0) {
      s.rootOrder = s.rootOrder.filter((r) => r !== id)
      s.selectedIds = s.selectedIds.filter((sid) => sid !== id)
      delete s.nodesById[id]
    }
  }
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
        s.detailsById = {} // a fresh load invalidates the cached property values
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
        const node = s.nodesById[action.id]
        if (!node) break
        const next = !node.visibleInViewport
        node.visibleInViewport = next
        // A group's visibility cascades to its children.
        if (node.kind === 'group') {
          for (const childId of node.childIds) {
            const child = s.nodesById[childId]
            if (child) child.visibleInViewport = next
          }
        }
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

      case SET_MODEL_VISIBILITY: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const node = s.nodesById[action.id]
        if (!node) break
        node.modelVisibility = action.payload
        // A group's model visibility cascades to its children.
        if (node.kind === 'group') {
          for (const childId of node.childIds) {
            const child = s.nodesById[childId]
            if (child) child.modelVisibility = action.payload
          }
        }
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
        for (const id of toRemove) delete s.detailsById[id]
        // Removing a leaf may leave its parent group empty.
        pruneEmptyGroups(s)
        break
      }

      case GROUP_NODES: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const target = s.nodesById[action.targetId]
        if (!target) break
        // Members = target + dragged (deduped). Need at least two to form a group.
        const memberIds = [action.targetId, ...action.nodeIds.filter((id) => id !== action.targetId)]
        const members = memberIds.filter((id) => s.nodesById[id])
        if (members.length < 2) break

        s.counters.group += 1
        const name = formatName('group', s.counters.group)
        for (const id of members) detach(s, id)
        s.nodesById[action.groupId] = {
          id: action.groupId,
          name,
          kind: 'group',
          parentId: null,
          childIds: members,
          expanded: true,
          visibleInViewport: true,
          modelVisibility: { mode: 'all' }
        }
        for (const id of members) s.nodesById[id].parentId = action.groupId
        s.rootOrder.push(action.groupId)
        s.selectedIds = [action.groupId]
        pruneEmptyGroups(s)
        break
      }

      case MOVE_NODES: {
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
        pruneEmptyGroups(s)
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
          modelVisibility: { mode: 'all' }
        }
        s.nodesById[id] = node
        s.rootOrder.push(id)
        s.selectedIds = [id]
        break
      }

      // ── Edit-object draft (right-panel Properties form) ──────────────────────

      case SET_DRAFT_VALUE: {
        if (!draft.createDraft) break
        draft.createDraft.values[action.property] = action.payload
        // Typing clears the previous save error so a fresh attempt starts clean.
        draft.createDraft.saveError = null
        break
      }

      case SET_DRAFT_NAME: {
        if (!draft.createDraft) break
        draft.createDraft.name = action.payload
        // Editing the name clears a stale backend save error (e.g. the
        // duplicate-name "Geometry name already exists" from a prior Save) so it
        // doesn't linger while the user types a fresh name — mirrors
        // SET_DRAFT_VALUE.
        draft.createDraft.saveError = null
        break
      }

      case SET_DRAFT_MATERIAL: {
        if (!draft.createDraft) break
        draft.createDraft.materialId = action.payload
        break
      }

      case CLOSE_CREATE_FORM:
        draft.createDraft = null
        break

      case CREATE_OBJECT_REQUESTED:
        // +Ground POST is in flight; no draft exists yet, so nothing to mark.
        break

      case CREATE_OBJECT_SUCCEEDED: {
        // The backend created the object; insert it into the active scope's tree,
        // select it, advance the Ground counter, and open the edit form populated
        // from the persisted object's values.
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const { node, values, objectTypeId, objectName } = action.payload
        s.nodesById[node.id] = node
        if (node.parentId === null) s.rootOrder.push(node.id)
        s.selectedIds = [node.id]
        if (node.kind === 'ground') s.counters.ground += 1
        s.detailsById[node.id] = { values: { ...values }, objectTypeId, objectName }
        draft.createDraft = {
          objectId: node.id,
          objectTypeId,
          objectName,
          name: node.name,
          values: { ...values },
          materialId: null,
          isNew: true,
          saving: false,
          saveError: null
        }
        draft.createDraftNonce += 1
        break
      }

      case LOAD_OBJECT_SUCCEEDED: {
        // Clicking a ground GETs its detail; open the form to view/edit it. The
        // node is already in the tree (and selected), so we don't insert it; this
        // is an existing object (isNew: false) so Cancel won't delete it.
        const { node, values, objectTypeId, objectName } = action.payload
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        s.detailsById[node.id] = { values: { ...values }, objectTypeId, objectName }
        draft.createDraft = {
          objectId: node.id,
          objectTypeId,
          objectName,
          name: node.name,
          values: { ...values },
          materialId: null,
          isNew: false,
          saving: false,
          saveError: null
        }
        draft.createDraftNonce += 1
        break
      }

      case CREATE_OBJECT_FAILED:
        // POST failed before the form opened — nothing to roll back. (The error
        // surfaces via the saga; no draft slot exists to show it yet.)
        break

      case UPDATE_OBJECT_REQUESTED: {
        if (!draft.createDraft) break
        draft.createDraft.saving = true
        draft.createDraft.saveError = null
        break
      }

      case UPDATE_OBJECT_SUCCEEDED: {
        // PATCH committed. Keep the form OPEN showing the saved values (so the
        // panel doesn't blank out), sync the node's name in the tree, and mark
        // it no longer new (Cancel→Close, won't delete).
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const node = s.nodesById[action.payload.objectId]
        if (node) node.name = action.payload.name
        if (draft.createDraft) {
          draft.createDraft.saving = false
          draft.createDraft.isNew = false
          // Refresh the cache with the just-saved values.
          s.detailsById[action.payload.objectId] = {
            values: { ...draft.createDraft.values },
            objectTypeId: draft.createDraft.objectTypeId,
            objectName: draft.createDraft.objectName
          }
        }
        break
      }

      case UPDATE_OBJECT_FAILED: {
        if (!draft.createDraft) break
        draft.createDraft.saving = false
        draft.createDraft.saveError = action.payload
        break
      }
    }
  })

export default geometryReducer
