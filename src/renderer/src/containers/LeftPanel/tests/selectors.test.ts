import makeSelectLeftPanel, {
  selectLeftPanelDomain,
  selectStatus,
  selectLoading,
  selectError,
  selectStreaming,
  selectStreamLog
} from '../selectors'
import { initialState } from '../reducer'
import type { RootState } from 'store/reducers'

const withLeftPanel = (partial: Partial<typeof initialState>) =>
  ({ leftPanel: { ...initialState, ...partial } }) as any

// The slice really is absent here — that is the case under test — so the cast
// stands in for a state shape the selector is expected to cope with.
const withoutSlice = {} as RootState

describe('selectLeftPanelDomain', () => {
  it('selects the leftPanel slice', () => {
    expect(selectLeftPanelDomain(withLeftPanel({}))).toEqual(initialState)
  })

  it('returns initialState when key is absent', () => {
    expect(selectLeftPanelDomain(withoutSlice)).toEqual(initialState)
  })
})

describe('makeSelectLeftPanel', () => {
  it('selects the whole leftPanel domain', () => {
    const selector = makeSelectLeftPanel()
    expect(selector(withLeftPanel({}))).toEqual(initialState)
  })
})

describe('individual selectors', () => {
  it('selectStatus', () => {
    const status = { version: '1.0', uptime: 5 }
    expect(selectStatus(withLeftPanel({ status }))).toEqual(status)
  })

  it('selectLoading', () => {
    expect(selectLoading(withLeftPanel({ loading: true }))).toBe(true)
  })

  it('selectError', () => {
    expect(selectError(withLeftPanel({ error: 'bad' }))).toBe('bad')
  })

  it('selectStreaming', () => {
    expect(selectStreaming(withLeftPanel({ streaming: true }))).toBe(true)
  })

  it('selectStreamLog', () => {
    const log = [{ type: 'ping', data: null, timestamp: 1 }]
    expect(selectStreamLog(withLeftPanel({ streamLog: log }))).toEqual(log)
  })
})
