import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useDispatch } from 'react-redux'
import { setCellValidationError } from 'containers/ProjectScreen/actions'
import { VALIDATION_MESSAGES } from 'utils/decimalValidation'
import CellInput from '../CellInput'
import { GLOBAL_RANGE_MESSAGE } from '../validation'

// CellInput reads its per-cell error through useSelector(makeSelectCellError…).
// We mock react-redux + the selectors module so the test stays hermetic —
// no store, no reducer wiring needed. col / dataTypes / scenarioId used to
// be useSelector calls inside CellInput but were lifted to props as part of
// the table-scroll perf pass; the test passes them as props instead.
let mockError: string | null = null

// A real dispatch spy (installed via vi.mocked(useDispatch).mockReturnValue in
// beforeEach) so the live keystroke validator's SET_CELL_VALIDATION_ERROR
// dispatch can be asserted with its real action + payload — the previous
// throwaway `() => vi.fn()` mock made that impossible.
const dispatch = vi.fn()

vi.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) =>
    typeof selector === 'function' ? selector({}) : selector,
  useDispatch: vi.fn()
}))

vi.mock('../selectors', () => ({
  makeSelectCellError: () => () => mockError
}))

const defaultProps = {
  col: { id: 'c1', name: 'col', dataTypeId: null, unitId: null },
  dataTypes: [],
  scenarioId: 'scen-1'
}

// A data type whose only unit carries a numeric range (0–100), so a value that
// stays inside the ±1e6 global bound can still trip the live unit-range
// validator and be surfaced through the SET_CELL_VALIDATION_ERROR dispatch.
const rangedDataTypes = [
  {
    id: 1,
    data_type: 'Temperature',
    description: '',
    created_at: '',
    updated_at: '',
    units: [{ id: 10, unit: 'C', alias: '°C', data_type_id: 1, min: 0, max: 100 }]
  }
]

vi.mock('@renderer/components/Tooltip', () => ({
  default: ({ text, children }: { text: string; children: React.ReactNode }) => (
    <span data-testid="tooltip" data-text={text}>
      {children}
    </span>
  )
}))

vi.mock('@renderer/assets/info.svg', () => ({ default: 'info.svg' }))

describe('<CellInput />', () => {
  beforeEach(() => {
    mockError = null
    dispatch.mockClear()
    vi.mocked(useDispatch).mockReturnValue(dispatch)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the initial value', () => {
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="42" onCommit={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('42')
  })

  it('uses rowId/colId as the aria-label', () => {
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={vi.fn()} />)
    expect(screen.getByLabelText('r1 c1')).toBeInTheDocument()
  })

  it('updates the local draft on change without committing', () => {
    const onCommit = vi.fn()
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={onCommit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '12.5' } })
    expect(input).toHaveValue('12.5')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric keystroke and surfaces the numeric-only error', () => {
    const onCommit = vi.fn()
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={onCommit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2.2.2.2' } })
    // The keystroke never reaches the draft, and the format error shows.
    expect(input).toHaveValue('')
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByTestId('tooltip')).toHaveAttribute(
      'data-text',
      VALIDATION_MESSAGES.NUMERIC_ONLY
    )
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('commits the draft on blur', () => {
    const onCommit = vi.fn()
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={onCommit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('99')
  })

  it('re-syncs the draft when the canonical value changes externally', () => {
    const { rerender } = render(
      <CellInput {...defaultProps} rowId="r1" colId="c1" value="1" onCommit={vi.fn()} />
    )
    expect(screen.getByRole('textbox')).toHaveValue('1')
    rerender(<CellInput {...defaultProps} rowId="r1" colId="c1" value="2" onCommit={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('2')
  })

  it('does not render the tooltip when there is no error', () => {
    mockError = null
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={vi.fn()} />)
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid')
  })

  it('renders the tooltip and marks aria-invalid when an error is present', () => {
    mockError = 'must be in 0–100'
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={vi.fn()} />)
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-text', 'must be in 0–100')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  // ── Live keystroke guards ────────────────────────────────────────────────
  // Each guard refuses the offending keystroke (draft stays put) and surfaces
  // its message; none of them reach the live-validation dispatch.

  it('blocks a keystroke with more than 7 decimal places and shows the manual-input message', () => {
    const onCommit = vi.fn()
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={onCommit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '1.12345678' } }) // 8 decimal places
    // The keystroke never reaches the draft.
    expect(input).toHaveValue('')
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-text', VALIDATION_MESSAGES.MANUAL_INPUT)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(onCommit).not.toHaveBeenCalled()
    // Guard returned before the live validator, so nothing is dispatched.
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('clears the decimal error on the next keystroke that is back within 7 places', () => {
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '1.12345678' } })
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-text', VALIDATION_MESSAGES.MANUAL_INPUT)
    fireEvent.change(input, { target: { value: '1.1234567' } }) // exactly 7 places → accepted
    expect(input).toHaveValue('1.1234567')
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('blocks a keystroke that breaches the ±1e6 global bound and shows the range message', () => {
    const onCommit = vi.fn()
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={onCommit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2000000' } }) // > GLOBAL_CELL_MAX (1e6)
    expect(input).toHaveValue('')
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-text', GLOBAL_RANGE_MESSAGE)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(onCommit).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('clears the global-bound error on the next keystroke that is back within ±1e6', () => {
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2000000' } })
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-text', GLOBAL_RANGE_MESSAGE)
    fireEvent.change(input, { target: { value: '200000' } }) // in-bounds → accepted
    expect(input).toHaveValue('200000')
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('clears the numeric-format error on the next valid keystroke', () => {
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2.2.2' } }) // not a number-in-progress
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-text', VALIDATION_MESSAGES.NUMERIC_ONLY)
    fireEvent.change(input, { target: { value: '5' } })
    expect(input).toHaveValue('5')
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  // ── Live validation dispatch ─────────────────────────────────────────────

  it('dispatches setCellValidationError(null) via the live validator for an in-range value', () => {
    render(<CellInput {...defaultProps} rowId="r1" colId="c1" value="" onCommit={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '42' } })
    // Value cleared all guards → the live validator runs and reports no error.
    expect(dispatch).toHaveBeenCalledWith(setCellValidationError('scen-1', 'r1', 'c1', null))
  })

  it('dispatches the live unit-range error as the setCellValidationError payload', () => {
    render(
      <CellInput
        rowId="r1"
        colId="c1"
        value=""
        scenarioId="scen-1"
        col={{ id: 'c1', name: 'Temperature', dataTypeId: 1, unitId: 10 }}
        dataTypes={rangedDataTypes}
        onCommit={vi.fn()}
      />
    )
    // 200 is inside the ±1e6 keystroke bound (so it commits to the draft) but
    // exceeds the unit's 0–100 range, so the live validator flags it.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '200' } })
    expect(screen.getByRole('textbox')).toHaveValue('200')
    expect(dispatch).toHaveBeenCalledWith(
      setCellValidationError('scen-1', 'r1', 'c1', 'Value should be between 0 and 100')
    )
  })
})
