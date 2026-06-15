import { selectAllObjectTypes } from 'containers/ProjectScreen/selectors'
import type { ObjectTypeDef } from 'containers/ProjectScreen/types'
import { call, put, select, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
import geometrySaga, {
  addGeometryWorker,
  createObjectWorker,
  deleteNodeWorker,
  generateId,
  listNodesWorker,
  loadObjectWorker,
  renameWorker,
  updateObjectWorker
} from '../saga'
import * as actions from '../actions'
import {
  ADD_GEOMETRY_REQUESTED,
  CREATE_OBJECT_REQUESTED,
  DELETE_NODE_REQUESTED,
  LIST_NODES_REQUESTED,
  LOAD_OBJECT_REQUESTED,
  RENAME_REQUESTED,
  UPDATE_OBJECT_REQUESTED
} from '../constants'
import { selectCounters, selectCreateDraft, selectDetailsById, selectNodesById } from '../selectors'
import * as service from '../service'
import type { CreateDraft, GeoNode, GeometryCounters } from '../types'

const groundNode = (id: string, parentId: string | null = null): GeoNode => ({
  id,
  name: 'Ground.001',
  kind: 'ground',
  parentId,
  childIds: [],
  expanded: false,
  visibleInViewport: true,
  modelVisibility: { mode: 'all' }
})

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
  it('calls service.renameGroup then puts renameSucceeded', () => {
    const gen = renameWorker(actions.renameRequested(P, S, 'g', 'Backyard'))
    expect(gen.next().value).toEqual(call(service.renameGroup, P, S, 'g', 'Backyard'))
    expect(gen.next().value).toEqual(put(actions.renameSucceeded(P, S, 'g', 'Backyard')))
    expect(gen.next().done).toBe(true)
  })

  it('puts renameFailed when the service throws', () => {
    const gen = renameWorker(actions.renameRequested(P, S, 'g', 'Backyard'))
    gen.next() // advance to the call
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

describe('createObjectWorker', () => {
  // Minimal catalog: no properties → defaultValuesForObject yields {} (exact
  // defaults are covered by propertyBlueprint.test); the worker just wires
  // select → POST → succeed.
  const objectTypes = [{ id: 1, object: 'Ground', properties: [] }] as unknown as ObjectTypeDef[]

  it('POSTs an object with default values, then succeeds with node + values', () => {
    const gen = createObjectWorker(actions.createObjectRequested(P, S, 1, 'Ground', 'Ground.001'))
    expect(gen.next().value).toEqual(select(selectAllObjectTypes))
    const input = { objectTypeId: 1, name: 'Ground.001', properties: {}, materials: [] }
    expect(gen.next(objectTypes).value).toEqual(call(service.createObject, P, S, input))

    const created = { node: groundNode('27'), values: { length: '10', breadth: '10' } }
    expect(gen.next(created).value).toEqual(
      put(
        actions.createObjectSucceeded(P, S, {
          node: created.node,
          values: created.values,
          objectTypeId: 1,
          objectName: 'Ground'
        })
      )
    )
    expect(gen.next().done).toBe(true)
  })

  it('puts createObjectFailed when the service throws', () => {
    const gen = createObjectWorker(actions.createObjectRequested(P, S, 1, 'Ground', 'Ground.001'))
    gen.next() // select objectTypes
    gen.next(objectTypes) // advance to the call
    expect(gen.throw(new Error('bad')).value).toEqual(put(actions.createObjectFailed('bad')))
  })
})

describe('updateObjectWorker', () => {
  const draft: CreateDraft = {
    objectId: '27',
    objectTypeId: 1,
    objectName: 'Ground',
    name: 'Ground.001',
    values: { length: '20', breadth: '10', position_x: ' ' },
    materialId: null,
    isNew: false,
    saving: false,
    saveError: null
  }

  it('PATCHes the draft object with values + visibility + group, then succeeds', () => {
    const gen = updateObjectWorker(actions.updateObjectRequested(P, S))
    expect(gen.next().value).toEqual(select(selectCreateDraft))
    expect(gen.next(draft).value).toEqual(select(selectNodesById))
    expect(gen.next({ '27': groundNode('27') }).value).toEqual(select(selectDetailsById))
    // No cached original → properties treated as changed. Blank values dropped;
    // the rest become numbers. Visibility/group derive from the tree node.
    expect(gen.next({}).value).toEqual(
      call(service.updateObject, P, S, '27', {
        properties: { length: 20, breadth: 10 },
        visibility: { viewport: true, render: true },
        groupId: null
      })
    )
    // Name unchanged (draft.name === node.name) → no rename call.
    expect(gen.next().value).toEqual(
      put(actions.updateObjectSucceeded(P, S, { objectId: '27', name: 'Ground.001' }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('also renames the object when the name changed', () => {
    const renamed: CreateDraft = { ...draft, name: 'Plot A' }
    const gen = updateObjectWorker(actions.updateObjectRequested(P, S))
    gen.next() // select draft
    gen.next(renamed) // select nodesById
    gen.next({ '27': groundNode('27') }) // select detailsById
    gen.next({}) // no cache → props changed → call updateObject
    // node.name 'Ground.001' !== 'Plot A' → rename call before succeeding.
    expect(gen.next().value).toEqual(call(service.renameObject, P, S, '27', 'Plot A'))
    expect(gen.next().value).toEqual(
      put(actions.updateObjectSucceeded(P, S, { objectId: '27', name: 'Plot A' }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('rename-only save: skips the properties PATCH when nothing changed', () => {
    const renamed: CreateDraft = { ...draft, name: 'Plot A' }
    // Cached original matches the draft's numeric properties → no props change.
    const original = { values: { length: '20', breadth: '10' }, objectTypeId: 1, objectName: 'Ground' }
    const gen = updateObjectWorker(actions.updateObjectRequested(P, S))
    gen.next() // select draft
    gen.next(renamed) // select nodesById
    gen.next({ '27': groundNode('27') }) // select detailsById
    // Properties unchanged → updateObject NOT called; only the rename fires.
    expect(gen.next({ '27': original }).value).toEqual(
      call(service.renameObject, P, S, '27', 'Plot A')
    )
    expect(gen.next().value).toEqual(
      put(actions.updateObjectSucceeded(P, S, { objectId: '27', name: 'Plot A' }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('no-op save (nothing changed) → neither endpoint, just succeeds', () => {
    const original = { values: { length: '20', breadth: '10' }, objectTypeId: 1, objectName: 'Ground' }
    const gen = updateObjectWorker(actions.updateObjectRequested(P, S))
    gen.next() // select draft
    gen.next(draft) // select nodesById (name unchanged)
    gen.next({ '27': groundNode('27') }) // select detailsById
    // Props match cache + name unchanged → straight to success, no API calls.
    expect(gen.next({ '27': original }).value).toEqual(
      put(actions.updateObjectSucceeded(P, S, { objectId: '27', name: 'Ground.001' }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('no-ops when there is no draft', () => {
    const gen = updateObjectWorker(actions.updateObjectRequested(P, S))
    gen.next() // select draft
    expect(gen.next(null).done).toBe(true)
  })

  it('puts updateObjectFailed when the service throws', () => {
    const gen = updateObjectWorker(actions.updateObjectRequested(P, S))
    gen.next() // select draft
    gen.next(draft) // select nodesById
    gen.next({ '27': groundNode('27') }) // select detailsById
    gen.next({}) // no cache → props changed → advance to the updateObject call
    expect(gen.throw(new Error('boom')).value).toEqual(put(actions.updateObjectFailed('boom')))
  })
})

describe('loadObjectWorker', () => {
  const cached = { values: { length: '10', breadth: '10' }, objectTypeId: 1, objectName: 'Ground' }

  it('on a cache miss, GETs the object then puts loadObjectSucceeded', () => {
    const gen = loadObjectWorker(actions.loadObjectRequested(P, S, '27'))
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next({ '27': groundNode('27') }).value).toEqual(select(selectDetailsById))
    // Empty cache → GET.
    expect(gen.next({}).value).toEqual(call(service.getObject, P, S, '27'))
    const loaded = { node: groundNode('27'), ...cached }
    expect(gen.next(loaded).value).toEqual(put(actions.loadObjectSucceeded(P, S, loaded)))
    expect(gen.next().done).toBe(true)
  })

  it('on a cache hit, serves from cache without a GET', () => {
    const gen = loadObjectWorker(actions.loadObjectRequested(P, S, '27'))
    gen.next() // select nodesById
    const node = groundNode('27')
    gen.next({ '27': node }) // -> select detailsById
    expect(gen.next({ '27': cached }).value).toEqual(
      put(actions.loadObjectSucceeded(P, S, { node, ...cached }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('no-ops when the node is not in the tree', () => {
    const gen = loadObjectWorker(actions.loadObjectRequested(P, S, '27'))
    gen.next() // select nodesById
    expect(gen.next({}).done).toBe(true)
  })

  it('puts loadObjectFailed when the service throws', () => {
    const gen = loadObjectWorker(actions.loadObjectRequested(P, S, '27'))
    gen.next() // select nodesById
    gen.next({ '27': groundNode('27') }) // select detailsById
    gen.next({}) // -> call getObject
    expect(gen.throw(new Error('nope')).value).toEqual(put(actions.loadObjectFailed('nope')))
  })
})

describe('geometrySaga', () => {
  it('watches list, add, rename, delete, create-object, then update-object', () => {
    const gen = geometrySaga()
    expect(gen.next().value).toEqual(takeLatest(LIST_NODES_REQUESTED, listNodesWorker))
    expect(gen.next().value).toEqual(takeEvery(ADD_GEOMETRY_REQUESTED, addGeometryWorker))
    expect(gen.next().value).toEqual(takeEvery(RENAME_REQUESTED, renameWorker))
    expect(gen.next().value).toEqual(takeEvery(DELETE_NODE_REQUESTED, deleteNodeWorker))
    expect(gen.next().value).toEqual(takeLeading(CREATE_OBJECT_REQUESTED, createObjectWorker))
    expect(gen.next().value).toEqual(takeLeading(UPDATE_OBJECT_REQUESTED, updateObjectWorker))
    expect(gen.next().value).toEqual(takeLatest(LOAD_OBJECT_REQUESTED, loadObjectWorker))
  })
})
