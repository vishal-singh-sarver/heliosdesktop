import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { formatBytes } from 'utils/format'
import type { RecentProjectItem } from '../../../containers/HomePage/types'
import ProjectsTable from '../index'

// ── Mocks ───────────────────────────────────────────────────────────────────

// EmptyState has its own suite — shallow it here so we can verify wiring only.
vi.mock('../../EmptyState', () => ({
  default: ({ onCreateNew }: { onCreateNew: () => void }) => (
    <div data-testid="empty-state">
      <button onClick={onCreateNew}>Add New</button>
    </div>
  )
}))

// The table imports two SVG assets; stub them so the bundler does not choke
// and so we can assert className changes on them in render output.
vi.mock('@renderer/assets/delete.svg', () => ({ default: 'delete.svg' }))
vi.mock('@renderer/assets/edit.svg', () => ({ default: 'edit.svg' }))
vi.mock('@renderer/assets/Kebab Menu.svg', () => ({ default: 'kebab.svg' }))
vi.mock('@renderer/assets/Sort 3.svg', () => ({ default: 'sort.svg' }))

// ── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_PROJECTS: RecentProjectItem[] = [
  { id: 'p-alpha', name: 'Alpha Project', last_updated: '2026-03-29T09:15:00Z', size: 128_400_000 },
  { id: 'p-beta', name: 'Beta Project', last_updated: '2026-03-27T14:42:00Z', size: 86_100_000 },
  { id: 'p-gamma', name: 'Gamma Project', last_updated: '2026-03-24T18:05:00Z', size: 214_900_000 }
]

describe('<ProjectsTable />', () => {
  const defaultProps = {
    projects: MOCK_PROJECTS,
    emptyIcon: 'search.svg',
    onCreateNew: vi.fn(),
    onRequestDelete: vi.fn(),
    onRequestRename: vi.fn(),
    deletingIds: [] as string[]
  }

  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders without error', () => {
    render(<ProjectsTable {...defaultProps} />)
  })

  // ── onRowClick ──

  // Verifies double-clicking a row fires onRowClick with that project's id
  it('fires onRowClick with the project id when a row is double-clicked', () => {
    const onRowClick = vi.fn()
    render(<ProjectsTable {...defaultProps} onRowClick={onRowClick} />)
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Open project Alpha Project' }))
    expect(onRowClick).toHaveBeenCalledWith('p-alpha')
  })

  // Verifies a single click does not open the project
  it('does not fire onRowClick on a single click', () => {
    const onRowClick = vi.fn()
    render(<ProjectsTable {...defaultProps} onRowClick={onRowClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open project Alpha Project' }))
    expect(onRowClick).not.toHaveBeenCalled()
  })

  // Verifies the component does not throw when no onRowClick is provided
  it('does not throw when double-clicking a row with no onRowClick prop', () => {
    render(<ProjectsTable {...defaultProps} />)
    expect(() =>
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Open project Alpha Project' }))
    ).not.toThrow()
  })

  // Verifies the page heading is displayed
  it('renders the heading', () => {
    render(<ProjectsTable {...defaultProps} />)
    expect(screen.getByText('Recent Projects')).toBeInTheDocument()
  })

  it('renders all three sortable column headers', () => {
    render(<ProjectsTable {...defaultProps} />)
    expect(screen.getByRole('button', { name: /^name/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^last updated/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^size/i })).toBeInTheDocument()
  })

  it('renders a row for every project', () => {
    render(<ProjectsTable {...defaultProps} />)
    expect(screen.getByText('Alpha Project')).toBeInTheDocument()
    expect(screen.getByText('Beta Project')).toBeInTheDocument()
    expect(screen.getByText('Gamma Project')).toBeInTheDocument()
  })

  it('formats the size column with formatBytes', () => {
    render(<ProjectsTable {...defaultProps} />)
    expect(screen.getByText(formatBytes(128_400_000))).toBeInTheDocument()
    expect(screen.getByText(formatBytes(86_100_000))).toBeInTheDocument()
    expect(screen.getByText(formatBytes(214_900_000))).toBeInTheDocument()
  })

  // ── Row action buttons ────────────────────────────────────────────────────

  it('exposes an "Open project" button for each row with an accessible label', () => {
    render(<ProjectsTable {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Open project Alpha Project' })).toBeInTheDocument()
  })

  it('exposes an actions button for each row with an accessible label', () => {
    render(<ProjectsTable {...defaultProps} />)
    expect(
      screen.getByRole('button', { name: 'Open actions for Alpha Project' })
    ).toBeInTheDocument()
  })

  it('opens a menu with Rename and Delete when the actions button is clicked', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for Alpha Project' }))
    expect(screen.getByRole('menu', { name: 'Actions for Alpha Project' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('calls onRequestDelete with the project when the delete button is clicked', () => {
    const onRequestDelete = vi.fn()
    render(<ProjectsTable {...defaultProps} onRequestDelete={onRequestDelete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for Beta Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onRequestDelete).toHaveBeenCalledTimes(1)
    expect(onRequestDelete).toHaveBeenCalledWith(MOCK_PROJECTS.find((p) => p.id === 'p-beta'))
  })

  it('calls onRequestRename with the project when the rename menu item is clicked', () => {
    const onRequestRename = vi.fn()
    render(<ProjectsTable {...defaultProps} onRequestRename={onRequestRename} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for Gamma Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onRequestRename).toHaveBeenCalledTimes(1)
    expect(onRequestRename).toHaveBeenCalledWith(MOCK_PROJECTS.find((p) => p.id === 'p-gamma'))
  })

  it('disables the actions button for projects listed in deletingIds', () => {
    render(<ProjectsTable {...defaultProps} deletingIds={['p-alpha']} />)
    const btn = screen.getByRole('button', { name: 'Open actions for Alpha Project' })
    expect(btn).toBeDisabled()
  })

  it('does not fire onRequestDelete when a disabled delete button is clicked', () => {
    const onRequestDelete = vi.fn()
    render(
      <ProjectsTable
        {...defaultProps}
        deletingIds={['p-alpha']}
        onRequestDelete={onRequestDelete}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for Alpha Project' }))
    expect(onRequestDelete).not.toHaveBeenCalled()
  })

  it('closes the menu on Escape', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for Alpha Project' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('toggles the actions menu closed when its own button is clicked again', () => {
    render(<ProjectsTable {...defaultProps} />)
    const btn = screen.getByRole('button', { name: 'Open actions for Alpha Project' })
    fireEvent.click(btn)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // Second click on the SAME actions button toggles it closed.
    fireEvent.click(btn)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('ignores non-Escape key presses while the menu is open', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for Alpha Project' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'a' })
    // A different key must leave the menu open (Escape-only close path).
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  // ── Outside-click dismissal (document pointerdown listener) ────────────────

  it('closes the menu on a pointerdown outside the table body', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for Alpha Project' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // Pointer target outside the menu root (tbody) → menu closes.
    const outside = document.body
    fireEvent.pointerDown(outside)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps the menu open on a pointerdown inside the table body', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open actions for Alpha Project' }))
    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()

    // Pointer target inside the menu root → handler returns early, menu stays.
    fireEvent.pointerDown(menu)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  // ── Keyboard row activation (Enter / Space) ───────────────────────────────

  it('opens the project on Enter keydown on a row', () => {
    const onRowClick = vi.fn()
    render(<ProjectsTable {...defaultProps} onRowClick={onRowClick} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open project Alpha Project' }), {
      key: 'Enter'
    })
    expect(onRowClick).toHaveBeenCalledWith('p-alpha')
  })

  it('opens the project on Space keydown on a row', () => {
    const onRowClick = vi.fn()
    render(<ProjectsTable {...defaultProps} onRowClick={onRowClick} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open project Beta Project' }), {
      key: ' '
    })
    expect(onRowClick).toHaveBeenCalledWith('p-beta')
  })

  it('does not open the project on an unrelated keydown', () => {
    const onRowClick = vi.fn()
    render(<ProjectsTable {...defaultProps} onRowClick={onRowClick} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open project Alpha Project' }), {
      key: 'a'
    })
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('does not throw on Enter keydown when no onRowClick prop is provided', () => {
    render(<ProjectsTable {...defaultProps} />)
    expect(() =>
      fireEvent.keyDown(screen.getByRole('button', { name: 'Open project Alpha Project' }), {
        key: 'Enter'
      })
    ).not.toThrow()
  })

  // ── Empty state ──────────────────────────────────────────────────────────

  it('renders EmptyState when projects array is empty', () => {
    render(<ProjectsTable {...defaultProps} projects={[]} />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('calls onCreateNew when EmptyState CTA is clicked', () => {
    const onCreateNew = vi.fn()
    render(<ProjectsTable {...defaultProps} projects={[]} onCreateNew={onCreateNew} />)
    fireEvent.click(screen.getByText('Add New'))
    expect(onCreateNew).toHaveBeenCalledTimes(1)
  })

  it('does not render EmptyState when projects exist', () => {
    render(<ProjectsTable {...defaultProps} />)
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
  })

  // ── Default sort ─────────────────────────────────────────────────────────

  // Default sort is `last_updated` descending — newest first.
  it('defaults to sorting by Last Updated descending (newest first)', () => {
    render(<ProjectsTable {...defaultProps} />)
    const header = screen.getByRole('columnheader', { name: /last updated/i })
    expect(header).toHaveAttribute('aria-sort', 'descending')

    const rows = screen.getAllByRole('button', { name: /^Open project/i })
    expect(rows[0]).toHaveTextContent('Alpha Project') // 2026-03-29
    expect(rows[1]).toHaveTextContent('Beta Project') // 2026-03-27
    expect(rows[2]).toHaveTextContent('Gamma Project') // 2026-03-24
  })

  // ── Sorting by name ───────────────────────────────────────────────────────

  it('sorts by name ascending when the Name header is clicked', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /^name/i }))

    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute(
      'aria-sort',
      'ascending'
    )

    const rows = screen.getAllByRole('button', { name: /^Open project/i })
    expect(rows[0]).toHaveTextContent('Alpha Project')
    expect(rows[1]).toHaveTextContent('Beta Project')
    expect(rows[2]).toHaveTextContent('Gamma Project')
  })

  it('toggles name sort to descending on the second click', () => {
    render(<ProjectsTable {...defaultProps} />)
    const nameHeader = screen.getByRole('button', { name: /^name/i })
    fireEvent.click(nameHeader)
    fireEvent.click(nameHeader)

    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute(
      'aria-sort',
      'descending'
    )

    const rows = screen.getAllByRole('button', { name: /^Open project/i })
    expect(rows[0]).toHaveTextContent('Gamma Project')
    expect(rows[1]).toHaveTextContent('Beta Project')
    expect(rows[2]).toHaveTextContent('Alpha Project')
  })

  // ── Sorting by date ──────────────────────────────────────────────────────

  it('toggles Last Updated to ascending on click (oldest first)', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /^last updated/i }))

    expect(screen.getByRole('columnheader', { name: /last updated/i })).toHaveAttribute(
      'aria-sort',
      'ascending'
    )

    const rows = screen.getAllByRole('button', { name: /^Open project/i })
    expect(rows[0]).toHaveTextContent('Gamma Project') // Mar 24
    expect(rows[1]).toHaveTextContent('Beta Project') // Mar 27
    expect(rows[2]).toHaveTextContent('Alpha Project') // Mar 29
  })

  // ── Sorting by size — must be numeric, not lexicographic ──────────────────

  it('sorts by Size numerically ascending', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /^size/i }))

    expect(screen.getByRole('columnheader', { name: /size/i })).toHaveAttribute(
      'aria-sort',
      'ascending'
    )

    const rows = screen.getAllByRole('button', { name: /^Open project/i })
    expect(rows[0]).toHaveTextContent('Beta Project') // 86.1M
    expect(rows[1]).toHaveTextContent('Alpha Project') // 128.4M
    expect(rows[2]).toHaveTextContent('Gamma Project') // 214.9M
  })

  it('sorts by Size numerically descending on the second click', () => {
    render(<ProjectsTable {...defaultProps} />)
    const sizeHeader = screen.getByRole('button', { name: /^size/i })
    fireEvent.click(sizeHeader)
    fireEvent.click(sizeHeader)

    const rows = screen.getAllByRole('button', { name: /^Open project/i })
    expect(rows[0]).toHaveTextContent('Gamma Project') // 214.9M
    expect(rows[1]).toHaveTextContent('Alpha Project') // 128.4M
    expect(rows[2]).toHaveTextContent('Beta Project') // 86.1M
  })

  // ── aria-sort on inactive columns ─────────────────────────────────────────

  it('reports aria-sort="none" on columns that are not the active sort key', () => {
    render(<ProjectsTable {...defaultProps} />)
    // default sort is last_updated
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByRole('columnheader', { name: /size/i })).toHaveAttribute('aria-sort', 'none')
  })

  it('switches aria-sort back to "none" on the previously active column when sort key changes', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /^size/i }))

    expect(screen.getByRole('columnheader', { name: /size/i })).toHaveAttribute(
      'aria-sort',
      'ascending'
    )
    expect(screen.getByRole('columnheader', { name: /last updated/i })).toHaveAttribute(
      'aria-sort',
      'none'
    )
  })

  // ── Sort indicator arrow (visual class on the img) ───────────────────────

  // The sort icon uses alt="" and aria-hidden="true", so it is accessibly
  // a presentational img — we query the DOM element directly.
  it('rotates the sort icon on the active column when sorted descending', () => {
    render(<ProjectsTable {...defaultProps} />)
    const lastUpdatedHeader = screen.getByRole('columnheader', { name: /last updated/i })
    // default is last_updated desc
    const icon = lastUpdatedHeader.querySelector('img')
    expect(icon).not.toBeNull()
    expect(icon).toHaveClass('rotate-180')
    expect(icon).toHaveClass('opacity-100')
  })

  it('does not rotate the sort icon when sorted ascending', () => {
    render(<ProjectsTable {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /^name/i }))
    const nameHeader = screen.getByRole('columnheader', { name: /name/i })
    const icon = nameHeader.querySelector('img')
    expect(icon).not.toBeNull()
    expect(icon).not.toHaveClass('rotate-180')
    expect(icon).toHaveClass('opacity-100')
  })

  it('shows a dimmed (opacity-60) icon on inactive columns', () => {
    render(<ProjectsTable {...defaultProps} />)
    const nameHeader = screen.getByRole('columnheader', { name: /name/i })
    const icon = nameHeader.querySelector('img')
    expect(icon).not.toBeNull()
    expect(icon).toHaveClass('opacity-60')
  })

  // ── Stable ordering & defensive cases ─────────────────────────────────────

  it('preserves insertion order for rows with equal sort keys (stable sort)', () => {
    const projects: RecentProjectItem[] = [
      { id: 'p-a', name: 'A', last_updated: '2026-03-29T00:00:00Z', size: 100_000_000 },
      { id: 'p-b', name: 'B', last_updated: '2026-03-29T00:00:00Z', size: 100_000_000 }
    ]

    render(<ProjectsTable {...defaultProps} projects={projects} />)

    const rows = screen.getAllByRole('button', { name: /^Open project/i })
    // default sort: last_updated desc. Equal timestamps → insertion order retained.
    expect(rows[0]).toHaveTextContent('A')
    expect(rows[1]).toHaveTextContent('B')
  })

  it('does not throw when a size is NaN', () => {
    const projects: RecentProjectItem[] = [
      { id: 'p-a', name: 'A', last_updated: '2026-03-29T00:00:00Z', size: Number.NaN },
      { id: 'p-b', name: 'B', last_updated: '2026-03-28T00:00:00Z', size: 100_000_000 }
    ]

    render(<ProjectsTable {...defaultProps} projects={projects} />)
    fireEvent.click(screen.getByRole('button', { name: /^size/i }))

    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  // ── Virtualization (windowed rows + spacer <tr>s) ─────────────────────────

  // jsdom reports clientHeight 0, so the hook keeps a fixed window of
  // ceil(0/64) + OVERSCAN*2 = 10 rows. With 30 rows and a mid-list scroll,
  // both the top and bottom spacer rows must render.
  it('renders top and bottom spacer rows and windows the visible slice when scrolled', () => {
    // All identical timestamps → stable last_updated-desc sort keeps insertion order.
    const many: RecentProjectItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: `p-${i}`,
      name: `Project ${String(i).padStart(2, '0')}`,
      last_updated: '2026-03-01T00:00:00Z',
      size: 1_000_000 * (i + 1)
    }))

    render(<ProjectsTable {...defaultProps} projects={many} />)
    const container = screen.getByTestId('projects-table')

    // Scroll down 8 rows (8 × 64px). startIndex = max(0, floor(512/64) - 5) = 3,
    // endIndex = min(30, 3 + 10) = 13.
    Object.defineProperty(container, 'scrollTop', { value: 8 * 64, configurable: true })
    fireEvent.scroll(container)

    const spacers = container.querySelectorAll('tr[aria-hidden="true"]')
    expect(spacers).toHaveLength(2)
    // paddingTop = startIndex(3) × 64, paddingBottom = (30 - 13) × 64
    expect((spacers[0] as HTMLElement).style.height).toBe(`${3 * 64}px`)
    expect((spacers[1] as HTMLElement).style.height).toBe(`${(30 - 13) * 64}px`)

    // The windowed slice [3, 13) is rendered; rows outside it are not.
    expect(screen.getByText('Project 03')).toBeInTheDocument()
    expect(screen.getByText('Project 12')).toBeInTheDocument()
    expect(screen.queryByText('Project 00')).not.toBeInTheDocument()
    expect(screen.queryByText('Project 29')).not.toBeInTheDocument()
  })

  // ── Snapshots ────────────────────────────────────────────────────────────

  it('matches the snapshot when populated', () => {
    const { container } = render(<ProjectsTable {...defaultProps} />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('matches the snapshot when empty', () => {
    const { container } = render(<ProjectsTable {...defaultProps} projects={[]} />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
