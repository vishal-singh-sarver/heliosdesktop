import { TASK } from '@redux-saga/symbols'
import { call, cancel, fork, join, put, race, select, take } from 'redux-saga/effects'
import * as actions from '../actions'
import { CANCEL_BOOT, OPEN_PROJECT } from '../constants'
import { atPercent } from '../progress'
import { openInitChannel } from '../service'
import { navigate } from 'store/navigationReducer'
import { resetScene } from 'containers/3DWindow/store/actions'
import { clearSceneCache } from 'containers/3DWindow/store/sceneCache'
import { clearTextureCache } from 'containers/3DWindow/ui/textureCache'
import {
  onNavigateHome,
  openProjectWorker,
  releaseLiveScenario,
  runInit,
  streamInit,
  watchOpenProject
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


describe('watchOpenProject', () => {
  // Minimal stand-ins for a Task — `cancel` rejects anything without the marker.
  const running = { [TASK]: true, isRunning: () => true } as never
  const finished = { [TASK]: true, isRunning: () => false } as never

  it('drops a second open for the project already booting', () => {
    // The regression this pins: on a restart with both ids persisted, App's
    // restore effect opens the project on its own. Opening the SAME project
    // again while that run is in flight used to cancel it and start another —
    // and since cancelling here does not stop the /init already running on the
    // backend, two hydrations raced over one scenario context.
    const first = actions.openProject('p-1')
    const gen = watchOpenProject() as Generator

    expect(gen.next().value).toEqual(take(OPEN_PROJECT))
    expect(gen.next(first).value).toEqual(fork(openProjectWorker, first))

    // Same project, run still going: back to waiting, no second boot.
    expect(gen.next(running).value).toEqual(take(OPEN_PROJECT))
    expect(gen.next(actions.openProject('p-1')).value).toEqual(take(OPEN_PROJECT))
  })

  it('still cancels and replaces the run when a different project is opened', () => {
    const first = actions.openProject('p-1')
    const second = actions.openProject('p-2')
    const gen = watchOpenProject() as Generator

    gen.next() // take
    gen.next(first) // fork
    gen.next(running) // take

    expect(gen.next(second).value).toEqual(cancel(running))
    expect(gen.next().value).toEqual(fork(openProjectWorker, second))
  })

  it('reopens the same project once its run has finished', () => {
    // Retry after a failure goes through this path: RETRY_BOOT redispatches
    // openProject for the same id, and by then the run it is retrying is over.
    const first = actions.openProject('p-1')
    const retry = actions.openProject('p-1')
    const gen = watchOpenProject() as Generator

    gen.next() // take
    gen.next(first) // fork
    gen.next(finished) // take

    expect(gen.next(retry).value).toEqual(fork(openProjectWorker, retry))
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
  it('drops the scene caches BEFORE releasing the scenario', () => {
    // The ordering is the point, and it is what this fixes. Both caches are
    // module-scoped, so leaving the project screen dropped nothing: the parsed
    // geometry stayed resident for as long as the user sat on the project list.
    // runBoot cleared it too, but microseconds before the NEXT project's
    // geometry started arriving — so both scenes were in memory at once, which
    // on a large ground is what ran the machine out of memory. Releasing here
    // gives the collector the whole time the user spends choosing.
    const gen = onNavigateHome(navigate('home')) as Generator

    expect(gen.next().value).toEqual(put(resetScene()))
    expect(gen.next().value).toEqual(call(clearSceneCache))
    expect(gen.next().value).toEqual(call(clearTextureCache))
    // Only then the backend release, which is what this used to do alone.
    expect(gen.next().value).toEqual(select(selectLiveScenario))
  })

  it('ignores navigation to anywhere else', () => {
    const gen = onNavigateHome(navigate('project')) as Generator
    expect(gen.next().done).toBe(true)
  })
})
