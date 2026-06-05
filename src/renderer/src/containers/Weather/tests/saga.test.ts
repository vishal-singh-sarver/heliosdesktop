import { loadScenarioRequested } from 'containers/ProjectScreen/actions'
import {
  LOAD_DATA_TYPES_FAILED,
  LOAD_DATA_TYPES_SUCCEEDED
} from 'containers/ProjectScreen/constants'
import {
  selectCheckDataTypeId,
  selectDataTypesLoadStatus,
  selectDateTimeBaseUnitId,
  selectDateTimeDataTypeId
} from 'containers/ProjectScreen/selectors'
import { call, put, select, take, takeLatest, takeLeading } from 'redux-saga/effects'
import { api } from 'utils/api'
import * as actions from '../actions'
import {
  FETCH_STATUS,
  IMPORT_CLEAR_REQUESTED,
  IMPORT_FINALIZE_REQUESTED,
  IMPORT_PICK_FILE_REQUESTED,
  SSE_CONNECT
} from '../constants'
import weatherSaga, {
  clearImportedDataWorker,
  fetchStatusWorker,
  finalizeImportWorker,
  pickFileWorker
} from '../saga'
import type { ImportedDataset } from '../types'

describe('fetchStatusWorker', () => {
  it('calls GET /api/status then puts fetchStatusSuccess', () => {
    const gen = fetchStatusWorker()
    expect(gen.next().value).toEqual(call(api.get, '/api/status'))
    const status = { version: '1.0.0', uptime: 0 }
    expect(gen.next(status).value).toEqual(put(actions.fetchStatusSuccess(status)))
    expect(gen.next().done).toBe(true)
  })

  it('puts fetchStatusFailure when fetch throws', () => {
    const gen = fetchStatusWorker()
    gen.next() // advance to call
    const error = new Error('Network error')
    expect(gen.throw(error).value).toEqual(put(actions.fetchStatusFailure('Network error')))
  })
})

// ── pickFileWorker ────────────────────────────────────────────────────────────

describe('pickFileWorker', () => {
  // Tests rely on window.api being available via the renderer global
  // declaration; we assert effect equality by yield value.

  it('opens dialog → reads file → puts succeeded with filename and rawText', () => {
    const gen = pickFileWorker()

    // 1) opens the native file dialog with weather extensions
    expect(gen.next().value).toEqual(
      call(window.api.openFile, [
        { name: 'Weather data', extensions: ['csv', 'txt', 'tsv', 'tab', 'xml'] }
      ])
    )

    // 2) reads the chosen path
    const path = '/tmp/weather/sample.csv'
    expect(gen.next(path).value).toEqual(call(window.api.readFile, path))

    // 3) puts succeeded with derived filename
    const rawText = 'a,b\n1,2'
    expect(gen.next(rawText).value).toEqual(
      put(actions.importPickFileSucceeded({ filename: 'sample.csv', rawText }))
    )
    expect(gen.next().done).toBe(true)
  })

  it('clears fileLoading via empty-string failure when the user cancels', () => {
    const gen = pickFileWorker()
    gen.next() // openFile
    // path === null → cancel. Dispatch FAILED with empty error so the
    // banner stays hidden but fileLoading flips back to false.
    expect(gen.next(null).value).toEqual(put(actions.importPickFileFailed('')))
    expect(gen.next().done).toBe(true)
  })

  it('puts importPickFileFailed when dialog/read throws', () => {
    const gen = pickFileWorker()
    gen.next() // openFile
    const err = new Error('read denied')
    expect(gen.throw(err).value).toEqual(put(actions.importPickFileFailed('read denied')))
  })
})

// ── finalizeImportWorker ──────────────────────────────────────────────────────

describe('finalizeImportWorker', () => {
  const dataset: ImportedDataset = {
    filename: 'sample.csv',
    columns: [
      { key: '__check__', label: 'check', index: -1 },
      { key: '5__temp', label: 'temp', index: 5 }
    ],
    records: [
      {
        dtIso: '2026-01-01T10:00:00.000Z',
        values: { __check__: '1', '5__temp': '22.5' }
      },
      // Second row has dtIso=null — should be skipped from /addRow.
      {
        dtIso: null,
        values: { __check__: '1', '5__temp': '99.9' }
      }
    ]
  }

  it('DELETEs /clear_data, resolves catalog, POSTs /addCol with seeded check + date-time + filtered CSV columns, then puts succeeded after refresh race', () => {
    const gen = finalizeImportWorker(actions.importFinalizeRequested('proj-1', 'sce-1', dataset))

    // Step 0 — clear any prior weather data for this scenario.
    const clearCall = gen.next().value as ReturnType<typeof call>
    expect(clearCall.payload.args[0]).toBe('/api/weather/project/proj-1/scenario/sce-1/clear_data')

    // Step 1 — saga reads catalog load status. When already 'loaded', no
    // take() is yielded; saga proceeds straight to selecting the check id.
    expect(gen.next().value).toEqual(select(selectDataTypesLoadStatus))
    expect(gen.next('loaded').value).toEqual(select(selectCheckDataTypeId))
    expect(gen.next(99).value).toEqual(select(selectDateTimeDataTypeId))
    expect(gen.next(7).value).toEqual(select(selectDateTimeBaseUnitId))

    // Step 2 — addCol with seeded check (carrying checkDataTypeId from
    // the catalog), seeded date-time, then every CSV column whose label
    // doesn't collide with a reserved name. The CSV's "check" column is
    // dropped — the seeded version owns that name.
    const addColCall = gen.next(3).value as ReturnType<typeof call>
    expect(addColCall.payload.args[0]).toBe('/api/weather/project/proj-1/scenario/sce-1/addCol')
    const dateMatcher = expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    const timeMatcher = expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/)
    expect(addColCall.payload.args[1]).toEqual({
      column: [
        {
          name: 'check',
          datatype: 99, // seeded with the resolved checkDataTypeId
          data_unit: null,
          values: [{ date: dateMatcher, time: timeMatcher, value: '1' }]
        },
        {
          name: 'date-time',
          datatype: 7,
          data_unit: 3,
          values: [{ date: dateMatcher, time: timeMatcher, value: '0' }]
        },
        {
          name: 'temp',
          datatype: null,
          data_unit: null,
          values: [{ date: dateMatcher, time: timeMatcher, value: '22.5' }]
        }
      ]
    })

    // Step 3 — dispatch loadScenarioRequested to refresh the table.
    expect(gen.next().value).toEqual(put(loadScenarioRequested('proj-1', 'sce-1')))

    // Step 4 — race against LOAD_SCENARIO_SUCCEEDED/FAILED. Resume with a
    // "succeeded" branch so the worker dispatches importFinalizeSucceeded.
    gen.next() // race(...)
    expect(
      gen.next({
        succeeded: {
          payload: {
            projectId: 'proj-1',
            scenarioId: 'sce-1',
            columns: [
              { id: 'date', name: 'date', dataTypeId: null, unitId: null },
              { id: 'time', name: 'time', dataTypeId: null, unitId: null },
              { id: '7', name: 'temp', dataTypeId: null, unitId: null }
            ],
            rows: [
              {
                date: '2026-01-01',
                time: '10:00:00',
                '7': '22.5'
              }
            ],
            precisionNormalized: true
          }
        }
      }).value
    ).toEqual(put(actions.importFinalizeSucceeded('proj-1', 'sce-1', dataset, true)))
    expect(gen.next().done).toBe(true)
  })

  it('blocks on the catalog when load status is loading', () => {
    const gen = finalizeImportWorker(actions.importFinalizeRequested('proj-1', 'sce-1', dataset))
    gen.next() // clear_data
    expect(gen.next().value).toEqual(select(selectDataTypesLoadStatus))

    // Status === 'loading' → saga must take() the catalog terminal action
    // before reading checkDataTypeId.
    expect(gen.next('loading').value).toEqual(
      take([LOAD_DATA_TYPES_SUCCEEDED, LOAD_DATA_TYPES_FAILED])
    )
    // After the take resolves, saga reads the (now-loaded) checkDataTypeId.
    expect(gen.next().value).toEqual(select(selectCheckDataTypeId))
  })

  it('puts importFinalizeFailed when scenario refresh fails', () => {
    const gen = finalizeImportWorker(actions.importFinalizeRequested('proj-1', 'sce-1', dataset))
    gen.next() // clear_data
    gen.next() // select selectDataTypesLoadStatus
    gen.next('loaded') // select selectCheckDataTypeId
    gen.next(99) // select selectDateTimeDataTypeId
    gen.next(7) // select selectDateTimeBaseUnitId
    gen.next(3) // addCol
    gen.next() // put loadScenarioRequested
    gen.next() // race(...)
    const failure = gen.next({
      failed: { payload: { scenarioId: 'sce-1', error: 'header fetch 500' } }
    }).value
    expect(failure).toEqual(
      put(actions.importFinalizeFailed('Imported, but failed to refresh data: header fetch 500'))
    )
    expect(gen.next().done).toBe(true)
  })

  it('puts importFinalizeFailed when /clear_data throws', () => {
    const gen = finalizeImportWorker(actions.importFinalizeRequested('proj-1', 'sce-1', dataset))
    gen.next() // clear_data
    const err = new Error('cannot clear')
    expect(gen.throw(err).value).toEqual(put(actions.importFinalizeFailed('cannot clear')))
  })

  it('still refreshes the scenario and reports failure when /addCol throws', () => {
    const gen = finalizeImportWorker(actions.importFinalizeRequested('proj-1', 'sce-1', dataset))
    gen.next() // clear_data
    gen.next() // select selectDataTypesLoadStatus
    gen.next('loaded') // select selectCheckDataTypeId
    gen.next(99) // select selectDateTimeDataTypeId
    gen.next(7) // select selectDateTimeBaseUnitId
    gen.next(3) // addCol (call)
    const err = new Error('column conflict')
    // The /addCol failure is caught — the scenario is still refreshed so the
    // table reflects the cleared (now-empty) state instead of stale rows.
    expect(gen.throw(err).value).toEqual(put(loadScenarioRequested('proj-1', 'sce-1')))
    gen.next() // race(...)
    // Even when the refresh succeeds, the import is still reported as failed.
    const failure = gen.next({ succeeded: { payload: { scenarioId: 'sce-1' } } }).value
    expect(failure).toEqual(put(actions.importFinalizeFailed('Import failed: column conflict')))
    expect(gen.next().done).toBe(true)
  })

  it('truncates imported decimal values to 7 places before posting to addCol', () => {
    const highPrecisionDataset: ImportedDataset = {
      filename: 'precision.csv',
      columns: [
        { key: '__check__', label: 'check', index: -1 },
        { key: '3__temp', label: 'temp', index: 3 }
      ],
      records: [
        {
          dtIso: '2026-01-01T10:00:00.000Z',
          values: { __check__: '1', '3__temp': '12.123456789' }
        }
      ]
    }

    const gen = finalizeImportWorker(
      actions.importFinalizeRequested('proj-1', 'sce-1', highPrecisionDataset)
    )
    gen.next() // clear_data
    gen.next() // select selectDataTypesLoadStatus
    gen.next('loaded') // select selectCheckDataTypeId
    gen.next(99) // select selectDateTimeDataTypeId
    gen.next(7) // select selectDateTimeBaseUnitId
    const addColCall = gen.next(3).value as ReturnType<typeof call>
    expect(addColCall.payload.args[1]).toEqual({
      column: [
        {
          name: 'check',
          datatype: 99,
          data_unit: null,
          values: [{ date: expect.any(String), time: expect.any(String), value: '1' }]
        },
        {
          name: 'date-time',
          datatype: 7,
          data_unit: 3,
          values: [{ date: expect.any(String), time: expect.any(String), value: '0' }]
        },
        {
          name: 'temp',
          datatype: null,
          data_unit: null,
          values: [{ date: expect.any(String), time: expect.any(String), value: '12.1234567' }]
        }
      ]
    })
  })

  it('surfaces the precision warning when backend-adjusted refreshed values differ from the submitted import', () => {
    const backendAdjustedDataset: ImportedDataset = {
      filename: 'precision.csv',
      columns: [
        { key: '__check__', label: 'check', index: -1 },
        { key: '3__temp', label: 'temp', index: 3 }
      ],
      records: [
        {
          dtIso: '2026-01-01T10:00:00.000Z',
          values: { __check__: '1', '3__temp': '12.12345678' }
        }
      ]
    }

    // The saga keys backend rows by fmtDate/fmtTime, which render the instant
    // in LOCAL time. Derive the refreshed row's date/time the same way so the
    // lookup matches under any timezone — hardcoding the IST rendering made
    // this pass locally but miss the row (and the precision diff) on UTC CI.
    const instant = new Date('2026-01-01T10:00:00.000Z')
    const pad2 = (n: number): string => String(n).padStart(2, '0')
    const localDate = `${instant.getFullYear()}-${pad2(instant.getMonth() + 1)}-${pad2(instant.getDate())}`
    const localTime = `${pad2(instant.getHours())}:${pad2(instant.getMinutes())}:00`

    const gen = finalizeImportWorker(
      actions.importFinalizeRequested('proj-1', 'sce-1', backendAdjustedDataset, false)
    )
    gen.next() // clear_data
    gen.next() // select selectDataTypesLoadStatus
    gen.next('loaded') // select selectCheckDataTypeId
    gen.next(99) // select selectDateTimeDataTypeId
    gen.next(7) // select selectDateTimeBaseUnitId
    gen.next(3) // addCol
    gen.next() // put loadScenarioRequested
    gen.next() // race(...)
    expect(
      gen.next({
        succeeded: {
          payload: {
            projectId: 'proj-1',
            scenarioId: 'sce-1',
            columns: [
              { id: 'date', name: 'date', dataTypeId: null, unitId: null },
              { id: 'time', name: 'time', dataTypeId: null, unitId: null },
              { id: '7', name: 'temp', dataTypeId: null, unitId: null }
            ],
            rows: [
              {
                date: localDate,
                time: localTime,
                '7': '12.1234567'
              }
            ],
            precisionNormalized: false
          }
        }
      }).value
    ).toEqual(
      put(
        actions.importFinalizeSucceeded(
          'proj-1',
          'sce-1',
          {
            ...backendAdjustedDataset,
            records: [
              {
                dtIso: '2026-01-01T10:00:00.000Z',
                values: { __check__: '1', '3__temp': '12.1234567' }
              }
            ]
          },
          true
        )
      )
    )
  })
})

describe('clearImportedDataWorker', () => {
  it('DELETEs clear_data, refreshes the scenario, then puts importClearSucceeded', () => {
    const gen = clearImportedDataWorker(actions.importClearRequested('proj-1', 'sce-1'))
    const clearCall = gen.next().value as ReturnType<typeof call>
    expect(clearCall.payload.args[0]).toBe('/api/weather/project/proj-1/scenario/sce-1/clear_data')
    expect(gen.next().value).toEqual(put(loadScenarioRequested('proj-1', 'sce-1')))
    gen.next() // race(...)
    expect(gen.next({ succeeded: { payload: { scenarioId: 'sce-1' } } }).value).toEqual(
      put(actions.importClearSucceeded('proj-1', 'sce-1'))
    )
  })
})

// ── root watcher ──────────────────────────────────────────────────────────────

describe('weatherSaga (root)', () => {
  it('watches FETCH_STATUS with takeLatest', () => {
    const gen = weatherSaga()
    expect(gen.next().value).toEqual(takeLatest(FETCH_STATUS, fetchStatusWorker))
  })

  it('watches SSE_CONNECT with takeLatest as second effect', () => {
    const gen = weatherSaga()
    gen.next() // FETCH_STATUS watcher
    const secondEffect = gen.next().value as any
    expect(JSON.stringify(secondEffect)).toContain(SSE_CONNECT)
  })

  it('watches IMPORT_PICK_FILE_REQUESTED with takeLatest', () => {
    const gen = weatherSaga()
    gen.next() // FETCH_STATUS
    gen.next() // SSE_CONNECT
    expect(gen.next().value).toEqual(takeLatest(IMPORT_PICK_FILE_REQUESTED, pickFileWorker))
  })

  it('watches IMPORT_FINALIZE_REQUESTED with takeLeading', () => {
    const gen = weatherSaga()
    gen.next() // FETCH_STATUS
    gen.next() // SSE_CONNECT
    gen.next() // IMPORT_PICK_FILE_REQUESTED
    expect(gen.next().value).toEqual(takeLeading(IMPORT_FINALIZE_REQUESTED, finalizeImportWorker))
  })

  it('watches IMPORT_CLEAR_REQUESTED with takeLeading', () => {
    const gen = weatherSaga()
    gen.next() // FETCH_STATUS
    gen.next() // SSE_CONNECT
    gen.next() // IMPORT_PICK_FILE_REQUESTED
    gen.next() // IMPORT_FINALIZE_REQUESTED
    expect(gen.next().value).toEqual(takeLeading(IMPORT_CLEAR_REQUESTED, clearImportedDataWorker))
  })
})
