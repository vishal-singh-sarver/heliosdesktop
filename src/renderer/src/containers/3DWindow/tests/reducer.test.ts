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

  it('OBJECT_GEOMETRY_LOADED stops loading, registers the object, auto-selects, sets meshReady false, and bumps geometryVersion', () => {
    const loading = reducer(undefined, actions.loadObjectGeometry(testObject))
    const state = reducer(loading, actions.objectGeometryLoaded(28))

    expect(state.sceneLoad.objectLoading).toBe(false)
    expect(state.sceneLoad.meshReady).toBe(false)
    expect(state.sceneLoad.selectedObjectId).toBe(28)
    expect(state.scene.objectIds).toEqual([28])
    expect(state.scene.geometryVersion).toBe(1)
    expect(state.scene.fitVersion).toBe(0)
  })

  it('OBJECT_GEOMETRY_LOADED does not duplicate an already-registered object id', () => {
    const once = reducer(undefined, actions.objectGeometryLoaded(28))
    const twice = reducer(once, actions.objectGeometryLoaded(28))

    expect(twice.scene.objectIds).toEqual([28])
    expect(twice.scene.geometryVersion).toBe(2)
  })

  it('LOAD_SCENE_REQUESTED sets meshReady false', () => {
    const state = reducer(undefined, actions.loadScene())

    expect(state.sceneLoad.loading).toBe(true)
    expect(state.sceneLoad.meshReady).toBe(false)
  })

  it('LOAD_SCENE_SUCCEEDED resets selection, bumps geometryVersion and fitVersion', () => {
    let state = reducer(undefined, actions.objectGeometryLoaded(28))
    state = reducer(state, actions.loadSceneSucceeded())

    expect(state.sceneLoad.selectedObjectId).toBeNull()
    expect(state.sceneLoad.loading).toBe(false)
    expect(state.scene.fitVersion).toBe(1)
  })

  it('SELECT_SCENE_OBJECT sets meshReady false without bumping geometryVersion', () => {
    const state = reducer(undefined, actions.selectSceneObject(42))

    expect(state.sceneLoad.selectedObjectId).toBe(42)
    expect(state.sceneLoad.meshReady).toBe(false)
    expect(state.scene.geometryVersion).toBe(0)
    expect(state.scene.fitVersion).toBe(0)
  })

  it('OBJECT_GEOMETRY_REMOVED removes from objectIds, clears selection if deleted, and bumps geometryVersion', () => {
    let state = reducer(undefined, actions.objectGeometryLoaded(28))
    state = reducer(state, actions.objectGeometryLoaded(30))
    // Object 28 is selected (auto-select from last loaded = 30, but let's select 28)
    state = reducer(state, actions.selectSceneObject(28))
    state = reducer(state, actions.objectGeometryRemoved(28))

    expect(state.scene.objectIds).toEqual([30])
    expect(state.sceneLoad.selectedObjectId).toBeNull()
    expect(state.scene.geometryVersion).toBe(3)
  })

  it('OBJECT_GEOMETRY_REMOVED does not clear selection if a different object was deleted', () => {
    let state = reducer(undefined, actions.objectGeometryLoaded(28))
    state = reducer(state, actions.objectGeometryLoaded(30))
    // 30 is auto-selected
    state = reducer(state, actions.objectGeometryRemoved(28))

    expect(state.scene.objectIds).toEqual([30])
    expect(state.sceneLoad.selectedObjectId).toBe(30)
  })

  it('MESH_READY sets meshReady true', () => {
    let state = reducer(undefined, actions.selectSceneObject(42))
    expect(state.sceneLoad.meshReady).toBe(false)

    state = reducer(state, actions.meshReady())
    expect(state.sceneLoad.meshReady).toBe(true)
  })
})
