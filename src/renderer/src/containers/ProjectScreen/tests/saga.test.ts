import { call } from 'redux-saga/effects'
import projectScreenSaga, { clearPersistedIdsOnHome } from '../saga'
// Unit tests for the ProjectScreen saga: drives the REAL worker generators to
// completion (via runSaga) and asserts the actions they dispatch and the service
// calls they make, mocking only the containers/Weather/service boundary. It does
// NOT hand-mirror workers as local `function* worker()` copies — the real
// saga.ts executes on every test, so coverage and regression signal are genuine.
//
// The workers are module-private, so instead of exporting them we harvest them
// from the root saga: `projectScreenSaga` yields ForkEffects from
// takeLatest/takeEvery whose `payload.args` is `[actionType, workerFn]`; we step
// the root generator and key each real workerFn by its action type.

import { runSaga, stdChannel } from 'redux-saga'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import  { updateColumnWorker } from '../saga'
import * as actions from '../actions'
import { initialState } from '../reducer'
import { ApiError } from 'utils/api'
import { STORAGE_KEYS } from 'utils/storageKeys'
import { navigate } from 'store/navigationReducer'
import {
  ADD_COLUMN_REQUESTED,
  ADD_ROW_REQUESTED,
  DELETE_COLUMN_REQUESTED,
  DELETE_ROW_REQUESTED,
  LIST_SCENARIOS_REQUESTED,
  LOAD_DATA_TYPES_REQUESTED,
  LOAD_MATERIAL_TYPES_REQUESTED,
  LOAD_MODEL_TYPES_REQUESTED,
  LOAD_OBJECT_TYPES_REQUESTED,
  LOAD_DATA_TYPES_SUCCEEDED,
  LOAD_SCENARIO_FAILED,
  LOAD_SCENARIO_REQUESTED,
  LOAD_SCENARIO_SUCCEEDED,
  SEED_DEFAULT_COLUMNS_REQUESTED,
  UPDATE_ALL_CHECKBOXES_REQUESTED,
  UPDATE_CELL_LOCAL,
  UPDATE_COLUMN_REQUESTED,
  UPDATE_PROJECT_REQUESTED
} from '../constants'
import { NAVIGATE } from 'store/navigationReducer'

import type { DataTypeDef, DataUnitDef, ProjectMetadata, WeatherTable } from '../types'

// ── Mock ONLY the service boundary ───────────────────────────────────────────
// normalizeWireCellValue (a pure helper the load worker uses) is preserved from
// the real module via importOriginal so row normalization runs for real.
vi.mock('containers/Weather/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('containers/Weather/service')>()
  return {
    ...actual,
    loadDataTypesRequest: vi.fn(),
    getProjectRequest: vi.fn(),
    updateProjectRequest: vi.fn(),
    loadHeadersRequest: vi.fn(),
    loadDataRequest: vi.fn(),
    addColumnsRequest: vi.fn(),
    addColumnRequest: vi.fn(),
    addRowsRequest: vi.fn(),
    deleteHeaderRequest: vi.fn(),
    deleteRowsRequest: vi.fn(),
    patchHeaderRequest: vi.fn(),
    updateColumnRequest: vi.fn(),
    updateCellRequest: vi.fn()
  }
})
import * as service from 'containers/Weather/service'

// ── Constants ────────────────────────────────────────────────────────────────

const PROJ = 'project-1'
const SCN = 'scenario-1'

describe('projectScreenSaga (root watcher)', () => {
  it('registers a watcher for every request action type the screen handles', () => {
    const gen = projectScreenSaga()
    const expected = [
      LOAD_DATA_TYPES_REQUESTED,
      LOAD_OBJECT_TYPES_REQUESTED,
      LOAD_MATERIAL_TYPES_REQUESTED,
      LOAD_MODEL_TYPES_REQUESTED,
      UPDATE_PROJECT_REQUESTED,
      LIST_SCENARIOS_REQUESTED,
      LOAD_SCENARIO_REQUESTED,
      SEED_DEFAULT_COLUMNS_REQUESTED,
      ADD_ROW_REQUESTED,
      ADD_COLUMN_REQUESTED,
      UPDATE_COLUMN_REQUESTED,
      DELETE_COLUMN_REQUESTED,
      DELETE_ROW_REQUESTED,
      UPDATE_ALL_CHECKBOXES_REQUESTED,
      UPDATE_CELL_LOCAL,
      NAVIGATE
    ]
    const seen = new Set<string>()
    for (let i = 0; i < expected.length; i++) {
      const step = gen.next()
      const serialised = JSON.stringify(step.value)
      for (const t of expected) if (serialised.includes(t)) seen.add(t)
    }
    expect(gen.next().done).toBe(true)
    for (const t of expected) expect(seen).toContain(t)
  })
})

const kelvin: DataUnitDef = {
  id: 5,
  unit: 'K',
  alias: '',
  data_type_id: 1,
  min: null,
  max: null,
  to_base_factor: 1,
  to_base_offset: 0,
  is_base: true,
  created_at: '',
  updated_at: ''
}
const celsius: DataUnitDef = {
  id: 6,
  unit: 'C',
  alias: '°C',
  data_type_id: 1,
  min: null,
  max: null,
  to_base_factor: 1,
  to_base_offset: 273.15,
  is_base: false,
  created_at: '',
  updated_at: ''
}
const temperature: DataTypeDef = {
  id: 1,
  data_type: 'air_temperature',
  description: '',
  created_at: '',
  updated_at: '',
  units: [kelvin, celsius]
}
const checkType: DataTypeDef = {
  id: 2,
  data_type: 'check',
  description: '',
  created_at: '',
  updated_at: '',
  units: []
}
const dtBaseUnit: DataUnitDef = {
  id: 30,
  unit: 'MM/DD/YYYY',
  alias: '',
  data_type_id: 3,
  min: null,
  max: null,
  to_base_factor: 1,
  to_base_offset: 0,
  is_base: true,
  created_at: '',
  updated_at: ''
}
const dateTimeType: DataTypeDef = {
  id: 3,
  data_type: 'date_time',
  description: '',
  created_at: '',
  updated_at: '',
  units: [dtBaseUnit]
}
const CATALOG: DataTypeDef[] = [temperature, checkType, dateTimeType]

// ── clearPersistedIdsOnHome ──────────────────────────────────────────────────

describe('clearPersistedIdsOnHome', () => {
  it('removes both persisted ids when navigating to home', () => {
    const gen = clearPersistedIdsOnHome(navigate('home'))
    expect(gen.next().value).toEqual(
      call([localStorage, 'removeItem'], STORAGE_KEYS.activeProjectId)
    )
    expect(gen.next().value).toEqual(
      call([localStorage, 'removeItem'], STORAGE_KEYS.activeScenarioId)
    )
    expect(gen.next().done).toBe(true)
  })

  it('removes nothing when navigating anywhere other than home', () => {
    // The guard is what stops a navigate('project') — fired on every open —
    // from wiping the ids the screen depends on. Without it this saga would
    // clear the project id the moment the project screen is shown.
    const gen = clearPersistedIdsOnHome(navigate('project'))
    expect(gen.next().done).toBe(true)
  })
})

// ── loadDataTypesWorker ──────────────────────────────────────────────────────

interface StateOverrides {
  dataTypes?: DataTypeDef[]
  loadStatus?: 'idle' | 'loading' | 'loaded' | 'error'
  activeScenarioId?: string | null
  byScenario?: Record<string, WeatherTable>
}

function buildState(o: StateOverrides = {}): { projectScreen: typeof initialState } {
  const byId: Record<number, DataTypeDef> = {}
  const allIds: number[] = []
  for (const dt of o.dataTypes ?? []) {
    byId[dt.id] = dt
    allIds.push(dt.id)
  }
  return {
    projectScreen: {
      ...initialState,
      catalog: {
        // Spread first so the object/material/model-type slices keep their
        // initial values — this helper only ever overrides dataTypes, and
        // replacing the whole slice would drop the three the catalog gained.
        ...initialState.catalog,
        dataTypes: { byId, allIds, loadStatus: o.loadStatus ?? 'loaded', loadError: null }
      },
      activeProjectId: PROJ,
      activeScenarioId: o.activeScenarioId ?? null,
      byScenario: o.byScenario ?? {}
    }
  }
}

function makeTable(over: Partial<WeatherTable> = {}): WeatherTable {
  return {
    columns: {},
    columnOrder: [],
    rows: {},
    rowOrder: [],
    validationErrors: {},
    columnNameErrors: {},
    cellSync: {},
    rowSelection: {},
    ...over
  }
}

// ── runSaga driver ───────────────────────────────────────────────────────────

type Worker = (action: { type: string; payload?: unknown }) => Generator
type Action = { type: string; payload?: unknown }

function realWorkers(): Record<string, Worker> {
  const gen = projectScreenSaga()
  const map: Record<string, Worker> = {}
  for (let s = gen.next(); !s.done; s = gen.next()) {
    const args = (s.value as { payload?: { args?: unknown[] } })?.payload?.args
    if (Array.isArray(args) && typeof args[1] === 'function') {
      map[String(args[0])] = args[1] as Worker
    }
  }
  return map
}

const W = realWorkers()

function drive(
  worker: Worker,
  action: Action,
  state: unknown = buildState()
): { task: ReturnType<typeof runSaga>; dispatched: Action[]; emit: (a: Action) => void } {
  const dispatched: Action[] = []
  const channel = stdChannel()
  const task = runSaga(
    {
      channel,
      dispatch: (a: Action) => {
        dispatched.push(a)
      },
      getState: () => state
    },
    worker,
    action
  )
  return { task, dispatched, emit: (a: Action) => channel.put(a) }
}

// Flush pending microtasks (mocked promise resolutions) so a blocking worker
// reaches its `take`/`race` before we emit the awaited action.
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetAllMocks()
})

// ── Extraction sanity: the harvested fn IS the real exported worker ──────────

describe('worker extraction', () => {
  it('harvests real worker fns keyed by action type (updateColumnWorker matches the export)', () => {
    // One entry per takeEvery/takeLatest in the root watcher. Was 12 before M2
    // added the object/material/model-type loaders and the checkbox worker; the
    // count is asserted so a watcher silently dropped from the root saga fails
    // here rather than in whichever feature quietly stops responding.
    expect(Object.keys(W).length).toBe(16)
    expect(W[UPDATE_COLUMN_REQUESTED]).toBe(updateColumnWorker)
  })
})

// ── loadDataTypesWorker ──────────────────────────────────────────────────────

describe('loadDataTypesWorker (real)', () => {
  it('GETs the catalog and dispatches loadDataTypesSucceeded with the data types', async () => {
    vi.mocked(service.loadDataTypesRequest).mockResolvedValue({ data_types: CATALOG })
    const { task, dispatched } = drive(W[LOAD_DATA_TYPES_REQUESTED], actions.loadDataTypesRequested())
    await task.toPromise()

    expect(vi.mocked(service.loadDataTypesRequest)).toHaveBeenCalledTimes(1)
    expect(dispatched).toContainEqual(actions.loadDataTypesSucceeded(CATALOG))
  })

  it('dispatches loadDataTypesFailed with the error message on rejection', async () => {
    vi.mocked(service.loadDataTypesRequest).mockRejectedValue(new Error('catalog down'))
    const { task, dispatched } = drive(W[LOAD_DATA_TYPES_REQUESTED], actions.loadDataTypesRequested())
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.loadDataTypesFailed('catalog down'))
  })
})

// ── listScenariosWorker ──────────────────────────────────────────────────────

describe('listScenariosWorker (real)', () => {
  const project = {
    id: PROJ,
    name: 'Project One',
    latitude: 12.5,
    longitude: 77.5,
    utc_offset: '+05:30',
    created_at: '',
    updated_at: '',
    scenarios: [
      {
        id: SCN,
        name: 'Scenario One',
        has_weather: true,
        created_at: '',
        updated_at: '',
        weather_data_headers: []
      }
    ]
  }
  const meta: ProjectMetadata = {
    id: PROJ,
    name: 'Project One',
    latitude: 12.5,
    longitude: 77.5,
    utc_offset: '+05:30'
  }

  it('dispatches loadProject → listScenarios → setActiveScenario(first) → loadScenarioRequested and persists the id', async () => {
    vi.mocked(service.getProjectRequest).mockResolvedValue({ project })
    const { task, dispatched } = drive(W[LIST_SCENARIOS_REQUESTED], actions.listScenariosRequested(PROJ))
    await task.toPromise()

    expect(vi.mocked(service.getProjectRequest)).toHaveBeenCalledWith(PROJ)
    expect(dispatched).toContainEqual(actions.loadProjectSucceeded(meta))
    expect(dispatched).toContainEqual(actions.listScenariosSucceeded(PROJ, project.scenarios))
    expect(dispatched).toContainEqual(actions.setActiveScenario(SCN))
    expect(dispatched).toContainEqual(actions.loadScenarioRequested(PROJ, SCN))
    expect(localStorage.getItem(STORAGE_KEYS.activeScenarioId)).toBe(SCN)
  })

  it('returns after the metadata + list when the project has no scenarios (no setActiveScenario)', async () => {
    vi.mocked(service.getProjectRequest).mockResolvedValue({
      project: { ...project, scenarios: [] }
    })
    const { task, dispatched } = drive(W[LIST_SCENARIOS_REQUESTED], actions.listScenariosRequested(PROJ))
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.listScenariosSucceeded(PROJ, []))
    expect(dispatched.some((a) => a.type === actions.setActiveScenario(SCN).type)).toBe(false)
  })

  it('on a 4xx ApiError: dispatches listScenariosFailed and bounces to home', async () => {
    vi.mocked(service.getProjectRequest).mockRejectedValue(new ApiError(404, 'Not found'))
    const { task, dispatched } = drive(W[LIST_SCENARIOS_REQUESTED], actions.listScenariosRequested(PROJ))
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.listScenariosFailed(PROJ, 'Not found'))
    expect(dispatched).toContainEqual(navigate('home'))
    expect(localStorage.getItem(STORAGE_KEYS.activeProjectId)).toBeNull()
  })

  it('on a 5xx ApiError: dispatches listScenariosFailed but does NOT bounce', async () => {
    vi.mocked(service.getProjectRequest).mockRejectedValue(new ApiError(500, 'Server down'))
    const { task, dispatched } = drive(W[LIST_SCENARIOS_REQUESTED], actions.listScenariosRequested(PROJ))
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.listScenariosFailed(PROJ, 'Server down'))
    expect(dispatched.some((a) => a.type === navigate('home').type)).toBe(false)
  })
})

// ── updateProjectWorker ──────────────────────────────────────────────────────

describe('updateProjectWorker (real)', () => {
  const project = {
    id: PROJ,
    name: 'Project One',
    latitude: 23.5,
    longitude: 77.5,
    utc_offset: '+05:00',
    created_at: '',
    updated_at: '',
    scenarios: []
  }

  it('PATCHes, refetches the project, then dispatches updateProjectSucceeded with the fresh metadata', async () => {
    vi.mocked(service.updateProjectRequest).mockResolvedValue('ok')
    vi.mocked(service.getProjectRequest).mockResolvedValue({ project })
    const { task, dispatched } = drive(
      W[UPDATE_PROJECT_REQUESTED],
      actions.updateProjectRequested(PROJ, { latitude: 23.5 })
    )
    await task.toPromise()

    expect(vi.mocked(service.updateProjectRequest)).toHaveBeenCalledWith(PROJ, { latitude: 23.5 })
    expect(dispatched).toContainEqual(
      actions.updateProjectSucceeded({
        id: PROJ,
        name: 'Project One',
        latitude: 23.5,
        longitude: 77.5,
        utc_offset: '+05:00'
      })
    )
  })

  it('on a 4xx ApiError: dispatches updateProjectFailed and bounces to home', async () => {
    vi.mocked(service.updateProjectRequest).mockRejectedValue(new ApiError(403, 'Forbidden'))
    const { task, dispatched } = drive(
      W[UPDATE_PROJECT_REQUESTED],
      actions.updateProjectRequested(PROJ, { name: 'x' })
    )
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.updateProjectFailed(PROJ, 'Forbidden'))
    expect(dispatched).toContainEqual(navigate('home'))
  })

  it('on a 5xx ApiError: dispatches updateProjectFailed but does NOT bounce', async () => {
    vi.mocked(service.updateProjectRequest).mockRejectedValue(new ApiError(500, 'boom'))
    const { task, dispatched } = drive(
      W[UPDATE_PROJECT_REQUESTED],
      actions.updateProjectRequested(PROJ, { name: 'x' })
    )
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.updateProjectFailed(PROJ, 'boom'))
    expect(dispatched.some((a) => a.type === navigate('home').type)).toBe(false)
  })
})

// ── loadScenarioWorker (+ fetchHeaders, revalidateScenarioColumns, revalidateColumn) ──

describe('loadScenarioWorker (real)', () => {
  const header7 = {
    id: 7,
    scenario_id: SCN,
    name: 'temp',
    helios_data_type_id: 1,
    unit_id: 5,
    status: true,
    display_order: 0,
    created_at: '',
    updated_at: ''
  }

  it('empty headers + empty rows: seeds default columns and does NOT render', async () => {
    vi.mocked(service.loadHeadersRequest).mockResolvedValue({ success: true, count: 0, headers: [] })
    vi.mocked(service.loadDataRequest).mockResolvedValue({
      success: true,
      labels: [],
      row_count: 0,
      total_rows: 0,
      column_count: 0,
      offset: 0,
      limit: null,
      rows: []
    })
    const { task, dispatched } = drive(
      W[LOAD_SCENARIO_REQUESTED],
      actions.loadScenarioRequested(PROJ, SCN)
    )
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.seedDefaultColumnsRequested(PROJ, SCN))
    expect(dispatched.some((a) => a.type === LOAD_SCENARIO_SUCCEEDED)).toBe(false)
  })

  it('populated: fetches headers, renders merged columns/rows, and revalidates each configured column', async () => {
    vi.mocked(service.loadHeadersRequest).mockResolvedValue({
      success: true,
      count: 1,
      headers: [header7]
    })
    vi.mocked(service.loadDataRequest).mockResolvedValue({
      success: true,
      labels: ['date', 'time', '7'],
      row_count: 1,
      total_rows: 1,
      column_count: 3,
      offset: 0,
      limit: null,
      rows: [{ date: '2026-01-01', time: '10:00:00', '7': 300 }]
    })

    const stateTable = makeTable({
      columns: {
        date: { id: 'date', name: 'date', dataTypeId: null, unitId: null },
        time: { id: 'time', name: 'time', dataTypeId: null, unitId: null },
        '7': { id: '7', name: 'temp', dataTypeId: 1, unitId: 5 }
      },
      columnOrder: ['date', 'time', '7'],
      rows: { row_0: { date: '2026-01-01', time: '10:00:00', '7': '300' } },
      rowOrder: ['row_0']
    })
    const state = buildState({ dataTypes: CATALOG, activeScenarioId: SCN, byScenario: { [SCN]: stateTable } })

    const { task, dispatched } = drive(W[LOAD_SCENARIO_REQUESTED], actions.loadScenarioRequested(PROJ, SCN), state)
    await task.toPromise()

    // fetchHeaders routed the raw headers into the headers slice.
    expect(dispatched).toContainEqual(actions.loadHeadersRequested(PROJ, SCN))
    expect(dispatched).toContainEqual(actions.loadHeadersSucceeded(SCN, [header7]))

    // Merged render: date/time pseudo-columns first, then the joined header.
    expect(dispatched).toContainEqual(
      actions.loadScenarioSucceeded({
        projectId: PROJ,
        scenarioId: SCN,
        columns: [
          { id: 'date', name: 'date', dataTypeId: null, unitId: null },
          { id: 'time', name: 'time', dataTypeId: null, unitId: null },
          { id: '7', name: 'temp', dataTypeId: 1, unitId: 5 }
        ],
        rows: [{ date: '2026-01-01', time: '10:00:00', '7': '300' }],
        precisionNormalized: false
      })
    )

    // revalidateScenarioColumns → revalidateColumn dispatched the per-column result.
    expect(dispatched).toContainEqual(actions.setColumnValidationErrors(SCN, '7', { row_0: null }))
  })

  it('backfills a stale date-time header (null type/unit) with an updateColumnRequested patch', async () => {
    const staleDateTime = {
      id: 8,
      scenario_id: SCN,
      name: 'date-time',
      helios_data_type_id: null as unknown as number,
      unit_id: null as unknown as number,
      status: true,
      display_order: 0,
      created_at: '',
      updated_at: ''
    }
    vi.mocked(service.loadHeadersRequest).mockResolvedValue({
      success: true,
      count: 1,
      headers: [staleDateTime]
    })
    vi.mocked(service.loadDataRequest).mockResolvedValue({
      success: true,
      labels: ['date', 'time', '8'],
      row_count: 1,
      total_rows: 1,
      column_count: 3,
      offset: 0,
      limit: null,
      rows: [{ date: '2026-01-01', time: '10:00:00', '8': 0 }]
    })
    // No byScenario table → revalidateScenarioColumns is a no-op, keeping this focused on backfill.
    const state = buildState({ dataTypes: CATALOG, activeScenarioId: SCN })

    const { task, dispatched } = drive(W[LOAD_SCENARIO_REQUESTED], actions.loadScenarioRequested(PROJ, SCN), state)
    await task.toPromise()

    expect(dispatched).toContainEqual(
      actions.updateColumnRequested(
        PROJ,
        SCN,
        '8',
        { dataTypeId: 3, unitId: 30 },
        { dataTypeId: null, unitId: null }
      )
    )
    expect(dispatched.some((a) => a.type === LOAD_SCENARIO_SUCCEEDED)).toBe(true)
  })

  it('catalog still loading: blocks on LOAD_DATA_TYPES before merging, and again before revalidation', async () => {
    vi.mocked(service.loadHeadersRequest).mockResolvedValue({
      success: true,
      count: 1,
      headers: [header7]
    })
    vi.mocked(service.loadDataRequest).mockResolvedValue({
      success: true,
      labels: ['date', 'time', '7'],
      row_count: 1,
      total_rows: 1,
      column_count: 3,
      offset: 0,
      limit: null,
      rows: [{ date: '2026-01-01', time: '10:00:00', '7': 300 }]
    })
    const stateTable = makeTable({
      columns: { '7': { id: '7', name: 'temp', dataTypeId: 1, unitId: 5 } },
      columnOrder: ['7'],
      rows: { row_0: { date: '2026-01-01', time: '10:00:00', '7': '300' } },
      rowOrder: ['row_0']
    })
    // loadStatus 'loading' forces BOTH catalog gates (in loadScenarioWorker and
    // in revalidateScenarioColumns) to `take` — each is unblocked by an emit.
    const state = buildState({
      dataTypes: CATALOG,
      loadStatus: 'loading',
      activeScenarioId: SCN,
      byScenario: { [SCN]: stateTable }
    })
    const { task, dispatched, emit } = drive(
      W[LOAD_SCENARIO_REQUESTED],
      actions.loadScenarioRequested(PROJ, SCN),
      state
    )
    await settle()
    emit({ type: LOAD_DATA_TYPES_SUCCEEDED, payload: [] }) // unblocks the merge gate
    await settle()
    emit({ type: LOAD_DATA_TYPES_SUCCEEDED, payload: [] }) // unblocks the revalidation gate
    await task.toPromise()

    expect(dispatched.some((a) => a.type === LOAD_SCENARIO_SUCCEEDED)).toBe(true)
    expect(dispatched).toContainEqual(actions.setColumnValidationErrors(SCN, '7', { row_0: null }))
  })

  it('on a 4xx header fetch error: dispatches loadHeadersFailed + loadScenarioFailed and bounces to home', async () => {
    vi.mocked(service.loadHeadersRequest).mockRejectedValue(new ApiError(404, 'gone'))
    vi.mocked(service.loadDataRequest).mockResolvedValue({
      success: true,
      labels: [],
      row_count: 0,
      total_rows: 0,
      column_count: 0,
      offset: 0,
      limit: null,
      rows: []
    })
    const { task, dispatched } = drive(
      W[LOAD_SCENARIO_REQUESTED],
      actions.loadScenarioRequested(PROJ, SCN)
    )
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.loadHeadersFailed(SCN, 'gone'))
    expect(dispatched).toContainEqual(actions.loadScenarioFailed(PROJ, SCN, 'gone'))
    expect(dispatched).toContainEqual(navigate('home'))
  })
})

// ── seedDefaultColumnsWorker (+ waitForScenarioLoad) ─────────────────────────

describe('seedDefaultColumnsWorker (real)', () => {
  it('race succeeded: POSTs check + date-time with resolved ids, then dispatches seedDefaultColumnsSucceeded', async () => {
    vi.mocked(service.addColumnsRequest).mockResolvedValue({ columns: [] })
    const { task, dispatched, emit } = drive(
      W[SEED_DEFAULT_COLUMNS_REQUESTED],
      actions.seedDefaultColumnsRequested(PROJ, SCN),
      buildState({ dataTypes: CATALOG, loadStatus: 'loaded' })
    )
    await settle()
    emit({ type: LOAD_SCENARIO_SUCCEEDED, payload: { scenarioId: SCN } })
    await task.toPromise()

    expect(vi.mocked(service.addColumnsRequest)).toHaveBeenCalledWith(PROJ, SCN, [
      { name: 'check', dataTypeId: 2, dataUnitId: null, values: [] },
      { name: 'date-time', dataTypeId: 3, dataUnitId: 30, values: [] }
    ])
    expect(dispatched).toContainEqual(actions.loadScenarioRequested(PROJ, SCN))
    expect(dispatched).toContainEqual(actions.seedDefaultColumnsSucceeded(PROJ, SCN))
  })

  it('race failed: dispatches seedDefaultColumnsFailed carrying the load error', async () => {
    vi.mocked(service.addColumnsRequest).mockResolvedValue({ columns: [] })
    const { task, dispatched, emit } = drive(
      W[SEED_DEFAULT_COLUMNS_REQUESTED],
      actions.seedDefaultColumnsRequested(PROJ, SCN),
      buildState({ dataTypes: CATALOG, loadStatus: 'loaded' })
    )
    await settle()
    emit({ type: LOAD_SCENARIO_FAILED, payload: { scenarioId: SCN, error: 'header fetch 500' } })
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.seedDefaultColumnsFailed(PROJ, SCN, 'header fetch 500'))
    expect(dispatched.some((a) => a.type === actions.seedDefaultColumnsSucceeded(PROJ, SCN).type)).toBe(
      false
    )
  })

  it('catalog still loading: blocks on the catalog action, then fails from the addColumns rejection', async () => {
    vi.mocked(service.addColumnsRequest).mockRejectedValue(new Error('seed boom'))
    const { task, dispatched, emit } = drive(
      W[SEED_DEFAULT_COLUMNS_REQUESTED],
      actions.seedDefaultColumnsRequested(PROJ, SCN),
      buildState({ dataTypes: CATALOG, loadStatus: 'loading' })
    )
    // Unblock the `take([LOAD_DATA_TYPES_SUCCEEDED, LOAD_DATA_TYPES_FAILED])`.
    await settle()
    emit({ type: LOAD_DATA_TYPES_SUCCEEDED, payload: [] })
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.seedDefaultColumnsFailed(PROJ, SCN, 'seed boom'))
  })
})

// ── addRowWorker (+ buildRowsForAdd, waitForScenarioLoad) ────────────────────

describe('addRowWorker (real)', () => {
  const tableWithDateTime = makeTable({
    columns: {
      date: { id: 'date', name: 'date', dataTypeId: null, unitId: null },
      time: { id: 'time', name: 'time', dataTypeId: null, unitId: null },
      '7': { id: '7', name: 'temp', dataTypeId: 1, unitId: 5 },
      '99': { id: '99', name: 'check', dataTypeId: 2, unitId: null }
    },
    columnOrder: ['date', 'time', '7', '99']
  })
  const state = buildState({ activeScenarioId: SCN, byScenario: { [SCN]: tableWithDateTime } })

  it('fails fast when (date, time) does not parse — no network call', async () => {
    const action = actions.addRowRequested(PROJ, SCN, 'not-a-date', '10:00', ['date', 'time', '7'], 2, 1)
    const { task, dispatched } = drive(W[ADD_ROW_REQUESTED], action, state)
    await task.toPromise()

    expect(dispatched).toContainEqual(
      actions.addRowFailed(PROJ, SCN, 'Invalid start date / time / delta — could not build rows.')
    )
    expect(vi.mocked(service.addRowsRequest)).not.toHaveBeenCalled()
  })

  it('success: expands rows client-side (check→"1", data→"NAN"), POSTs them, and dispatches addRowSucceeded after the reload', async () => {
    vi.mocked(service.addRowsRequest).mockResolvedValue({ success: true })
    const action = actions.addRowRequested(PROJ, SCN, '2026-04-27', '10:00', ['date', 'time', '7', '99'], 2, 1)
    const { task, dispatched, emit } = drive(W[ADD_ROW_REQUESTED], action, state)
    await settle()
    emit({ type: LOAD_SCENARIO_SUCCEEDED, payload: { scenarioId: SCN } })
    await task.toPromise()

    expect(vi.mocked(service.addRowsRequest)).toHaveBeenCalledWith(PROJ, SCN, {
      rows: [
        { date: '2026-04-27', time: '10:00:00', '7': 'NAN', '99': '1' },
        { date: '2026-04-27', time: '11:00:00', '7': 'NAN', '99': '1' }
      ]
    })
    expect(dispatched).toContainEqual(actions.loadScenarioRequested(PROJ, SCN))
    expect(dispatched).toContainEqual(actions.addRowSucceeded(PROJ, SCN))
  })

  it('load-failed after POST: dispatches addRowFailed carrying the reload error', async () => {
    vi.mocked(service.addRowsRequest).mockResolvedValue({ success: true })
    const action = actions.addRowRequested(PROJ, SCN, '2026-04-27', '10:00', ['date', 'time', '7'], 1, 1)
    const { task, dispatched, emit } = drive(W[ADD_ROW_REQUESTED], action, state)
    await settle()
    emit({ type: LOAD_SCENARIO_FAILED, payload: { scenarioId: SCN, error: 'reload 500' } })
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.addRowFailed(PROJ, SCN, 'reload 500'))
  })

  it('service rejection: dispatches addRowFailed with the error message', async () => {
    vi.mocked(service.addRowsRequest).mockRejectedValue(new Error('addRow boom'))
    const action = actions.addRowRequested(PROJ, SCN, '2026-04-27', '10:00', ['date', 'time', '7'], 1, 1)
    const { task, dispatched } = drive(W[ADD_ROW_REQUESTED], action, state)
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.addRowFailed(PROJ, SCN, 'addRow boom'))
  })
})

// ── addColumnWorker ──────────────────────────────────────────────────────────

describe('addColumnWorker (real)', () => {
  const newCol = { id: '9', name: 'humidity', dataTypeId: 3, unitId: 4 }

  it('with a default value: back-fills (date, time, value) for every complete row (skips incomplete)', async () => {
    vi.mocked(service.addColumnRequest).mockResolvedValue({ column: newCol })
    const table = makeTable({
      rows: {
        row_0: { date: '2026-04-27', time: '10:00:00' },
        row_1: { date: '2026-04-27', time: '11:00:00' },
        row_2: { date: '2026-04-27', time: null }
      },
      rowOrder: ['row_0', 'row_1', 'row_2']
    })
    const state = buildState({ activeScenarioId: SCN, byScenario: { [SCN]: table } })
    const action = actions.addColumnRequested(PROJ, SCN, 'humidity', 3, 4, '65')
    const { task, dispatched } = drive(W[ADD_COLUMN_REQUESTED], action, state)
    await task.toPromise()

    expect(vi.mocked(service.addColumnRequest)).toHaveBeenCalledWith(PROJ, SCN, {
      name: 'humidity',
      dataTypeId: 3,
      dataUnitId: 4,
      values: [
        { date: '2026-04-27', time: '10:00:00', value: '65' },
        { date: '2026-04-27', time: '11:00:00', value: '65' }
      ],
      defaultValue: '65'
    })
    expect(dispatched).toContainEqual(actions.addColumnSucceeded(PROJ, SCN, newCol, '65'))
  })

  it('with an empty default value: sends values=[] and defaultValue "NAN"', async () => {
    vi.mocked(service.addColumnRequest).mockResolvedValue({ column: newCol })
    const table = makeTable({
      rows: { row_0: { date: '2026-04-27', time: '10:00:00' } },
      rowOrder: ['row_0']
    })
    const state = buildState({ activeScenarioId: SCN, byScenario: { [SCN]: table } })
    const action = actions.addColumnRequested(PROJ, SCN, 'humidity', 3, 4, '')
    const { task, dispatched } = drive(W[ADD_COLUMN_REQUESTED], action, state)
    await task.toPromise()

    expect(vi.mocked(service.addColumnRequest)).toHaveBeenCalledWith(PROJ, SCN, {
      name: 'humidity',
      dataTypeId: 3,
      dataUnitId: 4,
      values: [],
      defaultValue: 'NAN'
    })
    expect(dispatched).toContainEqual(actions.addColumnSucceeded(PROJ, SCN, newCol, ''))
  })

  it('service rejection: dispatches addColumnFailed', async () => {
    vi.mocked(service.addColumnRequest).mockRejectedValue(new Error('addCol boom'))
    const action = actions.addColumnRequested(PROJ, SCN, 'humidity', 3, 4, '')
    const { task, dispatched } = drive(
      W[ADD_COLUMN_REQUESTED],
      action,
      buildState({ activeScenarioId: SCN, byScenario: { [SCN]: makeTable() } })
    )
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.addColumnFailed(PROJ, SCN, 'addCol boom'))
  })
})

// ── updateColumnWorker (+ revalidateColumn) ──────────────────────────────────

describe('updateColumnWorker (real)', () => {
  const colTable = makeTable({
    columns: {
      date: { id: 'date', name: 'date', dataTypeId: null, unitId: null },
      time: { id: 'time', name: 'time', dataTypeId: null, unitId: null },
      '7': { id: '7', name: 'temp', dataTypeId: 1, unitId: 5 }
    },
    columnOrder: ['date', 'time', '7'],
    rows: { row_0: { date: '2026-01-01', time: '10:00:00', '7': '300' } },
    rowOrder: ['row_0']
  })
  const configuredState = buildState({
    dataTypes: CATALOG,
    activeScenarioId: SCN,
    byScenario: { [SCN]: colTable }
  })

  it('name/type change: PATCHes snake_case wire, succeeds, then revalidates the column', async () => {
    vi.mocked(service.patchHeaderRequest).mockResolvedValue('ok')
    const action = actions.updateColumnRequested(
      PROJ,
      SCN,
      '7',
      { name: 'temperature', dataTypeId: 9, unitId: 11 },
      { name: 'temp', dataTypeId: 1, unitId: 5 }
    )
    const { task, dispatched } = drive(W[UPDATE_COLUMN_REQUESTED], action, configuredState)
    await task.toPromise()

    expect(vi.mocked(service.patchHeaderRequest)).toHaveBeenCalledWith(PROJ, SCN, 7, {
      name: 'temperature',
      helios_data_type_id: 9,
      unit_id: 11
    })
    expect(vi.mocked(service.updateColumnRequest)).not.toHaveBeenCalled()
    expect(dispatched).toContainEqual(actions.updateColumnSucceeded(PROJ, SCN, '7'))
    expect(dispatched).toContainEqual(actions.setColumnValidationErrors(SCN, '7', { row_0: null }))
  })

  it('non-numeric colId: dispatches updateColumnFailed("Column has no header id") without any network call', async () => {
    const action = actions.updateColumnRequested(PROJ, SCN, 'date', { name: 'x' }, { name: 'date' })
    const { task, dispatched } = drive(W[UPDATE_COLUMN_REQUESTED], action, configuredState)
    await task.toPromise()

    expect(dispatched).toContainEqual(
      actions.updateColumnFailed(PROJ, SCN, 'date', { name: 'date' }, 'Column has no header id')
    )
    expect(vi.mocked(service.patchHeaderRequest)).not.toHaveBeenCalled()
  })

  it('PATCH failure: dispatches updateColumnFailed with the previous snapshot for rollback', async () => {
    vi.mocked(service.patchHeaderRequest).mockRejectedValue(new Error('rejected'))
    const previous = { name: 'temp', dataTypeId: 1, unitId: 5 }
    const action = actions.updateColumnRequested(
      PROJ,
      SCN,
      '7',
      { name: 'temperature', dataTypeId: 9 },
      previous
    )
    const { task, dispatched } = drive(W[UPDATE_COLUMN_REQUESTED], action, configuredState)
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.updateColumnFailed(PROJ, SCN, '7', previous, 'rejected'))
  })

  it('unit-only conversion: optimistically writes converted values, PATCHes them via updateColumnRequest, then succeeds', async () => {
    vi.mocked(service.updateColumnRequest).mockResolvedValue('ok')
    const action = actions.updateColumnRequested(PROJ, SCN, '7', { unitId: 6 }, { unitId: 5 })
    const { task, dispatched } = drive(W[UPDATE_COLUMN_REQUESTED], action, configuredState)
    await task.toPromise()

    // 300 K → 26.85 °C, optimistic local write of the CONVERTED value.
    expect(dispatched).toContainEqual(
      actions.updateColumnValuesLocal({ scenarioId: SCN, colId: '7', valuesByRowId: { row_0: '26.85' } })
    )
    // Backend write carries the converted values + the NEW unit id.
    expect(vi.mocked(service.updateColumnRequest)).toHaveBeenCalledWith(PROJ, SCN, 7, {
      name: 'temp',
      dataTypeId: 1,
      dataUnitId: 6,
      values: [{ date: '2026-01-01', time: '10:00:00', value: '26.85' }],
      defaultValue: 'NAN'
    })
    expect(vi.mocked(service.patchHeaderRequest)).not.toHaveBeenCalled()
    expect(dispatched).toContainEqual(actions.updateColumnSucceeded(PROJ, SCN, '7'))
  })

  it('unit-only conversion failure: rolls back to the PRE-conversion values, then dispatches failed', async () => {
    vi.mocked(service.updateColumnRequest).mockRejectedValue(new Error('boom'))
    const action = actions.updateColumnRequested(PROJ, SCN, '7', { unitId: 6 }, { unitId: 5 })
    const { task, dispatched } = drive(W[UPDATE_COLUMN_REQUESTED], action, configuredState)
    await task.toPromise()

    // Rollback restores the original 300, not the converted 26.85.
    expect(dispatched).toContainEqual(
      actions.updateColumnValuesLocal({ scenarioId: SCN, colId: '7', valuesByRowId: { row_0: '300' } })
    )
    expect(dispatched).toContainEqual(actions.updateColumnFailed(PROJ, SCN, '7', { unitId: 5 }, 'boom'))
  })

  it('revalidation tolerates a null cell (validated as empty, not skipped)', async () => {
    vi.mocked(service.patchHeaderRequest).mockResolvedValue('ok')
    const nullCell = makeTable({
      columns: colTable.columns,
      columnOrder: colTable.columnOrder,
      rows: { row_0: { date: '2026-01-01', time: '10:00:00', '7': null } },
      rowOrder: ['row_0']
    })
    const nullCellState = buildState({
      dataTypes: CATALOG,
      activeScenarioId: SCN,
      byScenario: { [SCN]: nullCell }
    })
    const action = actions.updateColumnRequested(
      PROJ,
      SCN,
      '7',
      { name: 'temperature', dataTypeId: 9, unitId: 11 },
      { name: 'temp', dataTypeId: 1, unitId: 5 }
    )
    const { task, dispatched } = drive(W[UPDATE_COLUMN_REQUESTED], action, nullCellState)
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.setColumnValidationErrors(SCN, '7', { row_0: null }))
  })
})

// ── deleteColumnWorker ───────────────────────────────────────────────────────

describe('deleteColumnWorker (real)', () => {
  const snapshot = {
    column: { id: '7', name: 'temp', dataTypeId: 1, unitId: 2 },
    index: 2,
    rowValues: {},
    validationErrors: {},
    cellSync: {}
  }

  it('success: DELETEs the numeric header id and dispatches deleteColumnSucceeded', async () => {
    vi.mocked(service.deleteHeaderRequest).mockResolvedValue({ success: true, header_id: 7 })
    const action = actions.deleteColumnRequested(PROJ, SCN, '7', snapshot)
    const { task, dispatched } = drive(W[DELETE_COLUMN_REQUESTED], action)
    await task.toPromise()

    expect(vi.mocked(service.deleteHeaderRequest)).toHaveBeenCalledWith(PROJ, SCN, 7)
    expect(dispatched).toContainEqual(actions.deleteColumnSucceeded(PROJ, SCN, '7'))
  })

  it('non-numeric colId: dispatches deleteColumnFailed("Column has no header id") with no network call', async () => {
    const action = actions.deleteColumnRequested(PROJ, SCN, 'date', snapshot)
    const { task, dispatched } = drive(W[DELETE_COLUMN_REQUESTED], action)
    await task.toPromise()

    expect(dispatched).toContainEqual(
      actions.deleteColumnFailed(PROJ, SCN, 'date', snapshot, 'Column has no header id')
    )
    expect(vi.mocked(service.deleteHeaderRequest)).not.toHaveBeenCalled()
  })

  it('failure: dispatches deleteColumnFailed with the snapshot for rollback', async () => {
    vi.mocked(service.deleteHeaderRequest).mockRejectedValue(new Error('rejected'))
    const action = actions.deleteColumnRequested(PROJ, SCN, '7', snapshot)
    const { task, dispatched } = drive(W[DELETE_COLUMN_REQUESTED], action)
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.deleteColumnFailed(PROJ, SCN, '7', snapshot, 'rejected'))
  })
})

// ── deleteRowWorker ──────────────────────────────────────────────────────────

describe('deleteRowWorker (real)', () => {
  const snapshot = {
    cells: { date: '2026-04-27', time: '10:00:00', '7': '293' },
    index: 0,
    validationErrors: undefined,
    cellSync: {},
    selected: true
  }

  it('success: POSTs the [{ date, time }] key and dispatches deleteRowSucceeded', async () => {
    vi.mocked(service.deleteRowsRequest).mockResolvedValue('ok')
    const action = actions.deleteRowRequested(PROJ, SCN, 'row_0', '2026-04-27', '10:00:00', snapshot)
    const { task, dispatched } = drive(W[DELETE_ROW_REQUESTED], action)
    await task.toPromise()

    expect(vi.mocked(service.deleteRowsRequest)).toHaveBeenCalledWith(PROJ, SCN, [
      { date: '2026-04-27', time: '10:00:00' }
    ])
    expect(dispatched).toContainEqual(actions.deleteRowSucceeded(PROJ, SCN, 'row_0'))
  })

  it('failure: dispatches deleteRowFailed with the snapshot for rollback', async () => {
    vi.mocked(service.deleteRowsRequest).mockRejectedValue(new Error('rejected'))
    const action = actions.deleteRowRequested(PROJ, SCN, 'row_0', '2026-04-27', '10:00:00', snapshot)
    const { task, dispatched } = drive(W[DELETE_ROW_REQUESTED], action)
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.deleteRowFailed(PROJ, SCN, 'row_0', snapshot, 'rejected'))
  })
})

// ── updateCellWorker ─────────────────────────────────────────────────────────

describe('updateCellWorker (real)', () => {
  const cellTable = makeTable({
    columns: {
      date: { id: 'date', name: 'date', dataTypeId: null, unitId: null },
      time: { id: 'time', name: 'time', dataTypeId: null, unitId: null },
      '7': { id: '7', name: 'temp', dataTypeId: 1, unitId: 5 },
      '5': { id: '5', name: 'date-time', dataTypeId: null, unitId: null }
    },
    columnOrder: ['date', 'time', '7', '5'],
    rows: { row_0: { date: '2026-01-01', time: '10:00:00', '7': '293', '5': '0' } },
    rowOrder: ['row_0']
  })
  const state = buildState({ activeScenarioId: SCN, byScenario: { [SCN]: cellTable } })

  const cellAction = (over: Partial<{ colId: string; value: string; validationError: string | null }>) =>
    actions.updateCellLocal({
      projectId: PROJ,
      scenarioId: SCN,
      rowId: 'row_0',
      colId: '7',
      value: '300',
      validationError: null,
      ...over
    })

  it('non-numeric flagged input: short-circuits before any select/dispatch', async () => {
    const { task, dispatched } = drive(
      W[UPDATE_CELL_LOCAL],
      cellAction({ value: 'abc', validationError: 'must be a number' }),
      state
    )
    await task.toPromise()

    expect(dispatched).toEqual([])
    expect(vi.mocked(service.updateCellRequest)).not.toHaveBeenCalled()
  })

  it('DATE pseudo-column: short-circuits with no network call', async () => {
    const { task, dispatched } = drive(W[UPDATE_CELL_LOCAL], cellAction({ colId: 'date' }), state)
    await task.toPromise()

    expect(dispatched).toEqual([])
    expect(vi.mocked(service.updateCellRequest)).not.toHaveBeenCalled()
  })

  it('TIME pseudo-column: short-circuits with no network call', async () => {
    const { task, dispatched } = drive(W[UPDATE_CELL_LOCAL], cellAction({ colId: 'time' }), state)
    await task.toPromise()

    expect(dispatched).toEqual([])
    expect(vi.mocked(service.updateCellRequest)).not.toHaveBeenCalled()
  })

  it('merged date-time display column: short-circuits after reading the table', async () => {
    const { task, dispatched } = drive(W[UPDATE_CELL_LOCAL], cellAction({ colId: '5' }), state)
    await task.toPromise()

    expect(dispatched).toEqual([])
    expect(vi.mocked(service.updateCellRequest)).not.toHaveBeenCalled()
  })

  it('happy path: dispatches updateCellRequested, PATCHes the cell, then dispatches updateCellSucceeded', async () => {
    vi.mocked(service.updateCellRequest).mockResolvedValue({ success: true, updated_count: 1 })
    const { task, dispatched } = drive(W[UPDATE_CELL_LOCAL], cellAction({ colId: '7', value: '300' }), state)
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.updateCellRequested(PROJ, SCN, 'row_0', '7'))
    expect(vi.mocked(service.updateCellRequest)).toHaveBeenCalledWith(PROJ, SCN, {
      col: '7',
      row: { date: '2026-01-01', time: '10:00:00' },
      value: '300'
    })
    expect(dispatched).toContainEqual(actions.updateCellSucceeded(PROJ, SCN, 'row_0', '7'))
  })

  it('numeric but out-of-range (flagged): still persists the edit', async () => {
    vi.mocked(service.updateCellRequest).mockResolvedValue({ success: true, updated_count: 1 })
    const { task, dispatched } = drive(
      W[UPDATE_CELL_LOCAL],
      cellAction({ colId: '7', value: '300', validationError: 'too high' }),
      state
    )
    await task.toPromise()

    expect(vi.mocked(service.updateCellRequest)).toHaveBeenCalledWith(PROJ, SCN, {
      col: '7',
      row: { date: '2026-01-01', time: '10:00:00' },
      value: '300'
    })
    expect(dispatched).toContainEqual(actions.updateCellSucceeded(PROJ, SCN, 'row_0', '7'))
  })

  it('PATCH failure: dispatches updateCellFailed with the error message', async () => {
    vi.mocked(service.updateCellRequest).mockRejectedValue(new Error('cell boom'))
    const { task, dispatched } = drive(W[UPDATE_CELL_LOCAL], cellAction({ colId: '7', value: '300' }), state)
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.updateCellFailed(PROJ, SCN, 'row_0', '7', 'cell boom'))
  })

  it('rowId absent from the table: marks the cell pending, then bails before the PATCH', async () => {
    const { task, dispatched } = drive(
      W[UPDATE_CELL_LOCAL],
      actions.updateCellLocal({
        projectId: PROJ,
        scenarioId: SCN,
        rowId: 'row_ghost',
        colId: '7',
        value: '300',
        validationError: null
      }),
      state
    )
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.updateCellRequested(PROJ, SCN, 'row_ghost', '7'))
    expect(vi.mocked(service.updateCellRequest)).not.toHaveBeenCalled()
  })

  it('row missing a date/time: marks the cell pending, then bails before the PATCH', async () => {
    const nullDate = makeTable({
      columns: cellTable.columns,
      columnOrder: cellTable.columnOrder,
      rows: { row_0: { date: null, time: '10:00:00', '7': '293', '5': '0' } },
      rowOrder: ['row_0']
    })
    const nullDateState = buildState({ activeScenarioId: SCN, byScenario: { [SCN]: nullDate } })
    const { task, dispatched } = drive(W[UPDATE_CELL_LOCAL], cellAction({ colId: '7', value: '300' }), nullDateState)
    await task.toPromise()

    expect(dispatched).toContainEqual(actions.updateCellRequested(PROJ, SCN, 'row_0', '7'))
    expect(vi.mocked(service.updateCellRequest)).not.toHaveBeenCalled()
  })
})

// ── updateAllCheckboxesWorker ────────────────────────────────────────────────

describe('updateAllCheckboxesWorker (real)', () => {
  it('builds one timestamped value per complete row and PATCHes updateColumnRequest for the check column', async () => {
    vi.mocked(service.updateColumnRequest).mockResolvedValue('ok')
    const table = makeTable({
      columns: { '15': { id: '15', name: 'check', dataTypeId: null, unitId: null } },
      columnOrder: ['15'],
      rows: {
        row_0: { date: '2026-04-27', time: '10:00:00', '15': '0' },
        row_1: { date: '2026-04-27', time: '11:00:00', '15': '0' },
        row_2: { date: '2026-04-27', time: null, '15': '0' }
      },
      rowOrder: ['row_0', 'row_1', 'row_2']
    })
    const state = buildState({ activeScenarioId: SCN, byScenario: { [SCN]: table } })
    const action = actions.updateAllCheckboxesRequested(PROJ, SCN, '15', '1')
    const { task } = drive(W[UPDATE_ALL_CHECKBOXES_REQUESTED], action, state)
    await task.toPromise()

    expect(vi.mocked(service.updateColumnRequest)).toHaveBeenCalledWith(PROJ, SCN, 15, {
      name: 'check',
      values: [
        { date: '2026-04-27', time: '10:00:00', value: '1' },
        { date: '2026-04-27', time: '11:00:00', value: '1' }
      ]
    })
  })

  it('non-numeric checkColId: returns without any network call', async () => {
    const action = actions.updateAllCheckboxesRequested(PROJ, SCN, 'abc', '1')
    const { task } = drive(W[UPDATE_ALL_CHECKBOXES_REQUESTED], action, buildState({ activeScenarioId: SCN }))
    await task.toPromise()

    expect(vi.mocked(service.updateColumnRequest)).not.toHaveBeenCalled()
  })

  it('skips a rowId listed in rowOrder but absent from rows', async () => {
    vi.mocked(service.updateColumnRequest).mockResolvedValue('ok')
    const table = makeTable({
      columns: { '15': { id: '15', name: 'check', dataTypeId: null, unitId: null } },
      columnOrder: ['15'],
      rows: { row_0: { date: '2026-04-27', time: '10:00:00', '15': '0' } },
      rowOrder: ['row_0', 'row_ghost']
    })
    const state = buildState({ activeScenarioId: SCN, byScenario: { [SCN]: table } })
    const action = actions.updateAllCheckboxesRequested(PROJ, SCN, '15', '1')
    const { task } = drive(W[UPDATE_ALL_CHECKBOXES_REQUESTED], action, state)
    await task.toPromise()

    expect(vi.mocked(service.updateColumnRequest)).toHaveBeenCalledWith(PROJ, SCN, 15, {
      name: 'check',
      values: [{ date: '2026-04-27', time: '10:00:00', value: '1' }]
    })
  })

  it('no active table: PATCHes the check column with an empty value list', async () => {
    vi.mocked(service.updateColumnRequest).mockResolvedValue('ok')
    const action = actions.updateAllCheckboxesRequested(PROJ, SCN, '15', '1')
    const { task } = drive(W[UPDATE_ALL_CHECKBOXES_REQUESTED], action, buildState({ activeScenarioId: SCN }))
    await task.toPromise()

    expect(vi.mocked(service.updateColumnRequest)).toHaveBeenCalledWith(PROJ, SCN, 15, {
      name: 'check',
      values: []
    })
  })
})
