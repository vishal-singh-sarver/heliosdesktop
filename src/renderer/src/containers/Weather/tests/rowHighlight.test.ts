// Unit tests for the weather table's row-highlight decision logic.
//
// The logic lives in a pure module rather than inside WeatherTable because that
// component is deliberately not unit-tested in jsdom (see the header of
// WeatherTable.test.tsx — scroll/virtualization/refs don't work there). Keeping
// the decisions pure means they can be tested properly, with the component left
// holding only the wiring.
import type { RowId } from 'containers/ProjectScreen/types'
import { isHighlightExemptTarget, toggleHighlight } from '../rowHighlight'

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
