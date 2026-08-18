import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import WeatherToolbar from '../WeatherToolbar'

// Toolbar reads four selectors: addColumnLoading/Error and addRowLoading/Error.
// We drive them through a simple shared object so tests can flip between
// idle / loading / error states.
const sel = {
  addColumnLoading: false,
  addColumnError: null as string | null,
  addRowLoading: false,
  addRowError: null as string | null,
  rowOrder: [] as string[]
}

vi.mock('react-redux', () => ({
  useSelector: (s: (state: unknown) => unknown) => s({} as never),
  useDispatch: () => vi.fn()
}))

vi.mock('../selectors', () => ({
  selectAddColumnLoading: () => sel.addColumnLoading,
  selectAddColumnError: () => sel.addColumnError,
  selectAddRowLoading: () => sel.addRowLoading,
  selectAddRowError: () => sel.addRowError,
  selectRowOrder: () => sel.rowOrder
}))

vi.mock('../AddColumnDialog', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="add-column-dialog">
        <button data-testid="close-add-column" onClick={onClose}>
          close
        </button>
      </div>
    ) : null
}))

vi.mock('../AddRowsDialog', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="add-rows-dialog">
        <button data-testid="close-add-rows" onClick={onClose}>
          close
        </button>
      </div>
    ) : null
}))

vi.mock('@renderer/components/ToolbarButton', () => ({
  default: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button data-testid={`tb-${label}`} onClick={onClick}>
      {label}
    </button>
  )
}))

vi.mock('@renderer/components/Dialog', () => ({
  default: ({
    isOpen,
    title,
    children
  }: {
    isOpen: boolean
    title: string
    children: React.ReactNode
  }) => (isOpen ? <div data-testid="dialog" aria-label={title}>{children}</div> : null)
}))

vi.mock('@renderer/assets/chevron.svg', () => ({ default: 'chevron.svg' }))
vi.mock('@renderer/assets/new_project.svg', () => ({ default: 'new_project.svg' }))
vi.mock('@renderer/assets/Upload.svg', () => ({ default: 'upload.svg' }))
vi.mock('@renderer/assets/delete.svg', () => ({ default: 'delete.svg' }))
vi.mock('@renderer/assets/Icon (Stroke).svg', () => ({ default: 'doc.svg' }))

function resetSel(): void {
  sel.addColumnLoading = false
  sel.addColumnError = null
  sel.addRowLoading = false
  sel.addRowError = null
  sel.rowOrder = []
}

describe('<WeatherToolbar />', () => {
  beforeEach(() => {
    resetSel()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Rendering ───────────────────────────────────────────────────────────

  it('renders the four toolbar buttons', () => {
    render(<WeatherToolbar />)
    expect(screen.getByTestId('tb-Filter')).toBeInTheDocument()
    expect(screen.getByTestId('tb-Add Columns')).toBeInTheDocument()
    expect(screen.getByTestId('tb-Add Rows')).toBeInTheDocument()
    expect(screen.getByTestId('tb-Upload File')).toBeInTheDocument()
  })

  it('does not render either dialog initially', () => {
    render(<WeatherToolbar />)
    expect(screen.queryByTestId('add-column-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-rows-dialog')).not.toBeInTheDocument()
  })

  // ── Add Column dialog ───────────────────────────────────────────────────

  it('opens the Add Column dialog when its toolbar button is clicked', () => {
    render(<WeatherToolbar />)
    fireEvent.click(screen.getByTestId('tb-Add Columns'))
    expect(screen.getByTestId('add-column-dialog')).toBeInTheDocument()
  })

  it('closes the Add Column dialog when its close handler fires', () => {
    render(<WeatherToolbar />)
    fireEvent.click(screen.getByTestId('tb-Add Columns'))
    fireEvent.click(screen.getByTestId('close-add-column'))
    expect(screen.queryByTestId('add-column-dialog')).not.toBeInTheDocument()
  })

  it('auto-closes Add Column on loading→idle when there is no error', () => {
    sel.addColumnLoading = true
    const { rerender } = render(<WeatherToolbar />)
    fireEvent.click(screen.getByTestId('tb-Add Columns'))
    expect(screen.getByTestId('add-column-dialog')).toBeInTheDocument()

    sel.addColumnLoading = false
    sel.addColumnError = null
    rerender(<WeatherToolbar />)
    expect(screen.queryByTestId('add-column-dialog')).not.toBeInTheDocument()
  })

  it('keeps Add Column open on loading→idle when there IS an error', () => {
    sel.addColumnLoading = true
    const { rerender } = render(<WeatherToolbar />)
    fireEvent.click(screen.getByTestId('tb-Add Columns'))

    sel.addColumnLoading = false
    sel.addColumnError = 'failed'
    rerender(<WeatherToolbar />)
    expect(screen.getByTestId('add-column-dialog')).toBeInTheDocument()
  })

  // ── Add Rows dialog ─────────────────────────────────────────────────────

  it('opens the Add Rows dialog when its toolbar button is clicked', () => {
    render(<WeatherToolbar />)
    fireEvent.click(screen.getByTestId('tb-Add Rows'))
    expect(screen.getByTestId('add-rows-dialog')).toBeInTheDocument()
  })

  it('auto-closes Add Rows on loading→idle when there is no error', () => {
    sel.addRowLoading = true
    const { rerender } = render(<WeatherToolbar />)
    fireEvent.click(screen.getByTestId('tb-Add Rows'))

    sel.addRowLoading = false
    sel.addRowError = null
    rerender(<WeatherToolbar />)
    expect(screen.queryByTestId('add-rows-dialog')).not.toBeInTheDocument()
  })

  it('keeps Add Rows open on loading→idle when there IS an error', () => {
    sel.addRowLoading = true
    const { rerender } = render(<WeatherToolbar />)
    fireEvent.click(screen.getByTestId('tb-Add Rows'))

    sel.addRowLoading = false
    sel.addRowError = 'failed'
    rerender(<WeatherToolbar />)
    expect(screen.getByTestId('add-rows-dialog')).toBeInTheDocument()
  })

  // ── Forwarded handlers ──────────────────────────────────────────────────

  it('forwards onUploadFile when the Upload File button is clicked', () => {
    const onUpload = vi.fn()
    render(<WeatherToolbar onUploadFile={onUpload} />)
    fireEvent.click(screen.getByTestId('tb-Upload File'))
    expect(onUpload).toHaveBeenCalledTimes(1)
  })

  it('forwards onFilter when the Filter button is clicked', () => {
    const onFilter = vi.fn()
    render(<WeatherToolbar onFilter={onFilter} />)
    fireEvent.click(screen.getByTestId('tb-Filter'))
    expect(onFilter).toHaveBeenCalledTimes(1)
  })

  it('enables the delete button when a file has been uploaded', () => {
    render(<WeatherToolbar importedFilename="sample.csv" />)
    expect(screen.getByLabelText('Delete uploaded weather file')).not.toBeDisabled()
  })

  it('opens the confirm dialog when delete is clicked', () => {
    render(<WeatherToolbar importedFilename="sample.csv" />)
    fireEvent.click(screen.getByLabelText('Delete uploaded weather file'))
    expect(screen.getByTestId('dialog')).toBeInTheDocument()
    expect(screen.getAllByText('Delete Data').length).toBeGreaterThan(0)
  })

  it('forwards onClearImportedFile when delete is confirmed', () => {
    const onClearImportedFile = vi.fn()
    render(
      <WeatherToolbar
        importedFilename="sample.csv"
        onClearImportedFile={onClearImportedFile}
      />
    )
    fireEvent.click(screen.getByLabelText('Delete uploaded weather file'))
    fireEvent.click(screen.getByText('Delete'))
    expect(onClearImportedFile).toHaveBeenCalledTimes(1)
  })

  // Regression: the dialog used to close only when `importedFilename` went
  // away. With manually-added rows there is no imported file, so that value
  // was already null and never transitioned — the confirm dialog stayed open
  // forever even though the clear had succeeded. Closing now keys off the
  // clearingImport loading→idle transition, which covers both data sources.
  it('closes the confirm dialog after clearing manually-added rows (no import)', () => {
    sel.rowOrder = ['r1', 'r2']
    const { rerender } = render(<WeatherToolbar clearingImport={false} />)

    fireEvent.click(screen.getByLabelText('Delete uploaded weather file'))
    expect(screen.getByTestId('dialog')).toBeInTheDocument()

    // Clear starts, then finishes — importedFilename stays undefined throughout.
    rerender(<WeatherToolbar clearingImport={true} />)
    expect(screen.getByTestId('dialog')).toBeInTheDocument()

    rerender(<WeatherToolbar clearingImport={false} />)
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
    sel.rowOrder = []
  })

  it('still closes the confirm dialog when an imported file is cleared', () => {
    const { rerender } = render(
      <WeatherToolbar importedFilename="sample.csv" clearingImport={false} />
    )
    fireEvent.click(screen.getByLabelText('Delete uploaded weather file'))
    expect(screen.getByTestId('dialog')).toBeInTheDocument()

    rerender(<WeatherToolbar importedFilename={undefined} clearingImport={false} />)
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
  })
})
