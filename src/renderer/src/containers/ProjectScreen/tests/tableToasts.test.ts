import { SHOW_SNACKBAR, type ShowSnackbarAction } from 'store/snackbarReducer'
import toastMessages from 'store/toastMessages'
import * as actions from '../actions'
import { addColumnWorker, addRowWorker, deleteColumnWorker, deleteRowWorker } from '../saga'
import type { ColumnDef, WeatherTable } from '../types'

// The four weather-table workers report their outcome on the app-wide toast.
// These drive the REAL workers (the older suite re-implements them inline, so it
// can't see what they actually dispatch) and assert only the toast — the effect
// sequence itself is covered there.

const PROJ = 'project-1'
const SCN = 'scenario-1'

// Run a generator to completion, feeding `feeds[i]` back for the i-th yield, and
// return the messages of every snackbar it raised. Deliberately blind to the
// effects themselves: this suite is about what the user is told, and pinning the
// call order here would just duplicate the other file.
const toastsFrom = (gen: Generator, feeds: unknown[] = []): string[] => {
  const raised: string[] = []
  let step = gen.next()
  let i = 0
  while (!step.done) {
    const effect = step.value as { payload?: { action?: ShowSnackbarAction } }
    const action = effect?.payload?.action
    if (action?.type === SHOW_SNACKBAR) raised.push(action.payload.message)
    step = gen.next(feeds[i])
    i += 1
  }
  return raised
}

// Throw INTO the generator at the first yield, then drain what follows — the
// shape of every "the backend refused it" case below.
const toastsAfterThrow = (gen: Generator, steps = 1): string[] => {
  const raised: string[] = []
  for (let i = 0; i < steps; i += 1) gen.next()
  let step = gen.throw(new Error('backend said no'))
  while (!step.done) {
    const effect = step.value as { payload?: { action?: ShowSnackbarAction } }
    const action = effect?.payload?.action
    if (action?.type === SHOW_SNACKBAR) raised.push(action.payload.message)
    step = gen.next()
  }
  return raised
}

const table: WeatherTable = {
  columns: {
    date: { id: 'date', name: 'date', dataTypeId: null, unitId: null },
    time: { id: 'time', name: 'time', dataTypeId: null, unitId: null }
  },
  columnOrder: ['date', 'time'],
  rows: {},
  rowOrder: [],
  validationErrors: {},
  columnNameErrors: {},
  cellSync: {},
  rowSelection: {}
}

const column: ColumnDef = { id: '7', name: 'Air Temp', dataTypeId: 1, unitId: 2 }

const snapshot = {
  column,
  index: 0,
  rowValues: {},
  validationErrors: {},
  cellSync: {}
}

describe('weather table toasts', () => {
  describe('add rows', () => {
    // buildRowsForAdd parses HH:mm (no seconds) — with anything else it bails
    // before the POST and the failure toast is the only thing raised.
    const request = (count: number): ReturnType<typeof actions.addRowRequested> =>
      actions.addRowRequested(PROJ, SCN, '2026-04-27', '10:00', ['date', 'time'], count, 1)

    it('counts the rows it added', () => {
      // select(table) → POST → put(load) → wait (null = loaded) → succeeded → toast
      expect(toastsFrom(addRowWorker(request(5)), [table, {}, undefined, null])).toEqual([
        toastMessages.rowsAdded(5)
      ])
    })

    it('says "Row" rather than "1 rows" for a single row', () => {
      expect(toastsFrom(addRowWorker(request(1)), [table, {}, undefined, null])).toEqual([
        'Row has been successfully added.'
      ])
    })

    it('reports the same count when the POST is refused', () => {
      expect(toastsAfterThrow(addRowWorker(request(5)), 2)).toEqual([
        toastMessages.rowsAddFailed(5)
      ])
    })

    it('reports a failure when the date/time cannot be parsed into rows', () => {
      const bad = actions.addRowRequested(PROJ, SCN, 'not-a-date', '??', ['date'], 3, 1)
      expect(toastsFrom(addRowWorker(bad), [table])).toEqual([toastMessages.rowsAddFailed(3)])
    })
  })

  describe('add column', () => {
    const request = actions.addColumnRequested(PROJ, SCN, 'Air Temp', 1, 2, '')

    it('names the column it added', () => {
      expect(toastsFrom(addColumnWorker(request), [table, { column }])).toEqual([
        toastMessages.columnAdded('Air Temp')
      ])
    })

    it('names the column when the POST is refused', () => {
      expect(toastsAfterThrow(addColumnWorker(request), 2)).toEqual([
        toastMessages.columnAddFailed('Air Temp')
      ])
    })
  })

  describe('delete column', () => {
    const request = actions.deleteColumnRequested(PROJ, SCN, '7', snapshot)

    it('names the column from the rollback snapshot — the store no longer has it', () => {
      expect(toastsFrom(deleteColumnWorker(request), [undefined, undefined])).toEqual([
        toastMessages.columnDeleted('Air Temp')
      ])
    })

    it('names the column when the DELETE is refused', () => {
      expect(toastsAfterThrow(deleteColumnWorker(request), 1)).toEqual([
        toastMessages.columnDeleteFailed('Air Temp')
      ])
    })
  })

  describe('delete row', () => {
    const rowSnapshot = {
      cells: { date: '2026-04-27', time: '10:00:00' },
      index: 0,
      validationErrors: undefined,
      cellSync: {},
      selected: false
    }
    const request = actions.deleteRowRequested(
      PROJ,
      SCN,
      'row_0',
      '2026-04-27',
      '10:00:00',
      rowSnapshot
    )

    it('reports the single row it deleted', () => {
      expect(toastsFrom(deleteRowWorker(request), [undefined, undefined])).toEqual([
        'Row has been successfully deleted.'
      ])
    })

    it('reports the failure when the DELETE is refused', () => {
      expect(toastsAfterThrow(deleteRowWorker(request), 1)).toEqual([
        toastMessages.rowsDeleteFailed(1)
      ])
    })
  })
})
