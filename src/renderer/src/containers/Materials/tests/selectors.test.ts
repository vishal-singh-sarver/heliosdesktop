import { initialState } from '../reducer'
import makeSelectMaterials, {
  selectAllMaterials,
  selectMaterialNamesLower,
  selectMaterialsDomain,
  selectNextMaterialName,
  selectSelectedId,
  selectVisibleMaterials
} from '../selectors'
import type { Material } from '../types'

const make = (id: string, name: string): Material => ({
  id,
  name,
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: null,
  createdAt: ''
})

const withMaterials = (partial: Partial<typeof initialState>) =>
  ({ materials: { ...initialState, ...partial } }) as any

const loaded = (rows: Array<[string, string]>, extra: Partial<typeof initialState> = {}) =>
  withMaterials({
    byId: Object.fromEntries(rows.map(([id, name]) => [id, make(id, name)])),
    order: rows.map(([id]) => id),
    ...extra
  })

describe('selectMaterialsDomain', () => {
  it('selects the materials slice', () => {
    expect(selectMaterialsDomain(withMaterials({}))).toEqual(initialState)
  })

  it('returns initialState when key is absent', () => {
    expect(selectMaterialsDomain({} as any)).toEqual(initialState)
  })
})

describe('makeSelectMaterials', () => {
  it('selects the whole materials domain', () => {
    expect(makeSelectMaterials()(withMaterials({}))).toEqual(initialState)
  })
})

describe('selectAllMaterials', () => {
  it('returns materials in display order', () => {
    const result = selectAllMaterials(
      loaded([
        ['11', 'B'],
        ['10', 'A']
      ])
    )
    expect(result.map((m) => m.id)).toEqual(['11', '10'])
  })
})

describe('selectVisibleMaterials', () => {
  it('filters by a case-insensitive name search', () => {
    const state = loaded(
      [
        ['1', 'Grass'],
        ['2', 'Material.001'],
        ['3', 'Material.002']
      ],
      {
        searchQuery: 'material'
      }
    )
    expect(selectVisibleMaterials(state).map((m) => m.name)).toEqual([
      'Material.001',
      'Material.002'
    ])
  })

  it('returns all materials when the query is blank', () => {
    expect(
      selectVisibleMaterials(
        loaded([
          ['1', 'Grass'],
          ['2', 'Soil']
        ])
      )
    ).toHaveLength(2)
  })
})

describe('selectNextMaterialName', () => {
  it('proposes the lowest free Material.NNN, ignoring non-matching names', () => {
    const state = loaded([
      ['1', 'Grass'],
      ['2', 'Material.001'],
      ['3', 'Material.003']
    ])
    expect(selectNextMaterialName(state)).toBe('Material.002')
  })

  it('starts at Material.001 when empty', () => {
    expect(selectNextMaterialName(withMaterials({}))).toBe('Material.001')
  })
})

describe('selectSelectedId', () => {
  it('returns the selected id', () => {
    expect(selectSelectedId(withMaterials({ selectedId: '11' }))).toBe('11')
  })
})

// immer hands back a NEW slice object for every handled action, so a selector
// keyed on the whole domain recomputed on each keystroke — a fresh Material[]
// identity that re-rendered every row and rebuilt the name Set downstream.
describe('list-selector memoisation', () => {
  // What immer actually produces for an action that doesn't touch the list: a NEW
  // slice object, but the SAME byId/order references carried over untouched. The
  // selector must see through the new wrapper to the unchanged list.
  const byId = { '11': make('11', 'B'), '10': make('10', 'A') }
  const order = ['11', '10']
  const sliceWith = (extra: Partial<typeof initialState> = {}) =>
    ({ materials: { ...initialState, byId, order, ...extra } }) as any

  it('keeps its identity when an unrelated field changes', () => {
    const before = selectAllMaterials(sliceWith())
    // A search keystroke / property-field edit / draft open: new slice, same list.
    const after = selectAllMaterials(sliceWith({ searchQuery: 'gr', editDraftNonce: 3 }))
    expect(after).toBe(before)
    expect(selectMaterialNamesLower(sliceWith({ editDraftNonce: 3 }))).toBe(
      selectMaterialNamesLower(sliceWith())
    )
  })

  it('still recomputes when the list itself changes', () => {
    const before = selectAllMaterials(sliceWith())
    const after = selectAllMaterials(
      loaded([
        ['11', 'B'],
        ['10', 'A'],
        ['12', 'C']
      ])
    )
    expect(after).not.toBe(before)
    expect(after.map((m) => m.id)).toEqual(['11', '10', '12'])
  })
})
