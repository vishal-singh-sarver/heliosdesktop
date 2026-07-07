import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ImportedDataset } from 'containers/Weather/parsers'
import ImportWizard from '../index'
import type { ImportWizardProps } from '../types'

const baseProps: ImportWizardProps = {
  isOpen: true,
  onClose: vi.fn(),
  onRequestPickFile: vi.fn(),
  onSubmit: vi.fn(),
  onImportWarning: vi.fn(),
  pickedFile: null,
  fileLoading: false,
  fileError: null,
  importing: false,
  importError: null
}

const goodGroup1File = {
  filename: 'sample.csv',
  rawText: 'year,month,day,hour,minute,temp\n' + '2026,2,26,10,0,22.5\n' + '2026,2,27,11,0,23.7'
}

describe('<ImportWizard />', () => {
  it('renders nothing when not open', () => {
    const { container } = render(<ImportWizard {...baseProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the modal header on step 1 when open', () => {
    render(<ImportWizard {...baseProps} />)
    expect(screen.getByText('Import Weather Data')).toBeInTheDocument()
    expect(screen.getByText('Weather Data File')).toBeInTheDocument()
  })

  it('Browse button calls onRequestPickFile', () => {
    const onRequestPickFile = vi.fn()
    render(<ImportWizard {...baseProps} onRequestPickFile={onRequestPickFile} />)
    fireEvent.click(screen.getByText('Browse'))
    expect(onRequestPickFile).toHaveBeenCalledTimes(1)
  })

  it('Cancel button calls onClose', () => {
    const onClose = vi.fn()
    render(<ImportWizard {...baseProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('close (×) button in header calls onClose', () => {
    const onClose = vi.fn()
    render(<ImportWizard {...baseProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('Next is disabled on step 1 when no file has been parsed', () => {
    render(<ImportWizard {...baseProps} />)
    expect(screen.getByText('Next')).toBeDisabled()
  })

  it('auto-parses pickedFile prop and reveals filename + enables Next', () => {
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} />)
    expect(screen.getByDisplayValue('sample.csv')).toBeInTheDocument()
    expect(screen.getByText('Next')).not.toBeDisabled()
  })

  it('clicking Next on step 1 advances to step 2 (data preview)', () => {
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} />)
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Delimiter')).toBeInTheDocument()
    expect(screen.getByText('Header Lines to Skip')).toBeInTheDocument()
  })

  it('Back button returns to the previous step', () => {
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} />)
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Delimiter')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))
    // Back on step 1 — file label is visible again
    expect(screen.getByText('Weather Data File')).toBeInTheDocument()
  })

  it('over-skipping all rows on step 2 does not trap navigation: Back to step 1 keeps Next enabled', () => {
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} />)

    // Step 1 → 2 (Data Preview)
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Header Lines to Skip')).toBeInTheDocument()

    // Skip more lines than the file has → parseDelimited throws, error banner
    // shows, and Next on the Data-Preview step is (correctly) disabled.
    const skipInput = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(skipInput, { target: { value: '999' } })
    expect(screen.getByText(/No data rows after skipping header lines/)).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeDisabled()

    // Go Back to the File step — the transient error must NOT trap the user
    // there. The file parsed fine, so Next is enabled again.
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Weather Data File')).toBeInTheDocument()
    expect(screen.getByText('Next')).not.toBeDisabled()

    // And going forward again lands on a clean Data-Preview (error cleared).
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Header Lines to Skip')).toBeInTheDocument()
    expect(screen.queryByText(/No data rows after skipping header lines/)).not.toBeInTheDocument()
  })

  it('walks all four steps and Import dispatches a dataset with the check column', () => {
    const onSubmit = vi.fn()
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} onSubmit={onSubmit} />)

    // Step 1 → 2
    fireEvent.click(screen.getByText('Next'))
    // Step 2 → 3
    fireEvent.click(screen.getByText('Next'))
    // Step 3 → 4 (auto-mapping picks year/month/day/hour/minute → all rows valid)
    fireEvent.click(screen.getByText('Next'))
    // Step 4 — Import button now visible
    fireEvent.click(screen.getByText('Import'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const dataset = onSubmit.mock.calls[0][0] as ImportedDataset

    expect(dataset.filename).toBe('sample.csv')

    // Check column injected at the front
    expect(dataset.columns[0]).toEqual({
      key: '__check__',
      label: 'check',
      index: -1
    })

    // The user-selectable column "temp" comes through (it's the only non-DT column)
    const tempCol = dataset.columns.find((c) => c.label === 'temp')
    expect(tempCol).toBeDefined()

    // Date-time component columns are folded into the synthetic Date-Time, not exposed
    expect(dataset.columns.find((c) => c.label === 'year')).toBeUndefined()
    expect(dataset.columns.find((c) => c.label === 'hour')).toBeUndefined()

    // Every record has __check__ = "1" by default (backend uses 0/1 strings)
    expect(dataset.records).toHaveLength(2)
    expect(dataset.records[0].values.__check__).toBe('1')
    expect(dataset.records[1].values.__check__).toBe('1')

    // dtIso is set (rows are valid)
    expect(dataset.records[0].dtIso).not.toBeNull()
  })

  // The finalize error is scoped to the Review & Import step (where it is
  // raised). It must stay tied to that step: hidden on earlier steps, and
  // shown again whenever the user returns to Review.
  it('shows the importError banner only on the Review & Import step', () => {
    render(
      <ImportWizard {...baseProps} pickedFile={goodGroup1File} importError="duplicate date-time" />
    )

    // Step 1 (File Preview): banner hidden even though importError is set.
    expect(screen.queryByText(/Import failed/)).not.toBeInTheDocument()

    // Walk to the Review & Import step (1 → 2 → 3 → 4).
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText(/Import failed/)).toBeInTheDocument()
    expect(screen.getByText(/duplicate date-time/)).toBeInTheDocument()
  })

  it('hides the importError banner on Back and shows it again on returning to Review', () => {
    render(
      <ImportWizard {...baseProps} pickedFile={goodGroup1File} importError="duplicate date-time" />
    )
    // Navigate to Review (step 4) — banner visible.
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText(/Import failed/)).toBeInTheDocument()

    // Back to Date/Time step — banner hidden (error is not lost, just scoped).
    fireEvent.click(screen.getByText('Back'))
    expect(screen.queryByText(/Import failed/)).not.toBeInTheDocument()

    // Forward to Review again — banner reappears.
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText(/Import failed/)).toBeInTheDocument()
  })

  it('disables Cancel + close while importing is true', () => {
    render(<ImportWizard {...baseProps} importing />)
    expect(screen.getByLabelText('Close')).toBeDisabled()
  })

  it('shows a spinner on the Import button and disables it while importing', () => {
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} importing />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    // While importing the button content is the <Spinner> (aria-label
    // "Loading"), which becomes the button's accessible name.
    const importBtn = screen.getByRole('button', { name: 'Loading' })
    expect(importBtn).toBeInTheDocument()
    expect(importBtn).toBeDisabled()
  })

  it('updates the file label and parses again when pickedFile changes', () => {
    const { rerender } = render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} />)
    expect(screen.getByDisplayValue('sample.csv')).toBeInTheDocument()

    const second = {
      filename: 'second.csv',
      rawText: 'year,month,day,temp\n2026,3,1,18.0'
    }
    rerender(<ImportWizard {...baseProps} pickedFile={second} />)
    expect(screen.getByDisplayValue('second.csv')).toBeInTheDocument()
  })

  it('renders parse-error banner when pickedFile content is malformed', () => {
    const malformed = {
      filename: 'broken.csv',
      // Mismatched column counts — parseDelimited throws
      rawText: 'a,b,c\n1,2,3,4'
    }
    render(<ImportWizard {...baseProps} pickedFile={malformed} />)
    expect(screen.getByText(/Invalid file/)).toBeInTheDocument()
  })

  it('Step 4 Date-Time row is required and disabled', () => {
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} />)
    fireEvent.click(screen.getByText('Next')) // step 2
    fireEvent.click(screen.getByText('Next')) // step 3
    fireEvent.click(screen.getByText('Next')) // step 4
    const dtRow = screen.getByText('Date-Time').closest('tr') as HTMLElement
    const checkbox = within(dtRow).getByRole('checkbox')
    expect(checkbox).toBeDisabled()
    expect(checkbox).toBeChecked()
  })

  it('auto-disables character based columns in review and excludes them from import', () => {
    const mixedFile = {
      filename: 'mixed.csv',
      rawText: 'year,month,day,temp,notes\n' + '2026,2,26,22.5,clear\n' + '2026,2,27,23.7,cloudy'
    }
    const onSubmit = vi.fn()
    render(<ImportWizard {...baseProps} pickedFile={mixedFile} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))

    expect(
      screen.getByText('Character-based columns are disabled as this input is unsupported')
    ).toBeInTheDocument()

    const notesRow = screen.getByText('notes').closest('tr') as HTMLElement
    const notesCheckbox = within(notesRow).getByRole('checkbox')
    expect(notesCheckbox).toBeDisabled()
    expect(notesCheckbox).not.toBeChecked()

    fireEvent.click(screen.getByText('Import'))
    const dataset = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(dataset.columns.find((c) => c.label === 'notes')).toBeUndefined()
    expect(dataset.columns.find((c) => c.label === 'temp')).toBeDefined()
  })

  it('truncates imported decimal values to 7 places before submit', () => {
    const highPrecisionFile = {
      filename: 'precision.csv',
      rawText: 'year,month,day,temp\n' + '2026,2,26,12.123456789\n' + '2026,2,27,99.00000004'
    }
    const onSubmit = vi.fn()
    const onImportWarning = vi.fn()
    render(
      <ImportWizard
        {...baseProps}
        pickedFile={highPrecisionFile}
        onSubmit={onSubmit}
        onImportWarning={onImportWarning}
      />
    )

    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Import'))

    const dataset = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(dataset.records[0].values['3__temp']).toBe('12.1234567')
    expect(dataset.records[1].values['3__temp']).toBe('99.0000000')
    // The wizard no longer raises the warning itself — it flags truncation
    // via onSubmit's second arg, and Weather surfaces the toast post-import.
    expect(onSubmit.mock.calls[0][1]).toBe(true)
  })

  it('truncates quoted decimal values and flags truncation on submit', () => {
    const quotedPrecisionFile = {
      filename: 'precision.csv',
      rawText: 'year,month,day,temp\n' + '2026,2,26,"12.123456789"\n' + '2026,2,27,.123456789'
    }
    const onSubmit = vi.fn()
    const onImportWarning = vi.fn()
    render(
      <ImportWizard
        {...baseProps}
        pickedFile={quotedPrecisionFile}
        onSubmit={onSubmit}
        onImportWarning={onImportWarning}
      />
    )

    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Import'))

    const dataset = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(dataset.records[0].values['3__temp']).toBe('12.1234567')
    expect(dataset.records[1].values['3__temp']).toBe('0.1234567')
    expect(onSubmit.mock.calls[0][1]).toBe(true)
  })
})

// ── Esc-to-close ───────────────────────────────────────────────────────────────
describe('<ImportWizard /> — Escape key handling', () => {
  it('pressing Escape closes the wizard', () => {
    const onClose = vi.fn()
    render(<ImportWizard {...baseProps} onClose={onClose} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape is ignored while importing', () => {
    const onClose = vi.fn()
    render(<ImportWizard {...baseProps} onClose={onClose} importing />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a non-Escape key does not close the wizard', () => {
    const onClose = vi.fn()
    render(<ImportWizard {...baseProps} onClose={onClose} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ── Focus trap ─────────────────────────────────────────────────────────────────
//
// jsdom implements no layout, so HTMLElement.offsetParent is always null. The
// trap's getFocusable() filters on `offsetParent !== null`, so in a bare jsdom
// it always returns [] and the code takes its empty-list branches (focus the
// panel, keep Tab on the panel, recapture stray focus to the panel). The
// first/last WRAPPING logic only runs when getFocusable() is non-empty, which
// requires layout — exercised in the second describe by faking offsetParent.
describe('<ImportWizard /> — focus trap (empty-focusables branches in bare jsdom)', () => {
  it('focuses the panel on open and keeps Tab trapped on it', () => {
    render(<ImportWizard {...baseProps} />)
    const panel = screen.getByRole('dialog')
    expect(document.activeElement).toBe(panel)
    fireEvent.keyDown(panel, { key: 'Tab' })
    expect(document.activeElement).toBe(panel)
  })

  it('ignores non-Tab keys in the trap handler', () => {
    render(<ImportWizard {...baseProps} />)
    const panel = screen.getByRole('dialog')
    fireEvent.keyDown(panel, { key: 'a' })
    // Still trapped on the panel; the handler returned early for a non-Tab key.
    expect(document.activeElement).toBe(panel)
  })

  it('recaptures focus that lands outside the panel back onto the panel', () => {
    render(<ImportWizard {...baseProps} />)
    const panel = screen.getByRole('dialog')
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    fireEvent.focusIn(outside)
    expect(document.activeElement).toBe(panel)
    outside.remove()
  })
})

describe('<ImportWizard /> — focus trap Tab wrapping (with layout faked)', () => {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  let restore: () => void

  beforeEach(() => {
    const proto = HTMLElement.prototype
    const original = Object.getOwnPropertyDescriptor(proto, 'offsetParent')
    // Make every element report a non-null offsetParent so getFocusable()
    // returns the real interactive children and the wrapping logic runs.
    Object.defineProperty(proto, 'offsetParent', {
      configurable: true,
      get() {
        return document.body
      }
    })
    restore = () => {
      if (original) Object.defineProperty(proto, 'offsetParent', original)
      else delete (proto as unknown as { offsetParent?: unknown }).offsetParent
    }
  })
  afterEach(() => restore())

  it('Tab at the last focusable wraps to the first; Shift+Tab at the first wraps to the last', () => {
    render(<ImportWizard {...baseProps} />)
    const panel = screen.getByRole('dialog')
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    expect(focusables.length).toBeGreaterThan(1)
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    // On open, the first focusable child receives focus.
    expect(document.activeElement).toBe(first)

    // Forward Tab from the last element wraps around to the first.
    last.focus()
    fireEvent.keyDown(panel, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    // Shift+Tab from the first element wraps around to the last.
    first.focus()
    fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('stray focus outside the panel is pulled back to the first focusable', () => {
    render(<ImportWizard {...baseProps} />)
    const panel = screen.getByRole('dialog')
    const first = panel.querySelector<HTMLElement>(FOCUSABLE)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    fireEvent.focusIn(outside)
    expect(document.activeElement).toBe(first)
    outside.remove()
  })
})

// ── Delimiter re-parse (step 2) ─────────────────────────────────────────────────
describe('<ImportWizard /> — delimiter re-parse', () => {
  it('changing the delimiter re-parses the file and updates the preview', () => {
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} />)
    fireEvent.click(screen.getByText('Next')) // step 2 (Data Preview)
    // The comma file shows 6 columns; switching to Semicolon (absent from the
    // data) collapses every line into a single column, proving the re-parse ran.
    fireEvent.change(screen.getByTestId('dt-delimiter'), { target: { value: ';' } })
    expect(screen.getAllByText('year,month,day,hour,minute,temp').length).toBeGreaterThan(0)
  })

  it('a delimiter that yields inconsistent columns surfaces a parse error and disables Next', () => {
    const semiInField = {
      filename: 'codes.csv',
      // Auto-detects comma; each field "a;b;c" holds a varying number of semicolons.
      rawText: 'name,codes\ndavis,a;b;c\nsac,a'
    }
    render(<ImportWizard {...baseProps} pickedFile={semiInField} />)
    fireEvent.click(screen.getByText('Next')) // step 2
    fireEvent.change(screen.getByTestId('dt-delimiter'), { target: { value: ';' } })
    // Under ';' the header splits to 1 column but "davis,a;b;c" → 3 → parse throws.
    expect(screen.getByText(/fields, expected/)).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeDisabled()
  })
})

// ── Step-3 config-readiness / valid-invalid counting ────────────────────────────
describe('<ImportWizard /> — step 3 stats branches', () => {
  it('reports config-not-ready and blocks Next when no date column is mapped', () => {
    const noDateFile = { filename: 'plain.csv', rawText: 'a,b,c\n1,2,3\n4,5,6' }
    render(<ImportWizard {...baseProps} pickedFile={noDateFile} />)
    fireEvent.click(screen.getByText('Next')) // step 2
    fireEvent.click(screen.getByText('Next')) // step 3
    // dateMode defaults to 'string' with mapping.date=null → configReady false;
    // every preview row is Invalid and Next stays disabled.
    expect(screen.getAllByText('Invalid').length).toBeGreaterThan(0)
    expect(screen.getByText('Next')).toBeDisabled()
  })

  it('counts a bad-date row as invalid in the valid/invalid banner', () => {
    const mixed = { filename: 'd.csv', rawText: 'date,temp\n2026-02-26,20\nnope,21' }
    render(<ImportWizard {...baseProps} pickedFile={mixed} />)
    fireEvent.click(screen.getByText('Next')) // step 2
    fireEvent.click(screen.getByText('Next')) // step 3
    // auto: date→'date', dateMode 'string', default format YYYY-MM-DD.
    expect(screen.getByText(/1 of 2 valid/)).toBeInTheDocument()
    expect(screen.getByText(/1 invalid/)).toBeInTheDocument()
  })

  it('handles an auto-detected Julian file (all rows valid) at step 3', () => {
    const julianFile = { filename: 'j.csv', rawText: 'Year,DOY,temp\n2024,172,286.25\n2024,173,285.55' }
    render(<ImportWizard {...baseProps} pickedFile={julianFile} />)
    fireEvent.click(screen.getByText('Next')) // step 2
    fireEvent.click(screen.getByText('Next')) // step 3
    expect(screen.getByText(/All 2 rows valid/)).toBeInTheDocument()
  })
})

// ── Import: Date-Time sort ordering ─────────────────────────────────────────────
describe('<ImportWizard /> — import sort ordering', () => {
  it('sorts records ascending by Date-Time even when the file is descending', () => {
    const onSubmit = vi.fn()
    const descFile = { filename: 'desc.csv', rawText: 'year,month,day,temp\n2026,2,27,23.7\n2026,2,26,22.5' }
    render(<ImportWizard {...baseProps} pickedFile={descFile} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Import'))

    const ds = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(ds.records).toHaveLength(2)
    expect(ds.records[0].dtIso).toBe('2026-02-26T00:00:00.000Z')
    expect(ds.records[1].dtIso).toBe('2026-02-27T00:00:00.000Z')
  })

  it('pushes invalid-date rows (null Date-Time) to the end after sorting', () => {
    const onSubmit = vi.fn()
    // Rows 2 and 3 have out-of-range months → invalid_date → dtIso null.
    const withInvalid = {
      filename: 'inv.csv',
      rawText: 'year,month,day,temp\n2026,2,26,22.5\n2026,13,01,98\n2026,14,01,99'
    }
    render(<ImportWizard {...baseProps} pickedFile={withInvalid} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Import'))

    const ds = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(ds.records).toHaveLength(3)
    expect(ds.records[0].dtIso).toBe('2026-02-26T00:00:00.000Z')
    expect(ds.records[1].dtIso).toBeNull()
    expect(ds.records[2].dtIso).toBeNull()
  })

  it('sorts a valid row ahead of a leading invalid-date row (b-null comparator branch)', () => {
    const onSubmit = vi.fn()
    // Invalid row FIRST → the comparator is called with (valid, null).
    const invalidFirst = {
      filename: 'invf.csv',
      rawText: 'year,month,day,temp\n2026,13,01,98\n2026,2,26,22.5'
    }
    render(<ImportWizard {...baseProps} pickedFile={invalidFirst} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Import'))

    const ds = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(ds.records[0].dtIso).toBe('2026-02-26T00:00:00.000Z')
    expect(ds.records[1].dtIso).toBeNull()
  })

  it('keeps both rows (returning 0 from the comparator) when two Date-Times are equal', () => {
    const onSubmit = vi.fn()
    const equalDt = {
      filename: 'eq.csv',
      rawText: 'year,month,day,temp\n2026,2,26,20\n2026,2,26,21'
    }
    render(<ImportWizard {...baseProps} pickedFile={equalDt} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Import'))

    const ds = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(ds.records).toHaveLength(2)
    expect(ds.records[0].dtIso).toBe('2026-02-26T00:00:00.000Z')
    expect(ds.records[1].dtIso).toBe('2026-02-26T00:00:00.000Z')
  })
})

// ── Auto-mapping side-effects on parse ──────────────────────────────────────────
describe('<ImportWizard /> — auto-detected date modes', () => {
  it('auto-selects date-time mode and detects the datetime format for a Timestamp column', () => {
    const tsFile = {
      filename: 'ts.csv',
      rawText: 'Timestamp,temp\n2026-02-26T10:00:00Z,20\n2026-02-27T11:00:00Z,21'
    }
    render(<ImportWizard {...baseProps} pickedFile={tsFile} />)
    fireEvent.click(screen.getByText('Next')) // step 2
    fireEvent.click(screen.getByText('Next')) // step 3
    // datetime column detected → date-time mode with a matching format → all valid.
    expect(screen.getByLabelText('date-time')).toBeInTheDocument()
    expect(screen.getByText(/All 2 rows valid/)).toBeInTheDocument()
  })

  it('auto-selects string date + string time when date and time columns are present', () => {
    const dtFile = {
      filename: 'dt.csv',
      rawText: 'date,time,temp\n2026-02-26,10:00,20\n2026-02-27,11:00,21'
    }
    render(<ImportWizard {...baseProps} pickedFile={dtFile} />)
    fireEvent.click(screen.getByText('Next')) // step 2
    fireEvent.click(screen.getByText('Next')) // step 3
    expect(screen.getByText(/All 2 rows valid/)).toBeInTheDocument()
  })

  it('leaves the default datetime format when the Timestamp column matches no known format', () => {
    const badTs = { filename: 'bad.csv', rawText: 'timestamp,temp\ngarbage,20\njunk,21' }
    render(<ImportWizard {...baseProps} pickedFile={badTs} />)
    fireEvent.click(screen.getByText('Next')) // step 2
    fireEvent.click(screen.getByText('Next')) // step 3
    // datetime mode selected, no format detected → nothing parses → Next blocked.
    expect(screen.getByText(/0 of 2 rows valid/)).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeDisabled()
  })

  it('changing the date mode to date-time on step 3 disables the Time controls', () => {
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next')) // step 3
    // Group1 auto-maps to parts mode → the time radios start enabled.
    expect(screen.getByTestId('dt-timemode-parts')).not.toBeDisabled()
    // Selecting date-time mode runs the wizard's onChangeDateMode → setTimeMode('none').
    fireEvent.click(screen.getByTestId('dt-datemode-datetime'))
    expect(screen.getByTestId('dt-timemode-parts')).toBeDisabled()
  })

  it('changing a mapping dropdown on step 3 re-validates via the wizard (onChangeMapping)', () => {
    render(<ImportWizard {...baseProps} pickedFile={goodGroup1File} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next')) // step 3, parts mode, all valid
    expect(screen.getByText(/All 2 rows valid/)).toBeInTheDocument()
    // Re-point Year at the non-date "temp" column → values are not 4-digit years,
    // so every row fails date validation and Next is blocked.
    fireEvent.change(screen.getByTestId('dt-year'), { target: { value: 'temp' } })
    expect(screen.getByText(/0 of 2 rows valid/)).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeDisabled()
  })

  it('does not disable a numeric column that merely has an empty cell', () => {
    const emptyCellFile = {
      filename: 'gap.csv',
      rawText: 'year,month,day,temp\n2026,2,26,\n2026,2,27,21'
    }
    const onSubmit = vi.fn()
    render(<ImportWizard {...baseProps} pickedFile={emptyCellFile} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next')) // review
    const tempRow = screen.getByText('temp').closest('tr') as HTMLElement
    expect(within(tempRow).getByRole('checkbox')).not.toBeDisabled()
    fireEvent.click(screen.getByText('Import'))
    const ds = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(ds.columns.find((c) => c.label === 'temp')).toBeDefined()
  })
})

// ── Step-4 review column toggles ────────────────────────────────────────────────
describe('<ImportWizard /> — review column selection', () => {
  const twoColFile = {
    filename: 't.csv',
    rawText: 'year,month,day,temp,rh\n2026,2,26,20,50\n2026,2,27,21,55'
  }

  it('unchecking a column in review excludes it from the imported dataset', () => {
    const onSubmit = vi.fn()
    render(<ImportWizard {...baseProps} pickedFile={twoColFile} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next')) // review
    fireEvent.click(screen.getByTestId('dt-col-rh'))
    fireEvent.click(screen.getByText('Import'))

    const ds = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(ds.columns.find((c) => c.label === 'rh')).toBeUndefined()
    expect(ds.columns.find((c) => c.label === 'temp')).toBeDefined()
  })

  it('Select-All unchecks every selectable column so only the synthetic check column remains', () => {
    const onSubmit = vi.fn()
    render(<ImportWizard {...baseProps} pickedFile={twoColFile} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next')) // review
    fireEvent.click(screen.getByTestId('dt-select-all')) // toggle all off
    fireEvent.click(screen.getByText('Import'))

    const ds = onSubmit.mock.calls[0][0] as ImportedDataset
    expect(ds.columns.map((c) => c.label)).toEqual(['check'])
  })
})
