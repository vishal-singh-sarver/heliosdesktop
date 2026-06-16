// Catalog: data types with units (loaded once per session, on project screen mount)
export const LOAD_DATA_TYPES_REQUESTED = 'app/ProjectScreen/LOAD_DATA_TYPES_REQUESTED' as const
export const LOAD_DATA_TYPES_SUCCEEDED = 'app/ProjectScreen/LOAD_DATA_TYPES_SUCCEEDED' as const
export const LOAD_DATA_TYPES_FAILED = 'app/ProjectScreen/LOAD_DATA_TYPES_FAILED' as const

// Catalog: object / material / model types (loaded in parallel with data types)
export const LOAD_OBJECT_TYPES_REQUESTED = 'app/ProjectScreen/LOAD_OBJECT_TYPES_REQUESTED' as const
export const LOAD_OBJECT_TYPES_SUCCEEDED = 'app/ProjectScreen/LOAD_OBJECT_TYPES_SUCCEEDED' as const
export const LOAD_OBJECT_TYPES_FAILED = 'app/ProjectScreen/LOAD_OBJECT_TYPES_FAILED' as const

export const LOAD_MATERIAL_TYPES_REQUESTED =
  'app/ProjectScreen/LOAD_MATERIAL_TYPES_REQUESTED' as const
export const LOAD_MATERIAL_TYPES_SUCCEEDED =
  'app/ProjectScreen/LOAD_MATERIAL_TYPES_SUCCEEDED' as const
export const LOAD_MATERIAL_TYPES_FAILED = 'app/ProjectScreen/LOAD_MATERIAL_TYPES_FAILED' as const

export const LOAD_MODEL_TYPES_REQUESTED = 'app/ProjectScreen/LOAD_MODEL_TYPES_REQUESTED' as const
export const LOAD_MODEL_TYPES_SUCCEEDED = 'app/ProjectScreen/LOAD_MODEL_TYPES_SUCCEEDED' as const
export const LOAD_MODEL_TYPES_FAILED = 'app/ProjectScreen/LOAD_MODEL_TYPES_FAILED' as const

// Active project + scenario
export const SET_ACTIVE_PROJECT = 'app/ProjectScreen/SET_ACTIVE_PROJECT' as const
export const SET_ACTIVE_SCENARIO = 'app/ProjectScreen/SET_ACTIVE_SCENARIO' as const

// List scenarios (per project)
export const LIST_SCENARIOS_REQUESTED = 'app/ProjectScreen/LIST_SCENARIOS_REQUESTED' as const
export const LIST_SCENARIOS_SUCCEEDED = 'app/ProjectScreen/LIST_SCENARIOS_SUCCEEDED' as const
export const LIST_SCENARIOS_FAILED = 'app/ProjectScreen/LIST_SCENARIOS_FAILED' as const

// Project metadata (id/name/latitude/longitude/utc_offset). Populated
// from the same GET /project/{id} response that drives LIST_SCENARIOS,
// dispatched separately so reducers handling each slice stay focused.
export const LOAD_PROJECT_SUCCEEDED = 'app/ProjectScreen/LOAD_PROJECT_SUCCEEDED' as const

// Partial project metadata update. Editable fields are name, latitude and
// longitude; backend recomputes utc_offset when coordinates change.
export const UPDATE_PROJECT_REQUESTED = 'app/ProjectScreen/UPDATE_PROJECT_REQUESTED' as const
export const UPDATE_PROJECT_SUCCEEDED = 'app/ProjectScreen/UPDATE_PROJECT_SUCCEEDED' as const
export const UPDATE_PROJECT_FAILED = 'app/ProjectScreen/UPDATE_PROJECT_FAILED' as const

// Weather headers (per scenario) — raw WeatherHeader[] from
// /weather_data_header. Stored separately from the joined ColumnDefs so
// other features can read header metadata (status, display_order, etc.)
// without going through the table columns.
export const LOAD_HEADERS_REQUESTED = 'app/ProjectScreen/LOAD_HEADERS_REQUESTED' as const
export const LOAD_HEADERS_SUCCEEDED = 'app/ProjectScreen/LOAD_HEADERS_SUCCEEDED' as const
export const LOAD_HEADERS_FAILED = 'app/ProjectScreen/LOAD_HEADERS_FAILED' as const

// Scenario load
export const LOAD_SCENARIO_REQUESTED = 'app/ProjectScreen/LOAD_SCENARIO_REQUESTED' as const
export const LOAD_SCENARIO_SUCCEEDED = 'app/ProjectScreen/LOAD_SCENARIO_SUCCEEDED' as const
export const LOAD_SCENARIO_FAILED = 'app/ProjectScreen/LOAD_SCENARIO_FAILED' as const

// Upload (replaces all scenario data; saga re-fires LOAD on success)
export const UPLOAD_FILE_REQUESTED = 'app/ProjectScreen/UPLOAD_FILE_REQUESTED' as const
export const UPLOAD_FILE_SUCCEEDED = 'app/ProjectScreen/UPLOAD_FILE_SUCCEEDED' as const
export const UPLOAD_FILE_FAILED = 'app/ProjectScreen/UPLOAD_FILE_FAILED' as const

// Add row (saga chains LOAD_SCENARIO_REQUESTED on success — no append branch)
export const ADD_ROW_REQUESTED = 'app/ProjectScreen/ADD_ROW_REQUESTED' as const
export const ADD_ROW_SUCCEEDED = 'app/ProjectScreen/ADD_ROW_SUCCEEDED' as const
export const ADD_ROW_FAILED = 'app/ProjectScreen/ADD_ROW_FAILED' as const
export const ADD_ROW_RESET = 'app/ProjectScreen/ADD_ROW_RESET' as const

// Add column
export const ADD_COLUMN_REQUESTED = 'app/ProjectScreen/ADD_COLUMN_REQUESTED' as const
export const ADD_COLUMN_SUCCEEDED = 'app/ProjectScreen/ADD_COLUMN_SUCCEEDED' as const
export const ADD_COLUMN_FAILED = 'app/ProjectScreen/ADD_COLUMN_FAILED' as const
export const ADD_COLUMN_RESET = 'app/ProjectScreen/ADD_COLUMN_RESET' as const

// Seed default columns (date-time + check) for a freshly created scenario
// that has no headers and no rows. Fired from inside loadScenarioWorker; on
// success the saga re-enters LOAD_SCENARIO_REQUESTED so the table picks up
// the newly created backend columns.
export const SEED_DEFAULT_COLUMNS_REQUESTED =
  'app/ProjectScreen/SEED_DEFAULT_COLUMNS_REQUESTED' as const
export const SEED_DEFAULT_COLUMNS_SUCCEEDED =
  'app/ProjectScreen/SEED_DEFAULT_COLUMNS_SUCCEEDED' as const
export const SEED_DEFAULT_COLUMNS_FAILED = 'app/ProjectScreen/SEED_DEFAULT_COLUMNS_FAILED' as const

// Patch column header (name / data type / unit). Optimistic write on
// _REQUESTED, rollback to the prior values on _FAILED.
export const UPDATE_COLUMN_REQUESTED = 'app/ProjectScreen/UPDATE_COLUMN_REQUESTED' as const
export const UPDATE_COLUMN_SUCCEEDED = 'app/ProjectScreen/UPDATE_COLUMN_SUCCEEDED' as const
export const UPDATE_COLUMN_FAILED = 'app/ProjectScreen/UPDATE_COLUMN_FAILED' as const
export const UPDATE_COLUMN_VALUES_LOCAL = 'app/ProjectScreen/UPDATE_COLUMN_VALUES_LOCAL' as const

// Delete one backend-managed weather data header. Optimistic remove on
// _REQUESTED, rollback on _FAILED.
export const DELETE_COLUMN_REQUESTED = 'app/ProjectScreen/DELETE_COLUMN_REQUESTED' as const
export const DELETE_COLUMN_SUCCEEDED = 'app/ProjectScreen/DELETE_COLUMN_SUCCEEDED' as const
export const DELETE_COLUMN_FAILED = 'app/ProjectScreen/DELETE_COLUMN_FAILED' as const

// Cell edit. UPDATE_CELL_LOCAL is the synchronous optimistic write fired
// from the cell on blur. The saga then dispatches UPDATE_CELL_REQUESTED only
// when local validation passed (validationError === null).
export const UPDATE_CELL_LOCAL = 'app/ProjectScreen/UPDATE_CELL_LOCAL' as const
export const UPDATE_CELL_REQUESTED = 'app/ProjectScreen/UPDATE_CELL_REQUESTED' as const
export const UPDATE_CELL_SUCCEEDED = 'app/ProjectScreen/UPDATE_CELL_SUCCEEDED' as const
export const UPDATE_CELL_FAILED = 'app/ProjectScreen/UPDATE_CELL_FAILED' as const
export const UPDATE_ALL_CHECKBOXES_REQUESTED =
  'app/ProjectScreen/UPDATE_ALL_CHECKBOXES_REQUESTED' as const
// Bulk per-column validation. Dispatched after a column's data type or
// unit changes so every cell in that column is re-checked against the new
// range (covers manually-built columns and upload-imported columns alike).
export const SET_COLUMN_VALIDATION_ERRORS =
  'app/ProjectScreen/SET_COLUMN_VALIDATION_ERRORS' as const
// Single-cell validation error setter. Used by CellInput's live keystroke
// validator to paint the red outline + tooltip without writing the cell
// value (UPDATE_CELL_LOCAL would mark the cell pending sync on every keystroke).
export const SET_CELL_VALIDATION_ERROR =
  'app/ProjectScreen/SET_CELL_VALIDATION_ERROR' as const
// Per-column name error. Set when a header name PATCH is rejected by the
// backend (e.g. duplicate name) so the header can show the message inline
// while keeping the user's typed name; cleared on edit / retry / success.
export const SET_COLUMN_NAME_ERROR = 'app/ProjectScreen/SET_COLUMN_NAME_ERROR' as const

// Selection
export const SET_ROW_SELECTION = 'app/ProjectScreen/SET_ROW_SELECTION' as const
export const SET_ALL_ROWS_SELECTION = 'app/ProjectScreen/SET_ALL_ROWS_SELECTION' as const
