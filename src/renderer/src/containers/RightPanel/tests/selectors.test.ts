import makeSelectRightPanel, {
  selectRightPanelDomain,
  selectStatus,
  selectLoading,
  selectError,
  selectStreaming,
  selectStreamLog
} from '../selectors'
import { initialState } from '../reducer'
import type { RootState } from 'store/reducers'

const withRightPanel = (partial: Partial<typeof initialState>) =>
  ({ rightPanel: { ...initialState, ...partial } }) as any

// The slice really is absent here — that is the case under test — so the cast
// stands in for a state shape the selector is expected to cope with.
const withoutSlice = {} as RootState

describe('selectRightPanelDomain', () => {
  it('selects the rightPanel slice', () => {
    expect(selectRightPanelDomain(withRightPanel({}))).toEqual(initialState)
  })

  it('returns initialState when key is absent', () => {
    expect(selectRightPanelDomain(withoutSlice)).toEqual(initialState)
  })
})

describe('makeSelectRightPanel', () => {
  it('selects the whole rightPanel domain', () => {
    const selector = makeSelectRightPanel()
    expect(selector(withRightPanel({}))).toEqual(initialState)
  })
})

describe('individual selectors', () => {
  it('selectStatus', () => {
    const status = { version: '1.0', uptime: 5 }
    expect(selectStatus(withRightPanel({ status }))).toEqual(status)
  })

  it('selectLoading', () => {
    expect(selectLoading(withRightPanel({ loading: true }))).toBe(true)
  })

  it('selectError', () => {
    expect(selectError(withRightPanel({ error: 'bad' }))).toBe('bad')
  })

  it('selectStreaming', () => {
    expect(selectStreaming(withRightPanel({ streaming: true }))).toBe(true)
  })

  it('selectStreamLog', () => {
    const log = [{ type: 'ping', data: null, timestamp: 1 }]
    expect(selectStreamLog(withRightPanel({ streamLog: log }))).toEqual(log)
  })
})
