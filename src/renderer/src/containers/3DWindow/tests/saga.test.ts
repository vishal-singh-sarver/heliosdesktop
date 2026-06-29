import { LIST_NODES_SUCCEEDED } from 'containers/Geometry/constants'
import { selectLoadStatus } from 'containers/Geometry/selectors'
import { selectActiveProjectId, selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import { call, delay, put, race, select, take, takeLeading } from 'redux-saga/effects'
import { fetchObjectGeometryBinary } from '../api/geometry'
import type { PrimitiveInfo, SceneObject } from '../models/types'
import * as actions from '../store/actions'
import { LOAD_OBJECT_GEOMETRY_REQUESTED } from '../store/constants'
import threeDWindowSaga, { loadObjectGeometryWorker, loadSceneWorker } from '../store/saga'
import { selectSceneObjects } from '../store/selectors'
import { clearSceneCache, setObjectPrimitives } from '../store/sceneCache'
import { clearTextureCache } from '../ui/textureCache'

const testObject: SceneObject = { id: 28, name: 'Ground.001', object_type_id: 1 }

describe('loadObjectGeometryWorker', () => {
  it('fetches binary geometry, caches it, and dispatches objectGeometryLoaded', () => {
    const gen = loadObjectGeometryWorker(actions.loadObjectGeometry(testObject))

    expect(gen.next().value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))

    expect(gen.next('scen-1').value).toEqual(
      call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28)
    )

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
    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, 28, primitives))

    expect(gen.next().value).toEqual(put(actions.objectGeometryLoaded(28)))
    expect(gen.next().done).toBe(true)
  })

  it('returns early when no active project/scenario is selected', () => {
    const gen = loadObjectGeometryWorker(actions.loadObjectGeometry(testObject))

    gen.next() // select project id
    gen.next(null) // project id was null

    expect(gen.next(null).done).toBe(true)
  })
})

describe('loadSceneWorker', () => {
  it('settles an empty success when no active project/scenario is selected', () => {
    const gen = loadSceneWorker()

    expect(gen.next().value).toEqual(call(clearSceneCache))
    expect(gen.next().value).toEqual(call(clearTextureCache))
    expect(gen.next().value).toEqual(select(selectActiveProjectId))
    expect(gen.next(null).value).toEqual(select(selectActiveScenarioId))

    // projectId was null → clear the loader instead of stranding loading=true.
    expect(gen.next('scen-1').value).toEqual(put(actions.loadSceneSucceeded()))
    expect(gen.next().done).toBe(true)
  })

  it('settles an empty scene without waiting when the node tree is already loaded', () => {
    const gen = loadSceneWorker()

    gen.next() // clearSceneCache
    gen.next() // clearTextureCache
    gen.next() // select project id
    gen.next('proj-1') // select scenario id
    expect(gen.next('scen-1').value).toEqual(select(selectSceneObjects))

    // Empty scene → check the node-tree load status before deciding to wait.
    expect(gen.next([]).value).toEqual(select(selectLoadStatus))

    // Already 'loaded' → skip the race and succeed immediately (no 30s hang).
    expect(gen.next('loaded').value).toEqual(put(actions.loadSceneSucceeded()))
    expect(gen.next().done).toBe(true)
  })

  it('waits for the node tree while a list is genuinely in flight', () => {
    const gen = loadSceneWorker()

    gen.next() // clearSceneCache
    gen.next() // clearTextureCache
    gen.next() // select project id
    gen.next('proj-1') // select scenario id
    gen.next('scen-1') // select scene objects
    gen.next([]) // select load status

    // 'loading' → race the LIST_NODES_SUCCEEDED against a timeout.
    expect(gen.next('loading').value).toEqual(
      race({ nodes: take(LIST_NODES_SUCCEEDED), timeout: delay(30000) })
    )

    // After the race, re-read objects; still empty → succeed.
    expect(gen.next({ nodes: {} }).value).toEqual(select(selectSceneObjects))
    expect(gen.next([]).value).toEqual(put(actions.loadSceneSucceeded()))
    expect(gen.next().done).toBe(true)
  })
})

describe('threeDWindowSaga', () => {
  it('watches LOAD_OBJECT_GEOMETRY_REQUESTED with takeLeading', () => {
    const gen = threeDWindowSaga()
    expect(gen.next().value).toEqual(
      takeLeading(LOAD_OBJECT_GEOMETRY_REQUESTED, loadObjectGeometryWorker)
    )
  })
})
