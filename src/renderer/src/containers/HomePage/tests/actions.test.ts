import * as actions from '../actions'
import {
  FETCH_STATUS,
  FETCH_STATUS_SUCCESS,
  FETCH_STATUS_FAILURE,
  SSE_CONNECT,
  SSE_EVENT,
  SSE_DISCONNECT,
  CREATE_PROJECT,
  CREATE_PROJECT_SUCCESS,
  CREATE_PROJECT_FAILURE,
  RESET_CREATE_PROJECT,
  FETCH_RECENT_PROJECTS,
  FETCH_RECENT_PROJECTS_SUCCESS,
  FETCH_RECENT_PROJECTS_FAILURE,
  DELETE_PROJECT,
  DELETE_PROJECT_SUCCESS,
  DELETE_PROJECT_FAILURE,
  RENAME_PROJECT,
  RENAME_PROJECT_SUCCESS,
  RENAME_PROJECT_FAILURE,
  RESET_RENAME_PROJECT
} from '../constants'
import type {
  AppStatus,
  StreamEvent,
  CreateProjectPayload,
  CreateProjectResponse,
  RecentProjectItem,
  ApiErrorPayload
} from '../types'

describe('HomePage actions', () => {
  // ── REST ────────────────────────────────────────────────────────────────────

  describe('status', () => {
    it('fetchStatus has correct type', () => {
      expect(actions.fetchStatus()).toEqual({ type: FETCH_STATUS })
    })

    it('fetchStatusSuccess carries payload', () => {
      const payload: AppStatus = { version: '1.2.3', uptime: 42 }
      expect(actions.fetchStatusSuccess(payload)).toEqual({ type: FETCH_STATUS_SUCCESS, payload })
    })

    it('fetchStatusFailure carries error message', () => {
      expect(actions.fetchStatusFailure('timeout')).toEqual({
        type: FETCH_STATUS_FAILURE,
        payload: 'timeout'
      })
    })
  })

  // ── SSE ─────────────────────────────────────────────────────────────────────

  describe('SSE', () => {
    it('sseConnect has correct type', () => {
      expect(actions.sseConnect()).toEqual({ type: SSE_CONNECT })
    })

    it('sseEvent carries payload', () => {
      const payload: StreamEvent = { type: 'ping', data: { ok: true }, timestamp: 1000 }
      expect(actions.sseEvent(payload)).toEqual({ type: SSE_EVENT, payload })
    })

    it('sseDisconnect has correct type', () => {
      expect(actions.sseDisconnect()).toEqual({ type: SSE_DISCONNECT })
    })
  })

  // ── Create project ──────────────────────────────────────────────────────────

  describe('create project', () => {
    it('createProject carries the payload', () => {
      const payload: CreateProjectPayload = { name: 'Alpha', latitude: 10, longitude: 20 }
      expect(actions.createProject(payload)).toEqual({ type: CREATE_PROJECT, payload })
    })

    it('createProjectSuccess carries the response data', () => {
      const data: CreateProjectResponse = {
        success: true,
        project_id: 'uuid-1',
        name: 'Alpha',
        latitude: 10,
        longitude: 20,
        utc_offset: 0,
        session_id: 'sess-1'
      }
      expect(actions.createProjectSuccess(data)).toEqual({
        type: CREATE_PROJECT_SUCCESS,
        payload: data
      })
    })

    it('createProjectFailure carries an ApiErrorPayload', () => {
      const err: ApiErrorPayload = {
        status: 409,
        message: 'duplicate',
        fieldErrors: { name: 'dup' }
      }
      expect(actions.createProjectFailure(err)).toEqual({
        type: CREATE_PROJECT_FAILURE,
        payload: err
      })
    })

    it('resetCreateProject has correct type and no payload', () => {
      expect(actions.resetCreateProject()).toEqual({ type: RESET_CREATE_PROJECT })
    })
  })

  // ── Recent projects ─────────────────────────────────────────────────────────

  describe('recent projects', () => {
    it('fetchRecentProjects has correct type', () => {
      expect(actions.fetchRecentProjects()).toEqual({ type: FETCH_RECENT_PROJECTS })
    })

    it('fetchRecentProjectsSuccess carries the list', () => {
      const list: RecentProjectItem[] = [
        { id: 'a', name: 'Alpha', last_updated: '2026-03-29T00:00:00Z', size: 1024 }
      ]
      expect(actions.fetchRecentProjectsSuccess(list)).toEqual({
        type: FETCH_RECENT_PROJECTS_SUCCESS,
        payload: list
      })
    })

    it('fetchRecentProjectsFailure carries an ApiErrorPayload', () => {
      const err: ApiErrorPayload = { status: 500, message: 'boom', fieldErrors: {} }
      expect(actions.fetchRecentProjectsFailure(err)).toEqual({
        type: FETCH_RECENT_PROJECTS_FAILURE,
        payload: err
      })
    })
  })

  // ── Delete project ──────────────────────────────────────────────────────────

  describe('delete project', () => {
    it('deleteProject carries the projectId AND the name in payload', () => {
      // The name rides along so the outcome toast can report which project went —
      // after the DELETE lands there is nothing left in the store to look it up in.
      expect(actions.deleteProject({ projectId: 'uuid-1', name: 'Coastal' })).toEqual({
        type: DELETE_PROJECT,
        payload: { projectId: 'uuid-1', name: 'Coastal' }
      })
    })

    it('deleteProjectSuccess carries the projectId', () => {
      expect(actions.deleteProjectSuccess('uuid-1')).toEqual({
        type: DELETE_PROJECT_SUCCESS,
        payload: { projectId: 'uuid-1' }
      })
    })

    it('deleteProjectFailure carries the projectId and error', () => {
      const err: ApiErrorPayload = { status: 404, message: 'not found', fieldErrors: {} }
      expect(actions.deleteProjectFailure('uuid-1', err)).toEqual({
        type: DELETE_PROJECT_FAILURE,
        payload: { projectId: 'uuid-1', error: err }
      })
    })
  })

  // ── Rename project ─────────────────────────────────────────────────────────

  describe('rename project', () => {
    it('renameProject carries projectId + name', () => {
      expect(actions.renameProject({ projectId: 'uuid-1', name: 'New Name' })).toEqual({
        type: RENAME_PROJECT,
        payload: { projectId: 'uuid-1', name: 'New Name' }
      })
    })

    it('renameProjectSuccess carries projectId + name', () => {
      expect(actions.renameProjectSuccess('uuid-1', 'New Name')).toEqual({
        type: RENAME_PROJECT_SUCCESS,
        payload: { projectId: 'uuid-1', name: 'New Name' }
      })
    })

    it('renameProjectFailure carries projectId and error', () => {
      const err: ApiErrorPayload = { status: 409, message: 'duplicate', fieldErrors: {} }
      expect(actions.renameProjectFailure('uuid-1', err)).toEqual({
        type: RENAME_PROJECT_FAILURE,
        payload: { projectId: 'uuid-1', error: err }
      })
    })

    it('resetRenameProject has correct type', () => {
      expect(actions.resetRenameProject()).toEqual({ type: RESET_RENAME_PROJECT })
    })
  })
})
