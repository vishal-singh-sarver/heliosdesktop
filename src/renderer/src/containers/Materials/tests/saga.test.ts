import { call, put, takeEvery, takeLatest } from 'redux-saga/effects'
import * as actions from '../actions'
import {
  LIST_MATERIALS_REQUESTED,
  RENAME_MATERIAL_REQUESTED,
  SAVE_MATERIAL_REQUESTED
} from '../constants'
import materialsSaga, {
  listMaterialsWorker,
  renameMaterialWorker,
  saveMaterialWorker
} from '../saga'
import * as service from '../service'
import type { Material, SaveMaterialInput } from '../types'

const material: Material = {
  id: '11',
  name: 'GMaterial.002',
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: null,
  createdAt: '',
  visible: true,
  local: false
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

describe('saveMaterialWorker', () => {
  const input: SaveMaterialInput = {
    projectId: 'p1',
    scenarioId: 's1',
    name: 'Material.001',
    materials: [{ materialTypeId: 1, properties: {} }]
  }

  it('creates the group, closes the form, then reloads the list', () => {
    const gen = saveMaterialWorker(actions.saveMaterialRequested(input))
    expect(gen.next().value).toEqual(call(service.createGroup, input))
    expect(gen.next().value).toEqual(put(actions.saveMaterialSucceeded()))
    expect(gen.next().value).toEqual(put(actions.closeMaterialDraft()))
    expect(gen.next().value).toEqual(put(actions.listMaterialsRequested('p1')))
    expect(gen.next().done).toBe(true)
  })

  it('puts saveMaterialFailed on error', () => {
    const gen = saveMaterialWorker(actions.saveMaterialRequested(input))
    gen.next()
    expect(gen.throw(new Error('Material group name already exists')).value).toEqual(
      put(actions.saveMaterialFailed('Material group name already exists'))
    )
  })
})

describe('renameMaterialWorker', () => {
  it('PATCHes a persisted rename then puts renameMaterialSucceeded', () => {
    const gen = renameMaterialWorker(actions.renameMaterialRequested('p1', '11', 'Dry Grass'))
    expect(gen.next().value).toEqual(call(service.renameMaterial, 'p1', '11', 'Dry Grass'))
    expect(gen.next().value).toEqual(put(actions.renameMaterialSucceeded('11', 'Dry Grass')))
    expect(gen.next().done).toBe(true)
  })

  it('renames a local row in-place without a PATCH', () => {
    const gen = renameMaterialWorker(
      actions.renameMaterialRequested('p1', 'local-Material.001', 'My Mat')
    )
    expect(gen.next().value).toEqual(
      put(actions.renameMaterialSucceeded('local-Material.001', 'My Mat'))
    )
    expect(gen.next().done).toBe(true)
  })

  it('puts renameMaterialFailed on error', () => {
    const gen = renameMaterialWorker(actions.renameMaterialRequested('p1', '11', 'Dry Grass'))
    gen.next()
    expect(gen.throw(new Error('Material name already exists')).value).toEqual(
      put(actions.renameMaterialFailed('11', 'Material name already exists'))
    )
  })
})

describe('materialsSaga', () => {
  it('wires the watchers', () => {
    const gen = materialsSaga()
    expect(gen.next().value).toEqual(takeLatest(LIST_MATERIALS_REQUESTED, listMaterialsWorker))
    expect(gen.next().value).toEqual(takeEvery(RENAME_MATERIAL_REQUESTED, renameMaterialWorker))
    expect(gen.next().value).toEqual(takeLatest(SAVE_MATERIAL_REQUESTED, saveMaterialWorker))
    expect(gen.next().done).toBe(true)
  })
})
