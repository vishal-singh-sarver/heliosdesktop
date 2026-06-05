import { call, put, race, select, take, takeLatest, takeLeading } from 'redux-saga/effects'
import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import { createSseChannel } from 'utils/sse'
import type { SseMessage } from 'utils/sse'
import { loadScenarioRequested } from 'containers/ProjectScreen/actions'
import {
  LOAD_DATA_TYPES_FAILED,
  LOAD_DATA_TYPES_SUCCEEDED,
  LOAD_SCENARIO_SUCCEEDED,
  LOAD_SCENARIO_FAILED
} from 'containers/ProjectScreen/constants'
import {
  selectCheckDataTypeId,
  selectDataTypesLoadStatus,
  selectDateTimeBaseUnitId,
  selectDateTimeDataTypeId
} from 'containers/ProjectScreen/selectors'
import {
  CHECK_COL_NAME,
  DATE_COL_ID,
  DATE_TIME_COL_NAME,
  TIME_COL_ID,
  type LoadedScenarioPayload,
  type LoadStatus
} from 'containers/ProjectScreen/types'
import { truncateToMaxDecimals } from 'utils/decimalValidation'
import * as actions from './actions'
import type { ImportFinalizeRequestedAction } from './actions'
import {
  FETCH_STATUS,
  IMPORT_CLEAR_REQUESTED,
  IMPORT_FINALIZE_REQUESTED,
  IMPORT_PICK_FILE_REQUESTED,
  SSE_CONNECT,
  SSE_DISCONNECT
} from './constants'
import type { ImportedDataset, WeatherStatus } from './types'

// ── Backend payload shapes ─────────────────────────────────────────────────────

interface AddColRequestColumn {
  name: string
  datatype: number | null
  data_unit: number | null
  values: Array<{ date: string; time: string; value: string }>
}

interface AddColRequest {
  column: AddColRequestColumn[]
}

// ── REST worker ────────────────────────────────────────────────────────────────

export function* fetchStatusWorker(): Generator {
  try {
    const status = (yield call(api.get<WeatherStatus>, '/api/status')) as WeatherStatus
    yield put(actions.fetchStatusSuccess(status))
  } catch (err) {
    yield put(actions.fetchStatusFailure((err as Error).message))
  }
}

// ── SSE worker ─────────────────────────────────────────────────────────────────

function* sseWorker(): Generator {
  const channel = (yield call(createSseChannel, '/api/events')) as ReturnType<
    typeof createSseChannel
  >

  try {
    while (true) {
      const result = (yield race({
        msg: take(channel),
        stop: take(SSE_DISCONNECT)
      })) as { msg?: SseMessage; stop?: unknown }

      if (result.stop) break

      if (result.msg) {
        yield put(
          actions.sseEvent({
            type: result.msg.type,
            data: result.msg.data,
            timestamp: Date.now()
          })
        )
      }
    }
  } finally {
    channel.close()
    yield put(actions.sseDisconnect())
  }
}

// ── Import: file pick worker ───────────────────────────────────────────────────
//
// Opens the native file dialog via preload, reads the selected file, and
// dispatches the result. User-cancelled dialog returns null — silent no-op.

export function* pickFileWorker(): Generator {
  try {
    const path = (yield call(window.api.openFile, [
      { name: 'Weather data', extensions: ['csv', 'txt', 'tsv', 'tab', 'xml'] }
    ])) as string | null
    if (!path) {
      // User cancelled the dialog — clear fileLoading so Browse re-enables.
      // Empty error string keeps the banner hidden (StepFilePreview shows
      // it only when fileError is truthy).
      yield put(actions.importPickFileFailed(''))
      return
    }
    const rawText = (yield call(window.api.readFile, path)) as string
    const filename = path.split(/[\\/]/).pop() ?? 'unknown'
    yield put(actions.importPickFileSucceeded({ filename, rawText }))
  } catch (err) {
    yield put(actions.importPickFileFailed((err as Error).message))
  }
}

// ── Import: finalize worker ────────────────────────────────────────────────────
//
// Single backend call: every column registers and uploads its row data in
// one /addCol request, with per-column `values: [{date, time, value}, …]`
// arrays. Non-empty values force PyHelios to register the column AND write
// the cells atomically — sidesteps the empty-values / /addRow race.
// project_id and scenario_id come from localStorage.

const pad2 = (n: number): string => String(n).padStart(2, '0')

// dtIso is anchored in UTC from the imported wall-clock components (see
// buildDate in parsers.ts), so we read it back with UTC getters — exactly like
// the Add-Row path (buildRowsForAdd in ProjectScreen/saga.ts uses getUTC*).
// Local getters here would re-shift the value and resurrect the DST-day
// duplicate bug.
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  // Backend expects HH:MM:SS — we don't have second-level precision, so 00.
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:00`
}

// Predicate factory for `take` that matches actions whose payload is scoped
// to a specific scenario. Used by the import-finalize race against the
// chained scenario refresh.
const matchScenarioAction = (
  type: string,
  scenarioId: string
) => (a: { type: string; payload?: { scenarioId?: string } }): boolean =>
  a.type === type && a.payload?.scenarioId === scenarioId

function areEquivalentImportedValues(left: string, right: string | null | undefined): boolean {
  const leftTrimmed = left.trim()
  const rightTrimmed = (right ?? '').trim()
  const leftNum = Number(leftTrimmed)
  const rightNum = Number(rightTrimmed)

  if (
    leftTrimmed !== '' &&
    rightTrimmed !== '' &&
    Number.isFinite(leftNum) &&
    Number.isFinite(rightNum)
  ) {
    return leftNum === rightNum
  }

  return leftTrimmed === rightTrimmed
}

function backendAdjustedImportedValues(
  dataset: ImportedDataset,
  loaded: LoadedScenarioPayload | undefined
): boolean {
  if (!loaded) return false

  const colIdByName = new Map<string, string>()
  for (const col of loaded.columns) {
    colIdByName.set(col.name, col.id)
  }

  const rowByDateTime = new Map<string, Record<string, string | null>>()
  for (const row of loaded.rows) {
    const date = row[DATE_COL_ID]
    const time = row[TIME_COL_ID]
    if (date != null && time != null) {
      rowByDateTime.set(`${date} ${time}`, row)
    }
  }

  for (const record of dataset.records) {
    if (record.dtIso == null) continue
    const key = `${fmtDate(record.dtIso)} ${fmtTime(record.dtIso)}`
    const loadedRow = rowByDateTime.get(key)
    if (!loadedRow) continue

    for (const col of dataset.columns) {
      if (col.key === '__check__') continue
      const loadedColId = colIdByName.get(col.label)
      if (!loadedColId) continue
      const importedValue = record.values[col.key] ?? ''
      const loadedValue = loadedRow[loadedColId]
      if (!areEquivalentImportedValues(importedValue, loadedValue)) {
        return true
      }
    }
  }

  return false
}

export function* finalizeImportWorker(action: ImportFinalizeRequestedAction): Generator {
  try {
    const { projectId, scenarioId } = action

    // Safety-net normalization: the wizard already truncates imported
    // decimals to 7 places, but we normalize again here so every frontend
    // import path stays aligned with backend precision rules.
    const originalDataset: ImportedDataset = action.payload
    const dataset: ImportedDataset = {
      ...originalDataset,
      records: originalDataset.records.map((record) => ({
        ...record,
        values: Object.fromEntries(
          Object.entries(record.values).map(([key, value]) => [
            key,
            truncateToMaxDecimals(String(value ?? '')).value
          ])
        )
      }))
    }

    // Step 0 — wipe any existing weather data for this scenario so the new
    // import doesn't collide with stale columns/rows. Idempotent on empty
    // scenarios.
    yield call(api.delete, API_ROUTES.weather.clearData(projectId, scenarioId))

    // Pre-compute (date, time) for each record once — reused across columns.
    // Rows whose date couldn't be parsed (dtIso === null) are skipped.
    const rowKeys: Array<{ date: string; time: string; recordIdx: number }> = []
    dataset.records.forEach((r, i) => {
      if (r.dtIso !== null) {
        rowKeys.push({ date: fmtDate(r.dtIso), time: fmtTime(r.dtIso), recordIdx: i })
      }
    })

    // Resolve the helios_data_type_id for the `check` data type so the seeded
    // check column carries the right metadata (the WeatherTable hides it by
    // name and binds the leftmost UI checkbox to its 1/0 cells). Mirrors the
    // empty-scenario seed worker — block on the catalog's terminal action if
    // it's still in flight.
    const status = (yield select(selectDataTypesLoadStatus)) as LoadStatus
    if (status === 'idle' || status === 'loading') {
      yield take([LOAD_DATA_TYPES_SUCCEEDED, LOAD_DATA_TYPES_FAILED])
    }
    const checkDataTypeId = (yield select(selectCheckDataTypeId)) as number | null
    const dateTimeDataTypeId = (yield select(selectDateTimeDataTypeId)) as number | null
    const dateTimeBaseUnitId = (yield select(selectDateTimeBaseUnitId)) as number | null

    // One column entry per dataset column, each carrying every row's cell
    // for that column. Backend stores columns + cells atomically. The seeded
    // check + date-time columns are prepended so the imported scenario
    // matches the empty-scenario bootstrap shape (check defaults to '1';
    // date-time is display-only, '0' is the placeholder used by addRow).
    // CSV columns whose label collides with a seeded name are dropped — the
    // backend rejects duplicate names in the request body, and the seeded
    // versions carry the right metadata (check's data-type id) and defaults.
    const reservedNames = new Set([
      CHECK_COL_NAME.toLowerCase(),
      DATE_TIME_COL_NAME.toLowerCase()
    ])
    const csvColumns = dataset.columns.filter(
      (c) => !reservedNames.has(c.label.toLowerCase())
    )
    const addColBody: AddColRequest = {
      column: [
        {
          name: CHECK_COL_NAME,
          datatype: checkDataTypeId,
          data_unit: null,
          values: rowKeys.map(({ date, time }) => ({ date, time, value: '1' }))
        },
        {
          name: DATE_TIME_COL_NAME,
          datatype: dateTimeDataTypeId,
          data_unit: dateTimeBaseUnitId,
          values: rowKeys.map(({ date, time }) => ({ date, time, value: '0' }))
        },
        ...csvColumns.map((c) => ({
          name: c.label,
          datatype: null,
          data_unit: null,
          values: rowKeys.map(({ date, time, recordIdx }) => ({
            date,
            time,
            value: dataset.records[recordIdx].values[c.key] ?? ''
          }))
        }))
      ]
    }

    // Write the columns + cells. Capture (don't throw) any failure: clearData
    // above already wiped the scenario, so the table must be refreshed either
    // way — on failure to show the now-empty state, on success to show the
    // imported data. Refreshing only on success would leave stale rows on
    // screen after a failed import.
    let addColError: string | null = null
    try {
      yield call(api.post, API_ROUTES.weather.addCol(projectId, scenarioId), addColBody)
    } catch (err) {
      addColError = (err as Error).message
    }

    // Refetch headers + timeseries regardless of the /addCol outcome.
    // ProjectScreen's loadScenario saga handles both /weather_data_header and
    // /getAllTimeSeriesData in parallel — wait for its terminal action
    // (filtered to this scenario) so the wizard only closes once the table
    // reflects the new backend state.
    yield put(loadScenarioRequested(projectId, scenarioId))
    const raceResult = (yield race({
      succeeded: take(matchScenarioAction(LOAD_SCENARIO_SUCCEEDED, scenarioId)),
      failed: take(matchScenarioAction(LOAD_SCENARIO_FAILED, scenarioId))
    })) as {
      succeeded?: { payload: LoadedScenarioPayload }
      failed?: { payload: { scenarioId: string; error: string } }
    }

    if (raceResult.failed) {
      yield put(
        actions.importFinalizeFailed(
          addColError
            ? `Import failed: ${addColError}`
            : `Imported, but failed to refresh data: ${raceResult.failed.payload.error}`
        )
      )
      return
    }

    // Refresh succeeded. If the column write itself failed, the scenario is now
    // empty (cleared above) and the table reflects that — still report failure.
    if (addColError) {
      yield put(actions.importFinalizeFailed(`Import failed: ${addColError}`))
      return
    }

    const backendAdjusted = backendAdjustedImportedValues(originalDataset, raceResult.succeeded?.payload)
    yield put(
      actions.importFinalizeSucceeded(
        projectId,
        scenarioId,
        dataset,
        Boolean(raceResult.succeeded?.payload.precisionNormalized) || backendAdjusted
      )
    )
  } catch (err) {
    yield put(actions.importFinalizeFailed((err as Error).message))
  }
}

export function* clearImportedDataWorker(action: actions.ImportClearRequestedAction): Generator {
  try {
    const { projectId, scenarioId } = action

    yield call(api.delete, API_ROUTES.weather.clearData(projectId, scenarioId))
    yield put(loadScenarioRequested(projectId, scenarioId))

    const raceResult = (yield race({
      succeeded: take(matchScenarioAction(LOAD_SCENARIO_SUCCEEDED, scenarioId)),
      failed: take(matchScenarioAction(LOAD_SCENARIO_FAILED, scenarioId))
    })) as {
      succeeded?: { payload: { scenarioId: string } }
      failed?: { payload: { scenarioId: string; error: string } }
    }

    if (raceResult.failed) {
      yield put(
        actions.importClearFailed(
          `Cleared imported data, but failed to refresh data: ${raceResult.failed.payload.error}`
        )
      )
      return
    }

    yield put(actions.importClearSucceeded(projectId, scenarioId))
  } catch (err) {
    yield put(actions.importClearFailed((err as Error).message))
  }
}

// ── Root watcher ───────────────────────────────────────────────────────────────

export default function* weatherSaga(): Generator {
  yield takeLatest(FETCH_STATUS, fetchStatusWorker)
  yield takeLatest(SSE_CONNECT, sseWorker)
  yield takeLatest(IMPORT_PICK_FILE_REQUESTED, pickFileWorker)
  yield takeLeading(IMPORT_FINALIZE_REQUESTED, finalizeImportWorker)
  yield takeLeading(IMPORT_CLEAR_REQUESTED, clearImportedDataWorker)
}
