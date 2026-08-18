import type { Task } from 'redux-saga'
import { call, cancel, fork, put, select, take, takeEvery, takeLatest } from 'redux-saga/effects'
import { showSnackbar } from '@renderer/store/snackbarReducer'
import toastMessages from '@renderer/store/toastMessages'
import type { RecentColor } from 'utils/color'
import type {
  CreateMaterialRequestedAction,
  DeleteMaterialRequestedAction,
  DeleteParameterGroupRequestedAction,
  LoadMaterialDetailRequestedAction,
  OpenSavedMaterialRequestedAction,
  RenameMaterialRequestedAction,
  SaveParameterGroupRequestedAction,
  UploadTextureRequestedAction
} from './actions'
import * as actions from './actions'
import {
  CREATE_MATERIAL_REQUESTED,
  DELETE_MATERIAL_REQUESTED,
  DELETE_PARAMETER_GROUP_REQUESTED,
  LIST_MATERIALS_REQUESTED,
  LOAD_MATERIAL_DETAIL_REQUESTED,
  OPEN_SAVED_MATERIAL_REQUESTED,
  RECORD_RECENT_COLOR,
  RENAME_MATERIAL_REQUESTED,
  SAVE_PARAMETER_GROUP_REQUESTED,
  UPLOAD_TEXTURE_REQUESTED
} from './constants'
import { DEFAULT_RECENT_OPACITY, saveRecentColors } from './recentColors'
import { selectMaterialDetailsById, selectMaterialsById, selectRecentColors } from './selectors'
import * as service from './service'
import type { Material, MaterialGroupDetail, MaterialPropertyValues } from './types'

// Loads the GLOBAL material-group library. takeLatest cancels a stale load if a
// newer request arrives (e.g. the active project changes mid-request).
export function* listMaterialsWorker(): Generator {
  try {
    const materials = (yield call(service.listMaterials)) as Material[]
    yield put(actions.listMaterialsSucceeded(materials))
  } catch (err) {
    yield put(actions.listMaterialsFailed((err as Error).message))
  }
}

// +Add Materials — create the material on the backend straight away as an EMPTY
// group. Materials are GLOBAL, so the create needs nothing but the name. The
// reducer inserts the returned group as a row, seeds its (empty) detail cache and
// opens the Properties form — so this costs exactly ONE call. We deliberately do
// NOT re-list: that would be a redundant GET and would wipe the detail cache.
// Mirrors Geometry's +Ground, which inserts the object the POST returned.
export function* createMaterialWorker(action: CreateMaterialRequestedAction): Generator {
  const { name } = action
  try {
    const groupId = (yield call(service.createGroup, name)) as string
    yield put(actions.createMaterialSucceeded(groupId, name))
    yield put(showSnackbar(toastMessages.materialCreated(name), 'success'))
  } catch (err) {
    yield put(actions.createMaterialFailed((err as Error).message))
    yield put(showSnackbar(toastMessages.materialCreateFailed(name), 'error'))
  }
}

// Renames the material (the group). Pessimistic: the name changes only on
// success, so a backend rejection (duplicate / too long) surfaces inline.
export function* renameMaterialWorker(action: RenameMaterialRequestedAction): Generator {
  const { id, name, scenarioId } = action
  try {
    yield call(service.renameGroup, id, name, scenarioId)
    yield put(actions.renameMaterialSucceeded(id, name))
  } catch (err) {
    yield put(actions.renameMaterialFailed(id, (err as Error).message))
  }
}

// Watches renames, keeping at most ONE in flight PER MATERIAL: a second rename of
// the same material cancels the first, so a slow earlier response can't land after
// a newer one and put the older name back on screen.
//
// Not plain takeLatest, which is global — that would also cancel a rename of a
// DIFFERENT material, losing an unrelated edit. Cancelling the worker doesn't
// abort the request already in flight; it stops the stale SUCCEEDED from ever
// being dispatched, which is the part that corrupted the UI.
export function* renameWatcher(): Generator {
  const inFlight: Record<string, Task> = {}
  while (true) {
    const action = (yield take(RENAME_MATERIAL_REQUESTED)) as RenameMaterialRequestedAction
    const previous = inFlight[action.id]
    if (previous) yield cancel(previous)
    inFlight[action.id] = (yield fork(renameMaterialWorker, action)) as Task
  }
}

// Deletes the whole material (group + members). Pessimistic: the row is removed
// only on success, so a failed delete leaves it in the list.
export function* deleteMaterialWorker(action: DeleteMaterialRequestedAction): Generator {
  const { id, scenarioId } = action
  // Read the name up front — the row is still in the list here, but the toast is
  // built in the catch, so grab it before anything can change underneath.
  const byId = (yield select(selectMaterialsById)) as Record<string, Material>
  const name = byId[id]?.name ?? 'material'
  try {
    yield call(service.deleteGroup, id, scenarioId)
    yield put(actions.removeMaterial(id))
    yield put(showSnackbar(toastMessages.materialDeleted(name), 'success'))
  } catch (err) {
    yield put(actions.deleteMaterialFailed(id, (err as Error).message))
    // Mirrors the geometry delete. The reducer only releases the in-flight mark on
    // DELETE_MATERIAL_FAILED — it deliberately no longer banners the raw backend
    // text — so this toast is the whole report.
    yield put(showSnackbar(toastMessages.materialDeleteFailed(name), 'error'))
  }
}

// Opens a saved material in the form. Served from the cache if this group's
// detail was already fetched; otherwise GET it (and the reducer caches the
// result). So clicking a material a second time makes no API call, while a list
// refresh — or any change to the group — invalidates the cache and the next click
// refetches. takeLatest cancels a stale load on a fast re-click. Mirrors
// Geometry's loadObjectWorker.
export function* openSavedMaterialWorker(action: OpenSavedMaterialRequestedAction): Generator {
  try {
    const detailsById = (yield select(selectMaterialDetailsById)) as Record<
      string,
      MaterialGroupDetail
    >
    const cached = detailsById[action.id]
    if (cached) {
      yield put(actions.openSavedMaterialLoaded(cached))
      return
    }
    const detail = (yield call(service.getGroup, action.id)) as MaterialGroupDetail
    yield put(actions.openSavedMaterialLoaded(detail))
  } catch (err) {
    yield put(actions.openSavedMaterialFailed(action.id, (err as Error).message))
  }
}

// Same cache-check-then-GET as openSavedMaterialWorker, but it ONLY fills the
// detail cache — it does not open the editor form. The geometry Materials popup
// reads detailsById to show a picked material's properties; on a cache miss it
// dispatches this to fetch them. takeEvery (not takeLatest) so concurrent loads
// for different groups don't cancel each other. A failed fetch is swallowed —
// the popup just keeps its empty state (this is a read-only view).
export function* loadMaterialDetailWorker(action: LoadMaterialDetailRequestedAction): Generator {
  try {
    const detailsById = (yield select(selectMaterialDetailsById)) as Record<
      string,
      MaterialGroupDetail
    >
    if (detailsById[action.id]) return
    const detail = (yield call(service.getGroup, action.id)) as MaterialGroupDetail
    yield put(actions.materialDetailLoaded(detail))
  } catch {
    // Read-only view — leave the popup's empty state on failure.
  }
}

// One parameter-group card's Save. The card's `saved` flag picks the call: the
// first save ADDS the material type to the group (POST), every later one UPDATES
// it (PATCH). Only on success is the card marked saved.
export function* saveParameterGroupWorker(action: SaveParameterGroupRequestedAction): Generator {
  const { groupId, cardId, materialTypeId, properties, saved, scenarioId, obsoleteFilePath } =
    action.payload
  try {
    if (saved) {
      yield call(service.updateGroupMaterial, groupId, materialTypeId, properties, scenarioId)
    } else {
      yield call(service.addGroupMaterial, groupId, materialTypeId, properties, scenarioId)
    }
    // The save has just dropped this material's reference to the replaced/removed
    // file (and re-synced the active scenario's geometry), so the file can now be
    // deleted. Best-effort and AFTER the save landed: a 409 (still referenced by
    // another scenario's frozen snapshot) or any other error must never fail the
    // save — the orphan is reclaimed when that scenario next syncs.
    if (obsoleteFilePath) {
      try {
        yield call(service.deleteMaterialFile, groupId, obsoleteFilePath)
      } catch {
        // Intentionally ignored — see above.
      }
    }
    // The outcome carries `groupId` as well as `cardId`: this request may land
    // after the user has opened a DIFFERENT material, and card ids restart at 1
    // per material, so the reducer needs it to tell "my card 1" from "some other
    // material's card 1".
    yield put(actions.saveParameterGroupSucceeded(groupId, cardId))
    // A committed visualisation colour joins the "Used colors" history. Keyed on
    // the payload carrying all three channels (a colour-only save), so a plain
    // model-type save records nothing.
    const color = colorFromProperties(properties)
    if (color) yield put(actions.recordRecentColor(color))
    yield put(showSnackbar(toastMessages.changesSaved, 'success'))
  } catch (err) {
    yield put(actions.saveParameterGroupFailed(groupId, cardId, (err as Error).message))
    yield put(showSnackbar(toastMessages.changesSaveFailed, 'error'))
  }
}

// Runs one card's save, then releases its in-flight lock — whether it succeeded or
// failed. Split out so saveWatcher can guarantee the key is freed for a later,
// legitimate save (e.g. a PUT after the first POST landed).
export function* trackedSave(
  inFlight: Set<string>,
  key: string,
  action: SaveParameterGroupRequestedAction
): Generator {
  try {
    yield call(saveParameterGroupWorker, action)
  } finally {
    inFlight.delete(key)
  }
}

// De-dupes card saves keyed by (groupId, cardId): while one is in flight, further
// save requests for the SAME card are dropped. A first save POSTs (adds the type)
// and only flips the card to `saved` on success — so two fast clicks both read
// `saved: false` and, under a plain takeEvery, both POSTed, the second 409-ing
// "already added" and showing a spurious error on a card that saved fine. Dropping
// the duplicate while the first is running closes that window; once it completes
// the key frees, so a genuine later update still runs.
export function* saveWatcher(): Generator {
  const inFlight = new Set<string>()
  while (true) {
    const action = (yield take(SAVE_PARAMETER_GROUP_REQUESTED)) as SaveParameterGroupRequestedAction
    const key = `${action.payload.groupId}:${action.payload.cardId}`
    if (inFlight.has(key)) continue
    inFlight.add(key)
    yield fork(trackedSave, inFlight, key, action)
  }
}

// Pull an {r,g,b,opacity} out of a save payload when it carries all three colour
// channels as numbers — otherwise null (nothing to record). The opacity rides
// along so the history entry can restore it; a payload without one (the field
// was left empty) falls back to the picker's fully-opaque default rather than
// blocking the record — the colour is still worth remembering.
function colorFromProperties(properties: MaterialPropertyValues): RecentColor | null {
  const { color_r: r, color_g: g, color_b: b, opacity } = properties
  if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
    return {
      r,
      g,
      b,
      opacity: typeof opacity === 'number' ? opacity : DEFAULT_RECENT_OPACITY
    }
  }
  return null
}

// Mirror the (already-updated) "Used colors" list to localStorage after each
// record — the reducer holds the source of truth; this only persists it.
export function* persistRecentColorsWorker(): Generator {
  const colors = (yield select(selectRecentColors)) as RecentColor[]
  yield call(saveRecentColors, colors)
}

// One parameter-group card's Delete. A card that was never saved (or has no type
// yet) has nothing on the backend — just drop it. A saved one removes its
// material type from the group first, and the card goes only on success.
export function* deleteParameterGroupWorker(
  action: DeleteParameterGroupRequestedAction
): Generator {
  const { groupId, cardId, materialTypeId, saved, scenarioId } = action.payload
  if (!saved || materialTypeId == null) {
    yield put(actions.removeParameterGroup(groupId, cardId))
    return
  }
  try {
    yield call(service.removeGroupMaterial, groupId, materialTypeId, scenarioId)
    yield put(actions.removeParameterGroup(groupId, cardId))
    // Announce that the STORED material changed. Removing a Visualiser strips the
    // colour/texture off every object the material is assigned to, and without
    // this nothing told the 3D scene — the ground kept rendering a texture that no
    // longer existed until something else forced a reload.
    yield put(actions.deleteParameterGroupSucceeded(groupId, cardId))
  } catch (err) {
    yield put(actions.deleteParameterGroupFailed(groupId, cardId, (err as Error).message))
  }
}

// Upload a member file, routed by which property it belongs to — each has its own
// backend endpoint:
//   - texture_file  → stores the file AND persists the member in texture mode
//                     (creating it if missing), so the upload IS the save.
//   - spectral_data → the dedicated /spectral endpoint; stores the file and
//                     returns its path, which the card stages for its next Save.
//                     It does NOT create the member (the editor gates on `saved`).
//   - anything else → the generic per-property file endpoint.
// On success we hand the returned path back keyed by its property.
export function* uploadTextureWorker(action: UploadTextureRequestedAction): Generator {
  const { groupId, cardId, materialTypeId, file, scenarioId, property = 'texture_file' } =
    action.payload
  try {
    const upload =
      property === 'texture_file'
        ? call(service.uploadTextureFile, groupId, materialTypeId, file, scenarioId)
        : property === 'spectral_data'
          ? call(service.uploadSpectralFile, groupId, materialTypeId, file, scenarioId)
          : call(service.uploadMaterialFile, groupId, materialTypeId, property, file, scenarioId)
    const path = (yield upload) as string
    yield put(actions.uploadTextureSucceeded(groupId, cardId, path, property))
  } catch (err) {
    yield put(actions.uploadTextureFailed(groupId, cardId, (err as Error).message))
  }
}

export default function* materialsSaga(): Generator {
  yield takeLatest(LIST_MATERIALS_REQUESTED, listMaterialsWorker)
  yield takeLatest(CREATE_MATERIAL_REQUESTED, createMaterialWorker)
  yield fork(renameWatcher)
  yield takeEvery(DELETE_MATERIAL_REQUESTED, deleteMaterialWorker)
  yield takeLatest(OPEN_SAVED_MATERIAL_REQUESTED, openSavedMaterialWorker)
  // saveWatcher owns SAVE_PARAMETER_GROUP_REQUESTED — it de-dupes concurrent card
  // saves and forks saveParameterGroupWorker internally. A second direct
  // takeEvery(SAVE_PARAMETER_GROUP_REQUESTED, saveParameterGroupWorker) (from the
  // material_select_button branch) would run the worker a SECOND time per save →
  // duplicate POST → 409 "already added". So the watcher is the only registration.
  yield fork(saveWatcher)
  yield takeEvery(LOAD_MATERIAL_DETAIL_REQUESTED, loadMaterialDetailWorker)
  yield takeEvery(DELETE_PARAMETER_GROUP_REQUESTED, deleteParameterGroupWorker)
  yield takeEvery(RECORD_RECENT_COLOR, persistRecentColorsWorker)
  yield takeEvery(UPLOAD_TEXTURE_REQUESTED, uploadTextureWorker)
}
