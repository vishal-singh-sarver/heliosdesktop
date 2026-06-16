import { call, put, takeLatest } from 'redux-saga/effects'
import materialsSaga, { fetchStatusWorker } from '../saga'
import { api } from 'utils/api'
import * as actions from '../actions'
import { FETCH_STATUS, SSE_CONNECT } from '../constants'

describe('fetchStatusWorker', () => {
  it('calls GET /api/status then puts fetchStatusSuccess', () => {
    const gen = fetchStatusWorker()
    expect(gen.next().value).toEqual(call(api.get, '/api/status'))
    const status = { version: '1.0.0', uptime: 0 }
    expect(gen.next(status).value).toEqual(put(actions.fetchStatusSuccess(status)))
    expect(gen.next().done).toBe(true)
  })

  it('puts fetchStatusFailure when fetch throws', () => {
    const gen = fetchStatusWorker()
    gen.next() // advance to call
    const error = new Error('Network error')
    expect(gen.throw(error).value).toEqual(put(actions.fetchStatusFailure('Network error')))
  })
})

describe('materialsSaga', () => {
  it('watches FETCH_STATUS with takeLatest', () => {
    const gen = materialsSaga()
    expect(gen.next().value).toEqual(takeLatest(FETCH_STATUS, fetchStatusWorker))
  })

  it('watches SSE_CONNECT with takeLatest as second effect', () => {
    const gen = materialsSaga()
    gen.next() // FETCH_STATUS watcher
    const secondEffect = gen.next().value as any
    expect(JSON.stringify(secondEffect)).toContain(SSE_CONNECT)
  })
})
