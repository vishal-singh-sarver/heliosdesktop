import * as actions from '../actions'
import {
  ADD_LOCAL_MATERIAL,
  LIST_MATERIALS_FAILED,
  LIST_MATERIALS_REQUESTED,
  LIST_MATERIALS_SUCCEEDED,
  REMOVE_MATERIAL,
  SELECT_MATERIAL,
  SET_SEARCH_QUERY,
  TOGGLE_MATERIAL_VISIBILITY
} from '../constants'
import type { Material } from '../types'

const material: Material = {
  id: '11',
  name: 'GMaterial.002',
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: { colorR: 90, colorG: 200, colorB: 90, textureFile: null },
  createdAt: '2026-06-23T06:41:16Z',
  visible: true,
  local: false
}

describe('Materials actions', () => {
  it('listMaterialsRequested carries the projectId', () => {
    expect(actions.listMaterialsRequested('p1')).toEqual({
      type: LIST_MATERIALS_REQUESTED,
      projectId: 'p1'
    })
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

  it('addLocalMaterial carries the name', () => {
    expect(actions.addLocalMaterial('Material.001')).toEqual({
      type: ADD_LOCAL_MATERIAL,
      name: 'Material.001'
    })
  })

  it('removeMaterial carries the id', () => {
    expect(actions.removeMaterial('11')).toEqual({ type: REMOVE_MATERIAL, id: '11' })
  })

  it('toggleMaterialVisibility carries the id', () => {
    expect(actions.toggleMaterialVisibility('11')).toEqual({
      type: TOGGLE_MATERIAL_VISIBILITY,
      id: '11'
    })
  })

  it('selectMaterial carries the id', () => {
    expect(actions.selectMaterial('11')).toEqual({ type: SELECT_MATERIAL, id: '11' })
  })

  it('setSearchQuery carries the query', () => {
    expect(actions.setSearchQuery('foo')).toEqual({ type: SET_SEARCH_QUERY, payload: 'foo' })
  })
})
