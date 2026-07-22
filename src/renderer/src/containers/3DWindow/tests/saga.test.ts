import { LIST_NODES_SUCCEEDED } from 'containers/Geometry/constants'
import { assignMaterialSucceeded } from 'containers/Geometry/actions'
import { selectLoadStatus, selectNodesById } from 'containers/Geometry/selectors'
import type { GeoNode } from 'containers/Geometry/types'
import { selectActiveProjectId, selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import { call, delay, put, race, select, take, takeLatest, takeLeading } from 'redux-saga/effects'
import { fetchObjectGeometryBinary } from '../api/geometry'
import type { PrimitiveInfo, SceneObject } from '../models/types'
import * as actions from '../store/actions'
import { LOAD_OBJECT_GEOMETRY_REQUESTED } from '../store/constants'
import threeDWindowSaga, {
  loadObjectGeometryWorker,
  loadSceneWorker,
  onMaterialAssigned,
  onMaterialSaved,
  onNodesListed
} from '../store/saga'
import { selectSceneLoad, selectSceneObjectIds, selectSceneObjects } from '../store/selectors'
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

describe('onNodesListed', () => {
  it('re-triggers loadScene when a prior load bailed (objects exist, cache empty, not loading)', () => {
    const gen = onNodesListed()

    expect(gen.next().value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
    expect(gen.next('scen-1').value).toEqual(select(selectSceneObjects))
    // Tree now lists an object…
    expect(gen.next([testObject]).value).toEqual(select(selectSceneObjectIds))
    // …but the scene cache is still empty (earlier loadScene bailed)…
    expect(gen.next([]).value).toEqual(select(selectSceneLoad))
    // …and no load is in flight → re-run the scene load.
    expect(gen.next({ loading: false }).value).toEqual(put(actions.loadScene()))
    expect(gen.next().done).toBe(true)
  })

  it('does nothing when there is no active project/scenario', () => {
    const gen = onNodesListed()
    gen.next() // select project id
    gen.next(null) // project id was null
    expect(gen.next(null).done).toBe(true)
  })

  it('does nothing for an empty scenario (no objects to render)', () => {
    const gen = onNodesListed()
    gen.next() // select project id
    gen.next('proj-1') // select scenario id
    gen.next('scen-1') // select scene objects
    expect(gen.next([]).done).toBe(true)
  })

  it('skips re-loading when the scene cache is already populated', () => {
    const gen = onNodesListed()
    gen.next() // select project id
    gen.next('proj-1') // select scenario id
    gen.next('scen-1') // select scene objects
    gen.next([testObject]) // select scene object ids
    // Cache already holds the object → the scene is loaded; don't refetch.
    expect(gen.next([28]).done).toBe(true)
  })

  it('skips re-loading while a scene load is already in flight', () => {
    const gen = onNodesListed()
    gen.next() // select project id
    gen.next('proj-1') // select scenario id
    gen.next('scen-1') // select scene objects
    gen.next([testObject]) // select scene object ids
    gen.next([]) // select scene load
    // A load is already running → let it finish, don't start another.
    expect(gen.next({ loading: true }).done).toBe(true)
  })
})

describe('onMaterialAssigned', () => {
  const visibleNode = (id: string): GeoNode => ({
    id,
    name: `Ground.${id}`,
    kind: 'ground',
    parentId: null,
    childIds: [],
    expanded: false,
    visibleInViewport: true,
    renderEnabled: true,
    modelVisibility: {}
  })

  it('re-fetches and re-caches the binary geometry of each restyled object', () => {
    const gen = onMaterialAssigned(assignMaterialSucceeded(['28'], '7', 'Grass'))
    expect(gen.next().value).toEqual(select(selectNodesById))

    // Enter the loop with a visible node → fetch + cache its geometry.
    expect(gen.next({ '28': visibleNode('28') }).value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
    expect(gen.next('scen-1').value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28))

    const primitives: PrimitiveInfo[] = []
    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, 28, primitives))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(28)))
    expect(gen.next().done).toBe(true)
  })

  it('skips a hidden object so an assignment never un-hides it', () => {
    const gen = onMaterialAssigned(assignMaterialSucceeded(['28'], '7', 'Grass'))
    gen.next() // select nodesById
    const hidden = { ...visibleNode('28'), visibleInViewport: false }
    // Node is hidden → no fetch, generator completes.
    expect(gen.next({ '28': hidden }).done).toBe(true)
  })
})

describe('onMaterialSaved', () => {
  it('re-fetches every shown object so a material edit shows without a refresh', () => {
    const gen = onMaterialSaved()
    expect(gen.next().value).toEqual(select(selectSceneObjectIds))

    // One shown object → re-fetch + re-cache its (possibly restyled) geometry.
    expect(gen.next([28]).value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
    expect(gen.next('scen-1').value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28))

    const primitives: PrimitiveInfo[] = []
    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, 28, primitives))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(28)))
    expect(gen.next().done).toBe(true)
  })

  it('does nothing when the scene has no shown objects', () => {
    const gen = onMaterialSaved()
    gen.next() // select selectSceneObjectIds
    expect(gen.next([]).done).toBe(true)
  })
})

describe('threeDWindowSaga', () => {
  it('watches LOAD_OBJECT_GEOMETRY_REQUESTED with takeLeading', () => {
    const gen = threeDWindowSaga()
    expect(gen.next().value).toEqual(
      takeLeading(LOAD_OBJECT_GEOMETRY_REQUESTED, loadObjectGeometryWorker)
    )
  })

  it('watches LIST_NODES_SUCCEEDED with onNodesListed (boot/refresh race safety net)', () => {
    const gen = threeDWindowSaga()
    gen.next() // takeLeading LOAD_OBJECT_GEOMETRY_REQUESTED
    gen.next() // takeLatest LOAD_SCENE_REQUESTED
    gen.next() // takeLatest SET_ACTIVE_SCENARIO
    expect(gen.next().value).toEqual(takeLatest(LIST_NODES_SUCCEEDED, onNodesListed))
  })
})
