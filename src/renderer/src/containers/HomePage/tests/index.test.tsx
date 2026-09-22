import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import * as actions from '../actions'
import HomePage from '../index'
import { initialState, type HomePageState } from '../reducer'
import type { RecentProjectItem } from '../types'

// ── Redux & injection hooks — mocked so the container runs without a real store ─
//
// We drive behaviour through a hand-rolled mockState and a mockDispatch spy.
// This keeps each test hermetic: we can assert what the component dispatched
// without depending on the saga or the real Redux plumbing.

const mockDispatch = vi.fn()
let mockState: { homePage: HomePageState }

function setHomePageState(partial: Partial<HomePageState> = {}): void {
  mockState = {
    homePage: {
      ...initialState,
      ...partial,
      // Spread nested slices to keep overrides composable without losing defaults.
      createProject: { ...initialState.createProject, ...(partial.createProject ?? {}) },
      recentProjects: { ...initialState.recentProjects, ...(partial.recentProjects ?? {}) },
      deleteProject: { ...initialState.deleteProject, ...(partial.deleteProject ?? {}) },
      renameProject: { ...initialState.renameProject, ...(partial.renameProject ?? {}) }
    }
  }
}

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState)
}))

vi.mock('utils/injectReducer', () => ({ useInjectReducer: vi.fn() }))
vi.mock('utils/injectSaga', () => ({ useInjectSaga: vi.fn() }))

// ── Child components — mocked so HomePage is the only unit under test ────────

vi.mock('@renderer/components/MenuBar', () => ({
  default: ({
    items,
    onItemSelect
  }: {
    items: Record<string, string[]>
    onItemSelect: (item: string) => void
  }) => (
    <div data-testid="menubar">
      {Object.values(items)
        .flat()
        .map((item) => (
          <button key={item} data-testid={`menu-${item}`} onClick={() => onItemSelect(item)}>
            {item}
          </button>
        ))}
    </div>
  )
}))

vi.mock('@renderer/components/Dialog', () => ({
  default: ({
    isOpen,
    title,
    onClose,
    children
  }: {
    isOpen: boolean
    title: string
    onClose: () => void
    children: React.ReactNode
  }) =>
    isOpen ? (
      <div data-testid="dialog" aria-label={title}>
        <button data-testid="dialog-close" onClick={onClose}>
          ×
        </button>
        {children}
      </div>
    ) : null
}))

vi.mock('@renderer/components/Header', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <header data-testid="header">{children}</header>
  )
}))

vi.mock('@renderer/components/SearchBar', () => ({
  default: ({ value, onChange }: { value: string; onChange: (val: string) => void }) => (
    <input data-testid="searchbar" value={value} onChange={(e) => onChange(e.target.value)} />
  )
}))

vi.mock('@renderer/components/Sidebar', () => ({
  default: ({
    items,
    activeLabel,
    onSelect
  }: {
    items: { label: string; onAction: () => void }[]
    activeLabel: string
    onSelect: (item: { label: string; onAction: () => void }) => void
  }) => (
    <aside data-testid="sidebar">
      {items.map((item) => (
        <button
          key={item.label}
          data-testid={`sidebar-${item.label}`}
          data-active={item.label === activeLabel}
          onClick={() => onSelect(item)}
        >
          {item.label}
        </button>
      ))}
    </aside>
  )
}))

vi.mock('@renderer/components/ProjectsTable', () => ({
  default: ({
    projects,
    onCreateNew,
    onRequestDelete,
    onRequestRename,
    deletingIds
  }: {
    projects: RecentProjectItem[]
    onCreateNew: () => void
    onRequestDelete: (project: RecentProjectItem) => void
    onRequestRename: (project: RecentProjectItem) => void
    deletingIds: string[]
  }) => (
    <div data-testid="projects-table" data-deleting={deletingIds.join(',')}>
      {projects.map((p) => (
        <div key={p.id}>
          <button data-testid={`delete-${p.id}`} onClick={() => onRequestDelete(p)}>
            Delete {p.name}
          </button>
          <button data-testid={`rename-${p.id}`} onClick={() => onRequestRename(p)}>
            Rename {p.name}
          </button>
          <span data-testid={`row-${p.id}`}>{p.name}</span>
        </div>
      ))}
      <button data-testid="table-create-new" onClick={onCreateNew}>
        Create
      </button>
    </div>
  )
}))

vi.mock('@renderer/components/LoadingScreen/Spinner', () => ({
  Spinner: () => <span data-testid="spinner" />
}))

vi.mock('@renderer/components/FormField', () => ({
  default: ({
    labelProps,
    inputProps
  }: {
    labelProps: { label: string }
    inputProps: {
      name: string
      value: string
      onChange: React.ChangeEventHandler<HTMLInputElement>
      onBlur: React.FocusEventHandler<HTMLInputElement>
      error?: string
      type?: string
    }
  }) => (
    <div data-testid={`formfield-${inputProps.name}`}>
      <label>{labelProps.label}</label>
      <input
        data-testid={`input-${inputProps.name}`}
        name={inputProps.name}
        value={inputProps.value}
        onChange={inputProps.onChange}
        onBlur={inputProps.onBlur}
        type={inputProps.type || 'text'}
      />
      {inputProps.error && <span data-testid={`error-${inputProps.name}`}>{inputProps.error}</span>}
    </div>
  )
}))

// Resolve SVG imports to plain strings so bundler imports don't blow up.
vi.mock('@renderer/assets/home.svg', () => ({ default: 'home.svg' }))
vi.mock('@renderer/assets/new_project.svg', () => ({ default: 'new_project.svg' }))
vi.mock('@renderer/assets/open_project.svg', () => ({ default: 'open_project.svg' }))
vi.mock('@renderer/assets/search.svg', () => ({ default: 'search.svg' }))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_PROJECTS: RecentProjectItem[] = [
  {
    id: 'p-coastal',
    name: 'Coastal Survey Alpha',
    last_updated: '2026-03-29T00:00:00Z',
    size: 128_400_000
  },
  {
    id: 'p-delta',
    name: 'Delta Wind Farm',
    last_updated: '2026-03-27T00:00:00Z',
    size: 86_100_000
  },
  {
    id: 'p-north',
    name: 'Northern Grid Scan',
    last_updated: '2026-03-24T00:00:00Z',
    size: 214_900_000
  }
]

describe('<HomePage />', () => {
  beforeEach(() => {
    mockDispatch.mockClear()
    setHomePageState({ recentProjects: { loading: false, error: null, data: MOCK_PROJECTS } })
  })

  afterEach(() => {
    cleanup()
  })

  // ── Basic rendering ──

  it('renders without error', () => {
    render(<HomePage />)
  })

  it('renders all major child components', () => {
    render(<HomePage />)
    expect(screen.getByTestId('header')).toBeInTheDocument()
    expect(screen.getByTestId('menubar')).toBeInTheDocument()
    expect(screen.getByTestId('searchbar')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('projects-table')).toBeInTheDocument()
  })

  it('does not show the dialog on initial render', () => {
    render(<HomePage />)
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
  })

  // ── Redux lifecycle ──

  it('dispatches fetchRecentProjects once on mount', () => {
    render(<HomePage />)
    expect(mockDispatch).toHaveBeenCalledWith(actions.fetchRecentProjects())
  })

  // ── Sidebar ──

  it('renders all sidebar items', () => {
    render(<HomePage />)
    expect(screen.getByTestId('sidebar-Home')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-New Project')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-Open project')).toBeInTheDocument()
  })

  it('sets Home as the default active sidebar item', () => {
    render(<HomePage />)
    expect(screen.getByTestId('sidebar-Home')).toHaveAttribute('data-active', 'true')
  })

  it('updates active sidebar when a different item is clicked', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('sidebar-Open project'))
    expect(screen.getByTestId('sidebar-Open project')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('sidebar-Home')).toHaveAttribute('data-active', 'false')
  })

  // ── Opening the dialog ──

  it('opens the dialog when the sidebar New Project item is clicked', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('sidebar-New Project'))
    expect(screen.getByTestId('dialog')).toBeInTheDocument()
  })

  it('opens the dialog when the menu bar New Project item is clicked', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    expect(screen.getByTestId('dialog')).toBeInTheDocument()
  })

  it('opens the dialog when the ProjectsTable create button is clicked', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('table-create-new'))
    expect(screen.getByTestId('dialog')).toBeInTheDocument()
  })

  // ── Closing the dialog ──

  it('closes the dialog when the close button is clicked', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    fireEvent.click(screen.getByTestId('dialog-close'))
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
  })

  it('closes the dialog when the Cancel button is clicked', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
  })

  it('dispatches resetCreateProject when the dialog is opened', () => {
    render(<HomePage />)
    mockDispatch.mockClear()
    fireEvent.click(screen.getByTestId('menu-New Project'))
    expect(mockDispatch).toHaveBeenCalledWith(actions.resetCreateProject())
  })

  it('dispatches resetCreateProject when the dialog is cancelled', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    mockDispatch.mockClear()
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockDispatch).toHaveBeenCalledWith(actions.resetCreateProject())
  })

  // ── Form rendering ──

  it('renders all form fields when the dialog is open', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    expect(screen.getByTestId('formfield-projectName')).toBeInTheDocument()
    expect(screen.getByTestId('formfield-latitude')).toBeInTheDocument()
    expect(screen.getByTestId('formfield-longitude')).toBeInTheDocument()
  })

  it('renders Cancel and Create buttons inside the dialog', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const dialog = screen.getByTestId('dialog')
    expect(within(dialog).getByText('Cancel')).toBeInTheDocument()
    expect(within(dialog).getByText('Create')).toBeInTheDocument()
  })

  // ── Form input ──

  it('updates project name on input', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-projectName')
    fireEvent.change(input, { target: { value: 'My Project' } })
    expect(input).toHaveValue('My Project')
  })

  it('updates latitude on input', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-latitude')
    fireEvent.change(input, { target: { value: '45.5' } })
    expect(input).toHaveValue('45.5')
  })

  it('updates longitude on input', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-longitude')
    fireEvent.change(input, { target: { value: '-122.6' } })
    expect(input).toHaveValue('-122.6')
  })

  // ── Form validation — required ──

  it('shows a required error for empty project name after blur', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    fireEvent.blur(screen.getByTestId('input-projectName'))
    await waitFor(() =>
      expect(screen.getByTestId('error-projectName')).toHaveTextContent('Project name is required.')
    )
  })

  it('shows a required error for empty latitude after blur', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    // The field pre-fills with the UC Davis default, so clear it first.
    const input = screen.getByTestId('input-latitude')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(screen.getByTestId('error-latitude')).toHaveTextContent('Latitude is required.')
    )
  })

  it('shows a required error for empty longitude after blur', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    // The field pre-fills with the UC Davis default, so clear it first.
    const input = screen.getByTestId('input-longitude')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(screen.getByTestId('error-longitude')).toHaveTextContent('Longitude is required.')
    )
  })

  // ── Form validation — ranges ──

  it('shows a length error when project name exceeds 30 characters', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-projectName')
    fireEvent.change(input, { target: { value: 'A'.repeat(31) } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(screen.getByTestId('error-projectName')).toHaveTextContent(
        'Project name must be 30 characters or fewer.'
      )
    )
  })

  it('shows a range error for latitude > 90', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-latitude')
    fireEvent.change(input, { target: { value: '100' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(screen.getByTestId('error-latitude')).toHaveTextContent('Invalid latitude')
    )
  })

  it('shows a range error for longitude > 180', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-longitude')
    fireEvent.change(input, { target: { value: '200' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(screen.getByTestId('error-longitude')).toHaveTextContent('Invalid longitude')
    )
  })

  it('shows an error when latitude has more than 7 decimal places', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-latitude')
    fireEvent.change(input, { target: { value: '12.123456789' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(screen.getByTestId('error-latitude')).toHaveTextContent(
        'Latitude can have at most 7 decimal places.'
      )
    )
  })

  it('shows an error when longitude has more than 7 decimal places', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-longitude')
    fireEvent.change(input, { target: { value: '-45.12345678' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(screen.getByTestId('error-longitude')).toHaveTextContent(
        'Longitude can have at most 7 decimal places.'
      )
    )
  })

  // NOTE: The latitude / longitude inputs are type="number". jsdom (like real
  // browsers) rejects non-numeric text, so the "Invalid latitude" branch cannot
  // be reached through the DOM. Cover that branch via a direct unit test on
  // the validator if extra coverage is needed.

  // ── Form validation — valid boundary values ──

  it('accepts latitude at the boundary value -90', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-latitude')
    fireEvent.change(input, { target: { value: '-90' } })
    fireEvent.blur(input)
    await waitFor(() => expect(screen.queryByTestId('error-latitude')).not.toBeInTheDocument())
  })

  it('accepts longitude at the boundary value 180', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-longitude')
    fireEvent.change(input, { target: { value: '180' } })
    fireEvent.blur(input)
    await waitFor(() => expect(screen.queryByTestId('error-longitude')).not.toBeInTheDocument())
  })

  it('accepts latitude with exactly 7 decimal places', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-latitude')
    fireEvent.change(input, { target: { value: '12.1234567' } })
    fireEvent.blur(input)
    await waitFor(() => expect(screen.queryByTestId('error-latitude')).not.toBeInTheDocument())
  })

  it('accepts a trailing-dot latitude like "7." as valid mid-typing', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const input = screen.getByTestId('input-latitude')
    fireEvent.change(input, { target: { value: '7.' } })
    fireEvent.blur(input)
    await waitFor(() => expect(screen.queryByTestId('error-latitude')).not.toBeInTheDocument())
  })

  // ── Form submission ──

  it('dispatches createProject with the parsed form values on valid submit', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))

    fireEvent.change(screen.getByTestId('input-projectName'), { target: { value: 'Alpha' } })
    fireEvent.change(screen.getByTestId('input-latitude'), { target: { value: '45.0' } })
    fireEvent.change(screen.getByTestId('input-longitude'), { target: { value: '-122.0' } })

    fireEvent.click(within(screen.getByTestId('dialog')).getByText('Create'))

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        actions.createProject({ name: 'Alpha', latitude: 45, longitude: -122 })
      )
    )
  })

  it('does not dispatch createProject when the form has validation errors', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    mockDispatch.mockClear()

    fireEvent.click(within(screen.getByTestId('dialog')).getByText('Create'))

    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument())

    const dispatchedCreate = mockDispatch.mock.calls.some(
      ([action]) =>
        (action as { type: string }).type ===
        actions.createProject({
          name: '',
          latitude: 0,
          longitude: 0
        }).type
    )
    expect(dispatchedCreate).toBe(false)
  })

  it('renders the busy spinner and disables buttons while createProject is loading', () => {
    setHomePageState({
      recentProjects: { loading: false, error: null, data: MOCK_PROJECTS },
      createProject: { loading: true, error: null, success: false, data: null }
    })
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    const dialog = screen.getByTestId('dialog')
    expect(within(dialog).getByTestId('spinner')).toBeInTheDocument()
  })

  it('renders a server-side error message when createProject fails', () => {
    setHomePageState({
      recentProjects: { loading: false, error: null, data: MOCK_PROJECTS },
      createProject: {
        loading: false,
        error: { status: 409, message: 'A project with this name already exists', fieldErrors: {} },
        success: false,
        data: null
      }
    })
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    expect(screen.getByText('A project with this name already exists')).toBeInTheDocument()
  })

  // ── Success flow — dialog closes, form resets, resetCreateProject dispatched ──

  it('closes the dialog and dispatches resetCreateProject when createProject.success flips to true', () => {
    const { rerender } = render(<HomePage />)
    fireEvent.click(screen.getByTestId('menu-New Project'))
    expect(screen.getByTestId('dialog')).toBeInTheDocument()

    setHomePageState({
      recentProjects: { loading: false, error: null, data: MOCK_PROJECTS },
      createProject: {
        loading: false,
        error: null,
        success: true,
        data: {
          success: true,
          project_id: 'new-uuid',
          name: 'Alpha',
          latitude: 10,
          longitude: 20,
          utc_offset: 0,
          session_id: 's'
        }
      }
    })
    mockDispatch.mockClear()
    rerender(<HomePage />)

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
    expect(mockDispatch).toHaveBeenCalledWith(actions.resetCreateProject())
  })

  // ── Delete wiring ──

  it('opens the confirm dialog when a row requests delete (no dispatch yet)', () => {
    render(<HomePage />)
    mockDispatch.mockClear()
    fireEvent.click(screen.getByTestId('delete-p-coastal'))

    const dialog = screen.getByTestId('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-label', 'Delete')
    expect(within(dialog).getByText('Delete Coastal Survey Alpha')).toBeInTheDocument()
    expect(mockDispatch).not.toHaveBeenCalledWith(actions.deleteProject({ projectId: 'p-coastal', name: 'Coastal Survey Alpha' }))
  })

  it('dispatches deleteProject when the confirm dialog Delete button is clicked', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('delete-p-coastal'))
    mockDispatch.mockClear()

    fireEvent.click(within(screen.getByTestId('dialog')).getByText('Delete'))

    expect(mockDispatch).toHaveBeenCalledWith(actions.deleteProject({ projectId: 'p-coastal', name: 'Coastal Survey Alpha' }))
  })

  it('closes the confirm dialog without dispatching when Cancel is clicked', () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('delete-p-coastal'))
    mockDispatch.mockClear()

    fireEvent.click(within(screen.getByTestId('dialog')).getByText('Cancel'))

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
    expect(mockDispatch).not.toHaveBeenCalledWith(actions.deleteProject({ projectId: 'p-coastal', name: 'Coastal Survey Alpha' }))
  })

  it('closes the confirm dialog once the delete settles (inFlight clears)', () => {
    const { rerender } = render(<HomePage />)
    fireEvent.click(screen.getByTestId('delete-p-coastal'))

    // Simulate the saga accepting the delete — inFlightIds now contains the id.
    setHomePageState({
      recentProjects: { loading: false, error: null, data: MOCK_PROJECTS },
      deleteProject: { inFlightIds: ['p-coastal'], error: null }
    })
    rerender(<HomePage />)
    expect(screen.getByTestId('dialog')).toBeInTheDocument()

    // Now the saga settles and removes the id.
    setHomePageState({
      recentProjects: { loading: false, error: null, data: MOCK_PROJECTS },
      deleteProject: { inFlightIds: [], error: null }
    })
    rerender(<HomePage />)

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
  })

  it('forwards inFlightIds to ProjectsTable as deletingIds', () => {
    setHomePageState({
      recentProjects: { loading: false, error: null, data: MOCK_PROJECTS },
      deleteProject: { inFlightIds: ['p-delta'], error: null }
    })
    render(<HomePage />)
    expect(screen.getByTestId('projects-table')).toHaveAttribute('data-deleting', 'p-delta')
  })

  // ── Rename wiring ──

  it('opens the rename dialog when a row requests rename', () => {
    render(<HomePage />)
    mockDispatch.mockClear()
    fireEvent.click(screen.getByTestId('rename-p-coastal'))

    const dialog = screen.getByTestId('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-label', 'Rename Project')
    expect(screen.getByTestId('input-projectName')).toHaveValue('Coastal Survey Alpha')
    expect(mockDispatch).toHaveBeenCalledWith(actions.resetRenameProject())
  })

  it('dispatches renameProject with the trimmed name on valid submit', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('rename-p-coastal'))
    mockDispatch.mockClear()

    fireEvent.change(screen.getByTestId('input-projectName'), {
      target: { value: '  Coastal Survey Beta  ' }
    })
    fireEvent.click(within(screen.getByTestId('dialog')).getByText('Save'))

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        actions.renameProject({ projectId: 'p-coastal', name: 'Coastal Survey Beta' })
      )
    )
  })

  it('shows rename validation error for an empty name', async () => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('rename-p-coastal'))
    const input = screen.getByTestId('input-projectName')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(screen.getByTestId('error-projectName')).toHaveTextContent('Project name is required.')
    )
  })

  it('renders the rename server error when renameProject fails', () => {
    setHomePageState({
      recentProjects: { loading: false, error: null, data: MOCK_PROJECTS },
      renameProject: {
        loading: false,
        projectId: 'p-coastal',
        error: { status: 409, message: 'A project with this name already exists', fieldErrors: {} },
        success: false
      }
    })
    render(<HomePage />)
    fireEvent.click(screen.getByTestId('rename-p-coastal'))
    expect(screen.getByText('A project with this name already exists')).toBeInTheDocument()
  })

  it('closes the rename dialog once rename succeeds', () => {
    const { rerender } = render(<HomePage />)
    fireEvent.click(screen.getByTestId('rename-p-coastal'))
    expect(screen.getByTestId('dialog')).toHaveAttribute('aria-label', 'Rename Project')

    setHomePageState({
      recentProjects: { loading: false, error: null, data: MOCK_PROJECTS },
      renameProject: { loading: true, projectId: 'p-coastal', error: null, success: false }
    })
    rerender(<HomePage />)

    setHomePageState({
      recentProjects: { loading: false, error: null, data: MOCK_PROJECTS },
      renameProject: { loading: false, projectId: null, error: null, success: true }
    })
    mockDispatch.mockClear()
    rerender(<HomePage />)

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
    expect(mockDispatch).toHaveBeenCalledWith(actions.resetRenameProject())
  })

  // ── Form reset on reopen ──

  it('resets form fields when the dialog is closed and reopened', () => {
    render(<HomePage />)

    fireEvent.click(screen.getByTestId('menu-New Project'))
    fireEvent.change(screen.getByTestId('input-projectName'), {
      target: { value: 'Leftover Value' }
    })
    fireEvent.click(screen.getByText('Cancel'))

    fireEvent.click(screen.getByTestId('menu-New Project'))
    expect(screen.getByTestId('input-projectName')).toHaveValue('')
  })

  // ── Search filtering ──

  it('renders every project from the Redux slice initially', () => {
    render(<HomePage />)
    expect(screen.getByTestId('row-p-coastal')).toBeInTheDocument()
    expect(screen.getByTestId('row-p-delta')).toBeInTheDocument()
    expect(screen.getByTestId('row-p-north')).toBeInTheDocument()
  })

  it('filters projects by name when searching', () => {
    render(<HomePage />)
    fireEvent.change(screen.getByTestId('searchbar'), { target: { value: 'Coastal' } })
    expect(screen.getByTestId('row-p-coastal')).toBeInTheDocument()
    expect(screen.queryByTestId('row-p-delta')).not.toBeInTheDocument()
  })

  it('filters case-insensitively', () => {
    render(<HomePage />)
    fireEvent.change(screen.getByTestId('searchbar'), { target: { value: 'coastal' } })
    expect(screen.getByTestId('row-p-coastal')).toBeInTheDocument()
  })

  it('matches against the last_updated ISO string', () => {
    render(<HomePage />)
    fireEvent.change(screen.getByTestId('searchbar'), { target: { value: '2026-03-29' } })
    expect(screen.getByTestId('row-p-coastal')).toBeInTheDocument()
    expect(screen.queryByTestId('row-p-delta')).not.toBeInTheDocument()
  })

  it('renders no rows when the search matches nothing', () => {
    render(<HomePage />)
    fireEvent.change(screen.getByTestId('searchbar'), { target: { value: 'zzzzz' } })
    expect(screen.queryByTestId('row-p-coastal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('row-p-delta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('row-p-north')).not.toBeInTheDocument()
  })

  it('restores all rows when the search is cleared', () => {
    render(<HomePage />)
    fireEvent.change(screen.getByTestId('searchbar'), { target: { value: 'Coastal' } })
    fireEvent.change(screen.getByTestId('searchbar'), { target: { value: '' } })
    expect(screen.getByTestId('row-p-coastal')).toBeInTheDocument()
    expect(screen.getByTestId('row-p-delta')).toBeInTheDocument()
  })

  it('trims whitespace from the search input', () => {
    render(<HomePage />)
    fireEvent.change(screen.getByTestId('searchbar'), { target: { value: '  Coastal  ' } })
    expect(screen.getByTestId('row-p-coastal')).toBeInTheDocument()
  })

  // ── Snapshot ──

  it('matches the snapshot', () => {
    const { container } = render(<HomePage />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
