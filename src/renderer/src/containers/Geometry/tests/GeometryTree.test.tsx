import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import GeometryTree from '../GeometryTree'
import { emptyScenarioGeometry, scopeKey } from '../reducer'
import type { GeoNode, ScenarioGeometry } from '../types'
import { MATERIAL_DND_MIME } from 'containers/Materials/constants'

// A dropped material row exposes its { groupId, name } under the material mime;
// any other mime (e.g. the tree's own row-drag mime) reads empty.
const materialDataTransfer = (
  groupId: string,
  name: string
): { getData: (type: string) => string } => ({
  getData: (type) => (type === MATERIAL_DND_MIME ? JSON.stringify({ groupId, name }) : '')
})

// jsdom doesn't implement HTMLDialogElement — mock showModal/close so the
// delete confirmation dialog can open (mirrors components/Dialog tests).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

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

const group = (id: string, name: string, childIds: string[], expanded = false): GeoNode => ({
  id,
  name,
  kind: 'group',
  parentId: null,
  childIds,
  expanded,
  visibleInViewport: true,
  renderEnabled: true,
  modelVisibility: {}
})

const dispatch = vi.fn()

// Minimal mock store: getState returns the shape the geometry + ProjectScreen
// selectors read; dispatch is a spy so we can assert toggleExpand fires.
// The kebab reads the model catalog via selectModelTypes; seed the six top-level
// models so the per-model rows render (Radiation = id 1).
const MODEL_TYPES = [
  { id: 1, model: 'Radiation', description: '' },
  { id: 2, model: 'Energy Balance', description: '' },
  { id: 3, model: 'Solar Position', description: '' },
  { id: 4, model: 'Photosynthesis', description: '' },
  { id: 5, model: 'Boundary Layer Conductance', description: '' },
  { id: 6, model: 'Stomatal Conductance', description: '' }
]

const makeStore = (scenario: ScenarioGeometry): never => {
  const state = {
    geometry: { byScope: { [scopeKey('p1', 's1')]: scenario } },
    projectScreen: {
      activeProjectId: 'p1',
      activeScenarioId: 's1',
      catalog: {
        modelTypes: {
          byId: Object.fromEntries(MODEL_TYPES.map((m) => [m.id, m])),
          allIds: MODEL_TYPES.map((m) => m.id),
          loadStatus: 'loaded',
          loadError: null
        }
      }
    }
  }
  return {
    getState: () => state,
    subscribe: () => () => {},
    dispatch
  } as never
}

const renderTree = (scenario: ScenarioGeometry) =>
  render(
    <Provider store={makeStore(scenario)}>
      <GeometryTree />
    </Provider>
  )

beforeEach(() => dispatch.mockClear())

describe('<GeometryTree />', () => {
  it('shows a spinner while loading', () => {
    renderTree({ ...emptyScenarioGeometry(), loadStatus: 'loading' })
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('shows the error copy on failure', () => {
    renderTree({ ...emptyScenarioGeometry(), loadStatus: 'error', loadError: 'Unable to load Geometries' })
    expect(screen.getByText('Unable to load Geometries')).toBeInTheDocument()
  })

  it('Retry on the error state re-dispatches the load', () => {
    renderTree({ ...emptyScenarioGeometry(), loadStatus: 'error', loadError: 'Unable to load Geometries' })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/LIST_NODES_REQUESTED', projectId: 'p1', scenarioId: 's1' })
    )
  })

  it('shows the empty hint when there are no nodes', () => {
    renderTree({ ...emptyScenarioGeometry(), loadStatus: 'loaded' })
    expect(screen.getByText('No saved geometries yet.')).toBeInTheDocument()
  })

  it('renders root leaves and groups', () => {
    const scenario: ScenarioGeometry = {
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: {
        a: ground('a', 'Ground.001'),
        g: group('g', 'Group.001', ['b']),
        b: ground('b', 'Ground.002', 'g')
      },
      rootOrder: ['a', 'g']
    }
    renderTree(scenario)
    expect(screen.getByText('Ground.001')).toBeInTheDocument()
    expect(screen.getByText('Group.001')).toBeInTheDocument()
  })

  it('hides group children when collapsed, shows them when expanded', () => {
    const base = {
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded' as const,
      rootOrder: ['g']
    }
    const child = ground('b', 'Ground.002', 'g')

    const collapsed = renderTree({
      ...base,
      nodesById: { g: group('g', 'Group.001', ['b'], false), b: child }
    })
    expect(collapsed.queryByText('Ground.002')).toBeNull()
    collapsed.unmount()

    renderTree({
      ...base,
      nodesById: { g: group('g', 'Group.001', ['b'], true), b: child }
    })
    expect(screen.getByText('Ground.002')).toBeInTheDocument()
  })

  it('always shows the kebab; keeps the cluster present but hidden until hover/selected', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a']
    })
    expect(screen.getByLabelText('More options')).toBeInTheDocument()
    // Not selected → the cluster is in the DOM but hidden, revealed on row hover.
    const cluster = screen.getByLabelText('Hide from viewport').closest('div')
    expect(cluster?.className).toContain('opacity-0')
    expect(cluster?.className).toContain('group-hover:opacity-100')
  })

  it('reveals the cluster (opacity-100) on the selected row', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a']
    })
    const cluster = screen.getByLabelText('Hide from viewport').closest('div')
    expect(cluster?.className).toContain('opacity-100')
    expect(cluster?.className).not.toContain('opacity-0')
  })

  it('clicking a row dispatches select', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a']
    })
    fireEvent.click(screen.getByText('Ground.001'))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/SELECT', id: 'a', multi: false })
    )
  })

  it('a selected GROUND row reveals the eye + trash cluster', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a']
    })
    expect(screen.getByLabelText('Hide from viewport')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('the kebab menu toggles a single model', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a']
    })
    fireEvent.click(screen.getByLabelText('More options'))
    fireEvent.click(screen.getByText('Radiation'))
    // Radiation is model id 1; it was default-on, so the click turns it off.
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/SET_MODEL_ON',
        id: 'a',
        modelId: 1,
        on: false
      })
    )
  })

  it('shows a hidden model with a greyed, unchecked row', () => {
    const customHidden = {
      ...ground('a', 'Ground.001'),
      modelVisibility: { 1: false } // Radiation hidden
    }
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: customHidden },
      rootOrder: ['a']
    })
    fireEvent.click(screen.getByLabelText('More options'))
    const radiation = screen.getByRole('menuitemcheckbox', { name: /Radiation/ })
    expect(radiation).toHaveAttribute('aria-checked', 'false')
    expect(radiation.className).toContain('bg-neutral-800/70')
  })

  it('clicking the eye on a selected leaf dispatches toggleViewport', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a']
    })
    fireEvent.click(screen.getByLabelText('Hide from viewport'))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/TOGGLE_VIEWPORT', id: 'a' })
    )
  })

  it('does not dim a row that is hidden from the viewport (only the eye glyph reflects it)', () => {
    const hidden = { ...ground('a', 'Ground.001'), visibleInViewport: false }
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: hidden },
      rootOrder: ['a']
    })
    const row = screen.getByText('Ground.001').closest('[role="button"]')
    expect(row?.className).not.toContain('opacity-50')
  })

  it('a selected GROUP row also reveals the cluster (render/eye/delete)', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { g: group('g', 'Group.001', []) },
      rootOrder: ['g'],
      selectedIds: ['g']
    })
    expect(screen.getByLabelText('Hide from render')).toBeInTheDocument()
    expect(screen.getByLabelText('Hide from viewport')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('the cluster render icon reflects the per-model state (all off → "Show in render")', () => {
    const allOff = {
      ...ground('a', 'Ground.001'),
      modelVisibility: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false }
    }
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: allOff },
      rootOrder: ['a'],
      selectedIds: ['a']
    })
    expect(screen.getByLabelText('Show in render')).toBeInTheDocument()
  })

  it('the cluster render icon shows "Hide from render" when some model is on', () => {
    const someOn = { ...ground('a', 'Ground.001'), modelVisibility: { 1: false, 2: true } }
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: someOn },
      rootOrder: ['a'],
      selectedIds: ['a']
    })
    expect(screen.getByLabelText('Hide from render')).toBeInTheDocument()
  })

  it('clicking the cluster render icon dispatches toggleRender', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a']
    })
    fireEvent.click(screen.getByLabelText('Hide from render'))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/TOGGLE_RENDER', id: 'a' })
    )
  })

  it('double-clicking a group name opens an inline editor and commits a valid rename', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { g: group('g', 'Group.001', []) },
      rootOrder: ['g']
    })
    fireEvent.doubleClick(screen.getByText('Group.001'))
    const input = screen.getByLabelText('Group name')
    fireEvent.change(input, { target: { value: 'Backyard' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/RENAME_REQUESTED', id: 'g', payload: 'Backyard' })
    )
  })

  it('shows a validation error and blocks commit for an over-long name', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { g: group('g', 'Group.001', []) },
      rootOrder: ['g']
    })
    fireEvent.doubleClick(screen.getByText('Group.001'))
    const input = screen.getByLabelText('Group name')
    fireEvent.change(input, { target: { value: 'a'.repeat(21) } })
    expect(screen.getByText('Character limit exceeded')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/RENAME_REQUESTED' })
    )
  })

  it('dropping a leaf onto another root leaf requests a new group', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001'), b: ground('b', 'Ground.002') },
      rootOrder: ['a', 'b']
    })
    const target = screen.getByText('Ground.002').closest('[role="button"]')!
    fireEvent.drop(target, { dataTransfer: { getData: () => JSON.stringify(['a']) } })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/GROUP_NODES_REQUESTED',
        memberIds: ['b', 'a']
      })
    )
  })

  it('dropping a group onto a root ground does nothing (groups do not nest)', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: {
        g: group('g', 'Group.001', ['c']),
        c: ground('c', 'Ground.003', 'g'),
        a: ground('a', 'Ground.001')
      },
      rootOrder: ['g', 'a']
    })
    dispatch.mockClear()
    const target = screen.getByText('Ground.001').closest('[role="button"]')!
    fireEvent.drop(target, { dataTransfer: { getData: () => JSON.stringify(['g']) } })
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/GROUP_NODES_REQUESTED' })
    )
  })

  it('dropping a leaf onto a group requests a move into that group', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { g: group('g', 'Group.001', []), a: ground('a', 'Ground.001') },
      rootOrder: ['g', 'a']
    })
    const target = screen.getByText('Group.001').closest('[role="button"]')!
    fireEvent.drop(target, { dataTransfer: { getData: () => JSON.stringify(['a']) } })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/MOVE_NODES_REQUESTED',
        nodeIds: ['a'],
        toGroupId: 'g'
      })
    )
  })

  it('dropping a material onto a leaf assigns it to that object', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a']
    })
    const target = screen.getByText('Ground.001').closest('[role="button"]')!
    fireEvent.drop(target, { dataTransfer: materialDataTransfer('7', 'Grass') })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED',
        objectIds: ['a'],
        groupId: '7',
        materialName: 'Grass',
        targetName: 'Ground.001'
      })
    )
  })

  it('dropping a material onto a group assigns it to every member object', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: {
        g: group('g', 'Group.001', ['a', 'b']),
        a: ground('a', 'Ground.001', 'g'),
        b: ground('b', 'Ground.002', 'g')
      },
      rootOrder: ['g']
    })
    const target = screen.getByText('Group.001').closest('[role="button"]')!
    fireEvent.drop(target, { dataTransfer: materialDataTransfer('7', 'Grass') })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED',
        objectIds: ['a', 'b'],
        groupId: '7',
        materialName: 'Grass',
        targetName: 'Group.001'
      })
    )
  })

  it('confirming delete on a selected group dispatches deleteNodeRequested with the child count message', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { g: group('g', 'Group.001', ['c']), c: ground('c', 'Ground.003', 'g') },
      rootOrder: ['g'],
      selectedIds: ['g']
    })
    // The cluster trash (now shown for groups too) opens the confirm dialog.
    // Query by role so the always-mounted confirm <dialog aria-label="Delete">
    // doesn't collide with the trash button's "Delete" label.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete "Group.001" and its 1 geometry?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/DELETE_NODE_REQUESTED', id: 'g' })
    )
  })

  // The delete is pessimistic, so the row is still on screen while the request
  // runs. The trash has to lock, or a second confirm fires a duplicate DELETE that
  // 404s — reporting a failure for a delete that actually worked.
  it('disables the trash while this node is being deleted', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a'],
      deletingIds: ['a']
    })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('leaves the trash enabled for a node that is NOT being deleted', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a'],
      deletingIds: ['99']
    })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it("locks a group's children too while the group's delete is in flight", () => {
    // The group purge takes the members with it, so their rows must not offer a
    // delete of their own mid-flight.
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { g: group('g', 'Group.001', ['c'], true), c: ground('c', 'Ground.003', 'g') },
      rootOrder: ['g'],
      selectedIds: ['g', 'c'],
      deletingIds: ['g', 'c']
    })
    const trashes = screen.getAllByRole('button', { name: 'Delete' })
    expect(trashes).toHaveLength(2) // the group row and its expanded child
    trashes.forEach((trash) => expect(trash).toBeDisabled())
  })

  it('dispatches toggleExpand (not select) when a group chevron is clicked', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { g: group('g', 'Group.001', []) },
      rootOrder: ['g']
    })
    fireEvent.click(screen.getByLabelText('Expand group'))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/TOGGLE_EXPAND', id: 'g' })
    )
    // stopPropagation: expanding must not also select the row.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/SELECT' })
    )
  })
})
