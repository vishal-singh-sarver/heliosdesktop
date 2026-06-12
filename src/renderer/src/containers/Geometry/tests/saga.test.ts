import { call, put, select, takeEvery, takeLatest } from 'redux-saga/effects'
import geometrySaga, {
  addGeometryWorker,
  deleteNodeWorker,
  generateId,
  listNodesWorker,
  renameWorker
} from '../saga'
import * as actions from '../actions'
import {
  ADD_GEOMETRY_REQUESTED,
  DELETE_NODE_REQUESTED,
  LIST_NODES_REQUESTED,
  RENAME_REQUESTED
} from '../constants'
import { selectCounters, selectNodesById } from '../selectors'
import * as service from '../service'
import type { GeoNode, GeometryCounters } from '../types'

const P = 'p1'
const S = 's1'

describe('listNodesWorker', () => {
  it('calls service.listNodes then puts listNodesSucceeded', () => {
    const gen = listNodesWorker(actions.listNodesRequested(P, S))
    expect(gen.next().value).toEqual(call(service.listNodes, P, S))

    const nodes: GeoNode[] = []
    expect(gen.next(nodes).value).toEqual(put(actions.listNodesSucceeded(P, S, nodes)))
    expect(gen.next().done).toBe(true)
  })

  it('puts listNodesFailed when the service throws', () => {
    const gen = listNodesWorker(actions.listNodesRequested(P, S))
    gen.next() // advance to the call
    expect(gen.throw(new Error('boom')).value).toEqual(
      put(actions.listNodesFailed(P, S, 'boom'))
    )
  })
})

describe('addGeometryWorker', () => {
  const counters: GeometryCounters = { ground: 5, group: 1 }

  it('builds the name from the (already-bumped) counter, sends { id, name }, succeeds', () => {
    const gen = addGeometryWorker(actions.addGeometryRequested(P, S, 'ground'))

    expect(gen.next().value).toEqual(select(selectCounters))
    expect(gen.next(counters).value).toEqual(call(generateId))

    const id = 'geo-abc'
    const node = { id, name: 'Ground.005', kind: 'ground' as const }
    expect(gen.next(id).value).toEqual(call(service.createGeometry, P, S, node))
    expect(gen.next().value).toEqual(put(actions.addGeometrySucceeded(P, S, node)))
    expect(gen.next().done).toBe(true)
  })

  it('puts addGeometryFailed when create throws', () => {
    const gen = addGeometryWorker(actions.addGeometryRequested(P, S, 'ground'))
    gen.next() // select
    gen.next(counters) // -> call(generateId)
    gen.next('geo-abc') // -> call(createGeometry)
    expect(gen.throw(new Error('nope')).value).toEqual(
      put(actions.addGeometryFailed(P, S, 'nope'))
    )
  })
})

describe('renameWorker', () => {
  const groupState = { g: { id: 'g', name: 'Group.001', kind: 'group' } } as unknown as Record<
    string,
    GeoNode
  >
  const leafState = { a: { id: 'a', name: 'Ground.001', kind: 'ground' } } as unknown as Record<
    string,
    GeoNode
  >

  it('renames a group via service.renameGroup then puts renameSucceeded', () => {
    const gen = renameWorker(actions.renameRequested(P, S, 'g', 'Backyard'))
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next(groupState).value).toEqual(call(service.renameGroup, P, S, 'g', 'Backyard'))
    expect(gen.next().value).toEqual(put(actions.renameSucceeded(P, S, 'g', 'Backyard')))
    expect(gen.next().done).toBe(true)
  })

  it('renames a leaf via service.renameObject', () => {
    const gen = renameWorker(actions.renameRequested(P, S, 'a', 'North'))
    gen.next() // select
    expect(gen.next(leafState).value).toEqual(call(service.renameObject, P, S, 'a', 'North'))
  })

  it('puts renameFailed when the service throws', () => {
    const gen = renameWorker(actions.renameRequested(P, S, 'g', 'Backyard'))
    gen.next() // select
    gen.next(groupState) // advance to the call
    expect(gen.throw(new Error('nope')).value).toEqual(
      put(actions.renameFailed(P, S, 'g', 'nope'))
    )
  })
})

describe('deleteNodeWorker', () => {
  it('calls service.deleteNode then puts deleteNodeSucceeded', () => {
    const gen = deleteNodeWorker(actions.deleteNodeRequested(P, S, 'g'))
    expect(gen.next().value).toEqual(call(service.deleteNode, P, S, 'g'))
    expect(gen.next().value).toEqual(put(actions.deleteNodeSucceeded(P, S, 'g')))
    expect(gen.next().done).toBe(true)
  })

  it('puts deleteNodeFailed when the service throws', () => {
    const gen = deleteNodeWorker(actions.deleteNodeRequested(P, S, 'g'))
    gen.next()
    expect(gen.throw(new Error('nope')).value).toEqual(
      put(actions.deleteNodeFailed(P, S, 'g', 'nope'))
    )
  })
})

describe('geometrySaga', () => {
  it('watches list, add, rename, then delete', () => {
    const gen = geometrySaga()
    expect(gen.next().value).toEqual(takeLatest(LIST_NODES_REQUESTED, listNodesWorker))
    expect(gen.next().value).toEqual(takeEvery(ADD_GEOMETRY_REQUESTED, addGeometryWorker))
    expect(gen.next().value).toEqual(takeEvery(RENAME_REQUESTED, renameWorker))
    expect(gen.next().value).toEqual(takeEvery(DELETE_NODE_REQUESTED, deleteNodeWorker))
  })
})
