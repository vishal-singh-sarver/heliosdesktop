// Row-highlight decision logic for the weather table.
//
// Kept out of WeatherTable.tsx so it can be unit-tested: that component is
// deliberately not rendered in jsdom (see the header of WeatherTable.test.tsx),
// so anything living inside it is only ever covered end-to-end. These two
// functions are the whole of the decision — the component holds the wiring.
import type { RowId } from 'containers/ProjectScreen/types'

/**
 * Add `rowId` to the highlight, or remove it if it is already there.
 *
 * Always returns a NEW Set. The highlight is component state feeding a
 * React.memo'd row, so mutating in place would leave the change invisible
 * until some unrelated re-render happened to flush it.
 */
export function toggleHighlight(current: ReadonlySet<RowId>, rowId: RowId): Set<RowId> {
  const next = new Set(current)
  if (!next.delete(rowId)) next.add(rowId)
  return next
}

/**
 * True for the controls a shift-click must pass straight through to, so they
 * keep working with the modifier held: the row's check-column checkbox and the
 * delete button.
 *
 * `closest` rather than a tag comparison because the delete button wraps an
 * <img>, and that is what a click reports as its target.
 *
 * Cell text inputs are deliberately NOT exempt — shift-clicking a data cell
 * should highlight the row, with mousedown suppressing the focus.
 */
export function isHighlightExemptTarget(el: HTMLElement): boolean {
  return el.closest('button, input[type="checkbox"]') !== null
}
