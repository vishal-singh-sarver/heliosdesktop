import { REMOVE_MATERIAL } from 'containers/Materials/constants'
import { SET_ACTIVE_SCENARIO } from 'containers/ProjectScreen/constants'
import { produce } from 'immer'
import type { GeometryAction } from './actions'
import {
  ADD_DRAFT_MATERIAL,
  ASSIGN_MATERIAL_SUCCEEDED,
  CLEAR_CREATE_HIGHLIGHT,
  CLOSE_CREATE_FORM,
  CREATE_OBJECT_FAILED,
  CREATE_OBJECT_REQUESTED,
  CREATE_OBJECT_SUCCEEDED,
  DELETE_NODE_SUCCEEDED,
  GROUP_NODES_SUCCEEDED,
  LIST_NODES_FAILED,
  LIST_NODES_REQUESTED,
  LIST_NODES_SUCCEEDED,
  LOAD_OBJECT_SUCCEEDED,
  MOVE_NODES_SUCCEEDED,
  REMOVE_DRAFT_MATERIAL,
  RENAME_FAILED,
  RENAME_SUCCEEDED,
  REORDER_NODES,
  SELECT,
  SET_DRAFT_NAME,
  SET_DRAFT_VALUE,
  SET_MODEL_ON,
  SET_NAME_ERROR,
  SET_SEARCH_QUERY,
  TOGGLE_EXPAND,
  TOGGLE_RENDER,
  TOGGLE_VIEWPORT,
  UNASSIGN_MATERIAL_FAILED,
  UNASSIGN_MATERIAL_SUCCEEDED,
  UPDATE_OBJECT_FAILED,
  UPDATE_OBJECT_REQUESTED,
  UPDATE_OBJECT_SUCCEEDED,
  VISIBILITY_SYNC_FAILED
} from './constants'
import { anyModelOn, unionVisibility } from './models'
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
  nameErrors: {},
  detailsById: {},
  lastCreatedId: null,
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

// Enforce the "a group holds ≥2 geometries" rule after a member leaves (drag-out,
// delete, or being pulled into a new group). A group left with a single member is
// no longer a group: eject that member back to the root, then delete the group.
// (0-member groups are just deleted.)
function dissolveUndersizedGroups(s: ScenarioGeometry): void {
  for (const id of Object.keys(s.nodesById)) {
    const node = s.nodesById[id]
    if (node.kind !== 'group' || node.childIds.length >= 2) continue
    // Eject the lone remaining child (if any) at the group's own position so it
    // lands in place, then remove the now-empty group.
    const groupIdx = s.rootOrder.indexOf(id)
    let insertAt = groupIdx >= 0 ? groupIdx : s.rootOrder.length
    for (const childId of node.childIds) {
      const child = s.nodesById[childId]
      if (!child) continue
      child.parentId = null
      if (!s.rootOrder.includes(childId)) {
        s.rootOrder.splice(insertAt, 0, childId)
        insertAt++
      }
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

// A group has no visibility of its own — it's the union of its children (see
// unionVisibility). After a child toggle we recompute the parent group, the same
// derivation service.ts applies at refresh time, so the group's row stays in sync
// when a single member is turned on/off (any child on ⇒ group on; all off ⇒ off).
// No-op when the node has no parent group (root leaves and groups themselves).
function recomputeParentGroup(s: ScenarioGeometry, id: string): void {
  const parentId = s.nodesById[id]?.parentId
  if (!parentId) return
  const group = s.nodesById[parentId]
  if (!group || group.kind !== 'group') return
  const children = group.childIds.map((cid) => s.nodesById[cid]).filter(Boolean) as GeoNode[]
  const { modelVisibility, renderEnabled, visibleInViewport } = unionVisibility(children)
  group.modelVisibility = modelVisibility
  group.renderEnabled = renderEnabled
  group.visibleInViewport = visibleInViewport
}

const geometryReducer = (
  state: GeometryState = initialState,
  action: GeometryAction
): GeometryState =>
  produce(state, (draft) => {
    // Cross-container reset: a project/scenario switch must abandon any open
    // Properties draft — it belongs to the previous scope. The form's "deleted"
    // check is scope-relative (an object id absent from the now-active tree reads
    // as deleted), so a draft left open here would otherwise resurface against the
    // new project and wrongly show "This geometry was deleted." SET_ACTIVE_SCENARIO
    // fires on every project open and scenario switch. The cast is needed because
    // this is ProjectScreen's action, not part of GeometryAction.
    if ((action.type as string) === SET_ACTIVE_SCENARIO) {
      draft.createDraft = null
      return
    }

    // A material was DELETED from the library (Materials' REMOVE_MATERIAL, which
    // is dispatched only once the backend delete succeeded — and that delete
    // eagerly unassigns the group from the active scenario's objects). Nothing
    // told the geometry slice, so the object form and the detail cache went on
    // listing a material that no longer exists, and every node kept it in
    // materialGroupIds. Purge it from the open draft and from every cached scope.
    // Scope-wide because REMOVE_MATERIAL carries no project/scenario; a scenario
    // the backend left frozen re-seeds from its own list fetch on the next switch.
    // The cast is needed because this is Materials' action, not a GeometryAction.
    if ((action.type as string) === REMOVE_MATERIAL) {
      const groupId = (action as unknown as { id: string }).id
      if (draft.createDraft) {
        draft.createDraft.materials = draft.createDraft.materials.filter(
          (m) => m.groupId !== groupId
        )
        draft.createDraft.materialBaseline = draft.createDraft.materialBaseline.filter(
          (id) => id !== groupId
        )
      }
      for (const scope of Object.values(draft.byScope)) {
        for (const detail of Object.values(scope.detailsById)) {
          detail.materialGroups = detail.materialGroups.filter((g) => g.groupId !== groupId)
        }
      }
      // `node.materialGroupIds` is deliberately NOT purged here. It is not panel
      // state — its only reader is the 3D viewport's refetch gate, which uses it
      // to find the objects a material touches. redux-saga runs reducers BEFORE
      // it emits to the saga channel, so clearing it here ran first and left
      // onMaterialDeleted with no object listing the group: the deleted material
      // stayed painted in the viewport until a reload. The now-dangling id is
      // harmless (group ids are never reused) and the next list fetch re-seeds it.
      return
    }

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
        // A create never re-lists (see the saga), so any pending cue here belongs
        // to an earlier session of this tree — forget it rather than flash a row
        // the user created long ago. Belt and braces for the timer-driven clear:
        // that one can't fire if the tree unmounted (or the scenario changed)
        // mid-cue.
        s.lastCreatedId = null
        for (const node of action.payload) {
          s.nodesById[node.id] = node
          if (node.parentId === null) s.rootOrder.push(node.id)
        }
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
        recomputeParentGroup(s, action.id)
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
        recomputeParentGroup(s, action.id)
        break
      }

      case RENAME_SUCCEEDED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const node = s.nodesById[action.id]
        // Keep the open right-panel form in sync when it's showing the renamed
        // object — but only if its name field hasn't been edited away from the
        // old value (don't clobber an in-progress rename in the form). Update
        // before overwriting node.name so we compare against the old name.
        if (
          draft.createDraft &&
          draft.createDraft.objectId === action.id &&
          node &&
          draft.createDraft.name === node.name
        ) {
          draft.createDraft.name = action.payload
        }
        // A successful rename clears the right-panel form's name error too, when
        // it's open for this object.
        if (draft.createDraft && draft.createDraft.objectId === action.id) {
          draft.createDraft.nameError = null
        }
        if (node) node.name = action.payload
        delete s.nameErrors[action.id]
        break
      }

      case RENAME_FAILED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        // A rename rejection for the object open in the right-panel form belongs
        // to that form — show it below the name field there, NOT on the left tree
        // row (whose committed name is still the valid old one, so an error under
        // it would be misleading and would linger stale). Other renames (e.g. a
        // left-tree inline edit) still surface inline on the tree row.
        if (draft.createDraft && draft.createDraft.objectId === action.id) {
          draft.createDraft.nameError = action.payload
        } else {
          s.nameErrors[action.id] = action.payload
        }
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
        recomputeParentGroup(s, action.id)
        break
      }

      case VISIBILITY_SYNC_FAILED: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        // Revert the optimistic flip for whichever field's PATCH failed.
        if (action.field === 'viewport') flipViewport(s, action.id)
        else if (action.field === 'render') flipRenderAll(s, action.id)
        else if (action.modelId !== undefined) flipModel(s, action.id, action.modelId)
        recomputeParentGroup(s, action.id)
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

        // Place the new group where its topmost member currently sits (in place),
        // not at the end. Capture the surviving row just before that member so
        // the index stays valid after the members are detached from the root.
        const memberSet = new Set(members)
        const firstMemberIdx = s.rootOrder.findIndex((rid) => memberSet.has(rid))
        const anchorBeforeId = firstMemberIdx > 0 ? s.rootOrder[firstMemberIdx - 1] : null

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
        const groupInsertAt = anchorBeforeId ? s.rootOrder.indexOf(anchorBeforeId) + 1 : 0
        s.rootOrder.splice(groupInsertAt, 0, id)
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
          const formerParentId = node.parentId // group it's leaving (for in-place placement)
          detach(s, id)
          node.parentId = action.toGroupId
          if (action.toGroupId) {
            const group = s.nodesById[action.toGroupId]
            if (!group.childIds.includes(id)) group.childIds.push(id)
          } else if (!s.rootOrder.includes(id)) {
            // Ungroup to root → drop the node right after its former group so it
            // lands in place (next to where it lived), not at the end.
            const formerGroupIdx = formerParentId ? s.rootOrder.indexOf(formerParentId) : -1
            if (formerGroupIdx >= 0) s.rootOrder.splice(formerGroupIdx + 1, 0, id)
            else s.rootOrder.push(id)
          }
        }
        // A move out can leave the source group with <2 members; dissolve it
        // (ejecting the lone remaining geometry to the root).
        dissolveUndersizedGroups(s)
        break
      }

      case REORDER_NODES: {
        // Drop on a row's edge → place the dragged leaves as siblings of the
        // target, just before/after it. The target's parent decides where they
        // land: a target inside a group → reorder WITHIN that group (stays
        // grouped); a target at root → reorder at root (a grouped leaf dropped
        // here leaves its group). Client-only: order isn't persisted (the
        // backend lists by creation time), so this resets on reload.
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const target = s.nodesById[action.targetId]
        if (!target) break
        const parentId = target.parentId // null = root, else the containing group
        const movables = action.nodeIds.filter((id) => id !== action.targetId && s.nodesById[id])
        for (const id of movables) {
          detach(s, id)
          s.nodesById[id].parentId = parentId
        }
        // Compute the target index AFTER detaching (siblings may have shifted).
        const parentGroup = parentId ? s.nodesById[parentId] : null
        if (parentGroup && parentGroup.kind === 'group') {
          let idx = parentGroup.childIds.indexOf(action.targetId)
          if (idx < 0) idx = parentGroup.childIds.length
          const insertAt = action.position === 'after' ? idx + 1 : idx
          const fresh = movables.filter((id) => !parentGroup.childIds.includes(id))
          parentGroup.childIds.splice(insertAt, 0, ...fresh)
        } else {
          let idx = s.rootOrder.indexOf(action.targetId)
          if (idx < 0) idx = s.rootOrder.length
          const insertAt = action.position === 'after' ? idx + 1 : idx
          const fresh = movables.filter((id) => !s.rootOrder.includes(id))
          s.rootOrder.splice(insertAt, 0, ...fresh)
        }
        // Moving a leaf OUT of a group (target at root) can leave it undersized.
        dissolveUndersizedGroups(s)
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
        // SET_DRAFT_VALUE. The name-specific rename error clears the same way.
        draft.createDraft.saveError = null
        draft.createDraft.nameError = null
        break
      }

      case ADD_DRAFT_MATERIAL: {
        if (!draft.createDraft) break
        // Dedupe against the whole displayed set (baseline rows live here too),
        // so re-picking an already-assigned material is a no-op — this alone
        // prevents the "re-add → 409" case from ever reaching the backend.
        const { groupId, name } = action.payload
        if (!draft.createDraft.materials.some((m) => m.groupId === groupId)) {
          draft.createDraft.materials.push({ groupId, name })
        }
        break
      }

      case ASSIGN_MATERIAL_SUCCEEDED: {
        // A drag-drop assign that landed on the backend. Reflect it in BOTH:
        //  - the open form (if the dropped-on object is the one open), and
        //  - the detail CACHE of every affected object — otherwise a re-click
        //    serves the stale cached detail and the just-assigned material
        //    vanishes from the panel (the reported bug).
        // The group goes into the baseline too: it's already persisted, so the
        // add-only Save must not re-PATCH it (that would 409).
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const { objectIds, groupId, name } = action
        const cd = draft.createDraft
        if (cd && objectIds.includes(cd.objectId)) {
          if (!cd.materials.some((m) => m.groupId === groupId)) {
            cd.materials.push({ groupId, name })
          }
          if (!cd.materialBaseline.includes(groupId)) {
            cd.materialBaseline.push(groupId)
          }
        }
        for (const objectId of objectIds) {
          const detail = s.detailsById[objectId]
          if (detail && !detail.materialGroups.some((m) => m.groupId === groupId)) {
            detail.materialGroups.push({ groupId, name })
          }
          // Keep the node's group ids in sync so the 3D viewport reloads this
          // object when the material is later edited.
          const node = s.nodesById[objectId]
          if (node && !(node.materialGroupIds ?? []).includes(groupId)) {
            node.materialGroupIds = [...(node.materialGroupIds ?? []), groupId]
          }
        }
        break
      }

      case REMOVE_DRAFT_MATERIAL: {
        if (!draft.createDraft) break
        // Unchecking a material in the Select popup drops it from the Materials
        // section. Only session picks reach here (baseline groups aren't listed in
        // the popup), so this never removes an already-saved assignment the
        // add-only backend couldn't un-assign anyway.
        draft.createDraft.materials = draft.createDraft.materials.filter(
          (m) => m.groupId !== action.payload.groupId
        )
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
        // select it, and open the edit form populated from the persisted object's
        // values.
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const { node, values, objectTypeId, objectName } = action.payload
        s.nodesById[node.id] = node
        if (node.parentId === null) s.rootOrder.push(node.id)
        s.selectedIds = [node.id]
        s.lastCreatedId = node.id
        // A brand-new object has no assignments yet.
        s.detailsById[node.id] = {
          values: { ...values },
          objectTypeId,
          objectName,
          materialGroups: []
        }
        draft.createDraft = {
          objectId: node.id,
          objectTypeId,
          objectName,
          name: node.name,
          values: { ...values },
          materials: [],
          materialBaseline: [],
          isNew: true,
          saving: false,
          saveError: null,
          nameError: null
        }
        draft.createDraftNonce += 1
        break
      }

      case LOAD_OBJECT_SUCCEEDED: {
        // Clicking a ground GETs its detail; open the form to view/edit it. The
        // node is already in the tree (and selected), so we don't insert it; this
        // is an existing object (isNew: false) so Cancel won't delete it.
        const { node, values, objectTypeId, objectName, materialGroups } = action.payload
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        s.detailsById[node.id] = {
          values: { ...values },
          objectTypeId,
          objectName,
          materialGroups: [...materialGroups]
        }
        draft.createDraft = {
          objectId: node.id,
          objectTypeId,
          objectName,
          name: node.name,
          values: { ...values },
          materials: [...materialGroups],
          materialBaseline: materialGroups.map((g) => g.groupId),
          isNew: false,
          saving: false,
          saveError: null,
          nameError: null
        }
        draft.createDraftNonce += 1
        break
      }

      case CREATE_OBJECT_FAILED:
        // POST failed before the form opened — nothing to roll back. (The error
        // surfaces via the saga; no draft slot exists to show it yet.)
        break

      case CLEAR_CREATE_HIGHLIGHT: {
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        s.lastCreatedId = null
        break
      }

      case UPDATE_OBJECT_REQUESTED: {
        if (!draft.createDraft) break
        draft.createDraft.saving = true
        draft.createDraft.saveError = null
        break
      }

      case UPDATE_OBJECT_SUCCEEDED: {
        // PATCH committed. Keep the form OPEN showing the saved values (so the
        // panel doesn't blank out) and mark it no longer new (Cancel→Close, won't
        // delete). The name is NOT synced here — it commits on its own blur/rename
        // path, so syncing the (possibly rejected) draft name would corrupt the
        // tree row.
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        if (draft.createDraft) {
          draft.createDraft.saving = false
          draft.createDraft.isNew = false
          // The just-added materials are now assigned on the backend: fold them
          // into the baseline so the row is no longer "new" and a re-Save is a
          // no-op (won't 409). ADD-only, so the displayed set is unchanged.
          draft.createDraft.materialBaseline = draft.createDraft.materials.map((m) => m.groupId)
          // Refresh the cache with the just-saved values + materials, so a
          // re-click of this ground still shows the assignments without a GET.
          s.detailsById[action.payload.objectId] = {
            values: { ...draft.createDraft.values },
            objectTypeId: draft.createDraft.objectTypeId,
            objectName: draft.createDraft.objectName,
            materialGroups: [...draft.createDraft.materials]
          }
          // Mirror the assigned groups onto the node so the 3D viewport reloads
          // this object when one of its materials is later edited.
          const node = s.nodesById[action.payload.objectId]
          if (node) node.materialGroupIds = draft.createDraft.materials.map((m) => m.groupId)
        }
        break
      }

      case UPDATE_OBJECT_FAILED: {
        if (!draft.createDraft) break
        draft.createDraft.saving = false
        draft.createDraft.saveError = action.payload
        break
      }

      case UNASSIGN_MATERIAL_SUCCEEDED: {
        // A saved material was unassigned on the backend. Drop it from the open
        // draft (both the displayed list and the baseline) and from the detail
        // cache, so it stays gone if the form is closed and reopened.
        const s = ensureScope(draft, scopeKey(action.projectId, action.scenarioId))
        const { groupId, objectId } = action
        if (draft.createDraft) {
          draft.createDraft.materials = draft.createDraft.materials.filter(
            (m) => m.groupId !== groupId
          )
          draft.createDraft.materialBaseline = draft.createDraft.materialBaseline.filter(
            (id) => id !== groupId
          )
        }
        const detail = s.detailsById[objectId]
        if (detail) {
          detail.materialGroups = detail.materialGroups.filter((g) => g.groupId !== groupId)
        }
        const node = s.nodesById[objectId]
        if (node?.materialGroupIds) {
          node.materialGroupIds = node.materialGroupIds.filter((id) => id !== groupId)
        }
        break
      }

      case UNASSIGN_MATERIAL_FAILED: {
        // Pessimistic: the material was NOT removed. Surface the error on the form
        // (the material stays in the list so the user can retry).
        if (draft.createDraft) draft.createDraft.saveError = action.payload
        break
      }
    }
  })

export default geometryReducer
