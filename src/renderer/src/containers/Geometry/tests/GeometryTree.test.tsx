import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import GeometryTree from '../GeometryTree'
import { SPRING_OPEN_MS } from '../TreeRow'
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

// During dragover the payload is unreadable — only the mime LIST is exposed,
// and that is what the row reads to recognise an incoming material.
const materialDragOverTransfer = (): { types: string[]; dropEffect: string } => ({
  types: [MATERIAL_DND_MIME],
  dropEffect: ''
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
// The render icon's per-model menu reads the model catalog via selectModelTypes;
// seed the six top-level models so the per-model rows render (Radiation = id 1).
const MODEL_TYPES = [
  { id: 1, model: 'Radiation', description: '' },
  { id: 2, model: 'Energy Balance', description: '' },
  { id: 3, model: 'Solar Position', description: '' },
  { id: 4, model: 'Photosynthesis', description: '' },
  { id: 5, model: 'Boundary Layer Conductance', description: '' },
  { id: 6, model: 'Stomatal Conductance', description: '' }
]

// The material library the drop handler checks a node's group ids against — an
// id missing from here is a material that was DELETED, so it must not count as
// "this ground already has a material". Both ids the drop tests use are present
// by default; the deleted-material case passes a library without '9'.
const LIBRARY = { '7': { id: '7', name: 'Grass' }, '9': { id: '9', name: 'Soil' } }

const makeStore = (
  scenario: ScenarioGeometry,
  materialsById: Record<string, unknown> = LIBRARY,
  pendingObjectIds: number[] = [],
  savingObjectId: string | null = null
): never => {
  const state = {
    geometry: { byScope: { [scopeKey('p1', 's1')]: scenario }, savingObjectId },
    materials: { byId: materialsById, order: Object.keys(materialsById) },
    threeDWindow: {
      scene: { objectIds: [], pendingObjectIds, geometryVersion: 0, fitVersion: 0 },
      sceneLoad: {
        loading: false,
        objectLoading: false,
        selectionLoading: false,
        meshReady: true,
        error: null,
        selectedObjectId: null
      }
    },
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

const renderTree = (
  scenario: ScenarioGeometry,
  materialsById?: Record<string, unknown>,
  pendingObjectIds?: number[],
  savingObjectId?: string | null
) =>
  render(
    <Provider store={makeStore(scenario, materialsById, pendingObjectIds, savingObjectId)}>
      <GeometryTree />
    </Provider>
  )

beforeEach(() => dispatch.mockClear())

describe('the downloading indicator', () => {
  // A ground at 1000×1000 is 228 MB. Until it lands the row has nothing to say
  // about itself, which reads as finished — so the kind icon gives up its slot
  // to a spinner while the binary is on the wire.
  const geometries = {
    ...emptyScenarioGeometry(),
    loadStatus: 'loaded' as const,
    nodesById: { '28': ground('28', 'Ground.001'), '30': ground('30', 'Ground.002') },
    rootOrder: ['28', '30']
  }

  const rowOf = (name: string): HTMLElement =>
    screen.getByText(name).closest('[role="button"]') as HTMLElement

  it('spins only the row whose binary is downloading', () => {
    renderTree(geometries, undefined, [28])

    expect(within(rowOf('Ground.001')).getByRole('img', { name: 'Loading' })).toBeInTheDocument()
    expect(within(rowOf('Ground.002')).queryByRole('img', { name: 'Loading' })).toBeNull()
  })

  it('shows the kind icon again once nothing is pending', () => {
    renderTree(geometries, undefined, [])

    expect(screen.queryByRole('img', { name: 'Loading' })).toBeNull()
  })

  it('spins the row whose Properties-form save is in flight', () => {
    // The form is in the RIGHT panel. Without this the left tree gives no sign
    // that anything is happening to the geometry being saved.
    renderTree(geometries, undefined, [], '28')

    expect(within(rowOf('Ground.001')).getByRole('img', { name: 'Loading' })).toBeInTheDocument()
    expect(within(rowOf('Ground.002')).queryByRole('img', { name: 'Loading' })).toBeNull()
  })

  it('spins the row whose delete is in flight', () => {
    renderTree({ ...geometries, deletingIds: ['30'] })

    expect(within(rowOf('Ground.002')).getByRole('img', { name: 'Loading' })).toBeInTheDocument()
    expect(within(rowOf('Ground.001')).queryByRole('img', { name: 'Loading' })).toBeNull()
  })

  it('never spins a group — its members each report their own', () => {
    renderTree(
      {
        ...emptyScenarioGeometry(),
        loadStatus: 'loaded',
        nodesById: { '9': group('9', 'Group.001', []) },
        rootOrder: ['9']
      },
      undefined,
      [9]
    )

    expect(screen.queryByRole('img', { name: 'Loading' })).toBeNull()
  })
})

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

  it('keeps the cluster present but hidden until hover/selected, with no separate menu trigger', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a']
    })
    // The always-visible kebab is gone: its menu now hangs off the render icon.
    expect(screen.queryByLabelText('More options')).toBeNull()
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

  it('right-clicking the render icon opens the per-model menu and toggles a single model', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a']
    })
    fireEvent.contextMenu(screen.getByLabelText('Hide from render'))
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
    // Only Radiation is off, so the master switch still reads "Hide from render".
    fireEvent.contextMenu(screen.getByLabelText('Hide from render'))
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
    // Left click is the master switch only — the menu is the right-click gesture.
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('right-clicking the render icon opens the menu without toggling render', () => {
    // The two gestures share one icon, so the one that opens the menu must not
    // also flip every model on the way.
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a']
    })
    fireEvent.contextMenu(screen.getByLabelText('Hide from render'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/TOGGLE_RENDER' })
    )
  })

  it('closes the per-model menu on Escape', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: ground('a', 'Ground.001') },
      rootOrder: ['a'],
      selectedIds: ['a']
    })
    fireEvent.contextMenu(screen.getByLabelText('Hide from render'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
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

  describe('spring-loaded groups', () => {
    // The dwell is timer-driven; drive the clock rather than waiting on it.
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const collapsedGroup = (): ScenarioGeometry => ({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: {
        g: group('g', 'Group.001', ['a'], false),
        a: ground('a', 'Ground.001', 'g')
      },
      rootOrder: ['g']
    })

    it('opens a collapsed group once a material has hovered it for the full dwell', () => {
      renderTree(collapsedGroup())
      const target = screen.getByText('Group.001').closest('[role="button"]')!

      fireEvent.dragOver(target, { dataTransfer: materialDragOverTransfer() })
      act(() => vi.advanceTimersByTime(SPRING_OPEN_MS))

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app/Geometry/TOGGLE_EXPAND', id: 'g' })
      )
    })

    it('leaves the group closed until the full dwell has elapsed', () => {
      renderTree(collapsedGroup())
      const target = screen.getByText('Group.001').closest('[role="button"]')!

      fireEvent.dragOver(target, { dataTransfer: materialDragOverTransfer() })
      act(() => vi.advanceTimersByTime(SPRING_OPEN_MS - 1))

      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app/Geometry/TOGGLE_EXPAND' })
      )
    })

    it('does not restart the dwell on every dragover', () => {
      // dragover repeats several times a second while the pointer sits still —
      // if each one reset the timer the group would never open.
      renderTree(collapsedGroup())
      const target = screen.getByText('Group.001').closest('[role="button"]')!

      fireEvent.dragOver(target, { dataTransfer: materialDragOverTransfer() })
      act(() => vi.advanceTimersByTime(SPRING_OPEN_MS - 100))
      fireEvent.dragOver(target, { dataTransfer: materialDragOverTransfer() })
      act(() => vi.advanceTimersByTime(100))

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app/Geometry/TOGGLE_EXPAND', id: 'g' })
      )
    })

    it('cancels the spring-open when the material leaves before the dwell', () => {
      renderTree(collapsedGroup())
      const target = screen.getByText('Group.001').closest('[role="button"]')!

      fireEvent.dragEnter(target)
      fireEvent.dragOver(target, { dataTransfer: materialDragOverTransfer() })
      act(() => vi.advanceTimersByTime(SPRING_OPEN_MS - 100))
      fireEvent.dragLeave(target)
      act(() => vi.advanceTimersByTime(SPRING_OPEN_MS))

      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app/Geometry/TOGGLE_EXPAND' })
      )
    })

    it("keeps the dwell running when the cursor crosses the row's own children", () => {
      // Grazing the group's name fires a bubbled enter/leave pair, but the
      // pointer never left the row — the dwell must survive it.
      renderTree(collapsedGroup())
      const label = screen.getByText('Group.001')
      const target = label.closest('[role="button"]')!

      fireEvent.dragEnter(target)
      fireEvent.dragOver(target, { dataTransfer: materialDragOverTransfer() })
      act(() => vi.advanceTimersByTime(SPRING_OPEN_MS - 100))
      // Moving onto the name: the browser fires dragenter on the child (which
      // bubbles here) before dragleave on the row.
      fireEvent.dragEnter(label)
      fireEvent.dragLeave(target)
      act(() => vi.advanceTimersByTime(100))

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app/Geometry/TOGGLE_EXPAND', id: 'g' })
      )
    })

    it('never springs an already-expanded group (that would collapse it)', () => {
      renderTree({
        ...collapsedGroup(),
        nodesById: {
          g: group('g', 'Group.001', ['a'], true),
          a: ground('a', 'Ground.001', 'g')
        }
      })
      const target = screen.getByText('Group.001').closest('[role="button"]')!

      fireEvent.dragOver(target, { dataTransfer: materialDragOverTransfer() })
      act(() => vi.advanceTimersByTime(SPRING_OPEN_MS * 2))

      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app/Geometry/TOGGLE_EXPAND' })
      )
    })

    it('never springs a leaf row', () => {
      renderTree({
        ...emptyScenarioGeometry(),
        loadStatus: 'loaded',
        nodesById: { a: ground('a', 'Ground.001') },
        rootOrder: ['a']
      })
      const target = screen.getByText('Ground.001').closest('[role="button"]')!

      fireEvent.dragOver(target, { dataTransfer: materialDragOverTransfer() })
      act(() => vi.advanceTimersByTime(SPRING_OPEN_MS * 2))

      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app/Geometry/TOGGLE_EXPAND' })
      )
    })

    it('does not spring for a geometry row drag, only a material', () => {
      renderTree(collapsedGroup())
      const target = screen.getByText('Group.001').closest('[role="button"]')!

      // A row drag exposes the tree's own mime, not the material one.
      fireEvent.dragOver(target, {
        dataTransfer: { types: ['application/x-geo'], dropEffect: '' },
        clientY: 0
      })
      act(() => vi.advanceTimersByTime(SPRING_OPEN_MS * 2))

      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app/Geometry/TOGGLE_EXPAND' })
      )
    })
  })

  it('confirms before a dropped material replaces the one already on a leaf', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: { ...ground('a', 'Ground.001'), materialGroupIds: ['9'] } },
      rootOrder: ['a']
    })
    const target = screen.getByText('Ground.001').closest('[role="button"]')!
    fireEvent.drop(target, { dataTransfer: materialDataTransfer('7', 'Grass') })

    // Nothing committed yet — the existing material stands until Replace.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED' })
    )
    expect(
      screen.getByText(
        'Are you sure you want to replace the material already assigned to Ground.001?'
      )
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED',
        objectIds: ['a'],
        groupId: '7',
        targetName: 'Ground.001'
      })
    )
  })

  it('does not confirm a replace when the material on the leaf was deleted', () => {
    // Group 9 is gone from the library: the delete already unassigned it server-
    // side, and the node only kept the id for the viewport's refetch gate. The
    // ground is bare, so there is nothing to replace — assign straight away
    // instead of asking the user to confirm replacing a material that is gone.
    renderTree(
      {
        ...emptyScenarioGeometry(),
        loadStatus: 'loaded',
        nodesById: { a: { ...ground('a', 'Ground.001'), materialGroupIds: ['9'] } },
        rootOrder: ['a']
      },
      { '7': { id: '7', name: 'Grass' } }
    )
    fireEvent.drop(screen.getByText('Ground.001').closest('[role="button"]')!, {
      dataTransfer: materialDataTransfer('7', 'Grass')
    })

    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED',
        objectIds: ['a'],
        groupId: '7',
        targetName: 'Ground.001'
      })
    )
  })

  it('cancelling the replace confirmation leaves the existing material alone', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: { ...ground('a', 'Ground.001'), materialGroupIds: ['9'] } },
      rootOrder: ['a']
    })
    fireEvent.drop(screen.getByText('Ground.001').closest('[role="button"]')!, {
      dataTransfer: materialDataTransfer('7', 'Grass')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED' })
    )
    expect(document.querySelector('dialog[open]')).toBeNull()
  })

  it('reports "already assigned" when the dropped material is the one the leaf carries', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: { a: { ...ground('a', 'Ground.001'), materialGroupIds: ['7'] } },
      rootOrder: ['a']
    })
    fireEvent.drop(screen.getByText('Ground.001').closest('[role="button"]')!, {
      dataTransfer: materialDataTransfer('7', 'Grass')
    })

    // No confirmation and no POST — there is nothing to replace.
    expect(dispatch).toHaveBeenCalledWith({
      type: 'app/snackbar/SHOW',
      payload: { message: 'This material is already assigned to Ground.001', variant: 'info' }
    })
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED' })
    )
    expect(document.querySelector('dialog[open]')).toBeNull()
  })

  it('confirms a group drop when ANY member would lose a different material', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: {
        g: group('g', 'Group.001', ['a', 'b']),
        a: ground('a', 'Ground.001', 'g'),
        b: { ...ground('b', 'Ground.002', 'g'), materialGroupIds: ['9'] }
      },
      rootOrder: ['g']
    })
    fireEvent.drop(screen.getByText('Group.001').closest('[role="button"]')!, {
      dataTransfer: materialDataTransfer('7', 'Grass')
    })

    // The message names the row the material landed on — the group.
    expect(
      screen.getByText(
        'Are you sure you want to replace the material already assigned to Group.001?'
      )
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED',
        objectIds: ['a', 'b'],
        targetName: 'Group.001'
      })
    )
  })

  it('reports "already assigned" when every group member already carries the material', () => {
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: {
        g: group('g', 'Group.001', ['a', 'b']),
        a: { ...ground('a', 'Ground.001', 'g'), materialGroupIds: ['7'] },
        b: { ...ground('b', 'Ground.002', 'g'), materialGroupIds: ['7'] }
      },
      rootOrder: ['g']
    })
    fireEvent.drop(screen.getByText('Group.001').closest('[role="button"]')!, {
      dataTransfer: materialDataTransfer('7', 'Grass')
    })

    expect(dispatch).toHaveBeenCalledWith({
      type: 'app/snackbar/SHOW',
      payload: { message: 'This material is already assigned to Group.001', variant: 'info' }
    })
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED' })
    )
  })

  it('assigns only the members that lack it when a group mixes bare and already-assigned', () => {
    // Nothing is displaced, and the member that already carries the material is
    // left out of the request entirely rather than being reassigned.
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: {
        g: group('g', 'Group.001', ['a', 'b']),
        a: { ...ground('a', 'Ground.001', 'g'), materialGroupIds: ['7'] },
        b: ground('b', 'Ground.002', 'g')
      },
      rootOrder: ['g']
    })
    fireEvent.drop(screen.getByText('Group.001').closest('[role="button"]')!, {
      dataTransfer: materialDataTransfer('7', 'Grass')
    })

    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED',
        objectIds: ['b'],
        groupId: '7'
      })
    )
  })

  it('leaves a member that already carries the material out of a replacing group drop', () => {
    // One member has the dropped material, one has a different one: only the
    // second is touched, and the first is never reassigned.
    renderTree({
      ...emptyScenarioGeometry(),
      loadStatus: 'loaded',
      nodesById: {
        g: group('g', 'Group.001', ['a', 'b']),
        a: { ...ground('a', 'Ground.001', 'g'), materialGroupIds: ['7'] },
        b: { ...ground('b', 'Ground.002', 'g'), materialGroupIds: ['9'] }
      },
      rootOrder: ['g']
    })
    fireEvent.drop(screen.getByText('Group.001').closest('[role="button"]')!, {
      dataTransfer: materialDataTransfer('7', 'Grass')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/Geometry/ASSIGN_MATERIAL_REQUESTED',
        objectIds: ['b'],
        groupId: '7'
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
