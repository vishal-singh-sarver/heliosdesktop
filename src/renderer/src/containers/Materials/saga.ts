import { call, put, race, take, takeLatest } from 'redux-saga/effects'
import { api } from 'utils/api'
import { createSseChannel } from 'utils/sse'
import type { SseMessage } from 'utils/sse'
import * as actions from './actions'
import { FETCH_STATUS, SSE_CONNECT, SSE_DISCONNECT } from './constants'
import type { MaterialsStatus } from './types'

// ── REST worker ────────────────────────────────────────────────────────────────

export function* fetchStatusWorker(): Generator {
  try {
    const status = (yield call(api.get<MaterialsStatus>, '/api/status')) as MaterialsStatus
    yield put(actions.fetchStatusSuccess(status))
  } catch (err) {
    yield put(actions.fetchStatusFailure((err as Error).message))
  }
}

// ── SSE worker ─────────────────────────────────────────────────────────────────

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

// ── Root watcher ───────────────────────────────────────────────────────────────

export default function* materialsSaga(): Generator {
  yield takeLatest(FETCH_STATUS, fetchStatusWorker)
  yield takeLatest(SSE_CONNECT, sseWorker)
}
