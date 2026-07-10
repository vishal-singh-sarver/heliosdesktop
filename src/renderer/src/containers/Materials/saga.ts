import { call, put, takeEvery, takeLatest } from 'redux-saga/effects'
import * as actions from './actions'
import type { RenameMaterialRequestedAction, SaveMaterialRequestedAction } from './actions'
import {
  LIST_MATERIALS_REQUESTED,
  RENAME_MATERIAL_REQUESTED,
  SAVE_MATERIAL_REQUESTED
} from './constants'
import * as service from './service'
import type { Material } from './types'

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

// Persists a material rename (§7.5). Pessimistic: the name changes only on
// success, so a backend rejection (duplicate / too long) surfaces as an inline
// name error. Unsaved (local) rows have no backend id, so they rename in-place
// without a PATCH.
export function* renameMaterialWorker(action: RenameMaterialRequestedAction): Generator {
  const { projectId, id, name } = action
  if (id.startsWith('local-')) {
    yield put(actions.renameMaterialSucceeded(id, name))
    return
  }
  try {
    yield call(service.renameMaterial, projectId, id, name)
    yield put(actions.renameMaterialSucceeded(id, name))
  } catch (err) {
    yield put(actions.renameMaterialFailed(id, (err as Error).message))
  }
}

// Save Material — POST the draft as a global material group. On success close the
// form and reload the list so the new group appears (newest-first); on failure
// keep the form open and surface the backend message under the Save button.
export function* saveMaterialWorker(action: SaveMaterialRequestedAction): Generator {
  try {
    yield call(service.createGroup, action.payload)
    yield put(actions.saveMaterialSucceeded())
    yield put(actions.closeMaterialDraft())
    yield put(actions.listMaterialsRequested(action.payload.projectId))
  } catch (err) {
    yield put(actions.saveMaterialFailed((err as Error).message))
  }
}

export default function* materialsSaga(): Generator {
  yield takeLatest(LIST_MATERIALS_REQUESTED, listMaterialsWorker)
  yield takeEvery(RENAME_MATERIAL_REQUESTED, renameMaterialWorker)
  yield takeLatest(SAVE_MATERIAL_REQUESTED, saveMaterialWorker)
}
