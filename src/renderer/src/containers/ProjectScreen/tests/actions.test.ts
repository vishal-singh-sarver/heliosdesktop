import * as actions from '../actions'
import {
  ADD_COLUMN_FAILED,
  ADD_COLUMN_REQUESTED,
  ADD_COLUMN_SUCCEEDED,
  ADD_ROW_FAILED,
  ADD_ROW_REQUESTED,
  ADD_ROW_SUCCEEDED,
  DELETE_ROW_FAILED,
  DELETE_ROW_REQUESTED,
  DELETE_ROW_SUCCEEDED,
  LIST_SCENARIOS_FAILED,
  LIST_SCENARIOS_REQUESTED,
  LIST_SCENARIOS_SUCCEEDED,
  LOAD_DATA_TYPES_FAILED,
  LOAD_DATA_TYPES_REQUESTED,
  LOAD_DATA_TYPES_SUCCEEDED,
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
  SET_COLUMN_VALIDATION_ERRORS,
  SET_ROW_SELECTION,
  UPDATE_PROJECT_FAILED,
  UPDATE_PROJECT_REQUESTED,
  UPDATE_PROJECT_SUCCEEDED,
  UPDATE_CELL_FAILED,
  UPDATE_CELL_LOCAL,
  UPDATE_CELL_REQUESTED,
  UPDATE_CELL_SUCCEEDED,
  UPDATE_COLUMN_FAILED,
  UPDATE_COLUMN_REQUESTED,
  UPDATE_COLUMN_SUCCEEDED,
  UPLOAD_FILE_FAILED,
  UPLOAD_FILE_REQUESTED,
  UPLOAD_FILE_SUCCEEDED
} from '../constants'
import type {
  ColumnDef,
  DataTypeDef,
  LoadedScenarioPayload,
  ProjectMetadata,
  Scenario,
  WeatherHeader
} from '../types'

const PROJ = 'project-1'
const SCN = 'scenario-1'

const sampleDataType: DataTypeDef = {
  id: 1,
  data_type: 'temperature',
  description: 'Air temperature',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  units: []
}

const sampleProject: ProjectMetadata = {
  id: PROJ,
  name: 'Project One',
  latitude: 12.5,
  longitude: 77.5,
  utc_offset: '+05:30'
}

const sampleScenario: Scenario = {
  id: SCN,
  name: 'Scenario One',
  has_weather: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
}

const sampleHeader: WeatherHeader = {
  id: 7,
  scenario_id: SCN,
  name: 'temp',
  helios_data_type_id: 1,
  unit_id: 2,
  status: true,
  display_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
}

const sampleColumn: ColumnDef = {
  id: '7',
  name: 'temp',
  dataTypeId: 1,
  unitId: 2
}

describe('ProjectScreen action creators', () => {
  describe('catalog: data types', () => {
    it('loadDataTypesRequested', () => {
      expect(actions.loadDataTypesRequested()).toEqual({ type: LOAD_DATA_TYPES_REQUESTED })
    })

    it('loadDataTypesSucceeded carries the wire payload', () => {
      expect(actions.loadDataTypesSucceeded([sampleDataType])).toEqual({
        type: LOAD_DATA_TYPES_SUCCEEDED,
        payload: [sampleDataType]
      })
    })

    it('loadDataTypesFailed carries the error string', () => {
      expect(actions.loadDataTypesFailed('boom')).toEqual({
        type: LOAD_DATA_TYPES_FAILED,
        payload: 'boom'
      })
    })
  })

  describe('active project + scenario', () => {
    it('setActiveProject carries projectId', () => {
      expect(actions.setActiveProject(PROJ)).toEqual({
        type: SET_ACTIVE_PROJECT,
        payload: { projectId: PROJ }
      })
    })

    it('setActiveScenario carries scenarioId', () => {
      expect(actions.setActiveScenario(SCN)).toEqual({
        type: SET_ACTIVE_SCENARIO,
        payload: { scenarioId: SCN }
      })
    })

    it('loadProjectSucceeded carries the metadata', () => {
      expect(actions.loadProjectSucceeded(sampleProject)).toEqual({
        type: LOAD_PROJECT_SUCCEEDED,
        payload: sampleProject
      })
    })

    it('updateProjectRequested carries projectId + patch', () => {
      expect(actions.updateProjectRequested(PROJ, { latitude: 23.5 })).toEqual({
        type: UPDATE_PROJECT_REQUESTED,
        payload: { projectId: PROJ, patch: { latitude: 23.5 } }
      })
    })

    it('updateProjectSucceeded carries refreshed metadata', () => {
      expect(actions.updateProjectSucceeded(sampleProject)).toEqual({
        type: UPDATE_PROJECT_SUCCEEDED,
        payload: sampleProject
      })
    })

    it('updateProjectFailed carries projectId + error', () => {
      expect(actions.updateProjectFailed(PROJ, 'bad coords')).toEqual({
        type: UPDATE_PROJECT_FAILED,
        payload: { projectId: PROJ, error: 'bad coords' }
      })
    })
  })

  describe('list scenarios', () => {
    it('listScenariosRequested carries projectId', () => {
      expect(actions.listScenariosRequested(PROJ)).toEqual({
        type: LIST_SCENARIOS_REQUESTED,
        payload: { projectId: PROJ }
      })
    })

    it('listScenariosSucceeded carries projectId + scenarios', () => {
      expect(actions.listScenariosSucceeded(PROJ, [sampleScenario])).toEqual({
        type: LIST_SCENARIOS_SUCCEEDED,
        payload: { projectId: PROJ, scenarios: [sampleScenario] }
      })
    })

    it('listScenariosFailed carries projectId + error', () => {
      expect(actions.listScenariosFailed(PROJ, 'denied')).toEqual({
        type: LIST_SCENARIOS_FAILED,
        payload: { projectId: PROJ, error: 'denied' }
      })
    })
  })

  describe('headers', () => {
    it('loadHeadersRequested carries projectId + scenarioId', () => {
      expect(actions.loadHeadersRequested(PROJ, SCN)).toEqual({
        type: LOAD_HEADERS_REQUESTED,
        payload: { projectId: PROJ, scenarioId: SCN }
      })
    })

    it('loadHeadersSucceeded carries scenarioId + headers', () => {
      expect(actions.loadHeadersSucceeded(SCN, [sampleHeader])).toEqual({
        type: LOAD_HEADERS_SUCCEEDED,
        payload: { scenarioId: SCN, headers: [sampleHeader] }
      })
    })

    it('loadHeadersFailed carries scenarioId + error', () => {
      expect(actions.loadHeadersFailed(SCN, 'oops')).toEqual({
        type: LOAD_HEADERS_FAILED,
        payload: { scenarioId: SCN, error: 'oops' }
      })
    })
  })

  describe('scenario load', () => {
    it('loadScenarioRequested carries projectId + scenarioId', () => {
      expect(actions.loadScenarioRequested(PROJ, SCN)).toEqual({
        type: LOAD_SCENARIO_REQUESTED,
        payload: { projectId: PROJ, scenarioId: SCN }
      })
    })

    it('loadScenarioSucceeded passes through the joined payload', () => {
      const payload: LoadedScenarioPayload = {
        projectId: PROJ,
        scenarioId: SCN,
        columns: [sampleColumn],
        rows: [{ '7': '22.5' }]
      }
      expect(actions.loadScenarioSucceeded(payload)).toEqual({
        type: LOAD_SCENARIO_SUCCEEDED,
        payload
      })
    })

    it('loadScenarioFailed carries projectId, scenarioId and error', () => {
      expect(actions.loadScenarioFailed(PROJ, SCN, 'fetch failed')).toEqual({
        type: LOAD_SCENARIO_FAILED,
        payload: { projectId: PROJ, scenarioId: SCN, error: 'fetch failed' }
      })
    })
  })

  describe('upload', () => {
    it('uploadFileRequested carries projectId, scenarioId and file', () => {
      const file = new File(['a,b\n1,2'], 'sample.csv', { type: 'text/csv' })
      expect(actions.uploadFileRequested(PROJ, SCN, file)).toEqual({
        type: UPLOAD_FILE_REQUESTED,
        payload: { projectId: PROJ, scenarioId: SCN, file }
      })
    })

    it('uploadFileSucceeded carries projectId + scenarioId', () => {
      expect(actions.uploadFileSucceeded(PROJ, SCN)).toEqual({
        type: UPLOAD_FILE_SUCCEEDED,
        payload: { projectId: PROJ, scenarioId: SCN }
      })
    })

    it('uploadFileFailed carries projectId, scenarioId and error', () => {
      expect(actions.uploadFileFailed(PROJ, SCN, 'too big')).toEqual({
        type: UPLOAD_FILE_FAILED,
        payload: { projectId: PROJ, scenarioId: SCN, error: 'too big' }
      })
    })
  })

  describe('add row', () => {
    it('addRowRequested carries the (date, time, columnIds, count, deltaHours) tuple', () => {
      expect(
        actions.addRowRequested(PROJ, SCN, '2026-04-27', '10:00', ['date', 'time', '7'], 5, 1)
      ).toEqual({
        type: ADD_ROW_REQUESTED,
        payload: {
          projectId: PROJ,
          scenarioId: SCN,
          date: '2026-04-27',
          time: '10:00',
          columnIds: ['date', 'time', '7'],
          numberOfRows: 5,
          deltaHours: 1
        }
      })
    })

    it('addRowSucceeded carries projectId + scenarioId only (no inline rows)', () => {
      expect(actions.addRowSucceeded(PROJ, SCN)).toEqual({
        type: ADD_ROW_SUCCEEDED,
        payload: { projectId: PROJ, scenarioId: SCN }
      })
    })

    it('addRowFailed carries projectId, scenarioId and error', () => {
      expect(actions.addRowFailed(PROJ, SCN, 'bad date')).toEqual({
        type: ADD_ROW_FAILED,
        payload: { projectId: PROJ, scenarioId: SCN, error: 'bad date' }
      })
    })
  })

  describe('add column', () => {
    it('addColumnRequested carries the API payload', () => {
      expect(actions.addColumnRequested(PROJ, SCN, 'humidity', 3, 4, '65')).toEqual({
        type: ADD_COLUMN_REQUESTED,
        payload: {
          projectId: PROJ,
          scenarioId: SCN,
          name: 'humidity',
          dataTypeId: 3,
          dataUnitId: 4,
          defaultValue: '65'
        }
      })
    })

    it('addColumnSucceeded carries the new column metadata + back-fill value', () => {
      expect(actions.addColumnSucceeded(PROJ, SCN, sampleColumn, '65')).toEqual({
        type: ADD_COLUMN_SUCCEEDED,
        payload: { projectId: PROJ, scenarioId: SCN, column: sampleColumn, defaultValue: '65' }
      })
    })

    it('addColumnFailed carries projectId, scenarioId and error', () => {
      expect(actions.addColumnFailed(PROJ, SCN, 'duplicate name')).toEqual({
        type: ADD_COLUMN_FAILED,
        payload: { projectId: PROJ, scenarioId: SCN, error: 'duplicate name' }
      })
    })
  })

  describe('seed default columns', () => {
    it('seedDefaultColumnsRequested carries projectId + scenarioId', () => {
      expect(actions.seedDefaultColumnsRequested(PROJ, SCN)).toEqual({
        type: SEED_DEFAULT_COLUMNS_REQUESTED,
        payload: { projectId: PROJ, scenarioId: SCN }
      })
    })

    it('seedDefaultColumnsSucceeded carries projectId + scenarioId', () => {
      expect(actions.seedDefaultColumnsSucceeded(PROJ, SCN)).toEqual({
        type: SEED_DEFAULT_COLUMNS_SUCCEEDED,
        payload: { projectId: PROJ, scenarioId: SCN }
      })
    })

    it('seedDefaultColumnsFailed carries projectId, scenarioId and error', () => {
      expect(actions.seedDefaultColumnsFailed(PROJ, SCN, 'no catalog')).toEqual({
        type: SEED_DEFAULT_COLUMNS_FAILED,
        payload: { projectId: PROJ, scenarioId: SCN, error: 'no catalog' }
      })
    })
  })

  describe('update column header', () => {
    const patch = { name: 'temperature' }
    const previous = { name: 'temp' }

    it('updateColumnRequested carries patch + previous snapshot', () => {
      expect(actions.updateColumnRequested(PROJ, SCN, '7', patch, previous)).toEqual({
        type: UPDATE_COLUMN_REQUESTED,
        payload: { projectId: PROJ, scenarioId: SCN, colId: '7', patch, previous }
      })
    })

    it('updateColumnSucceeded carries projectId, scenarioId, colId', () => {
      expect(actions.updateColumnSucceeded(PROJ, SCN, '7')).toEqual({
        type: UPDATE_COLUMN_SUCCEEDED,
        payload: { projectId: PROJ, scenarioId: SCN, colId: '7' }
      })
    })

    it('updateColumnFailed carries previous (for rollback) + error', () => {
      expect(actions.updateColumnFailed(PROJ, SCN, '7', previous, 'rejected')).toEqual({
        type: UPDATE_COLUMN_FAILED,
        payload: { projectId: PROJ, scenarioId: SCN, colId: '7', previous, error: 'rejected' }
      })
    })
  })

  describe('delete row', () => {
    const snapshot = {
      cells: { date: '2026-04-27', time: '10:00:00', '7': '293.1' },
      index: 0,
      validationErrors: undefined,
      cellSync: {},
      selected: false
    }

    it('deleteRowRequested carries the (date, time) key + rollback snapshot', () => {
      expect(
        actions.deleteRowRequested(PROJ, SCN, 'row_0', '2026-04-27', '10:00:00', snapshot)
      ).toEqual({
        type: DELETE_ROW_REQUESTED,
        payload: {
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          date: '2026-04-27',
          time: '10:00:00',
          snapshot
        }
      })
    })

    it('deleteRowSucceeded carries projectId, scenarioId, rowId', () => {
      expect(actions.deleteRowSucceeded(PROJ, SCN, 'row_0')).toEqual({
        type: DELETE_ROW_SUCCEEDED,
        payload: { projectId: PROJ, scenarioId: SCN, rowId: 'row_0' }
      })
    })

    it('deleteRowFailed carries the snapshot (for rollback) + error', () => {
      expect(actions.deleteRowFailed(PROJ, SCN, 'row_0', snapshot, 'rejected')).toEqual({
        type: DELETE_ROW_FAILED,
        payload: { projectId: PROJ, scenarioId: SCN, rowId: 'row_0', snapshot, error: 'rejected' }
      })
    })
  })

  describe('cell edit', () => {
    it('updateCellLocal carries the optimistic-edit payload', () => {
      const payload = {
        projectId: PROJ,
        scenarioId: SCN,
        rowId: 'row_0',
        colId: '7',
        value: '1.0',
        validationError: null
      }
      expect(actions.updateCellLocal(payload)).toEqual({ type: UPDATE_CELL_LOCAL, payload })
    })

    it('updateCellRequested carries the cell coordinates', () => {
      expect(actions.updateCellRequested(PROJ, SCN, 'row_0', '7')).toEqual({
        type: UPDATE_CELL_REQUESTED,
        payload: { projectId: PROJ, scenarioId: SCN, rowId: 'row_0', colId: '7' }
      })
    })

    it('updateCellSucceeded carries the cell coordinates', () => {
      expect(actions.updateCellSucceeded(PROJ, SCN, 'row_0', '7')).toEqual({
        type: UPDATE_CELL_SUCCEEDED,
        payload: { projectId: PROJ, scenarioId: SCN, rowId: 'row_0', colId: '7' }
      })
    })

    it('updateCellFailed carries the cell coordinates + error', () => {
      expect(actions.updateCellFailed(PROJ, SCN, 'row_0', '7', 'rejected')).toEqual({
        type: UPDATE_CELL_FAILED,
        payload: { projectId: PROJ, scenarioId: SCN, rowId: 'row_0', colId: '7', error: 'rejected' }
      })
    })
  })

  describe('column-level validation', () => {
    it('setColumnValidationErrors carries the per-row errors map', () => {
      const errors = { row_0: 'too high', row_1: null }
      expect(actions.setColumnValidationErrors(SCN, '7', errors)).toEqual({
        type: SET_COLUMN_VALIDATION_ERRORS,
        payload: { scenarioId: SCN, colId: '7', errors }
      })
    })
  })

  describe('selection', () => {
    it('setRowSelection carries scenarioId, rowId, selected', () => {
      expect(actions.setRowSelection(SCN, 'row_5', true)).toEqual({
        type: SET_ROW_SELECTION,
        payload: { scenarioId: SCN, rowId: 'row_5', selected: true }
      })
    })

    it('setAllRowsSelection carries scenarioId + selected', () => {
      expect(actions.setAllRowsSelection(SCN, false)).toEqual({
        type: SET_ALL_ROWS_SELECTION,
        payload: { scenarioId: SCN, selected: false }
      })
    })
  })
})
