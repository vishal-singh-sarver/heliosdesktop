import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import GeometryTree from '../GeometryTree'
import { emptyScenarioGeometry, scopeKey } from '../reducer'
import type { GeoNode, ScenarioGeometry } from '../types'

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
  modelVisibility: { mode: 'all' }
})

const group = (id: string, name: string, childIds: string[], expanded = false): GeoNode => ({
  id,
  name,
  kind: 'group',
  parentId: null,
  childIds,
  expanded,
  visibleInViewport: true,
  modelVisibility: { mode: 'all' }
})

const dispatch = vi.fn()

// Minimal mock store: getState returns the shape the geometry + ProjectScreen
// selectors read; dispatch is a spy so we can assert toggleExpand fires.
const makeStore = (scenario: ScenarioGeometry): never => {
  const state = {
    geometry: { byScope: { [scopeKey('p1', 's1')]: scenario } },
    projectScreen: { activeProjectId: 'p1', activeScenarioId: 's1' }
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

  it('always shows the kebab; hides the visibility cluster until selected', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a']
    })
    expect(screen.getByLabelText('More options')).toBeInTheDocument()
    // Not selected → no eye/trash cluster.
    expect(screen.queryByLabelText('Hide from viewport')).toBeNull()
    expect(screen.queryByLabelText('Delete')).toBeNull()
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
    expect(screen.getByLabelText('Delete')).toBeInTheDocument()
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
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/SET_MODEL_VISIBILITY',
        id: 'a',
        payload: expect.objectContaining({ mode: 'custom' })
      })
    )
  })

  it('shows a hidden model with a greyed, unchecked row', () => {
    const customHidden = {
      ...ground('a', 'Ground.001'),
      modelVisibility: {
        mode: 'custom' as const,
        perModel: {
          solar_position: true,
          radiation: false,
          energy_balance: true,
          photosynthesis: true,
          stomatal_conductance: true
        }
      }
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

  it('dims a row that is hidden from the viewport', () => {
    const hidden = { ...ground('a', 'Ground.001'), visibleInViewport: false }
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: hidden },
      rootOrder: ['a']
    })
    const row = screen.getByText('Ground.001').closest('[role="button"]')
    expect(row?.className).toContain('opacity-50')
  })

  it('a selected GROUP row also reveals the cluster (render/eye/delete)', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { g: group('g', 'Group.001', []) },
      rootOrder: ['g'],
      selectedIds: ['g']
    })
    expect(screen.getByLabelText('Hide from all models')).toBeInTheDocument()
    expect(screen.getByLabelText('Hide from viewport')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete')).toBeInTheDocument()
  })

  it('clicking the cluster render icon dispatches setModelVisibility (hide all)', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a']
    })
    fireEvent.click(screen.getByLabelText('Hide from all models'))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/SET_MODEL_VISIBILITY',
        id: 'a',
        payload: { mode: 'none' }
      })
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

  it('confirming delete on a selected group dispatches deleteNodeRequested with the child count message', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { g: group('g', 'Group.001', ['c']), c: ground('c', 'Ground.003', 'g') },
      rootOrder: ['g'],
      selectedIds: ['g']
    })
    // The cluster trash (now shown for groups too) opens the confirm dialog.
    fireEvent.click(screen.getByLabelText('Delete'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete "Group.001" and its 1 geometry?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/DELETE_NODE_REQUESTED', id: 'g' })
    )
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
