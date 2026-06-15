import {
  selectActiveScopeKey,
  selectActiveGeometry,
  selectNextGroundName,
  selectRootNodes,
  selectSelectedIds,
  selectSearchQuery,
  selectLoadStatus,
  selectNodesById,
  selectVisibleRootNodes
} from '../selectors'
import { emptyScenarioGeometry, initialState, scopeKey } from '../reducer'
import type { GeoNode, ScenarioGeometry } from '../types'

const ground = (id: string, name: string): GeoNode => ({
  id,
  name,
  kind: 'ground',
  parentId: null,
  childIds: [],
  expanded: false,
  visibleInViewport: true,
  modelVisibility: { mode: 'all' }
})

// Geometry selectors derive the active scope from ProjectScreen's active
// project/scenario, so the mock state needs both slices.
const makeState = (
  scenarioGeo: ScenarioGeometry | null,
  projectId: string | null = 'p1',
  scenarioId: string | null = 's1'
): never => {
  const geometry =
    scenarioGeo && projectId && scenarioId
      ? { byScope: { [scopeKey(projectId, scenarioId)]: scenarioGeo } }
      : initialState
  return {
    geometry,
    projectScreen: { activeProjectId: projectId, activeScenarioId: scenarioId }
  } as never
}

describe('Geometry selectors', () => {
  it('selectActiveScopeKey builds the key from active project + scenario', () => {
    expect(selectActiveScopeKey(makeState(null))).toBe('p1::s1')
  })

  it('selectActiveScopeKey is null when ids are missing', () => {
    expect(selectActiveScopeKey(makeState(null, null, null))).toBeNull()
  })

  it('selectActiveGeometry returns an empty sub-state when the scope is absent', () => {
    expect(selectActiveGeometry(makeState(null))).toEqual(emptyScenarioGeometry())
  })

  it('field selectors read the active scenario', () => {
    const geo: ScenarioGeometry = {
      ...emptyScenarioGeometry(),
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a'],
      searchQuery: 'gr',
      loadStatus: 'loaded'
    }
    const st = makeState(geo)
    expect(selectSelectedIds(st)).toEqual(['a'])
    expect(selectSearchQuery(st)).toBe('gr')
    expect(selectLoadStatus(st)).toBe('loaded')
    expect(selectNodesById(st)).toEqual(geo.nodesById)
    expect(selectRootNodes(st)).toEqual([ground('a', 'Ground.001')])
  })
})

describe('selectVisibleRootNodes (search filter)', () => {
  const group = (id: string, name: string, childIds: string[]): GeoNode => ({
    id,
    name,
    kind: 'group',
    parentId: null,
    childIds,
    expanded: false,
    visibleInViewport: true,
    modelVisibility: { mode: 'all' }
  })
  const child = (id: string, name: string, parentId: string): GeoNode => ({
    ...ground(id, name),
    parentId
  })

  const scenario = (query: string): ScenarioGeometry => ({
    ...emptyScenarioGeometry(),
    loadStatus: 'loaded',
    searchQuery: query,
    nodesById: {
      a: ground('a', 'Ground.001'),
      g: group('g', 'Group.001', ['c1', 'c2']),
      c1: child('c1', 'Ground.500', 'g'),
      c2: child('c2', 'Ground.099', 'g')
    },
    rootOrder: ['a', 'g']
  })

  const namesOf = (state: never): string[] => selectVisibleRootNodes(state).map((n) => n.name)

  it('returns everything when the query is empty', () => {
    expect(namesOf(makeState(scenario('')))).toEqual(['Ground.001', 'Group.001'])
  })

  it('keeps a leaf whose name matches', () => {
    expect(namesOf(makeState(scenario('Ground.001')))).toEqual(['Ground.001'])
  })

  it('keeps a group (and all children) when the group name matches', () => {
    const st = makeState(scenario('group'))
    const { nodesById, rootOrder } = selectActiveGeometry(st) // sanity: untouched source
    expect(rootOrder).toEqual(['a', 'g'])
    expect(nodesById.g.childIds).toHaveLength(2)

    const tree = selectVisibleRootNodes(st)
    expect(tree.map((n) => n.name)).toEqual(['Group.001'])
    expect(tree[0].childIds).toEqual(['c1', 'c2']) // all children kept
    expect(tree[0].expanded).toBe(true) // force-expanded
  })

  it('keeps only matching children when a child matches but the group does not', () => {
    const tree = selectVisibleRootNodes(makeState(scenario('Ground.500')))
    expect(tree.map((n) => n.name)).toEqual(['Group.001'])
    expect(tree[0].childIds).toEqual(['c1']) // only the matching child
  })

  it('is case-insensitive', () => {
    expect(namesOf(makeState(scenario('ground.001')))).toEqual(['Ground.001'])
  })

  it('returns nothing when nothing matches', () => {
    expect(namesOf(makeState(scenario('zzz')))).toEqual([])
  })
})

describe('selectNextGroundName', () => {
  it('returns Ground.001 when there are no grounds', () => {
    expect(selectNextGroundName(makeState(emptyScenarioGeometry()))).toBe('Ground.001')
  })

  it('fills the lowest gap across roots + group children, not max+1', () => {
    const geo: ScenarioGeometry = {
      ...emptyScenarioGeometry(),
      nodesById: {
        a: ground('a', 'Ground.001'),
        g: { ...ground('g', 'Group.001'), kind: 'group', childIds: ['c'] },
        c: { ...ground('c', 'Ground.004'), parentId: 'g' }
      },
      rootOrder: ['a', 'g']
    }
    // 001 and 004 used (004 nested); the lowest free number is 002 — gap-filling,
    // not Ground.005.
    expect(selectNextGroundName(makeState(geo))).toBe('Ground.002')
  })

  it('fills the gap for {001, 002, 015} → Ground.003', () => {
    const geo: ScenarioGeometry = {
      ...emptyScenarioGeometry(),
      nodesById: {
        a: ground('a', 'Ground.001'),
        b: ground('b', 'Ground.002'),
        c: ground('c', 'Ground.015')
      },
      rootOrder: ['a', 'b', 'c']
    }
    expect(selectNextGroundName(makeState(geo))).toBe('Ground.003')
  })
})
