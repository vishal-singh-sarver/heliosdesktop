import {
  addColumnRequest,
  addColumnsRequest,
  addRowsRequest,
  deleteHeaderRequest,
  deleteRowsRequest,
  getProjectRequest,
  loadDataRequest,
  loadDataTypesRequest,
  loadHeadersRequest,
  normalizeWireCellValue,
  patchHeaderRequest,
  updateCellRequest,
  updateColumnRequest,
  updateProjectRequest,
  type AddColumnResponse,
  type AddRowsResponse,
  type DataPage,
  type DataTypesResponse,
  type GetProjectResponse,
  type HeadersResponse,
  type PatchHeaderRequestBody,
  type UpdateCellResponse
} from 'containers/Weather/service'
import { buildConvertedColumnValues } from 'containers/Weather/unitConversion'
import { validateCellValue } from 'containers/Weather/validation'
import {
  loadMaterialTypesRequest,
  loadModelTypesRequest,
  loadObjectTypesRequest,
  type MaterialTypesResponse,
  type ModelTypesResponse,
  type ObjectTypesResponse
} from './service'
import { all, call, put, race, select, take, takeEvery, takeLatest } from 'redux-saga/effects'
import { navigate } from 'store/navigationReducer'
import { ApiError } from 'utils/api'
import { STORAGE_KEYS } from 'utils/storageKeys'
import type {
  AddColumnRequestedAction,
  AddRowRequestedAction,
  DeleteColumnRequestedAction,
  DeleteRowRequestedAction,
  ListScenariosRequestedAction,
  LoadScenarioRequestedAction,
  SeedDefaultColumnsRequestedAction,
  UpdateAllCheckboxesRequestedAction,
  UpdateCellLocalAction,
  UpdateColumnRequestedAction
} from './actions'
import * as actions from './actions'
import {
  ADD_COLUMN_REQUESTED,
  ADD_ROW_REQUESTED,
  DELETE_COLUMN_REQUESTED,
  DELETE_ROW_REQUESTED,
  LIST_SCENARIOS_REQUESTED,
  LOAD_DATA_TYPES_FAILED,
  LOAD_DATA_TYPES_REQUESTED,
  LOAD_DATA_TYPES_SUCCEEDED,
  LOAD_MATERIAL_TYPES_REQUESTED,
  LOAD_MODEL_TYPES_REQUESTED,
  LOAD_OBJECT_TYPES_REQUESTED,
  LOAD_SCENARIO_FAILED,
  LOAD_SCENARIO_REQUESTED,
  LOAD_SCENARIO_SUCCEEDED,
  SEED_DEFAULT_COLUMNS_REQUESTED,
  UPDATE_ALL_CHECKBOXES_REQUESTED,
  UPDATE_CELL_LOCAL,
  UPDATE_COLUMN_REQUESTED,
  UPDATE_PROJECT_REQUESTED
} from './constants'
import {
  selectActiveWeatherTable,
  selectAllDataTypes,
  selectByScenario,
  selectCheckDataTypeId,
  selectDataTypesLoadStatus,
  selectDateTimeBaseUnitId,
  selectDateTimeDataTypeId
} from './selectors'
import {
  CHECK_COL_NAME,
  DATE_COL_ID,
  DATE_TIME_COL_NAME,
  TIME_COL_ID,
  type CellValue,
  type ColId,
  type ColumnDef,
  type DataTypeDef,
  type DataUnitDef,
  type LoadStatus,
  type WeatherHeader,
  type WeatherTable
} from './types'

function toProjectMetadata(project: GetProjectResponse['project']) {
  return {
    id: project.id,
    name: project.name,
    latitude: project.latitude,
    longitude: project.longitude,
    utc_offset: project.utc_offset
  }
}

// ── Catalog: data types ──────────────────────────────────────────────────────

function* loadDataTypesWorker(): Generator {
  try {
    const res = (yield call(loadDataTypesRequest)) as DataTypesResponse
    yield put(actions.loadDataTypesSucceeded(res.data_types))
  } catch (err) {
    yield put(actions.loadDataTypesFailed((err as Error).message))
  }
}

// ── Catalog: object / material / model types ─────────────────────────────────
//
// Loaded in parallel with the data-types catalog on ProjectScreen mount. Each
// is independent — one failing doesn't block the others (the component
// dispatches all three; the root watcher runs a worker per type).

function* loadObjectTypesWorker(): Generator {
  try {
    const res = (yield call(loadObjectTypesRequest)) as ObjectTypesResponse
    yield put(actions.loadObjectTypesSucceeded(res.object_types))
  } catch (err) {
    yield put(actions.loadObjectTypesFailed((err as Error).message))
  }
}

function* loadMaterialTypesWorker(): Generator {
  try {
    const res = (yield call(loadMaterialTypesRequest)) as MaterialTypesResponse
    yield put(actions.loadMaterialTypesSucceeded(res.material_types))
  } catch (err) {
    yield put(actions.loadMaterialTypesFailed((err as Error).message))
  }
}

// Model types are hierarchical on the wire; the GUI only needs the top-level
// models, so we strip `submodels` here before the slice stores them.
function* loadModelTypesWorker(): Generator {
  try {
    const res = (yield call(loadModelTypesRequest)) as ModelTypesResponse
    const topLevel = res.model_types.map(({ id, model, description }) => ({
      id,
      model,
      description
    }))
    yield put(actions.loadModelTypesSucceeded(topLevel))
  } catch (err) {
    yield put(actions.loadModelTypesFailed((err as Error).message))
  }
}

// ── List scenarios ───────────────────────────────────────────────────────────
//
// Fetches all scenarios for a project, picks the first one as active, and
// persists its id to localStorage so the active scenario survives reloads.
// Chains LOAD_SCENARIO_REQUESTED so the table populates without a second
// round-trip from the component.

function* listScenariosWorker(action: ListScenariosRequestedAction): Generator {
  const { projectId } = action.payload
  try {
    const res = (yield call(getProjectRequest, projectId)) as GetProjectResponse
    const project = res.project
    // Project metadata (latitude/longitude/utc_offset) drives the header
    // inputs on the project screen — dispatch it before the scenarios list
    // so the header has data to render even if scenarios is empty.
    yield put(actions.loadProjectSucceeded(toProjectMetadata(project)))
    const scenarios = project.scenarios
    yield put(actions.listScenariosSucceeded(projectId, scenarios))

    const first = scenarios[0]
    if (!first) return
    yield call([localStorage, 'setItem'], STORAGE_KEYS.activeScenarioId, first.id)
    yield put(actions.setActiveScenario(first.id))
    yield put(actions.loadScenarioRequested(projectId, first.id))
  } catch (err) {
    yield put(actions.listScenariosFailed(projectId, (err as Error).message))
    if (isStaleIdError(err)) yield call(bounceToHome)
  }
}

function* updateProjectWorker(
  action: ReturnType<typeof actions.updateProjectRequested>
): Generator {
  const { projectId, patch } = action.payload
  try {
    yield call(updateProjectRequest, projectId, patch)
    const res = (yield call(getProjectRequest, projectId)) as GetProjectResponse
    yield put(actions.updateProjectSucceeded(toProjectMetadata(res.project)))
  } catch (err) {
    yield put(actions.updateProjectFailed(projectId, (err as Error).message))
    if (isStaleIdError(err)) yield call(bounceToHome)
  }
}

// Treat 4xx responses (404 not found, 400 invalid uuid, 403 forbidden) as
// "the saved id is no longer valid" and fall back to home. 5xx and network
// errors stay on the project screen so a transient backend hiccup doesn't
// wipe the user's context.
function isStaleIdError(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500
}

function* bounceToHome(): Generator {
  yield call([localStorage, 'removeItem'], STORAGE_KEYS.activeProjectId)
  yield call([localStorage, 'removeItem'], STORAGE_KEYS.activeScenarioId)
  yield put(navigate('home'))
}

// ── Load scenario ────────────────────────────────────────────────────────────
//
// Parallel fetch of weather_data_header + getAllTimeSeriesData. The data
// response's `labels[]` is the authoritative column list (it includes the
// "date" / "time" pseudo-columns and may contain either stringified header
// IDs or upload-time slugs). Header metadata is joined in defensively —
// labels without a matching header render as bare names (no unit).
//
// Headers are routed through fetchHeaders so the raw WeatherHeader[] also
// lands in the dedicated headers slice — consumers that need
// status/display_order/helios_data_type_id read from there instead of the
// joined ColumnDefs.

function* fetchHeaders(projectId: string, scenarioId: string): Generator<unknown, WeatherHeader[]> {
  yield put(actions.loadHeadersRequested(projectId, scenarioId))
  try {
    const res = (yield call(loadHeadersRequest, projectId, scenarioId)) as HeadersResponse
    yield put(actions.loadHeadersSucceeded(scenarioId, res.headers))
    return res.headers
  } catch (err) {
    yield put(actions.loadHeadersFailed(scenarioId, (err as Error).message))
    throw err
  }
}

function* loadScenarioWorker(action: LoadScenarioRequestedAction): Generator {
  const { projectId, scenarioId } = action.payload
  try {
    const [headers, dataRes] = (yield all([
      call(fetchHeaders, projectId, scenarioId),
      call(loadDataRequest, projectId, scenarioId)
    ])) as [WeatherHeader[], DataPage]

    // Empty bootstrap: a freshly-created scenario with no headers and no rows
    // gets seeded with the two default columns (date-time + check). On
    // success, re-enter LOAD_SCENARIO_REQUESTED so the table picks up the
    // new headers without duplicating the merge logic here. Older scenarios
    // that already have data are left alone.
    if (headers.length === 0 && dataRes.rows.length === 0) {
      yield put(actions.seedDefaultColumnsRequested(projectId, scenarioId))
      return
    }

    // Column order = date/time first, then all backend headers in display
    // order, then any extra labels (uploaded slugs) not in headers. We can't
    // rely on dataRes.labels alone — when rows[] is empty the backend may
    // return labels=["date","time"] only, which would drop the real columns
    // and break /addRow (it requires every column id as a row key).
    // Block on the catalog if it's still loading so the merged date-time
    // column can backfill its data type id from the `date_time` catalog
    // entry. Older scenarios were seeded with helios_data_type_id=null and
    // would otherwise render the dropdown without a known type id.
    const dtStatus = (yield select(selectDataTypesLoadStatus)) as LoadStatus
    if (dtStatus === 'idle' || dtStatus === 'loading') {
      yield take([LOAD_DATA_TYPES_SUCCEEDED, LOAD_DATA_TYPES_FAILED])
    }
    const dateTimeDataTypeId = (yield select(selectDateTimeDataTypeId)) as number | null

    const sortedHeaders = [...headers].sort((a, b) => a.display_order - b.display_order)
    const seen = new Set<ColId>()
    const columns: ColumnDef[] = []

    const pushCol = (col: ColumnDef): void => {
      if (seen.has(col.id)) return
      columns.push(col)
      seen.add(col.id)
    }

    pushCol({ id: DATE_COL_ID, name: DATE_COL_ID, dataTypeId: null, unitId: null })
    pushCol({ id: TIME_COL_ID, name: TIME_COL_ID, dataTypeId: null, unitId: null })
    for (const h of sortedHeaders) {
      // Backfill the date-time column's dataTypeId from the catalog when the
      // backend row still has null (scenarios seeded before the date_time
      // catalog entry existed). The unit picker uses this id to compose the
      // PATCH that commits a user-picked format.
      const dataTypeId =
        h.name === DATE_TIME_COL_NAME && h.helios_data_type_id == null
          ? dateTimeDataTypeId
          : h.helios_data_type_id
      pushCol({
        id: String(h.id),
        name: h.name,
        dataTypeId,
        unitId: h.unit_id
      })
    }
    for (const label of dataRes.labels) {
      pushCol({ id: label, name: label, dataTypeId: null, unitId: null })
    }

    let precisionNormalized = false
    const rows: Array<Record<ColId, CellValue>> = dataRes.rows.map((raw) => {
      const out: Record<ColId, CellValue> = {}
      for (const col of columns) {
        const normalized = normalizeWireCellValue(raw[col.id])
        if (normalized.truncated) precisionNormalized = true
        out[col.id] = normalized.value
      }
      return out
    })

    yield put(
      actions.loadScenarioSucceeded({
        projectId,
        scenarioId,
        columns,
        rows,
        precisionNormalized
      })
    )

    // Backfill the persisted date-time header when the backend row still
    // carries null for helios_data_type_id and/or unit_id (scenarios seeded
    // before this client started stamping those fields). The patch sends
    // only the fields actually missing on the wire, paired with `previous:
    // null` so the saga's rollback path still knows the prior state. Skipped
    // when the catalog hasn't loaded — without it we have nothing to write.
    if (dateTimeDataTypeId != null) {
      const dateTimeBaseUnitId = (yield select(selectDateTimeBaseUnitId)) as number | null
      const staleDateTimeHeader = sortedHeaders.find(
        (h) => h.name === DATE_TIME_COL_NAME && (h.helios_data_type_id == null || h.unit_id == null)
      )
      if (staleDateTimeHeader) {
        const patch: { dataTypeId?: number | null; unitId?: number | null } = {}
        const previous: { dataTypeId?: number | null; unitId?: number | null } = {}
        if (staleDateTimeHeader.helios_data_type_id == null) {
          patch.dataTypeId = dateTimeDataTypeId
          previous.dataTypeId = null
        }
        if (staleDateTimeHeader.unit_id == null && dateTimeBaseUnitId != null) {
          patch.unitId = dateTimeBaseUnitId
          previous.unitId = null
        }
        if (patch.dataTypeId !== undefined || patch.unitId !== undefined) {
          yield put(
            actions.updateColumnRequested(
              projectId,
              scenarioId,
              String(staleDateTimeHeader.id),
              patch,
              previous
            )
          )
        }
      }
    }

    // Re-hydrate per-cell validation errors for the freshly loaded table.
    // Validation state lives in-memory only (Redux), so on app restart the
    // saved column metadata + cell values come back from the backend but
    // any prior errors are gone. Walk every column with a dataTypeId +
    // unitId and re-run validation against the catalog.
    yield call(revalidateScenarioColumns, scenarioId)
  } catch (err) {
    yield put(actions.loadScenarioFailed(projectId, scenarioId, (err as Error).message))
    if (isStaleIdError(err)) yield call(bounceToHome)
  }
}

// Block on the catalog if it's still in flight, then validate every cell
// in every column whose data type + unit are set. Bails silently if the
// catalog failed to load — the user just won't see range errors until
// they re-edit a cell or re-pick the unit.
function* revalidateScenarioColumns(scenarioId: string): Generator {
  const status = (yield select(selectDataTypesLoadStatus)) as LoadStatus
  if (status === 'idle' || status === 'loading') {
    yield take([LOAD_DATA_TYPES_SUCCEEDED, LOAD_DATA_TYPES_FAILED])
  }
  const byScenario = (yield select(selectByScenario)) as Record<string, WeatherTable>
  const table = byScenario[scenarioId]
  if (!table) return

  for (const colId of table.columnOrder) {
    const col = table.columns[colId]
    if (!col || col.dataTypeId == null || col.unitId == null) continue
    yield call(revalidateColumn, scenarioId, colId)
  }
}

// ── Seed default columns ─────────────────────────────────────────────────────
//
// Empty-scenario bootstrap. POSTs date-time + check in a single addCol call
// with values=[] (no existing rows to back-fill), then re-enters
// LOAD_SCENARIO_REQUESTED so the table picks up the new headers. On failure
// we do *not* re-enter — that would loop forever against a persistent error.

// Wait for LOAD_SCENARIO_SUCCEEDED / FAILED filtered to this scenario.
// Lets a saga that triggers a refresh block until the table is actually
// populated (so its own _SUCCEEDED action can semantically mean "data is
// visible"). Returns the load error string on failure, null on success.
function* waitForScenarioLoad(scenarioId: string): Generator<unknown, string | null> {
  const matchSucceeded = (a: { type: string; payload?: { scenarioId?: string } }): boolean =>
    a.type === LOAD_SCENARIO_SUCCEEDED && a.payload?.scenarioId === scenarioId
  const matchFailed = (a: { type: string; payload?: { scenarioId?: string } }): boolean =>
    a.type === LOAD_SCENARIO_FAILED && a.payload?.scenarioId === scenarioId
  const result = (yield race({
    succeeded: take(matchSucceeded),
    failed: take(matchFailed)
  })) as {
    succeeded?: { payload: { scenarioId: string } }
    failed?: { payload: { scenarioId: string; error: string } }
  }
  return result.failed?.payload.error ?? null
}

function* seedDefaultColumnsWorker(action: SeedDefaultColumnsRequestedAction): Generator {
  const { projectId, scenarioId } = action.payload
  try {
    // Resolve the helios_data_type_id for the `check` data type. The catalog
    // is fetched in parallel with the scenarios on mount, so it's almost
    // always loaded by the time we get here — but if it's still in flight,
    // block on the success/failure action so we don't seed with null.
    const status = (yield select(selectDataTypesLoadStatus)) as LoadStatus
    if (status === 'idle' || status === 'loading') {
      yield take([LOAD_DATA_TYPES_SUCCEEDED, LOAD_DATA_TYPES_FAILED])
    }
    const checkDataTypeId = (yield select(selectCheckDataTypeId)) as number | null
    const dateTimeDataTypeId = (yield select(selectDateTimeDataTypeId)) as number | null
    const dateTimeBaseUnitId = (yield select(selectDateTimeBaseUnitId)) as number | null

    yield call(addColumnsRequest, projectId, scenarioId, [
      {
        name: CHECK_COL_NAME,
        dataTypeId: checkDataTypeId,
        dataUnitId: null,
        values: []
      },
      {
        name: DATE_TIME_COL_NAME,
        dataTypeId: dateTimeDataTypeId,
        dataUnitId: dateTimeBaseUnitId,
        values: []
      }
    ])
    // Re-enter LOAD so the table picks up the seeded headers, and only
    // dispatch _SUCCEEDED once the load completes — consumers waiting on the
    // success action can then assume the table is populated.
    yield put(actions.loadScenarioRequested(projectId, scenarioId))
    const loadError = (yield call(waitForScenarioLoad, scenarioId)) as string | null
    if (loadError != null) {
      yield put(actions.seedDefaultColumnsFailed(projectId, scenarioId, loadError))
      return
    }
    yield put(actions.seedDefaultColumnsSucceeded(projectId, scenarioId))
  } catch (err) {
    yield put(actions.seedDefaultColumnsFailed(projectId, scenarioId, (err as Error).message))
  }
}

// ── Add row ──────────────────────────────────────────────────────────────────
//
// Backend's /addRow takes a fully-built rows[] array, so the saga expands
// (startDate, startTime, deltaHours, numberOfRows) into row dicts here. Every
// column id from columnOrder must appear as a key in each row — backend
// rejects with "row labels must match existing columns" otherwise. Non-date/
// time cells are sent as null (cleared / NaN). Returns counters only — saga
// chains LOAD_SCENARIO_REQUESTED so the reducer doesn't need an append branch.

const HOUR_MS = 60 * 60 * 1000

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// Returns null when (startDate, startTime) doesn't parse — caller fails the
// saga rather than feeding NaN through `Date.UTC` and producing rows like
// "NaN-NaN-NaN". Component validation is best-effort (autofill, paste,
// programmatic dispatch can all bypass it), so the saga must re-validate.
function buildRowsForAdd(
  startDate: string,
  startTime: string,
  deltaHours: number,
  numberOfRows: number,
  columnIds: ColId[],
  columns: Record<ColId, ColumnDef>
): Array<Record<string, string | null>> | null {
  // YYYY-MM-DD + HH:mm parsed in UTC so addition stays linear (no DST shifts).
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(startTime)
  if (!dateMatch || !timeMatch) return null
  const [, ys, mos, ds] = dateMatch
  const [, hs, mis] = timeMatch
  const y = Number.parseInt(ys, 10)
  const mo = Number.parseInt(mos, 10)
  const d = Number.parseInt(ds, 10)
  const h = Number.parseInt(hs, 10)
  const mi = Number.parseInt(mis, 10)
  const baseMs = Date.UTC(y, mo - 1, d, h, mi, 0, 0)
  if (!Number.isFinite(baseMs)) return null
  if (!Number.isFinite(deltaHours) || !Number.isFinite(numberOfRows)) return null

  const out: Array<Record<string, string | null>> = []
  for (let i = 0; i < numberOfRows; i++) {
    const ts = new Date(baseMs + i * deltaHours * HOUR_MS)
    const rowDate = `${ts.getUTCFullYear()}-${pad2(ts.getUTCMonth() + 1)}-${pad2(ts.getUTCDate())}`
    const rowTime = `${pad2(ts.getUTCHours())}:${pad2(ts.getUTCMinutes())}:00`

    const row: Record<string, string | null> = {}
    for (const colId of columnIds) {
      if (colId === DATE_COL_ID) {
        row[colId] = rowDate
        continue
      }
      if (colId === TIME_COL_ID) {
        row[colId] = rowTime
        continue
      }
      // New rows default to checked.
      if (columns[colId]?.name === CHECK_COL_NAME) {
        row[colId] = '1'
        continue
      }
      // Backend rejects /addRow when any column id is missing from the row
      // dict ("row labels must match existing columns"), so we always include
      // every key. The date-time column gets "0" like the other defaults —
      // the renderer ignores the stored value and computes its display from
      // the row's date + time.
      row[colId] = 'NAN'
    }
    out.push(row)
  }
  return out
}

function* addRowWorker(action: AddRowRequestedAction): Generator {
  const { projectId, scenarioId, date, time, columnIds, numberOfRows, deltaHours } = action.payload
  try {
    const table = (yield select(selectActiveWeatherTable)) as WeatherTable | null
    const columns = table?.columns ?? {}
    const rows = buildRowsForAdd(date, time, deltaHours, numberOfRows, columnIds, columns)
    if (rows === null) {
      yield put(
        actions.addRowFailed(
          projectId,
          scenarioId,
          'Invalid start date / time / delta — could not build rows.'
        )
      )
      return
    }
    ;(yield call(addRowsRequest, projectId, scenarioId, { rows })) as AddRowsResponse

    // Re-enter LOAD so the table picks up the new rows, and only dispatch
    // _SUCCEEDED once the load completes — so a UI consumer can treat
    // _SUCCEEDED as "rows are visible now".
    yield put(actions.loadScenarioRequested(projectId, scenarioId))
    const loadError = (yield call(waitForScenarioLoad, scenarioId)) as string | null
    if (loadError != null) {
      yield put(actions.addRowFailed(projectId, scenarioId, loadError))
      return
    }
    yield put(actions.addRowSucceeded(projectId, scenarioId))
  } catch (err) {
    yield put(actions.addRowFailed(projectId, scenarioId, (err as Error).message))
  }
}

// ── Add column ───────────────────────────────────────────────────────────────
//
// `values[]` back-fills existing rows on the server. Each entry is
// { date, time, value } so the backend can address each cell by its row
// timestamp. If the user supplied a default we emit one entry per existing
// row; otherwise we send [] and the server leaves new cells as NaN/null.
// Rows missing date or time are skipped defensively.

function* addColumnWorker(action: AddColumnRequestedAction): Generator {
  const { projectId, scenarioId, name, dataTypeId, dataUnitId, defaultValue } = action.payload
  try {
    const table = (yield select(selectActiveWeatherTable)) as WeatherTable | null
    const values: Array<{ date: string; time: string; value: string }> = []

    if (defaultValue !== '' && table) {
      for (const rowId of table.rowOrder) {
        const row = table.rows[rowId]
        if (!row) continue
        const date = row[DATE_COL_ID]
        const time = row[TIME_COL_ID]
        if (date == null || time == null) continue
        values.push({ date, time, value: defaultValue })
      }
    }

    const res = (yield call(addColumnRequest, projectId, scenarioId, {
      name,
      dataTypeId,
      dataUnitId,
      values,
      defaultValue: defaultValue === '' ? 'NAN' : defaultValue
    })) as AddColumnResponse
    yield put(actions.addColumnSucceeded(projectId, scenarioId, res.column, defaultValue))
  } catch (err) {
    yield put(actions.addColumnFailed(projectId, scenarioId, (err as Error).message))
  }
}

// ── Update column header ─────────────────────────────────────────────────────
//
// PATCH /weather_data_header/{header_id} — partial update. The reducer has
// already applied the optimistic write on _REQUESTED, so this worker only
// needs to (a) translate the colId to a numeric header id, (b) translate
// camelCase keys to the wire's snake_case, and (c) roll back on failure by
// dispatching _FAILED with the snapshot the dispatcher captured.

function* updateColumnWorker(action: UpdateColumnRequestedAction): Generator {
  const { projectId, scenarioId, colId, patch, previous } = action.payload

  // Only backend-managed columns have a numeric header id. Reserved date/time
  // and upload-slug columns must be filtered out at the dispatcher; bail
  // defensively here.
  const headerId = Number(colId)
  if (!Number.isFinite(headerId) || headerId <= 0) {
    yield put(
      actions.updateColumnFailed(projectId, scenarioId, colId, previous, 'Column has no header id')
    )
    return
  }

  const wire: PatchHeaderRequestBody = {}
  if (patch.name !== undefined) wire.name = patch.name
  if (patch.dataTypeId !== undefined) wire.helios_data_type_id = patch.dataTypeId
  if (patch.unitId !== undefined) wire.unit_id = patch.unitId

  const table = (yield select(selectActiveWeatherTable)) as WeatherTable | null
  const col = table?.columns[colId]
  const dataTypes = (yield select(selectAllDataTypes)) as DataTypeDef[]
  const dataType =
    col?.dataTypeId == null ? undefined : dataTypes.find((dt) => dt.id === col.dataTypeId)
  const fromUnit =
    previous.unitId == null || dataType == null
      ? undefined
      : dataType.units.find((unit) => unit.id === previous.unitId)
  const toUnit =
    patch.unitId == null || dataType == null
      ? undefined
      : dataType.units.find((unit) => unit.id === patch.unitId)
  const isConvertibleUnitOnlyChange =
    table != null &&
    col != null &&
    dataType != null &&
    fromUnit != null &&
    toUnit != null &&
    patch.unitId !== undefined &&
    patch.dataTypeId === undefined &&
    previous.unitId !== patch.unitId
  const converted = isConvertibleUnitOnlyChange
    ? buildConvertedColumnValues({
        table,
        colId,
        dataType,
        fromUnit: fromUnit as DataUnitDef,
        toUnit: toUnit as DataUnitDef
      })
    : null

  try {
    if (converted && col && dataType) {
      yield put(
        actions.updateColumnValuesLocal({
          scenarioId,
          colId,
          valuesByRowId: converted.valuesByRowId
        })
      )
      yield call(updateColumnRequest, projectId, scenarioId, headerId, {
        name: col.name,
        dataTypeId: dataType.id,
        dataUnitId: patch.unitId ?? col.unitId,
        values: converted.values,
        defaultValue: 'NAN'
      })
    } else {
      yield call(patchHeaderRequest, projectId, scenarioId, headerId, wire)
    }
    yield put(actions.updateColumnSucceeded(projectId, scenarioId, colId))
  } catch (err) {
    if (converted) {
      yield put(
        actions.updateColumnValuesLocal({
          scenarioId,
          colId,
          valuesByRowId: converted.previousValuesByRowId
        })
      )
    }
    yield put(
      actions.updateColumnFailed(projectId, scenarioId, colId, previous, (err as Error).message)
    )
  }

  // Re-validate AFTER the patch settles — on success, state reflects the
  // new dataTypeId / unitId; on failure, the reducer has rolled back to
  // `previous`. Either way, validation errors mirror the persisted state.
  // Skipped when only `name` changed since name doesn't affect ranges.
  if (patch.dataTypeId !== undefined || patch.unitId !== undefined) {
    yield call(revalidateColumn, scenarioId, colId)
  }
}

// ── Delete column header ────────────────────────────────────────────────────
//
// DELETE /weather_data_header/{header_id}. The reducer removes the column
// optimistically on _REQUESTED; this worker confirms with the backend or
// asks the reducer to restore the caller's snapshot on failure.

function* deleteColumnWorker(action: DeleteColumnRequestedAction): Generator {
  const { projectId, scenarioId, colId, snapshot } = action.payload

  const headerId = Number(colId)
  if (!Number.isFinite(headerId) || headerId <= 0) {
    yield put(
      actions.deleteColumnFailed(projectId, scenarioId, colId, snapshot, 'Column has no header id')
    )
    return
  }

  try {
    yield call(deleteHeaderRequest, projectId, scenarioId, headerId)
    yield put(actions.deleteColumnSucceeded(projectId, scenarioId, colId))
  } catch (err) {
    yield put(
      actions.deleteColumnFailed(projectId, scenarioId, colId, snapshot, (err as Error).message)
    )
  }
}

// Delete one row by its (date, time) key. The reducer already removed the row
// optimistically on _REQUESTED; we POST the single key and roll back via the
// snapshot if the backend rejects.
function* deleteRowWorker(action: DeleteRowRequestedAction): Generator {
  const { projectId, scenarioId, rowId, date, time, snapshot } = action.payload

  try {
    yield call(deleteRowsRequest, projectId, scenarioId, [{ date, time }])
    yield put(actions.deleteRowSucceeded(projectId, scenarioId, rowId))
  } catch (err) {
    yield put(
      actions.deleteRowFailed(projectId, scenarioId, rowId, snapshot, (err as Error).message)
    )
  }
}

// Walk every row of one column, validating against the catalog's per-unit
// range. Bails when the catalog hasn't loaded or the column has been
// removed. Same shape used by loadScenarioWorker (via revalidateScenarioColumns)
// and updateColumnWorker.
function* revalidateColumn(scenarioId: string, colId: ColId): Generator {
  const dataTypes = (yield select(selectAllDataTypes)) as DataTypeDef[]
  if (dataTypes.length === 0) return
  const byScenario = (yield select(selectByScenario)) as Record<string, WeatherTable>
  const table = byScenario[scenarioId]
  const col = table?.columns[colId]
  if (!table || !col) return
  const errors: Record<string, string | null> = {}
  for (const rowId of table.rowOrder) {
    const raw = table.rows[rowId]?.[colId]
    errors[rowId] = validateCellValue(raw ?? '', { col, dataTypes })
  }
  yield put(actions.setColumnValidationErrors(scenarioId, colId, errors))
}

// ── Cell edit ────────────────────────────────────────────────────────────────
//
// UPDATE_CELL_LOCAL writes optimistically in the reducer. The saga then
// short-circuits when validationError is non-null (no network call), and
// otherwise POSTs the edit. The row is identified by (date, time) read
// directly off the row map — backend rejects "date" / "time" as col values.

function* updateCellWorker(action: UpdateCellLocalAction): Generator {
  const { projectId, scenarioId, rowId, colId, value, validationError } = action.payload
  // A validation error no longer blocks the write outright. A numeric value
  // that's merely outside the unit's range is still persisted — the range
  // error stays visible, but the edit is saved. Only genuinely non-numeric
  // input is skipped, since the backend stores floats and can't take it.
  if (validationError != null && !Number.isFinite(Number(value.trim()))) return
  if (colId === DATE_COL_ID || colId === TIME_COL_ID) return

  const table = (yield select(selectActiveWeatherTable)) as WeatherTable | null
  if (!table) return

  // Display-only column — value is computed from row.date + row.time on
  // render and is never persisted, so bail before firing the network call.
  if (table.columns[colId]?.name === DATE_TIME_COL_NAME) return

  yield put(actions.updateCellRequested(projectId, scenarioId, rowId, colId))

  const row = table.rows[rowId]
  if (!row) return

  const date = row[DATE_COL_ID]
  const time = row[TIME_COL_ID]
  if (date == null || time == null) return

  try {
    ;(yield call(updateCellRequest, projectId, scenarioId, {
      col: colId,
      row: { date, time },
      value
    })) as UpdateCellResponse
    yield put(actions.updateCellSucceeded(projectId, scenarioId, rowId, colId))
  } catch (err) {
    yield put(actions.updateCellFailed(projectId, scenarioId, rowId, colId, (err as Error).message))
  }
}
function* updateAllCheckboxesWorker(action: UpdateAllCheckboxesRequestedAction): Generator {
  const { projectId, scenarioId, checkColId, value } = action.payload

  try {
    const checkHeaderId = Number(checkColId)
    if (!Number.isFinite(checkHeaderId) || checkHeaderId <= 0) return

    const table = (yield select(selectActiveWeatherTable)) as WeatherTable | null
    const values: Array<{ date: string; time: string; value: string }> = []

    if (table) {
      for (const rowId of table.rowOrder) {
        const row = table.rows[rowId]
        if (!row) continue
        const date = row[DATE_COL_ID]
        const time = row[TIME_COL_ID]
        if (date == null || time == null) continue
        values.push({ date, time, value })
      }
    }

    yield call(updateColumnRequest, projectId, scenarioId, checkHeaderId, {
      name: CHECK_COL_NAME,
      values
    })
  } catch {
    // Local optimistic reducer state already reflects the checkbox toggle.
    // Follow-up error handling can be added once the UI has a place to show it.
  }
}

// ── Root watcher ─────────────────────────────────────────────────────────────

export default function* projectScreenSaga(): Generator {
  yield takeLatest(LOAD_DATA_TYPES_REQUESTED, loadDataTypesWorker)
  yield takeLatest(LOAD_OBJECT_TYPES_REQUESTED, loadObjectTypesWorker)
  yield takeLatest(LOAD_MATERIAL_TYPES_REQUESTED, loadMaterialTypesWorker)
  yield takeLatest(LOAD_MODEL_TYPES_REQUESTED, loadModelTypesWorker)
  yield takeLatest(UPDATE_PROJECT_REQUESTED, updateProjectWorker)
  yield takeLatest(LIST_SCENARIOS_REQUESTED, listScenariosWorker)
  yield takeLatest(LOAD_SCENARIO_REQUESTED, loadScenarioWorker)
  yield takeLatest(SEED_DEFAULT_COLUMNS_REQUESTED, seedDefaultColumnsWorker)
  yield takeLatest(ADD_ROW_REQUESTED, addRowWorker)
  yield takeLatest(ADD_COLUMN_REQUESTED, addColumnWorker)
  yield takeEvery(UPDATE_COLUMN_REQUESTED, updateColumnWorker)
  yield takeEvery(DELETE_COLUMN_REQUESTED, deleteColumnWorker)
  yield takeEvery(DELETE_ROW_REQUESTED, deleteRowWorker)
  yield takeEvery(UPDATE_CELL_LOCAL, updateCellWorker)
  yield takeLatest(UPDATE_ALL_CHECKBOXES_REQUESTED, updateAllCheckboxesWorker)
}
