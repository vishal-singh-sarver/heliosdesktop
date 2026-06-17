// Domain types for the ProjectScreen slice.
//
// Three concerns live here: the catalog (data types and units, loaded from
// backend), the active project + scenario, and the per-scenario WeatherTable.
// Imported by actions.ts, reducer.ts and selectors.ts to avoid circular deps.

// ── Catalog: data types and units (loaded from backend) ─────────────────────
//
// The backend exposes a single combined endpoint:
//   GET /api/data-types/with-units -> { data_types: DataTypeDef[] }
// where each data type carries its `units[]` inline. Wire shapes use
// snake_case; we keep them as-is so the service layer is a pass-through.

export interface DataUnitDef {
  id: number
  unit: string
  alias: string
  data_type_id: number
  min: number | null
  max: number | null
  to_base_factor: number
  to_base_offset: number
  is_base: boolean
  created_at: string
  updated_at: string
}

export interface DataTypeDef {
  id: number
  data_type: string
  description: string
  created_at: string
  updated_at: string
  units: DataUnitDef[]
}

// ── Catalog: object / material / model types ────────────────────────────────
//
// Loaded in parallel with dataTypes on ProjectScreen mount, from the
// /api/catalog/* endpoints. Wire shapes are snake_case; we keep them verbatim
// so the service layer stays a pass-through (same convention as DataTypeDef).
// `datatype` here is the backend's scalar kind string ("float" | "integer" |
// "boolean" | "file" | "date" | "time" | "enum" | "string"), not a catalog id.

export type CatalogPropertyDatatype =
  | 'float'
  | 'integer'
  | 'boolean'
  | 'file'
  | 'date'
  | 'time'
  | 'enum'
  | 'string'

// One property row shared by object and material types. `group` and
// `enum_values` are material-only (objects omit them); `required` is
// object-only. All optional fields are absent — not null — when unused.
export interface CatalogPropertyDef {
  property_type_id: number
  property: string
  description: string
  datatype: CatalogPropertyDatatype
  min: number | null
  max: number | null
  display_order: number
  required?: boolean // object-types only
  group?: string // material-types only (e.g. "model" | "visualisation")
  enum_values?: string[] // present only when datatype === 'enum'
}

// GET /api/catalog/object-types -> { object_types: ObjectTypeDef[] }
export interface ObjectTypeDef {
  id: number
  object: string // "Ground" | "Crop"
  properties: CatalogPropertyDef[]
}

// GET /api/catalog/material-types -> { material_types: MaterialTypeDef[] }
export interface MaterialTypeDef {
  id: number
  materialtype: string // "Radiation" | "Energy Balance" | …
  description: string
  properties: CatalogPropertyDef[]
}

// ── Catalog: model types (runnable simulation models) ───────────────────────
//
//   GET /api/catalog/model-types -> { model_types: ModelTypeDef[] }
// The wire shape is hierarchical (each model carries a `submodels[]` array), but
// the GUI consumes only the top-level models, so we drop submodels on ingest.
// `model` is the display name; ids key `visibility.models` on geometry objects (§5).
export interface ModelTypeDef {
  id: number
  model: string
  description: string
}

// ── Project metadata ────────────────────────────────────────────────────────
//
// Subset of GET /api/project/{id} that the project screen needs in order
// to populate the header inputs (latitude, longitude, utc offset). The
// full response also includes nested scenarios + weather_data_headers,
// which we route into the dedicated scenarios / headers slices instead.

export interface ProjectMetadata {
  id: string
  name: string
  latitude: number
  longitude: number
  utc_offset: string // wire shape: "+05:00"
}

export interface UpdateProjectPatch {
  name?: string
  latitude?: number
  longitude?: number
}

// ── Scenarios (per project) ─────────────────────────────────────────────────

export interface Scenario {
  id: string // UUID
  name: string
  has_weather: boolean
  created_at: string
  updated_at: string
}

// ── Identifiers ──────────────────────────────────────────────────────────────

// ColId is an opaque string. For backend-managed columns it's the stringified
// WeatherDataHeader.id ("5", "12"). For the date/time pseudo-columns it's the
// literal strings "date" and "time". For upload-created columns it's the
// slugified CSV header (e.g. "air_temperature") — these have no metadata in
// weather_data_header, so unit/dataType selectors fall back gracefully.
export type ColId = string

// RowId is client-generated, e.g. `row_${index}`. The backend doesn't have a
// row id concept — rows are addressed by (date, time).
export type RowId = string

// Cell value. null === NaN (cleared cell). The cell editor renders null as
// an empty input, and writing "" to a cell is the way to clear it (the
// reducer normalizes "" to null at write time).
export type CellValue = string | null

// Reserved column ids for the date/time pseudo-columns synthesised by the
// load saga. Never sent to the backend as `col` in update/delete.
export const DATE_COL_ID: ColId = 'date'
export const TIME_COL_ID: ColId = 'time'

// `date-time` and `check` are real backend columns (created by the empty-
// scenario seed). The load saga overrides their backend-assigned numeric ids
// with these literal strings so the renderer can identify them by colId
// without joining on name. `date-time` is display-only (built from the row's
// date + time on render); `check` is a 0/1 flag toggled via updateCell.
export const DATE_TIME_COL_ID: ColId = 'date-time'
export const CHECK_COL_ID: ColId = 'check'

// The names the seed POSTs and the load saga matches against. Backend
// returns these verbatim in the headers list.
export const DATE_TIME_COL_NAME = 'date-time'
export const CHECK_COL_NAME = 'check'

// Catalog name of the dedicated `check` data type. The seed worker resolves
// this name to its numeric id (helios_data_type_id) and stamps it on the
// seeded check column.
export const CHECK_DATA_TYPE_NAME = 'check'

// Catalog name of the dedicated `date_time` data type. Its "units" are
// format patterns (e.g. "MM/DD/YYYY HH:MM"), not numeric conversions. The
// merged date-time column uses this type implicitly; picking a unit in the
// header dropdown PATCHes both helios_data_type_id and unit_id together.
export const DATE_TIME_DATA_TYPE_NAME = 'date_time'

// True when the colId refers to a column whose cell is not user-editable as a
// raw value: the date/time pseudo-columns and the merged date-time display
// column. `check` is not reserved — its cell IS editable, just via a checkbox
// instead of a text input.
export function isReservedColId(colId: ColId): boolean {
  return colId === DATE_COL_ID || colId === TIME_COL_ID || colId === DATE_TIME_COL_ID
}

// ── Backend wire shape: weather_data_header row ─────────────────────────────

export interface WeatherHeader {
  id: number
  scenario_id: string
  name: string
  helios_data_type_id: number
  unit_id: number
  status: boolean
  display_order: number
  created_at: string
  updated_at: string
}

// ── Internal column shape ───────────────────────────────────────────────────
//
// Built by the load saga by joining DataPage.labels[] with WeatherHeader[].
// dataTypeId/unitId are nullable for *every* column, not just date/time —
// uploaded columns lack metadata and render as bare names.

export interface ColumnDef {
  id: ColId
  name: string
  dataTypeId: number | null
  unitId: number | null
}

// ── Per-scenario weather table ──────────────────────────────────────────────

export type CellSyncStatus = 'idle' | 'pending' | 'error'
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

// Single string key for the cellSync map.
export const cellKey = (rowId: RowId, colId: ColId): string => `${rowId}:${colId}`

export interface WeatherTable {
  columns: Record<ColId, ColumnDef>
  columnOrder: ColId[]

  rows: Record<RowId, Record<ColId, CellValue>>
  rowOrder: RowId[]

  validationErrors: Record<RowId, Record<ColId, string>>
  cellSync: Record<string, CellSyncStatus>
  rowSelection: Record<RowId, boolean>

  // Backend-rejected header name per column (e.g. duplicate name). Keyed by
  // ColId; absent when the column's name is accepted. Surfaced inline by the
  // header editor without rolling back the user's typed name.
  columnNameErrors: Record<ColId, string>
}

export const emptyWeatherTable = (): WeatherTable => ({
  columns: {},
  columnOrder: [],
  rows: {},
  rowOrder: [],
  validationErrors: {},
  cellSync: {},
  rowSelection: {},
  columnNameErrors: {}
})

// ── Action payload shapes ────────────────────────────────────────────────────

// LOAD_SCENARIO_SUCCEEDED — saga has already joined labels[] with headers[]
// and synthesised the date/time pseudo-columns into `columns` at positions 0/1.
export interface LoadedScenarioPayload {
  projectId: string
  scenarioId: string
  columns: ColumnDef[] // ordered as displayed
  rows: Array<Record<ColId, CellValue>> // null === NaN
  precisionNormalized?: boolean
}

// ADD_ROW_REQUESTED — what the dialog dispatches and the saga POSTs.
// Saga expands (date, time, deltaHours, numberOfRows) into N row dicts client-side
// and POSTs them to /addRow. Non-date/time columns are filled with null.
export interface AddRowRequestedPayload {
  projectId: string
  scenarioId: string
  date: string // start date (YYYY-MM-DD)
  time: string // start time (HH:mm)
  columnIds: ColId[] // all columns, in display order
  numberOfRows: number
  deltaHours: number // integer hour gap between rows
}

// ADD_ROW_SUCCEEDED — row-add returns counters only (no inline rows). The
// saga chains LOAD_SCENARIO_REQUESTED on success so the reducer doesn't
// need an append branch.
export interface AddRowSucceededPayload {
  projectId: string
  scenarioId: string
}

// ADD_COLUMN_REQUESTED — what the dialog dispatches and the saga POSTs.
// dataTypeId / dataUnitId are optional (backend accepts null).
export interface AddColumnRequestedPayload {
  projectId: string
  scenarioId: string
  name: string
  dataTypeId: number | null
  dataUnitId: number | null
  defaultValue: string // back-fill into every existing row
}

// ADD_COLUMN_SUCCEEDED — backend returns the new column metadata.
export interface AddColumnSucceededPayload {
  projectId: string
  scenarioId: string
  column: ColumnDef
  defaultValue: string
}

// UPDATE_COLUMN_REQUESTED — partial update of a single column header. At
// least one of `name` / `dataTypeId` / `unitId` is set; undefined means
// "leave alone". The reducer snapshots the prior values into `previous` so
// _FAILED can roll back without re-fetching.
export interface UpdateColumnPatch {
  name?: string
  dataTypeId?: number | null
  unitId?: number | null
}

export interface UpdateColumnRequestedPayload {
  projectId: string
  scenarioId: string
  colId: ColId
  patch: UpdateColumnPatch
  previous: UpdateColumnPatch
}

export interface UpdateColumnSucceededPayload {
  projectId: string
  scenarioId: string
  colId: ColId
}

export interface UpdateColumnFailedPayload {
  projectId: string
  scenarioId: string
  colId: ColId
  previous: UpdateColumnPatch
  error: string
}

export interface DeleteColumnSnapshot {
  column: ColumnDef
  index: number
  rowValues: Record<RowId, CellValue | undefined>
  validationErrors: Record<RowId, string | undefined>
  cellSync: Record<string, CellSyncStatus>
}

// Everything needed to restore a single deleted row if the backend rejects.
export interface DeleteRowSnapshot {
  cells: Record<ColId, CellValue>
  index: number
  validationErrors: Record<ColId, string> | undefined
  cellSync: Record<string, CellSyncStatus>
  selected: boolean
}

export interface UpdateCellLocalPayload {
  projectId: string
  scenarioId: string
  rowId: RowId
  colId: ColId
  value: string // raw editor value; "" clears (NaN)
  validationError: string | null // non-null short-circuits the saga
}

export interface UpdateColumnValuesLocalPayload {
  scenarioId: string
  colId: ColId
  valuesByRowId: Record<RowId, CellValue>
}

// SET_COLUMN_NAME_ERROR — `error === null` clears the stored name error for
// the column. Reducer touches only columnNameErrors.
export interface SetColumnNameErrorPayload {
  scenarioId: string
  colId: ColId
  error: string | null
}
