import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ProjectScreen from '../index'
import * as projectActions from '../actions'
import { navigate } from 'store/navigationReducer'
import { STORAGE_KEYS } from 'utils/storageKeys'

// ── Mock layer ────────────────────────────────────────────────────────────
//
// The screen wires Redux + injection hooks + three nested containers. Tests
// drive selector values through `sel`, capture dispatches, and stub child
// containers so this file exercises ProjectScreen alone.

const mockDispatch = vi.fn()
const sel = {
  activeProjectId: null as string | null,
  activeProject: null as {
    id: string
    name: string
    latitude: number
    longitude: number
    utc_offset: string
  } | null
}

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (s: (state: unknown) => unknown) => s({} as never)
}))

vi.mock('utils/injectReducer', () => ({ useInjectReducer: vi.fn() }))
vi.mock('utils/injectSaga', () => ({ useInjectSaga: vi.fn() }))

vi.mock('../selectors', () => ({
  selectActiveProjectId: () => sel.activeProjectId,
  selectActiveProject: () => sel.activeProject
}))

vi.mock('@renderer/containers/LeftPanel', () => ({
  default: () => <div data-testid="left" />
}))

vi.mock('@renderer/containers/CenterWorkspace', () => ({
  default: () => <div data-testid="center" />
}))

vi.mock('@renderer/containers/RightPanel', () => ({
  default: () => <div data-testid="right" />
}))

vi.mock('@renderer/components/Header', () => ({
  default: ({ children, onLogoClick }: { children: React.ReactNode; onLogoClick: () => void }) => (
    <header>
      <button data-testid="logo" onClick={onLogoClick}>
        logo
      </button>
      {children}
    </header>
  )
}))

vi.mock('@renderer/components/MenuBar', () => ({
  default: () => <div data-testid="menu" />
}))

vi.mock('@renderer/components/Tooltip', () => ({
  default: () => <span data-testid="tip" />
}))

vi.mock('@renderer/components/LabeledField', () => ({
  default: ({
    label,
    value,
    onChange,
    onBlur,
    invalid,
    disabled
  }: {
    label: string
    value: string
    onChange?: (v: string) => void
    onBlur?: () => void
    invalid?: boolean
    disabled?: boolean
  }) => (
    <label data-testid={`field-${label}`} data-invalid={invalid ? 'true' : 'false'}>
      {label}
      <input
        data-testid={`input-${label}`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
      />
    </label>
  )
}))

function resetSel(): void {
  sel.activeProjectId = null
  sel.activeProject = null
}

describe('<ProjectScreen />', () => {
  beforeEach(() => {
    mockDispatch.mockClear()
    resetSel()
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Mount lifecycle ─────────────────────────────────────────────────────

  it('dispatches loadDataTypesRequested on mount', () => {
    render(<ProjectScreen />)
    expect(mockDispatch).toHaveBeenCalledWith(projectActions.loadDataTypesRequested())
  })

  it('hydrates active project from localStorage when no id is in state', () => {
    localStorage.setItem(STORAGE_KEYS.activeProjectId, 'p-stored')
    render(<ProjectScreen />)
    expect(mockDispatch).toHaveBeenCalledWith(projectActions.setActiveProject('p-stored'))
  })

  it('does not hydrate from localStorage when an active project id is already present', () => {
    sel.activeProjectId = 'p-existing'
    sel.activeProject = {
      id: 'p-existing',
      name: 'X',
      latitude: 0,
      longitude: 0,
      utc_offset: '+00:00'
    }
    localStorage.setItem(STORAGE_KEYS.activeProjectId, 'p-stored')
    render(<ProjectScreen />)
    expect(mockDispatch).not.toHaveBeenCalledWith(projectActions.setActiveProject('p-stored'))
  })

  it('lists scenarios when activeProjectId is set', () => {
    sel.activeProjectId = 'p-1'
    render(<ProjectScreen />)
    expect(mockDispatch).toHaveBeenCalledWith(projectActions.listScenariosRequested('p-1'))
  })

  it('does not list scenarios when activeProjectId is null', () => {
    render(<ProjectScreen />)
    expect(mockDispatch).not.toHaveBeenCalledWith(
      projectActions.listScenariosRequested(expect.any(String) as unknown as string)
    )
  })

  it('does not clear persisted ids on unmount (handled by the navigate-home saga)', () => {
    // StrictMode double-invokes effects (mount → cleanup → mount), so the
    // component must NOT clear ids in an unmount cleanup — that would wipe
    // activeProjectId (only HomePage writes it) during the fake unmount and
    // leave it gone for the session. Clearing lives in clearPersistedIdsOnHome.
    localStorage.setItem(STORAGE_KEYS.activeProjectId, 'p-1')
    localStorage.setItem(STORAGE_KEYS.activeScenarioId, 's-1')
    const { unmount } = render(<ProjectScreen />)
    unmount()
    expect(localStorage.getItem(STORAGE_KEYS.activeProjectId)).toBe('p-1')
    expect(localStorage.getItem(STORAGE_KEYS.activeScenarioId)).toBe('s-1')
  })

  // ── Header navigation ──────────────────────────────────────────────────

  it('dispatches navigate("home") when the logo is clicked', () => {
    render(<ProjectScreen />)
    fireEvent.click(screen.getByTestId('logo'))
    expect(mockDispatch).toHaveBeenCalledWith(navigate('home'))
  })

  // ── Layout ─────────────────────────────────────────────────────────────

  it('renders all three workspace panels', () => {
    render(<ProjectScreen />)
    expect(screen.getByTestId('left')).toBeInTheDocument()
    expect(screen.getByTestId('center')).toBeInTheDocument()
    expect(screen.getByTestId('right')).toBeInTheDocument()
  })

  // ── Header inputs ──────────────────────────────────────────────────────

  it('renders all three coordinate fields', () => {
    render(<ProjectScreen />)
    expect(screen.getByTestId('field-Latitude')).toBeInTheDocument()
    expect(screen.getByTestId('field-Longitude')).toBeInTheDocument()
    expect(screen.getByTestId('field-UTC Offset')).toBeInTheDocument()
  })

  it('seeds latitude/longitude/utc from active project metadata', () => {
    sel.activeProjectId = 'p-1'
    sel.activeProject = {
      id: 'p-1',
      name: 'demo',
      latitude: 45.5,
      longitude: -122.6,
      utc_offset: '-08:00'
    }
    render(<ProjectScreen />)
    expect(screen.getByTestId('input-Latitude')).toHaveValue('45.5')
    expect(screen.getByTestId('input-Longitude')).toHaveValue('-122.6')
    expect(screen.getByTestId('input-UTC Offset')).toHaveValue('-08:00')
  })

  it('marks latitude as invalid when out of range', () => {
    render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Latitude'), { target: { value: '95' } })
    expect(screen.getByTestId('field-Latitude')).toHaveAttribute('data-invalid', 'true')
  })

  it('marks longitude as invalid when out of range', () => {
    render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Longitude'), { target: { value: '-200' } })
    expect(screen.getByTestId('field-Longitude')).toHaveAttribute('data-invalid', 'true')
  })

  it('treats an empty latitude as not-yet-entered (not invalid)', () => {
    render(<ProjectScreen />)
    expect(screen.getByTestId('field-Latitude')).toHaveAttribute('data-invalid', 'false')
  })

  it('accepts the boundary value 90 as valid latitude', () => {
    render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Latitude'), { target: { value: '90' } })
    expect(screen.getByTestId('field-Latitude')).toHaveAttribute('data-invalid', 'false')
  })

  it('accepts the boundary value -180 as valid longitude', () => {
    render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Longitude'), { target: { value: '-180' } })
    expect(screen.getByTestId('field-Longitude')).toHaveAttribute('data-invalid', 'false')
  })

  it('flags non-numeric latitude as invalid', () => {
    render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Latitude'), { target: { value: 'abc' } })
    expect(screen.getByTestId('field-Latitude')).toHaveAttribute('data-invalid', 'true')
  })

  it('flags latitude with embedded junk characters as invalid', () => {
    render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Latitude'), {
      target: { value: '89.@#$#$980--210341-4' }
    })
    expect(screen.getByTestId('field-Latitude')).toHaveAttribute('data-invalid', 'true')
  })

  it('flags latitude with more than 7 decimal places as invalid', () => {
    render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Latitude'), { target: { value: '12.12345678' } })
    expect(screen.getByTestId('field-Latitude')).toHaveAttribute('data-invalid', 'true')
  })

  it('flags longitude with more than 7 decimal places as invalid', () => {
    render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Longitude'), {
      target: { value: '-45.123456789' }
    })
    expect(screen.getByTestId('field-Longitude')).toHaveAttribute('data-invalid', 'true')
  })

  it('accepts a trailing-dot value like "7." as valid mid-typing', () => {
    render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Latitude'), { target: { value: '7.' } })
    expect(screen.getByTestId('field-Latitude')).toHaveAttribute('data-invalid', 'false')
  })

  it('dispatches project update on latitude blur when value is valid and changed', () => {
    sel.activeProjectId = 'p-1'
    sel.activeProject = {
      id: 'p-1',
      name: 'demo',
      latitude: 10,
      longitude: 20,
      utc_offset: '+00:00'
    }
    render(<ProjectScreen />)
    const input = screen.getByTestId('input-Latitude')
    fireEvent.change(input, { target: { value: '11.5' } })
    fireEvent.blur(input)
    expect(mockDispatch).toHaveBeenCalledWith(
      projectActions.updateProjectRequested('p-1', {
        name: 'demo',
        latitude: 11.5,
        longitude: 20
      })
    )
  })

  it('dispatches project update on longitude blur when value is valid and changed', () => {
    sel.activeProjectId = 'p-1'
    sel.activeProject = {
      id: 'p-1',
      name: 'demo',
      latitude: 10,
      longitude: 20,
      utc_offset: '+00:00'
    }
    render(<ProjectScreen />)
    const input = screen.getByTestId('input-Longitude')
    fireEvent.change(input, { target: { value: '21.5' } })
    fireEvent.blur(input)
    expect(mockDispatch).toHaveBeenCalledWith(
      projectActions.updateProjectRequested('p-1', {
        name: 'demo',
        latitude: 10,
        longitude: 21.5
      })
    )
  })

  it('does not dispatch project update on blur when coordinate is invalid', () => {
    sel.activeProjectId = 'p-1'
    sel.activeProject = {
      id: 'p-1',
      name: 'demo',
      latitude: 10,
      longitude: 20,
      utc_offset: '+00:00'
    }
    render(<ProjectScreen />)
    const input = screen.getByTestId('input-Latitude')
    fireEvent.change(input, { target: { value: '95' } })
    fireEvent.blur(input)
    expect(mockDispatch).not.toHaveBeenCalledWith(
      projectActions.updateProjectRequested(expect.any(String), expect.any(Object))
    )
  })

  it('does not dispatch project update on blur when coordinate did not change', () => {
    sel.activeProjectId = 'p-1'
    sel.activeProject = {
      id: 'p-1',
      name: 'demo',
      latitude: 10,
      longitude: 20,
      utc_offset: '+00:00'
    }
    render(<ProjectScreen />)
    fireEvent.blur(screen.getByTestId('input-Latitude'))
    expect(mockDispatch).not.toHaveBeenCalledWith(
      projectActions.updateProjectRequested(expect.any(String), expect.any(Object))
    )
  })

  it('keeps the UTC Offset input disabled', () => {
    render(<ProjectScreen />)
    expect(screen.getByTestId('input-UTC Offset')).toBeDisabled()
  })

  it('does not re-seed in-progress edits when project metadata refreshes for the same id', () => {
    sel.activeProjectId = 'p-1'
    sel.activeProject = {
      id: 'p-1',
      name: 'demo',
      latitude: 45.5,
      longitude: 0,
      utc_offset: '+00:00'
    }
    const { rerender } = render(<ProjectScreen />)
    fireEvent.change(screen.getByTestId('input-Latitude'), { target: { value: '60' } })

    sel.activeProject = {
      id: 'p-1',
      name: 'demo',
      latitude: 45.5,
      longitude: 0,
      utc_offset: '+00:00'
    }
    rerender(<ProjectScreen />)
    expect(screen.getByTestId('input-Latitude')).toHaveValue('60')
  })

  it('re-seeds when the active project id flips', () => {
    sel.activeProjectId = 'p-1'
    sel.activeProject = {
      id: 'p-1',
      name: 'demo',
      latitude: 10,
      longitude: 20,
      utc_offset: '+00:00'
    }
    const { rerender } = render(<ProjectScreen />)
    expect(screen.getByTestId('input-Latitude')).toHaveValue('10')

    sel.activeProjectId = 'p-2'
    sel.activeProject = {
      id: 'p-2',
      name: 'demo2',
      latitude: 30,
      longitude: 40,
      utc_offset: '+00:00'
    }
    rerender(<ProjectScreen />)
    expect(screen.getByTestId('input-Latitude')).toHaveValue('30')
  })
})
