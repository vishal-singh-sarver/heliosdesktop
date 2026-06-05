import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AddRowsDialog from '../AddRowsDialog'
import * as projectActions from 'containers/ProjectScreen/actions'

const mockDispatch = vi.fn()

interface MockTable {
  rows: Record<string, Record<string, string | null>>
  rowOrder: string[]
}

const sel = {
  projectId: 'proj-1' as string | null,
  scenarioId: 'scen-1' as string | null,
  columnIds: ['date', 'time', 'check'] as string[],
  weatherTable: null as MockTable | null,
  loading: false,
  error: null as string | null
}

vi.mock('react-redux', () => ({
  useSelector: (s: (state: unknown) => unknown) => s({} as never),
  useDispatch: () => mockDispatch
}))

vi.mock('../selectors', () => ({
  selectActiveProjectId: () => sel.projectId,
  selectActiveScenarioId: () => sel.scenarioId,
  selectColumnOrder: () => sel.columnIds,
  selectActiveWeatherTable: () => sel.weatherTable,
  selectAddRowLoading: () => sel.loading,
  selectAddRowError: () => sel.error
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

// Do NOT forward inputProps.type to the actual <input>. Formik's handleChange
// auto-coerces values when input.type === 'number', but the dialog's validator
// (production code) calls `.trim()` on deltaHours, so coercion would break it
// during tests. Keep the rendered input as plain text — the dialog under test
// only needs to read values formik provides via onChange.
vi.mock('@renderer/components/FormField', () => ({
  default: ({
    labelProps,
    inputProps
  }: {
    labelProps: { label: string }
    inputProps: {
      name?: string
      value?: string
      onChange?: React.ChangeEventHandler<HTMLInputElement>
      onBlur?: React.FocusEventHandler<HTMLInputElement>
      error?: string
    }
  }) => {
    const name = inputProps.name ?? labelProps.label
    return (
      <div data-testid={`ff-${name}`}>
        <label>{labelProps.label}</label>
        <input
          data-testid={`input-${name}`}
          name={name}
          value={inputProps.value ?? ''}
          onChange={inputProps.onChange}
          onBlur={inputProps.onBlur}
        />
        {inputProps.error && <span data-testid={`error-${name}`}>{inputProps.error}</span>}
      </div>
    )
  }
}))

vi.mock('@renderer/components/LoadingScreen/Spinner', () => ({
  Spinner: () => <span data-testid="spinner" />
}))

vi.mock('@renderer/components/TimePicker24', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button data-testid="time-picker" onClick={() => onChange('09:30')}>
      pick:{value}
    </button>
  )
}))

vi.mock('@renderer/assets/calendar.svg', () => ({ default: 'calendar.svg' }))
vi.mock('@renderer/assets/clock.svg', () => ({ default: 'clock.svg' }))

function resetSel(): void {
  sel.projectId = 'proj-1'
  sel.scenarioId = 'scen-1'
  sel.columnIds = ['date', 'time', 'check']
  sel.weatherTable = null
  sel.loading = false
  sel.error = null
}

describe('<AddRowsDialog />', () => {
  beforeEach(() => {
    mockDispatch.mockClear()
    resetSel()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when isOpen is false', () => {
    render(<AddRowsDialog isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
  })

  it('renders all four fields when open', () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('ff-numberOfRows')).toBeInTheDocument()
    expect(screen.getByTestId('ff-startDate')).toBeInTheDocument()
    expect(screen.getByTestId('ff-startTime')).toBeInTheDocument()
    expect(screen.getByTestId('ff-deltaHours')).toBeInTheDocument()
  })

  it('seeds delta hours to "1" and leaves start date/time empty when there is no data', () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('input-deltaHours')).toHaveValue('1')
    expect(screen.getByTestId('input-startDate')).toHaveValue('')
    expect(screen.getByTestId('input-startTime')).toHaveValue('')
  })

  // ── Data-driven defaults ──────────────────────────────────────────────────

  it('seeds date/time from the last row + inferred delta, and delta from the first three rows', () => {
    sel.weatherTable = {
      rowOrder: ['row_0', 'row_1', 'row_2', 'row_3'],
      rows: {
        row_0: { date: '2026-03-01', time: '00:00:00' },
        row_1: { date: '2026-03-01', time: '03:00:00' },
        row_2: { date: '2026-03-01', time: '06:00:00' },
        row_3: { date: '2026-03-02', time: '06:00:00' }
      }
    }
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    // delta inferred = 3h, last row 2026-03-02 06:00 + 3h → 09:00 same day
    expect(screen.getByTestId('input-startDate')).toHaveValue('2026-03-02')
    expect(screen.getByTestId('input-startTime')).toHaveValue('09:00')
    expect(screen.getByTestId('input-deltaHours')).toHaveValue('3')
  })

  it('shows no validation errors on open even though date/time are pre-filled', () => {
    sel.weatherTable = {
      rowOrder: ['row_0', 'row_1'],
      rows: {
        row_0: { date: '2024-12-31', time: '00:00:00' },
        row_1: { date: '2024-12-31', time: '01:00:00' }
      }
    }
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    expect(screen.queryByTestId('error-startDate')).not.toBeInTheDocument()
    expect(screen.queryByTestId('error-startTime')).not.toBeInTheDocument()
    expect(screen.queryByTestId('error-deltaHours')).not.toBeInTheDocument()
  })

  it('rolls the date forward when the +1h start time crosses midnight', () => {
    sel.weatherTable = {
      rowOrder: ['row_0', 'row_1'],
      rows: {
        row_0: { date: '2026-03-01', time: '22:30:00' },
        row_1: { date: '2026-03-01', time: '23:30:00' }
      }
    }
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('input-startTime')).toHaveValue('00:30')
    expect(screen.getByTestId('input-startDate')).toHaveValue('2026-03-02')
  })

  it('rolls over month and year boundaries (Dec 31 23:00 → Jan 1 00:00)', () => {
    sel.weatherTable = {
      rowOrder: ['row_0', 'row_1'],
      rows: {
        row_0: { date: '2026-12-31', time: '22:00:00' },
        row_1: { date: '2026-12-31', time: '23:00:00' }
      }
    }
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('input-startDate')).toHaveValue('2027-01-01')
    expect(screen.getByTestId('input-startTime')).toHaveValue('00:00')
  })

  it('falls back to delta "1" when the row spacing is not a whole number of hours', () => {
    sel.weatherTable = {
      rowOrder: ['row_0', 'row_1'],
      rows: {
        row_0: { date: '2026-03-01', time: '00:00:00' },
        row_1: { date: '2026-03-01', time: '00:30:00' }
      }
    }
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('input-startDate')).toHaveValue('2026-03-01')
    expect(screen.getByTestId('input-deltaHours')).toHaveValue('1')
  })

  // ── Validation ──────────────────────────────────────────────────────────

  it('shows a required error for numberOfRows when blurred empty', async () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    fireEvent.blur(screen.getByTestId('input-numberOfRows'))
    await waitFor(() =>
      expect(screen.getByTestId('error-numberOfRows')).toHaveTextContent(
        'Number of rows is required.'
      )
    )
  })

  it('shows a positive whole-number error when numberOfRows is 0', async () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('input-numberOfRows'), { target: { value: '0' } })
    fireEvent.blur(screen.getByTestId('input-numberOfRows'))
    await waitFor(() =>
      expect(screen.getByTestId('error-numberOfRows')).toHaveTextContent('positive whole number')
    )
  })

  it('does not input decimal values for numberOfRows', () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    const input = screen.getByTestId('input-numberOfRows')
    fireEvent.change(input, { target: { value: '1.5' } })
    expect(input).toHaveValue('')
  })

  it('shows a max-rows error above 10000', async () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('input-numberOfRows'), { target: { value: '10001' } })
    fireEvent.blur(screen.getByTestId('input-numberOfRows'))
    await waitFor(() =>
      expect(screen.getByTestId('error-numberOfRows')).toHaveTextContent(
        'Number of rows must be 10000 or fewer.'
      )
    )
  })

  it('shows a format error for invalid startTime', async () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('input-startTime'), { target: { value: '99:99' } })
    fireEvent.blur(screen.getByTestId('input-startTime'))
    await waitFor(() =>
      expect(screen.getByTestId('error-startTime')).toHaveTextContent('24-hour format')
    )
  })

  it('shows a positive error when delta is 0', async () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('input-deltaHours'), { target: { value: '0' } })
    fireEvent.blur(screen.getByTestId('input-deltaHours'))
    await waitFor(() =>
      expect(screen.getByTestId('error-deltaHours')).toHaveTextContent('positive whole number')
    )
  })

  it('shows a max-delta error above 24 hours', async () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('input-deltaHours'), { target: { value: '99999' } })
    fireEvent.blur(screen.getByTestId('input-deltaHours'))
    await waitFor(() =>
      expect(screen.getByTestId('error-deltaHours')).toHaveTextContent(
        'Delta must be 24 hours or fewer.'
      )
    )
  })

  // ── Submission ──────────────────────────────────────────────────────────

  it('dispatches addRowRequested with parsed values on valid submit', async () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('input-numberOfRows'), { target: { value: '5' } })
    fireEvent.change(screen.getByTestId('input-startDate'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByTestId('input-startTime'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByTestId('input-deltaHours'), { target: { value: '2' } })
    fireEvent.click(within(screen.getByTestId('dialog')).getByText('Add'))

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        projectActions.addRowRequested(
          'proj-1',
          'scen-1',
          '2026-01-01',
          '09:00',
          ['date', 'time', 'check'],
          5,
          2
        )
      )
    )
  })

  it('does not dispatch on invalid submit', async () => {
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    fireEvent.click(within(screen.getByTestId('dialog')).getByText('Add'))
    await waitFor(() => expect(screen.getByTestId('error-numberOfRows')).toBeInTheDocument())
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('does not dispatch when projectId is missing', async () => {
    sel.projectId = null
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('input-numberOfRows'), { target: { value: '5' } })
    fireEvent.change(screen.getByTestId('input-startDate'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByTestId('input-startTime'), { target: { value: '09:00' } })
    fireEvent.click(within(screen.getByTestId('dialog')).getByText('Add'))
    await new Promise((r) => setTimeout(r, 0))
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  // ── Loading / error UI ──────────────────────────────────────────────────

  it('renders spinner when loading and disables Cancel', () => {
    sel.loading = true
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
    expect(within(screen.getByTestId('dialog')).getByText('Cancel')).toBeDisabled()
  })

  it('renders the server-side error banner', () => {
    sel.error = 'Failed to add rows'
    render(<AddRowsDialog isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to add rows')
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<AddRowsDialog isOpen onClose={onClose} />)
    fireEvent.click(within(screen.getByTestId('dialog')).getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose while loading', () => {
    sel.loading = true
    const onClose = vi.fn()
    render(<AddRowsDialog isOpen onClose={onClose} />)
    fireEvent.click(screen.getByTestId('dialog-close'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
