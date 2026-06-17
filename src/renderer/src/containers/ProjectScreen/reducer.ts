import { produce, type Draft } from 'immer'
import type { ProjectScreenAction } from './actions'
import {
  ADD_COLUMN_FAILED,
  ADD_COLUMN_REQUESTED,
  ADD_COLUMN_RESET,
  ADD_COLUMN_SUCCEEDED,
  DELETE_COLUMN_FAILED,
  DELETE_COLUMN_REQUESTED,
  DELETE_COLUMN_SUCCEEDED,
  DELETE_ROW_FAILED,
  DELETE_ROW_REQUESTED,
  DELETE_ROW_SUCCEEDED,
  ADD_ROW_FAILED,
  ADD_ROW_REQUESTED,
  ADD_ROW_RESET,
  ADD_ROW_SUCCEEDED,
  LIST_SCENARIOS_FAILED,
  LIST_SCENARIOS_REQUESTED,
  LIST_SCENARIOS_SUCCEEDED,
  LOAD_DATA_TYPES_FAILED,
  LOAD_DATA_TYPES_REQUESTED,
  LOAD_DATA_TYPES_SUCCEEDED,
  LOAD_MATERIAL_TYPES_FAILED,
  LOAD_MATERIAL_TYPES_REQUESTED,
  LOAD_MATERIAL_TYPES_SUCCEEDED,
  LOAD_MODEL_TYPES_FAILED,
  LOAD_MODEL_TYPES_REQUESTED,
  LOAD_MODEL_TYPES_SUCCEEDED,
  LOAD_OBJECT_TYPES_FAILED,
  LOAD_OBJECT_TYPES_REQUESTED,
  LOAD_OBJECT_TYPES_SUCCEEDED,
  LOAD_HEADERS_FAILED,
  LOAD_HEADERS_REQUESTED,
  LOAD_HEADERS_SUCCEEDED,
  LOAD_PROJECT_SUCCEEDED,
  LOAD_SCENARIO_FAILED,
  LOAD_SCENARIO_REQUESTED,
  LOAD_SCENARIO_SUCCEEDED,
  SET_ACTIVE_PROJECT,
  SET_ACTIVE_SCENARIO,
  SET_ALL_ROWS_SELECTION,
  SET_CELL_VALIDATION_ERROR,
  SET_COLUMN_NAME_ERROR,
  SET_COLUMN_VALIDATION_ERRORS,
  SET_ROW_SELECTION,
  UPDATE_ALL_CHECKBOXES_REQUESTED,
  UPDATE_CELL_FAILED,
  UPDATE_CELL_LOCAL,
  UPDATE_CELL_REQUESTED,
  UPDATE_CELL_SUCCEEDED,
  UPDATE_COLUMN_FAILED,
  UPDATE_COLUMN_REQUESTED,
  UPDATE_COLUMN_SUCCEEDED,
  UPDATE_COLUMN_VALUES_LOCAL,
  UPDATE_PROJECT_FAILED,
  UPDATE_PROJECT_REQUESTED,
  UPDATE_PROJECT_SUCCEEDED,
  UPLOAD_FILE_FAILED,
  UPLOAD_FILE_REQUESTED,
  UPLOAD_FILE_SUCCEEDED
} from './constants'
import {
  cellKey,
  emptyWeatherTable,
  type DataTypeDef,
  type LoadStatus,
  type MaterialTypeDef,
  type ModelTypeDef,
  type ObjectTypeDef,
  type ProjectMetadata,
  type RowId,
  type Scenario,
  type WeatherHeader,
  type WeatherTable
} from './types'

export type {
  CellSyncStatus,
  CellValue,
  ColId,
  ColumnDef,
  DataTypeDef,
  DataUnitDef,
  LoadStatus,
  MaterialTypeDef,
  ModelTypeDef,
  ObjectTypeDef,
  RowId,
  Scenario,
  WeatherHeader,
  WeatherTable
} from './types'

// ── State ────────────────────────────────────────────────────────────────────

export interface DataTypesSlice {
  byId: Record<number, DataTypeDef>
  allIds: number[]
  loadStatus: LoadStatus
  loadError: string | null
}

// All four catalogs share the same normalized shape (byId + ordered allIds +
// load lifecycle). Generic over the entry type so each keeps a precise byId.
export interface CatalogTypeSlice<T> {
  byId: Record<number, T>
  allIds: number[]
  loadStatus: LoadStatus
  loadError: string | null
}

export type ObjectTypesSlice = CatalogTypeSlice<ObjectTypeDef>
export type MaterialTypesSlice = CatalogTypeSlice<MaterialTypeDef>
export type ModelTypesSlice = CatalogTypeSlice<ModelTypeDef>

export interface CatalogSlice {
  dataTypes: DataTypesSlice
  objectTypes: ObjectTypesSlice
  materialTypes: MaterialTypesSlice
  modelTypes: ModelTypesSlice
}

export interface ScenariosByProjectEntry {
  ids: string[]
  byId: Record<string, Scenario>
  loadStatus: LoadStatus
  loadError: string | null
}

export interface ScenariosSlice {
  byProject: Record<string, ScenariosByProjectEntry>
}

// Raw weather_data_header rows, keyed by scenario id. Stored verbatim from
// the wire so consumers can read fields the joined ColumnDef discards
// (status, display_order, helios_data_type_id). `ids` is sorted by
// display_order so iteration order matches the table.
export interface HeadersByScenarioEntry {
  ids: number[]
  byId: Record<number, WeatherHeader>
  loadStatus: LoadStatus
  loadError: string | null
}

export interface HeadersSlice {
  byScenario: Record<string, HeadersByScenarioEntry>
}

// Tracks the in-flight state of one-off mutation flows (add column, add
// row). UI reads `loading` to show a spinner / disable the submit button
// and `error` to render a banner. `error === null` means "no failure as of
// the most recent attempt" — including before the first attempt.
export interface RequestStatus {
  loading: boolean
  error: string | null
}

export interface ProjectScreenState {
  catalog: CatalogSlice
  scenarios: ScenariosSlice
  headers: HeadersSlice
  activeProjectId: string | null
  activeScenarioId: string | null
  // Subset of GET /project/{id}, populated alongside scenarios. null until
  // the response lands, and reset to null when the active project changes.
  activeProject: ProjectMetadata | null
  byScenario: Record<string, WeatherTable>
  addColumn: RequestStatus
  addRow: RequestStatus
  updateProject: RequestStatus
}

const emptyDataTypesSlice = (): DataTypesSlice => ({
  byId: {},
  allIds: [],
  loadStatus: 'idle',
  loadError: null
})

// Fresh empty slice for any of the generic catalogs (object / material / model).
const emptyCatalogTypeSlice = <T>(): CatalogTypeSlice<T> => ({
  byId: {},
  allIds: [],
  loadStatus: 'idle',
  loadError: null
})

const emptyScenariosEntry = (): ScenariosByProjectEntry => ({
  ids: [],
  byId: {},
  loadStatus: 'idle',
  loadError: null
})

const emptyHeadersEntry = (): HeadersByScenarioEntry => ({
  ids: [],
  byId: {},
  loadStatus: 'idle',
  loadError: null
})

const idleStatus = (): RequestStatus => ({ loading: false, error: null })

export const initialState: ProjectScreenState = {
  catalog: {
    dataTypes: emptyDataTypesSlice(),
    objectTypes: emptyCatalogTypeSlice(),
    materialTypes: emptyCatalogTypeSlice(),
    modelTypes: emptyCatalogTypeSlice()
  },
  scenarios: { byProject: {} },
  headers: { byScenario: {} },
  activeProjectId: null,
  activeScenarioId: null,
  activeProject: null,
  byScenario: {},
  addColumn: idleStatus(),
  addRow: idleStatus(),
  updateProject: idleStatus()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureTable(draft: Draft<ProjectScreenState>, scenarioId: string): Draft<WeatherTable> {
  if (!draft.byScenario[scenarioId]) {
    draft.byScenario[scenarioId] = emptyWeatherTable()
  }
  return draft.byScenario[scenarioId]
}

function ensureScenariosEntry(
  draft: Draft<ProjectScreenState>,
  projectId: string
): Draft<ScenariosByProjectEntry> {
  if (!draft.scenarios.byProject[projectId]) {
    draft.scenarios.byProject[projectId] = emptyScenariosEntry()
  }
  return draft.scenarios.byProject[projectId]
}

function ensureHeadersEntry(
  draft: Draft<ProjectScreenState>,
  scenarioId: string
): Draft<HeadersByScenarioEntry> {
  if (!draft.headers.byScenario[scenarioId]) {
    draft.headers.byScenario[scenarioId] = emptyHeadersEntry()
  }
  return draft.headers.byScenario[scenarioId]
}

const rowIdAt = (i: number): RowId => `row_${i}`

// ── Reducer ──────────────────────────────────────────────────────────────────

const projectScreenReducer = (
  state: ProjectScreenState = initialState,
  action: ProjectScreenAction
): ProjectScreenState =>
  produce(state, (draft) => {
    switch (action.type) {
      // ── Catalog: data types ────────────────────────────────────────────────

      case LOAD_DATA_TYPES_REQUESTED:
        draft.catalog.dataTypes.loadStatus = 'loading'
        draft.catalog.dataTypes.loadError = null
        break

      case LOAD_DATA_TYPES_SUCCEEDED:
        draft.catalog.dataTypes.byId = {}
        draft.catalog.dataTypes.allIds = []
        for (const def of action.payload) {
          draft.catalog.dataTypes.byId[def.id] = def
          draft.catalog.dataTypes.allIds.push(def.id)
        }
        draft.catalog.dataTypes.loadStatus = 'loaded'
        break

      case LOAD_DATA_TYPES_FAILED:
        draft.catalog.dataTypes.loadStatus = 'error'
        draft.catalog.dataTypes.loadError = action.payload
        break

      // ── Catalog: object types ──────────────────────────────────────────────

      case LOAD_OBJECT_TYPES_REQUESTED:
        draft.catalog.objectTypes.loadStatus = 'loading'
        draft.catalog.objectTypes.loadError = null
        break

      case LOAD_OBJECT_TYPES_SUCCEEDED:
        draft.catalog.objectTypes.byId = {}
        draft.catalog.objectTypes.allIds = []
        for (const def of action.payload) {
          draft.catalog.objectTypes.byId[def.id] = def
          draft.catalog.objectTypes.allIds.push(def.id)
        }
        draft.catalog.objectTypes.loadStatus = 'loaded'
        break

      case LOAD_OBJECT_TYPES_FAILED:
        draft.catalog.objectTypes.loadStatus = 'error'
        draft.catalog.objectTypes.loadError = action.payload
        break

      // ── Catalog: material types ────────────────────────────────────────────

      case LOAD_MATERIAL_TYPES_REQUESTED:
        draft.catalog.materialTypes.loadStatus = 'loading'
        draft.catalog.materialTypes.loadError = null
        break

      case LOAD_MATERIAL_TYPES_SUCCEEDED:
        draft.catalog.materialTypes.byId = {}
        draft.catalog.materialTypes.allIds = []
        for (const def of action.payload) {
          draft.catalog.materialTypes.byId[def.id] = def
          draft.catalog.materialTypes.allIds.push(def.id)
        }
        draft.catalog.materialTypes.loadStatus = 'loaded'
        break

      case LOAD_MATERIAL_TYPES_FAILED:
        draft.catalog.materialTypes.loadStatus = 'error'
        draft.catalog.materialTypes.loadError = action.payload
        break

      // ── Catalog: model types ───────────────────────────────────────────────

      case LOAD_MODEL_TYPES_REQUESTED:
        draft.catalog.modelTypes.loadStatus = 'loading'
        draft.catalog.modelTypes.loadError = null
        break

      case LOAD_MODEL_TYPES_SUCCEEDED:
        draft.catalog.modelTypes.byId = {}
        draft.catalog.modelTypes.allIds = []
        for (const def of action.payload) {
          draft.catalog.modelTypes.byId[def.id] = def
          draft.catalog.modelTypes.allIds.push(def.id)
        }
        draft.catalog.modelTypes.loadStatus = 'loaded'
        break

      case LOAD_MODEL_TYPES_FAILED:
        draft.catalog.modelTypes.loadStatus = 'error'
        draft.catalog.modelTypes.loadError = action.payload
        break

      // ── Active project + scenario ──────────────────────────────────────────

      case SET_ACTIVE_PROJECT:
        // Switching projects invalidates the active scenario — drop it so the
        // table renders empty until the saga loads the new project's scenarios
        // (otherwise selectActiveWeatherTable keeps returning the prior
        // scenario's cached rows). Same idea for activeProject metadata: the
        // header inputs should not show stale lat/long while the new project
        // is in flight.
        if (draft.activeProjectId !== action.payload.projectId) {
          draft.activeScenarioId = null
          draft.activeProject = null
        }
        draft.activeProjectId = action.payload.projectId
        break

      case LOAD_PROJECT_SUCCEEDED:
        draft.activeProject = action.payload
        break

      case UPDATE_PROJECT_REQUESTED:
        draft.updateProject.loading = true
        draft.updateProject.error = null
        break

      case UPDATE_PROJECT_SUCCEEDED:
        draft.updateProject.loading = false
        draft.updateProject.error = null
        draft.activeProject = action.payload
        break

      case UPDATE_PROJECT_FAILED:
        draft.updateProject.loading = false
        draft.updateProject.error = action.payload.error
        break

      case SET_ACTIVE_SCENARIO:
        draft.activeScenarioId = action.payload.scenarioId
        ensureTable(draft, action.payload.scenarioId)
        break

      // ── List scenarios (per project) ───────────────────────────────────────

      case LIST_SCENARIOS_REQUESTED: {
        const entry = ensureScenariosEntry(draft, action.payload.projectId)
        entry.loadStatus = 'loading'
        entry.loadError = null
        break
      }

      case LIST_SCENARIOS_SUCCEEDED: {
        const entry = ensureScenariosEntry(draft, action.payload.projectId)
        entry.ids = []
        entry.byId = {}
        for (const s of action.payload.scenarios) {
          entry.byId[s.id] = s
          entry.ids.push(s.id)
        }
        entry.loadStatus = 'loaded'
        break
      }

      case LIST_SCENARIOS_FAILED: {
        const entry = ensureScenariosEntry(draft, action.payload.projectId)
        entry.loadStatus = 'error'
        entry.loadError = action.payload.error
        break
      }

      // ── Weather headers (per scenario) ─────────────────────────────────────

      case LOAD_HEADERS_REQUESTED: {
        const entry = ensureHeadersEntry(draft, action.payload.scenarioId)
        entry.loadStatus = 'loading'
        entry.loadError = null
        break
      }

      case LOAD_HEADERS_SUCCEEDED: {
        const entry = ensureHeadersEntry(draft, action.payload.scenarioId)
        entry.ids = []
        entry.byId = {}
        // Sort by display_order so iteration order matches the rendered table.
        const sorted = [...action.payload.headers].sort((a, b) => a.display_order - b.display_order)
        for (const h of sorted) {
          entry.byId[h.id] = h
          entry.ids.push(h.id)
        }
        entry.loadStatus = 'loaded'
        break
      }

      case LOAD_HEADERS_FAILED: {
        const entry = ensureHeadersEntry(draft, action.payload.scenarioId)
        entry.loadStatus = 'error'
        entry.loadError = action.payload.error
        break
      }

      // ── Scenario load ──────────────────────────────────────────────────────

      case LOAD_SCENARIO_REQUESTED:
        ensureTable(draft, action.payload.scenarioId)
        break

      case LOAD_SCENARIO_SUCCEEDED: {
        const { scenarioId, columns, rows } = action.payload
        const fresh = emptyWeatherTable()

        for (const col of columns) {
          fresh.columns[col.id] = { ...col }
          fresh.columnOrder.push(col.id)
        }

        rows.forEach((rowData, i) => {
          const rowId = rowIdAt(i)
          fresh.rows[rowId] = { ...rowData }
          fresh.rowOrder.push(rowId)
          fresh.rowSelection[rowId] = true
        })

        draft.byScenario[scenarioId] = fresh
        break
      }

      case LOAD_SCENARIO_FAILED:
        // No table-level error state; UI surfaces error via dialog/toast.
        break

      // ── Upload ─────────────────────────────────────────────────────────────

      case UPLOAD_FILE_REQUESTED:
        ensureTable(draft, action.payload.scenarioId)
        break

      case UPLOAD_FILE_SUCCEEDED:
        // Upload replaces server-side data; clear the client cache so the
        // follow-up LOAD_SCENARIO populates a fresh table. The saga is
        // responsible for dispatching that follow-up.
        draft.byScenario[action.payload.scenarioId] = emptyWeatherTable()
        break

      case UPLOAD_FILE_FAILED:
        break

      // ── Add row ────────────────────────────────────────────────────────────
      //
      // Row-add returns counters only; the saga chains LOAD_SCENARIO_REQUESTED
      // on success. No append branch in the reducer.

      case ADD_ROW_REQUESTED:
        draft.addRow.loading = true
        draft.addRow.error = null
        break

      case ADD_ROW_SUCCEEDED:
        draft.addRow.loading = false
        draft.addRow.error = null
        break

      case ADD_ROW_FAILED:
        draft.addRow.loading = false
        draft.addRow.error = action.payload.error
        break

      case ADD_ROW_RESET:
        draft.addRow = idleStatus()
        break

      // ── Add column ─────────────────────────────────────────────────────────

      case ADD_COLUMN_REQUESTED:
        draft.addColumn.loading = true
        draft.addColumn.error = null
        break

      case ADD_COLUMN_SUCCEEDED: {
        const { scenarioId, column, defaultValue } = action.payload
        draft.addColumn.loading = false
        draft.addColumn.error = null
        const table = draft.byScenario[scenarioId]
        if (!table) break

        table.columns[column.id] = { ...column }
        table.columnOrder.push(column.id)
        for (const rowId of table.rowOrder) {
          if (!table.rows[rowId]) table.rows[rowId] = {}
          // Server stores NaN for newly-created cells until they're touched;
          // mirror that with `null` unless the user supplied a default value.
          table.rows[rowId][column.id] =
            defaultValue === '' || defaultValue.trim().toUpperCase() === 'NAN' ? null : defaultValue
        }
        break
      }

      case ADD_COLUMN_FAILED:
        draft.addColumn.loading = false
        draft.addColumn.error = action.payload.error
        break

      case ADD_COLUMN_RESET:
        draft.addColumn = idleStatus()
        break

      // ── Update column header (PATCH) ───────────────────────────────────────
      //
      // Optimistic: write the patch into the local ColumnDef on _REQUESTED, no-op
      // on _SUCCEEDED, restore the snapshot on _FAILED. The caller hands the
      // saga the prior values so we can roll back without re-fetching.

      case UPDATE_COLUMN_REQUESTED: {
        const { scenarioId, colId, patch } = action.payload
        const table = draft.byScenario[scenarioId]
        const col = table?.columns[colId]
        if (!table || !col) break
        if (patch.name !== undefined) {
          col.name = patch.name
          // Optimistically clear any prior rejection — a new attempt is in
          // flight. _FAILED re-sets it if this attempt is also rejected.
          delete table.columnNameErrors[colId]
        }
        if (patch.dataTypeId !== undefined) col.dataTypeId = patch.dataTypeId
        if (patch.unitId !== undefined) col.unitId = patch.unitId
        break
      }

      case UPDATE_COLUMN_SUCCEEDED:
        // Intentionally a no-op for columnNameErrors. A successful *name*
        // change already had its error cleared by the REQUESTED that started
        // it; clearing here unconditionally would also wipe a still-valid name
        // rejection when an unrelated data-type / unit change on the same
        // column succeeds (and triggers cell revalidation).
        break

      case UPDATE_COLUMN_FAILED: {
        const { scenarioId, colId, previous, error } = action.payload
        const table = draft.byScenario[scenarioId]
        const col = table?.columns[colId]
        if (!table || !col) break
        // Name change rejected: keep the user's typed name on screen and
        // surface the backend message inline (mirrors the client-side
        // required/30-char errors) rather than silently reverting.
        if (previous.name !== undefined) {
          table.columnNameErrors[colId] = error
        }
        // Data type / unit changes still roll back to the snapshot.
        if (previous.dataTypeId !== undefined) col.dataTypeId = previous.dataTypeId
        if (previous.unitId !== undefined) col.unitId = previous.unitId
        break
      }

      case UPDATE_COLUMN_VALUES_LOCAL: {
        const { scenarioId, colId, valuesByRowId } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table) break
        for (const [rowId, value] of Object.entries(valuesByRowId)) {
          if (!table.rows[rowId]) table.rows[rowId] = {}
          table.rows[rowId][colId] = value
        }
        break
      }

      // ── Delete column header (DELETE) ─────────────────────────────────────
      //
      // Optimistic: remove the column and all of its table-local cells/errors
      // on request. If the backend rejects, restore the snapshot captured by
      // the dispatcher.

      case DELETE_COLUMN_REQUESTED: {
        const { scenarioId, colId } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table?.columns[colId]) break

        table.columnOrder = table.columnOrder.filter((id) => id !== colId)
        delete table.columns[colId]
        for (const rowId of table.rowOrder) {
          delete table.rows[rowId]?.[colId]
          if (table.validationErrors[rowId]) {
            delete table.validationErrors[rowId][colId]
          }
        }
        for (const key of Object.keys(table.cellSync)) {
          if (key.endsWith(`:${colId}`)) delete table.cellSync[key]
        }
        break
      }

      case DELETE_COLUMN_SUCCEEDED:
        break

      case DELETE_COLUMN_FAILED: {
        const { scenarioId, colId, snapshot } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table || table.columns[colId]) break

        table.columns[colId] = { ...snapshot.column }
        const boundedIndex =
          snapshot.index < 0
            ? table.columnOrder.length
            : Math.min(snapshot.index, table.columnOrder.length)
        table.columnOrder.splice(boundedIndex, 0, colId)

        for (const rowId of table.rowOrder) {
          const value = snapshot.rowValues[rowId]
          if (value !== undefined) {
            if (!table.rows[rowId]) table.rows[rowId] = {}
            table.rows[rowId][colId] = value
          }
          const error = snapshot.validationErrors[rowId]
          if (error !== undefined) {
            if (!table.validationErrors[rowId]) table.validationErrors[rowId] = {}
            table.validationErrors[rowId][colId] = error
          }
        }
        Object.assign(table.cellSync, snapshot.cellSync)
        break
      }

      // ── Delete row (POST /deleteRow) ──────────────────────────────────────
      //
      // Optimistic: drop the row from rows / rowOrder / validationErrors /
      // rowSelection and its cellSync entries on request. Restore from the
      // snapshot if the backend rejects.

      case DELETE_ROW_REQUESTED: {
        const { scenarioId, rowId } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table?.rows[rowId]) break

        table.rowOrder = table.rowOrder.filter((id) => id !== rowId)
        delete table.rows[rowId]
        delete table.validationErrors[rowId]
        delete table.rowSelection[rowId]
        for (const key of Object.keys(table.cellSync)) {
          if (key.startsWith(`${rowId}:`)) delete table.cellSync[key]
        }
        break
      }

      case DELETE_ROW_SUCCEEDED:
        break

      case DELETE_ROW_FAILED: {
        const { scenarioId, rowId, snapshot } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table || table.rows[rowId]) break

        table.rows[rowId] = { ...snapshot.cells }
        const boundedIndex =
          snapshot.index < 0
            ? table.rowOrder.length
            : Math.min(snapshot.index, table.rowOrder.length)
        table.rowOrder.splice(boundedIndex, 0, rowId)
        if (snapshot.validationErrors) {
          table.validationErrors[rowId] = { ...snapshot.validationErrors }
        }
        if (snapshot.selected) table.rowSelection[rowId] = true
        Object.assign(table.cellSync, snapshot.cellSync)
        break
      }

      // ── Cell edit ──────────────────────────────────────────────────────────

      case UPDATE_CELL_LOCAL: {
        const { scenarioId, rowId, colId, value, validationError } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table) break

        if (!table.rows[rowId]) table.rows[rowId] = {}
        // Empty input clears the cell — write null to mirror server NaN.
        table.rows[rowId][colId] = value === '' ? null : value

        const key = cellKey(rowId, colId)
        if (validationError != null) {
          if (!table.validationErrors[rowId]) table.validationErrors[rowId] = {}
          table.validationErrors[rowId][colId] = validationError
          // A numeric value that's only out of range is still sent (the saga
          // persists it while the error stays visible), so keep it pending.
          // Non-numeric input makes no network call — drop any stale pending.
          if (Number.isFinite(Number(value.trim()))) {
            table.cellSync[key] = 'pending'
          } else {
            delete table.cellSync[key]
          }
        } else {
          if (table.validationErrors[rowId]) {
            delete table.validationErrors[rowId][colId]
          }
          table.cellSync[key] = 'pending'
        }
        break
      }

      case UPDATE_CELL_REQUESTED:
        // Saga trigger only — local state already reflects pending sync.
        break

      case UPDATE_CELL_SUCCEEDED: {
        const { scenarioId, rowId, colId } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table) break
        delete table.cellSync[cellKey(rowId, colId)]
        break
      }

      case UPDATE_CELL_FAILED: {
        const { scenarioId, rowId, colId, error } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table) break
        table.cellSync[cellKey(rowId, colId)] = 'error'
        // Surface the backend's rejection message through the same
        // validationErrors map the local validator uses, so CellInput's red
        // ring + info-icon tooltip render identically for both error sources.
        if (!table.validationErrors[rowId]) table.validationErrors[rowId] = {}
        table.validationErrors[rowId][colId] = error
        break
      }

      case UPDATE_ALL_CHECKBOXES_REQUESTED: {
        const { scenarioId, checkColId, value } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table) break
        for (const rowId of table.rowOrder) {
          if (!table.rows[rowId]) table.rows[rowId] = {}
          table.rows[rowId][checkColId] = value
        }
        break
      }

      // ── Bulk per-column validation ─────────────────────────────────────────
      //
      // Fired by the saga after a column's data type or unit changes. Each
      // entry in `errors` is the validation result for one row in that
      // column: a string sets the error, `null` clears any prior error.
      // Cell values themselves are not touched.

      case SET_COLUMN_VALIDATION_ERRORS: {
        const { scenarioId, colId, errors } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table) break
        for (const rowId in errors) {
          const msg = errors[rowId]
          if (msg == null) {
            if (table.validationErrors[rowId]) {
              delete table.validationErrors[rowId][colId]
            }
          } else {
            if (!table.validationErrors[rowId]) table.validationErrors[rowId] = {}
            table.validationErrors[rowId][colId] = msg
          }
        }
        break
      }

      // Single-cell live validation: write/clear the error slot without
      // touching rows[] or cellSync. Used by CellInput's keystroke validator
      // so the red outline + tooltip update while typing.
      case SET_CELL_VALIDATION_ERROR: {
        const { scenarioId, rowId, colId, validationError } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table) break
        if (validationError == null) {
          if (table.validationErrors[rowId]) {
            delete table.validationErrors[rowId][colId]
          }
        } else {
          if (!table.validationErrors[rowId]) table.validationErrors[rowId] = {}
          table.validationErrors[rowId][colId] = validationError
        }
        break
      }

      // Per-column header name error: set the backend rejection message or
      // clear it (on a fresh edit). Touches only columnNameErrors.
      case SET_COLUMN_NAME_ERROR: {
        const { scenarioId, colId, error } = action.payload
        const table = draft.byScenario[scenarioId]
        if (!table) break
        if (error == null) delete table.columnNameErrors[colId]
        else table.columnNameErrors[colId] = error
        break
      }

      // ── Selection ──────────────────────────────────────────────────────────

      case SET_ROW_SELECTION: {
        const table = draft.byScenario[action.payload.scenarioId]
        if (!table) break
        table.rowSelection[action.payload.rowId] = action.payload.selected
        break
      }

      case SET_ALL_ROWS_SELECTION: {
        const table = draft.byScenario[action.payload.scenarioId]
        if (!table) break
        for (const rowId of table.rowOrder) {
          table.rowSelection[rowId] = action.payload.selected
        }
        break
      }
    }
  })

export default projectScreenReducer
