import * as actions from '../actions'
import reducer, { initialState } from '../reducer'
import { atPercent } from '../progress'
import type { BootError } from '../types'

const started = (runId: number): ReturnType<typeof reducer> =>
  reducer(initialState, actions.bootStarted(runId, 'p-1'))

describe('projectBootReducer', () => {
  it('opens the loader and clears any previous error on a new run', () => {
    const state = reducer(
      { ...initialState, error: { status: 500, code: null, message: 'old', retryable: true } },
      actions.bootStarted(1, 'p-1')
    )

    expect(state.active).toBe(true)
    expect(state.runId).toBe(1)
    expect(state.projectId).toBe('p-1')
    expect(state.error).toBeNull()
  })

  it('advances progress for the run in flight', () => {
    const state = reducer(started(1), actions.bootProgress(1, atPercent('init', 50, 'x')))
    expect(state.progress.percent).toBeGreaterThan(0)
    expect(state.progress.phase).toBe('init')
  })

  it('ignores progress from a run that has already been replaced', () => {
    // The user opened a second project. The first run is still unwinding and
    // its late events must not drive the new project's bar.
    const state = reducer(started(2), actions.bootProgress(1, atPercent('init', 100, 'stale')))
    expect(state.progress).toEqual(initialState.progress)
  })

  it('never lets the bar move backwards', () => {
    let state = reducer(started(1), actions.bootProgress(1, atPercent('init', 100, 'x')))
    const high = state.progress.percent

    state = reducer(state, actions.bootProgress(1, atPercent('project', 0, 'x')))
    expect(state.progress.percent).toBe(high)
  })

  it('closes the loader on success and records the scenario', () => {
    const state = reducer(started(1), actions.bootSucceeded(1, 'p-1', 's-1'))
    expect(state.active).toBe(false)
    expect(state.scenarioId).toBe('s-1')
    expect(state.error).toBeNull()
  })

  it('ignores a success belonging to a superseded run', () => {
    const state = reducer(started(2), actions.bootSucceeded(1, 'p-1', 's-1'))
    expect(state.active).toBe(true)
    expect(state.scenarioId).toBeNull()
  })

  it('keeps the loader up on failure so Retry can live inside it', () => {
    const error: BootError = { status: 500, code: null, message: 'boom', retryable: true }
    const state = reducer(started(1), actions.bootFailed(1, error))

    expect(state.active).toBe(true)
    expect(state.error).toEqual(error)
    // projectId survives so Retry knows what to reopen.
    expect(state.projectId).toBe('p-1')
  })

  it('resets to idle when the run is cancelled', () => {
    const state = reducer(started(1), actions.bootCancelled(1))
    expect(state.active).toBe(false)
    expect(state.projectId).toBeNull()
    expect(state.scenarioId).toBeNull()
    expect(state.progress).toEqual(initialState.progress)
  })

  it('ignores a cancellation from a superseded run', () => {
    const state = reducer(started(2), actions.bootCancelled(1))
    expect(state.active).toBe(true)
    expect(state.projectId).toBe('p-1')
  })

  it('lets scope loss override a run in flight', () => {
    // The project was deleted in the other window. There is nothing left to
    // finish, so the loader gives way to the blocking dialog.
    const state = reducer(
      started(1),
      actions.scopeLost({ kind: 'project', projectId: 'p-1', message: 'gone' })
    )

    expect(state.active).toBe(false)
    expect(state.error).toBeNull()
    expect(state.scopeLoss).toEqual({ kind: 'project', projectId: 'p-1', message: 'gone' })
  })

  it('clears the scope-loss dialog once acknowledged', () => {
    const lost = reducer(
      started(1),
      actions.scopeLost({ kind: 'scenario', projectId: 'p-1', message: 'gone' })
    )
    expect(reducer(lost, actions.dismissScopeLost()).scopeLoss).toBeNull()
  })
})
