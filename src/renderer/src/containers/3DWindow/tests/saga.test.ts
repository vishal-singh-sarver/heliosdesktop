import { selectActiveProjectId, selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import { call, put, select, takeLeading } from 'redux-saga/effects'
import { fetchObjectGeometryBinary } from '../api/geometry'
import type { PrimitiveInfo, SceneObject } from '../models/types'
import * as actions from '../store/actions'
import { LOAD_OBJECT_GEOMETRY_REQUESTED } from '../store/constants'
import threeDWindowSaga, { loadObjectGeometryWorker } from '../store/saga'
import { setObjectPrimitives } from '../store/sceneCache'

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

describe('threeDWindowSaga', () => {
  it('watches LOAD_OBJECT_GEOMETRY_REQUESTED with takeLeading', () => {
    const gen = threeDWindowSaga()
    expect(gen.next().value).toEqual(
      takeLeading(LOAD_OBJECT_GEOMETRY_REQUESTED, loadObjectGeometryWorker)
    )
  })
})
