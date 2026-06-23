import { setActiveScenario } from 'containers/ProjectScreen/actions'
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
  renderEnabled: true,
  modelVisibility: {}
})

const group = (id: string, name: string, childIds: string[] = []): GeoNode => ({
  id,
  name,
  kind: 'group',
  parentId: null,
  childIds,
  expanded: true,
  visibleInViewport: true,
  renderEnabled: true,
  modelVisibility: {}
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

  it('TOGGLE_RENDER flips render AND all models, cascading to group children', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [group('g', 'Group.001', ['b']), ground('b', 'Ground.002', 'g')])
    )
    // Master switch over the catalog ids [1, 2]: render off ⇒ every model false.
    const r = geometryReducer(seeded, actions.toggleRender(P, S, 'g', [1, 2]))
    expect(r.byScope[KEY].nodesById['g'].renderEnabled).toBe(false)
    expect(r.byScope[KEY].nodesById['g'].modelVisibility).toEqual({ 1: false, 2: false })
    expect(r.byScope[KEY].nodesById['b'].renderEnabled).toBe(false)
    expect(r.byScope[KEY].nodesById['b'].modelVisibility).toEqual({ 1: false, 2: false })
  })

  it('TOGGLE_RENDER turns everything back on when all models are currently off', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [ground('b', 'Ground.002')])
    )
    // Drive all models off first, then the render toggle should flip them on.
    const allOff = geometryReducer(seeded, actions.toggleRender(P, S, 'b', [1, 2]))
    expect(allOff.byScope[KEY].nodesById['b'].modelVisibility).toEqual({ 1: false, 2: false })
    const backOn = geometryReducer(allOff, actions.toggleRender(P, S, 'b', [1, 2]))
    expect(backOn.byScope[KEY].nodesById['b'].modelVisibility).toEqual({ 1: true, 2: true })
    expect(backOn.byScope[KEY].nodesById['b'].renderEnabled).toBe(true)
  })

  it('SET_MODEL_ON sets one model id, cascades to children, and keeps render in sync', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [group('g', 'Group.001', ['b']), ground('b', 'Ground.002', 'g')])
    )
    // Catalog ids [4, 5]: turning 4 off leaves 5 on, so render stays true.
    const r = geometryReducer(seeded, actions.setModelOn(P, S, 'g', 4, false, [4, 5]))
    expect(r.byScope[KEY].nodesById['g'].modelVisibility).toEqual({ 4: false })
    expect(r.byScope[KEY].nodesById['b'].modelVisibility).toEqual({ 4: false })
    expect(r.byScope[KEY].nodesById['g'].renderEnabled).toBe(true)
    expect(r.byScope[KEY].nodesById['b'].renderEnabled).toBe(true)
  })

  it('SET_MODEL_ON turns render off once the last model goes off', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [ground('b', 'Ground.002')])
    )
    // Only one model in the catalog; turning it off ⇒ render off.
    const off4 = geometryReducer(seeded, actions.setModelOn(P, S, 'b', 4, false, [4]))
    expect(off4.byScope[KEY].nodesById['b'].renderEnabled).toBe(false)
  })

  it('TOGGLE_RENDER on one child turns the group back on (any child on ⇒ group on)', () => {
    let r = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [
        group('g', 'Group.001', ['b', 'c']),
        ground('b', 'Ground.002', 'g'),
        ground('c', 'Ground.003', 'g')
      ])
    )
    // Group render off ⇒ both children + the group go off (all models false).
    r = geometryReducer(r, actions.toggleRender(P, S, 'g', [1, 2]))
    expect(r.byScope[KEY].nodesById['g'].renderEnabled).toBe(false)
    expect(r.byScope[KEY].nodesById['g'].modelVisibility).toEqual({ 1: false, 2: false })
    // Turn one child back on ⇒ the group reflects it (render on, that child's models on).
    r = geometryReducer(r, actions.toggleRender(P, S, 'b', [1, 2]))
    expect(r.byScope[KEY].nodesById['b'].modelVisibility).toEqual({ 1: true, 2: true })
    expect(r.byScope[KEY].nodesById['g'].renderEnabled).toBe(true)
    expect(r.byScope[KEY].nodesById['g'].modelVisibility).toEqual({ 1: true, 2: true })
  })

  it('TOGGLE_RENDER keeps the group off only once every child is off', () => {
    let r = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [
        group('g', 'Group.001', ['b', 'c']),
        ground('b', 'Ground.002', 'g'),
        ground('c', 'Ground.003', 'g')
      ])
    )
    // Turn each child off individually; the group stays on until the last one.
    r = geometryReducer(r, actions.toggleRender(P, S, 'b', [1, 2]))
    expect(r.byScope[KEY].nodesById['g'].renderEnabled).toBe(true)
    r = geometryReducer(r, actions.toggleRender(P, S, 'c', [1, 2]))
    expect(r.byScope[KEY].nodesById['g'].renderEnabled).toBe(false)
    expect(r.byScope[KEY].nodesById['g'].modelVisibility).toEqual({ 1: false, 2: false })
  })

  it('TOGGLE_VIEWPORT on one child turns the group eye back on (any child visible ⇒ group visible)', () => {
    let r = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [
        group('g', 'Group.001', ['b', 'c']),
        ground('b', 'Ground.002', 'g'),
        ground('c', 'Ground.003', 'g')
      ])
    )
    r = geometryReducer(r, actions.toggleViewport(P, S, 'g')) // group + children hidden
    expect(r.byScope[KEY].nodesById['g'].visibleInViewport).toBe(false)
    r = geometryReducer(r, actions.toggleViewport(P, S, 'b')) // one child shown again
    expect(r.byScope[KEY].nodesById['g'].visibleInViewport).toBe(true)
  })

  it('VISIBILITY_SYNC_FAILED(model) reverts the model flag', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [ground('b', 'Ground.002')])
    )
    const toggled = geometryReducer(seeded, actions.setModelOn(P, S, 'b', 4, false, [4]))
    const reverted = geometryReducer(
      toggled,
      actions.visibilitySyncFailed(P, S, 'b', 'model', 'boom', 4)
    )
    // 4 was set to false, revert flips it back to true (default-on restored)
    expect(reverted.byScope[KEY].nodesById['b'].modelVisibility[4]).toBe(true)
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

  it('MOVE_NODES_SUCCEEDED dissolves a 2-member group when one is dragged out (min 2)', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [
        group('g', 'Group.001', ['c1', 'c2']),
        ground('c1', 'Ground.001', 'g'),
        ground('c2', 'Ground.002', 'g')
      ])
    )
    // Drag c1 out to the root — c2 would be left alone, so the group dissolves
    // and c2 is ejected to the root too.
    const r = geometryReducer(seeded, actions.moveNodesSucceeded(P, S, ['c1'], null))
    const s = r.byScope[KEY]
    expect(s.nodesById['g']).toBeUndefined() // group deleted
    expect(s.rootOrder).not.toContain('g')
    expect(s.nodesById['c1'].parentId).toBeNull()
    expect(s.nodesById['c2'].parentId).toBeNull() // lone member ejected
    expect(s.rootOrder).toEqual(expect.arrayContaining(['c1', 'c2']))
  })

  it('MOVE_NODES_SUCCEEDED keeps a group that still has ≥2 members after a move out', () => {
    const seeded = geometryReducer(
      initialState,
      actions.listNodesSucceeded(P, S, [
        group('g', 'Group.001', ['c1', 'c2', 'c3']),
        ground('c1', 'Ground.001', 'g'),
        ground('c2', 'Ground.002', 'g'),
        ground('c3', 'Ground.003', 'g')
      ])
    )
    const r = geometryReducer(seeded, actions.moveNodesSucceeded(P, S, ['c1'], null))
    const s = r.byScope[KEY]
    expect(s.nodesById['g'].childIds).toEqual(['c2', 'c3']) // group survives
    expect(s.nodesById['c1'].parentId).toBeNull()
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

  describe('edit-object draft', () => {
    // +Ground POSTs first; CREATE_OBJECT_SUCCEEDED inserts the node AND opens the
    // edit form populated from the persisted object's values.
    const created = (values: Record<string, string> = { length: '10', breadth: '10' }) =>
      geometryReducer(
        initialState,
        actions.createObjectSucceeded(P, S, {
          node: ground('27', 'Ground.001'),
          values,
          objectTypeId: 1,
          objectName: 'Ground'
        })
      )

    it('CREATE_OBJECT_SUCCEEDED inserts+selects the node and opens the draft', () => {
      const r = created()
      const s = r.byScope[KEY]
      expect(s.nodesById['27']).toMatchObject({ id: '27', kind: 'ground' })
      expect(s.rootOrder).toEqual(['27'])
      expect(s.selectedIds).toEqual(['27'])
      expect(r.createDraft).toEqual({
        objectId: '27',
        objectTypeId: 1,
        objectName: 'Ground',
        name: 'Ground.001',
        values: { length: '10', breadth: '10' },
        materialId: null,
        isNew: true,
        saving: false,
        saveError: null,
        nameError: null
      })
      expect(r.createDraftNonce).toBe(1)
    })

    it('LOAD_OBJECT_SUCCEEDED opens the form for an existing ground (isNew:false, no insert)', () => {
      // The ground is already in the tree; loading just opens the form.
      const seeded = geometryReducer(
        initialState,
        actions.listNodesSucceeded(P, S, [ground('27', 'Ground.001')])
      )
      const r = geometryReducer(
        seeded,
        actions.loadObjectSucceeded(P, S, {
          node: ground('27', 'Ground.001'),
          values: { length: '10', breadth: '10' },
          objectTypeId: 1,
          objectName: 'Ground'
        })
      )
      expect(r.createDraft).toMatchObject({
        objectId: '27',
        isNew: false,
        values: { length: '10', breadth: '10' }
      })
      // No duplicate insert from a load.
      expect(r.byScope[KEY].rootOrder).toEqual(['27'])
      expect(r.createDraftNonce).toBe(1)
      // The fetched values are cached so a re-click won't refetch.
      expect(r.byScope[KEY].detailsById['27']).toEqual({
        values: { length: '10', breadth: '10' },
        objectTypeId: 1,
        objectName: 'Ground'
      })
    })

    it('SET_DRAFT_VALUE / MATERIAL update the open draft', () => {
      let r = created()
      r = geometryReducer(r, actions.setDraftValue('length', '20'))
      r = geometryReducer(r, actions.setDraftMaterial(3))
      expect(r.createDraft).toMatchObject({
        values: { length: '20', breadth: '10' },
        materialId: 3
      })
    })

    it('UPDATE_OBJECT_REQUESTED marks the draft saving; FAILED records the error', () => {
      let r = created()
      r = geometryReducer(r, actions.updateObjectRequested(P, S))
      expect(r.createDraft?.saving).toBe(true)
      r = geometryReducer(r, actions.updateObjectFailed('nope'))
      expect(r.createDraft).toMatchObject({ saving: false, saveError: 'nope' })
    })

    it('UPDATE_OBJECT_SUCCEEDED keeps the form open and clears saving/new, without touching the name', () => {
      let r = created()
      r = geometryReducer(r, actions.updateObjectRequested(P, S))
      r = geometryReducer(r, actions.updateObjectSucceeded(P, S, { objectId: '27', propsChanged: true }))
      // Form stays open (panel must not blank) showing the saved values.
      expect(r.createDraft).toMatchObject({ saving: false, isNew: false })
      // The name is owned by the blur/rename path — Save is field-only and leaves
      // the tree row's name untouched (so a rejected rename can't leak into it).
      expect(r.byScope[KEY].nodesById['27'].name).toBe('Ground.001')
    })

    it('RENAME_FAILED for the open draft object lands on the draft, not the tree row', () => {
      let r = created()
      r = geometryReducer(r, actions.renameFailed(P, S, '27', 'Geometry name already exists'))
      // Scoped to the form — shown below its name field…
      expect(r.createDraft?.nameError).toBe('Geometry name already exists')
      // …and NOT mirrored onto the left tree's shared nameErrors (the row's
      // committed name is still the valid old one).
      expect(r.byScope[KEY].nameErrors['27']).toBeUndefined()
    })

    it('editing the name (SET_DRAFT_NAME) clears the draft name error', () => {
      let r = created()
      r = geometryReducer(r, actions.renameFailed(P, S, '27', 'Geometry name already exists'))
      r = geometryReducer(r, actions.setDraftName('Ground.010'))
      expect(r.createDraft?.nameError).toBeNull()
    })

    it('a RENAME_FAILED for a DIFFERENT object still records a tree-row error', () => {
      // Draft open for '27'; a rename of some other node fails → tree row error.
      let r = created()
      r = geometryReducer(r, actions.renameFailed(P, S, '99', 'boom'))
      expect(r.byScope[KEY].nameErrors['99']).toBe('boom')
      expect(r.createDraft?.nameError).toBeNull()
    })

    it('CLOSE_CREATE_FORM discards the draft (but keeps the nonce)', () => {
      const r = geometryReducer(created(), actions.closeCreateForm())
      expect(r.createDraft).toBeNull()
      expect(r.createDraftNonce).toBe(1)
    })

    it('SET_ACTIVE_SCENARIO discards a draft left open on a deleted object (scope switch)', () => {
      // Repro: create a ground (draft opens) → delete it from the tree (the form
      // stays open in its read-only "deleted" state) → switch project/scenario.
      // The draft must not survive the switch, or the Properties panel keeps
      // showing the previous scope's deleted ground.
      let r = created()
      r = geometryReducer(r, actions.deleteNodeSucceeded(P, S, '27'))
      expect(r.createDraft).not.toBeNull() // delete alone leaves the form open…
      // Cast: the store dispatches every action to every reducer, but the typed
      // signature only knows GeometryAction (matches `as never` on line 35).
      r = geometryReducer(r, setActiveScenario('s2') as never)
      expect(r.createDraft).toBeNull() // …the scope switch is what resets it
    })

    it('SET_ACTIVE_SCENARIO clears a plain open draft too (not just deleted-object drafts)', () => {
      // The leak isn't specific to deleted objects: any draft belongs to the
      // scenario it was opened in and must not survive a switch.
      const r = geometryReducer(created(), setActiveScenario('s2') as never)
      expect(r.createDraft).toBeNull()
    })

    it('SET_ACTIVE_SCENARIO resets the draft but PRESERVES the per-scenario byScope caches', () => {
      // Invariant the fix relies on: clear only the global draft, never wipe the
      // loaded trees. byScope is the warm cache that makes returning to a scenario
      // instant — nuking it here would trade one bug for a refetch storm.
      const r = geometryReducer(created(), setActiveScenario('s2') as never)
      expect(r.createDraft).toBeNull()
      expect(r.byScope[KEY].nodesById['27']).toMatchObject({ id: '27' }) // tree kept
    })

    it('DELETE_NODE_SUCCEEDED on the drafted object keeps the form open (read-only deleted state)', () => {
      // Deleting from the tree intentionally does NOT close the form — it locks to
      // a "this geometry was deleted" state; only CLOSE_CREATE_FORM or a scope
      // switch clears it. Guards that deliberate behavior against a future change.
      const r = geometryReducer(created(), actions.deleteNodeSucceeded(P, S, '27'))
      expect(r.byScope[KEY].nodesById['27']).toBeUndefined() // gone from the tree…
      expect(r.createDraft?.objectId).toBe('27') // …but the form stays open
    })
  })
})
