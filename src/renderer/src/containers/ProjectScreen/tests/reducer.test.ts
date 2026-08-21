import projectScreenReducer, { initialState } from '../reducer'
import * as actions from '../actions'
import {
  cellKey,
  type ColumnDef,
  type DataTypeDef,
  type LoadedScenarioPayload,
  type ProjectMetadata,
  type Scenario,
  type WeatherHeader
} from '../types'

const PROJ = 'project-1'
const SCN = 'scenario-1'

const sampleDataType: DataTypeDef = {
  id: 1,
  data_type: 'temperature',
  description: '',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  units: [
    {
      id: 2,
      unit: 'K',
      alias: 'kelvin',
      data_type_id: 1,
      min: 0,
      max: 1000,
      to_base_factor: 1,
      to_base_offset: 0,
      is_base: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    }
  ]
}

const sampleProject: ProjectMetadata = {
  id: PROJ,
  name: 'Project One',
  latitude: 12.5,
  longitude: 77.5,
  utc_offset: '+05:30'
}

const sampleColumns: ColumnDef[] = [
  { id: 'date', name: 'date', dataTypeId: null, unitId: null },
  { id: 'time', name: 'time', dataTypeId: null, unitId: null },
  { id: '7', name: 'temp', dataTypeId: 1, unitId: 2 }
]

const samplePayload: LoadedScenarioPayload = {
  projectId: PROJ,
  scenarioId: SCN,
  columns: sampleColumns,
  rows: [
    { date: '2026-04-27', time: '10:00:00', '7': '293.1' },
    { date: '2026-04-27', time: '11:00:00', '7': '294.2' }
  ]
}

const loaded = (): ReturnType<typeof projectScreenReducer> =>
  projectScreenReducer(initialState, actions.loadScenarioSucceeded(samplePayload))

describe('projectScreenReducer', () => {
  it('returns the initial state', () => {
    expect(projectScreenReducer(undefined, { type: '@@INIT' } as never)).toEqual(initialState)
  })

  describe('catalog: data types', () => {
    it('LOAD_DATA_TYPES_REQUESTED sets loading and clears error', () => {
      const seed = {
        ...initialState,
        catalog: {
          ...initialState.catalog,
          dataTypes: { ...initialState.catalog.dataTypes, loadError: 'prev' }
        }
      }
      const result = projectScreenReducer(seed, actions.loadDataTypesRequested())
      expect(result.catalog.dataTypes.loadStatus).toBe('loading')
      expect(result.catalog.dataTypes.loadError).toBeNull()
    })

    it('LOAD_DATA_TYPES_SUCCEEDED populates byId / allIds and flips status', () => {
      const result = projectScreenReducer(
        initialState,
        actions.loadDataTypesSucceeded([sampleDataType])
      )
      expect(result.catalog.dataTypes.byId[sampleDataType.id]).toEqual(sampleDataType)
      expect(result.catalog.dataTypes.allIds).toEqual([sampleDataType.id])
      expect(result.catalog.dataTypes.loadStatus).toBe('loaded')
    })

    it('LOAD_DATA_TYPES_FAILED stores the error and flips status', () => {
      const result = projectScreenReducer(initialState, actions.loadDataTypesFailed('boom'))
      expect(result.catalog.dataTypes.loadStatus).toBe('error')
      expect(result.catalog.dataTypes.loadError).toBe('boom')
    })
  })

  describe('catalog: model types', () => {
    const sampleModel = { id: 3, model: 'Solar Position', description: 'Sun position model' }

    it('LOAD_MODEL_TYPES_REQUESTED sets loading and clears error', () => {
      const seed = {
        ...initialState,
        catalog: {
          ...initialState.catalog,
          modelTypes: { ...initialState.catalog.modelTypes, loadError: 'prev' }
        }
      }
      const result = projectScreenReducer(seed, actions.loadModelTypesRequested())
      expect(result.catalog.modelTypes.loadStatus).toBe('loading')
      expect(result.catalog.modelTypes.loadError).toBeNull()
    })

    it('LOAD_MODEL_TYPES_SUCCEEDED populates byId / allIds and flips status', () => {
      const result = projectScreenReducer(
        initialState,
        actions.loadModelTypesSucceeded([sampleModel])
      )
      expect(result.catalog.modelTypes.byId[sampleModel.id]).toEqual(sampleModel)
      expect(result.catalog.modelTypes.allIds).toEqual([sampleModel.id])
      expect(result.catalog.modelTypes.loadStatus).toBe('loaded')
    })

    it('LOAD_MODEL_TYPES_FAILED stores the error and flips status', () => {
      const result = projectScreenReducer(initialState, actions.loadModelTypesFailed('boom'))
      expect(result.catalog.modelTypes.loadStatus).toBe('error')
      expect(result.catalog.modelTypes.loadError).toBe('boom')
    })
  })

  describe('active project + scenario', () => {
    it('SET_ACTIVE_PROJECT on a fresh state stores the projectId', () => {
      const result = projectScreenReducer(initialState, actions.setActiveProject(PROJ))
      expect(result.activeProjectId).toBe(PROJ)
      expect(result.activeScenarioId).toBeNull()
      expect(result.activeProject).toBeNull()
    })

    it('SET_ACTIVE_PROJECT to the SAME id preserves activeScenarioId + activeProject', () => {
      let state = projectScreenReducer(initialState, actions.setActiveProject(PROJ))
      state = projectScreenReducer(state, actions.loadProjectSucceeded(sampleProject))
      state = projectScreenReducer(state, actions.setActiveScenario(SCN))
      expect(state.activeScenarioId).toBe(SCN)

      const result = projectScreenReducer(state, actions.setActiveProject(PROJ))
      expect(result.activeProjectId).toBe(PROJ)
      expect(result.activeScenarioId).toBe(SCN)
      expect(result.activeProject).toEqual(sampleProject)
    })

    it('SET_ACTIVE_PROJECT to a DIFFERENT id invalidates scenario + project metadata', () => {
      let state = projectScreenReducer(initialState, actions.setActiveProject(PROJ))
      state = projectScreenReducer(state, actions.loadProjectSucceeded(sampleProject))
      state = projectScreenReducer(state, actions.setActiveScenario(SCN))

      const result = projectScreenReducer(state, actions.setActiveProject('project-2'))
      expect(result.activeProjectId).toBe('project-2')
      expect(result.activeScenarioId).toBeNull()
      expect(result.activeProject).toBeNull()
    })

    it('LOAD_PROJECT_SUCCEEDED stores the metadata', () => {
      const result = projectScreenReducer(initialState, actions.loadProjectSucceeded(sampleProject))
      expect(result.activeProject).toEqual(sampleProject)
    })

    it('UPDATE_PROJECT_REQUESTED sets loading and clears error', () => {
      const seed = {
        ...initialState,
        updateProject: { loading: false, error: 'previous' }
      }
      const result = projectScreenReducer(
        seed,
        actions.updateProjectRequested(PROJ, { latitude: 1 })
      )
      expect(result.updateProject.loading).toBe(true)
      expect(result.updateProject.error).toBeNull()
    })

    it('UPDATE_PROJECT_SUCCEEDED stores refreshed metadata and clears loading', () => {
      const result = projectScreenReducer(
        { ...initialState, updateProject: { loading: true, error: null } },
        actions.updateProjectSucceeded(sampleProject)
      )
      expect(result.updateProject.loading).toBe(false)
      expect(result.updateProject.error).toBeNull()
      expect(result.activeProject).toEqual(sampleProject)
    })

    it('UPDATE_PROJECT_FAILED stores the error and clears loading', () => {
      const result = projectScreenReducer(
        { ...initialState, updateProject: { loading: true, error: null } },
        actions.updateProjectFailed(PROJ, 'denied')
      )
      expect(result.updateProject.loading).toBe(false)
      expect(result.updateProject.error).toBe('denied')
    })

    it('SET_ACTIVE_SCENARIO sets id and ensures an empty table', () => {
      const result = projectScreenReducer(initialState, actions.setActiveScenario(SCN))
      expect(result.activeScenarioId).toBe(SCN)
      expect(result.byScenario[SCN]).toBeDefined()
      expect(result.byScenario[SCN].rowOrder).toEqual([])
    })

    it('SET_ACTIVE_SCENARIO leaves an existing table untouched', () => {
      const result = projectScreenReducer(loaded(), actions.setActiveScenario(SCN))
      expect(result.byScenario[SCN].rowOrder).toHaveLength(2)
    })
  })

  describe('list scenarios', () => {
    const scenario: Scenario = {
      id: SCN,
      name: 'Scenario One',
      has_weather: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    }

    it('LIST_SCENARIOS_REQUESTED ensures the per-project entry and sets loading', () => {
      const result = projectScreenReducer(initialState, actions.listScenariosRequested(PROJ))
      expect(result.scenarios.byProject[PROJ].loadStatus).toBe('loading')
      expect(result.scenarios.byProject[PROJ].loadError).toBeNull()
    })

    it('LIST_SCENARIOS_SUCCEEDED stores ids, byId and flips status', () => {
      const result = projectScreenReducer(
        initialState,
        actions.listScenariosSucceeded(PROJ, [scenario])
      )
      const entry = result.scenarios.byProject[PROJ]
      expect(entry.ids).toEqual([SCN])
      expect(entry.byId[SCN]).toEqual(scenario)
      expect(entry.loadStatus).toBe('loaded')
    })

    it('LIST_SCENARIOS_FAILED stores the error', () => {
      const result = projectScreenReducer(initialState, actions.listScenariosFailed(PROJ, 'denied'))
      const entry = result.scenarios.byProject[PROJ]
      expect(entry.loadStatus).toBe('error')
      expect(entry.loadError).toBe('denied')
    })
  })

  describe('headers', () => {
    const h0: WeatherHeader = {
      id: 7,
      scenario_id: SCN,
      name: 'temp',
      helios_data_type_id: 1,
      unit_id: 2,
      status: true,
      display_order: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    }
    const h1: WeatherHeader = { ...h0, id: 8, name: 'humidity', display_order: 0 }

    it('LOAD_HEADERS_REQUESTED ensures the entry and sets loading', () => {
      const result = projectScreenReducer(initialState, actions.loadHeadersRequested(PROJ, SCN))
      expect(result.headers.byScenario[SCN].loadStatus).toBe('loading')
    })

    it('LOAD_HEADERS_SUCCEEDED sorts ids by display_order', () => {
      const result = projectScreenReducer(initialState, actions.loadHeadersSucceeded(SCN, [h0, h1]))
      const entry = result.headers.byScenario[SCN]
      // h1 has display_order=0, h0 has display_order=1 → h1 first
      expect(entry.ids).toEqual([8, 7])
      expect(entry.loadStatus).toBe('loaded')
    })

    it('LOAD_HEADERS_FAILED stores the error', () => {
      const result = projectScreenReducer(initialState, actions.loadHeadersFailed(SCN, 'oops'))
      const entry = result.headers.byScenario[SCN]
      expect(entry.loadStatus).toBe('error')
      expect(entry.loadError).toBe('oops')
    })
  })

  describe('scenario load', () => {
    it('LOAD_SCENARIO_REQUESTED ensures an empty table for the scenario', () => {
      const result = projectScreenReducer(initialState, actions.loadScenarioRequested(PROJ, SCN))
      expect(result.byScenario[SCN]).toBeDefined()
      expect(result.byScenario[SCN].rowOrder).toEqual([])
    })

    it('LOAD_SCENARIO_SUCCEEDED populates columns/rows in insert order with row_${i} ids', () => {
      const result = loaded()
      const table = result.byScenario[SCN]

      expect(table.columnOrder).toEqual(['date', 'time', '7'])
      expect(table.rowOrder).toEqual(['row_0', 'row_1'])
      expect(table.rows.row_0).toEqual({ date: '2026-04-27', time: '10:00:00', '7': '293.1' })
      expect(table.columns['7'].unitId).toBe(2)
    })

    it('LOAD_SCENARIO_SUCCEEDED seeds every row as selected', () => {
      const result = loaded()
      expect(result.byScenario[SCN].rowSelection).toEqual({ row_0: true, row_1: true })
    })

    it('LOAD_SCENARIO_FAILED is a no-op (UI surfaces error via toast)', () => {
      const result = projectScreenReducer(loaded(), actions.loadScenarioFailed(PROJ, SCN, 'boom'))
      expect(result.byScenario[SCN].rowOrder).toEqual(['row_0', 'row_1'])
    })
  })

  describe('bulk row delete', () => {
    // The whole point of this flow: the confirm dialog stays open until the
    // backend answers, so nothing may leave state on _REQUESTED.
    it('DELETE_ROWS_REQUESTED marks loading and leaves the rows alone', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.deleteRowsRequested(PROJ, SCN, ['row_0'], [{ date: '2026-04-27', time: '10:00:00' }])
      )

      expect(result.deleteRows).toEqual({ loading: true, error: null })
      expect(result.byScenario[SCN].rowOrder).toEqual(['row_0', 'row_1'])
      expect(result.byScenario[SCN].rows.row_0).toBeDefined()
    })

    it('DELETE_ROWS_SUCCEEDED removes every id from rows, order, validation, selection and sync', () => {
      let seed = projectScreenReducer(
        loaded(),
        actions.setColumnValidationErrors(SCN, '7', { row_0: 'too high' })
      )
      seed = projectScreenReducer(seed, actions.setRowSelection(SCN, 'row_0', true))
      seed = projectScreenReducer(
        seed,
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '300',
          validationError: null
        })
      )

      const result = projectScreenReducer(
        seed,
        actions.deleteRowsSucceeded(PROJ, SCN, ['row_0', 'row_1'])
      )
      const table = result.byScenario[SCN]

      expect(result.deleteRows).toEqual({ loading: false, error: null })
      expect(table.rowOrder).toEqual([])
      expect(table.rows.row_0).toBeUndefined()
      expect(table.rows.row_1).toBeUndefined()
      expect(table.validationErrors.row_0).toBeUndefined()
      expect(table.rowSelection.row_0).toBeUndefined()
      expect(table.cellSync[cellKey('row_0', '7')]).toBeUndefined()
    })

    it('DELETE_ROWS_SUCCEEDED leaves rows that were not in the batch', () => {
      const result = projectScreenReducer(loaded(), actions.deleteRowsSucceeded(PROJ, SCN, ['row_0']))

      expect(result.byScenario[SCN].rowOrder).toEqual(['row_1'])
      expect(result.byScenario[SCN].rows.row_1).toBeDefined()
    })

    it('DELETE_ROWS_FAILED records the error and keeps every row', () => {
      const seed = projectScreenReducer(
        loaded(),
        actions.deleteRowsRequested(PROJ, SCN, ['row_0'], [{ date: '2026-04-27', time: '10:00:00' }])
      )

      const result = projectScreenReducer(seed, actions.deleteRowsFailed(PROJ, SCN, 'row(s) not found'))

      expect(result.deleteRows).toEqual({ loading: false, error: 'row(s) not found' })
      expect(result.byScenario[SCN].rowOrder).toEqual(['row_0', 'row_1'])
    })

    it('DELETE_ROWS_RESET clears a previous failure', () => {
      const seed = projectScreenReducer(loaded(), actions.deleteRowsFailed(PROJ, SCN, 'boom'))

      expect(projectScreenReducer(seed, actions.deleteRowsReset()).deleteRows).toEqual({
        loading: false,
        error: null
      })
    })
  })

  describe('upload', () => {
    it('UPLOAD_FILE_REQUESTED ensures a table for the scenario', () => {
      const file = new File(['x'], 'x.csv')
      const result = projectScreenReducer(
        initialState,
        actions.uploadFileRequested(PROJ, SCN, file)
      )
      expect(result.byScenario[SCN]).toBeDefined()
    })

    it('UPLOAD_FILE_SUCCEEDED clears the table for the follow-up fetch', () => {
      const result = projectScreenReducer(loaded(), actions.uploadFileSucceeded(PROJ, SCN))
      const table = result.byScenario[SCN]
      expect(table.rowOrder).toEqual([])
      expect(table.columnOrder).toEqual([])
    })

    it('UPLOAD_FILE_FAILED is a no-op on the table', () => {
      const result = projectScreenReducer(loaded(), actions.uploadFileFailed(PROJ, SCN, 'x'))
      expect(result.byScenario[SCN].rowOrder).toEqual(['row_0', 'row_1'])
    })
  })

  describe('add row', () => {
    it('ADD_ROW_REQUESTED flips loading and clears error', () => {
      const seed = { ...initialState, addRow: { loading: false, error: 'prev' } }
      const result = projectScreenReducer(
        seed,
        actions.addRowRequested(PROJ, SCN, '2026-04-27', '10:00', ['date', 'time'], 1, 1)
      )
      expect(result.addRow.loading).toBe(true)
      expect(result.addRow.error).toBeNull()
    })

    it('ADD_ROW_SUCCEEDED clears loading and error', () => {
      const seed = { ...initialState, addRow: { loading: true, error: 'prev' } }
      const result = projectScreenReducer(seed, actions.addRowSucceeded(PROJ, SCN))
      expect(result.addRow.loading).toBe(false)
      expect(result.addRow.error).toBeNull()
    })

    it('ADD_ROW_FAILED stores the error and clears loading', () => {
      const seed = { ...initialState, addRow: { loading: true, error: null } }
      const result = projectScreenReducer(seed, actions.addRowFailed(PROJ, SCN, 'bad date'))
      expect(result.addRow.loading).toBe(false)
      expect(result.addRow.error).toBe('bad date')
    })
  })

  describe('add column', () => {
    const newColumn: ColumnDef = { id: '9', name: 'humidity', dataTypeId: 3, unitId: 4 }

    it('ADD_COLUMN_REQUESTED flips loading and clears error', () => {
      const seed = { ...initialState, addColumn: { loading: false, error: 'prev' } }
      const result = projectScreenReducer(
        seed,
        actions.addColumnRequested(PROJ, SCN, 'humidity', 3, 4, '')
      )
      expect(result.addColumn.loading).toBe(true)
      expect(result.addColumn.error).toBeNull()
    })

    it('ADD_COLUMN_SUCCEEDED appends column and back-fills defaultValue across rows', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.addColumnSucceeded(PROJ, SCN, newColumn, '65')
      )
      const table = result.byScenario[SCN]
      expect(table.columnOrder).toContain('9')
      expect(table.columns['9']).toEqual(newColumn)
      expect(table.rows.row_0['9']).toBe('65')
      expect(table.rows.row_1['9']).toBe('65')
    })

    it('ADD_COLUMN_SUCCEEDED with empty defaultValue back-fills with null', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.addColumnSucceeded(PROJ, SCN, newColumn, '')
      )
      const table = result.byScenario[SCN]
      expect(table.rows.row_0['9']).toBeNull()
      expect(table.rows.row_1['9']).toBeNull()
    })

    it('ADD_COLUMN_FAILED stores the error and clears loading', () => {
      const seed = { ...initialState, addColumn: { loading: true, error: null } }
      const result = projectScreenReducer(
        seed,
        actions.addColumnFailed(PROJ, SCN, 'duplicate name')
      )
      expect(result.addColumn.loading).toBe(false)
      expect(result.addColumn.error).toBe('duplicate name')
    })
  })

  describe('update column header (optimistic + rollback)', () => {
    it('UPDATE_COLUMN_REQUESTED applies the patch optimistically', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.updateColumnRequested(
          PROJ,
          SCN,
          '7',
          { name: 'temperature', dataTypeId: 9 },
          { name: 'temp', dataTypeId: 1 }
        )
      )
      const col = result.byScenario[SCN].columns['7']
      expect(col.name).toBe('temperature')
      expect(col.dataTypeId).toBe(9)
      expect(col.unitId).toBe(2)
    })

    it('UPDATE_COLUMN_REQUESTED with undefined keys leaves those fields alone', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.updateColumnRequested(PROJ, SCN, '7', { unitId: 99 }, { unitId: 2 })
      )
      const col = result.byScenario[SCN].columns['7']
      expect(col.name).toBe('temp')
      expect(col.dataTypeId).toBe(1)
      expect(col.unitId).toBe(99)
    })

    it('UPDATE_COLUMN_FAILED rolls back data type / unit changes', () => {
      const optimistic = projectScreenReducer(
        loaded(),
        actions.updateColumnRequested(
          PROJ,
          SCN,
          '7',
          { dataTypeId: 9, unitId: 99 },
          { dataTypeId: 1, unitId: 2 }
        )
      )
      const result = projectScreenReducer(
        optimistic,
        actions.updateColumnFailed(PROJ, SCN, '7', { dataTypeId: 1, unitId: 2 }, 'rejected')
      )
      const col = result.byScenario[SCN].columns['7']
      expect(col.dataTypeId).toBe(1)
      expect(col.unitId).toBe(2)
    })

    it('UPDATE_COLUMN_FAILED keeps the typed name and records the backend error', () => {
      const optimistic = projectScreenReducer(
        loaded(),
        actions.updateColumnRequested(PROJ, SCN, '7', { name: 'humidity' }, { name: 'temp' })
      )
      const result = projectScreenReducer(
        optimistic,
        actions.updateColumnFailed(PROJ, SCN, '7', { name: 'temp' }, 'Name already exists')
      )
      const table = result.byScenario[SCN]
      // Name is NOT reverted — the user's typed value stays on screen…
      expect(table.columns['7'].name).toBe('humidity')
      // …and the backend message is surfaced inline via the column error map.
      expect(table.columnNameErrors['7']).toBe('Name already exists')
    })

    it('clears the name error on a fresh name UPDATE_COLUMN_REQUESTED (retry)', () => {
      const failed = [
        actions.updateColumnRequested(PROJ, SCN, '7', { name: 'humidity' }, { name: 'temp' }),
        actions.updateColumnFailed(PROJ, SCN, '7', { name: 'temp' }, 'Name already exists')
      ].reduce(projectScreenReducer, loaded())
      expect(failed.byScenario[SCN].columnNameErrors['7']).toBe('Name already exists')

      // Retrying with a new name clears the stale rejection optimistically.
      const retried = projectScreenReducer(
        failed,
        actions.updateColumnRequested(PROJ, SCN, '7', { name: 'rh' }, { name: 'humidity' })
      )
      expect(retried.byScenario[SCN].columnNameErrors['7']).toBeUndefined()
    })

    it('keeps the name error when an unrelated unit change succeeds on the same column', () => {
      const failed = [
        actions.updateColumnRequested(PROJ, SCN, '7', { name: 'humidity' }, { name: 'temp' }),
        actions.updateColumnFailed(PROJ, SCN, '7', { name: 'temp' }, 'Name already exists')
      ].reduce(projectScreenReducer, loaded())

      // A data-type / unit change carries no `name`, so neither its optimistic
      // REQUESTED nor its SUCCEEDED may touch the column's name rejection.
      const afterUnitChange = [
        actions.updateColumnRequested(PROJ, SCN, '7', { unitId: 3 }, { unitId: 2 }),
        actions.updateColumnSucceeded(PROJ, SCN, '7')
      ].reduce(projectScreenReducer, failed)

      expect(afterUnitChange.byScenario[SCN].columnNameErrors['7']).toBe('Name already exists')
    })

    it('SET_COLUMN_NAME_ERROR sets and clears the per-column name error', () => {
      const withError = projectScreenReducer(
        loaded(),
        actions.setColumnNameError(SCN, '7', 'Name already exists')
      )
      expect(withError.byScenario[SCN].columnNameErrors['7']).toBe('Name already exists')

      const cleared = projectScreenReducer(withError, actions.setColumnNameError(SCN, '7', null))
      expect(cleared.byScenario[SCN].columnNameErrors['7']).toBeUndefined()
    })

    it('UPDATE_COLUMN_REQUESTED on a missing scenario / column is a no-op', () => {
      const result = projectScreenReducer(
        initialState,
        actions.updateColumnRequested(PROJ, SCN, '7', { name: 'x' }, { name: 'y' })
      )
      expect(result).toEqual(initialState)
    })
  })

  describe('delete column header (optimistic + rollback)', () => {
    const snapshotForLoadedColumn = () => ({
      column: { ...sampleColumns[2] },
      index: 2,
      rowValues: {
        row_0: '293.1',
        row_1: '294.2'
      },
      validationErrors: {
        row_0: 'too high',
        row_1: undefined
      },
      cellSync: {
        [cellKey('row_0', '7')]: 'pending' as const
      }
    })

    it('DELETE_COLUMN_REQUESTED removes the column, cell values, validation errors and sync state', () => {
      let seed = projectScreenReducer(
        loaded(),
        actions.setColumnValidationErrors(SCN, '7', { row_0: 'too high' })
      )
      seed = projectScreenReducer(
        seed,
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '300',
          validationError: null
        })
      )

      const result = projectScreenReducer(
        seed,
        actions.deleteColumnRequested(PROJ, SCN, '7', snapshotForLoadedColumn())
      )
      const table = result.byScenario[SCN]
      expect(table.columnOrder).toEqual(['date', 'time'])
      expect(table.columns['7']).toBeUndefined()
      expect(table.rows.row_0['7']).toBeUndefined()
      expect(table.rows.row_1['7']).toBeUndefined()
      expect(table.validationErrors.row_0?.['7']).toBeUndefined()
      expect(table.cellSync[cellKey('row_0', '7')]).toBeUndefined()
    })

    it('DELETE_COLUMN_FAILED restores the removed column from the snapshot', () => {
      const snapshot = snapshotForLoadedColumn()
      const deleted = projectScreenReducer(
        loaded(),
        actions.deleteColumnRequested(PROJ, SCN, '7', snapshot)
      )

      const result = projectScreenReducer(
        deleted,
        actions.deleteColumnFailed(PROJ, SCN, '7', snapshot, 'rejected')
      )
      const table = result.byScenario[SCN]
      expect(table.columnOrder).toEqual(['date', 'time', '7'])
      expect(table.columns['7']).toEqual(sampleColumns[2])
      expect(table.rows.row_0['7']).toBe('293.1')
      expect(table.rows.row_1['7']).toBe('294.2')
      expect(table.validationErrors.row_0['7']).toBe('too high')
      expect(table.cellSync[cellKey('row_0', '7')]).toBe('pending')
    })
  })

  describe('delete row (optimistic + rollback)', () => {
    const snapshotForRow0 = () => ({
      cells: { date: '2026-04-27', time: '10:00:00', '7': '293.1' },
      index: 0,
      validationErrors: { '7': 'too high' },
      cellSync: { [cellKey('row_0', '7')]: 'pending' as const },
      selected: true
    })

    it('DELETE_ROW_REQUESTED removes the row from rows, rowOrder, validation, selection and sync', () => {
      let seed = projectScreenReducer(
        loaded(),
        actions.setColumnValidationErrors(SCN, '7', { row_0: 'too high' })
      )
      seed = projectScreenReducer(seed, actions.setRowSelection(SCN, 'row_0', true))
      seed = projectScreenReducer(
        seed,
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '300',
          validationError: null
        })
      )

      const result = projectScreenReducer(
        seed,
        actions.deleteRowRequested(PROJ, SCN, 'row_0', '2026-04-27', '10:00:00', snapshotForRow0())
      )
      const table = result.byScenario[SCN]
      expect(table.rowOrder).toEqual(['row_1'])
      expect(table.rows.row_0).toBeUndefined()
      expect(table.validationErrors.row_0).toBeUndefined()
      expect(table.rowSelection.row_0).toBeUndefined()
      expect(table.cellSync[cellKey('row_0', '7')]).toBeUndefined()
    })

    it('DELETE_ROW_FAILED restores the removed row at its original index from the snapshot', () => {
      const snapshot = snapshotForRow0()
      const deleted = projectScreenReducer(
        loaded(),
        actions.deleteRowRequested(PROJ, SCN, 'row_0', '2026-04-27', '10:00:00', snapshot)
      )
      expect(deleted.byScenario[SCN].rowOrder).toEqual(['row_1'])

      const result = projectScreenReducer(
        deleted,
        actions.deleteRowFailed(PROJ, SCN, 'row_0', snapshot, 'rejected')
      )
      const table = result.byScenario[SCN]
      // Restored at index 0 — in front of the surviving row, not appended.
      expect(table.rowOrder).toEqual(['row_0', 'row_1'])
      expect(table.rows.row_0).toEqual(snapshot.cells)
      expect(table.validationErrors.row_0['7']).toBe('too high')
      expect(table.rowSelection.row_0).toBe(true)
      expect(table.cellSync[cellKey('row_0', '7')]).toBe('pending')
    })

    it('DELETE_ROW_REQUESTED is a no-op when the row is unknown', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.deleteRowRequested(PROJ, SCN, 'row_99', '2026-04-27', '10:00:00', {
          cells: {},
          index: -1,
          validationErrors: undefined,
          cellSync: {},
          selected: false
        })
      )
      expect(result.byScenario[SCN].rowOrder).toEqual(['row_0', 'row_1'])
    })
  })

  describe('cell edit', () => {
    it('UPDATE_CELL_LOCAL with no validation error writes value and marks pending', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '300.0',
          validationError: null
        })
      )
      const table = result.byScenario[SCN]
      expect(table.rows.row_0['7']).toBe('300.0')
      expect(table.cellSync[cellKey('row_0', '7')]).toBe('pending')
      expect(table.validationErrors.row_0?.['7']).toBeUndefined()
    })

    it('UPDATE_CELL_LOCAL clears a stale pending sync entry when validationError is set', () => {
      // First: write a clean edit so cellSync[key] = "pending" exists.
      let state = projectScreenReducer(
        loaded(),
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '300.0',
          validationError: null
        })
      )
      expect(state.byScenario[SCN].cellSync[cellKey('row_0', '7')]).toBe('pending')

      // Then: a follow-up edit that fails validation must DELETE the stale
      // entry — no network call will fire to clear it later.
      state = projectScreenReducer(
        state,
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: 'NaN',
          validationError: 'Must be a number'
        })
      )
      expect(state.byScenario[SCN].validationErrors.row_0['7']).toBe('Must be a number')
      expect(state.byScenario[SCN].cellSync[cellKey('row_0', '7')]).toBeUndefined()
    })

    it('UPDATE_CELL_LOCAL keeps pending for a numeric out-of-range value (still synced)', () => {
      const state = projectScreenReducer(
        loaded(),
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '999999',
          validationError: 'too high'
        })
      )
      const table = state.byScenario[SCN]
      // The error is recorded for display…
      expect(table.validationErrors.row_0['7']).toBe('too high')
      // …but because the value is a number, the edit is still sent (pending).
      expect(table.cellSync[cellKey('row_0', '7')]).toBe('pending')
    })

    it('UPDATE_CELL_LOCAL with empty value writes null (cleared cell)', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '',
          validationError: null
        })
      )
      expect(result.byScenario[SCN].rows.row_0['7']).toBeNull()
    })

    it('UPDATE_CELL_LOCAL clears any prior validationError when the new edit passes', () => {
      let state = projectScreenReducer(
        loaded(),
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: 'NaN',
          validationError: 'Must be a number'
        })
      )
      state = projectScreenReducer(
        state,
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '300',
          validationError: null
        })
      )
      expect(state.byScenario[SCN].validationErrors.row_0?.['7']).toBeUndefined()
    })

    it('UPDATE_CELL_SUCCEEDED clears sync state for the cell', () => {
      let state = projectScreenReducer(
        loaded(),
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '300.0',
          validationError: null
        })
      )
      state = projectScreenReducer(state, actions.updateCellSucceeded(PROJ, SCN, 'row_0', '7'))
      expect(state.byScenario[SCN].cellSync[cellKey('row_0', '7')]).toBeUndefined()
    })

    it('UPDATE_CELL_FAILED marks cellSync as error AND surfaces the error via validationErrors', () => {
      // Need a pending sync entry first — UPDATE_CELL_FAILED writes onto an
      // existing table; it doesn't create cellSync state on its own.
      let state = projectScreenReducer(
        loaded(),
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: SCN,
          rowId: 'row_0',
          colId: '7',
          value: '300.0',
          validationError: null
        })
      )
      state = projectScreenReducer(
        state,
        actions.updateCellFailed(PROJ, SCN, 'row_0', '7', 'rejected by backend')
      )
      const table = state.byScenario[SCN]
      expect(table.cellSync[cellKey('row_0', '7')]).toBe('error')
      // Backend rejection surfaces through the same validationErrors map the
      // local validator uses, so the cell renders with the standard red-ring
      // / info-icon tooltip treatment.
      expect(table.validationErrors.row_0['7']).toBe('rejected by backend')
    })
  })

  describe('column-level validation', () => {
    it('SET_COLUMN_VALIDATION_ERRORS sets string entries and clears null entries', () => {
      // First, seed a prior error on row_0 so we can verify null clears it.
      let state = projectScreenReducer(
        loaded(),
        actions.setColumnValidationErrors(SCN, '7', { row_0: 'too high' })
      )
      expect(state.byScenario[SCN].validationErrors.row_0['7']).toBe('too high')

      state = projectScreenReducer(
        state,
        actions.setColumnValidationErrors(SCN, '7', { row_0: null, row_1: 'too low' })
      )
      const errors = state.byScenario[SCN].validationErrors
      expect(errors.row_0?.['7']).toBeUndefined()
      expect(errors.row_1['7']).toBe('too low')
    })

    it('SET_COLUMN_VALIDATION_ERRORS on a missing scenario is a no-op', () => {
      const result = projectScreenReducer(
        initialState,
        actions.setColumnValidationErrors('missing', '7', { row_0: 'x' })
      )
      expect(result).toEqual(initialState)
    })
  })

  describe('selection', () => {
    it('SET_ROW_SELECTION toggles one row', () => {
      const result = projectScreenReducer(loaded(), actions.setRowSelection(SCN, 'row_1', false))
      expect(result.byScenario[SCN].rowSelection.row_1).toBe(false)
      expect(result.byScenario[SCN].rowSelection.row_0).toBe(true)
    })

    it('SET_ROW_SELECTION on a missing scenario is a no-op', () => {
      const result = projectScreenReducer(
        initialState,
        actions.setRowSelection('missing', 'row_0', true)
      )
      expect(result).toEqual(initialState)
    })

    it('SET_ALL_ROWS_SELECTION toggles every row in the active table', () => {
      const result = projectScreenReducer(loaded(), actions.setAllRowsSelection(SCN, false))
      expect(result.byScenario[SCN].rowSelection).toEqual({ row_0: false, row_1: false })
    })
  })

  describe('reset + local + confirmation cases', () => {
    it('ADD_ROW_RESET clears the add-row request status', () => {
      const seed = { ...initialState, addRow: { loading: true, error: 'bad date' } }
      const result = projectScreenReducer(seed, actions.addRowReset())
      expect(result.addRow).toEqual({ loading: false, error: null })
    })

    it('ADD_COLUMN_RESET clears the add-column request status', () => {
      const seed = { ...initialState, addColumn: { loading: true, error: 'duplicate name' } }
      const result = projectScreenReducer(seed, actions.addColumnReset())
      expect(result.addColumn).toEqual({ loading: false, error: null })
    })

    it('UPDATE_COLUMN_VALUES_LOCAL overwrites existing rows and materializes missing ones', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.updateColumnValuesLocal({
          scenarioId: SCN,
          colId: '7',
          valuesByRowId: { row_0: '260.0', row_1: null, row_9: '999' }
        })
      )
      const table = result.byScenario[SCN]
      expect(table.rows.row_0['7']).toBe('260.0')
      expect(table.rows.row_1['7']).toBeNull()
      // A rowId with no prior dict gets one created holding just the new value.
      expect(table.rows.row_9).toEqual({ '7': '999' })
    })

    it('UPDATE_COLUMN_VALUES_LOCAL is a no-op on a missing scenario', () => {
      const result = projectScreenReducer(
        initialState,
        actions.updateColumnValuesLocal({
          scenarioId: 'missing',
          colId: '7',
          valuesByRowId: { row_0: '1' }
        })
      )
      expect(result).toEqual(initialState)
    })

    it('UPDATE_CELL_REQUESTED is a saga trigger only and leaves state unchanged', () => {
      const base = loaded()
      const result = projectScreenReducer(
        base,
        actions.updateCellRequested(PROJ, SCN, 'row_0', '7')
      )
      expect(result).toEqual(base)
    })

    it('DELETE_COLUMN_SUCCEEDED confirms the optimistic delete without rolling back', () => {
      const snapshot = {
        column: { ...sampleColumns[2] },
        index: 2,
        rowValues: { row_0: '293.1', row_1: '294.2' },
        validationErrors: {},
        cellSync: {}
      }
      const deleted = projectScreenReducer(
        loaded(),
        actions.deleteColumnRequested(PROJ, SCN, '7', snapshot)
      )
      const result = projectScreenReducer(deleted, actions.deleteColumnSucceeded(PROJ, SCN, '7'))
      expect(result.byScenario[SCN].columns['7']).toBeUndefined()
      expect(result.byScenario[SCN].columnOrder).toEqual(['date', 'time'])
      // SUCCEEDED is a pure confirmation — state matches the optimistic delete.
      expect(result).toEqual(deleted)
    })

    it('DELETE_ROW_SUCCEEDED confirms the optimistic row delete without rolling back', () => {
      const snapshot = {
        cells: { date: '2026-04-27', time: '10:00:00', '7': '293.1' },
        index: 0,
        validationErrors: undefined,
        cellSync: {},
        selected: true
      }
      const deleted = projectScreenReducer(
        loaded(),
        actions.deleteRowRequested(PROJ, SCN, 'row_0', '2026-04-27', '10:00:00', snapshot)
      )
      const result = projectScreenReducer(deleted, actions.deleteRowSucceeded(PROJ, SCN, 'row_0'))
      expect(result.byScenario[SCN].rowOrder).toEqual(['row_1'])
      expect(result).toEqual(deleted)
    })

    it("UPDATE_ALL_CHECKBOXES_REQUESTED writes the value into every row's check cell", () => {
      const result = projectScreenReducer(
        loaded(),
        actions.updateAllCheckboxesRequested(PROJ, SCN, 'check', '1')
      )
      const table = result.byScenario[SCN]
      expect(table.rows.row_0['check']).toBe('1')
      expect(table.rows.row_1['check']).toBe('1')
    })

    it('UPDATE_ALL_CHECKBOXES_REQUESTED is a no-op on a missing scenario', () => {
      const result = projectScreenReducer(
        initialState,
        actions.updateAllCheckboxesRequested(PROJ, 'missing', 'check', '0')
      )
      expect(result).toEqual(initialState)
    })

    it('SET_CELL_VALIDATION_ERROR sets the error slot without touching the value or sync', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.setCellValidationError(SCN, 'row_0', '7', 'Must be a number')
      )
      const table = result.byScenario[SCN]
      expect(table.validationErrors.row_0['7']).toBe('Must be a number')
      // The value and cellSync are deliberately untouched by this action.
      expect(table.rows.row_0['7']).toBe('293.1')
      expect(table.cellSync[cellKey('row_0', '7')]).toBeUndefined()
    })

    it('SET_CELL_VALIDATION_ERROR reuses an existing row error map for a second column', () => {
      const first = projectScreenReducer(
        loaded(),
        actions.setCellValidationError(SCN, 'row_0', '7', 'too high')
      )
      const second = projectScreenReducer(
        first,
        actions.setCellValidationError(SCN, 'row_0', 'date', 'bad date')
      )
      const errs = second.byScenario[SCN].validationErrors.row_0
      expect(errs['7']).toBe('too high')
      expect(errs['date']).toBe('bad date')
    })

    it('SET_CELL_VALIDATION_ERROR with null clears an existing error', () => {
      const withErr = projectScreenReducer(
        loaded(),
        actions.setCellValidationError(SCN, 'row_0', '7', 'boom')
      )
      const cleared = projectScreenReducer(
        withErr,
        actions.setCellValidationError(SCN, 'row_0', '7', null)
      )
      expect(cleared.byScenario[SCN].validationErrors.row_0?.['7']).toBeUndefined()
    })

    it('SET_CELL_VALIDATION_ERROR with null on a never-flagged cell is a clean no-op', () => {
      const result = projectScreenReducer(
        loaded(),
        actions.setCellValidationError(SCN, 'row_0', '7', null)
      )
      expect(result.byScenario[SCN].validationErrors.row_0?.['7']).toBeUndefined()
    })

    it('SET_CELL_VALIDATION_ERROR is a no-op on a missing scenario', () => {
      const result = projectScreenReducer(
        initialState,
        actions.setCellValidationError('missing', 'row_0', '7', 'x')
      )
      expect(result).toEqual(initialState)
    })
  })

  describe('missing-scenario guards + rollback edge cases', () => {
    it('ADD_COLUMN_SUCCEEDED for an unknown scenario clears the status but adds no table', () => {
      const seed = { ...initialState, addColumn: { loading: true, error: 'prev' } }
      const result = projectScreenReducer(
        seed,
        actions.addColumnSucceeded(PROJ, 'missing', { id: '9', name: 'h', dataTypeId: null, unitId: null }, '')
      )
      // Status is cleared before the missing-table guard bails…
      expect(result.addColumn).toEqual({ loading: false, error: null })
      // …but no table is materialised for the unknown scenario.
      expect(result.byScenario['missing']).toBeUndefined()
    })

    it('UPDATE_COLUMN_FAILED is a no-op on a missing scenario / column', () => {
      const result = projectScreenReducer(
        initialState,
        actions.updateColumnFailed(PROJ, SCN, '7', { name: 'x' }, 'rejected')
      )
      expect(result).toEqual(initialState)
    })

    it('DELETE_COLUMN_REQUESTED is a no-op when the column is unknown', () => {
      const snapshot = { column: { ...sampleColumns[2] }, index: 2, rowValues: {}, validationErrors: {}, cellSync: {} }
      const result = projectScreenReducer(
        loaded(),
        actions.deleteColumnRequested(PROJ, SCN, 'nope', snapshot)
      )
      expect(result.byScenario[SCN].columnOrder).toEqual(['date', 'time', '7'])
    })

    it('DELETE_COLUMN_FAILED restores at the end when the snapshot index is negative', () => {
      const snapshot = {
        column: { ...sampleColumns[2] },
        index: -1,
        rowValues: { row_0: '293.1', row_1: '294.2' },
        validationErrors: {},
        cellSync: {}
      }
      const deleted = projectScreenReducer(
        loaded(),
        actions.deleteColumnRequested(PROJ, SCN, '7', snapshot)
      )
      const result = projectScreenReducer(
        deleted,
        actions.deleteColumnFailed(PROJ, SCN, '7', snapshot, 'rejected')
      )
      // index < 0 → appended at the end of columnOrder rather than spliced in.
      expect(result.byScenario[SCN].columnOrder).toEqual(['date', 'time', '7'])
      expect(result.byScenario[SCN].rows.row_0['7']).toBe('293.1')
    })

    it('DELETE_ROW_FAILED appends the restored row when the snapshot index is negative', () => {
      const snapshot = {
        cells: { date: '2026-04-27', time: '10:00:00', '7': '293.1' },
        index: -1,
        validationErrors: undefined,
        cellSync: {},
        selected: false
      }
      const deleted = projectScreenReducer(
        loaded(),
        actions.deleteRowRequested(PROJ, SCN, 'row_0', '2026-04-27', '10:00:00', snapshot)
      )
      expect(deleted.byScenario[SCN].rowOrder).toEqual(['row_1'])

      const result = projectScreenReducer(
        deleted,
        actions.deleteRowFailed(PROJ, SCN, 'row_0', snapshot, 'rejected')
      )
      const table = result.byScenario[SCN]
      // index < 0 → appended after the survivor instead of restored at index 0.
      expect(table.rowOrder).toEqual(['row_1', 'row_0'])
      // selected:false → the row is not re-selected on restore…
      expect(table.rowSelection.row_0).toBeUndefined()
      // …and an undefined snapshot.validationErrors leaves no error entry.
      expect(table.validationErrors.row_0).toBeUndefined()
    })

    it('DELETE_ROW_FAILED is a no-op on a missing scenario', () => {
      const result = projectScreenReducer(
        initialState,
        actions.deleteRowFailed(PROJ, 'missing', 'row_0', {
          cells: {},
          index: 0,
          validationErrors: undefined,
          cellSync: {},
          selected: false
        }, 'x')
      )
      expect(result).toEqual(initialState)
    })

    it('UPDATE_CELL_LOCAL / SUCCEEDED / FAILED are no-ops on a missing scenario', () => {
      const local = projectScreenReducer(
        initialState,
        actions.updateCellLocal({
          projectId: PROJ,
          scenarioId: 'missing',
          rowId: 'row_0',
          colId: '7',
          value: '1',
          validationError: null
        })
      )
      expect(local).toEqual(initialState)

      const succeeded = projectScreenReducer(
        initialState,
        actions.updateCellSucceeded(PROJ, 'missing', 'row_0', '7')
      )
      expect(succeeded).toEqual(initialState)

      const failed = projectScreenReducer(
        initialState,
        actions.updateCellFailed(PROJ, 'missing', 'row_0', '7', 'boom')
      )
      expect(failed).toEqual(initialState)
    })

    it('SET_COLUMN_NAME_ERROR is a no-op on a missing scenario', () => {
      const result = projectScreenReducer(
        initialState,
        actions.setColumnNameError('missing', '7', 'dup')
      )
      expect(result).toEqual(initialState)
    })

    it('SET_ALL_ROWS_SELECTION is a no-op on a missing scenario', () => {
      const result = projectScreenReducer(
        initialState,
        actions.setAllRowsSelection('missing', false)
      )
      expect(result).toEqual(initialState)
    })
  })
})
