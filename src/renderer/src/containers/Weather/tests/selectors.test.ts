import makeSelectWeather, {
  selectWeatherDomain,
  selectStatus,
  selectLoading,
  selectError,
  selectStreaming,
  selectStreamLog,
  selectFileLoading,
  selectFileError,
  selectPickedFile,
  selectImporting,
  selectImportError,
  selectDataset,
  selectImportPrecisionWarningPending,
  selectWizardOpen
} from '../selectors'
import { initialState } from '../reducer'
import type { ImportedDataset, PickedFile } from '../types'

const withWeather = (
  partial: Partial<typeof initialState>,
  projectId = 'proj-1',
  scenarioId = 'sce-1'
) =>
  ({
    weather: { ...initialState, ...partial },
    projectScreen: { activeProjectId: projectId, activeScenarioId: scenarioId }
  }) as any

describe('selectWeatherDomain', () => {
  it('selects the weather slice', () => {
    expect(selectWeatherDomain(withWeather({}))).toEqual(initialState)
  })

  it('returns initialState when key is absent', () => {
    expect(selectWeatherDomain({} as any)).toEqual(initialState)
  })
})

describe('makeSelectWeather', () => {
  it('selects the whole weather domain', () => {
    const selector = makeSelectWeather()
    expect(selector(withWeather({}))).toEqual(initialState)
  })
})

describe('individual selectors — REST/SSE', () => {
  it('selectStatus', () => {
    const status = { version: '1.0', uptime: 5 }
    expect(selectStatus(withWeather({ status }))).toEqual(status)
  })

  it('selectLoading', () => {
    expect(selectLoading(withWeather({ loading: true }))).toBe(true)
  })

  it('selectError', () => {
    expect(selectError(withWeather({ error: 'bad' }))).toBe('bad')
  })

  it('selectStreaming', () => {
    expect(selectStreaming(withWeather({ streaming: true }))).toBe(true)
  })

  it('selectStreamLog', () => {
    const log = [{ type: 'ping', data: null, timestamp: 1 }]
    expect(selectStreamLog(withWeather({ streamLog: log }))).toEqual(log)
  })
})

describe('individual selectors — Import', () => {
  const picked: PickedFile = { filename: 'foo.csv', rawText: 'a,b\n1,2' }
  const dataset: ImportedDataset = {
    filename: 'foo.csv',
    columns: [],
    records: []
  }

  it('selectFileLoading', () => {
    expect(selectFileLoading(withWeather({ fileLoading: true }))).toBe(true)
  })

  it('selectFileError', () => {
    expect(selectFileError(withWeather({ fileError: 'denied' }))).toBe('denied')
  })

  it('selectPickedFile', () => {
    expect(selectPickedFile(withWeather({ pickedFile: picked }))).toEqual(picked)
  })

  it('selectImporting', () => {
    expect(selectImporting(withWeather({ importing: true }))).toBe(true)
  })

  it('selectImportError', () => {
    expect(selectImportError(withWeather({ importError: 'save cancelled' }))).toBe(
      'save cancelled'
    )
  })

  it('selectDataset', () => {
    expect(selectDataset(withWeather({ datasetsByScope: { 'proj-1::sce-1': dataset } }))).toEqual(
      dataset
    )
  })

  it('selectDataset returns null when no import has finished', () => {
    expect(selectDataset(withWeather({}))).toBeNull()
  })

  it('selectDataset stays scoped to the active project and scenario', () => {
    expect(
      selectDataset(
        withWeather(
          {
            datasetsByScope: {
              'proj-1::sce-1': dataset,
              'proj-2::sce-2': { filename: 'other.csv', columns: [], records: [] }
            }
          },
          'proj-2',
          'sce-2'
        )
      )
    ).toEqual({ filename: 'other.csv', columns: [], records: [] })
  })
})

describe('selectImportPrecisionWarningPending', () => {
  it('returns true when a warning is pending for the active scope', () => {
    expect(
      selectImportPrecisionWarningPending(
        withWeather({ importPrecisionWarningPendingByScope: { 'proj-1::sce-1': true } })
      )
    ).toBe(true)
  })

  it('returns false when nothing is pending for the active scope', () => {
    expect(selectImportPrecisionWarningPending(withWeather({}))).toBe(false)
  })

  it('returns false when there is no active project or scenario', () => {
    // Empty active project id trips the guard before any scope lookup.
    expect(
      selectImportPrecisionWarningPending(
        withWeather({ importPrecisionWarningPendingByScope: { 'proj-1::sce-1': true } }, '', 'sce-1')
      )
    ).toBe(false)
  })

  it('stays scoped to the active project and scenario', () => {
    // Pending only for proj-2::sce-2 — invisible while proj-1::sce-1 is active.
    expect(
      selectImportPrecisionWarningPending(
        withWeather({ importPrecisionWarningPendingByScope: { 'proj-2::sce-2': true } })
      )
    ).toBe(false)
    // Switching the active scope surfaces it.
    expect(
      selectImportPrecisionWarningPending(
        withWeather(
          { importPrecisionWarningPendingByScope: { 'proj-2::sce-2': true } },
          'proj-2',
          'sce-2'
        )
      )
    ).toBe(true)
  })
})

describe('selectWizardOpen', () => {
  it('reflects the wizardOpen flag', () => {
    expect(selectWizardOpen(withWeather({ wizardOpen: true }))).toBe(true)
    expect(selectWizardOpen(withWeather({ wizardOpen: false }))).toBe(false)
  })

  it('defaults to false from initialState', () => {
    expect(selectWizardOpen(withWeather({}))).toBe(false)
  })
})
