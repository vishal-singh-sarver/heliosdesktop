// Unit tests for the weather table's row-highlight decision logic.
//
// The logic lives in a pure module rather than inside WeatherTable because that
// component is deliberately not unit-tested in jsdom (see the header of
// WeatherTable.test.tsx — scroll/virtualization/refs don't work there). Keeping
// the decisions pure means they can be tested properly, with the component left
// holding only the wiring.
import {
  DATE_COL_ID,
  TIME_COL_ID,
  type CellValue,
  type ColId,
  type RowId
} from 'containers/ProjectScreen/types'
import {
  isHighlightExemptTarget,
  reconcileHighlight,
  toDeleteKeys,
  toggleHighlight
} from '../rowHighlight'

describe('toggleHighlight', () => {
  it('adds a row that is not highlighted', () => {
    expect([...toggleHighlight(new Set<RowId>(), 'row_3')]).toEqual(['row_3'])
  })

  it('removes a row that is already highlighted', () => {
    expect([...toggleHighlight(new Set<RowId>(['row_3']), 'row_3')]).toEqual([])
  })

  it('leaves the other highlighted rows untouched', () => {
    const current = new Set<RowId>(['row_1', 'row_3'])

    expect([...toggleHighlight(current, 'row_3')]).toEqual(['row_1'])
    expect([...toggleHighlight(current, 'row_7')].sort()).toEqual(['row_1', 'row_3', 'row_7'])
  })

  // WeatherRow is React.memo'd and the highlight is component state, so an
  // in-place add/delete would leave the change invisible until some unrelated
  // re-render happened to flush it. This is the test that fails if someone
  // later "optimises" the copy away.
  it('returns a new Set and does not mutate the input', () => {
    const current = new Set<RowId>(['row_1'])
    const result = toggleHighlight(current, 'row_2')

    expect(result).not.toBe(current)
    expect([...current]).toEqual(['row_1'])
  })
})

describe('isHighlightExemptTarget', () => {
  it('exempts the row checkbox', () => {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    expect(isHighlightExemptTarget(checkbox)).toBe(true)
  })

  it('exempts the delete button', () => {
    expect(isHighlightExemptTarget(document.createElement('button'))).toBe(true)
  })

  // The bin button wraps an <img>, so THAT is what a click reports as its
  // target — not the <button>. A `tagName === 'BUTTON'` check passes the two
  // tests above and still breaks row deletion; this one forces closest().
  it('exempts an element nested inside the delete button', () => {
    const button = document.createElement('button')
    const icon = document.createElement('img')
    button.appendChild(icon)
    expect(isHighlightExemptTarget(icon)).toBe(true)
  })

  // The opposite case: shift-clicking a data cell SHOULD highlight the row
  // (mousedown suppresses the focus), so a text input must not be exempt.
  it('does not exempt a cell text input', () => {
    const input = document.createElement('input')
    input.type = 'text'
    expect(isHighlightExemptTarget(input)).toBe(false)
  })

  it('does not exempt a read-only cell', () => {
    expect(isHighlightExemptTarget(document.createElement('span'))).toBe(false)
  })

  it('does not exempt the row itself', () => {
    expect(isHighlightExemptTarget(document.createElement('tr'))).toBe(false)
    expect(isHighlightExemptTarget(document.createElement('td'))).toBe(false)
  })
})

describe('toDeleteKeys', () => {
  const row = (date: CellValue, time: CellValue): Record<ColId, CellValue> => ({
    [DATE_COL_ID]: date,
    [TIME_COL_ID]: time
  })

  const rows: Record<RowId, Record<ColId, CellValue>> = {
    row_0: row('2026-02-24', '10:00:00'),
    row_1: row('2026-02-25', '10:00:00'),
    row_2: row('2026-02-26', '10:00:00')
  }
  const rowOrder: RowId[] = ['row_0', 'row_1', 'row_2']

  it('returns no keys when nothing is highlighted', () => {
    expect(toDeleteKeys(rowOrder, rows, new Set<RowId>())).toEqual([])
  })

  // The highlight is a Set, so its iteration order is whatever order the user
  // happened to shift-click in. The request should follow the table instead.
  it('emits keys in rowOrder order, not the order the rows were highlighted', () => {
    const highlighted = new Set<RowId>(['row_2', 'row_0'])

    expect(toDeleteKeys(rowOrder, rows, highlighted)).toEqual([
      { date: '2026-02-24', time: '10:00:00' },
      { date: '2026-02-26', time: '10:00:00' }
    ])
  })

  // (date, time) is the ONLY way the backend identifies a row, so a row missing
  // either can't be addressed — sending it would fail the whole all-or-nothing
  // batch, taking the valid rows down with it.
  it('skips highlighted rows that are missing a date or a time', () => {
    const patchy: Record<RowId, Record<ColId, CellValue>> = {
      ...rows,
      row_1: row(null, '10:00:00'),
      row_2: row('2026-02-26', null)
    }
    const highlighted = new Set<RowId>(['row_0', 'row_1', 'row_2'])

    expect(toDeleteKeys(rowOrder, patchy, highlighted)).toEqual([
      { date: '2026-02-24', time: '10:00:00' }
    ])
  })

  it('skips highlighted ids that are no longer in the table', () => {
    const highlighted = new Set<RowId>(['row_0', 'row_99'])

    expect(toDeleteKeys(rowOrder, rows, highlighted)).toEqual([
      { date: '2026-02-24', time: '10:00:00' }
    ])
  })
})

describe('reconcileHighlight', () => {
  it('keeps the rest of the selection when one row is deleted', () => {
    const before: RowId[] = ['row_0', 'row_1', 'row_2']
    const after: RowId[] = ['row_0', 'row_2']
    const highlighted = new Set<RowId>(['row_0', 'row_1', 'row_2'])

    expect([...reconcileHighlight(before, after, highlighted)]).toEqual(['row_0', 'row_2'])
  })

  it('drops only the ids that are gone', () => {
    const before: RowId[] = ['row_0', 'row_1']
    const after: RowId[] = ['row_1']

    expect([...reconcileHighlight(before, after, new Set<RowId>(['row_0']))]).toEqual([])
  })

  // RowIds are positional (`row_${index}`), so a reload renumbers them and a
  // held highlight would silently point at different rows. A rebuild always
  // brings in at least one id the previous order didn't have.
  it('clears everything when a new row id appears', () => {
    const before: RowId[] = ['row_0', 'row_1']
    const after: RowId[] = ['row_0', 'row_1', 'row_2']

    expect([...reconcileHighlight(before, after, new Set<RowId>(['row_0']))]).toEqual([])
  })

  // Identity matters: this runs during render, so returning a fresh Set when
  // nothing changed would setState on every pass and loop.
  it('returns the same Set when nothing relevant changed', () => {
    const order: RowId[] = ['row_0', 'row_1']
    const highlighted = new Set<RowId>(['row_0'])

    expect(reconcileHighlight(order, order, highlighted)).toBe(highlighted)
  })

  it('leaves an empty highlight alone', () => {
    const highlighted = new Set<RowId>()

    expect(reconcileHighlight(['row_0'], ['row_1', 'row_2'], highlighted)).toBe(highlighted)
  })
})
