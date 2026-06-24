import { call, put, takeEvery, takeLatest } from 'redux-saga/effects'
import * as actions from './actions'
import type { ListMaterialsRequestedAction, RenameMaterialRequestedAction } from './actions'
import { LIST_MATERIALS_REQUESTED, RENAME_MATERIAL_REQUESTED } from './constants'
import * as service from './service'
import type { Material } from './types'

// Loads the project's persisted material library (§7.2). takeLatest cancels a
// stale load if the active project changes mid-request.
export function* listMaterialsWorker(action: ListMaterialsRequestedAction): Generator {
  try {
    const materials = (yield call(service.listMaterials, action.projectId)) as Material[]
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

export default function* materialsSaga(): Generator {
  yield takeLatest(LIST_MATERIALS_REQUESTED, listMaterialsWorker)
  yield takeEvery(RENAME_MATERIAL_REQUESTED, renameMaterialWorker)
}
