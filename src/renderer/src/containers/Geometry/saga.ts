import { selectMaterialsById } from 'containers/Materials/selectors'
import { selectAllObjectTypes } from 'containers/ProjectScreen/selectors'
import type { ObjectTypeDef } from 'containers/ProjectScreen/types'
import { all, call, put, select, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
import { showSnackbar } from '@renderer/store/snackbarReducer'
import toastMessages from '@renderer/store/toastMessages'
import * as actions from './actions'
import type {
  AssignMaterialRequestedAction,
  CreateObjectRequestedAction,
  DeleteNodeRequestedAction,
  GroupNodesRequestedAction,
  ListNodesRequestedAction,
  LoadObjectRequestedAction,
  MoveNodesRequestedAction,
  RenameRequestedAction,
  UpdateObjectRequestedAction,
  UnassignMaterialRequestedAction,
  SetModelOnAction,
  ToggleRenderAction,
  ToggleViewportAction
} from './actions'
import {
  ASSIGN_MATERIAL_REQUESTED,
  CREATE_OBJECT_REQUESTED,
  DELETE_NODE_REQUESTED,
  GROUP_NODES_REQUESTED,
  LIST_NODES_REQUESTED,
  LOAD_OBJECT_REQUESTED,
  MOVE_NODES_REQUESTED,
  RENAME_REQUESTED,
  UPDATE_OBJECT_REQUESTED,
  UNASSIGN_MATERIAL_REQUESTED,
  SET_MODEL_ON,
  TOGGLE_RENDER,
  TOGGLE_VIEWPORT
} from './constants'
import { defaultValuesForObject } from './propertyBlueprint'
import { selectCreateDraft, selectDetailsById, selectNodesById } from './selectors'
import * as service from './service'
import type { CreateDraft, GeoNode, ObjectDetail } from './types'

// Raw string form values → numeric properties for the backend (blank fields are
// dropped). Shared by create (defaults) and update (edited values).
function numericProperties(values: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [property, raw] of Object.entries(values)) {
    const trimmed = raw.trim()
    if (trimmed === '') continue
    out[property] = Number(trimmed)
  }
  return out
}

// Loads the saved-geometries tree for a scenario. takeLatest cancels a stale
// load if the user switches scenario mid-request.
export function* listNodesWorker(action: ListNodesRequestedAction): Generator {
  const { projectId, scenarioId } = action
  try {
    const nodes = (yield call(service.listNodes, projectId, scenarioId)) as GeoNode[]
    yield put(actions.listNodesSucceeded(projectId, scenarioId, nodes))
  } catch (err) {
    yield put(actions.listNodesFailed(projectId, scenarioId, (err as Error).message))
  }
}

// Persists a group rename. Pessimistic: the name changes only on success, so
// no rollback is needed; a backend rejection surfaces as an inline name error.
export function* renameWorker(action: RenameRequestedAction): Generator {
  const { projectId, scenarioId, id } = action
  const name = action.payload
  try {
    // Groups and leaves rename through different endpoints (§6.3 vs §5.5); pick
    // by the node's kind from state.
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    const renameFn = nodesById[id]?.kind === 'group' ? service.renameGroup : service.renameObject
    yield call(renameFn, projectId, scenarioId, id, name)
    yield put(actions.renameSucceeded(projectId, scenarioId, id, name))
  } catch (err) {
    yield put(actions.renameFailed(projectId, scenarioId, id, (err as Error).message))
  }
}

// Mirror the reducer's "a group holds ≥2 geometries" rule on the backend. After
// a member leaves a group (drag-out, delete, or being pulled into a new group),
// the reducer dissolves any source group that dropped below 2 — ejecting its lone
// leftover to the root. Here we persist that: for each source group that no
// longer exists, ungroup the leftover(s) (group_id → null) then DELETE the group.
// `removedIds` are the members the triggering action took out (excluded from the
// leftovers). Best-effort — a failed/404 cleanup leaves the primary action intact.
function* cleanupDissolvedGroups(
  projectId: string,
  scenarioId: string,
  before: Record<string, GeoNode>,
  sourceGroupIds: Iterable<string>,
  removedIds: string[]
): Generator {
  const after = (yield select(selectNodesById)) as Record<string, GeoNode>
  for (const groupId of sourceGroupIds) {
    if (after[groupId]) continue // group kept ≥2 members → nothing to clean
    const ejected = (before[groupId]?.childIds ?? []).filter((cid) => !removedIds.includes(cid))
    try {
      if (ejected.length) yield call(service.moveNodes, projectId, scenarioId, ejected, null)
      yield call(service.deleteGroup, projectId, scenarioId, groupId)
    } catch {
      // cleanup is best-effort; the primary action already succeeded
    }
  }
}

// Deletes a node. A group hits the group endpoint (DELETE /groups/{id}, which
// drops the group and its members); a leaf hits the object endpoint. Pessimistic:
// the row is removed only on success, so a failed delete leaves the tree intact.
// Deleting a leaf that was one of a group's two members dissolves that group
// (min 2).
export function* deleteNodeWorker(action: DeleteNodeRequestedAction): Generator {
  const { projectId, scenarioId, id } = action
  // Read outside the try so the failure toast can still name the node.
  const before = (yield select(selectNodesById)) as Record<string, GeoNode>
  const node = before[id]
  try {
    const sourceGroupId = node?.parentId ?? null
    const deleteFn = node?.kind === 'group' ? service.deleteGroup : service.deleteNode
    yield call(deleteFn, projectId, scenarioId, id)
    yield put(actions.deleteNodeSucceeded(projectId, scenarioId, id))
    // Raised before the dissolved-group cleanup so the confirmation isn't held
    // back by calls the user never asked for (and that are allowed to fail).
    yield put(showSnackbar(toastMessages.groundDeleted(node?.name ?? 'geometry'), 'success'))
    if (sourceGroupId) {
      yield* cleanupDissolvedGroups(projectId, scenarioId, before, [sourceGroupId], [id])
    }
  } catch (err) {
    yield put(actions.deleteNodeFailed(projectId, scenarioId, id, (err as Error).message))
    // The reducer only releases the in-flight mark on DELETE_NODE_FAILED — the
    // slice has no error field, so this toast is the whole report. Without it the
    // row just stayed with nothing explaining why, and now that the form closes
    // only on success, the panel would sit there unexplained too.
    yield put(showSnackbar(toastMessages.groundDeleteFailed(node?.name ?? 'geometry'), 'error'))
  }
}

// +Ground: POST a new object with the blueprint's default values (Ground Size
// 10×10, Resolution 1×1, …), then open the right-panel form from the persisted
// object the backend returns. Materials are deferred (sent empty) until the
// materials-instance flow exists. takeLeading guards a double-click on +Ground.
export function* createObjectWorker(action: CreateObjectRequestedAction): Generator {
  const { projectId, scenarioId, objectTypeId, objectName, name } = action
  try {
    const objectTypes = (yield select(selectAllObjectTypes)) as ObjectTypeDef[]
    const objectType = objectTypes.find((o) => o.id === objectTypeId)
    const properties = numericProperties(defaultValuesForObject(objectType))
    const created = (yield call(service.createObject, projectId, scenarioId, {
      objectTypeId,
      name,
      properties,
      materials: []
    })) as service.CreatedObject
    yield put(
      actions.createObjectSucceeded(projectId, scenarioId, {
        node: created.node,
        values: created.values,
        objectTypeId,
        objectName
      })
    )
    yield put(showSnackbar(toastMessages.groundCreated(created.node.name), 'success'))
  } catch (err) {
    yield put(actions.createObjectFailed((err as Error).message))
    yield put(showSnackbar(toastMessages.groundCreateFailed, 'error'))
  }
}

// Shallow equality for the flat numeric-property maps — used to skip the
// properties PATCH when nothing in the form's values actually changed.
function sameProperties(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((k) => a[k] === b[k])
}

// Save: persist ONLY the property fields (§5.4 — properties/visibility/group).
// The name is NOT touched here; it has its own endpoint (§5.5) and commits on the
// name field's blur, independently of Save. So Save fires the update PATCH when
// the values changed, and is a no-op otherwise. takeLeading guards a double-tap.
export function* updateObjectWorker(action: UpdateObjectRequestedAction): Generator {
  const { projectId, scenarioId } = action
  const draft = (yield select(selectCreateDraft)) as CreateDraft | null
  if (!draft) return
  try {
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    const node = nodesById[draft.objectId]
    // Compare against the values cached when the form opened (or last saved).
    const detailsById = (yield select(selectDetailsById)) as Record<string, ObjectDetail>
    const original = detailsById[draft.objectId]
    const nextProps = numericProperties(draft.values)
    const propsChanged = !original || !sameProperties(nextProps, numericProperties(original.values))

    // Send just the groups picked this session that aren't already assigned on
    // the backend (baseline seeded from the GET). Empty = no material change, so
    // a re-Save of an unchanged ground sends nothing and avoids a 409.
    const newMaterials = draft.materials
      .filter((m) => !draft.materialBaseline.includes(m.groupId))
      .map((m) => ({ group_id: Number(m.groupId), sync: true }))

    // Single-select: anything in the baseline the draft no longer lists was
    // REPLACED in the form. The PATCH is add-only, so the displaced assignment
    // has to be DELETEd here — otherwise the ground would end up carrying both.
    // This runs BEFORE the PATCH so the ground is never momentarily double-
    // assigned, and only on Save, which is what lets an abandoned form leave the
    // previously saved material intact.
    const removedMaterialIds = draft.materialBaseline.filter(
      (id) => !draft.materials.some((m) => m.groupId === id)
    )
    if (removedMaterialIds.length) {
      yield all(
        removedMaterialIds.map((id) =>
          call(service.unassignMaterial, projectId, scenarioId, draft.objectId, id)
        )
      )
    }

    if (propsChanged || newMaterials.length) {
      yield call(service.updateObject, projectId, scenarioId, draft.objectId, {
        properties: nextProps,
        visibility: {
          viewport: node?.visibleInViewport ?? true,
          render: node?.renderEnabled ?? true
        },
        groupId: node?.parentId ?? null,
        materials: newMaterials
      })
    }
    yield put(
      actions.updateObjectSucceeded(projectId, scenarioId, {
        objectId: draft.objectId,
        propsChanged,
        // A newly-assigned material restyles the object even with props unchanged,
        // so the 3D viewport must re-fetch its binary in that case too. Losing one
        // restyles it just as much, so a replacement counts on both counts.
        materialsChanged: newMaterials.length > 0 || removedMaterialIds.length > 0,
        // What the request CARRIED — `draft` was read once, before the call, so
        // these are the values the backend now holds. The reducer must use these
        // and not the live draft: the form stays editable while the save is in
        // flight, and anything typed meanwhile has NOT been sent.
        savedValues: { ...draft.values },
        savedMaterials: [...draft.materials]
      })
    )
    yield put(showSnackbar(toastMessages.changesSaved, 'success'))
  } catch (err) {
    yield put(actions.updateObjectFailed((err as Error).message))
    yield put(showSnackbar(toastMessages.changesSaveFailed, 'error'))
  }
}

// Clicking a ground opens the right-panel form. Served from the per-scope cache
// if this object's detail was already fetched; otherwise GET it (and the reducer
// caches the result). takeLatest cancels a stale load on a fast re-click.
export function* loadObjectWorker(action: LoadObjectRequestedAction): Generator {
  const { projectId, scenarioId, id } = action
  try {
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    const node = nodesById[id]
    if (!node) return
    const detailsById = (yield select(selectDetailsById)) as Record<string, ObjectDetail>
    const cached = detailsById[id]
    if (cached) {
      yield put(actions.loadObjectSucceeded(projectId, scenarioId, { node, ...cached }))
      return
    }
    const loaded = (yield call(service.getObject, projectId, scenarioId, id)) as service.LoadedObject
    yield put(actions.loadObjectSucceeded(projectId, scenarioId, loaded))
  } catch (err) {
    yield put(actions.loadObjectFailed((err as Error).message))
  }
}

// Drop leaf→leaf → create a group server-side (§6.1), then insert the returned
// group (real id + name) into the slice. The optimistic local insert is gone:
// we wait for the POST so the id/name match what a later refetch returns. If a
// member came from an existing group, that source group may drop below 2 and is
// dissolved (min 2).
export function* groupNodesWorker(action: GroupNodesRequestedAction): Generator {
  const { projectId, scenarioId, memberIds } = action
  try {
    const before = (yield select(selectNodesById)) as Record<string, GeoNode>
    const sourceGroupIds = new Set<string>()
    for (const memberId of memberIds) {
      const parentId = before[memberId]?.parentId
      if (parentId) sourceGroupIds.add(parentId)
    }

    const group = (yield call(
      service.createGroup,
      projectId,
      scenarioId,
      memberIds
    )) as service.CreatedGroup
    yield put(actions.groupNodesSucceeded(projectId, scenarioId, group))

    yield* cleanupDissolvedGroups(projectId, scenarioId, before, sourceGroupIds, memberIds)
  } catch (err) {
    yield put(actions.groupNodesFailed(projectId, scenarioId, (err as Error).message))
  }
}

// Drag leaf(s) into a group, between groups, or back to root → PATCH each
// object's group_id (§5.4), then apply the reparent locally on success.
export function* moveNodesWorker(action: MoveNodesRequestedAction): Generator {
  const { projectId, scenarioId, nodeIds, toGroupId } = action
  try {
    // Note each moved node's source group (before the move) so we can clean up
    // any group left empty afterwards.
    const before = (yield select(selectNodesById)) as Record<string, GeoNode>
    const sourceGroupIds = new Set<string>()
    for (const id of nodeIds) {
      const parentId = before[id]?.parentId
      if (parentId && parentId !== toGroupId) sourceGroupIds.add(parentId)
    }

    yield call(service.moveNodes, projectId, scenarioId, nodeIds, toGroupId)
    yield put(actions.moveNodesSucceeded(projectId, scenarioId, nodeIds, toGroupId))

    // A move out can drop the source group below 2 members; mirror the reducer's
    // dissolve on the backend (ungroup the leftover, delete the group).
    yield* cleanupDissolvedGroups(projectId, scenarioId, before, sourceGroupIds, nodeIds)
  } catch (err) {
    yield put(actions.moveNodesFailed(projectId, scenarioId, (err as Error).message))
  }
}

// Persist an eye (viewport) toggle. The reducer already flipped state
// optimistically; here we persist (§5.4) and revert on failure. A group uses the
// dedicated group-visibility endpoint (which cascades server-side); a leaf
// PATCHes its own object.
export function* toggleViewportWorker(action: ToggleViewportAction): Generator {
  const { projectId, scenarioId, id } = action
  try {
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    const node = nodesById[id]
    if (!node) return
    const viewport = node.visibleInViewport // post-flip value
    if (node.kind === 'group') {
      yield call(service.updateGroupVisibility, projectId, scenarioId, id, { viewport })
    } else {
      yield call(service.updateVisibility, projectId, scenarioId, id, { viewport })
    }
  } catch (err) {
    yield put(actions.visibilitySyncFailed(projectId, scenarioId, id, 'viewport', (err as Error).message))
  }
}

// Persist a render-icon toggle. A group uses the dedicated group-visibility
// endpoint with just { render } (it cascades to members server-side). A leaf is
// the render master switch, so it PATCHes its object with both { render, models }
// (the reducer already flipped render AND every model to match) per §5.
export function* toggleRenderWorker(action: ToggleRenderAction): Generator {
  const { projectId, scenarioId, id } = action
  try {
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    const node = nodesById[id]
    if (!node) return
    if (node.kind === 'group') {
      yield call(service.updateGroupVisibility, projectId, scenarioId, id, {
        render: node.renderEnabled
      })
    } else {
      yield call(service.updateVisibility, projectId, scenarioId, id, {
        render: node.renderEnabled,
        models: node.modelVisibility
      })
    }
  } catch (err) {
    yield put(actions.visibilitySyncFailed(projectId, scenarioId, id, 'render', (err as Error).message))
  }
}

// Persist a per-model kebab toggle. Sends the one model AND the render flag,
// which the reducer kept in sync (render is on iff any model is on) — so the
// backend's visibility.render never drifts from the per-model state. A group
// uses the group endpoint (cascades to members); a leaf PATCHes its own object.
// The model id is stringified to match the API map shape.
export function* setModelOnWorker(action: SetModelOnAction): Generator {
  const { projectId, scenarioId, id, modelId, on } = action
  try {
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    const node = nodesById[id]
    if (!node) return
    const visibility = { models: { [String(modelId)]: on }, render: node.renderEnabled }
    if (node.kind === 'group') {
      yield call(service.updateGroupVisibility, projectId, scenarioId, id, visibility)
    } else {
      yield call(service.updateVisibility, projectId, scenarioId, id, visibility)
    }
  } catch (err) {
    yield put(
      actions.visibilitySyncFailed(projectId, scenarioId, id, 'model', (err as Error).message, modelId)
    )
  }
}

// Assign a material group to the drop target(s). One object for a leaf drop, or
// every member object for a group drop — all POSTed together. On success a
// single success toast; if ANY call fails, the failure toast names the material.
// Fire-and-report: the tree already shows the assignment via the backend repaint
// (sync), so there's no slice state to reconcile here.
export function* assignMaterialWorker(action: AssignMaterialRequestedAction): Generator {
  const { projectId, scenarioId, objectIds, groupId, materialName, targetName } = action
  if (!objectIds.length) return
  try {
    // Single-material rule: an object carries ONE material, so a drop REPLACES
    // what's already there. Collect every other group currently on the targets
    // and DELETE those assignments first, so the object is never briefly holding
    // two. Unlike the right-panel form this commits immediately — a drop has no
    // Save step to defer to.
    const nodesById = (yield select(selectNodesById)) as Record<string, GeoNode>
    // A material DELETED from the library was already unassigned server-side by
    // the eager reconcile, but the node keeps its (now dangling) group id — the
    // viewport's refetch gate reads it to find the objects the delete restyled,
    // so the reducer deliberately leaves it. DELETEing that assignment 404s, and
    // `all` fails fast: the drop aborted before a single POST, so a ground whose
    // material had been deleted could never take a new one. Displace only groups
    // the library still has.
    const libraryById = (yield select(selectMaterialsById)) as Record<string, unknown>
    const displaced = objectIds.flatMap((objectId) =>
      (nodesById[objectId]?.materialGroupIds ?? [])
        .filter((id) => id !== groupId && libraryById[id])
        .map((oldGroupId) => ({ objectId, oldGroupId }))
    )
    if (displaced.length) {
      yield all(
        displaced.map((d) =>
          call(service.unassignMaterial, projectId, scenarioId, d.objectId, d.oldGroupId)
        )
      )
    }
    // Objects already carrying this exact group need no POST — re-dropping the
    // same material is a no-op, and the backend would 409 on the duplicate.
    const toAssign = objectIds.filter(
      (objectId) => !(nodesById[objectId]?.materialGroupIds ?? []).includes(groupId)
    )
    yield all(
      toAssign.map((objectId) =>
        call(service.assignMaterialGroup, projectId, scenarioId, objectId, groupId)
      )
    )
    // Tell the 3D viewport which objects were restyled so it re-fetches their
    // binary geometry, and the open object form so it lists the new group —
    // without this the material only shows after a refresh.
    yield put(actions.assignMaterialSucceeded(projectId, scenarioId, objectIds, groupId, materialName))
    yield put(showSnackbar(toastMessages.materialAssigned(materialName, targetName), 'success'))
  } catch {
    yield put(showSnackbar(toastMessages.materialAssignFailed(materialName, targetName), 'error'))
  }
}

// Unassign a saved material group from the open object (the per-material trash
// icon, for a backend material). DELETE the assignment; on success the reducer
// drops it from the draft + baseline + detail cache. Pessimistic: a failed DELETE
// leaves the material in place and surfaces the error.
export function* unassignMaterialWorker(action: UnassignMaterialRequestedAction): Generator {
  const { projectId, scenarioId, objectId, groupId } = action
  try {
    yield call(service.unassignMaterial, projectId, scenarioId, objectId, groupId)
    yield put(actions.unassignMaterialSucceeded(projectId, scenarioId, objectId, groupId))
  } catch (err) {
    yield put(actions.unassignMaterialFailed(groupId, (err as Error).message))
  }
}

export default function* geometrySaga(): Generator {
  yield takeLatest(LIST_NODES_REQUESTED, listNodesWorker)
  yield takeEvery(RENAME_REQUESTED, renameWorker)
  yield takeEvery(DELETE_NODE_REQUESTED, deleteNodeWorker)
  yield takeLeading(CREATE_OBJECT_REQUESTED, createObjectWorker)
  yield takeLeading(UPDATE_OBJECT_REQUESTED, updateObjectWorker)
  yield takeLatest(LOAD_OBJECT_REQUESTED, loadObjectWorker)
  yield takeEvery(UNASSIGN_MATERIAL_REQUESTED, unassignMaterialWorker)
  yield takeEvery(GROUP_NODES_REQUESTED, groupNodesWorker)
  yield takeEvery(MOVE_NODES_REQUESTED, moveNodesWorker)
  yield takeEvery(TOGGLE_VIEWPORT, toggleViewportWorker)
  yield takeEvery(TOGGLE_RENDER, toggleRenderWorker)
  yield takeEvery(SET_MODEL_ON, setModelOnWorker)
  yield takeEvery(ASSIGN_MATERIAL_REQUESTED, assignMaterialWorker)
}
