import * as actions from '../actions'
import {
  CREATE_MATERIAL_REQUESTED,
  LIST_MATERIALS_FAILED,
  LIST_MATERIALS_REQUESTED,
  LIST_MATERIALS_SUCCEEDED,
  REMOVE_MATERIAL,
  SELECT_MATERIAL,
  SET_PARAMETER_GROUP_VALUE,
  SET_SEARCH_QUERY
} from '../constants'
import type { Material } from '../types'

const material: Material = {
  id: '11',
  name: 'GMaterial.002',
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: { colorR: 90, colorG: 200, colorB: 90, textureFile: null },
  createdAt: '2026-06-23T06:41:16Z'
}

describe('Materials actions', () => {
  it('listMaterialsRequested takes no scope (the library is global)', () => {
    expect(actions.listMaterialsRequested()).toEqual({ type: LIST_MATERIALS_REQUESTED })
  })

  it('listMaterialsSucceeded carries the list', () => {
    expect(actions.listMaterialsSucceeded([material])).toEqual({
      type: LIST_MATERIALS_SUCCEEDED,
      payload: [material]
    })
  })

  it('listMaterialsFailed carries the error', () => {
    expect(actions.listMaterialsFailed('boom')).toEqual({
      type: LIST_MATERIALS_FAILED,
      payload: 'boom'
    })
  })

  it('createMaterialRequested carries only the name (materials are global)', () => {
    expect(actions.createMaterialRequested('Material.001')).toEqual({
      type: CREATE_MATERIAL_REQUESTED,
      name: 'Material.001'
    })
  })

  it('setParameterGroupValue targets one card', () => {
    expect(actions.setParameterGroupValue(1, 'reflectivity', '0.4')).toEqual({
      type: SET_PARAMETER_GROUP_VALUE,
      groupId: 1,
      property: 'reflectivity',
      value: '0.4'
    })
  })

  it('removeMaterial carries the id', () => {
    expect(actions.removeMaterial('11')).toEqual({ type: REMOVE_MATERIAL, id: '11' })
  })

  it('selectMaterial carries the id', () => {
    expect(actions.selectMaterial('11')).toEqual({ type: SELECT_MATERIAL, id: '11' })
  })

  it('setSearchQuery carries the query', () => {
    expect(actions.setSearchQuery('foo')).toEqual({ type: SET_SEARCH_QUERY, payload: 'foo' })
  })
})
