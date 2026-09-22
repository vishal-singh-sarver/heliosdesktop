import makeSelectCenterWorkspace, {
  selectCenterWorkspaceDomain,
  selectStatus,
  selectLoading,
  selectError,
  selectStreaming,
  selectStreamLog
} from '../selectors'
import { initialState } from '../reducer'
import type { RootState } from 'store/reducers'

const withCenterWorkspace = (partial: Partial<typeof initialState>) =>
  ({ centerWorkspace: { ...initialState, ...partial } }) as any

// The slice really is absent here — that is the case under test — so the cast
// stands in for a state shape the selector is expected to cope with.
const withoutSlice = {} as RootState

describe('selectCenterWorkspaceDomain', () => {
  it('selects the centerWorkspace slice', () => {
    expect(selectCenterWorkspaceDomain(withCenterWorkspace({}))).toEqual(initialState)
  })

  it('returns initialState when key is absent', () => {
    expect(selectCenterWorkspaceDomain(withoutSlice)).toEqual(initialState)
  })
})

describe('makeSelectCenterWorkspace', () => {
  it('selects the whole centerWorkspace domain', () => {
    const selector = makeSelectCenterWorkspace()
    expect(selector(withCenterWorkspace({}))).toEqual(initialState)
  })
})

describe('individual selectors', () => {
  it('selectStatus', () => {
    const status = { version: '1.0', uptime: 5 }
    expect(selectStatus(withCenterWorkspace({ status }))).toEqual(status)
  })

  it('selectLoading', () => {
    expect(selectLoading(withCenterWorkspace({ loading: true }))).toBe(true)
  })

  it('selectError', () => {
    expect(selectError(withCenterWorkspace({ error: 'bad' }))).toBe('bad')
  })

  it('selectStreaming', () => {
    expect(selectStreaming(withCenterWorkspace({ streaming: true }))).toBe(true)
  })

  it('selectStreamLog', () => {
    const log = [{ type: 'ping', data: null, timestamp: 1 }]
    expect(selectStreamLog(withCenterWorkspace({ streamLog: log }))).toEqual(log)
  })
})
