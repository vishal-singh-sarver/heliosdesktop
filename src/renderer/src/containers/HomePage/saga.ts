import { setActiveProject, setActiveScenario } from 'containers/ProjectScreen/actions'
import type { GetProjectResponse } from 'containers/Weather/service'
import { getProjectRequest } from 'containers/Weather/service'
import { call, put, race, take, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
import { navigate } from 'store/navigationReducer'
import { showSnackbar } from 'store/snackbarReducer'
import toastMessages from 'store/toastMessages'
import { api, ApiError } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import type { SseMessage } from 'utils/sse'
import { createSseChannel } from 'utils/sse'
import { STORAGE_KEYS } from 'utils/storageKeys'
import * as actions from './actions'
import {
  CREATE_PROJECT,
  DELETE_PROJECT,
  FETCH_RECENT_PROJECTS,
  FETCH_STATUS,
  RENAME_PROJECT,
  SSE_CONNECT,
  SSE_DISCONNECT
} from './constants'
import type {
  ApiErrorPayload,
  AppStatus,
  CreateProjectResponse,
  RecentProjectsResponse
} from './types'

interface ProjectDetailsResponse {
  project: {
    id: string
    name: string
    latitude: number
    longitude: number
    utc_offset: string
    created_at: string
    updated_at: string
    scenarios: unknown[]
  }
}

function toErrorPayload(err: unknown): ApiErrorPayload {
  if (err instanceof ApiError) {
    return { status: err.status, message: err.message, fieldErrors: err.fieldErrors }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { status: 0, message, fieldErrors: {} }
}

// ── REST worker ───────────────────────────────────────────────────────────────

export function* fetchStatusWorker(): Generator {
  try {
    const status = (yield call(api.get<AppStatus>, '/api/status')) as AppStatus
    yield put(actions.fetchStatusSuccess(status))
  } catch (err) {
    yield put(actions.fetchStatusFailure((err as Error).message))
  }
}

// ── Create project worker ─────────────────────────────────────────────────────

export function* createProjectWorker(action: ReturnType<typeof actions.createProject>): Generator {
  try {
    const response = (yield call(
      api.post<CreateProjectResponse>,
      API_ROUTES.project.create,
      action.payload
    )) as CreateProjectResponse
    yield put(actions.createProjectSuccess(response))
    const projectResponse = (yield call(
      getProjectRequest,
      response.project_id
    )) as GetProjectResponse

    const firstScenarioId = projectResponse.project.scenarios[0]?.id ?? null

    yield call([localStorage, 'setItem'], STORAGE_KEYS.activeProjectId, response.project_id)
    yield put(setActiveProject(response.project_id))

    if (firstScenarioId) {
      yield call([localStorage, 'setItem'], STORAGE_KEYS.activeScenarioId, firstScenarioId)
      yield put(setActiveScenario(firstScenarioId))
    }

    yield put(navigate('project'))
    // Refresh the Recent Projects list so the table reflects the new row
    // without the component having to orchestrate a follow-up dispatch.
    yield put(actions.fetchRecentProjects())
  } catch (err) {
    yield put(actions.createProjectFailure(toErrorPayload(err)))
  }
}

// ── Delete project worker ─────────────────────────────────────────────────────

export function* deleteProjectWorker(action: ReturnType<typeof actions.deleteProject>): Generator {
  const { projectId, name } = action.payload
  try {
    yield call(api.delete<string>, API_ROUTES.project.delete(projectId))
    yield put(actions.deleteProjectSuccess(projectId))
    yield put(showSnackbar(toastMessages.projectDeleted(name), 'success'))
  } catch (err) {
    yield put(actions.deleteProjectFailure(projectId, toErrorPayload(err)))
    yield put(showSnackbar(toastMessages.projectDeleteFailed(name), 'error'))
  }
}

// ── Rename project worker ────────────────────────────────────────────────────

export function* renameProjectWorker(action: ReturnType<typeof actions.renameProject>): Generator {
  const { projectId, name } = action.payload
  try {
    const response = (yield call(
      api.get<ProjectDetailsResponse>,
      API_ROUTES.project.get(projectId)
    )) as ProjectDetailsResponse

    yield call(api.patch<string>, API_ROUTES.project.update(projectId), {
      name,
      latitude: response.project.latitude,
      longitude: response.project.longitude
    })

    yield put(actions.renameProjectSuccess(projectId, name))
    yield put(actions.fetchRecentProjects())
    // The GET above ran BEFORE the PATCH, so it still holds the old name — the
    // only moment it is available to report.
    yield put(showSnackbar(toastMessages.projectRenamed(response.project.name, name), 'success'))
  } catch (err) {
    yield put(actions.renameProjectFailure(projectId, toErrorPayload(err)))
    yield put(showSnackbar(toastMessages.projectRenameFailed(name), 'error'))
  }
}

// ── Recent projects worker ────────────────────────────────────────────────────

export function* fetchRecentProjectsWorker(): Generator {
  try {
    const response = (yield call(
      api.get<RecentProjectsResponse>,
      API_ROUTES.project.recent
    )) as RecentProjectsResponse
    yield put(actions.fetchRecentProjectsSuccess(response.projects))
  } catch (err) {
    yield put(actions.fetchRecentProjectsFailure(toErrorPayload(err)))
  }
}

// ── SSE worker ────────────────────────────────────────────────────────────────

function* sseWorker(): Generator {
  const channel = (yield call(createSseChannel, '/api/events')) as ReturnType<
    typeof createSseChannel
  >

  try {
    while (true) {
      const result = (yield race({
        msg: take(channel),
        stop: take(SSE_DISCONNECT)
      })) as { msg?: SseMessage; stop?: unknown }

      if (result.stop) break

      if (result.msg) {
        yield put(
          actions.sseEvent({
            type: result.msg.type,
            data: result.msg.data,
            timestamp: Date.now()
          })
        )
      }
    }
  } finally {
    channel.close()
    yield put(actions.sseDisconnect())
  }
}

// ── Root watcher ──────────────────────────────────────────────────────────────

export default function* homePageSaga(): Generator {
  yield takeLatest(FETCH_STATUS, fetchStatusWorker)
  // takeLatest cancels any running sseWorker first, triggering its
  // finally block which closes the channel before opening a new one.
  yield takeLatest(SSE_CONNECT, sseWorker)
  // takeLeading: ignore extra dispatches while a create is in flight.
  // Prevents double-clicks from racing two POSTs against a non-idempotent
  // backend endpoint.
  yield takeLeading(CREATE_PROJECT, createProjectWorker)
  yield takeLatest(FETCH_RECENT_PROJECTS, fetchRecentProjectsWorker)
  // takeEvery: each row's delete runs independently so multiple rows can be
  // deleted concurrently without queueing.
  yield takeEvery(DELETE_PROJECT, deleteProjectWorker)
  yield takeLatest(RENAME_PROJECT, renameProjectWorker)
}
