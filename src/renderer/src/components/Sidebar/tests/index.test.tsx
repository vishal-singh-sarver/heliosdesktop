import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Sidebar from '../index'
import { SidebarItem } from '../../../types/project'

// Mock SidebarButton to isolate Sidebar — SidebarButton has its own tests
vi.mock('@renderer/components/SidebarButton', () => ({
  default: ({
    label,
    isActive,
    onClick
  }: {
    label: string
    icon: string
    isActive: boolean
    onClick: () => void
  }) => (
    <button data-testid={`sidebar-btn-${label}`} data-active={isActive} onClick={onClick}>
      {label}
    </button>
  )
}))

const MOCK_ITEMS: SidebarItem[] = [
  { label: 'Home', icon: 'home.svg', onAction: vi.fn() },
  { label: 'New Project', icon: 'new.svg', onAction: vi.fn() },
  { label: 'Open project', icon: 'open.svg', onAction: vi.fn() }
]

describe('<Sidebar />', () => {
  const defaultProps = {
    items: MOCK_ITEMS,
    activeLabel: 'Home',
    onSelect: vi.fn()
  }

  // Smoke test — component mounts without throwing
  it('renders without error', () => {
    render(<Sidebar {...defaultProps} />)
  })

  // Verifies all sidebar items are rendered
  it('renders all sidebar items', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByTestId('sidebar-btn-Home')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-btn-New Project')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-btn-Open project')).toBeInTheDocument()
  })

  // Verifies the active item receives isActive=true based on activeLabel prop
  it('marks the correct item as active', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByTestId('sidebar-btn-Home')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('sidebar-btn-New Project')).toHaveAttribute('data-active', 'false')
  })

  // Verifies onSelect is called with the full SidebarItem object when clicked
  it('calls onSelect with the clicked item', () => {
    const onSelect = vi.fn()
    render(<Sidebar {...defaultProps} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('sidebar-btn-New Project'))
    expect(onSelect).toHaveBeenCalledWith(MOCK_ITEMS[1])
  })

  // Verifies a different activeLabel marks the correct item as active
  it('updates active state when activeLabel changes', () => {
    render(<Sidebar {...defaultProps} activeLabel="New Project" />)
    expect(screen.getByTestId('sidebar-btn-Home')).toHaveAttribute('data-active', 'false')
    expect(screen.getByTestId('sidebar-btn-New Project')).toHaveAttribute('data-active', 'true')
  })

  // Verifies the sidebar uses an <aside> element for semantic structure
  it('renders inside an aside element', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  // Verifies the sidebar contains a <nav> for keyboard/screen-reader navigation
  it('contains a nav element', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  // Snapshot regression guard
  it('should match the snapshot', () => {
    const { container } = render(<Sidebar {...defaultProps} />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
