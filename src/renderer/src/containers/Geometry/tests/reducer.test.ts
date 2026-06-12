import geometryReducer, { initialState, scopeKey } from '../reducer'
import * as actions from '../actions'
import type { GeoNode } from '../types'

const P = 'p1'
const S = 's1'
const KEY = scopeKey(P, S)

const ground = (id: string, name: string, parentId: string | null = null): GeoNode => ({
  id,
  name,
  kind: 'ground',
  parentId,
  childIds: [],
  expanded: false,
  visibleInViewport: true,
  modelVisibility: { mode: 'all' }
})

const group = (id: string, name: string, childIds: string[] = []): GeoNode => ({
  id,
  name,
  kind: 'group',
  parentId: null,
  childIds,
  expanded: true,
  visibleInViewport: true,
  modelVisibility: { mode: 'all' }
})

describe('geometryReducer', () => {
  it('returns the initial state', () => {
    expect(geometryReducer(undefined, { type: 'init' } as never)).toEqual(initialState)
  })

  it('LIST_NODES_REQUESTED marks the scope loading', () => {
    const r = geometryReducer(initialState, actions.listNodesRequested(P, S))
    expect(r.byScope[KEY].loadStatus).toBe('loading')
    expect(r.byScope[KEY].loadError).toBeNull()
  })

  it('LIST_NODES_SUCCEEDED normalizes nodes and roots', () => {
    const nodes = [
      ground('a', 'Ground.001'),
      group('g', 'Group.001', ['b']),
      ground('b', 'Ground.002', 'g')
    ]
    const r = geometryReducer(initialState, actions.listNodesSucceeded(P, S, nodes))
    const s = r.byScope[KEY]
    expect(s.loadStatus).toBe('loaded')
    expect(Object.keys(s.nodesById)).toHaveLength(3)
    expect(s.rootOrder).toEqual(['a', 'g']) // 'b' is nested, not a root
  })

  it('LIST_NODES_FAILED stores the error', () => {
    const r = geometryReducer(initialState, actions.listNodesFailed(P, S, 'boom'))
    expect(r.byScope[KEY].loadStatus).toBe('error')
    expect(r.byScope[KEY].loadError).toBe('boom')
  })

  it('SELECT (single) replaces the selection', () => {
    const r = geometryReducer(initialState, actions.select(P, S, 'a'))
    expect(r.byScope[KEY].selectedIds).toEqual(['a'])
  })

  it('SELECT (multi) toggles membership', () => {
    let r = geometryReducer(initialState, actions.select(P, S, 'a', true))
    r = geometryReducer(r, actions.select(P, S, 'b', true))
    expect(r.byScope[KEY].selectedIds).toEqual(['a', 'b'])
    r = geometryReducer(r, actions.select(P, S, 'a', true))
    expect(r.byScope[KEY].selectedIds).toEqual(['b'])
  })

  it('SET_SEARCH_QUERY stores the query', () => {
    const r = geometryReducer(initialState, actions.setSearchQuery(P, S, 'gro'))
    expect(r.byScope[KEY].searchQuery).toBe('gro')
  })

  it('TOGGLE_EXPAND flips a group expanded flag', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [group('g', 'Group.001')])
    )
    const r = geometryReducer(seeded, actions.toggleExpand(P, S, 'g'))
    expect(r.byScope[KEY].nodesById['g'].expanded).toBe(false)
  })

  it('does not mutate the original state', () => {
    geometryReducer(initialState, actions.listNodesRequested(P, S))
    expect(initialState.byScope).toEqual({})
  })

  it('LIST_NODES_SUCCEEDED seeds counters from existing names', () => {
    const nodes = [ground('a', 'Ground.004'), group('g', 'Group.002', [])]
    const r = geometryReducer(initialState, actions.listNodesSucceeded(P, S, nodes))
    expect(r.byScope[KEY].counters).toEqual({ ground: 4, group: 2 })
  })

  it('ADD_GEOMETRY_REQUESTED bumps the counter for that kind', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [ground('a', 'Ground.004')])
    )
    const r = geometryReducer(seeded, actions.addGeometryRequested(P, S, 'ground'))
    expect(r.byScope[KEY].counters.ground).toBe(5)
  })

  it('TOGGLE_VIEWPORT flips a leaf visibility', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [ground('a', 'Ground.001')])
    )
    const r = geometryReducer(seeded, actions.toggleViewport(P, S, 'a'))
    expect(r.byScope[KEY].nodesById['a'].visibleInViewport).toBe(false)
  })

  it('TOGGLE_VIEWPORT on a group cascades to its children', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [group('g', 'Group.001', ['b']), ground('b', 'Ground.002', 'g')])
    )
    const r = geometryReducer(seeded, actions.toggleViewport(P, S, 'g'))
    expect(r.byScope[KEY].nodesById['g'].visibleInViewport).toBe(false)
    expect(r.byScope[KEY].nodesById['b'].visibleInViewport).toBe(false)
  })

  it('SET_MODEL_VISIBILITY sets the node value and cascades to group children', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [group('g', 'Group.001', ['b']), ground('b', 'Ground.002', 'g')])
    )
    const r = geometryReducer(seeded, actions.setModelVisibility(P, S, 'g', { mode: 'none' }))
    expect(r.byScope[KEY].nodesById['g'].modelVisibility).toEqual({ mode: 'none' })
    expect(r.byScope[KEY].nodesById['b'].modelVisibility).toEqual({ mode: 'none' })
  })

  it('RENAME_SUCCEEDED updates the name and clears any name error', () => {
    let r = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [group('g', 'Group.001', [])])
    )
    r = geometryReducer(r, actions.renameFailed(P, S, 'g', 'boom'))
    expect(r.byScope[KEY].nameErrors['g']).toBe('boom')
    r = geometryReducer(r, actions.renameSucceeded(P, S, 'g', 'Backyard'))
    expect(r.byScope[KEY].nodesById['g'].name).toBe('Backyard')
    expect(r.byScope[KEY].nameErrors['g']).toBeUndefined()
  })

  it('RENAME_FAILED records an inline name error', () => {
    const r = geometryReducer(initialState, actions.renameFailed(P, S, 'g', 'nope'))
    expect(r.byScope[KEY].nameErrors['g']).toBe('nope')
  })

  it('SET_NAME_ERROR sets and clears the error', () => {
    let r = geometryReducer(initialState, actions.setNameError(P, S, 'g', 'bad'))
    expect(r.byScope[KEY].nameErrors['g']).toBe('bad')
    r = geometryReducer(r, actions.setNameError(P, S, 'g', null))
    expect(r.byScope[KEY].nameErrors['g']).toBeUndefined()
  })

  it('GROUP_NODES_SUCCEEDED inserts the server group from two root leaves', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [ground('a', 'Ground.001'), ground('b', 'Ground.002')])
    )
    const r = geometryReducer(
      seeded,
      actions.groupNodesSucceeded(P, S, { id: 'grp-x', name: 'Group.001', memberIds: ['b', 'a'] })
    )
    const s = r.byScope[KEY]
    expect(s.nodesById['grp-x']).toMatchObject({ kind: 'group', name: 'Group.001', expanded: true })
    expect(s.nodesById['grp-x'].childIds).toEqual(['b', 'a'])
    expect(s.nodesById['a'].parentId).toBe('grp-x')
    expect(s.nodesById['b'].parentId).toBe('grp-x')
    expect(s.rootOrder).toEqual(['grp-x']) // a and b left the root
    expect(s.selectedIds).toEqual(['grp-x'])
  })

  it('MOVE_NODES_SUCCEEDED moves a leaf into a group', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [group('g', 'Group.001', ['c']), ground('c', 'Ground.003', 'g'), ground('a', 'Ground.001')])
    )
    const r = geometryReducer(seeded, actions.moveNodesSucceeded(P, S, ['a'], 'g'))
    const s = r.byScope[KEY]
    expect(s.nodesById['a'].parentId).toBe('g')
    expect(s.nodesById['g'].childIds).toContain('a')
    expect(s.rootOrder).not.toContain('a')
  })

  it('MOVE_NODES_SUCCEEDED to root ungroups, and prunes a now-empty group', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [group('g', 'Group.001', ['c']), ground('c', 'Ground.003', 'g')])
    )
    const r = geometryReducer(seeded, actions.moveNodesSucceeded(P, S, ['c'], null))
    const s = r.byScope[KEY]
    expect(s.nodesById['c'].parentId).toBeNull()
    expect(s.rootOrder).toContain('c')
    expect(s.nodesById['g']).toBeUndefined() // empty group pruned
    expect(s.rootOrder).not.toContain('g')
  })

  it('DELETE_NODE_SUCCEEDED removes a root leaf', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [ground('a', 'Ground.001')])
    )
    const r = geometryReducer(seeded, actions.deleteNodeSucceeded(P, S, 'a'))
    expect(r.byScope[KEY].nodesById['a']).toBeUndefined()
    expect(r.byScope[KEY].rootOrder).toEqual([])
  })

  it('DELETE_NODE_SUCCEEDED on a group removes the group and its children', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [
        group('g', 'Group.001', ['c1', 'c2']),
        ground('c1', 'Ground.003', 'g'),
        ground('c2', 'Ground.004', 'g')
      ])
    )
    const r = geometryReducer(seeded, actions.deleteNodeSucceeded(P, S, 'g'))
    const s = r.byScope[KEY]
    expect(s.nodesById['g']).toBeUndefined()
    expect(s.nodesById['c1']).toBeUndefined()
    expect(s.nodesById['c2']).toBeUndefined()
    expect(s.rootOrder).toEqual([])
  })

  it('DELETE_NODE_SUCCEEDED on a group\'s last child prunes the empty group', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [group('g', 'Group.001', ['c']), ground('c', 'Ground.003', 'g')])
    )
    const r = geometryReducer(seeded, actions.deleteNodeSucceeded(P, S, 'c'))
    expect(r.byScope[KEY].nodesById['c']).toBeUndefined()
    expect(r.byScope[KEY].nodesById['g']).toBeUndefined() // pruned
  })

  it('ADD_GEOMETRY_SUCCEEDED inserts the leaf at root and selects it', () => {
    const r = geometryReducer(
      initialState,
      actions.addGeometrySucceeded(P, S, { id: 'x', name: 'Ground.001', kind: 'ground' })
    )
    const s = r.byScope[KEY]
    expect(s.nodesById['x']).toMatchObject({ id: 'x', name: 'Ground.001', kind: 'ground', parentId: null })
    expect(s.rootOrder).toEqual(['x'])
    expect(s.selectedIds).toEqual(['x'])
  })
})
