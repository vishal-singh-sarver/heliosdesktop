import homePageReducer, {
  initialState,
  initialCreateProjectState,
  initialRecentProjectsState,
  initialDeleteProjectState,
  initialRenameProjectState
} from '../reducer'
import * as actions from '../actions'
import type { ApiErrorPayload, CreateProjectResponse, RecentProjectItem } from '../types'

describe('homePageReducer', () => {
  it('returns the initial state for unknown actions', () => {
    expect(homePageReducer(undefined, {} as any)).toEqual(initialState)
  })

  // ── REST: status ────────────────────────────────────────────────────────────

  describe('REST status', () => {
    it('FETCH_STATUS sets loading and clears error', () => {
      const prev = { ...initialState, error: 'prev error' }
      const result = homePageReducer(prev, actions.fetchStatus())
      expect(result.loading).toBe(true)
      expect(result.error).toBeNull()
    })

    it('FETCH_STATUS_SUCCESS stores status and clears loading', () => {
      const status = { version: '2.0.0', uptime: 120 }
      const result = homePageReducer(
        { ...initialState, loading: true },
        actions.fetchStatusSuccess(status)
      )
      expect(result.loading).toBe(false)
      expect(result.status).toEqual(status)
    })

    it('FETCH_STATUS_FAILURE stores error and clears loading', () => {
      const result = homePageReducer(
        { ...initialState, loading: true },
        actions.fetchStatusFailure('connection refused')
      )
      expect(result.loading).toBe(false)
      expect(result.error).toBe('connection refused')
    })
  })

  // ── SSE ─────────────────────────────────────────────────────────────────────

  describe('SSE', () => {
    it('SSE_CONNECT sets streaming and resets log', () => {
      const event = { type: 'x', data: null, timestamp: 0 }
      const result = homePageReducer({ ...initialState, streamLog: [event] }, actions.sseConnect())
      expect(result.streaming).toBe(true)
      expect(result.streamLog).toHaveLength(0)
    })

    it('SSE_EVENT appends event to streamLog', () => {
      const event = { type: 'update', data: { count: 5 }, timestamp: 9999 }
      const result = homePageReducer(initialState, actions.sseEvent(event))
      expect(result.streamLog).toHaveLength(1)
      expect(result.streamLog[0]).toEqual(event)
    })

    it('SSE_DISCONNECT clears streaming flag', () => {
      const result = homePageReducer({ ...initialState, streaming: true }, actions.sseDisconnect())
      expect(result.streaming).toBe(false)
    })

    it('SSE_EVENT does not mutate the original state (immer)', () => {
      const event = { type: 'ping', data: 'hi', timestamp: 1 }
      homePageReducer(initialState, actions.sseEvent(event))
      expect(initialState.streamLog).toHaveLength(0)
    })
  })

  // ── Create project ──────────────────────────────────────────────────────────

  describe('create project', () => {
    const payload = { name: 'Alpha', latitude: 10, longitude: 20 }
    const response: CreateProjectResponse = {
      success: true,
      project_id: 'uuid-1',
      name: 'Alpha',
      latitude: 10,
      longitude: 20,
      utc_offset: 0,
      session_id: 'sess-1'
    }
    const apiErr: ApiErrorPayload = { status: 409, message: 'dup', fieldErrors: { name: 'dup' } }

    it('CREATE_PROJECT sets loading, clears error and success', () => {
      const prev = {
        ...initialState,
        createProject: {
          ...initialCreateProjectState,
          error: apiErr,
          success: true
        }
      }
      const result = homePageReducer(prev, actions.createProject(payload))
      expect(result.createProject.loading).toBe(true)
      expect(result.createProject.error).toBeNull()
      expect(result.createProject.success).toBe(false)
    })

    it('CREATE_PROJECT_SUCCESS clears loading, stores data, marks success', () => {
      const prev = {
        ...initialState,
        createProject: { ...initialCreateProjectState, loading: true }
      }
      const result = homePageReducer(prev, actions.createProjectSuccess(response))
      expect(result.createProject.loading).toBe(false)
      expect(result.createProject.success).toBe(true)
      expect(result.createProject.data).toEqual(response)
    })

    it('CREATE_PROJECT_FAILURE clears loading and stores error', () => {
      const prev = {
        ...initialState,
        createProject: { ...initialCreateProjectState, loading: true }
      }
      const result = homePageReducer(prev, actions.createProjectFailure(apiErr))
      expect(result.createProject.loading).toBe(false)
      expect(result.createProject.error).toEqual(apiErr)
    })

    it('RESET_CREATE_PROJECT returns create slice to its initial shape', () => {
      const prev = {
        ...initialState,
        createProject: {
          loading: true,
          error: apiErr,
          success: true,
          data: response
        }
      }
      const result = homePageReducer(prev, actions.resetCreateProject())
      expect(result.createProject).toEqual(initialCreateProjectState)
    })
  })

  // ── Recent projects ─────────────────────────────────────────────────────────

  describe('recent projects', () => {
    const list: RecentProjectItem[] = [
      { id: 'a', name: 'Alpha', last_updated: '2026-03-29T00:00:00Z', size: 1024 },
      { id: 'b', name: 'Beta', last_updated: '2026-03-28T00:00:00Z', size: 2048 }
    ]
    const apiErr: ApiErrorPayload = { status: 500, message: 'boom', fieldErrors: {} }

    it('FETCH_RECENT_PROJECTS sets loading and clears error', () => {
      const prev = {
        ...initialState,
        recentProjects: { ...initialRecentProjectsState, error: apiErr }
      }
      const result = homePageReducer(prev, actions.fetchRecentProjects())
      expect(result.recentProjects.loading).toBe(true)
      expect(result.recentProjects.error).toBeNull()
    })

    it('FETCH_RECENT_PROJECTS_SUCCESS stores data and clears loading', () => {
      const prev = {
        ...initialState,
        recentProjects: { ...initialRecentProjectsState, loading: true }
      }
      const result = homePageReducer(prev, actions.fetchRecentProjectsSuccess(list))
      expect(result.recentProjects.loading).toBe(false)
      expect(result.recentProjects.data).toEqual(list)
    })

    it('FETCH_RECENT_PROJECTS_FAILURE stores error and clears loading', () => {
      const prev = {
        ...initialState,
        recentProjects: { ...initialRecentProjectsState, loading: true }
      }
      const result = homePageReducer(prev, actions.fetchRecentProjectsFailure(apiErr))
      expect(result.recentProjects.loading).toBe(false)
      expect(result.recentProjects.error).toEqual(apiErr)
    })
  })

  // ── Delete project ──────────────────────────────────────────────────────────

  describe('delete project', () => {
    const apiErr: ApiErrorPayload = { status: 404, message: 'not found', fieldErrors: {} }
    const seeded: RecentProjectItem[] = [
      { id: 'a', name: 'Alpha', last_updated: '2026-03-29T00:00:00Z', size: 1 },
      { id: 'b', name: 'Beta', last_updated: '2026-03-28T00:00:00Z', size: 2 }
    ]

    it('DELETE_PROJECT adds projectId to inFlightIds and clears error', () => {
      const prev = {
        ...initialState,
        deleteProject: { inFlightIds: [], error: apiErr }
      }
      const result = homePageReducer(prev, actions.deleteProject({ projectId: 'a', name: 'Project A' }))
      expect(result.deleteProject.inFlightIds).toEqual(['a'])
      expect(result.deleteProject.error).toBeNull()
    })

    it('DELETE_PROJECT is idempotent — does not duplicate an in-flight id', () => {
      const prev = {
        ...initialState,
        deleteProject: { inFlightIds: ['a'], error: null }
      }
      const result = homePageReducer(prev, actions.deleteProject({ projectId: 'a', name: 'Project A' }))
      expect(result.deleteProject.inFlightIds).toEqual(['a'])
    })

    it('DELETE_PROJECT supports concurrent deletes', () => {
      const withA = homePageReducer(initialState, actions.deleteProject({ projectId: 'a', name: 'Project A' }))
      const withAandB = homePageReducer(withA, actions.deleteProject({ projectId: 'b', name: 'Project A' }))
      expect(withAandB.deleteProject.inFlightIds).toEqual(['a', 'b'])
    })

    it('DELETE_PROJECT_SUCCESS removes id from inFlight and from recentProjects.data', () => {
      const prev = {
        ...initialState,
        recentProjects: { ...initialRecentProjectsState, data: seeded },
        deleteProject: { inFlightIds: ['a', 'b'], error: null }
      }
      const result = homePageReducer(prev, actions.deleteProjectSuccess('a'))
      expect(result.deleteProject.inFlightIds).toEqual(['b'])
      expect(result.recentProjects.data.map((p) => p.id)).toEqual(['b'])
    })

    it('DELETE_PROJECT_FAILURE removes id from inFlight and stores error', () => {
      const prev = {
        ...initialState,
        deleteProject: { inFlightIds: ['a'], error: null }
      }
      const result = homePageReducer(prev, actions.deleteProjectFailure('a', apiErr))
      expect(result.deleteProject.inFlightIds).toEqual([])
      expect(result.deleteProject.error).toEqual(apiErr)
    })

    it('DELETE_PROJECT_SUCCESS is a no-op on recentProjects when id is absent', () => {
      const prev = {
        ...initialState,
        recentProjects: { ...initialRecentProjectsState, data: seeded },
        deleteProject: { inFlightIds: ['zzz'], error: null }
      }
      const result = homePageReducer(prev, actions.deleteProjectSuccess('zzz'))
      expect(result.recentProjects.data).toEqual(seeded)
    })
  })

  // ── Rename project ─────────────────────────────────────────────────────────

  describe('rename project', () => {
    const apiErr: ApiErrorPayload = { status: 409, message: 'duplicate', fieldErrors: {} }
    const seeded: RecentProjectItem[] = [
      { id: 'a', name: 'Alpha', last_updated: '2026-03-29T00:00:00Z', size: 1 },
      { id: 'b', name: 'Beta', last_updated: '2026-03-28T00:00:00Z', size: 2 }
    ]

    it('RENAME_PROJECT sets loading, stores projectId and clears error', () => {
      const prev = {
        ...initialState,
        renameProject: { loading: false, projectId: null, error: apiErr, success: true }
      }
      const result = homePageReducer(prev, actions.renameProject({ projectId: 'a', name: 'A2' }))
      expect(result.renameProject.loading).toBe(true)
      expect(result.renameProject.projectId).toBe('a')
      expect(result.renameProject.error).toBeNull()
      expect(result.renameProject.success).toBe(false)
    })

    it('RENAME_PROJECT_SUCCESS updates recent project name and marks success', () => {
      const prev = {
        ...initialState,
        recentProjects: { ...initialRecentProjectsState, data: seeded },
        renameProject: { loading: true, projectId: 'a', error: null, success: false }
      }
      const result = homePageReducer(prev, actions.renameProjectSuccess('a', 'Alpha Two'))
      expect(result.renameProject.loading).toBe(false)
      expect(result.renameProject.projectId).toBeNull()
      expect(result.renameProject.success).toBe(true)
      expect(result.recentProjects.data.find((p) => p.id === 'a')?.name).toBe('Alpha Two')
    })

    it('RENAME_PROJECT_FAILURE stores the error and clears loading', () => {
      const prev = {
        ...initialState,
        renameProject: { loading: true, projectId: 'a', error: null, success: false }
      }
      const result = homePageReducer(prev, actions.renameProjectFailure('a', apiErr))
      expect(result.renameProject.loading).toBe(false)
      expect(result.renameProject.projectId).toBe('a')
      expect(result.renameProject.error).toEqual(apiErr)
      expect(result.renameProject.success).toBe(false)
    })

    it('RESET_RENAME_PROJECT returns rename slice to initial state', () => {
      const prev = {
        ...initialState,
        renameProject: { loading: true, projectId: 'a', error: apiErr, success: true }
      }
      const result = homePageReducer(prev, actions.resetRenameProject())
      expect(result.renameProject).toEqual(initialRenameProjectState)
    })
  })

  // ── Immutability guard (immer) ──────────────────────────────────────────────

  it('does not mutate the initial state when reducing several actions', () => {
    homePageReducer(initialState, actions.createProject({ name: 'x', latitude: 0, longitude: 0 }))
    homePageReducer(initialState, actions.deleteProject({ projectId: 'y', name: 'Project A' }))
    homePageReducer(initialState, actions.renameProject({ projectId: 'y', name: 'Y' }))
    expect(initialState.createProject).toEqual(initialCreateProjectState)
    expect(initialState.deleteProject).toEqual(initialDeleteProjectState)
    expect(initialState.renameProject).toEqual(initialRenameProjectState)
  })
})
