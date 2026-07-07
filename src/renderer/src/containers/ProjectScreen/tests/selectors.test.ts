import type { RootState } from 'store/reducers'
import projectScreenReducer, { initialState } from '../reducer'
import * as actions from '../actions'
import {
  makeSelectCellError,
  makeSelectCellSync,
  makeSelectCellValue,
  makeSelectColumnNameError,
  makeSelectDataType,
  makeSelectDataUnitsForType,
  makeSelectHeadersForScenario,
  makeSelectHeadersLoadStatus,
  makeSelectRow,
  makeSelectRowSelected,
  makeSelectScenariosForProject,
  makeSelectScenariosLoadStatus,
  makeSelectUnitSymbol,
  makeSelectWeatherTable,
  selectActiveDateTimeFormat,
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
  selectByScenario,
  selectCheckColId,
  selectCheckDataTypeId,
  selectColumnOrder,
  selectColumns,
  selectDataTypesById,
  selectDataTypesError,
  selectDataTypesLoadStatus,
  selectDateTimeBaseUnit,
  selectDateTimeBaseUnitId,
  selectDateTimeDataType,
  selectDateTimeDataTypeId,
  selectHeadersByScenario,
  selectProjectScreenDomain,
  selectRowOrder,
  selectRowSelection,
  selectScenariosByProject,
  selectSelectableDataTypes,
  selectUpdateProjectError,
  selectUpdateProjectLoading
} from '../selectors'
import { DATE_TIME_COL_NAME, DATE_TIME_DATA_TYPE_NAME } from '../types'
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

const wrap = (projectScreen: typeof initialState): RootState =>
  ({ navigation: { screen: 'project' }, projectScreen }) as RootState

const sampleUnit = (id: number, dataTypeId: number, unit: string) => ({
  id,
  unit,
  alias: unit,
  data_type_id: dataTypeId,
  min: 0,
  max: 100,
  to_base_factor: 1,
  to_base_offset: 0,
  is_base: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z'
})

const sampleTypes: DataTypeDef[] = [
  {
    id: 1,
    data_type: 'temperature',
    description: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    units: [sampleUnit(2, 1, 'K')]
  },
  {
    id: 99,
    // The dedicated `check` data type — must NOT show up in
    // selectSelectableDataTypes (column-header dropdown).
    data_type: 'check',
    description: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    units: []
  }
]

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

const sampleColumns: ColumnDef[] = [
  { id: 'date', name: 'date', dataTypeId: null, unitId: null },
  { id: 'time', name: 'time', dataTypeId: null, unitId: null },
  { id: '7', name: 'temp', dataTypeId: 1, unitId: 2 },
  { id: '8', name: 'check', dataTypeId: 99, unitId: null }
]

const samplePayload: LoadedScenarioPayload = {
  projectId: PROJ,
  scenarioId: SCN,
  columns: sampleColumns,
  rows: [
    { date: '2026-04-27', time: '10:00:00', '7': '293.1', '8': '1' },
    { date: '2026-04-27', time: '11:00:00', '7': '294.2', '8': '1' }
  ]
}

const buildLoadedState = (): typeof initialState => {
  let state = initialState
  state = projectScreenReducer(state, actions.loadDataTypesSucceeded(sampleTypes))
  state = projectScreenReducer(state, actions.setActiveProject(PROJ))
  state = projectScreenReducer(state, actions.loadProjectSucceeded(sampleProject))
  state = projectScreenReducer(state, actions.listScenariosSucceeded(PROJ, [sampleScenario]))
  state = projectScreenReducer(state, actions.loadHeadersSucceeded(SCN, [sampleHeader]))
  state = projectScreenReducer(state, actions.setActiveScenario(SCN))
  state = projectScreenReducer(state, actions.loadScenarioSucceeded(samplePayload))
  return state
}

describe('selectProjectScreenDomain', () => {
  it('returns initialState when slice is absent', () => {
    expect(
      selectProjectScreenDomain({ navigation: { screen: 'project' } } as RootState)
    ).toEqual(initialState)
  })
})

describe('catalog selectors', () => {
  it('selectAllDataTypes returns every type in registry order', () => {
    const root = wrap(buildLoadedState())
    expect(selectAllDataTypes(root).map((d) => d.data_type)).toEqual(['temperature', 'check'])
  })

  it('selectSelectableDataTypes excludes the dedicated check data type', () => {
    expect(selectSelectableDataTypes(wrap(buildLoadedState())).map((d) => d.data_type)).toEqual([
      'temperature'
    ])
  })

  it('selectCheckDataTypeId resolves the check id from the catalog', () => {
    expect(selectCheckDataTypeId(wrap(buildLoadedState()))).toBe(99)
  })

  it('selectCheckDataTypeId returns null when the catalog has no check type', () => {
    let state = initialState
    state = projectScreenReducer(state, actions.loadDataTypesSucceeded([sampleTypes[0]]))
    expect(selectCheckDataTypeId(wrap(state))).toBeNull()
  })

  it('selectDataTypesById returns the keyed map', () => {
    const root = wrap(buildLoadedState())
    expect(selectDataTypesById(root)[1]?.data_type).toBe('temperature')
  })

  it('selectDataTypesLoadStatus reflects the slice status', () => {
    expect(selectDataTypesLoadStatus(wrap(buildLoadedState()))).toBe('loaded')
  })

  it('selectDataTypesError surfaces errors', () => {
    const state = projectScreenReducer(initialState, actions.loadDataTypesFailed('boom'))
    expect(selectDataTypesError(wrap(state))).toBe('boom')
  })

  it('makeSelectDataType returns the def by id', () => {
    const sel = makeSelectDataType(1)
    expect(sel(wrap(buildLoadedState()))?.data_type).toBe('temperature')
  })

  it('makeSelectDataUnitsForType returns the nested units', () => {
    const sel = makeSelectDataUnitsForType(1)
    expect(sel(wrap(buildLoadedState())).map((u) => u.unit)).toEqual(['K'])
  })

  it('makeSelectUnitSymbol resolves a unit symbol across data types', () => {
    expect(makeSelectUnitSymbol(2)(wrap(buildLoadedState()))).toBe('K')
  })

  it('makeSelectUnitSymbol returns null when unitId is null', () => {
    expect(makeSelectUnitSymbol(null)(wrap(buildLoadedState()))).toBeNull()
  })

  it('makeSelectUnitSymbol returns null when unitId is unknown', () => {
    expect(makeSelectUnitSymbol(999)(wrap(buildLoadedState()))).toBeNull()
  })
})

describe('scenarios + headers selectors', () => {
  it('selectScenariosByProject exposes the keyed slice', () => {
    expect(
      selectScenariosByProject(wrap(buildLoadedState()))[PROJ].ids
    ).toEqual([SCN])
  })

  it('makeSelectScenariosForProject returns scenarios in order', () => {
    expect(
      makeSelectScenariosForProject(PROJ)(wrap(buildLoadedState())).map((s) => s.id)
    ).toEqual([SCN])
  })

  it('makeSelectScenariosForProject returns [] for unknown projects', () => {
    expect(makeSelectScenariosForProject('unknown')(wrap(buildLoadedState()))).toEqual([])
  })

  it('makeSelectScenariosLoadStatus reflects the entry status', () => {
    expect(makeSelectScenariosLoadStatus(PROJ)(wrap(buildLoadedState()))).toBe('loaded')
  })

  it('makeSelectScenariosLoadStatus is idle for unknown projects', () => {
    expect(makeSelectScenariosLoadStatus('unknown')(wrap(buildLoadedState()))).toBe('idle')
  })

  it('selectHeadersByScenario exposes the keyed slice', () => {
    expect(selectHeadersByScenario(wrap(buildLoadedState()))[SCN].ids).toEqual([7])
  })

  it('makeSelectHeadersForScenario returns the headers in order', () => {
    expect(
      makeSelectHeadersForScenario(SCN)(wrap(buildLoadedState())).map((h) => h.id)
    ).toEqual([7])
  })

  it('makeSelectHeadersLoadStatus reflects the entry status', () => {
    expect(makeSelectHeadersLoadStatus(SCN)(wrap(buildLoadedState()))).toBe('loaded')
  })
})

describe('active project / scenario selectors', () => {
  it('selectActiveProjectId reflects the active id', () => {
    expect(selectActiveProjectId(wrap(buildLoadedState()))).toBe(PROJ)
  })

  it('selectActiveProject reflects the metadata', () => {
    expect(selectActiveProject(wrap(buildLoadedState()))).toEqual(sampleProject)
  })

  it('selectActiveScenarioId reflects the active id', () => {
    expect(selectActiveScenarioId(wrap(buildLoadedState()))).toBe(SCN)
  })

  it('selectByScenario returns the keyed table map', () => {
    expect(selectByScenario(wrap(buildLoadedState()))[SCN]).toBeDefined()
  })

  it('selectActiveWeatherTable returns the loaded table', () => {
    const table = selectActiveWeatherTable(wrap(buildLoadedState()))
    expect(table?.rowOrder).toEqual(['row_0', 'row_1'])
  })

  it('selectActiveWeatherTable returns null when no scenario active', () => {
    expect(selectActiveWeatherTable(wrap(initialState))).toBeNull()
  })

  it('selectActiveHeaders reflects the active scenario headers', () => {
    expect(selectActiveHeaders(wrap(buildLoadedState())).map((h) => h.id)).toEqual([7])
  })

  it('selectActiveHeaders returns [] when no scenario active', () => {
    expect(selectActiveHeaders(wrap(initialState))).toEqual([])
  })

  it('makeSelectWeatherTable returns the table by scenarioId', () => {
    expect(makeSelectWeatherTable(SCN)(wrap(buildLoadedState()))?.rowOrder).toHaveLength(2)
  })
})

describe('table column / row selectors', () => {
  it('selectColumns / selectColumnOrder reflect the loaded data', () => {
    const root = wrap(buildLoadedState())
    expect(selectColumnOrder(root)).toEqual(['date', 'time', '7', '8'])
    expect(selectColumns(root)['7']?.unitId).toBe(2)
  })

  it('selectRowOrder reflects rowOrder', () => {
    expect(selectRowOrder(wrap(buildLoadedState()))).toEqual(['row_0', 'row_1'])
  })

  it('makeSelectRow reads the correct row dict', () => {
    const sel = makeSelectRow('row_0')
    expect(sel(wrap(buildLoadedState()))?.['7']).toBe('293.1')
  })
})

describe('per-cell factories', () => {
  it('makeSelectCellValue reads the correct cell', () => {
    const sel = makeSelectCellValue('row_0', '7')
    expect(sel(wrap(buildLoadedState()))).toBe('293.1')
  })

  it('makeSelectCellSync defaults to idle', () => {
    const sel = makeSelectCellSync('row_0', '7')
    expect(sel(wrap(buildLoadedState()))).toBe('idle')
  })

  it('makeSelectCellSync reflects pending after optimistic edit', () => {
    let state = buildLoadedState()
    state = projectScreenReducer(
      state,
      actions.updateCellLocal({
        projectId: PROJ,
        scenarioId: SCN,
        rowId: 'row_0',
        colId: '7',
        value: '300.0',
        validationError: null
      })
    )
    expect(makeSelectCellSync('row_0', '7')(wrap(state))).toBe('pending')
  })

  it('makeSelectCellError surfaces validation errors', () => {
    let state = buildLoadedState()
    state = projectScreenReducer(
      state,
      actions.updateCellLocal({
        projectId: PROJ,
        scenarioId: SCN,
        rowId: 'row_0',
        colId: '7',
        value: 'NaN',
        validationError: 'must be number'
      })
    )
    expect(makeSelectCellError('row_0', '7')(wrap(state))).toBe('must be number')
  })

  it('makeSelectCellError returns null when no validation error', () => {
    expect(makeSelectCellError('row_0', '7')(wrap(buildLoadedState()))).toBeNull()
  })

  it('makeSelectColumnNameError surfaces a backend-rejected header name', () => {
    let state = buildLoadedState()
    state = projectScreenReducer(state, actions.setColumnNameError(SCN, '7', 'Name already exists'))
    expect(makeSelectColumnNameError('7')(wrap(state))).toBe('Name already exists')
  })

  it('makeSelectColumnNameError returns null when the column name is accepted', () => {
    expect(makeSelectColumnNameError('7')(wrap(buildLoadedState()))).toBeNull()
  })
})

describe('selection selectors', () => {
  it('selectAllRowsSelected is true after a fresh scenario load', () => {
    expect(selectAllRowsSelected(wrap(buildLoadedState()))).toBe(true)
  })

  it('selectAllRowsSelected is false when at least one row unselected', () => {
    let state = buildLoadedState()
    state = projectScreenReducer(state, actions.setRowSelection(SCN, 'row_0', false))
    expect(selectAllRowsSelected(wrap(state))).toBe(false)
  })

  it('selectAllRowsSelected is false on an empty table', () => {
    let state = initialState
    state = projectScreenReducer(state, actions.setActiveScenario(SCN))
    expect(selectAllRowsSelected(wrap(state))).toBe(false)
  })

  it('selectRowSelection reflects the per-row map', () => {
    expect(selectRowSelection(wrap(buildLoadedState()))).toEqual({
      row_0: true,
      row_1: true
    })
  })

  it('makeSelectRowSelected reflects per-row state', () => {
    let state = buildLoadedState()
    state = projectScreenReducer(state, actions.setRowSelection(SCN, 'row_0', false))
    expect(makeSelectRowSelected('row_0')(wrap(state))).toBe(false)
    expect(makeSelectRowSelected('row_1')(wrap(state))).toBe(true)
  })
})

describe('check column selectors', () => {
  it('selectCheckColId returns the colId of the seeded check column', () => {
    expect(selectCheckColId(wrap(buildLoadedState()))).toBe('8')
  })

  it('selectCheckColId returns null when no check column is present', () => {
    let state = initialState
    state = projectScreenReducer(
      state,
      actions.loadScenarioSucceeded({
        projectId: PROJ,
        scenarioId: SCN,
        columns: sampleColumns.filter((c) => c.name !== 'check'),
        rows: []
      })
    )
    state = projectScreenReducer(state, actions.setActiveScenario(SCN))
    expect(selectCheckColId(wrap(state))).toBeNull()
  })

  it('selectAllChecked is true when every row has check === "1"', () => {
    expect(selectAllChecked(wrap(buildLoadedState()))).toBe(true)
  })

  it('selectAllChecked is false when at least one row has check !== "1"', () => {
    let state = buildLoadedState()
    state = projectScreenReducer(
      state,
      actions.updateCellLocal({
        projectId: PROJ,
        scenarioId: SCN,
        rowId: 'row_0',
        colId: '8',
        value: '0',
        validationError: null
      })
    )
    expect(selectAllChecked(wrap(state))).toBe(false)
  })

  it('selectAllChecked is false on an empty table', () => {
    let state = initialState
    state = projectScreenReducer(state, actions.setActiveScenario(SCN))
    expect(selectAllChecked(wrap(state))).toBe(false)
  })

  it('selectAllChecked is false when no check column exists', () => {
    let state = initialState
    state = projectScreenReducer(
      state,
      actions.loadScenarioSucceeded({
        projectId: PROJ,
        scenarioId: SCN,
        columns: sampleColumns.filter((c) => c.name !== 'check'),
        rows: [{ date: '2026-04-27', time: '10:00:00', '7': '293.1' }]
      })
    )
    state = projectScreenReducer(state, actions.setActiveScenario(SCN))
    expect(selectAllChecked(wrap(state))).toBe(false)
  })
})

describe('mutation flow status selectors', () => {
  it('selectAddColumnLoading / Error reflect the addColumn slice', () => {
    let state = initialState
    state = projectScreenReducer(
      state,
      actions.addColumnRequested(PROJ, SCN, 'humidity', 3, 4, '')
    )
    expect(selectAddColumnLoading(wrap(state))).toBe(true)
    expect(selectAddColumnError(wrap(state))).toBeNull()

    state = projectScreenReducer(state, actions.addColumnFailed(PROJ, SCN, 'duplicate'))
    expect(selectAddColumnLoading(wrap(state))).toBe(false)
    expect(selectAddColumnError(wrap(state))).toBe('duplicate')
  })

  it('selectAddRowLoading / Error reflect the addRow slice', () => {
    let state = initialState
    state = projectScreenReducer(
      state,
      actions.addRowRequested(PROJ, SCN, '2026-04-27', '10:00', ['date', 'time'], 1, 1)
    )
    expect(selectAddRowLoading(wrap(state))).toBe(true)
    expect(selectAddRowError(wrap(state))).toBeNull()

    state = projectScreenReducer(state, actions.addRowFailed(PROJ, SCN, 'bad date'))
    expect(selectAddRowLoading(wrap(state))).toBe(false)
    expect(selectAddRowError(wrap(state))).toBe('bad date')
  })

  it('selectUpdateProjectLoading / Error reflect the updateProject slice', () => {
    let state = initialState
    state = projectScreenReducer(state, actions.updateProjectRequested(PROJ, { latitude: 1 }))
    expect(selectUpdateProjectLoading(wrap(state))).toBe(true)
    expect(selectUpdateProjectError(wrap(state))).toBeNull()

    state = projectScreenReducer(state, actions.updateProjectFailed(PROJ, 'denied'))
    expect(selectUpdateProjectLoading(wrap(state))).toBe(false)
    expect(selectUpdateProjectError(wrap(state))).toBe('denied')
  })
})

describe('date-time format selectors', () => {
  const DT_TYPE_ID = 50
  const DT_BASE_UNIT_ID = 501
  const DT_ALT_UNIT_ID = 502

  const dtUnit = (id: number, unit: string, is_base: boolean): DataTypeDef['units'][number] => ({
    id,
    unit,
    alias: unit,
    data_type_id: DT_TYPE_ID,
    min: null,
    max: null,
    to_base_factor: 1,
    to_base_offset: 0,
    is_base,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  })

  const dateTimeType: DataTypeDef = {
    id: DT_TYPE_ID,
    data_type: DATE_TIME_DATA_TYPE_NAME,
    description: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    units: [
      dtUnit(DT_BASE_UNIT_ID, 'MM/DD/YYYY HH:MM', true),
      dtUnit(DT_ALT_UNIT_ID, 'DD-MM-YYYY HH:MM', false)
    ]
  }

  // Loads the temperature catalog (+ optionally a date_time catalog entry) and
  // an active scenario whose merged date-time column carries `columnUnitId`.
  const buildDateTimeState = (
    columnUnitId: number | null,
    opts: { withDateTimeType?: boolean; dtType?: DataTypeDef } = {}
  ): typeof initialState => {
    const { withDateTimeType = true, dtType = dateTimeType } = opts
    const types = withDateTimeType ? [sampleTypes[0], dtType] : [sampleTypes[0]]
    let state = initialState
    state = projectScreenReducer(state, actions.loadDataTypesSucceeded(types))
    state = projectScreenReducer(state, actions.setActiveScenario(SCN))
    state = projectScreenReducer(
      state,
      actions.loadScenarioSucceeded({
        projectId: PROJ,
        scenarioId: SCN,
        columns: [
          { id: 'date', name: 'date', dataTypeId: null, unitId: null },
          { id: 'time', name: 'time', dataTypeId: null, unitId: null },
          { id: 'date-time', name: DATE_TIME_COL_NAME, dataTypeId: DT_TYPE_ID, unitId: columnUnitId }
        ],
        rows: []
      })
    )
    return state
  }

  it('selectDateTimeDataType / Id / BaseUnit / BaseUnitId resolve from the catalog', () => {
    const root = wrap(buildDateTimeState(DT_ALT_UNIT_ID))
    expect(selectDateTimeDataType(root)?.data_type).toBe(DATE_TIME_DATA_TYPE_NAME)
    expect(selectDateTimeDataTypeId(root)).toBe(DT_TYPE_ID)
    expect(selectDateTimeBaseUnit(root)?.unit).toBe('MM/DD/YYYY HH:MM')
    expect(selectDateTimeBaseUnitId(root)).toBe(DT_BASE_UNIT_ID)
  })

  it('selectDateTimeDataTypeId / BaseUnitId return null when the catalog has no date_time type', () => {
    const root = wrap(buildDateTimeState(null, { withDateTimeType: false }))
    expect(selectDateTimeDataType(root)).toBeUndefined()
    expect(selectDateTimeDataTypeId(root)).toBeNull()
    expect(selectDateTimeBaseUnit(root)).toBeUndefined()
    expect(selectDateTimeBaseUnitId(root)).toBeNull()
  })

  it("selectActiveDateTimeFormat resolves the column's configured unit format", () => {
    expect(selectActiveDateTimeFormat(wrap(buildDateTimeState(DT_ALT_UNIT_ID)))).toBe(
      'DD-MM-YYYY HH:MM'
    )
  })

  it('selectActiveDateTimeFormat falls back to the is_base format when the column has no unit', () => {
    expect(selectActiveDateTimeFormat(wrap(buildDateTimeState(null)))).toBe('MM/DD/YYYY HH:MM')
  })

  it('selectActiveDateTimeFormat falls back to is_base when the column unit is unknown', () => {
    expect(selectActiveDateTimeFormat(wrap(buildDateTimeState(9999)))).toBe('MM/DD/YYYY HH:MM')
  })

  it('selectActiveDateTimeFormat falls back to is_base before any scenario is active', () => {
    let state = initialState
    state = projectScreenReducer(
      state,
      actions.loadDataTypesSucceeded([sampleTypes[0], dateTimeType])
    )
    // No active scenario → no date-time column to read → base format.
    expect(selectActiveDateTimeFormat(wrap(state))).toBe('MM/DD/YYYY HH:MM')
  })

  it('selectActiveDateTimeFormat returns "" when the catalog has no date_time type', () => {
    expect(
      selectActiveDateTimeFormat(wrap(buildDateTimeState(DT_ALT_UNIT_ID, { withDateTimeType: false })))
    ).toBe('')
  })

  it('selectActiveDateTimeFormat returns "" when date_time has no base unit and the column unit is unknown', () => {
    const noBase: DataTypeDef = {
      ...dateTimeType,
      units: [dtUnit(DT_ALT_UNIT_ID, 'DD-MM-YYYY HH:MM', false)]
    }
    expect(selectActiveDateTimeFormat(wrap(buildDateTimeState(9999, { dtType: noBase })))).toBe('')
  })
})
