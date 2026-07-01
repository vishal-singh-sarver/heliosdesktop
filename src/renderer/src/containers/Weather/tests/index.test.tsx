import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import * as weatherActions from '../actions'
import Weather from '../index'
import type { ImportedDataset, PickedFile } from '../types'

const mockDispatch = vi.fn()
const sel = {
  activeProjectId: 'proj-1',
  activeScenarioId: 'sce-1',
  fileLoading: false,
  fileError: null as string | null,
  pickedFile: null as PickedFile | null,
  dataset: null as ImportedDataset | null,
  columnOrder: [] as string[],
  rowOrder: [] as string[],
  importing: false,
  clearingImport: false,
  importError: null as string | null,
  importPrecisionWarningPending: false,
  wizardOpen: false
}

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (s: (state: unknown) => unknown) => s({} as never)
}))

vi.mock('utils/injectReducer', () => ({ useInjectReducer: vi.fn() }))
vi.mock('utils/injectSaga', () => ({ useInjectSaga: vi.fn() }))

vi.mock('../selectors', () => ({
  selectActiveProjectId: () => sel.activeProjectId,
  selectActiveScenarioId: () => sel.activeScenarioId,
  selectFileLoading: () => sel.fileLoading,
  selectFileError: () => sel.fileError,
  selectPickedFile: () => sel.pickedFile,
  selectDataset: () => sel.dataset,
  selectColumnOrder: () => sel.columnOrder,
  selectRowOrder: () => sel.rowOrder,
  selectImporting: () => sel.importing,
  selectClearingImport: () => sel.clearingImport,
  selectImportError: () => sel.importError,
  selectImportPrecisionWarningPending: () => sel.importPrecisionWarningPending,
  selectWizardOpen: () => sel.wizardOpen
}))

vi.mock('../WeatherToolbar', () => ({
  default: ({
    onUploadFile,
    importedFilename,
    onClearImportedFile
  }: {
    onUploadFile?: () => void
    importedFilename?: string | null
    onClearImportedFile?: () => void
  }) => (
    <div data-testid="toolbar">
      <button data-testid="upload" onClick={onUploadFile}>
        upload
      </button>
      {importedFilename ? <span data-testid="uploaded-filename">{importedFilename}</span> : null}
      <button data-testid="clear-upload" onClick={onClearImportedFile}>
        clear-upload
      </button>
    </div>
  )
}))

vi.mock('../WeatherTable', () => ({
  default: () => <div data-testid="table" />
}))

// jsdom doesn't implement <dialog>.showModal(), so render the real Dialog's
// children inline when open (mirrors the WeatherToolbar test's Dialog mock).
vi.mock('@renderer/components/Dialog', () => ({
  default: ({
    isOpen,
    title,
    children
  }: {
    isOpen: boolean
    title: string
    children: ReactNode
  }) => (isOpen ? <div data-testid="dialog" aria-label={title}>{children}</div> : null)
}))

// `loadable(...)` returns a component. Use a regular component so the wizard
// renders synchronously in tests instead of trying to async-import a chunk.
vi.mock('utils/loadable', () => ({
  default: () =>
    function FakeImportWizard(props: {
      isOpen: boolean
      onClose: () => void
      onRequestPickFile: () => void
      onSubmit: (ds: ImportedDataset, truncatedDecimals: boolean) => void
      onImportWarning: (message: string | null) => void
    }) {
      if (!props.isOpen) return null
      return (
        <div data-testid="wizard">
          <button data-testid="wizard-close" onClick={props.onClose} />
          <button data-testid="wizard-pick" onClick={props.onRequestPickFile} />
          <button
            data-testid="wizard-warning"
            onClick={() =>
              props.onImportWarning(
                'Only 7 decimal places have been taken for decimal values as more are not allowed.'
              )
            }
          />
          <button
            data-testid="wizard-submit"
            onClick={() =>
              props.onSubmit(
                {
                  filename: 'foo.csv',
                  columns: [],
                  records: []
                },
                false
              )
            }
          />
          <button
            data-testid="wizard-submit-truncated"
            onClick={() =>
              props.onSubmit(
                {
                  filename: 'foo.csv',
                  columns: [],
                  records: []
                },
                true
              )
            }
          />
        </div>
      )
    }
}))

function resetSel(): void {
  sel.activeProjectId = 'proj-1'
  sel.activeScenarioId = 'sce-1'
  sel.fileLoading = false
  sel.fileError = null
  sel.pickedFile = null
  sel.dataset = null
  sel.columnOrder = []
  sel.rowOrder = []
  sel.importing = false
  sel.clearingImport = false
  sel.importError = null
  sel.importPrecisionWarningPending = false
  sel.wizardOpen = false
}

describe('<Weather />', () => {
  beforeEach(() => {
    mockDispatch.mockClear()
    resetSel()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders toolbar and table', () => {
    render(<Weather />)
    expect(screen.getByTestId('toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('table')).toBeInTheDocument()
  })

  it('does not render the wizard when wizardOpen is false', () => {
    render(<Weather />)
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument()
  })

  it('renders the wizard when wizardOpen is true', () => {
    sel.wizardOpen = true
    render(<Weather />)
    expect(screen.getByTestId('wizard')).toBeInTheDocument()
  })

  it('dispatches importWizardOpened when the toolbar fires Upload File', () => {
    render(<Weather />)
    fireEvent.click(screen.getByTestId('upload'))
    expect(mockDispatch).toHaveBeenCalledWith(weatherActions.importWizardOpened())
  })

  it('dispatches importWizardClosed when the wizard requests close', () => {
    sel.wizardOpen = true
    render(<Weather />)
    fireEvent.click(screen.getByTestId('wizard-close'))
    expect(mockDispatch).toHaveBeenCalledWith(weatherActions.importWizardClosed())
  })

  it('does not dispatch close while importing', () => {
    sel.wizardOpen = true
    sel.importing = true
    render(<Weather />)
    fireEvent.click(screen.getByTestId('wizard-close'))
    expect(mockDispatch).not.toHaveBeenCalledWith(weatherActions.importWizardClosed())
  })

  it('dispatches importPickFileRequested when wizard requests pick', () => {
    sel.wizardOpen = true
    render(<Weather />)
    fireEvent.click(screen.getByTestId('wizard-pick'))
    expect(mockDispatch).toHaveBeenCalledWith(weatherActions.importPickFileRequested())
  })

  it('confirms before importing, then dispatches importFinalizeRequested on Yes', () => {
    sel.wizardOpen = true
    // Existing data present → submitting must prompt to replace it.
    sel.dataset = { filename: 'existing.csv', columns: [], records: [] }
    render(<Weather />)
    // Submitting the wizard only opens the confirmation — no API call yet.
    fireEvent.click(screen.getByTestId('wizard-submit'))
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: weatherActions.importFinalizeRequested('p', 's', {
          filename: '',
          columns: [],
          records: []
        }).type
      })
    )
    expect(screen.getByTestId('dialog')).toBeInTheDocument()
    // Confirming fires the finalize with the stashed dataset.
    fireEvent.click(screen.getByText('Yes'))
    expect(mockDispatch).toHaveBeenCalledWith(
      weatherActions.importFinalizeRequested(
        'proj-1',
        'sce-1',
        {
          filename: 'foo.csv',
          columns: [],
          records: []
        },
        false
      )
    )
  })

  it('confirms when rows were added manually (no imported dataset)', () => {
    sel.wizardOpen = true
    // No imported dataset, but the table has manually added rows (plus the
    // default date/time column).
    sel.dataset = null
    sel.columnOrder = ['datetime']
    sel.rowOrder = ['r1']
    render(<Weather />)
    fireEvent.click(screen.getByTestId('wizard-submit'))
    // The replace confirmation must appear — nothing imported yet.
    expect(screen.getByTestId('dialog')).toBeInTheDocument()
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: weatherActions.importFinalizeRequested('p', 's', {
          filename: '',
          columns: [],
          records: []
        }).type
      })
    )
  })

  it('imports directly without a confirmation when there is no existing data', () => {
    sel.wizardOpen = true
    // No dataset and no rows. The default date/time column alone must NOT
    // trigger the prompt (guards the regression where every scenario prompted).
    sel.dataset = null
    sel.columnOrder = ['datetime']
    sel.rowOrder = []
    render(<Weather />)
    fireEvent.click(screen.getByTestId('wizard-submit'))
    // No confirmation dialog, and the finalize fires straight away.
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
    expect(mockDispatch).toHaveBeenCalledWith(
      weatherActions.importFinalizeRequested(
        'proj-1',
        'sce-1',
        { filename: 'foo.csv', columns: [], records: [] },
        false
      )
    )
  })

  it('does not dispatch importFinalizeRequested when the import confirmation is declined', () => {
    sel.wizardOpen = true
    // Existing data present → submitting must prompt to replace it.
    sel.dataset = { filename: 'existing.csv', columns: [], records: [] }
    render(<Weather />)
    fireEvent.click(screen.getByTestId('wizard-submit'))
    fireEvent.click(screen.getByText('No'))
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: weatherActions.importFinalizeRequested('p', 's', {
          filename: '',
          columns: [],
          records: []
        }).type
      })
    )
  })

  it('passes the imported filename through to the toolbar after a successful upload', () => {
    sel.dataset = { filename: 'weather.xml', columns: [], records: [] }
    render(<Weather />)
    expect(screen.getByTestId('uploaded-filename')).toHaveTextContent('weather.xml')
  })

  it('dispatches importClearRequested when the toolbar delete action fires', () => {
    sel.dataset = { filename: 'weather.xml', columns: [], records: [] }
    render(<Weather />)
    fireEvent.click(screen.getByTestId('clear-upload'))
    expect(mockDispatch).toHaveBeenCalledWith(
      weatherActions.importClearRequested('proj-1', 'sce-1')
    )
  })

  it('renders the import toast when the wizard reports a precision warning', () => {
    sel.wizardOpen = true
    render(<Weather />)
    fireEvent.click(screen.getByTestId('wizard-warning'))
    expect(
      screen.getByText(
        'Only 7 decimal places have been taken for decimal values as more are not allowed.'
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Dismiss import notification')).toBeInTheDocument()
  })

  it('dispatches importFinalizeRequested with truncatedDecimals=true on a truncated submit', () => {
    // A truncated submit no longer shows the toast immediately — the wizard
    // flags it through importFinalizeRequested, and the toast surfaces after
    // the import saga succeeds (see the precision-warning test below).
    sel.wizardOpen = true
    // Existing data present → the replace confirmation is shown.
    sel.dataset = { filename: 'existing.csv', columns: [], records: [] }
    render(<Weather />)
    fireEvent.click(screen.getByTestId('wizard-submit-truncated'))
    fireEvent.click(screen.getByText('Yes'))
    expect(mockDispatch).toHaveBeenCalledWith(
      weatherActions.importFinalizeRequested(
        'proj-1',
        'sce-1',
        { filename: 'foo.csv', columns: [], records: [] },
        true
      )
    )
  })

  it('renders the import toast when refreshed backend data was precision-normalized', () => {
    sel.importPrecisionWarningPending = true
    render(<Weather />)
    expect(mockDispatch).toHaveBeenCalledWith(
      weatherActions.importPrecisionWarningConsumed('proj-1', 'sce-1')
    )
    expect(
      screen.getByText(
        'Only 7 decimal places have been taken for decimal values as more are not supported.'
      )
    ).toBeInTheDocument()
  })
})
