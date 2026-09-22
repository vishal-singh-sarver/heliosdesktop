import {
  clearActiveScope,
  onScopeLost,
  reportScopeFailure,
  resetScopeLossLatch,
  setActiveScope,
  type ScopeLossReport
} from '../scopeError'

const PROJECT = 'proj-1'
const SCENARIO = 'scen-1'

describe('reportScopeFailure', () => {
  let seen: ScopeLossReport[]
  let unsubscribe: () => void

  beforeEach(() => {
    seen = []
    unsubscribe = onScopeLost((loss) => seen.push(loss))
    clearActiveScope()
    setActiveScope(PROJECT, SCENARIO)
  })

  afterEach(() => {
    unsubscribe()
    clearActiveScope()
  })

  it('ignores anything that is not a 404', () => {
    expect(reportScopeFailure({ status: 500, url: `/api/project/${PROJECT}` })).toBe(false)
    expect(seen).toHaveLength(0)
  })

  it('ignores a 404 when nothing is open', () => {
    clearActiveScope()
    expect(reportScopeFailure({ status: 404, code: 'PROJECT_NOT_FOUND' })).toBe(false)
    expect(seen).toHaveLength(0)
  })

  it('raises on PROJECT_NOT_FOUND', () => {
    expect(reportScopeFailure({ status: 404, code: 'PROJECT_NOT_FOUND' })).toBe(true)
    expect(seen).toEqual([{ kind: 'project', projectId: PROJECT, message: '' }])
  })

  it('raises on SCENARIO_NOT_FOUND', () => {
    expect(reportScopeFailure({ status: 404, code: 'SCENARIO_NOT_FOUND', message: 'gone' })).toBe(
      true
    )
    expect(seen[0].kind).toBe('scenario')
  })

  it('does NOT mistake a deleted object for a deleted project', () => {
    // GEOMETRY_NOT_FOUND fires whenever one object is fetched after being
    // removed. Throwing the user out of the project for that would be far
    // worse than the 404 itself. A code that is present and not a scope code
    // is the whole answer — the url is not consulted.
    expect(
      reportScopeFailure({
        status: 404,
        code: 'GEOMETRY_NOT_FOUND',
        url: `/api/geometry/project/${PROJECT}/scenario/${SCENARIO}/objects/7/geometry/binary`
      })
    ).toBe(false)
    expect(seen).toHaveLength(0)
  })

  it('falls back to the ids in the request when no code is sent', () => {
    // scenario_service raises plain-string 404s with no code, and it only ever
    // 404s for a missing project or scenario.
    expect(
      reportScopeFailure({ status: 404, url: `/api/project/${PROJECT}/scenarios/${SCENARIO}/init` })
    ).toBe(true)
    expect(seen[0].kind).toBe('scenario')
  })

  it('reads project vs scenario from the ids, never from the wording', () => {
    expect(
      reportScopeFailure({ status: 404, message: `Project ${PROJECT} not found` })
    ).toBe(true)
    expect(seen[0].kind).toBe('project')
  })

  it("ignores a 404 about some other project", () => {
    expect(reportScopeFailure({ status: 404, url: '/api/project/someone-else' })).toBe(false)
    expect(seen).toHaveLength(0)
  })

  it('raises once even though every in-flight call fails together', () => {
    // A dead project fails ten calls at once; the user should see one dialog.
    for (let i = 0; i < 10; i++) {
      expect(reportScopeFailure({ status: 404, code: 'PROJECT_NOT_FOUND' })).toBe(true)
    }
    expect(seen).toHaveLength(1)
  })

  it('re-arms after the dialog is dismissed', () => {
    reportScopeFailure({ status: 404, code: 'PROJECT_NOT_FOUND' })
    resetScopeLossLatch()
    reportScopeFailure({ status: 404, code: 'PROJECT_NOT_FOUND' })
    expect(seen).toHaveLength(2)
  })

  it('re-arms when a different project is opened', () => {
    reportScopeFailure({ status: 404, code: 'PROJECT_NOT_FOUND' })
    setActiveScope('proj-2', 'scen-2')
    reportScopeFailure({ status: 404, code: 'PROJECT_NOT_FOUND' })
    expect(seen).toHaveLength(2)
    expect(seen[1].projectId).toBe('proj-2')
  })
})
