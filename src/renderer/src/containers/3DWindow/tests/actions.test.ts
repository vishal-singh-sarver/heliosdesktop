import type { SceneObject } from '../models/types'
import * as actions from '../store/actions'
import { LOAD_OBJECT_GEOMETRY_REQUESTED, OBJECT_GEOMETRY_LOADED } from '../store/constants'

describe('3DWindow actions', () => {
  it('loadObjectGeometry wraps the object with LOAD_OBJECT_GEOMETRY_REQUESTED', () => {
    const object: SceneObject = { id: 28, name: 'Ground.001', object_type_id: 1 }

    expect(actions.loadObjectGeometry(object)).toEqual({
      type: LOAD_OBJECT_GEOMETRY_REQUESTED,
      payload: { object }
    })
  })

  it('objectGeometryLoaded carries the object id', () => {
    expect(actions.objectGeometryLoaded(28)).toEqual({
      type: OBJECT_GEOMETRY_LOADED,
      payload: { objectId: 28 }
    })
  })
})
