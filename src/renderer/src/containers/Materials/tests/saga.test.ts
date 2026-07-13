import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'
import * as actions from '../actions'
import {
  CREATE_MATERIAL_REQUESTED,
  DELETE_MATERIAL_REQUESTED,
  DELETE_PARAMETER_GROUP_REQUESTED,
  LIST_MATERIALS_REQUESTED,
  OPEN_SAVED_MATERIAL_REQUESTED,
  RENAME_MATERIAL_REQUESTED,
  SAVE_PARAMETER_GROUP_REQUESTED
} from '../constants'
import materialsSaga, {
  createMaterialWorker,
  deleteMaterialWorker,
  deleteParameterGroupWorker,
  listMaterialsWorker,
  openSavedMaterialWorker,
  renameMaterialWorker,
  saveParameterGroupWorker
} from '../saga'
import { selectMaterialDetailsById } from '../selectors'
import * as service from '../service'
import type { Material, MaterialGroupDetail } from '../types'

const material: Material = {
  id: '11',
  name: 'GMaterial.002',
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: null,
  createdAt: '',
  visible: true
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
    expect(gen.next().value).toEqual(put(actions.saveParameterGroupSucceeded(1)))
    expect(gen.next().done).toBe(true)
  })

  it('UPDATEs the material type once the card is saved', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({ ...base, saved: true })
    )
    expect(gen.next().value).toEqual(
      call(service.updateGroupMaterial, '12', 2, { radiation_flux: 55 }, 's1')
    )
    expect(gen.next().value).toEqual(put(actions.saveParameterGroupSucceeded(1)))
    expect(gen.next().done).toBe(true)
  })

  it('puts saveParameterGroupFailed on error', () => {
    const gen = saveParameterGroupWorker(
      actions.saveParameterGroupRequested({ ...base, saved: false })
    )
    gen.next()
    expect(gen.throw(new Error('DATATYPE_MISMATCH')).value).toEqual(
      put(actions.saveParameterGroupFailed(1, 'DATATYPE_MISMATCH'))
    )
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
    expect(gen.next().value).toEqual(put(actions.removeParameterGroup(1)))
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
    expect(gen.next().value).toEqual(put(actions.removeParameterGroup(1)))
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
      put(actions.deleteParameterGroupFailed(1, 'boom'))
    )
  })
})

describe('materialsSaga', () => {
  it('wires the watchers', () => {
    const gen = materialsSaga()
    expect(gen.next().value).toEqual(takeLatest(LIST_MATERIALS_REQUESTED, listMaterialsWorker))
    expect(gen.next().value).toEqual(takeLatest(CREATE_MATERIAL_REQUESTED, createMaterialWorker))
    expect(gen.next().value).toEqual(takeEvery(RENAME_MATERIAL_REQUESTED, renameMaterialWorker))
    expect(gen.next().value).toEqual(takeEvery(DELETE_MATERIAL_REQUESTED, deleteMaterialWorker))
    expect(gen.next().value).toEqual(
      takeLatest(OPEN_SAVED_MATERIAL_REQUESTED, openSavedMaterialWorker)
    )
    expect(gen.next().value).toEqual(
      takeEvery(SAVE_PARAMETER_GROUP_REQUESTED, saveParameterGroupWorker)
    )
    expect(gen.next().value).toEqual(
      takeEvery(DELETE_PARAMETER_GROUP_REQUESTED, deleteParameterGroupWorker)
    )
    expect(gen.next().done).toBe(true)
  })
})
