import weatherReducer, { initialState } from '../reducer'
import * as actions from '../actions'
import type { ImportedDataset, PickedFile } from '../types'

describe('weatherReducer', () => {
  const scopeKey = 'proj-1::sce-1'

  it('returns the initial state', () => {
    expect(weatherReducer(undefined, {} as any)).toEqual(initialState)
  })

  describe('REST', () => {
    it('FETCH_STATUS sets loading and clears error', () => {
      const state = { ...initialState, error: 'prev' }
      const result = weatherReducer(state, actions.fetchStatus())
      expect(result.loading).toBe(true)
      expect(result.error).toBeNull()
    })

    it('FETCH_STATUS_SUCCESS stores status and clears loading', () => {
      const status = { version: '1.0.0', uptime: 0 }
      const result = weatherReducer(
        { ...initialState, loading: true },
        actions.fetchStatusSuccess(status)
      )
      expect(result.loading).toBe(false)
      expect(result.status).toEqual(status)
    })

    it('FETCH_STATUS_FAILURE stores error and clears loading', () => {
      const result = weatherReducer(
        { ...initialState, loading: true },
        actions.fetchStatusFailure('err')
      )
      expect(result.loading).toBe(false)
      expect(result.error).toBe('err')
    })
  })

  describe('SSE', () => {
    it('SSE_CONNECT sets streaming and resets log', () => {
      const event = { type: 'x', data: null, timestamp: 0 }
      const result = weatherReducer({ ...initialState, streamLog: [event] }, actions.sseConnect())
      expect(result.streaming).toBe(true)
      expect(result.streamLog).toHaveLength(0)
    })

    it('SSE_EVENT appends event to streamLog', () => {
      const event = { type: 'update', data: {}, timestamp: 1 }
      const result = weatherReducer(initialState, actions.sseEvent(event))
      expect(result.streamLog).toHaveLength(1)
      expect(result.streamLog[0]).toEqual(event)
    })

    it('SSE_DISCONNECT clears streaming flag', () => {
      const result = weatherReducer({ ...initialState, streaming: true }, actions.sseDisconnect())
      expect(result.streaming).toBe(false)
    })

    it('SSE_EVENT does not mutate original state', () => {
      const event = { type: 'ping', data: null, timestamp: 1 }
      weatherReducer(initialState, actions.sseEvent(event))
      expect(initialState.streamLog).toHaveLength(0)
    })
  })

  describe('Import — file pick', () => {
    const picked: PickedFile = { filename: 'foo.csv', rawText: 'a,b\n1,2' }

    it('IMPORT_PICK_FILE_REQUESTED flips fileLoading and clears error/file', () => {
      const state = { ...initialState, fileError: 'prev', pickedFile: picked }
      const result = weatherReducer(state, actions.importPickFileRequested())
      expect(result.fileLoading).toBe(true)
      expect(result.fileError).toBeNull()
      expect(result.pickedFile).toBeNull()
    })

    it('IMPORT_PICK_FILE_SUCCEEDED stores the picked file and clears loading', () => {
      const state = { ...initialState, fileLoading: true }
      const result = weatherReducer(state, actions.importPickFileSucceeded(picked))
      expect(result.fileLoading).toBe(false)
      expect(result.pickedFile).toEqual(picked)
    })

    it('IMPORT_PICK_FILE_FAILED stores the error and clears loading', () => {
      const state = { ...initialState, fileLoading: true }
      const result = weatherReducer(state, actions.importPickFileFailed('read error'))
      expect(result.fileLoading).toBe(false)
      expect(result.fileError).toBe('read error')
    })
  })

  describe('Import — finalize', () => {
    const dataset: ImportedDataset = {
      filename: 'foo.csv',
      columns: [{ key: '__check__', label: 'check', index: -1 }],
      records: [{ dtIso: '2026-01-01T00:00:00.000Z', values: { __check__: 'true' } }]
    }

    it('IMPORT_FINALIZE_REQUESTED flips importing and clears any prior error', () => {
      const state = { ...initialState, importError: 'prev' }
      const result = weatherReducer(
        state,
        actions.importFinalizeRequested('proj-1', 'sce-1', dataset, true)
      )
      expect(result.importing).toBe(true)
      expect(result.importError).toBeNull()
      expect(result.importPrecisionWarningRequested).toBe(true)
      expect(result.activeImportScopeKey).toBe(scopeKey)
    })

    it('IMPORT_FINALIZE_SUCCEEDED stores the dataset, clears pickedFile, and auto-closes the wizard', () => {
      const state = {
        ...initialState,
        importing: true,
        wizardOpen: true,
        pickedFile: { filename: 'foo.csv', rawText: 'x' },
        fileError: 'cleared too'
      }
      const result = weatherReducer(
        state,
        actions.importFinalizeSucceeded('proj-1', 'sce-1', dataset, true)
      )
      expect(result.importing).toBe(false)
      expect(result.datasetsByScope[scopeKey]).toEqual(dataset)
      expect(result.importPrecisionWarningPendingByScope[scopeKey]).toBe(true)
      expect(result.pickedFile).toBeNull()
      expect(result.fileError).toBeNull()
      // Auto-close — saga waits for LOAD_SCENARIO_SUCCEEDED before dispatching
      // this action, so by the time it lands the table is already populated
      // and the wizard can close without a flash of empty state.
      expect(result.wizardOpen).toBe(false)
    })

    it('IMPORT_FINALIZE_SUCCEEDED keeps the warning pending when the file needed truncation even if refresh was already clean', () => {
      const state = weatherReducer(
        initialState,
        actions.importFinalizeRequested('proj-1', 'sce-1', dataset, true)
      )
      const result = weatherReducer(
        state,
        actions.importFinalizeSucceeded('proj-1', 'sce-1', dataset, false)
      )
      expect(result.importPrecisionWarningPendingByScope[scopeKey]).toBe(true)
      expect(result.importPrecisionWarningRequested).toBe(false)
    })

    it('IMPORT_FINALIZE_FAILED stores the error and clears importing', () => {
      const state = { ...initialState, importing: true }
      const result = weatherReducer(state, actions.importFinalizeFailed('save cancelled'))
      expect(result.importing).toBe(false)
      expect(result.importError).toBe('save cancelled')
    })

    it('IMPORT_FINALIZE_FAILED preserves dataset from a previous successful import', () => {
      const state = { ...initialState, importing: true, datasetsByScope: { [scopeKey]: dataset } }
      const result = weatherReducer(state, actions.importFinalizeFailed('boom'))
      expect(result.datasetsByScope[scopeKey]).toEqual(dataset)
    })
  })

  describe('Import — clear', () => {
    const dataset: ImportedDataset = {
      filename: 'foo.csv',
      columns: [],
      records: []
    }

    it('IMPORT_CLEAR_REQUESTED flips clearingImport and clears any prior error', () => {
      const state = { ...initialState, importError: 'prev' }
      const result = weatherReducer(state, actions.importClearRequested('proj-1', 'sce-1'))
      expect(result.clearingImport).toBe(true)
      expect(result.importError).toBeNull()
    })

    it('IMPORT_CLEAR_SUCCEEDED removes the dataset and pending warning for the target scope only', () => {
      const state = {
        ...initialState,
        clearingImport: true,
        pickedFile: { filename: 'foo.csv', rawText: 'x' },
        fileError: 'stale',
        importPrecisionWarningRequested: true,
        datasetsByScope: {
          'proj-1::sce-1': dataset,
          'proj-2::sce-2': { filename: 'other.csv', columns: [], records: [] }
        },
        importPrecisionWarningPendingByScope: {
          'proj-1::sce-1': true,
          'proj-2::sce-2': true
        }
      }
      const result = weatherReducer(state, actions.importClearSucceeded('proj-1', 'sce-1'))
      expect(result.clearingImport).toBe(false)
      expect(result.datasetsByScope['proj-1::sce-1']).toBeUndefined()
      // Other scope is untouched.
      expect(result.datasetsByScope['proj-2::sce-2']).toEqual({
        filename: 'other.csv',
        columns: [],
        records: []
      })
      expect(result.importPrecisionWarningPendingByScope['proj-1::sce-1']).toBeUndefined()
      expect(result.importPrecisionWarningPendingByScope['proj-2::sce-2']).toBe(true)
      expect(result.importPrecisionWarningRequested).toBe(false)
      expect(result.pickedFile).toBeNull()
      expect(result.fileError).toBeNull()
    })

    it('IMPORT_CLEAR_FAILED stores the error and clears clearingImport', () => {
      const state = { ...initialState, clearingImport: true }
      const result = weatherReducer(state, actions.importClearFailed('delete failed'))
      expect(result.clearingImport).toBe(false)
      expect(result.importError).toBe('delete failed')
    })
  })

  describe('Wizard open / close', () => {
    const picked: PickedFile = { filename: 'foo.csv', rawText: 'a,b\n1,2' }

    it('IMPORT_WIZARD_OPENED flips wizardOpen and resets every transient flow field', () => {
      const state = {
        ...initialState,
        wizardOpen: false,
        fileLoading: true,
        fileError: 'prev',
        pickedFile: picked,
        importing: true,
        importError: 'prev'
      }
      const result = weatherReducer(state, actions.importWizardOpened())
      expect(result.wizardOpen).toBe(true)
      expect(result.fileLoading).toBe(false)
      expect(result.fileError).toBeNull()
      expect(result.pickedFile).toBeNull()
      expect(result.importing).toBe(false)
      expect(result.importError).toBeNull()
    })

    it('IMPORT_WIZARD_CLOSED flips wizardOpen and resets every transient flow field', () => {
      const state = {
        ...initialState,
        wizardOpen: true,
        fileLoading: true,
        fileError: 'prev',
        pickedFile: picked,
        importing: true,
        importError: 'prev'
      }
      const result = weatherReducer(state, actions.importWizardClosed())
      expect(result.wizardOpen).toBe(false)
      expect(result.fileLoading).toBe(false)
      expect(result.fileError).toBeNull()
      expect(result.pickedFile).toBeNull()
      expect(result.importing).toBe(false)
      expect(result.importError).toBeNull()
    })

    it('IMPORT_WIZARD_OPENED preserves a previously-imported dataset', () => {
      const dataset: ImportedDataset = {
        filename: 'prev.csv',
        columns: [],
        records: []
      }
      const state = { ...initialState, datasetsByScope: { [scopeKey]: dataset } }
      const result = weatherReducer(state, actions.importWizardOpened())
      expect(result.datasetsByScope[scopeKey]).toEqual(dataset)
    })
  })

  describe('Import — reset', () => {
    const dataset: ImportedDataset = {
      filename: 'foo.csv',
      columns: [],
      records: []
    }

    it('IMPORT_RESET clears every transient field but preserves dataset', () => {
      const state = {
        ...initialState,
        fileLoading: true,
        fileError: 'err',
        pickedFile: { filename: 'foo.csv', rawText: 'x' },
        importing: true,
        importError: 'oops',
        datasetsByScope: { [scopeKey]: dataset }
      }
      const result = weatherReducer(state, actions.importReset())
      expect(result.fileLoading).toBe(false)
      expect(result.fileError).toBeNull()
      expect(result.pickedFile).toBeNull()
      expect(result.importing).toBe(false)
      expect(result.importError).toBeNull()
      expect(result.datasetsByScope[scopeKey]).toEqual(dataset)
    })
  })

  describe('Import precision warning consumption', () => {
    it('clears the pending warning for the matching scope only', () => {
      const state = {
        ...initialState,
        importPrecisionWarningPendingByScope: {
          'proj-1::sce-1': true,
          'proj-2::sce-2': true
        }
      }
      const result = weatherReducer(
        state,
        actions.importPrecisionWarningConsumed('proj-1', 'sce-1')
      )
      expect(result.importPrecisionWarningPendingByScope['proj-1::sce-1']).toBeUndefined()
      expect(result.importPrecisionWarningPendingByScope['proj-2::sce-2']).toBe(true)
    })
  })
})
