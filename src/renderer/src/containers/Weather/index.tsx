import Dialog from '@renderer/components/Dialog'
import { PrimaryBtn } from '@renderer/components/ImportWizard/primitives'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { loadScenarioRequested } from 'containers/ProjectScreen/actions'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import loadable from 'utils/loadable'
import {
  importClearRequested,
  importFinalizeRequested,
  importPickFileRequested,
  importPrecisionWarningConsumed,
  importWizardClosed,
  importWizardOpened
} from './actions'
import messages from './messages'
import reducer from './reducer'
import saga from './saga'
import {
  selectActiveProjectId,
  selectActiveScenarioId,
  selectActiveWeatherTable,
  selectClearingImport,
  selectDataset,
  selectFileError,
  selectFileLoading,
  selectImportError,
  selectImportPrecisionWarningPending,
  selectImporting,
  selectPickedFile,
  selectRowOrder,
  selectWizardOpen
} from './selectors'
import type { ImportedDataset } from './types'
import WeatherTable from './WeatherTable'
import WeatherToolbar from './WeatherToolbar'

// Lazy-load the wizard chunk on first open. The Stepper, parsers, and step
// components don't need to be in the Weather screen's initial bundle.
const ImportWizard = loadable(() => import('@renderer/components/ImportWizard'))

export function Weather(): React.JSX.Element {
  useInjectReducer({ key: 'weather', reducer: reducer as Reducer })
  useInjectSaga({ key: 'weather', saga })

  const dispatch = useDispatch()
  const fileLoading = useSelector(selectFileLoading)
  const fileError = useSelector(selectFileError)
  const pickedFile = useSelector(selectPickedFile)
  const dataset = useSelector(selectDataset)
  const rowOrder = useSelector(selectRowOrder)
  const activeProjectId = useSelector(selectActiveProjectId)
  const activeScenarioId = useSelector(selectActiveScenarioId)
  const importing = useSelector(selectImporting)
  const clearingImport = useSelector(selectClearingImport)
  const importError = useSelector(selectImportError)
  const importPrecisionWarningPending = useSelector(selectImportPrecisionWarningPending)
  const wizardOpen = useSelector(selectWizardOpen)
  const [pendingImport, setPendingImport] = React.useState<{
    dataset: ImportedDataset
    truncatedDecimals: boolean
  } | null>(null)

  // Weather loads on first view, not on project open. It is one tab of three
  // and most sessions never open it, while a year of hourly readings is
  // thousands of rows — paying for that on every project open, before the user
  // has asked for it, is time nobody gets back. Nothing in the 3D view or the
  // geometry tree reads this data, so deferring it costs those nothing.
  //
  // Ref-keyed like the other mount fetches. The `weatherTable` check alone is
  // not enough: StrictMode remounts before the first dispatch has resolved, so
  // the table is still null and it fires twice. It only stays at one request
  // today because takeLatest cancels the first worker before it reaches the
  // network — luck, not design.
  const weatherTable = useSelector(selectActiveWeatherTable)
  const weatherRequestedRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (weatherTable) return
    if (!activeProjectId || !activeScenarioId) return
    const key = `${activeProjectId}:${activeScenarioId}`
    if (weatherRequestedRef.current === key) return
    weatherRequestedRef.current = key
    dispatch(loadScenarioRequested(activeProjectId, activeScenarioId))
  }, [weatherTable, activeProjectId, activeScenarioId, dispatch])

  // Acknowledge a precision-normalized import WITHOUT announcing it. The
  // 7-decimal cap is a standing rule the user cannot change, and StepReview
  // already states it up front in the wizard, so a toast after the fact would
  // only repeat what they were told before importing. The flag is still
  // consumed — left set, it would fire again for whatever reads it next.
  React.useEffect(() => {
    if (!importPrecisionWarningPending) return
    if (activeProjectId && activeScenarioId) {
      dispatch(importPrecisionWarningConsumed(activeProjectId, activeScenarioId))
    }
  }, [activeProjectId, activeScenarioId, dispatch, importPrecisionWarningPending])

  const openWizard = (): void => {
    dispatch(importWizardOpened())
  }

  const closeWizard = (): void => {
    if (importing) return
    dispatch(importWizardClosed())
  }

  // The wizard's "Import" button funnels through a Yes/No confirmation here
  // because finalizing erases the scenario's existing weather data (the saga
  // clears it before writing). Only prompt when there IS existing data to
  // replace — with an empty scenario there's nothing to overwrite, so import
  // straight away. Data can come from a prior file import (dataset) OR from
  // manually added rows. We key off ROWS, not columns: a fresh scenario always
  // carries a default date/time column, so a column check would false-positive.
  const hasExistingData = dataset != null || rowOrder.length > 0
  const handleSubmit = (ds: ImportedDataset, truncatedDecimals: boolean): void => {
    if (!activeProjectId || !activeScenarioId) return
    if (!hasExistingData) {
      dispatch(importFinalizeRequested(activeProjectId, activeScenarioId, ds, truncatedDecimals))
      return
    }
    setPendingImport({ dataset: ds, truncatedDecimals })
  }

  const handleConfirmImport = (): void => {
    if (importing || !pendingImport || !activeProjectId || !activeScenarioId) return
    dispatch(
      importFinalizeRequested(
        activeProjectId,
        activeScenarioId,
        pendingImport.dataset,
        pendingImport.truncatedDecimals
      )
    )
    setPendingImport(null)
  }

  const handleCancelImport = (): void => {
    if (importing) return
    setPendingImport(null)
  }

  const handleRequestPickFile = (): void => {
    dispatch(importPickFileRequested())
  }

  const handleClearImportedFile = (): void => {
    if (!activeProjectId || !activeScenarioId) return
    dispatch(importClearRequested(activeProjectId, activeScenarioId))
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <WeatherToolbar
        onUploadFile={openWizard}
        importedFilename={dataset?.filename ?? null}
        onClearImportedFile={handleClearImportedFile}
        clearingImport={clearingImport}
      />
      <WeatherTable />

      {wizardOpen && (
        <ImportWizard
          isOpen
          onClose={closeWizard}
          onRequestPickFile={handleRequestPickFile}
          onSubmit={handleSubmit}
          pickedFile={pickedFile}
          fileLoading={fileLoading}
          fileError={fileError}
          importing={importing}
          importError={importError}
        />
      )}

      <Dialog
        isOpen={pendingImport !== null}
        title={messages.importConfirm.dialogTitle}
        onClose={handleCancelImport}
      >
        <h3 className="text-base font-medium text-white">{messages.importConfirm.heading}</h3>
        <p className="text-sm text-neutral-400">{messages.importConfirm.body}</p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleCancelImport}
            disabled={importing}
            className="inline-flex h-[34px] min-w-[74px] items-center justify-center rounded-[4px] border border-neutral-300 bg-white px-[10px] py-[5px] text-sm font-medium text-neutral-900 outline-none transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {messages.importConfirm.cancelButton}
          </button>
          <PrimaryBtn onClick={handleConfirmImport} disabled={importing}>
            {messages.importConfirm.confirmButton}
          </PrimaryBtn>
        </div>
      </Dialog>
    </div>
  )
}

export default Weather
