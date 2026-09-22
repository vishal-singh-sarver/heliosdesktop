import { createSelector } from 'reselect'
import {
  selectActiveProjectId as selectActiveProjectIdFromProjectScreen,
  selectActiveScenarioId as selectActiveScenarioIdFromProjectScreen
} from 'containers/ProjectScreen/selectors'
import type { RootState } from 'store/reducers'
import { initialState, type WeatherState } from './reducer'

// ── Domain ─────────────────────────────────────────────────────────────────────

const selectWeatherDomain = (state: RootState): WeatherState =>
  (state as RootState & { weather?: WeatherState }).weather ?? initialState

// ── Memoised selectors (legacy SSE / status — leave untouched) ─────────────────

export const selectStatus = createSelector(selectWeatherDomain, (s) => s.status)
export const selectLoading = createSelector(selectWeatherDomain, (s) => s.loading)
export const selectError = createSelector(selectWeatherDomain, (s) => s.error)
export const selectStreaming = createSelector(selectWeatherDomain, (s) => s.streaming)
export const selectStreamLog = createSelector(selectWeatherDomain, (s) => s.streamLog)

// Import — file pick
export const selectFileLoading = createSelector(selectWeatherDomain, (s) => s.fileLoading)
export const selectFileError = createSelector(selectWeatherDomain, (s) => s.fileError)
export const selectPickedFile = createSelector(selectWeatherDomain, (s) => s.pickedFile)

// Import — finalize
export const selectImporting = createSelector(selectWeatherDomain, (s) => s.importing)
export const selectImportError = createSelector(selectWeatherDomain, (s) => s.importError)
export const selectClearingImport = createSelector(selectWeatherDomain, (s) => s.clearingImport)
export const selectDataset = createSelector(
  selectWeatherDomain,
  selectActiveProjectIdFromProjectScreen,
  selectActiveScenarioIdFromProjectScreen,
  (s, projectId, scenarioId) => {
    if (!projectId || !scenarioId) return null
    return s.datasetsByScope[`${projectId}::${scenarioId}`] ?? null
  }
)
export const selectImportPrecisionWarningPending = createSelector(
  selectWeatherDomain,
  selectActiveProjectIdFromProjectScreen,
  selectActiveScenarioIdFromProjectScreen,
  (s, projectId, scenarioId) => {
    if (!projectId || !scenarioId) return false
    return s.importPrecisionWarningPendingByScope[`${projectId}::${scenarioId}`] ?? false
  }
)

// Wizard open/close — held in Redux so the saga can auto-close the wizard
// on IMPORT_FINALIZE_SUCCEEDED.
export const selectWizardOpen = createSelector(selectWeatherDomain, (s) => s.wizardOpen)

// ── Legacy factory (kept for test compatibility) ───────────────────────────────

const makeSelectWeather = () => createSelector(selectWeatherDomain, (s) => s)

export default makeSelectWeather
export { selectWeatherDomain as selectWeatherDomain }

// ── Weather table re-exports ──────────────────────────────────────────────────
//
// The weather table itself lives in state.projectScreen (ScenarioGrid →
// WeatherTable). Re-export the active-table selectors here so Weather
// components can consume them without crossing container boundaries
// directly. See containers/ProjectScreen/selectors.ts for the source.

export {
  makeSelectCellError,
  makeSelectColumnNameError,
  makeSelectCellSync,
  makeSelectCellValue,
  makeSelectDataType,
  makeSelectDataUnitsForType,
  makeSelectHeadersForScenario,
  makeSelectHeadersLoadStatus,
  makeSelectRow,
  makeSelectRowSelected,
  makeSelectUnitSymbol,
  selectActiveHeaders,
  selectActiveProject,
  selectActiveProjectId,
  selectActiveScenarioId,
  selectActiveWeatherTable,
  selectAddColumnError,
  selectAddColumnLoading,
  selectAddRowError,
  selectAddRowLoading,
  selectAllChecked,
  selectAllDataTypes,
  selectAllRowsSelected,
  selectCheckColId,
  selectColumnOrder,
  selectColumns,
  selectDataTypesById,
  selectDataTypesError,
  selectDataTypesLoadStatus,
  selectDeleteRowsLoading,
  selectActiveDateTimeFormat,
  selectDateTimeBaseUnit,
  selectDateTimeBaseUnitId,
  selectDateTimeDataType,
  selectHeadersByScenario,
  selectRowOrder,
  selectRowSelection,
  selectSelectableDataTypes
} from 'containers/ProjectScreen/selectors'
