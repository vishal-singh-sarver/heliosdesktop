import makeSelectMaterials, {
  selectMaterialsDomain,
  selectStatus,
  selectLoading,
  selectError,
  selectStreaming,
  selectStreamLog
} from '../selectors'
import { initialState } from '../reducer'

const withMaterials = (partial: Partial<typeof initialState>) =>
  ({ materials: { ...initialState, ...partial } }) as any

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
    const selector = makeSelectMaterials()
    expect(selector(withMaterials({}))).toEqual(initialState)
  })
})

describe('individual selectors', () => {
  it('selectStatus', () => {
    const status = { version: '1.0', uptime: 5 }
    expect(selectStatus(withMaterials({ status }))).toEqual(status)
  })

  it('selectLoading', () => {
    expect(selectLoading(withMaterials({ loading: true }))).toBe(true)
  })

  it('selectError', () => {
    expect(selectError(withMaterials({ error: 'bad' }))).toBe('bad')
  })

  it('selectStreaming', () => {
    expect(selectStreaming(withMaterials({ streaming: true }))).toBe(true)
  })

  it('selectStreamLog', () => {
    const log = [{ type: 'ping', data: null, timestamp: 1 }]
    expect(selectStreamLog(withMaterials({ streamLog: log }))).toEqual(log)
  })
})
