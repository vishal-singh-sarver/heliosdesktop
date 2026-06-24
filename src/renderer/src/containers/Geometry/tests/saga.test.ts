import { selectAllObjectTypes } from 'containers/ProjectScreen/selectors'
import type { ObjectTypeDef } from 'containers/ProjectScreen/types'
import { call, put, select, takeEvery, takeLatest, takeLeading } from 'redux-saga/effects'
import geometrySaga, {
  createObjectWorker,
  deleteNodeWorker,
  listNodesWorker,
  loadObjectWorker,
  moveNodesWorker,
  renameWorker,
  updateObjectWorker,
  setModelOnWorker,
  toggleRenderWorker,
  toggleViewportWorker
} from '../saga'
import * as actions from '../actions'
import {
  CREATE_OBJECT_REQUESTED,
  DELETE_NODE_REQUESTED,
  LIST_NODES_REQUESTED,
  LOAD_OBJECT_REQUESTED,
  RENAME_REQUESTED,
  UPDATE_OBJECT_REQUESTED
} from '../constants'
import { selectCreateDraft, selectDetailsById, selectNodesById } from '../selectors'
import * as service from '../service'
import type { CreateDraft, GeoNode } from '../types'

const groundNode = (id: string, parentId: string | null = null): GeoNode => ({
  id,
  name: 'Ground.001',
  kind: 'ground',
  parentId,
  childIds: [],
  expanded: false,
  visibleInViewport: true,
  renderEnabled: true,
  modelVisibility: {}
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
  const leaf = (id: string, parentId: string | null): GeoNode => ({
    id,
    name: id,
    kind: 'ground',
    parentId,
    childIds: [],
    expanded: false,
    visibleInViewport: true,
    renderEnabled: true,
    modelVisibility: {}
  })

  it('deletes a group via service.deleteGroup (group endpoint, no cleanup)', () => {
    const before: Record<string, GeoNode> = {
      g: {
        id: 'g',
        name: 'Group.001',
        kind: 'group',
        parentId: null,
        childIds: ['c1', 'c2'],
        expanded: true,
        visibleInViewport: true,
        renderEnabled: true,
        modelVisibility: {}
      }
    }
    const gen = deleteNodeWorker(actions.deleteNodeRequested(P, S, 'g'))
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next(before).value).toEqual(call(service.deleteGroup, P, S, 'g'))
    expect(gen.next().value).toEqual(put(actions.deleteNodeSucceeded(P, S, 'g')))
    expect(gen.next().done).toBe(true)
  })

  it('deletes a root leaf via service.deleteNode (object endpoint, no cleanup)', () => {
    const before: Record<string, GeoNode> = { a: leaf('a', null) }
    const gen = deleteNodeWorker(actions.deleteNodeRequested(P, S, 'a'))
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next(before).value).toEqual(call(service.deleteNode, P, S, 'a'))
    expect(gen.next().value).toEqual(put(actions.deleteNodeSucceeded(P, S, 'a')))
    expect(gen.next().done).toBe(true)
  })

  it('deleting one of a group’s two members dissolves the group', () => {
    const before: Record<string, GeoNode> = {
      g: {
        id: 'g',
        name: 'Group.001',
        kind: 'group',
        parentId: null,
        childIds: ['c1', 'c2'],
        expanded: true,
        visibleInViewport: true,
        renderEnabled: true,
        modelVisibility: {}
      },
      c1: leaf('c1', 'g'),
      c2: leaf('c2', 'g')
    }
    const after: Record<string, GeoNode> = { c2: leaf('c2', null) } // c1 gone, g dissolved

    const gen = deleteNodeWorker(actions.deleteNodeRequested(P, S, 'c1'))
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next(before).value).toEqual(call(service.deleteNode, P, S, 'c1'))
    expect(gen.next().value).toEqual(put(actions.deleteNodeSucceeded(P, S, 'c1')))
    expect(gen.next().value).toEqual(select(selectNodesById)) // cleanup re-reads state
    expect(gen.next(after).value).toEqual(call(service.moveNodes, P, S, ['c2'], null))
    expect(gen.next().value).toEqual(call(service.deleteGroup, P, S, 'g'))
    expect(gen.next().done).toBe(true)
  })

  it('puts deleteNodeFailed when the service throws', () => {
    const gen = deleteNodeWorker(actions.deleteNodeRequested(P, S, 'g'))
    gen.next() // select
    gen.next({}) // advance to call(deleteNode)
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
    saveError: null,
    nameError: null
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
    // Save is properties-only → straight to success, no rename call.
    expect(gen.next().value).toEqual(
      put(actions.updateObjectSucceeded(P, S, { objectId: '27', propsChanged: true }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('never renames — a differing name is ignored (the name saves on blur, not via Save)', () => {
    const renamed: CreateDraft = { ...draft, name: 'Plot A' }
    const gen = updateObjectWorker(actions.updateObjectRequested(P, S))
    gen.next() // select draft
    gen.next(renamed) // select nodesById
    gen.next({ '27': groundNode('27') }) // select detailsById
    // Props changed (no cache) → updateObject. The differing draft name does NOT
    // trigger a rename here — Save touches only the property fields.
    expect(gen.next({}).value).toEqual(
      call(service.updateObject, P, S, '27', {
        properties: { length: 20, breadth: 10 },
        visibility: { viewport: true, render: true },
        groupId: null
      })
    )
    expect(gen.next().value).toEqual(
      put(actions.updateObjectSucceeded(P, S, { objectId: '27', propsChanged: true }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('name-only change → no properties PATCH, just succeeds (the name saved on blur)', () => {
    const renamed: CreateDraft = { ...draft, name: 'Plot A' }
    // Cached original matches the draft's numeric properties → no props change.
    const original = { values: { length: '20', breadth: '10' }, objectTypeId: 1, objectName: 'Ground' }
    const gen = updateObjectWorker(actions.updateObjectRequested(P, S))
    gen.next() // select draft
    gen.next(renamed) // select nodesById
    gen.next({ '27': groundNode('27') }) // select detailsById
    // Props unchanged + Save ignores the name → no API calls, straight to success.
    expect(gen.next({ '27': original }).value).toEqual(
      put(actions.updateObjectSucceeded(P, S, { objectId: '27', propsChanged: false }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('no-op save (nothing changed) → neither endpoint, just succeeds', () => {
    const original = { values: { length: '20', breadth: '10' }, objectTypeId: 1, objectName: 'Ground' }
    const gen = updateObjectWorker(actions.updateObjectRequested(P, S))
    gen.next() // select draft
    gen.next(draft) // select nodesById
    gen.next({ '27': groundNode('27') }) // select detailsById
    // Props match cache → straight to success, no API calls.
    expect(gen.next({ '27': original }).value).toEqual(
      put(actions.updateObjectSucceeded(P, S, { objectId: '27', propsChanged: false }))
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

describe('toggleViewportWorker', () => {
  const leaf: GeoNode = {
    id: 'a',
    name: 'Ground.001',
    kind: 'ground',
    parentId: null,
    childIds: [],
    expanded: false,
    visibleInViewport: false, // reducer already flipped it
    renderEnabled: true,
    modelVisibility: {}
  }
  const group: GeoNode = {
    id: 'g',
    name: 'Group.001',
    kind: 'group',
    parentId: null,
    childIds: ['a', 'b'],
    expanded: true,
    visibleInViewport: false,
    renderEnabled: true,
    modelVisibility: {}
  }

  it('PATCHes the leaf object with the post-flip viewport value, then succeeds', () => {
    const gen = toggleViewportWorker(actions.toggleViewport(P, S, 'a'))
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next({ a: leaf }).value).toEqual(
      call(service.updateVisibility, P, S, 'a', { viewport: false })
    )
    expect(gen.next().done).toBe(true)
  })

  it('uses the group-visibility endpoint for a group toggle', () => {
    const gen = toggleViewportWorker(actions.toggleViewport(P, S, 'g'))
    gen.next() // select
    expect(gen.next({ g: group }).value).toEqual(
      call(service.updateGroupVisibility, P, S, 'g', { viewport: false })
    )
    expect(gen.next().done).toBe(true)
  })

  it('reverts via visibilitySyncFailed(viewport) when a PATCH throws', () => {
    const gen = toggleViewportWorker(actions.toggleViewport(P, S, 'a'))
    gen.next() // select
    gen.next({ a: leaf }) // advance to the all()
    expect(gen.throw(new Error('boom')).value).toEqual(
      put(actions.visibilitySyncFailed(P, S, 'a', 'viewport', 'boom'))
    )
  })
})

describe('toggleRenderWorker', () => {
  // Post-flip state the reducer produced: render off ⇒ every model false.
  const leaf: GeoNode = {
    id: 'a',
    name: 'Ground.001',
    kind: 'ground',
    parentId: null,
    childIds: [],
    expanded: false,
    visibleInViewport: true,
    renderEnabled: false,
    modelVisibility: { 1: false, 2: false }
  }
  const group: GeoNode = {
    id: 'g',
    name: 'Group.001',
    kind: 'group',
    parentId: null,
    childIds: ['a', 'b'],
    expanded: true,
    visibleInViewport: true,
    renderEnabled: false,
    modelVisibility: {}
  }

  it('PATCHes the leaf object with both render and the full models map', () => {
    const gen = toggleRenderWorker(actions.toggleRender(P, S, 'a', [1, 2]))
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next({ a: leaf }).value).toEqual(
      call(service.updateVisibility, P, S, 'a', {
        render: false,
        models: { 1: false, 2: false }
      })
    )
    expect(gen.next().done).toBe(true)
  })

  it('uses the group-visibility endpoint with just { render } for a group', () => {
    const gen = toggleRenderWorker(actions.toggleRender(P, S, 'g', [1, 2]))
    gen.next() // select
    expect(gen.next({ g: group }).value).toEqual(
      call(service.updateGroupVisibility, P, S, 'g', { render: false })
    )
    expect(gen.next().done).toBe(true)
  })

  it('reverts via visibilitySyncFailed(render) when a PATCH throws', () => {
    const gen = toggleRenderWorker(actions.toggleRender(P, S, 'a', [1, 2]))
    gen.next() // select
    gen.next({ a: leaf }) // advance to the all()
    expect(gen.throw(new Error('nope')).value).toEqual(
      put(actions.visibilitySyncFailed(P, S, 'a', 'render', 'nope'))
    )
  })
})

describe('setModelOnWorker', () => {
  const leaf: GeoNode = {
    id: 'a',
    name: 'Ground.001',
    kind: 'ground',
    parentId: null,
    childIds: [],
    expanded: false,
    visibleInViewport: true,
    renderEnabled: true,
    modelVisibility: { 4: false }
  }
  const group: GeoNode = {
    id: 'g',
    name: 'Group.001',
    kind: 'group',
    parentId: null,
    childIds: ['a', 'b'],
    expanded: true,
    visibleInViewport: true,
    renderEnabled: true,
    modelVisibility: {}
  }

  it('PATCHes the leaf object with visibility.models AND the synced render flag', () => {
    // leaf.renderEnabled (true) is the reducer-synced value the saga forwards.
    const gen = setModelOnWorker(actions.setModelOn(P, S, 'a', 4, false, [4, 5]))
    expect(gen.next().value).toEqual(select(selectNodesById))
    expect(gen.next({ a: leaf }).value).toEqual(
      call(service.updateVisibility, P, S, 'a', { models: { '4': false }, render: true })
    )
    expect(gen.next().done).toBe(true)
  })

  it('uses the group-visibility endpoint (models + render) for a group toggle', () => {
    const gen = setModelOnWorker(actions.setModelOn(P, S, 'g', 2, true, [2]))
    gen.next() // select
    expect(gen.next({ g: group }).value).toEqual(
      call(service.updateGroupVisibility, P, S, 'g', { models: { '2': true }, render: true })
    )
    expect(gen.next().done).toBe(true)
  })

  it('reverts via visibilitySyncFailed(model) carrying the modelId when a PATCH throws', () => {
    const gen = setModelOnWorker(actions.setModelOn(P, S, 'a', 4, false, [4, 5]))
    gen.next() // select
    gen.next({ a: leaf }) // advance to the all()
    expect(gen.throw(new Error('nope')).value).toEqual(
      put(actions.visibilitySyncFailed(P, S, 'a', 'model', 'nope', 4))
    )
  })
})

describe('moveNodesWorker', () => {
  const leaf = (id: string, parentId: string | null): GeoNode => ({
    id,
    name: id,
    kind: 'ground',
    parentId,
    childIds: [],
    expanded: false,
    visibleInViewport: true,
    renderEnabled: true,
    modelVisibility: {}
  })

  it('dragging one out of a 2-member group ejects the leftover and deletes the group', () => {
    // Before: group g holds c1 + c2.
    const before: Record<string, GeoNode> = {
      g: {
        id: 'g',
        name: 'Group.001',
        kind: 'group',
        parentId: null,
        childIds: ['c1', 'c2'],
        expanded: true,
        visibleInViewport: true,
        renderEnabled: true,
        modelVisibility: {}
      },
      c1: leaf('c1', 'g'),
      c2: leaf('c2', 'g')
    }
    // After the reducer ran: g dissolved, both leaves at root.
    const after: Record<string, GeoNode> = { c1: leaf('c1', null), c2: leaf('c2', null) }

    const gen = moveNodesWorker(actions.moveNodesRequested(P, S, ['c1'], null))
    expect(gen.next().value).toEqual(select(selectNodesById))
    // PATCH the dragged node's group_id → null.
    expect(gen.next(before).value).toEqual(call(service.moveNodes, P, S, ['c1'], null))
    expect(gen.next().value).toEqual(put(actions.moveNodesSucceeded(P, S, ['c1'], null)))
    // Re-read state; g is gone, so clean up the backend.
    expect(gen.next().value).toEqual(select(selectNodesById))
    // Eject the leftover member (c2) to the root, then delete the group.
    expect(gen.next(after).value).toEqual(call(service.moveNodes, P, S, ['c2'], null))
    expect(gen.next().value).toEqual(call(service.deleteGroup, P, S, 'g'))
    expect(gen.next().done).toBe(true)
  })
})

describe('geometrySaga', () => {
  it('watches list, add, rename, delete, create-object, then update-object', () => {
    const gen = geometrySaga()
    expect(gen.next().value).toEqual(takeLatest(LIST_NODES_REQUESTED, listNodesWorker))
    expect(gen.next().value).toEqual(takeEvery(RENAME_REQUESTED, renameWorker))
    expect(gen.next().value).toEqual(takeEvery(DELETE_NODE_REQUESTED, deleteNodeWorker))
    expect(gen.next().value).toEqual(takeLeading(CREATE_OBJECT_REQUESTED, createObjectWorker))
    expect(gen.next().value).toEqual(takeLeading(UPDATE_OBJECT_REQUESTED, updateObjectWorker))
    expect(gen.next().value).toEqual(takeLatest(LOAD_OBJECT_REQUESTED, loadObjectWorker))
  })
})
