import * as actions from '../actions'
import {
  FETCH_STATUS,
  FETCH_STATUS_SUCCESS,
  FETCH_STATUS_FAILURE,
  SSE_CONNECT,
  SSE_EVENT,
  SSE_DISCONNECT
} from '../constants'
import type { MaterialsStatus, MaterialsStreamEvent } from '../types'

describe('Materials actions', () => {
  it('fetchStatus has correct type', () => {
    expect(actions.fetchStatus()).toEqual({ type: FETCH_STATUS })
  })

  it('fetchStatusSuccess carries payload', () => {
    const payload: MaterialsStatus = { version: '1.0.0', uptime: 0 }
    expect(actions.fetchStatusSuccess(payload)).toEqual({ type: FETCH_STATUS_SUCCESS, payload })
  })

  it('fetchStatusFailure carries error message', () => {
    expect(actions.fetchStatusFailure('oops')).toEqual({
      type: FETCH_STATUS_FAILURE,
      payload: 'oops'
    })
  })

  it('sseConnect has correct type', () => {
    expect(actions.sseConnect()).toEqual({ type: SSE_CONNECT })
  })

  it('sseEvent carries payload', () => {
    const payload: MaterialsStreamEvent = { type: 'ping', data: null, timestamp: 1 }
    expect(actions.sseEvent(payload)).toEqual({ type: SSE_EVENT, payload })
  })

  it('sseDisconnect has correct type', () => {
    expect(actions.sseDisconnect()).toEqual({ type: SSE_DISCONNECT })
  })
})
