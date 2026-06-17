import type {
  CellValue,
  ColumnDef,
  DataTypeDef,
  ModelTypeDef,
  Scenario,
  WeatherHeader
} from 'containers/ProjectScreen/types'
import { truncateToMaxDecimals } from 'utils/decimalValidation'
import { api, ApiError } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import type { UpdateProjectPatch } from 'containers/ProjectScreen/types'

// ── Catalog ──────────────────────────────────────────────────────────────────
//
// Combined endpoint returns each data type with its units nested. One call
// on ProjectScreen mount populates the full catalog.

export interface DataTypesResponse {
  data_types: DataTypeDef[]
}

export function loadDataTypesRequest(): Promise<DataTypesResponse> {
  return api.get<DataTypesResponse>(API_ROUTES.catalog.dataTypes)
}

// Model types are hierarchical on the wire (each carries a `submodels[]`); the
// GUI only needs the top-level models, so the type intersection lets us read and
// discard `submodels` in the reducer. One call on ProjectScreen mount.
export interface ModelTypesResponse {
  model_types: Array<ModelTypeDef & { submodels?: ModelTypeDef[] }>
}

export function loadModelTypesRequest(): Promise<ModelTypesResponse> {
  return api.get<ModelTypesResponse>(API_ROUTES.catalog.modelTypes)
}

// ── Project (with scenarios) ────────────────────────────────────────────────
//
// GET /api/project/{project_id} returns the project, its scenarios, and each
// scenario's weather_data_headers in one round-trip. We currently consume
// only the scenarios list; the saga forwards them to listScenariosSucceeded.

export interface ScenarioWithHeaders extends Scenario {
  weather_data_headers: WeatherHeader[]
}

export interface GetProjectResponse {
  project: {
    id: string
    name: string
    latitude: number
    longitude: number
    // Wire shape is the signed timezone string ("+05:00", "-08:00"), not
    // a number — this header is displayed verbatim on the project screen.
    utc_offset: string
    created_at: string
    updated_at: string
    scenarios: ScenarioWithHeaders[]
  }
}

export function getProjectRequest(projectId: string): Promise<GetProjectResponse> {
  return api.get<GetProjectResponse>(API_ROUTES.project.get(projectId))
}

export type UpdateProjectResponse = string

export function updateProjectRequest(
  projectId: string,
  patch: UpdateProjectPatch
): Promise<UpdateProjectResponse> {
  return api.patch<UpdateProjectResponse>(API_ROUTES.project.update(projectId), patch)
}

// ── Headers ──────────────────────────────────────────────────────────────────

export interface HeadersResponse {
  success: boolean
  count: number
  headers: WeatherHeader[]
}

export function loadHeadersRequest(
  projectId: string,
  scenarioId: string
): Promise<HeadersResponse> {
  return api.get<HeadersResponse>(API_ROUTES.weather.headers(projectId, scenarioId))
}

// ── Data (rows) ──────────────────────────────────────────────────────────────

// Wire shape — labels[] is ["date", "time", ...colIds], rows[] are dicts
// keyed by those labels with numbers / nulls for the data columns.
export interface DataPage {
  success: boolean
  labels: string[]
  row_count: number
  total_rows: number
  column_count: number
  offset: number
  limit: number | null
  rows: Array<Record<string, string | number | null>>
}

export function loadDataRequest(projectId: string, scenarioId: string): Promise<DataPage> {
  // Pagination is intentionally not used yet — server returns the full
  // table when limit is omitted.
  return api.get<DataPage>(API_ROUTES.weather.data(projectId, scenarioId))
}

// ── Add column ───────────────────────────────────────────────────────────────
//
// POST /api/weather/.../addCol expects an array of column descriptors:
//   { column: [ { name, datatype, data_unit, values } ] }
// `values` back-fills existing rows; each entry is { date, time, value } so
// the backend can address the correct cell. An empty array leaves rows as
// NaN/null. `datatype` and `data_unit` are optional.

export interface AddColumnCellValue {
  date: string
  time: string
  value: string
}

export interface AddColumnRequestBody {
  name: string
  dataTypeId: number | null
  dataUnitId: number | null
  values: AddColumnCellValue[]
  defaultValue?: string | null
}

interface AddColumnWireBody {
  column: Array<{
    id?: number
    name: string
    datatype: number | null
    data_unit: number | null
    values: AddColumnCellValue[]
    default_value?: number | string | null
  }>
}

interface AddColumnWireResponse {
  success: boolean
  columns: Array<{
    id: number
    name: string
    datatype_id: number | null
    data_unit_id: number | null
  }>
}

export interface AddColumnResponse {
  column: ColumnDef
}

export async function addColumnRequest(
  projectId: string,
  scenarioId: string,
  body: AddColumnRequestBody
): Promise<AddColumnResponse> {
  const wire: AddColumnWireBody = {
    column: [
      {
        name: body.name,
        datatype: body.dataTypeId,
        data_unit: body.dataUnitId,
        values: body.values,
        ...(body.defaultValue !== undefined ? { default_value: body.defaultValue } : {})
      }
    ]
  }
  const res = await api.post<AddColumnWireResponse>(
    API_ROUTES.weather.addCol(projectId, scenarioId),
    wire
  )
  const wireCol = res.columns[0]
  if (!wireCol) throw new ApiError(500, 'Server returned no columns')
  return {
    column: {
      id: String(wireCol.id),
      name: wireCol.name,
      dataTypeId: wireCol.datatype_id,
      unitId: wireCol.data_unit_id
    }
  }
}

// Bulk variant — sends N columns in one POST. Used by the empty-scenario
// seed flow which creates `date-time` and `check` together. Returns the
// newly created ColumnDefs in the same order they were submitted.
export async function addColumnsRequest(
  projectId: string,
  scenarioId: string,
  bodies: AddColumnRequestBody[]
): Promise<{ columns: ColumnDef[] }> {
  const wire: AddColumnWireBody = {
    column: bodies.map((b) => ({
      name: b.name,
      datatype: b.dataTypeId,
      data_unit: b.dataUnitId,
      values: b.values
    }))
  }
  const res = await api.post<AddColumnWireResponse>(
    API_ROUTES.weather.addCol(projectId, scenarioId),
    wire
  )
  if (res.columns.length !== bodies.length) {
    throw new ApiError(
      500,
      `Expected ${bodies.length} columns from server, got ${res.columns.length}`
    )
  }
  return {
    columns: res.columns.map((c) => ({
      id: String(c.id),
      name: c.name,
      dataTypeId: c.datatype_id,
      unitId: c.data_unit_id
    }))
  }
}

// ── Update column ────────────────────────────────────────────────────────────
//
// PATCH /api/weather/.../updateCol/{column_id} updates one existing column.
// The target column is identified by `columnId` in the URL path — the body
// carries no `id` (the backend schema rejects unknown fields). For the bulk
// checkbox toggle we send a values[] entry for every existing row timestamp.

export interface UpdateColumnRequestBody {
  name: string
  dataTypeId?: number | null
  dataUnitId?: number | null
  values: AddColumnCellValue[]
  defaultValue?: number | string | null
}

interface UpdateColumnWireBody {
  name: string
  datatype: number | null
  data_unit: number | null
  values: AddColumnCellValue[]
  default_value?: number | string | null
}

export type UpdateColumnResponse = string

export function updateColumnRequest(
  projectId: string,
  scenarioId: string,
  columnId: number,
  body: UpdateColumnRequestBody
): Promise<UpdateColumnResponse> {
  const wire: UpdateColumnWireBody = {
    name: body.name,
    datatype: body.dataTypeId ?? null,
    data_unit: body.dataUnitId ?? null,
    values: body.values,
    ...(body.defaultValue !== undefined ? { default_value: body.defaultValue } : {})
  }

  return api.patch<UpdateColumnResponse>(
    API_ROUTES.weather.updateCol(projectId, scenarioId, columnId),
    wire
  )
}

// ── Patch header ─────────────────────────────────────────────────────────────
//
// PATCH /api/weather/.../weather_data_header/{header_id} — partial update of
// a single header (name / data type / unit / display_order). Wire field names
// are snake_case; the renderer carries camelCase elsewhere.

export interface PatchHeaderRequestBody {
  name?: string
  helios_data_type_id?: number | null
  unit_id?: number | null
  display_order?: number
}

// Backend currently returns a bare string on success; we don't read it.
export type PatchHeaderResponse = string

export function patchHeaderRequest(
  projectId: string,
  scenarioId: string,
  headerId: number,
  body: PatchHeaderRequestBody
): Promise<PatchHeaderResponse> {
  return api.patch<PatchHeaderResponse>(
    API_ROUTES.weather.headerPatch(projectId, scenarioId, headerId),
    body
  )
}

export interface DeleteHeaderResponse {
  success: boolean
  header_id: number
}

export function deleteHeaderRequest(
  projectId: string,
  scenarioId: string,
  headerId: number
): Promise<DeleteHeaderResponse> {
  return api.delete<DeleteHeaderResponse>(
    API_ROUTES.weather.headerDelete(projectId, scenarioId, headerId)
  )
}

// ── Add rows ─────────────────────────────────────────────────────────────────
//
// POST /api/weather/.../addRow takes a fully-built rows[] array. The saga
// expands (startDate, startTime, deltaHours, numberOfRows) into row dicts
// before calling — non-date/time columns default to null.

export interface AddRowsRequestBody {
  rows: Array<Record<string, string | null>>
}

export interface AddRowsResponse {
  success: boolean
}

export function addRowsRequest(
  projectId: string,
  scenarioId: string,
  body: AddRowsRequestBody
): Promise<AddRowsResponse> {
  return api.post<AddRowsResponse>(API_ROUTES.weather.addRow(projectId, scenarioId), body)
}

// ── Delete rows ──────────────────────────────────────────────────────────────
//
// POST /api/weather/.../deleteRow takes an array of { date, time } keys; the
// backend removes each (date, time) from every column. The UI currently
// deletes one row at a time, so callers pass a single-element array.

export type DeleteRowsRequestBody = Array<{ date: string; time: string }>

export type DeleteRowsResponse = string

export function deleteRowsRequest(
  projectId: string,
  scenarioId: string,
  body: DeleteRowsRequestBody
): Promise<DeleteRowsResponse> {
  return api.post<DeleteRowsResponse>(API_ROUTES.weather.deleteRow(projectId, scenarioId), body)
}

// ── Update cell ──────────────────────────────────────────────────────────────
//
// Backend expects a batched payload: { updates: [{ col, row, value }, ...] }
// over PATCH /update (fail-fast). Saga still calls per-edit with one update;
// the wrapper is here so callers don't need to know about the wire shape.

export interface UpdateCellRequestBody {
  col: string
  row: { date: string; time: string }
  value: string // "" clears (NaN)
}

interface UpdateCellWireBody {
  updates: UpdateCellRequestBody[]
}

export interface UpdateCellResponse {
  success: boolean
  updated_count: number
}

export function updateCellRequest(
  projectId: string,
  scenarioId: string,
  body: UpdateCellRequestBody
): Promise<UpdateCellResponse> {
  const wire: UpdateCellWireBody = { updates: [body] }
  return api.patch<UpdateCellResponse>(API_ROUTES.weather.update(projectId, scenarioId), wire)
}

// ── Helpers used by the load saga to coerce wire shapes ──────────────────────

export function normalizeWireCellValue(raw: string | number | null | undefined): {
  value: CellValue
  truncated: boolean
} {
  if (raw == null) return { value: null, truncated: false }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { value: null, truncated: false }
    const normalized = truncateToMaxDecimals(String(raw))
    return { value: normalized.value, truncated: normalized.truncated }
  }
  if (raw.trim().toUpperCase() === 'NAN') return { value: null, truncated: false }
  const normalized = truncateToMaxDecimals(raw)
  return { value: normalized.value, truncated: normalized.truncated }
}

// Coerce a wire cell value (number | string | null) into the in-memory
// CellValue (string | null). Numeric values are normalized to the same
// 7-decimal precision the import/manual paths enforce.
export function toCellValue(raw: string | number | null | undefined): CellValue {
  const normalized = normalizeWireCellValue(raw)
  return normalized.value
}
