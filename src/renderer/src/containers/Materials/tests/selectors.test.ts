import { initialState } from '../reducer'
import makeSelectMaterials, {
  selectAllMaterials,
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
  createdAt: '',
  visible: true,
  local: false
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
    const result = selectAllMaterials(loaded([['11', 'B'], ['10', 'A']]))
    expect(result.map((m) => m.id)).toEqual(['11', '10'])
  })
})

describe('selectVisibleMaterials', () => {
  it('filters by a case-insensitive name search', () => {
    const state = loaded([['1', 'Grass'], ['2', 'Material.001'], ['3', 'Material.002']], {
      searchQuery: 'material'
    })
    expect(selectVisibleMaterials(state).map((m) => m.name)).toEqual(['Material.001', 'Material.002'])
  })

  it('returns all materials when the query is blank', () => {
    expect(selectVisibleMaterials(loaded([['1', 'Grass'], ['2', 'Soil']]))).toHaveLength(2)
  })
})

describe('selectNextMaterialName', () => {
  it('proposes the lowest free Material.NNN, ignoring non-matching names', () => {
    const state = loaded([['1', 'Grass'], ['2', 'Material.001'], ['3', 'Material.003']])
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
