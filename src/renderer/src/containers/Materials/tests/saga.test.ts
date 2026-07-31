import { call, cancel, fork, put, select, take, takeEvery, takeLatest } from 'redux-saga/effects'
import * as actions from '../actions'
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
} from '../constants'
import materialsSaga, {
  createMaterialWorker,
  deleteMaterialWorker,
  deleteParameterGroupWorker,
  listMaterialsWorker,
  loadMaterialDetailWorker,
  openSavedMaterialWorker,
  persistRecentColorsWorker,
  renameMaterialWorker,
  renameWatcher,
  saveParameterGroupWorker,
  saveWatcher,
  trackedSave,
  uploadTextureWorker
} from '../saga'
import { selectMaterialDetailsById, selectRecentColors } from '../selectors'
import { saveRecentColors } from '../recentColors'
import * as service from '../service'
import type { Material, MaterialGroupDetail } from '../types'

const material: Material = {
  id: '11',
  name: 'GMaterial.002',
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: null,
  createdAt: ''
}

describe('listMaterialsWorker', () => {
  it('calls the global listMaterials then puts listMaterialsSucceeded', () => {
    const gen = listMaterialsWorker()
    expect(gen.next().value).toEqual(call(service.listMaterials))
    expect(gen.next([material]).value).toEqual(put(actions.listMaterialsSucceeded([material])))
    expect(gen.next().done).toBe(true)
  })

  it('puts listMaterialsFailed on error', () => {
    const gen = listMaterialsWorker()
    gen.next()
    expect(gen.throw(new Error('boom')).value).toEqual(put(actions.listMaterialsFailed('boom')))
  })
})

describe('createMaterialWorker', () => {
  it('creates the empty group in ONE call — no redundant list refetch', () => {
    const gen = createMaterialWorker(actions.createMaterialRequested('Material.001'))
    expect(gen.next().value).toEqual(call(service.createGroup, 'Material.001'))
    expect(gen.next('12').value).toEqual(put(actions.createMaterialSucceeded('12', 'Material.001')))
    // The reducer inserts the row + seeds the cache from the response, so there is
    // no follow-up GET (a re-list would also wipe the detail cache).
    expect(gen.next().done).toBe(true)
  })

  it('puts createMaterialFailed on error', () => {
    const gen = createMaterialWorker(actions.createMaterialRequested('Material.001'))
    gen.next()
    expect(gen.throw(new Error('boom')).value).toEqual(put(actions.createMaterialFailed('boom')))
  })
})

describe('renameMaterialWorker', () => {
  it('PUTs the group then puts renameMaterialSucceeded', () => {
    const gen = renameMaterialWorker(actions.renameMaterialRequested('11', 'Dry Grass', 's1'))
    expect(gen.next().value).toEqual(call(service.renameGroup, '11', 'Dry Grass', 's1'))
    expect(gen.next().value).toEqual(put(actions.renameMaterialSucceeded('11', 'Dry Grass')))
    expect(gen.next().done).toBe(true)
  })

  it('puts renameMaterialFailed on error', () => {
    const gen = renameMaterialWorker(actions.renameMaterialRequested('11', 'Dry Grass', null))
    gen.next()
    expect(gen.throw(new Error('Material name already exists')).value).toEqual(
      put(actions.renameMaterialFailed('11', 'Material name already exists'))
    )
  })
})

// Renames are cancelled PER MATERIAL. Two quick renames of the same material used
// to run to completion under takeEvery, so a slow first response could land after
// the second and put the older name back on the row. Plain takeLatest would fix
// that but is global — it would also kill an unrelated material's rename.
describe('renameWatcher', () => {
  const first = actions.renameMaterialRequested('11', 'Foo', null)
  const second = actions.renameMaterialRequested('11', 'Bar', null)
  const other = actions.renameMaterialRequested('37', 'Baz', null)

  // `cancel()` rejects anything that isn't a real task, so the value fed back for
  // the fork has to carry redux-saga's task marker. This is what createMockTask
  // from @redux-saga/testing-utils produces — inlined rather than pulling in a
  // dev dependency for one assertion.
  const mockTask = (): never => ({ '@@redux-saga/TASK': true }) as never

  it('cancels the in-flight rename of the SAME material before starting the next', () => {
    const gen = renameWatcher()
    expect(gen.next().value).toEqual(take(RENAME_MATERIAL_REQUESTED))
    // First rename of '11' — nothing to cancel yet.
    expect(gen.next(first).value).toEqual(fork(renameMaterialWorker, first))

    const task = mockTask()
    expect(gen.next(task).value).toEqual(take(RENAME_MATERIAL_REQUESTED))
    // Second rename of '11' — the first is cancelled first, so its stale
    // SUCCEEDED can never be dispatched.
    expect(gen.next(second).value).toEqual(cancel(task as never))
    expect(gen.next().value).toEqual(fork(renameMaterialWorker, second))
  })

  it('leaves a DIFFERENT material’s rename running', () => {
    const gen = renameWatcher()
    gen.next()
    gen.next(first) // fork for '11'
    const task = mockTask()
    gen.next(task) // take
    // A rename of '37' must not cancel '11' — straight to the fork.
    expect(gen.next(other).value).toEqual(fork(renameMaterialWorker, other))
  })
})

describe('deleteMaterialWorker', () => {
  it('DELETEs the group then removes the row', () => {
    const gen = deleteMaterialWorker(actions.deleteMaterialRequested('7', 's1'))
    expect(gen.next().value).toEqual(call(service.deleteGroup, '7', 's1'))
    expect(gen.next().value).toEqual(put(actions.removeMaterial('7')))
    expect(gen.next().done).toBe(true)
  })

  it('puts deleteMaterialFailed on error (row stays)', () => {
    const gen = deleteMaterialWorker(actions.deleteMaterialRequested('7', null))
    gen.next()
    expect(gen.throw(new Error('boom')).value).toEqual(
      put(actions.deleteMaterialFailed('7', 'boom'))
    )
  })
})

describe('openSavedMaterialWorker', () => {
  const detail: MaterialGroupDetail = {
    id: '7',
    name: 'Default Stomatal',
    members: [{ materialTypeId: 6, properties: { air_humidity: '0.5' } }]
  }

  it('GETs the group the first time, then loads it into the form', () => {
    const gen = openSavedMaterialWorker(actions.openSavedMaterialRequested('7'))
    expect(gen.next().value).toEqual(select(selectMaterialDetailsById))
    // Nothing cached yet → fetch.
    expect(gen.next({}).value).toEqual(call(service.getGroup, '7'))
    expect(gen.next(detail).value).toEqual(put(actions.openSavedMaterialLoaded(detail)))
    expect(gen.next().done).toBe(true)
  })

  it('serves an already-loaded material from the cache with NO api call', () => {
    const gen = openSavedMaterialWorker(actions.openSavedMaterialRequested('7'))
    expect(gen.next().value).toEqual(select(selectMaterialDetailsById))
    // Cached → straight to the form, never calling service.getGroup.
    expect(gen.next({ '7': detail }).value).toEqual(put(actions.openSavedMaterialLoaded(detail)))
    expect(gen.next().done).toBe(true)
  })

  it('puts openSavedMaterialFailed on error', () => {
    const gen = openSavedMaterialWorker(actions.openSavedMaterialRequested('7'))
    gen.next()
    gen.next({})
    expect(gen.throw(new Error('boom')).value).toEqual(
      put(actions.openSavedMaterialFailed('7', 'boom'))
    )
  })
})

describe('loadMaterialDetailWorker', () => {
  const detail: MaterialGroupDetail = {
    id: '7',
    name: 'Grass',
    members: [{ materialTypeId: 1, properties: { reflectivity: '0.3' } }]
  }

  it('GETs the group on a cache miss and caches it (no form open)', () => {
    const gen = loadMaterialDetailWorker(actions.loadMaterialDetailRequested('7'))
    expect(gen.next().value).toEqual(select(selectMaterialDetailsById))
    // Cache miss → fetch, then a cache-only load (NOT openSavedMaterialLoaded).
    expect(gen.next({}).value).toEqual(call(service.getGroup, '7'))
    expect(gen.next(detail).value).toEqual(put(actions.materialDetailLoaded(detail)))
    expect(gen.next().done).toBe(true)
  })

  it('serves from cache with NO api call and NO dispatch', () => {
    const gen = loadMaterialDetailWorker(actions.loadMaterialDetailRequested('7'))
    expect(gen.next().value).toEqual(select(selectMaterialDetailsById))
    // Already cached → returns immediately, never calling getGroup or dispatching.
    expect(gen.next({ '7': detail }).done).toBe(true)
  })

  it('swallows a fetch error (read-only view keeps its empty state)', () => {
    const gen = loadMaterialDetailWorker(actions.loadMaterialDetailRequested('7'))
    gen.next() // select cache
    gen.next({}) // cache miss → getGroup
    // Caught internally → the generator just finishes, no failure dispatched.
    expect(gen.throw(new Error('boom')).done).toBe(true)
  })
})

describe('saveParameterGroupWorker', () => {
  const base = {
    groupId: '12',
    cardId: 1,
    materialTypeId: 2,
    properties: { radiation_flux: 55 },
    scenarioId: 's1'
  }

  it('ADDs the material type the first time (card not yet saved)', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({ ...base, saved: false })
    )
    expect(gen.next().value).toEqual(
      call(service.addGroupMaterial, '12', 2, { radiation_flux: 55 }, 's1')
    )
    expect(gen.next().value).toEqual(put(actions.saveParameterGroupSucceeded('12', 1)))
    expect(gen.next().done).toBe(true)
  })

  it('UPDATEs the material type once the card is saved', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({ ...base, saved: true })
    )
    expect(gen.next().value).toEqual(
      call(service.updateGroupMaterial, '12', 2, { radiation_flux: 55 }, 's1')
    )
    expect(gen.next().value).toEqual(put(actions.saveParameterGroupSucceeded('12', 1)))
    expect(gen.next().done).toBe(true)
  })

  it('puts saveParameterGroupFailed on error', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({ ...base, saved: false })
    )
    gen.next()
    expect(gen.throw(new Error('DATATYPE_MISMATCH')).value).toEqual(
      put(actions.saveParameterGroupFailed('12', 1, 'DATATYPE_MISMATCH'))
    )
  })

  it('records the colour when the saved payload carries all three channels', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({
        ...base,
        properties: { color_r: 10, color_g: 20, color_b: 30, opacity: 40 },
        saved: false
      })
    )
    gen.next() // add call
    expect(gen.next().value).toEqual(put(actions.saveParameterGroupSucceeded('12', 1)))
    // A visualisation colour save then feeds the "Used colors" history — with the
    // opacity it was saved at, so the swatch can restore the whole appearance.
    expect(gen.next().value).toEqual(
      put(actions.recordRecentColor({ r: 10, g: 20, b: 30, opacity: 40 }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('records a colour saved without an opacity as fully opaque', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({
        ...base,
        properties: { color_r: 10, color_g: 20, color_b: 30 },
        saved: false
      })
    )
    gen.next() // add call
    gen.next() // succeeded
    expect(gen.next().value).toEqual(
      put(actions.recordRecentColor({ r: 10, g: 20, b: 30, opacity: 100 }))
    )
  })

  it('records nothing when the payload has no colour channels', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({ ...base, saved: false })
    )
    gen.next() // add call
    expect(gen.next().value).toEqual(put(actions.saveParameterGroupSucceeded('12', 1)))
    // No color_r/g/b → the worker finishes without a record.
    expect(gen.next().done).toBe(true)
  })

  it('deletes the obsolete file AFTER the save drops its reference', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({
        ...base,
        saved: true,
        obsoleteFilePath: 'uploads/groups/12/old.xml'
      })
    )
    expect(gen.next().value).toEqual(
      call(service.updateGroupMaterial, '12', 2, { radiation_flux: 55 }, 's1')
    )
    // The delete runs only after the save, so the reference is already gone.
    expect(gen.next().value).toEqual(
      call(service.deleteMaterialFile, '12', 'uploads/groups/12/old.xml')
    )
    expect(gen.next().value).toEqual(put(actions.saveParameterGroupSucceeded('12', 1)))
    expect(gen.next().done).toBe(true)
  })

  it('still succeeds when the obsolete-file delete is refused (409) or errors', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({
        ...base,
        saved: true,
        obsoleteFilePath: 'uploads/groups/12/old.xml'
      })
    )
    gen.next() // update call
    gen.next() // delete call
    // A 409 (still referenced by another scenario) or any error is swallowed —
    // the save still completes successfully.
    expect(gen.throw(new Error('CONFLICT')).value).toEqual(
      put(actions.saveParameterGroupSucceeded('12', 1))
    )
    expect(gen.next().done).toBe(true)
  })
})

// Card saves are de-duped per (groupId, cardId): a first save POSTs and only
// flips the card to `saved` on success, so two fast clicks both read saved:false
// and, under takeEvery, both POSTed — the second 409-ing on a card that saved fine.
describe('saveWatcher', () => {
  const req = (groupId: string, cardId: number) =>
    actions.saveParameterGroupRequested({
      groupId,
      cardId,
      materialTypeId: 2,
      properties: {},
      saved: false,
      scenarioId: null
    })
  const mockTask = (): never => ({ '@@redux-saga/TASK': true }) as never

  it('drops a second save for the SAME card while the first is in flight', () => {
    const gen = saveWatcher()
    expect(gen.next().value).toEqual(take(SAVE_PARAMETER_GROUP_REQUESTED))

    // First save of card 12:1 → forks the tracked worker.
    const forked = gen.next(req('12', 1)).value as { type: string }
    expect(forked.type).toBe('FORK')

    // Back to waiting.
    expect(gen.next(mockTask()).value).toEqual(take(SAVE_PARAMETER_GROUP_REQUESTED))

    // A duplicate for 12:1 while the first is still running → NO fork, straight
    // back to take.
    expect(gen.next(req('12', 1)).value).toEqual(take(SAVE_PARAMETER_GROUP_REQUESTED))

    // A different card (12:2) is unaffected — it forks.
    const forked2 = gen.next(req('12', 2)).value as { type: string }
    expect(forked2.type).toBe('FORK')
  })

  it('trackedSave runs the save then frees the key, so a later save can run again', () => {
    const inFlight = new Set(['12:1'])
    const action = req('12', 1)
    const gen = trackedSave(inFlight, '12:1', action)
    // Delegates to the real worker...
    expect(gen.next().value).toEqual(call(saveParameterGroupWorker, action))
    // ...and on completion the finally frees the lock.
    expect(gen.next().done).toBe(true)
    expect(inFlight.has('12:1')).toBe(false)
  })
})

describe('persistRecentColorsWorker', () => {
  it('mirrors the current recent-colours list to localStorage', () => {
    const gen = persistRecentColorsWorker()
    expect(gen.next().value).toEqual(select(selectRecentColors))
    const list = [{ r: 1, g: 2, b: 3, opacity: 55 }]
    expect(gen.next(list).value).toEqual(call(saveRecentColors, list))
    expect(gen.next().done).toBe(true)
  })
})

describe('deleteParameterGroupWorker', () => {
  it('removes the material type from the group when the card was saved', () => {
    const gen = deleteParameterGroupWorker(
      actions.deleteParameterGroupRequested({
        groupId: '12',
        cardId: 1,
        materialTypeId: 2,
        saved: true,
        scenarioId: 's1'
      })
    )
    expect(gen.next().value).toEqual(call(service.removeGroupMaterial, '12', 2, 's1'))
    expect(gen.next().value).toEqual(put(actions.removeParameterGroup('12', 1)))
    expect(gen.next().done).toBe(true)
  })

  it('drops an unsaved card without calling the backend', () => {
    const gen = deleteParameterGroupWorker(
      actions.deleteParameterGroupRequested({
        groupId: '12',
        cardId: 1,
        materialTypeId: 2,
        saved: false,
        scenarioId: 's1'
      })
    )
    expect(gen.next().value).toEqual(put(actions.removeParameterGroup('12', 1)))
    expect(gen.next().done).toBe(true)
  })

  it('puts deleteParameterGroupFailed on error (card stays)', () => {
    const gen = deleteParameterGroupWorker(
      actions.deleteParameterGroupRequested({
        groupId: '12',
        cardId: 1,
        materialTypeId: 2,
        saved: true,
        scenarioId: null
      })
    )
    gen.next()
    expect(gen.throw(new Error('boom')).value).toEqual(
      put(actions.deleteParameterGroupFailed('12', 1, 'boom'))
    )
  })
})

describe('materialsSaga', () => {
  it('wires the watchers', () => {
    const gen = materialsSaga()
    expect(gen.next().value).toEqual(takeLatest(LIST_MATERIALS_REQUESTED, listMaterialsWorker))
    expect(gen.next().value).toEqual(takeLatest(CREATE_MATERIAL_REQUESTED, createMaterialWorker))
    // Renames go through a keyed watcher, not takeEvery — see renameWatcher.
    expect(gen.next().value).toEqual(fork(renameWatcher))
    expect(gen.next().value).toEqual(takeEvery(DELETE_MATERIAL_REQUESTED, deleteMaterialWorker))
    expect(gen.next().value).toEqual(
      takeLatest(OPEN_SAVED_MATERIAL_REQUESTED, openSavedMaterialWorker)
    )
    // Saves go through a de-duping watcher, not takeEvery — see saveWatcher.
    expect(gen.next().value).toEqual(fork(saveWatcher))
    // The read-only material-detail loader (geometry Materials popup) is its own
    // takeEvery; it does NOT re-register the save action.
    expect(gen.next().value).toEqual(
      takeEvery(LOAD_MATERIAL_DETAIL_REQUESTED, loadMaterialDetailWorker)
    )
    expect(gen.next().value).toEqual(
      takeEvery(DELETE_PARAMETER_GROUP_REQUESTED, deleteParameterGroupWorker)
    )
    expect(gen.next().value).toEqual(takeEvery(RECORD_RECENT_COLOR, persistRecentColorsWorker))
    expect(gen.next().value).toEqual(takeEvery(UPLOAD_TEXTURE_REQUESTED, uploadTextureWorker))
    expect(gen.next().done).toBe(true)
  })
})

describe('uploadTextureWorker', () => {
  it('uploads the file then puts uploadTextureSucceeded with the returned path', () => {
    const file = new File(['x'], 'grass.png', { type: 'image/png' })
    const gen = uploadTextureWorker(
      actions.uploadTextureRequested({
        groupId: '12',
        cardId: 1,
        materialTypeId: 7,
        file,
        scenarioId: 's1'
      })
    )
    expect(gen.next().value).toEqual(call(service.uploadTextureFile, '12', 7, file, 's1'))
    expect(gen.next('uploads/materials/12/grass.png').value).toEqual(
      put(actions.uploadTextureSucceeded('12', 1, 'uploads/materials/12/grass.png'))
    )
    expect(gen.next().done).toBe(true)
  })

  it('puts uploadTextureFailed on error', () => {
    const file = new File(['x'], 'grass.png', { type: 'image/png' })
    const gen = uploadTextureWorker(
      actions.uploadTextureRequested({
        groupId: '12',
        cardId: 1,
        materialTypeId: 7,
        file,
        scenarioId: null
      })
    )
    gen.next()
    expect(gen.throw(new Error('boom')).value).toEqual(
      put(actions.uploadTextureFailed('12', 1, 'boom'))
    )
  })

  // Radiation's spectral file has its OWN backend endpoint (POST …/spectral),
  // not the generic per-property one — it returns { success, path }.
  it('uploads spectral_data via the dedicated spectral endpoint', () => {
    const file = new File(['<xml/>'], 'leaf.xml', { type: 'text/xml' })
    const gen = uploadTextureWorker(
      actions.uploadTextureRequested({
        groupId: '12',
        cardId: 1,
        materialTypeId: 1,
        file,
        scenarioId: 's1',
        property: 'spectral_data'
      })
    )
    expect(gen.next().value).toEqual(call(service.uploadSpectralFile, '12', 1, file, 's1'))
    expect(gen.next('uploads/materials/12/leaf.xml').value).toEqual(
      put(actions.uploadTextureSucceeded('12', 1, 'uploads/materials/12/leaf.xml', 'spectral_data'))
    )
    expect(gen.next().done).toBe(true)
  })

  // Any other file property still uses the generic per-property endpoint.
  it('uploads another file property via the generic endpoint', () => {
    const file = new File(['x'], 'other.dat')
    const gen = uploadTextureWorker(
      actions.uploadTextureRequested({
        groupId: '12',
        cardId: 1,
        materialTypeId: 1,
        file,
        scenarioId: null,
        property: 'other_file'
      })
    )
    expect(gen.next().value).toEqual(
      call(service.uploadMaterialFile, '12', 1, 'other_file', file, null)
    )
  })
})
