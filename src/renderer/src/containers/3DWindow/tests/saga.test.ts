import { LIST_NODES_SUCCEEDED } from 'containers/Geometry/constants'
import {
  assignMaterialSucceeded,
  toggleViewport,
  unassignMaterialSucceeded,
  visibilitySyncFailed
} from 'containers/Geometry/actions'
import { deleteParameterGroupSucceeded,
  removeMaterial, saveParameterGroupSucceeded } from 'containers/Materials/actions'
import { selectLoadStatus, selectNodesById } from 'containers/Geometry/selectors'
import type { GeoNode } from 'containers/Geometry/types'
import { selectActiveProjectId, selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import { call, delay, put, race, select, take, takeLatest, takeLeading } from 'redux-saga/effects'
import { fetchObjectGeometryBinary } from '../api/geometry'
import type { PrimitiveInfo, SceneObject } from '../models/types'
import * as actions from '../store/actions'
import { LOAD_OBJECT_GEOMETRY_REQUESTED, LOAD_SCENE_REQUESTED } from '../store/constants'
import threeDWindowSaga, {
  loadObjectGeometryWorker,
  loadSceneWorker,
  onMaterialAssigned,
  onMaterialDeleted,
  onMaterialSaved,
  onMaterialTypeDeleted,
  onMaterialUnassigned,
  onViewportToggled,
  onVisibilitySyncFailed
} from '../store/saga'
import { selectSceneObjects } from '../store/selectors'
import { clearSceneCache, removeObjectPrimitives, setObjectPrimitives } from '../store/sceneCache'
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

    // Already 'loaded' → skip the race and succeed immediately, so an empty
    // project does not sit on the 30s timeout.
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

    // 'loading' → the tree fetch is still running, so race it against a cap.
    // Nothing else orders these now that each panel loads on its own mount.
    expect(gen.next('loading').value).toEqual(
      race({ nodes: take(LIST_NODES_SUCCEEDED), timeout: delay(30000) })
    )

    // After the race, re-read objects; still empty → succeed.
    expect(gen.next({ nodes: {} }).value).toEqual(select(selectSceneObjects))
    expect(gen.next([]).value).toEqual(put(actions.loadSceneSucceeded()))
    expect(gen.next().done).toBe(true)
  })

  it('fetches objects one at a time, reporting each as it lands', () => {
    const second: SceneObject = { id: 29, name: 'Ground.002', object_type_id: 1 }
    const gen = loadSceneWorker()

    gen.next() // clearSceneCache
    gen.next() // clearTextureCache
    gen.next() // select project id
    gen.next('proj-1') // select scenario id
    gen.next('scen-1') // select scene objects

    // Sequential, not all() — the backend serializes these on one lock anyway,
    // and this is what makes per-object progress and clean cancellation work.
    expect(gen.next([testObject, second]).value).toEqual(
      call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28)
    )
    const first: PrimitiveInfo[] = []
    expect(gen.next(first).value).toEqual(call(setObjectPrimitives, 28, first))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(28)))

    // Only now does the second object start.
    expect(gen.next().value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 29))
    const rest: PrimitiveInfo[] = []
    expect(gen.next(rest).value).toEqual(call(setObjectPrimitives, 29, rest))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(29)))

    expect(gen.next().value).toEqual(put(actions.loadSceneSucceeded()))
    expect(gen.next().done).toBe(true)
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
    const gen = onMaterialAssigned(assignMaterialSucceeded('p', 's', ['28'], '7', 'Grass'))
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
    const gen = onMaterialAssigned(assignMaterialSucceeded('p', 's', ['28'], '7', 'Grass'))
    gen.next() // select nodesById
    const hidden = { ...visibleNode('28'), visibleInViewport: false }
    // Node is hidden → no fetch, generator completes.
    expect(gen.next({ '28': hidden }).done).toBe(true)
  })
})

describe('onMaterialSaved / onMaterialDeleted (surgical by group)', () => {
  const withGroups = (id: string, materialGroupIds: string[], visible = true): GeoNode => ({
    id,
    name: `Ground.${id}`,
    kind: 'ground',
    parentId: null,
    childIds: [],
    expanded: false,
    visibleInViewport: visible,
    renderEnabled: true,
    modelVisibility: {},
    materialGroupIds
  })

  // 28 uses group 7 (re-fetch), 29 uses a different group (skip), 30 uses 7 but is
  // hidden (skip) — so only 28's binary is re-fetched.
  const mixedNodes = {
    '28': withGroups('28', ['7']),
    '29': withGroups('29', ['9']),
    '30': withGroups('30', ['7'], false)
  }

  it('onMaterialSaved re-fetches only the shown objects using the saved group', () => {
    const gen = onMaterialSaved(saveParameterGroupSucceeded('7', 1)) // materialId = group id
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next(mixedNodes).value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
    expect(gen.next('scen-1').value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28))
    const primitives: PrimitiveInfo[] = []
    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, 28, primitives))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(28)))
    // 29 (other group) and 30 (hidden) are skipped → done, no more fetches.
    expect(gen.next().done).toBe(true)
  })

  it('onMaterialSaved does nothing for a material used by no shown object', () => {
    const gen = onMaterialSaved(saveParameterGroupSucceeded('7', 1))
    gen.next() // select nodesById
    expect(gen.next({ '29': withGroups('29', ['9']) }).done).toBe(true)
  })

  // Deleting ONE material type (e.g. the Visualiser) changes how every object
  // using that material looks — the ground loses the texture. Before this, nothing
  // told the scene, so it kept rendering a texture the material no longer had.
  it('onMaterialTypeDeleted re-fetches the shown objects using that material', () => {
    const gen = onMaterialTypeDeleted(deleteParameterGroupSucceeded('7', 1))
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next(mixedNodes).value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
    expect(gen.next('scen-1').value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28))
    const primitives: PrimitiveInfo[] = []
    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, 28, primitives))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(28)))
    // 29 (other material) and 30 (hidden) are left alone.
    expect(gen.next().done).toBe(true)
  })

  it('onMaterialDeleted re-fetches only the shown objects that used the deleted group', () => {
    const gen = onMaterialDeleted(removeMaterial('7')) // id = group id
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next(mixedNodes).value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
    expect(gen.next('scen-1').value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28))
    const primitives: PrimitiveInfo[] = []
    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, 28, primitives))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(28)))
    expect(gen.next().done).toBe(true)
  })
})

// The eye icon must never move the camera. FitToScene re-frames on every
// fitVersion change, and both halves of a hide/show cycle used to bump it —
// so one click threw the user's zoom and pan away twice.
describe('onViewportToggled', () => {
  const leaf = (id: string, visible: boolean): GeoNode => ({
    id,
    name: `Ground.${id}`,
    kind: 'ground',
    parentId: null,
    childIds: [],
    expanded: false,
    visibleInViewport: visible,
    renderEnabled: true,
    modelVisibility: {}
  })

  it('hiding removes the object without re-framing the camera', () => {
    const gen = onViewportToggled(toggleViewport('p', 's', '28'))
    expect(gen.next().value).toEqual(select(selectNodesById))

    const nodes = { '28': leaf('28', false) } // reducer already flipped it off
    expect(gen.next(nodes).value).toEqual(call(removeObjectPrimitives, 28))
    expect(gen.next().value).toEqual(put(actions.objectGeometryRemoved(28)))
    expect(gen.next().done).toBe(true)
  })

  it('un-hiding re-caches the object without re-framing the camera', () => {
    const gen = onViewportToggled(toggleViewport('p', 's', '28'))
    expect(gen.next().value).toEqual(select(selectNodesById))

    const nodes = { '28': leaf('28', true) } // reducer already flipped it on
    expect(gen.next(nodes).value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
    expect(gen.next('scen-1').value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28))

    const primitives: PrimitiveInfo[] = []
    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, 28, primitives))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(28)))
    expect(gen.next().done).toBe(true)
  })
})

// A failed visibility PATCH reverts the flip. Undoing our cache change must not
// move the camera either — the user never asked for a new view.
describe('onVisibilitySyncFailed', () => {
  const leaf = (id: string, visible: boolean): GeoNode => ({
    id,
    name: `Ground.${id}`,
    kind: 'ground',
    parentId: null,
    childIds: [],
    expanded: false,
    visibleInViewport: visible,
    renderEnabled: true,
    modelVisibility: {}
  })

  it('ignores non-viewport fields', () => {
    const gen = onVisibilitySyncFailed(visibilitySyncFailed('p', 's', '28', 'render', 'boom'))
    expect(gen.next().done).toBe(true)
  })

  it('re-fetches without re-framing when a failed hide was reverted', () => {
    const gen = onVisibilitySyncFailed(visibilitySyncFailed('p', 's', '28', 'viewport', 'boom'))
    expect(gen.next().value).toEqual(select(selectNodesById))

    const nodes = { '28': leaf('28', true) } // reverted back to visible
    expect(gen.next(nodes).value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
    expect(gen.next('scen-1').value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28))

    const primitives: PrimitiveInfo[] = []
    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, 28, primitives))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(28)))
    expect(gen.next().done).toBe(true)
  })

  it('removes without re-framing when a failed un-hide was reverted', () => {
    const gen = onVisibilitySyncFailed(visibilitySyncFailed('p', 's', '28', 'viewport', 'boom'))
    expect(gen.next().value).toEqual(select(selectNodesById))

    const nodes = { '28': leaf('28', false) } // reverted back to hidden
    expect(gen.next(nodes).value).toEqual(call(removeObjectPrimitives, 28))
    expect(gen.next().value).toEqual(put(actions.objectGeometryRemoved(28)))
    expect(gen.next().done).toBe(true)
  })
})

describe('onMaterialUnassigned', () => {
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

  it('re-fetches the object binary so it reverts to its remaining look', () => {
    const gen = onMaterialUnassigned(unassignMaterialSucceeded('p', 's', '28', '7'))
    expect(gen.next().value).toEqual(select(selectNodesById))

    expect(gen.next({ '28': visibleNode('28') }).value).toEqual(select(selectActiveProjectId))
    expect(gen.next('proj-1').value).toEqual(select(selectActiveScenarioId))
    expect(gen.next('scen-1').value).toEqual(call(fetchObjectGeometryBinary, 'proj-1', 'scen-1', 28))

    const primitives: PrimitiveInfo[] = []
    expect(gen.next(primitives).value).toEqual(call(setObjectPrimitives, 28, primitives))
    expect(gen.next().value).toEqual(put(actions.objectGeometryCached(28)))
    expect(gen.next().done).toBe(true)
  })

  it('skips a hidden object so an unassign never un-hides it', () => {
    const gen = onMaterialUnassigned(unassignMaterialSucceeded('p', 's', '28', '7'))
    gen.next() // select nodesById
    const hidden = { ...visibleNode('28'), visibleInViewport: false }
    expect(gen.next({ '28': hidden }).done).toBe(true)
  })
})

describe('threeDWindowSaga', () => {
  it('watches LOAD_OBJECT_GEOMETRY_REQUESTED with takeLeading', () => {
    const gen = threeDWindowSaga()
    expect(gen.next().value).toEqual(
      takeLeading(LOAD_OBJECT_GEOMETRY_REQUESTED, loadObjectGeometryWorker)
    )
  })

  it('has exactly one scene-load trigger — the boot saga owns the ordering', () => {
    const gen = threeDWindowSaga()
    gen.next() // takeLeading LOAD_OBJECT_GEOMETRY_REQUESTED
    // SET_ACTIVE_SCENARIO and the LIST_NODES_SUCCEEDED safety net used to sit
    // on either side of this and each start a load of their own, which is how
    // the same objects were fetched twice on a refresh.
    expect(gen.next().value).toEqual(takeLatest(LOAD_SCENE_REQUESTED, loadSceneWorker))
  })
})
