import { call, put, select } from 'redux-saga/effects'
import { selectActiveProjectId, selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import {
  abortObjectGeometry,
  fetchObjectGeometryBinary,
  isGeometryAborted
} from '../api/geometry'
import type { PrimitiveInfo, SceneObject } from '../models/types'
import * as actions from '../store/actions'
import { loadObjectGeometryWorker } from '../store/saga'
import {
  clearSceneCache,
  getObjectPrimitives,
  removeObjectPrimitives,
  setObjectPrimitives
} from '../store/sceneCache'

// Two races the app hit for real, both rooted in the same thing: a binary
// geometry fetch is slow, nothing cancels it, and it used to write its result
// into the scene no matter what had happened in the meantime.

const OBJ = 28
const testObject: SceneObject = { id: OBJ, name: 'Ground.001', object_type_id: 1 }

const primitives: PrimitiveInfo[] = [
  {
    uuid: 1,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }
    ],
    color: { r: 0.5, g: 0.4, b: 0.3 }
  }
]

/** Drive the worker up to the point where the download is in flight. */
function startFetch(): Generator {
  const gen = loadObjectGeometryWorker(actions.loadObjectGeometry(testObject))
  expect(gen.next().value).toEqual(select(selectActiveProjectId))
  expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
  // The tree row starts spinning before the request goes out.
  expect(gen.next('scen-1').value).toEqual(put(actions.objectGeometryPending(OBJ)))
  expect(gen.next().value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', OBJ))
  return gen
}

beforeEach(() => {
  clearSceneCache()
})

describe('geometry that lands too late', () => {
  it('drops the result when the eye was closed while it was downloading', () => {
    const gen = startFetch()

    // The user closes the eye. The download cannot be cancelled, so it is still
    // running — but its result is no longer wanted.
    removeObjectPrimitives(OBJ)

    // Before the fix this wrote the geometry back and dispatched
    // objectGeometryCached, so the object reappeared in the viewport while its
    // toggle still read "hidden" — a state the user could only escape by
    // toggling twice.
    expect(gen.next(primitives).done).toBe(true)
    expect(getObjectPrimitives(OBJ)).toBeUndefined()
  })

  it('drops the result when the whole scene was cleared while it was downloading', () => {
    const gen = startFetch()

    // Switching project clears the cache. A fetch started under the old project
    // must not land in the new one — and this object has no generation entry of
    // its own yet, which is why the clear carries its own epoch.
    clearSceneCache()

    expect(gen.next(primitives).done).toBe(true)
    expect(getObjectPrimitives(OBJ)).toBeUndefined()
  })

  it('still writes the result when nothing happened while it was downloading', () => {
    const gen = startFetch()

    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, OBJ, primitives))
    expect(gen.next().value).toEqual(put(actions.objectGeometryLoaded(OBJ)))
    expect(gen.next().done).toBe(true)
  })
})

describe('in-flight sharing vs. edits', () => {
  // Resolves only when the test says so, so a request can be observed while it
  // is still on the wire — which is the whole situation under test. Rejects with
  // an AbortError the moment its signal fires, the way a real fetch does.
  function pendingFetch(): {
    mock: ReturnType<typeof vi.fn>
    settle: () => void
  } {
    const finish: Array<() => void> = []
    const mock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.')
            err.name = 'AbortError'
            reject(err)
          })
          finish.push(() =>
            resolve({
              ok: true,
              status: 200,
              // count = 0 — the shortest buffer parseBinaryPrimitives accepts.
              arrayBuffer: async () => new ArrayBuffer(4)
            } as unknown as Response)
          )
        })
    )
    return { mock, settle: () => finish.forEach((f) => f()) }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shares ONE request between two callers asking at the same moment', async () => {
    const { mock, settle } = pendingFetch()
    vi.stubGlobal('fetch', mock)

    const both = Promise.all([
      fetchObjectGeometryBinary('proj-1', 'scen-1', OBJ),
      fetchObjectGeometryBinary('proj-1', 'scen-1', OBJ)
    ])
    settle()
    await both

    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('starts a NEW request after an edit cancels the one in flight', async () => {
    const { mock, settle } = pendingFetch()
    vi.stubGlobal('fetch', mock)

    const first = fetchObjectGeometryBinary('proj-1', 'scen-1', OBJ)
    const firstOutcome = first.catch((err) => err)

    // The user saves the ground's properties while that download is running. The
    // bytes the backend would return have changed, so the running request is no
    // longer the right answer to the question being asked.
    abortObjectGeometry(OBJ)

    const second = fetchObjectGeometryBinary('proj-1', 'scen-1', OBJ)
    settle()

    // Before the fix the save joined the request that was already running and
    // was handed the geometry from BEFORE the edit, so the viewport kept the old
    // shape and the save looked like it had done nothing.
    expect(mock).toHaveBeenCalledTimes(2)
    await expect(second).resolves.toEqual([])
    expect(isGeometryAborted(await firstOutcome)).toBe(true)
  })

  it('actually cancels the superseded download rather than letting it finish', async () => {
    const { mock, settle } = pendingFetch()
    vi.stubGlobal('fetch', mock)

    const first = fetchObjectGeometryBinary('proj-1', 'scen-1', OBJ)
    const firstOutcome = first.catch((err) => err)

    const signal = mock.mock.calls[0][1].signal as AbortSignal
    expect(signal.aborted).toBe(false)

    // A 1000×1000 ground is 228 MB. Discarding the result on arrival was not
    // enough — the transfer has to stop, or it keeps competing for the network
    // and the backend's per-scenario lock for bytes nobody will read.
    abortObjectGeometry(OBJ)

    expect(signal.aborted).toBe(true)
    expect(isGeometryAborted(await firstOutcome)).toBe(true)

    settle()
  })

  it('lets the replacement keep sharing after the cancelled request settles', async () => {
    const { mock, settle } = pendingFetch()
    vi.stubGlobal('fetch', mock)

    const first = fetchObjectGeometryBinary('proj-1', 'scen-1', OBJ)
    const firstOutcome = first.catch((err) => err)
    abortObjectGeometry(OBJ)

    const second = fetchObjectGeometryBinary('proj-1', 'scen-1', OBJ)
    await firstOutcome

    // The abandoned request unwinds last. Its cleanup must not evict the entry
    // that replaced it, or every caller afterwards starts a download of its own.
    const third = fetchObjectGeometryBinary('proj-1', 'scen-1', OBJ)
    settle()
    await Promise.all([second, third])

    expect(mock).toHaveBeenCalledTimes(2)
  })
})
