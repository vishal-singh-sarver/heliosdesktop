import { selectAllObjectTypes } from 'containers/ProjectScreen/selectors'
import type { ObjectTypeDef } from 'containers/ProjectScreen/types'
import { call, put, select, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
import * as actions from './actions'
import type {
  CreateObjectRequestedAction,
  DeleteNodeRequestedAction,
  GroupNodesRequestedAction,
  ListNodesRequestedAction,
  LoadObjectRequestedAction,
  MoveNodesRequestedAction,
  RenameRequestedAction,
  UpdateObjectRequestedAction,
  SetModelOnAction,
  ToggleRenderAction,
  ToggleViewportAction
} from './actions'
import {
  CREATE_OBJECT_REQUESTED,
  DELETE_NODE_REQUESTED,
  GROUP_NODES_REQUESTED,
  LIST_NODES_REQUESTED,
  LOAD_OBJECT_REQUESTED,
  MOVE_NODES_REQUESTED,
  RENAME_REQUESTED,
  UPDATE_OBJECT_REQUESTED,
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
  try {
    const before = (yield select(selectNodesById)) as Record<string, GeoNode>
    const node = before[id]
    const sourceGroupId = node?.parentId ?? null
    const deleteFn = node?.kind === 'group' ? service.deleteGroup : service.deleteNode
    yield call(deleteFn, projectId, scenarioId, id)
    yield put(actions.deleteNodeSucceeded(projectId, scenarioId, id))
    if (sourceGroupId) {
      yield* cleanupDissolvedGroups(projectId, scenarioId, before, [sourceGroupId], [id])
    }
  } catch (err) {
    yield put(actions.deleteNodeFailed(projectId, scenarioId, id, (err as Error).message))
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
  } catch (err) {
    yield put(actions.createObjectFailed((err as Error).message))
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

    if (propsChanged) {
      yield call(service.updateObject, projectId, scenarioId, draft.objectId, {
        properties: nextProps,
        visibility: {
          viewport: node?.visibleInViewport ?? true,
          render: node?.renderEnabled ?? true
        },
        groupId: node?.parentId ?? null
      })
    }
    yield put(
      actions.updateObjectSucceeded(projectId, scenarioId, {
        objectId: draft.objectId,
        propsChanged
      })
    )
  } catch (err) {
    yield put(actions.updateObjectFailed((err as Error).message))
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

export default function* geometrySaga(): Generator {
  yield takeLatest(LIST_NODES_REQUESTED, listNodesWorker)
  yield takeEvery(RENAME_REQUESTED, renameWorker)
  yield takeEvery(DELETE_NODE_REQUESTED, deleteNodeWorker)
  yield takeLeading(CREATE_OBJECT_REQUESTED, createObjectWorker)
  yield takeLeading(UPDATE_OBJECT_REQUESTED, updateObjectWorker)
  yield takeLatest(LOAD_OBJECT_REQUESTED, loadObjectWorker)
  yield takeEvery(GROUP_NODES_REQUESTED, groupNodesWorker)
  yield takeEvery(MOVE_NODES_REQUESTED, moveNodesWorker)
  yield takeEvery(TOGGLE_VIEWPORT, toggleViewportWorker)
  yield takeEvery(TOGGLE_RENDER, toggleRenderWorker)
  yield takeEvery(SET_MODEL_ON, setModelOnWorker)
}
