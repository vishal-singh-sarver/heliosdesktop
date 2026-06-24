import * as actions from '../actions'
import materialsReducer, { initialState } from '../reducer'
import type { Material } from '../types'

const make = (id: string, name: string): Material => ({
  id,
  name,
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: { colorR: 90, colorG: 200, colorB: 90, textureFile: null },
  createdAt: '2026-06-23T06:41:16Z',
  visible: true,
  local: false
})

describe('materialsReducer', () => {
  it('returns the initial state', () => {
    expect(materialsReducer(undefined, {} as any)).toEqual(initialState)
  })

  it('LIST_MATERIALS_REQUESTED sets loading and clears error', () => {
    const state = { ...initialState, loadError: 'prev' }
    const result = materialsReducer(state, actions.listMaterialsRequested('p1'))
    expect(result.loadStatus).toBe('loading')
    expect(result.loadError).toBeNull()
  })

  it('LIST_MATERIALS_SUCCEEDED stores materials in order', () => {
    const result = materialsReducer(
      { ...initialState, loadStatus: 'loading' },
      actions.listMaterialsSucceeded([make('11', 'GMaterial.002'), make('10', 'GMaterial.001')])
    )
    expect(result.loadStatus).toBe('loaded')
    expect(result.order).toEqual(['11', '10'])
    expect(result.byId['11'].name).toBe('GMaterial.002')
  })

  it('LIST_MATERIALS_SUCCEEDED drops unsaved local rows', () => {
    const withLocal = materialsReducer(initialState, actions.addLocalMaterial('Material.001'))
    const result = materialsReducer(withLocal, actions.listMaterialsSucceeded([make('9', 'Grass')]))
    expect(result.order).toEqual(['9'])
    expect(result.byId['local-Material.001']).toBeUndefined()
  })

  it('LIST_MATERIALS_FAILED records the error', () => {
    const result = materialsReducer(initialState, actions.listMaterialsFailed('bad'))
    expect(result.loadStatus).toBe('error')
    expect(result.loadError).toBe('bad')
  })

  it('ADD_LOCAL_MATERIAL prepends a local row and selects it', () => {
    const start = materialsReducer(initialState, actions.listMaterialsSucceeded([make('9', 'Grass')]))
    const result = materialsReducer(start, actions.addLocalMaterial('Material.001'))
    expect(result.order).toEqual(['local-Material.001', '9'])
    expect(result.byId['local-Material.001'].local).toBe(true)
    expect(result.selectedId).toBe('local-Material.001')
  })

  it('REMOVE_MATERIAL drops the material and clears selection', () => {
    const start = materialsReducer(
      initialState,
      actions.listMaterialsSucceeded([make('11', 'A'), make('10', 'B')])
    )
    const selected = materialsReducer(start, actions.selectMaterial('11'))
    const result = materialsReducer(selected, actions.removeMaterial('11'))
    expect(result.order).toEqual(['10'])
    expect(result.byId['11']).toBeUndefined()
    expect(result.selectedId).toBeNull()
  })

  it('RENAME_MATERIAL_SUCCEEDED updates the name and clears its error', () => {
    const start = materialsReducer(
      { ...initialState, nameErrors: { '11': 'Material name already exists' } },
      actions.listMaterialsSucceeded([make('11', 'A')])
    )
    const result = materialsReducer(start, actions.renameMaterialSucceeded('11', 'B'))
    expect(result.byId['11'].name).toBe('B')
    expect(result.nameErrors['11']).toBeUndefined()
  })

  it('RENAME_MATERIAL_FAILED records a per-id name error', () => {
    const result = materialsReducer(
      initialState,
      actions.renameMaterialFailed('11', 'Material name already exists')
    )
    expect(result.nameErrors['11']).toBe('Material name already exists')
  })

  it('SET_NAME_ERROR clears the error when passed null', () => {
    const start = materialsReducer(initialState, actions.renameMaterialFailed('11', 'boom'))
    const result = materialsReducer(start, actions.setNameError('11', null))
    expect(result.nameErrors['11']).toBeUndefined()
  })

  it('TOGGLE_MATERIAL_VISIBILITY flips the visible flag', () => {
    const start = materialsReducer(initialState, actions.listMaterialsSucceeded([make('11', 'A')]))
    const result = materialsReducer(start, actions.toggleMaterialVisibility('11'))
    expect(result.byId['11'].visible).toBe(false)
  })

  it('SET_SEARCH_QUERY stores the query', () => {
    expect(materialsReducer(initialState, actions.setSearchQuery('foo')).searchQuery).toBe('foo')
  })

  it('does not mutate the original state', () => {
    materialsReducer(initialState, actions.addLocalMaterial('Material.001'))
    expect(initialState.order).toHaveLength(0)
  })
})
