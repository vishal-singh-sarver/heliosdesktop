import Dialog from '@renderer/components/Dialog'
import { PrimaryBtn } from '@renderer/components/ImportWizard/primitives'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
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

  // Raise the toast during render so it appears in the same commit that the
  // warning lands; the effect then acknowledges it back to the store. Tracking
  // the last-seen flag keeps a dismissed toast from being re-raised while the
  // `consumed` dispatch is still in flight.
  const [warningRaised, setWarningRaised] = React.useState(false)
  if (importPrecisionWarningPending && !warningRaised) {
    setWarningRaised(true)
   // setImportToastMessage(VALIDATION_MESSAGES.IMPORT_WARNING)
  } else if (!importPrecisionWarningPending && warningRaised) {
    setWarningRaised(false)
  }

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
