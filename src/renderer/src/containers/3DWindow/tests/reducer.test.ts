import type { SceneObject } from '../models/types'
import * as actions from '../store/actions'
import reducer, { initialState } from '../store/reducer'

const testObject: SceneObject = { id: 28, name: 'Ground.001', object_type_id: 1 }

describe('3DWindow reducer', () => {
  it('returns the initial state for unknown actions', () => {
    expect(reducer(undefined, { type: 'noop' })).toEqual(initialState)
  })

  it('LOAD_OBJECT_GEOMETRY_REQUESTED sets objectLoading and clears error', () => {
    const state = reducer(undefined, actions.loadObjectGeometry(testObject))

    expect(state.sceneLoad.objectLoading).toBe(true)
    expect(state.sceneLoad.error).toBeNull()
  })

  it('OBJECT_GEOMETRY_LOADED stops loading, registers the object, auto-selects, and bumps geometryVersion', () => {
    const loading = reducer(undefined, actions.loadObjectGeometry(testObject))
    const state = reducer(loading, actions.objectGeometryLoaded(28))

    expect(state.sceneLoad.objectLoading).toBe(false)
    expect(state.sceneLoad.selectedObjectId).toBe(28)
    expect(state.scene.objectIds).toEqual([28])
    expect(state.scene.geometryVersion).toBe(1)
  })

  it('OBJECT_GEOMETRY_LOADED does not duplicate an already-registered object id', () => {
    const once = reducer(undefined, actions.objectGeometryLoaded(28))
    const twice = reducer(once, actions.objectGeometryLoaded(28))

    expect(twice.scene.objectIds).toEqual([28])
    expect(twice.scene.geometryVersion).toBe(2)
  })

  it('LOAD_SCENE_SUCCEEDED resets selection and bumps geometryVersion', () => {
    let state = reducer(undefined, actions.objectGeometryLoaded(28))
    state = reducer(state, actions.loadSceneSucceeded())

    expect(state.sceneLoad.selectedObjectId).toBeNull()
    expect(state.sceneLoad.loading).toBe(false)
  })
})
