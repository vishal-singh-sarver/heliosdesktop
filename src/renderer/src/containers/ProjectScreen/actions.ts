import {
  ADD_COLUMN_FAILED,
  ADD_COLUMN_REQUESTED,
  ADD_COLUMN_RESET,
  ADD_COLUMN_SUCCEEDED,
  DELETE_COLUMN_FAILED,
  DELETE_COLUMN_REQUESTED,
  DELETE_COLUMN_SUCCEEDED,
  DELETE_ROW_FAILED,
  DELETE_ROWS_REQUESTED,
  DELETE_ROWS_SUCCEEDED,
  DELETE_ROWS_FAILED,
  DELETE_ROWS_RESET,
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
  SEED_DEFAULT_COLUMNS_FAILED,
  SEED_DEFAULT_COLUMNS_REQUESTED,
  SEED_DEFAULT_COLUMNS_SUCCEEDED,
  SET_ACTIVE_PROJECT,
  SET_ACTIVE_SCENARIO,
  SET_ALL_ROWS_SELECTION,
  SET_CELL_VALIDATION_ERROR,
  SET_COLUMN_NAME_ERROR,
  SET_COLUMN_VALIDATION_ERRORS,
  SET_ROW_SELECTION,
  UPDATE_PROJECT_FAILED,
  UPDATE_PROJECT_REQUESTED,
  UPDATE_PROJECT_SUCCEEDED,
  UPDATE_ALL_CHECKBOXES_REQUESTED,
  UPDATE_CELL_FAILED,
  UPDATE_CELL_LOCAL,
  UPDATE_CELL_REQUESTED,
  UPDATE_CELL_SUCCEEDED,
  UPDATE_COLUMN_FAILED,
  UPDATE_COLUMN_REQUESTED,
  UPDATE_COLUMN_SUCCEEDED,
  UPDATE_COLUMN_VALUES_LOCAL,
  UPLOAD_FILE_FAILED,
  UPLOAD_FILE_REQUESTED,
  UPLOAD_FILE_SUCCEEDED
} from './constants'
import type {
  AddColumnRequestedPayload,
  AddColumnSucceededPayload,
  AddRowRequestedPayload,
  AddRowSucceededPayload,
  ColId,
  ColumnDef,
  DataTypeDef,
  DeleteColumnSnapshot,
  DeleteRowSnapshot,
  LoadedScenarioPayload,
  MaterialTypeDef,
  ModelTypeDef,
  ObjectTypeDef,
  ProjectMetadata,
  RowId,
  Scenario,
  SetColumnNameErrorPayload,
  UpdateProjectPatch,
  UpdateCellLocalPayload,
  UpdateColumnFailedPayload,
  UpdateColumnPatch,
  UpdateColumnRequestedPayload,
  UpdateColumnSucceededPayload,
  UpdateColumnValuesLocalPayload,
  WeatherHeader
} from './types'

// Index signature on every action satisfies Redux 5's UnknownAction so
// dispatch accepts these without a cast (same pattern as
// store/navigationReducer.ts).
type Idx = { [extraProps: string]: unknown }

// ── Action interfaces ────────────────────────────────────────────────────────

// Catalog: data types
export interface LoadDataTypesRequestedAction extends Idx {
  type: typeof LOAD_DATA_TYPES_REQUESTED
}
export interface LoadDataTypesSucceededAction extends Idx {
  type: typeof LOAD_DATA_TYPES_SUCCEEDED
  payload: DataTypeDef[]
}
export interface LoadDataTypesFailedAction extends Idx {
  type: typeof LOAD_DATA_TYPES_FAILED
  payload: string
}

// Catalog: object types
export interface LoadObjectTypesRequestedAction extends Idx {
  type: typeof LOAD_OBJECT_TYPES_REQUESTED
}
export interface LoadObjectTypesSucceededAction extends Idx {
  type: typeof LOAD_OBJECT_TYPES_SUCCEEDED
  payload: ObjectTypeDef[]
}
export interface LoadObjectTypesFailedAction extends Idx {
  type: typeof LOAD_OBJECT_TYPES_FAILED
  payload: string
}

// Catalog: material types
export interface LoadMaterialTypesRequestedAction extends Idx {
  type: typeof LOAD_MATERIAL_TYPES_REQUESTED
}
export interface LoadMaterialTypesSucceededAction extends Idx {
  type: typeof LOAD_MATERIAL_TYPES_SUCCEEDED
  payload: MaterialTypeDef[]
}
export interface LoadMaterialTypesFailedAction extends Idx {
  type: typeof LOAD_MATERIAL_TYPES_FAILED
  payload: string
}

// Catalog: model types
export interface LoadModelTypesRequestedAction extends Idx {
  type: typeof LOAD_MODEL_TYPES_REQUESTED
}
export interface LoadModelTypesSucceededAction extends Idx {
  type: typeof LOAD_MODEL_TYPES_SUCCEEDED
  payload: ModelTypeDef[]
}
export interface LoadModelTypesFailedAction extends Idx {
  type: typeof LOAD_MODEL_TYPES_FAILED
  payload: string
}

// Active project + scenario
export interface SetActiveProjectAction extends Idx {
  type: typeof SET_ACTIVE_PROJECT
  payload: { projectId: string }
}
export interface SetActiveScenarioAction extends Idx {
  type: typeof SET_ACTIVE_SCENARIO
  payload: { scenarioId: string }
}

// Project metadata
export interface LoadProjectSucceededAction extends Idx {
  type: typeof LOAD_PROJECT_SUCCEEDED
  payload: ProjectMetadata
}
export interface UpdateProjectRequestedAction extends Idx {
  type: typeof UPDATE_PROJECT_REQUESTED
  payload: { projectId: string; patch: UpdateProjectPatch }
}
export interface UpdateProjectSucceededAction extends Idx {
  type: typeof UPDATE_PROJECT_SUCCEEDED
  payload: ProjectMetadata
}
export interface UpdateProjectFailedAction extends Idx {
  type: typeof UPDATE_PROJECT_FAILED
  payload: { projectId: string; error: string }
}

// List scenarios (per project)
export interface ListScenariosRequestedAction extends Idx {
  type: typeof LIST_SCENARIOS_REQUESTED
  payload: { projectId: string }
}
export interface ListScenariosSucceededAction extends Idx {
  type: typeof LIST_SCENARIOS_SUCCEEDED
  payload: { projectId: string; scenarios: Scenario[] }
}
export interface ListScenariosFailedAction extends Idx {
  type: typeof LIST_SCENARIOS_FAILED
  payload: { projectId: string; error: string }
}

// Weather headers (per scenario)
export interface LoadHeadersRequestedAction extends Idx {
  type: typeof LOAD_HEADERS_REQUESTED
  payload: { projectId: string; scenarioId: string }
}
export interface LoadHeadersSucceededAction extends Idx {
  type: typeof LOAD_HEADERS_SUCCEEDED
  payload: { scenarioId: string; headers: WeatherHeader[] }
}
export interface LoadHeadersFailedAction extends Idx {
  type: typeof LOAD_HEADERS_FAILED
  payload: { scenarioId: string; error: string }
}

// Scenario load
export interface LoadScenarioRequestedAction extends Idx {
  type: typeof LOAD_SCENARIO_REQUESTED
  payload: { projectId: string; scenarioId: string }
}
export interface LoadScenarioSucceededAction extends Idx {
  type: typeof LOAD_SCENARIO_SUCCEEDED
  payload: LoadedScenarioPayload
}
export interface LoadScenarioFailedAction extends Idx {
  type: typeof LOAD_SCENARIO_FAILED
  payload: { projectId: string; scenarioId: string; error: string }
}

// Upload
export interface UploadFileRequestedAction extends Idx {
  type: typeof UPLOAD_FILE_REQUESTED
  payload: { projectId: string; scenarioId: string; file: File }
}
export interface UploadFileSucceededAction extends Idx {
  type: typeof UPLOAD_FILE_SUCCEEDED
  payload: { projectId: string; scenarioId: string }
}
export interface UploadFileFailedAction extends Idx {
  type: typeof UPLOAD_FILE_FAILED
  payload: { projectId: string; scenarioId: string; error: string }
}

// Add row
export interface AddRowRequestedAction extends Idx {
  type: typeof ADD_ROW_REQUESTED
  payload: AddRowRequestedPayload
}
export interface AddRowSucceededAction extends Idx {
  type: typeof ADD_ROW_SUCCEEDED
  payload: AddRowSucceededPayload
}
export interface AddRowFailedAction extends Idx {
  type: typeof ADD_ROW_FAILED
  payload: { projectId: string; scenarioId: string; error: string }
}
// Clears the add-row request status (loading/error) — dispatched when the
// dialog closes so a prior failure doesn't persist into the next open.
export interface AddRowResetAction extends Idx {
  type: typeof ADD_ROW_RESET
}

// Add column
export interface AddColumnRequestedAction extends Idx {
  type: typeof ADD_COLUMN_REQUESTED
  payload: AddColumnRequestedPayload
}
export interface AddColumnSucceededAction extends Idx {
  type: typeof ADD_COLUMN_SUCCEEDED
  payload: AddColumnSucceededPayload
}
export interface AddColumnFailedAction extends Idx {
  type: typeof ADD_COLUMN_FAILED
  payload: { projectId: string; scenarioId: string; error: string }
}
// Clears the add-column request status (loading/error) — dispatched when the
// dialog closes so a prior failure doesn't persist into the next open.
export interface AddColumnResetAction extends Idx {
  type: typeof ADD_COLUMN_RESET
}

// Seed default columns (date-time + check) on an empty scenario. Internal
// to loadScenarioWorker — the component never dispatches this directly.
export interface SeedDefaultColumnsRequestedAction extends Idx {
  type: typeof SEED_DEFAULT_COLUMNS_REQUESTED
  payload: { projectId: string; scenarioId: string }
}
export interface SeedDefaultColumnsSucceededAction extends Idx {
  type: typeof SEED_DEFAULT_COLUMNS_SUCCEEDED
  payload: { projectId: string; scenarioId: string }
}
export interface SeedDefaultColumnsFailedAction extends Idx {
  type: typeof SEED_DEFAULT_COLUMNS_FAILED
  payload: { projectId: string; scenarioId: string; error: string }
}

// Update column header (PATCH /weather_data_header/{header_id})
export interface UpdateColumnRequestedAction extends Idx {
  type: typeof UPDATE_COLUMN_REQUESTED
  payload: UpdateColumnRequestedPayload
}
export interface UpdateColumnSucceededAction extends Idx {
  type: typeof UPDATE_COLUMN_SUCCEEDED
  payload: UpdateColumnSucceededPayload
}
export interface UpdateColumnFailedAction extends Idx {
  type: typeof UPDATE_COLUMN_FAILED
  payload: UpdateColumnFailedPayload
}
export interface UpdateColumnValuesLocalAction extends Idx {
  type: typeof UPDATE_COLUMN_VALUES_LOCAL
  payload: UpdateColumnValuesLocalPayload
}

// Delete column header (DELETE /weather_data_header/{header_id})
export interface DeleteColumnRequestedAction extends Idx {
  type: typeof DELETE_COLUMN_REQUESTED
  payload: { projectId: string; scenarioId: string; colId: ColId; snapshot: DeleteColumnSnapshot }
}
export interface DeleteColumnSucceededAction extends Idx {
  type: typeof DELETE_COLUMN_SUCCEEDED
  payload: { projectId: string; scenarioId: string; colId: ColId }
}
export interface DeleteColumnFailedAction extends Idx {
  type: typeof DELETE_COLUMN_FAILED
  payload: {
    projectId: string
    scenarioId: string
    colId: ColId
    snapshot: DeleteColumnSnapshot
    error: string
  }
}

// Delete row (POST /deleteRow with [{ date, time }])
export interface DeleteRowRequestedAction extends Idx {
  type: typeof DELETE_ROW_REQUESTED
  payload: {
    projectId: string
    scenarioId: string
    rowId: RowId
    date: string
    time: string
    snapshot: DeleteRowSnapshot
  }
}
export interface DeleteRowSucceededAction extends Idx {
  type: typeof DELETE_ROW_SUCCEEDED
  payload: { projectId: string; scenarioId: string; rowId: RowId }
}
export interface DeleteRowFailedAction extends Idx {
  type: typeof DELETE_ROW_FAILED
  payload: {
    projectId: string
    scenarioId: string
    rowId: RowId
    snapshot: DeleteRowSnapshot
    error: string
  }
}

export interface DeleteRowsRequestedAction extends Idx {
  type: typeof DELETE_ROWS_REQUESTED
  payload: {
    projectId: string
    scenarioId: string
    rowIds: RowId[]
    keys: Array<{ date: string; time: string }>
  }
}
export interface DeleteRowsSucceededAction extends Idx {
  type: typeof DELETE_ROWS_SUCCEEDED
  payload: { projectId: string; scenarioId: string; rowIds: RowId[] }
}
export interface DeleteRowsFailedAction extends Idx {
  type: typeof DELETE_ROWS_FAILED
  payload: { projectId: string; scenarioId: string; error: string }
}
export interface DeleteRowsResetAction extends Idx {
  type: typeof DELETE_ROWS_RESET
}

// Cell edit
export interface UpdateCellLocalAction extends Idx {
  type: typeof UPDATE_CELL_LOCAL
  payload: UpdateCellLocalPayload
}
export interface UpdateCellRequestedAction extends Idx {
  type: typeof UPDATE_CELL_REQUESTED
  payload: { projectId: string; scenarioId: string; rowId: RowId; colId: ColId }
}
export interface UpdateCellSucceededAction extends Idx {
  type: typeof UPDATE_CELL_SUCCEEDED
  payload: { projectId: string; scenarioId: string; rowId: RowId; colId: ColId }
}
export interface UpdateCellFailedAction extends Idx {
  type: typeof UPDATE_CELL_FAILED
  payload: {
    projectId: string
    scenarioId: string
    rowId: RowId
    colId: ColId
    error: string
  }
}

// Bulk per-column validation. `errors` carries one entry per row in the
// affected column: a string sets that cell's validationError, `null` clears
// any prior error. Reducer applies it without touching cell values.
export interface SetColumnValidationErrorsAction extends Idx {
  type: typeof SET_COLUMN_VALIDATION_ERRORS
  payload: {
    scenarioId: string
    colId: ColId
    errors: Record<RowId, string | null>
  }
}
// Single-cell validation error setter. `validationError === null` clears.
// Reducer touches only validationErrors — leaves rows[] and cellSync alone.
export interface SetCellValidationErrorAction extends Idx {
  type: typeof SET_CELL_VALIDATION_ERROR
  payload: {
    scenarioId: string
    rowId: RowId
    colId: ColId
    validationError: string | null
  }
}
// Per-column name error setter. `error === null` clears. Reducer touches only
// columnNameErrors — leaves the column's name and everything else alone.
export interface SetColumnNameErrorAction extends Idx {
  type: typeof SET_COLUMN_NAME_ERROR
  payload: SetColumnNameErrorPayload
}
export interface UpdateAllCheckboxesRequestedAction extends Idx {
  type: typeof UPDATE_ALL_CHECKBOXES_REQUESTED
  payload: { projectId: string; scenarioId: string; checkColId: ColId; value: string }
}
// Selection
export interface SetRowSelectionAction extends Idx {
  type: typeof SET_ROW_SELECTION
  payload: { scenarioId: string; rowId: RowId; selected: boolean }
}
export interface SetAllRowsSelectionAction extends Idx {
  type: typeof SET_ALL_ROWS_SELECTION
  payload: { scenarioId: string; selected: boolean }
}

export type ProjectScreenAction =
  | LoadDataTypesRequestedAction
  | LoadDataTypesSucceededAction
  | LoadDataTypesFailedAction
  | LoadObjectTypesRequestedAction
  | LoadObjectTypesSucceededAction
  | LoadObjectTypesFailedAction
  | LoadMaterialTypesRequestedAction
  | LoadMaterialTypesSucceededAction
  | LoadMaterialTypesFailedAction
  | LoadModelTypesRequestedAction
  | LoadModelTypesSucceededAction
  | LoadModelTypesFailedAction
  | SetActiveProjectAction
  | SetActiveScenarioAction
  | LoadProjectSucceededAction
  | UpdateProjectRequestedAction
  | UpdateProjectSucceededAction
  | UpdateProjectFailedAction
  | ListScenariosRequestedAction
  | ListScenariosSucceededAction
  | ListScenariosFailedAction
  | LoadHeadersRequestedAction
  | LoadHeadersSucceededAction
  | LoadHeadersFailedAction
  | LoadScenarioRequestedAction
  | LoadScenarioSucceededAction
  | LoadScenarioFailedAction
  | UploadFileRequestedAction
  | UploadFileSucceededAction
  | UploadFileFailedAction
  | AddRowRequestedAction
  | AddRowSucceededAction
  | AddRowFailedAction
  | AddRowResetAction
  | AddColumnRequestedAction
  | AddColumnSucceededAction
  | AddColumnFailedAction
  | AddColumnResetAction
  | SeedDefaultColumnsRequestedAction
  | SeedDefaultColumnsSucceededAction
  | SeedDefaultColumnsFailedAction
  | UpdateColumnRequestedAction
  | UpdateColumnSucceededAction
  | UpdateColumnFailedAction
  | UpdateColumnValuesLocalAction
  | DeleteColumnRequestedAction
  | DeleteColumnSucceededAction
  | DeleteColumnFailedAction
  | DeleteRowRequestedAction
  | DeleteRowSucceededAction
  | DeleteRowFailedAction
  | DeleteRowsRequestedAction
  | DeleteRowsSucceededAction
  | DeleteRowsFailedAction
  | DeleteRowsResetAction
  | UpdateCellLocalAction
  | UpdateCellRequestedAction
  | UpdateCellSucceededAction
  | UpdateCellFailedAction
  | UpdateAllCheckboxesRequestedAction
  | SetColumnValidationErrorsAction
  | SetCellValidationErrorAction
  | SetColumnNameErrorAction
  | SetRowSelectionAction
  | SetAllRowsSelectionAction

// ── Action creators ──────────────────────────────────────────────────────────

export const loadDataTypesRequested = (): LoadDataTypesRequestedAction => ({
  type: LOAD_DATA_TYPES_REQUESTED
})
export const loadDataTypesSucceeded = (payload: DataTypeDef[]): LoadDataTypesSucceededAction => ({
  type: LOAD_DATA_TYPES_SUCCEEDED,
  payload
})
export const loadDataTypesFailed = (payload: string): LoadDataTypesFailedAction => ({
  type: LOAD_DATA_TYPES_FAILED,
  payload
})

export const loadObjectTypesRequested = (): LoadObjectTypesRequestedAction => ({
  type: LOAD_OBJECT_TYPES_REQUESTED
})
export const loadObjectTypesSucceeded = (
  payload: ObjectTypeDef[]
): LoadObjectTypesSucceededAction => ({
  type: LOAD_OBJECT_TYPES_SUCCEEDED,
  payload
})
export const loadObjectTypesFailed = (payload: string): LoadObjectTypesFailedAction => ({
  type: LOAD_OBJECT_TYPES_FAILED,
  payload
})

export const loadMaterialTypesRequested = (): LoadMaterialTypesRequestedAction => ({
  type: LOAD_MATERIAL_TYPES_REQUESTED
})
export const loadMaterialTypesSucceeded = (
  payload: MaterialTypeDef[]
): LoadMaterialTypesSucceededAction => ({
  type: LOAD_MATERIAL_TYPES_SUCCEEDED,
  payload
})
export const loadMaterialTypesFailed = (payload: string): LoadMaterialTypesFailedAction => ({
  type: LOAD_MATERIAL_TYPES_FAILED,
  payload
})

export const loadModelTypesRequested = (): LoadModelTypesRequestedAction => ({
  type: LOAD_MODEL_TYPES_REQUESTED
})
export const loadModelTypesSucceeded = (payload: ModelTypeDef[]): LoadModelTypesSucceededAction => ({
  type: LOAD_MODEL_TYPES_SUCCEEDED,
  payload
})
export const loadModelTypesFailed = (payload: string): LoadModelTypesFailedAction => ({
  type: LOAD_MODEL_TYPES_FAILED,
  payload
})

export const setActiveProject = (projectId: string): SetActiveProjectAction => ({
  type: SET_ACTIVE_PROJECT,
  payload: { projectId }
})
export const loadProjectSucceeded = (payload: ProjectMetadata): LoadProjectSucceededAction => ({
  type: LOAD_PROJECT_SUCCEEDED,
  payload
})
export const updateProjectRequested = (
  projectId: string,
  patch: UpdateProjectPatch
): UpdateProjectRequestedAction => ({
  type: UPDATE_PROJECT_REQUESTED,
  payload: { projectId, patch }
})
export const updateProjectSucceeded = (payload: ProjectMetadata): UpdateProjectSucceededAction => ({
  type: UPDATE_PROJECT_SUCCEEDED,
  payload
})
export const updateProjectFailed = (
  projectId: string,
  error: string
): UpdateProjectFailedAction => ({
  type: UPDATE_PROJECT_FAILED,
  payload: { projectId, error }
})
export const setActiveScenario = (scenarioId: string): SetActiveScenarioAction => ({
  type: SET_ACTIVE_SCENARIO,
  payload: { scenarioId }
})

export const listScenariosRequested = (projectId: string): ListScenariosRequestedAction => ({
  type: LIST_SCENARIOS_REQUESTED,
  payload: { projectId }
})
export const listScenariosSucceeded = (
  projectId: string,
  scenarios: Scenario[]
): ListScenariosSucceededAction => ({
  type: LIST_SCENARIOS_SUCCEEDED,
  payload: { projectId, scenarios }
})
export const listScenariosFailed = (
  projectId: string,
  error: string
): ListScenariosFailedAction => ({
  type: LIST_SCENARIOS_FAILED,
  payload: { projectId, error }
})

export const loadHeadersRequested = (
  projectId: string,
  scenarioId: string
): LoadHeadersRequestedAction => ({
  type: LOAD_HEADERS_REQUESTED,
  payload: { projectId, scenarioId }
})
export const loadHeadersSucceeded = (
  scenarioId: string,
  headers: WeatherHeader[]
): LoadHeadersSucceededAction => ({
  type: LOAD_HEADERS_SUCCEEDED,
  payload: { scenarioId, headers }
})
export const loadHeadersFailed = (scenarioId: string, error: string): LoadHeadersFailedAction => ({
  type: LOAD_HEADERS_FAILED,
  payload: { scenarioId, error }
})

export const loadScenarioRequested = (
  projectId: string,
  scenarioId: string
): LoadScenarioRequestedAction => ({
  type: LOAD_SCENARIO_REQUESTED,
  payload: { projectId, scenarioId }
})
export const loadScenarioSucceeded = (
  payload: LoadedScenarioPayload
): LoadScenarioSucceededAction => ({ type: LOAD_SCENARIO_SUCCEEDED, payload })
export const loadScenarioFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): LoadScenarioFailedAction => ({
  type: LOAD_SCENARIO_FAILED,
  payload: { projectId, scenarioId, error }
})

export const uploadFileRequested = (
  projectId: string,
  scenarioId: string,
  file: File
): UploadFileRequestedAction => ({
  type: UPLOAD_FILE_REQUESTED,
  payload: { projectId, scenarioId, file }
})
export const uploadFileSucceeded = (
  projectId: string,
  scenarioId: string
): UploadFileSucceededAction => ({
  type: UPLOAD_FILE_SUCCEEDED,
  payload: { projectId, scenarioId }
})
export const uploadFileFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): UploadFileFailedAction => ({
  type: UPLOAD_FILE_FAILED,
  payload: { projectId, scenarioId, error }
})

export const addRowRequested = (
  projectId: string,
  scenarioId: string,
  date: string,
  time: string,
  columnIds: ColId[],
  numberOfRows: number,
  deltaHours: number
): AddRowRequestedAction => ({
  type: ADD_ROW_REQUESTED,
  payload: { projectId, scenarioId, date, time, columnIds, numberOfRows, deltaHours }
})
export const addRowSucceeded = (projectId: string, scenarioId: string): AddRowSucceededAction => ({
  type: ADD_ROW_SUCCEEDED,
  payload: { projectId, scenarioId }
})
export const addRowFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): AddRowFailedAction => ({
  type: ADD_ROW_FAILED,
  payload: { projectId, scenarioId, error }
})
export const addRowReset = (): AddRowResetAction => ({
  type: ADD_ROW_RESET
})

export const addColumnRequested = (
  projectId: string,
  scenarioId: string,
  name: string,
  dataTypeId: number | null,
  dataUnitId: number | null,
  defaultValue: string
): AddColumnRequestedAction => ({
  type: ADD_COLUMN_REQUESTED,
  payload: { projectId, scenarioId, name, dataTypeId, dataUnitId, defaultValue }
})
export const addColumnSucceeded = (
  projectId: string,
  scenarioId: string,
  column: ColumnDef,
  defaultValue: string
): AddColumnSucceededAction => ({
  type: ADD_COLUMN_SUCCEEDED,
  payload: { projectId, scenarioId, column, defaultValue }
})
export const addColumnFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): AddColumnFailedAction => ({
  type: ADD_COLUMN_FAILED,
  payload: { projectId, scenarioId, error }
})
export const addColumnReset = (): AddColumnResetAction => ({
  type: ADD_COLUMN_RESET
})

export const seedDefaultColumnsRequested = (
  projectId: string,
  scenarioId: string
): SeedDefaultColumnsRequestedAction => ({
  type: SEED_DEFAULT_COLUMNS_REQUESTED,
  payload: { projectId, scenarioId }
})
export const seedDefaultColumnsSucceeded = (
  projectId: string,
  scenarioId: string
): SeedDefaultColumnsSucceededAction => ({
  type: SEED_DEFAULT_COLUMNS_SUCCEEDED,
  payload: { projectId, scenarioId }
})
export const seedDefaultColumnsFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): SeedDefaultColumnsFailedAction => ({
  type: SEED_DEFAULT_COLUMNS_FAILED,
  payload: { projectId, scenarioId, error }
})

export const updateColumnRequested = (
  projectId: string,
  scenarioId: string,
  colId: ColId,
  patch: UpdateColumnPatch,
  previous: UpdateColumnPatch
): UpdateColumnRequestedAction => ({
  type: UPDATE_COLUMN_REQUESTED,
  payload: { projectId, scenarioId, colId, patch, previous }
})
export const updateColumnSucceeded = (
  projectId: string,
  scenarioId: string,
  colId: ColId
): UpdateColumnSucceededAction => ({
  type: UPDATE_COLUMN_SUCCEEDED,
  payload: { projectId, scenarioId, colId }
})
export const updateColumnFailed = (
  projectId: string,
  scenarioId: string,
  colId: ColId,
  previous: UpdateColumnPatch,
  error: string
): UpdateColumnFailedAction => ({
  type: UPDATE_COLUMN_FAILED,
  payload: { projectId, scenarioId, colId, previous, error }
})

export const updateColumnValuesLocal = (
  payload: UpdateColumnValuesLocalPayload
): UpdateColumnValuesLocalAction => ({
  type: UPDATE_COLUMN_VALUES_LOCAL,
  payload
})

export const deleteColumnRequested = (
  projectId: string,
  scenarioId: string,
  colId: ColId,
  snapshot: DeleteColumnSnapshot
): DeleteColumnRequestedAction => ({
  type: DELETE_COLUMN_REQUESTED,
  payload: { projectId, scenarioId, colId, snapshot }
})
export const deleteColumnSucceeded = (
  projectId: string,
  scenarioId: string,
  colId: ColId
): DeleteColumnSucceededAction => ({
  type: DELETE_COLUMN_SUCCEEDED,
  payload: { projectId, scenarioId, colId }
})
export const deleteColumnFailed = (
  projectId: string,
  scenarioId: string,
  colId: ColId,
  snapshot: DeleteColumnSnapshot,
  error: string
): DeleteColumnFailedAction => ({
  type: DELETE_COLUMN_FAILED,
  payload: { projectId, scenarioId, colId, snapshot, error }
})

export const deleteRowRequested = (
  projectId: string,
  scenarioId: string,
  rowId: RowId,
  date: string,
  time: string,
  snapshot: DeleteRowSnapshot
): DeleteRowRequestedAction => ({
  type: DELETE_ROW_REQUESTED,
  payload: { projectId, scenarioId, rowId, date, time, snapshot }
})
export const deleteRowSucceeded = (
  projectId: string,
  scenarioId: string,
  rowId: RowId
): DeleteRowSucceededAction => ({
  type: DELETE_ROW_SUCCEEDED,
  payload: { projectId, scenarioId, rowId }
})
export const deleteRowsRequested = (
  projectId: string,
  scenarioId: string,
  rowIds: RowId[],
  keys: Array<{ date: string; time: string }>
): DeleteRowsRequestedAction => ({
  type: DELETE_ROWS_REQUESTED,
  payload: { projectId, scenarioId, rowIds, keys }
})
export const deleteRowsSucceeded = (
  projectId: string,
  scenarioId: string,
  rowIds: RowId[]
): DeleteRowsSucceededAction => ({
  type: DELETE_ROWS_SUCCEEDED,
  payload: { projectId, scenarioId, rowIds }
})
export const deleteRowsFailed = (
  projectId: string,
  scenarioId: string,
  error: string
): DeleteRowsFailedAction => ({
  type: DELETE_ROWS_FAILED,
  payload: { projectId, scenarioId, error }
})
export const deleteRowsReset = (): DeleteRowsResetAction => ({ type: DELETE_ROWS_RESET })
export const deleteRowFailed = (
  projectId: string,
  scenarioId: string,
  rowId: RowId,
  snapshot: DeleteRowSnapshot,
  error: string
): DeleteRowFailedAction => ({
  type: DELETE_ROW_FAILED,
  payload: { projectId, scenarioId, rowId, snapshot, error }
})

export const updateCellLocal = (payload: UpdateCellLocalPayload): UpdateCellLocalAction => ({
  type: UPDATE_CELL_LOCAL,
  payload
})

export const updateCellRequested = (
  projectId: string,
  scenarioId: string,
  rowId: RowId,
  colId: ColId
): UpdateCellRequestedAction => ({
  type: UPDATE_CELL_REQUESTED,
  payload: { projectId, scenarioId, rowId, colId }
})
export const updateCellSucceeded = (
  projectId: string,
  scenarioId: string,
  rowId: RowId,
  colId: ColId
): UpdateCellSucceededAction => ({
  type: UPDATE_CELL_SUCCEEDED,
  payload: { projectId, scenarioId, rowId, colId }
})
export const updateCellFailed = (
  projectId: string,
  scenarioId: string,
  rowId: RowId,
  colId: ColId,
  error: string
): UpdateCellFailedAction => ({
  type: UPDATE_CELL_FAILED,
  payload: { projectId, scenarioId, rowId, colId, error }
})

export const updateAllCheckboxesRequested = (
  projectId: string,
  scenarioId: string,
  checkColId: ColId,
  value: string
): UpdateAllCheckboxesRequestedAction => ({
  type: UPDATE_ALL_CHECKBOXES_REQUESTED,
  payload: { projectId, scenarioId, checkColId, value }
})

export const setColumnValidationErrors = (
  scenarioId: string,
  colId: ColId,
  errors: Record<RowId, string | null>
): SetColumnValidationErrorsAction => ({
  type: SET_COLUMN_VALIDATION_ERRORS,
  payload: { scenarioId, colId, errors }
})

export const setCellValidationError = (
  scenarioId: string,
  rowId: RowId,
  colId: ColId,
  validationError: string | null
): SetCellValidationErrorAction => ({
  type: SET_CELL_VALIDATION_ERROR,
  payload: { scenarioId, rowId, colId, validationError }
})

export const setColumnNameError = (
  scenarioId: string,
  colId: ColId,
  error: string | null
): SetColumnNameErrorAction => ({
  type: SET_COLUMN_NAME_ERROR,
  payload: { scenarioId, colId, error }
})

export const setRowSelection = (
  scenarioId: string,
  rowId: RowId,
  selected: boolean
): SetRowSelectionAction => ({
  type: SET_ROW_SELECTION,
  payload: { scenarioId, rowId, selected }
})
export const setAllRowsSelection = (
  scenarioId: string,
  selected: boolean
): SetAllRowsSelectionAction => ({
  type: SET_ALL_ROWS_SELECTION,
  payload: { scenarioId, selected }
})
