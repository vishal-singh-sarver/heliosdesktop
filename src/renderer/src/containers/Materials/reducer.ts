import { produce } from 'immer'
import {
  FETCH_STATUS,
  FETCH_STATUS_SUCCESS,
  FETCH_STATUS_FAILURE,
  SSE_CONNECT,
  SSE_EVENT,
  SSE_DISCONNECT
} from './constants'
import type { MaterialsAction } from './actions'
import type { MaterialsStatus, MaterialsStreamEvent } from './types'

export type { MaterialsStatus, MaterialsStreamEvent }

// ── State ──────────────────────────────────────────────────────────────────────

export interface MaterialsState {
  status: MaterialsStatus | null
  loading: boolean
  error: string | null
  streaming: boolean
  streamLog: MaterialsStreamEvent[]
}

export const initialState: MaterialsState = {
  status: null,
  loading: false,
  error: null,
  streaming: false,
  streamLog: []
}

// ── Reducer ────────────────────────────────────────────────────────────────────

const materialsReducer = (
  state: MaterialsState = initialState,
  action: MaterialsAction
): MaterialsState =>
  produce(state, (draft) => {
    switch (action.type) {
      case FETCH_STATUS:
        draft.loading = true
        draft.error = null
        break

      case FETCH_STATUS_SUCCESS:
        draft.loading = false
        draft.status = action.payload
        break

      case FETCH_STATUS_FAILURE:
        draft.loading = false
        draft.error = action.payload
        break

      case SSE_CONNECT:
        draft.streaming = true
        draft.streamLog = []
        break

      case SSE_EVENT:
        draft.streamLog.push(action.payload)
        break

      case SSE_DISCONNECT:
        draft.streaming = false
        break
    }
  })

export default materialsReducer
