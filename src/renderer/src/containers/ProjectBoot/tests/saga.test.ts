import { TASK } from '@redux-saga/symbols'
import { call, fork, join, put, race, select, take } from 'redux-saga/effects'
import * as actions from '../actions'
import { CANCEL_BOOT } from '../constants'
import { atPercent } from '../progress'
import { openInitChannel } from '../service'
import { navigate } from 'store/navigationReducer'
import {
  onNavigateHome,
  openProjectWorker,
  releaseLiveScenario,
  runInit,
  streamInit
} from '../saga'
import {
  selectBootActive,
  selectBootError,
  selectBootRunId,
  selectLiveScenario
} from '../selectors'
import { discardScenario } from '../service'

describe('runInit', () => {
  it('forks the stream reader instead of delegating to it', () => {
    // The regression this pins: utils/sse emits END when the connection
    // closes, and redux-saga TERMINATES a saga blocked on take(channel) rather
    // than resuming it. Delegated with yield*, that killed the whole boot —
    // the loader sat on screen forever and Cancel did nothing, because the
    // race listening for CANCEL_BOOT had ended with the run. Forked, END stops
    // only the reader.
    const gen = runInit(1, 'p-1', 's-1')

    expect(gen.next().value).toEqual(
      put(actions.bootProgress(1, atPercent('init', 0)))
    )
    expect(gen.next().value).toEqual(fork(streamInit, 1, 'p-1', 's-1'))
  })

  it('joins the forked reader so a stream that merely ended lets the boot continue', () => {
    // Minimal stand-in for a Task — `join` rejects anything without the marker.
    const task = { [TASK]: true } as never

    const gen = runInit(1, 'p-1', 's-1')
    gen.next() // bootProgress
    gen.next() // fork

    expect(gen.next(task).value).toEqual(join(task))
    expect(gen.next().done).toBe(true)
  })
})

describe('streamInit', () => {
  it('opens the SSE channel for the scenario', () => {
    const gen = streamInit(1, 'p-1', 's-1')
    expect(gen.next().value).toEqual(call(openInitChannel, 'p-1', 's-1'))
  })
})

describe('openProjectWorker', () => {
  const action = actions.openProject('p-1')

  const startAndRace = (): {
    gen: Generator
    runId: number
  } => {
    const gen = openProjectWorker(action) as Generator
    const started = gen.next().value as {
      payload: { action: { payload: { runId: number } } }
    }
    // The race arming CANCEL_BOOT alongside the run.
    gen.next()
    return { gen, runId: started.payload.action.payload.runId }
  }

  it('arms a CANCEL_BOOT listener for the whole run', () => {
    const gen = openProjectWorker(action) as Generator
    gen.next() // bootStarted
    const raced = gen.next().value as { payload?: { race?: Record<string, unknown> } }
    expect(raced).toEqual(
      race({
        done: expect.anything() as never,
        cancelled: take(CANCEL_BOOT)
      })
    )
  })

  it('fails loudly when a run ends without settling, so the loader is never stranded', () => {
    // Belt and braces for exactly the bug above: if the run finishes with no
    // success, failure or cancel, the loader would stay up with no way out.
    // The guard turns that into an error dialog, which still offers Retry and
    // Go to Home.
    const { gen, runId } = startAndRace()

    // Race resolved with neither branch — the run ended without settling.
    expect(gen.next({}).value).toEqual(expect.objectContaining({ type: 'CANCELLED' }))
    expect(gen.next(false).value).toEqual(select(selectBootActive))
    expect(gen.next(true).value).toEqual(select(selectBootError))
    expect(gen.next(null).value).toEqual(select(selectBootRunId))

    const failure = gen.next(runId).value as {
      payload: { action: { payload: { error: { retryable: boolean } } } }
    }
    expect(failure.payload.action.payload.error.retryable).toBe(true)
    expect(gen.next().done).toBe(true)
  })

  it('stays quiet when the run settled on its own', () => {
    const { gen, runId } = startAndRace()

    gen.next({}) // cancelled()
    gen.next(false) // select active
    // Loader already closed by bootSucceeded → nothing to rescue.
    gen.next(false) // active = false
    gen.next(null) // error
    expect(gen.next(runId).done).toBe(true)
  })

  it('stays quiet when a newer run already owns the loader', () => {
    const { gen } = startAndRace()

    gen.next({}) // cancelled()
    gen.next(false)
    gen.next(true) // still active…
    gen.next(null) // …and no error…
    // …but the loader belongs to a later run now.
    expect(gen.next(999).done).toBe(true)
  })
})


describe('releaseLiveScenario', () => {
  const live = { projectId: 'p-1', scenarioId: 's-1' }

  it('discards the scenario whose boot completed', () => {
    const gen = releaseLiveScenario() as Generator

    expect(gen.next().value).toEqual(select(selectLiveScenario))
    // Cleared BEFORE the call, so a navigate racing a project switch cannot
    // fire two discards for the same scenario.
    expect(gen.next(live).value).toEqual(put(actions.scenarioDiscarded()))
    expect(gen.next().value).toEqual(call(discardScenario, 'p-1', 's-1'))
    expect(gen.next().done).toBe(true)
  })

  it('does nothing when no scenario was ever loaded', () => {
    // A cancelled or failed boot never records one — and discarding then would
    // autosave a half-hydrated context over the scenario's real context.xml.
    const gen = releaseLiveScenario() as Generator
    gen.next()
    expect(gen.next(null).done).toBe(true)
  })

  it('keeps the context when reopening the same project', () => {
    // Discarding it only to hydrate it again from disk a moment later is pure
    // cost; /init finds it warm instead.
    const gen = releaseLiveScenario({ exceptProjectId: 'p-1' }) as Generator
    gen.next()
    expect(gen.next(live).done).toBe(true)
  })

  it('still discards when switching to a different project', () => {
    const gen = releaseLiveScenario({ exceptProjectId: 'p-2' }) as Generator
    gen.next()
    expect(gen.next(live).value).toEqual(put(actions.scenarioDiscarded()))
  })

  it('survives a failed discard without blocking navigation', () => {
    // Freeing backend memory is best effort. The context goes when the backend
    // exits anyway, and the user has already left the screen.
    const gen = releaseLiveScenario() as Generator
    gen.next()
    gen.next(live)
    gen.next()
    expect(gen.throw(new Error('backend down')).done).toBe(true)
  })
})

describe('onNavigateHome', () => {
  it('releases the scenario when the user goes back to the project list', () => {
    const gen = onNavigateHome(navigate('home')) as Generator
    expect(gen.next().value).toEqual(select(selectLiveScenario))
  })

  it('ignores navigation to anywhere else', () => {
    const gen = onNavigateHome(navigate('project')) as Generator
    expect(gen.next().done).toBe(true)
  })
})
