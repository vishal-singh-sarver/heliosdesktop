import { getProjectRequest } from '@renderer/containers/Weather/service'
import { setActiveProject } from 'containers/ProjectScreen/actions'
import { call, put, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
import { navigate } from 'store/navigationReducer'
import { showSnackbar } from 'store/snackbarReducer'
import toastMessages from 'store/toastMessages'
import { api, ApiError } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import { STORAGE_KEYS } from 'utils/storageKeys'
import * as actions from '../actions'
import {
  CREATE_PROJECT,
  DELETE_PROJECT,
  FETCH_RECENT_PROJECTS,
  FETCH_STATUS,
  RENAME_PROJECT,
  SSE_CONNECT
} from '../constants'
import homePageSaga, {
  createProjectWorker,
  deleteProjectWorker,
  fetchRecentProjectsWorker,
  fetchStatusWorker,
  renameProjectWorker
} from '../saga'
import type { CreateProjectPayload, CreateProjectResponse } from '../types'

// ── fetchStatusWorker ─────────────────────────────────────────────────────────

describe('fetchStatusWorker', () => {
  it('calls GET /api/status then puts fetchStatusSuccess', () => {
    const gen = fetchStatusWorker()

    expect(gen.next().value).toEqual(call(api.get, '/api/status'))

    const status = { version: '1.0.0', uptime: 30 }
    expect(gen.next(status).value).toEqual(put(actions.fetchStatusSuccess(status)))

    expect(gen.next().done).toBe(true)
  })

  it('puts fetchStatusFailure when fetch throws', () => {
    const gen = fetchStatusWorker()
    gen.next()

    const error = new Error('Network error')
    expect(gen.throw(error).value).toEqual(put(actions.fetchStatusFailure('Network error')))
  })
})

// ── createProjectWorker ──────────────────────────────────────────────────────

describe('createProjectWorker', () => {
  const payload: CreateProjectPayload = { name: 'Alpha', latitude: 10, longitude: 20 }
  const response: CreateProjectResponse = {
    success: true,
    project_id: 'uuid-1',
    name: 'Alpha',
    latitude: 10,
    longitude: 20,
    utc_offset: 0,
    session_id: 'sess-1'
  }

  it('POSTs to project/create, then puts success and refreshes the recent list', () => {
    const gen = createProjectWorker(actions.createProject(payload))

    // 1) call the API with the configured route and the action payload
    expect(gen.next().value).toEqual(call(api.post, API_ROUTES.project.create, payload))

    // 2) success put
    expect(gen.next(response).value).toEqual(put(actions.createProjectSuccess(response)))

    expect(gen.next().value).toEqual(call(getProjectRequest, 'uuid-1'))

    const projectResponse = {
      project: {
        id: 'uuid-1',
        scenarios: []
      }
    }
    expect(gen.next(projectResponse).value).toEqual(
      call([localStorage, 'setItem'], STORAGE_KEYS.activeProjectId, 'uuid-1')
    )

    expect(gen.next().value).toEqual(put(setActiveProject('uuid-1')))
    expect(gen.next().value).toEqual(put(navigate('project')))
    expect(gen.next().value).toEqual(put(actions.fetchRecentProjects()))
    expect(gen.next().done).toBe(true)
  })

  it('converts an ApiError into a structured createProjectFailure payload', () => {
    const gen = createProjectWorker(actions.createProject(payload))
    gen.next() // advance past the call

    const apiErr = new ApiError(409, 'duplicate name', { name: 'already exists' })
    expect(gen.throw(apiErr).value).toEqual(
      put(
        actions.createProjectFailure({
          status: 409,
          message: 'duplicate name',
          fieldErrors: { name: 'already exists' }
        })
      )
    )
    expect(gen.next().done).toBe(true)
  })

  it('falls back to status=0 for non-Api errors', () => {
    const gen = createProjectWorker(actions.createProject(payload))
    gen.next()

    const err = new Error('offline')
    expect(gen.throw(err).value).toEqual(
      put(
        actions.createProjectFailure({
          status: 0,
          message: 'offline',
          fieldErrors: {}
        })
      )
    )
  })
})

// ── fetchRecentProjectsWorker ────────────────────────────────────────────────

describe('fetchRecentProjectsWorker', () => {
  it('GETs the recent projects route and unwraps `.projects` into success', () => {
    const gen = fetchRecentProjectsWorker()

    expect(gen.next().value).toEqual(call(api.get, API_ROUTES.project.recent))

    const response = {
      projects: [{ id: 'a', name: 'Alpha', last_updated: '2026-03-29T00:00:00Z', size: 1024 }]
    }
    expect(gen.next(response).value).toEqual(
      put(actions.fetchRecentProjectsSuccess(response.projects))
    )

    expect(gen.next().done).toBe(true)
  })

  it('puts fetchRecentProjectsFailure on error', () => {
    const gen = fetchRecentProjectsWorker()
    gen.next()

    const apiErr = new ApiError(500, 'boom')
    expect(gen.throw(apiErr).value).toEqual(
      put(
        actions.fetchRecentProjectsFailure({
          status: 500,
          message: 'boom',
          fieldErrors: {}
        })
      )
    )
  })
})

// ── deleteProjectWorker ──────────────────────────────────────────────────────

describe('deleteProjectWorker', () => {
  it('DELETEs the project route and puts success with projectId', () => {
    const gen = deleteProjectWorker(actions.deleteProject({ projectId: 'uuid-1', name: 'Project A' }))

    expect(gen.next().value).toEqual(call(api.delete, API_ROUTES.project.delete('uuid-1')))
    expect(gen.next().value).toEqual(put(actions.deleteProjectSuccess('uuid-1')))
    expect(gen.next().value).toEqual(
      put(showSnackbar(toastMessages.projectDeleted('Project A'), 'success'))
    )
    expect(gen.next().done).toBe(true)
  })

  it('puts deleteProjectFailure carrying the projectId when the call fails', () => {
    const gen = deleteProjectWorker(actions.deleteProject({ projectId: 'uuid-1', name: 'Project A' }))
    gen.next()

    const apiErr = new ApiError(404, 'not found')
    expect(gen.throw(apiErr).value).toEqual(
      put(
        actions.deleteProjectFailure('uuid-1', {
          status: 404,
          message: 'not found',
          fieldErrors: {}
        })
      )
    )
  })
})

// ── renameProjectWorker ─────────────────────────────────────────────────────

describe('renameProjectWorker', () => {
  it('GETs project details, PATCHes full required body, then refreshes recent projects', () => {
    const gen = renameProjectWorker(actions.renameProject({ projectId: 'uuid-1', name: 'Beta' }))

    expect(gen.next().value).toEqual(call(api.get, API_ROUTES.project.get('uuid-1')))

    expect(
      gen.next({
        project: {
          id: 'uuid-1',
          name: 'Alpha',
          latitude: 10,
          longitude: 20,
          utc_offset: '+00:00',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          scenarios: []
        }
      }).value
    ).toEqual(
      call(api.patch, API_ROUTES.project.update('uuid-1'), {
        name: 'Beta',
        latitude: 10,
        longitude: 20
      })
    )

    expect(gen.next().value).toEqual(put(actions.renameProjectSuccess('uuid-1', 'Beta')))
    expect(gen.next().value).toEqual(put(actions.fetchRecentProjects()))
    // Named with the OLD name from the GET above and the new one from the action.
    expect(gen.next().value).toEqual(
      put(showSnackbar(toastMessages.projectRenamed('Alpha', 'Beta'), 'success'))
    )
    expect(gen.next().done).toBe(true)
  })

  it('puts renameProjectFailure when the patch fails', () => {
    const gen = renameProjectWorker(actions.renameProject({ projectId: 'uuid-1', name: 'Beta' }))
    gen.next()
    gen.next({
      project: {
        id: 'uuid-1',
        name: 'Alpha',
        latitude: 10,
        longitude: 20,
        utc_offset: '+00:00',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        scenarios: []
      }
    })

    const apiErr = new ApiError(409, 'duplicate')
    expect(gen.throw(apiErr).value).toEqual(
      put(
        actions.renameProjectFailure('uuid-1', {
          status: 409,
          message: 'duplicate',
          fieldErrors: {}
        })
      )
    )
  })
})

// ── Root watcher ─────────────────────────────────────────────────────────────

describe('homePageSaga (root watcher)', () => {
  it('watches FETCH_STATUS with takeLatest', () => {
    const gen = homePageSaga()
    expect(gen.next().value).toEqual(takeLatest(FETCH_STATUS, fetchStatusWorker))
  })

  it('watches SSE_CONNECT as the second effect', () => {
    const gen = homePageSaga()
    gen.next()
    // redux-saga compiles takeLatest into a FORK effect; just verify the
    // pattern is wired into the effect description.
    const second = JSON.stringify(gen.next().value)
    expect(second).toContain(SSE_CONNECT)
    expect(second).toContain('"FORK"')
  })

  it('watches CREATE_PROJECT with takeLeading (prevents double-submit races)', () => {
    const gen = homePageSaga()
    gen.next() // FETCH_STATUS
    gen.next() // SSE_CONNECT
    expect(gen.next().value).toEqual(takeLeading(CREATE_PROJECT, createProjectWorker))
  })

  it('watches FETCH_RECENT_PROJECTS with takeLatest', () => {
    const gen = homePageSaga()
    gen.next()
    gen.next()
    gen.next()
    expect(gen.next().value).toEqual(takeLatest(FETCH_RECENT_PROJECTS, fetchRecentProjectsWorker))
  })

  it('watches DELETE_PROJECT with takeEvery so deletes run concurrently', () => {
    const gen = homePageSaga()
    gen.next()
    gen.next()
    gen.next()
    gen.next()
    expect(gen.next().value).toEqual(takeEvery(DELETE_PROJECT, deleteProjectWorker))
  })

  it('watches RENAME_PROJECT with takeLatest', () => {
    const gen = homePageSaga()
    gen.next()
    gen.next()
    gen.next()
    gen.next()
    gen.next()
    expect(gen.next().value).toEqual(takeLatest(RENAME_PROJECT, renameProjectWorker))
  })

  it('has no more effects after the six watchers', () => {
    const gen = homePageSaga()
    gen.next()
    gen.next()
    gen.next()
    gen.next()
    gen.next()
    gen.next()
    expect(gen.next().done).toBe(true)
  })
})
