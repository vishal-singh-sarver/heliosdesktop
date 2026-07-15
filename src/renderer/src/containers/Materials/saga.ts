import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'
import * as actions from './actions'
import type {
  CreateMaterialRequestedAction,
  DeleteMaterialRequestedAction,
  DeleteParameterGroupRequestedAction,
  OpenSavedMaterialRequestedAction,
  RenameMaterialRequestedAction,
  SaveParameterGroupRequestedAction
} from './actions'
import {
  CREATE_MATERIAL_REQUESTED,
  DELETE_MATERIAL_REQUESTED,
  DELETE_PARAMETER_GROUP_REQUESTED,
  LIST_MATERIALS_REQUESTED,
  OPEN_SAVED_MATERIAL_REQUESTED,
  RECORD_RECENT_COLOR,
  RENAME_MATERIAL_REQUESTED,
  SAVE_PARAMETER_GROUP_REQUESTED
} from './constants'
import { saveRecentColors } from './recentColors'
import { selectMaterialDetailsById, selectRecentColors } from './selectors'
import * as service from './service'
import type { RgbColor } from 'utils/color'
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
  } catch (err) {
    yield put(actions.createMaterialFailed((err as Error).message))
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

// Deletes the whole material (group + members). Pessimistic: the row is removed
// only on success, so a failed delete leaves it in the list.
export function* deleteMaterialWorker(action: DeleteMaterialRequestedAction): Generator {
  const { id, scenarioId } = action
  try {
    yield call(service.deleteGroup, id, scenarioId)
    yield put(actions.removeMaterial(id))
  } catch (err) {
    yield put(actions.deleteMaterialFailed(id, (err as Error).message))
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

// One parameter-group card's Save. The card's `saved` flag picks the call: the
// first save ADDS the material type to the group (POST), every later one UPDATES
// it (PATCH). Only on success is the card marked saved.
export function* saveParameterGroupWorker(action: SaveParameterGroupRequestedAction): Generator {
  const { groupId, cardId, materialTypeId, properties, saved, scenarioId } = action.payload
  try {
    if (saved) {
      yield call(service.updateGroupMaterial, groupId, materialTypeId, properties, scenarioId)
    } else {
      yield call(service.addGroupMaterial, groupId, materialTypeId, properties, scenarioId)
    }
    yield put(actions.saveParameterGroupSucceeded(cardId))
    // A committed visualisation colour joins the "Used colors" history. Keyed on
    // the payload carrying all three channels (a colour-only save), so a plain
    // model-type save records nothing.
    const color = colorFromProperties(properties)
    if (color) yield put(actions.recordRecentColor(color))
  } catch (err) {
    yield put(actions.saveParameterGroupFailed(cardId, (err as Error).message))
  }
}

// Pull an {r,g,b} out of a save payload when it carries all three colour
// channels as numbers — otherwise null (nothing to record).
function colorFromProperties(properties: MaterialPropertyValues): RgbColor | null {
  const { color_r: r, color_g: g, color_b: b } = properties
  if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') {
    return { r, g, b }
  }
  return null
}

// Mirror the (already-updated) "Used colors" list to localStorage after each
// record — the reducer holds the source of truth; this only persists it.
export function* persistRecentColorsWorker(): Generator {
  const colors = (yield select(selectRecentColors)) as RgbColor[]
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
    yield put(actions.removeParameterGroup(cardId))
    return
  }
  try {
    yield call(service.removeGroupMaterial, groupId, materialTypeId, scenarioId)
    yield put(actions.removeParameterGroup(cardId))
  } catch (err) {
    yield put(actions.deleteParameterGroupFailed(cardId, (err as Error).message))
  }
}

export default function* materialsSaga(): Generator {
  yield takeLatest(LIST_MATERIALS_REQUESTED, listMaterialsWorker)
  yield takeLatest(CREATE_MATERIAL_REQUESTED, createMaterialWorker)
  yield takeEvery(RENAME_MATERIAL_REQUESTED, renameMaterialWorker)
  yield takeEvery(DELETE_MATERIAL_REQUESTED, deleteMaterialWorker)
  yield takeLatest(OPEN_SAVED_MATERIAL_REQUESTED, openSavedMaterialWorker)
  yield takeEvery(SAVE_PARAMETER_GROUP_REQUESTED, saveParameterGroupWorker)
  yield takeEvery(DELETE_PARAMETER_GROUP_REQUESTED, deleteParameterGroupWorker)
  yield takeEvery(RECORD_RECENT_COLOR, persistRecentColorsWorker)
}
