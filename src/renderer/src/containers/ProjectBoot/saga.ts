import {
  loadProjectSucceeded,
  listScenariosSucceeded,
  setActiveProject
} from 'containers/ProjectScreen/actions'
import type { GetProjectResponse } from 'containers/Weather/service'
import { getProjectRequest } from 'containers/Weather/service'
import { resetScene } from 'containers/3DWindow/store/actions'
import { clearSceneCache } from 'containers/3DWindow/store/sceneCache'
import { clearTextureCache } from 'containers/3DWindow/ui/textureCache'
import {
  call,
  cancel,
  cancelled,
  fork,
  join,
  put,
  race,
  select,
  take,
  takeLatest
} from 'redux-saga/effects'
import type { Task } from 'redux-saga'
import type { NavigationAction } from 'store/navigationReducer'
import { NAVIGATE, navigate } from 'store/navigationReducer'
import { ApiError } from 'utils/api'
import {
  clearActiveScope,
  reportScopeFailure,
  resetScopeLossLatch,
  setActiveScope
} from 'utils/scopeError'
import { STORAGE_KEYS } from 'utils/storageKeys'
import * as actions from './actions'
import {
  CANCEL_BOOT,
  DISMISS_BOOT_ERROR,
  DISMISS_SCOPE_LOST,
  OPEN_PROJECT,
  RETRY_BOOT,
  SCOPE_LOST
} from './constants'
import messages from './messages'
import { atPercent, fromInitEvent, isInitDone, isInitError, readInitError } from './progress'
import {
  selectBootActive,
  selectBootError,
  selectBootProjectId,
  selectBootRunId,
  selectLiveScenario
} from './selectors'
import { discardScenario, openInitChannel } from './service'
import type { BootError, InitEvent } from './types'

// ── Run identity ─────────────────────────────────────────────────────────────
//
// Every run gets a number. It rides on every action the run dispatches and the
// reducer drops anything whose number is stale — so a cancelled load that is
// still unwinding can never write over the load that replaced it.
let runCounter = 0
const nextRunId = (): number => ++runCounter

// ── Timing ───────────────────────────────────────────────────────────────────
//
// Logged for every open from day one. Without numbers, "it still feels slow"
// cannot be answered, and there is no way to tell which change helped.
interface Timings {
  [phase: string]: number
}

function logTimings(projectId: string, timings: Timings): void {
  const total = Object.values(timings).reduce((sum, ms) => sum + ms, 0)
  const parts = Object.entries(timings).map(([phase, ms]) => `${phase} ${Math.round(ms)}ms`)
  // eslint-disable-next-line no-console
  console.info(`[boot] ${projectId} — ${parts.join(' | ')} | total ${Math.round(total)}ms`)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toBootError(err: unknown): BootError {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      // The whole reason ApiError carries a code — dropping it here made the
      // field permanently null and threw away the one machine-readable part
      // of a backend failure.
      code: err.code,
      message: err.message,
      // 4xx means the ids are stale and a retry fails identically. 5xx and
      // network errors are transient, so the dialog offers Retry.
      retryable: !(err.status >= 400 && err.status < 500)
    }
  }
  return {
    status: 0,
    code: null,
    message: err instanceof Error ? err.message : String(err),
    retryable: true
  }
}

// ── Phase 1: project metadata ────────────────────────────────────────────────
//
// The first call a boot makes. Cheap, and it is what tells us which scenario to
// initialise — so it has to come before /init. It doubles as the reachability
// check: if the backend is still starting, this fails with a network error and
// the dialog offers Retry. A separate health probe ahead of it would only be
// one more request for the same answer.
function* loadProjectMeta(runId: number, projectId: string): Generator {
  yield put(
    actions.bootProgress(runId, atPercent('project', 0))
  )

  const res = (yield call(getProjectRequest, projectId)) as GetProjectResponse
  const project = res.project

  yield put(
    loadProjectSucceeded({
      id: project.id,
      name: project.name,
      latitude: project.latitude,
      longitude: project.longitude,
      utc_offset: project.utc_offset
    })
  )
  yield put(listScenariosSucceeded(projectId, project.scenarios))

  // No second dispatch here: the bar is already at 0 and the server has not
  // reported anything yet. Repeating the same value is a no-op the reducer
  // still has to process.
  return project.scenarios[0]?.id ?? null
}

// ── Phase 3: init stream ─────────────────────────────────────────────────────
//
// Creates the scenario's context and hydrates it — rebuilding the saved scene
// into memory. This is where the seconds go, and it used to happen by accident
// inside whichever call arrived first (the geometry tree), long after the
// screen had already switched. Running it here, first and alone, is the single
// biggest ordering fix in this flow.
//
// Read as its OWN forked task, deliberately. utils/sse emits END when the
// connection closes, and redux-saga TERMINATES a saga blocked on take(channel)
// when END arrives — it does not resume it. Delegated with yield*, that
// termination killed the entire boot mid-flight: no success, no failure, the
// loader left on screen at whatever percent it had reached, and the Cancel
// listener gone with the run that owned it. Forked, END stops only this task,
// and `join` below lets the boot carry on.
export function* streamInit(runId: number, projectId: string, scenarioId: string): Generator {
  const channel = (yield call(openInitChannel, projectId, scenarioId)) as ReturnType<
    typeof openInitChannel
  >

  try {
    while (true) {
      // No timeout. A large scene is legitimately slow, and the wait continues
      // until the stream ends on its own. `take` returns undefined when the
      // channel closes on END, which utils/sse emits for BOTH a normal
      // server-side close and a dropped connection — indistinguishable from the
      // client. Rather than failing, fall through and let the ordinary calls
      // decide: hydration may well have completed, and if it did not they will
      // say so with a real error. This goes away once the stream guarantees a
      // terminal event (R3).
      const received = (yield take(channel)) as { data: InitEvent } | undefined
      if (!received) return

      const event = received.data

      if (isInitError(event)) {
        const { status, code, message } = readInitError(event)
        // The stream is one of the three places a deleted project surfaces, so
        // it reports through the same handler the REST and binary paths use.
        yield call(reportScopeFailure, { status, code, message })
        throw new ApiError(status || 0, message, {}, code)
      }

      if (isInitDone(event)) return

      yield put(actions.bootProgress(runId, fromInitEvent(event)))
    }
  } finally {
    channel.close()
  }
}

export function* runInit(runId: number, projectId: string, scenarioId: string): Generator {
  yield put(actions.bootProgress(runId, atPercent('init', 0)))

  // join re-throws whatever the stream threw, so a real init error still fails
  // the boot. A stream that merely ENDED resolves here instead, and the
  // ordinary calls carry on — the right fallback, since hydration may well
  // have finished and they will report a real error if it did not.
  const task = (yield fork(streamInit, runId, projectId, scenarioId)) as Task
  yield join(task)
}

// ── Phase 3: reveal ──────────────────────────────────────────────────────────
//
// The persisted ids are a record of what FINISHED, never of what was attempted.
// Both are written here, together, or neither is — so a cancelled or failed
// open can never leave half a pair behind for the next start to misread.
function* reveal(runId: number, projectId: string, scenarioId: string | null): Generator {
  yield put(actions.bootProgress(runId, atPercent('reveal', 100)))

  try {
    localStorage.setItem(STORAGE_KEYS.activeProjectId, projectId)
    if (scenarioId) localStorage.setItem(STORAGE_KEYS.activeScenarioId, scenarioId)
  } catch {
    /* storage disabled — the session still works, it just won't be restored */
  }

  // The screen needs an id the moment it mounts — everything it loads hangs off
  // this one. The SCENARIO id is deliberately not set here: ProjectScreen's own
  // listScenarios sets it on mount, and setting it early would start a scene
  // load before the panels that feed it exist.
  yield put(setActiveProject(projectId))
  yield put(navigate('project'))
  yield put(actions.bootSucceeded(runId, projectId, scenarioId))
}

// ── The run ──────────────────────────────────────────────────────────────────

function* runBoot(runId: number, projectId: string): Generator {
  const timings: Timings = {}
  let mark = performance.now()
  const lap = (name: string): void => {
    const now = performance.now()
    timings[name] = now - mark
    mark = now
  }

  // A previous project's scene must be released BEFORE the new one loads, not
  // after — otherwise both sit in memory at once, and for a large scene that
  // spike is enough to stutter or run out.
  yield put(resetScene())
  yield call(clearSceneCache)
  yield call(clearTextureCache)

  // Switching projects: release the previous scenario before loading the next,
  // so two hydrated scenes are never held on the backend at once. Skipped when
  // it is the same scenario we are about to open — discarding it only to
  // re-hydrate it from disk is pure cost.
  yield* releaseLiveScenario({ exceptProjectId: projectId })

  // Armed before the first call that can 404 on this id, so a project deleted
  // in the other window is recognised even if it dies during metadata load.
  yield call(setActiveScope, projectId, null)

  const scenarioId = (yield* loadProjectMeta(runId, projectId)) as string | null
  lap('project')

  // Every project gets a `main` scenario on creation, so this is close to
  // unreachable — but an empty project must settle as a success rather than
  // wait for a scenario that will never arrive.
  if (!scenarioId) {
    yield* reveal(runId, projectId, null)
    logTimings(projectId, timings)
    return
  }

  yield call(setActiveScope, projectId, scenarioId)

  yield* runInit(runId, projectId, scenarioId)
  lap('init')

  // Nothing else belongs in the loader. Once the context is hydrated the screen
  // is safe to show, and each panel fetches what it needs when it mounts — the
  // catalogs, the scenario list, the geometry tree, the materials and the scene
  // itself. The loader exists to cover hydration, not the whole screen.
  yield* reveal(runId, projectId, scenarioId)
  lap('reveal')

  logTimings(projectId, timings)
}

/**
 * Undo a run the user walked away from.
 *
 * The backend is deliberately left alone. /discard would autosave first, and
 * autosaving a half-hydrated context overwrites the scenario's real context.xml
 * while rotating the good copy into archives — cancelling a load would corrupt
 * the saved scene. The work already in flight there finishes and is reused if
 * the user opens the same project again. Once the backend grows a cancel path
 * that skips the save (R6), this is where the call goes.
 */
function* unwind(runId: number): Generator {
  yield put(resetScene())
  yield call(clearSceneCache)
  yield call(clearTextureCache)
  yield call(clearActiveScope)
  yield put(navigate('home'))
  yield put(actions.bootCancelled(runId))
}

export function* openProjectWorker(action: ReturnType<typeof actions.openProject>): Generator {
  const { projectId } = action.payload
  const runId = nextRunId()

  yield put(actions.bootStarted(runId, projectId))

  try {
    const outcome = (yield race({
      done: call(runBoot, runId, projectId),
      cancelled: take(CANCEL_BOOT)
    })) as { cancelled?: unknown }

    if (outcome.cancelled) yield* unwind(runId)
  } catch (err) {
    // A 404 means the project or scenario is gone — usually deleted by the
    // other window. utils/scopeError has already raised the blocking dialog, so
    // stacking a second error message on top of it would only be noise.
    if (err instanceof ApiError && err.status === 404) return
    yield put(actions.bootFailed(runId, toBootError(err)))
  } finally {
    // Belt and braces. Any path that leaves this worker without a terminal
    // action strands the loader: progress on screen, nothing happening, and no
    // Cancel listener still armed — because the race that was taking
    // CANCEL_BOOT ended with the run. If that ever happens again, fail loudly
    // rather than silently: the dialog keeps Retry and Go to Home, so a bug in
    // here can never trap the user.
    //
    // Skipped when this worker was cancelled by takeLatest — a second project
    // is already opening and owns the loader now.
    if (!(yield cancelled())) {
      const stillActive = (yield select(selectBootActive)) as boolean
      const failure = (yield select(selectBootError)) as BootError | null
      const currentRun = (yield select(selectBootRunId)) as number

      if (currentRun === runId && stillActive && !failure) {
        yield put(
          actions.bootFailed(runId, {
            status: 0,
            code: null,
            message: messages.error.generic,
            retryable: true
          })
        )
      }
    }
  }
}

// ── Releasing the backend context ────────────────────────────────────────────

// Release the backend context of the scenario we last finished loading.
//
// Only ever one whose boot COMPLETED: /discard autosaves before releasing, and
// autosaving a half-hydrated context would overwrite the scenario's real
// context.xml while rotating the good copy into archives. A cancelled or failed
// boot leaves the backend alone entirely.
//
// Known gap until the backend counts windows (R7): both windows share one
// session, so this releases a context the other window may still be using. It
// re-hydrates on that window's next call — slow for them, but nothing is lost,
// because the autosave runs first.
export function* releaseLiveScenario(opts?: { exceptProjectId?: string }): Generator {
  const live = (yield select(selectLiveScenario)) as {
    projectId: string
    scenarioId: string
  } | null
  if (!live) return

  // Reopening the project we already have loaded: discarding it here only to
  // hydrate it again from disk a moment later is pure cost, and the /init that
  // follows finds it warm instead.
  if (opts?.exceptProjectId && opts.exceptProjectId === live.projectId) return

  // Cleared before the call, not after, so a project switch racing a navigate
  // cannot fire two discards for the same scenario.
  yield put(actions.scenarioDiscarded())

  try {
    yield call(discardScenario, live.projectId, live.scenarioId)
  } catch {
    // Best effort. The context goes when the backend exits anyway, and failing
    // to free memory is not worth blocking the user's navigation.
  }
}

// Going back to the project list is the moment the scenario stops being needed.
// The screen has already switched by the time this runs, so the autosave inside
// /discard happens behind the user rather than in front of them.
export function* onNavigateHome(action: NavigationAction): Generator {
  if (action.payload !== 'home') return
  yield* releaseLiveScenario()
}

// The error dialog's way out. It needs its own always-on watcher because a
// failure is dispatched only after the run has finished, so the CANCEL_BOOT
// listener inside that run's race no longer exists and the buttons would sit
// dead on screen.
export function* dismissBootErrorWorker(): Generator {
  yield put(resetScene())
  yield call(clearSceneCache)
  yield call(clearTextureCache)
  yield call(clearActiveScope)
  yield put(navigate('home'))
}

// Re-run the last attempted project. The dialog only offers this for failures
// worth retrying — a stale id would fail identically.
export function* retryBootWorker(): Generator {
  const projectId = (yield select(selectBootProjectId)) as string | null
  if (projectId) yield put(actions.openProject(projectId))
}

// The project died mid-load. Stop the run rather than letting it keep calling
// a backend that will 404 every request — the dialog is already up and the
// screen behind it is finished either way.
export function* scopeLostWorker(): Generator {
  yield put(actions.cancelBoot())
}

// The user acknowledged the dialog. Home is the only destination: everything
// the previous screen was showing has been deleted. navigate('home') is what
// drops the persisted ids (see ProjectScreen's clearPersistedIdsOnHome), so the
// next start does not try to reopen the same dead project.
export function* scopeLostDismissedWorker(): Generator {
  yield call(clearActiveScope)
  yield call(resetScopeLossLatch)
  yield put(navigate('home'))
}

// ── Watching OPEN_PROJECT ────────────────────────────────────────────────────
//
// takeLatest, minus the one case where "latest" is the wrong answer.
//
// A restart with both ids persisted opens the project on its own — App's
// restore effect dispatches OPEN_PROJECT before the user has touched anything.
// If that same project is then opened again while the restore is still running,
// plain takeLatest would cancel the run in flight and start a second one for
// the same scenario. On this side that looks clean; on the backend it is not.
// The first /init is already in progress there, and cancelling the saga only
// closes our end of the stream — so the second /init arrives alongside a
// hydration that is still running, and two of them race over one context.
//
// So a request for the project ALREADY booting is dropped, and only a different
// project cancels and replaces the run. Its late results still cannot land: the
// run id on every action is what keeps a cancelled run out of the new project's
// state.
//
// This cannot see every duplicate — a run abandoned earlier (cancelled from the
// loader, then reopened from Home) leaves an init finishing on the backend that
// no frontend state remembers. That one is the backend cancel path's to close;
// this keeps the frontend from manufacturing the collision in the first place.
export function* watchOpenProject(): Generator {
  let task: Task | null = null
  let bootingProjectId: string | null = null

  while (true) {
    const action = (yield take(OPEN_PROJECT)) as ReturnType<typeof actions.openProject>
    const { projectId } = action.payload

    // Already loading this exact project — the run in flight is the one the
    // caller wants. Retry after a failure still gets through: that run has
    // finished by the time RETRY_BOOT redispatches.
    if (task?.isRunning() && bootingProjectId === projectId) continue

    if (task?.isRunning()) yield cancel(task)

    bootingProjectId = projectId
    task = (yield fork(openProjectWorker, action)) as Task
  }
}

export default function* projectBootSaga(): Generator {
  yield fork(watchOpenProject)
  yield takeLatest(RETRY_BOOT, retryBootWorker)
  yield takeLatest(DISMISS_BOOT_ERROR, dismissBootErrorWorker)
  yield takeLatest(SCOPE_LOST, scopeLostWorker)
  yield takeLatest(DISMISS_SCOPE_LOST, scopeLostDismissedWorker)
  yield takeLatest(NAVIGATE, onNavigateHome)
}
