import * as actions from '../actions'
import {
  DELETE_NODE_REQUESTED,
  GROUP_NODES_REQUESTED,
  LIST_NODES_REQUESTED,
  LIST_NODES_SUCCEEDED,
  LIST_NODES_FAILED,
  MOVE_NODES_REQUESTED,
  RENAME_REQUESTED,
  SELECT,
  SET_NAME_ERROR,
  SET_SEARCH_QUERY,
  TOGGLE_EXPAND
} from '../constants'
import type { GeoNode } from '../types'

const P = 'p1'
const S = 's1'

describe('Geometry actions', () => {
  it('listNodesRequested carries scope', () => {
    expect(actions.listNodesRequested(P, S)).toEqual({
      type: LIST_NODES_REQUESTED,
      projectId: P,
      scenarioId: S
    })
  })

  it('listNodesSucceeded carries nodes in payload', () => {
    const nodes: GeoNode[] = []
    expect(actions.listNodesSucceeded(P, S, nodes)).toEqual({
      type: LIST_NODES_SUCCEEDED,
      projectId: P,
      scenarioId: S,
      payload: nodes
    })
  })

  it('listNodesFailed carries the error message', () => {
    expect(actions.listNodesFailed(P, S, 'err')).toEqual({
      type: LIST_NODES_FAILED,
      projectId: P,
      scenarioId: S,
      payload: 'err'
    })
  })

  it('select defaults multi to false', () => {
    expect(actions.select(P, S, 'a')).toEqual({
      type: SELECT,
      projectId: P,
      scenarioId: S,
      id: 'a',
      multi: false
    })
  })

  it('select passes multi through', () => {
    expect(actions.select(P, S, 'a', true)).toEqual({
      type: SELECT,
      projectId: P,
      scenarioId: S,
      id: 'a',
      multi: true
    })
  })

  it('setSearchQuery carries the query', () => {
    expect(actions.setSearchQuery(P, S, 'q')).toEqual({
      type: SET_SEARCH_QUERY,
      projectId: P,
      scenarioId: S,
      payload: 'q'
    })
  })

  it('toggleExpand carries the node id', () => {
    expect(actions.toggleExpand(P, S, 'g')).toEqual({
      type: TOGGLE_EXPAND,
      projectId: P,
      scenarioId: S,
      id: 'g'
    })
  })

  it('renameRequested carries id + new name', () => {
    expect(actions.renameRequested(P, S, 'g', 'Backyard')).toEqual({
      type: RENAME_REQUESTED,
      projectId: P,
      scenarioId: S,
      id: 'g',
      payload: 'Backyard'
    })
  })

  it('setNameError carries the (nullable) error', () => {
    expect(actions.setNameError(P, S, 'g', null)).toEqual({
      type: SET_NAME_ERROR,
      projectId: P,
      scenarioId: S,
      id: 'g',
      payload: null
    })
  })

  it('groupNodesRequested carries the member ids (target + dragged)', () => {
    expect(actions.groupNodesRequested(P, S, ['b', 'a'])).toEqual({
      type: GROUP_NODES_REQUESTED,
      projectId: P,
      scenarioId: S,
      memberIds: ['b', 'a']
    })
  })

  it('moveNodesRequested carries ids and the target group (or null)', () => {
    expect(actions.moveNodesRequested(P, S, ['a'], null)).toEqual({
      type: MOVE_NODES_REQUESTED,
      projectId: P,
      scenarioId: S,
      nodeIds: ['a'],
      toGroupId: null
    })
  })

  it('deleteNodeRequested carries the node id', () => {
    expect(actions.deleteNodeRequested(P, S, 'g')).toEqual({
      type: DELETE_NODE_REQUESTED,
      projectId: P,
      scenarioId: S,
      id: 'g'
    })
  })
})
