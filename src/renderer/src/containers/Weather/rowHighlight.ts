// Row-highlight decision logic for the weather table.
//
// Kept out of WeatherTable.tsx so it can be unit-tested: that component is
// deliberately not rendered in jsdom (see the header of WeatherTable.test.tsx),
// so anything living inside it is only ever covered end-to-end. These two
// functions are the whole of the decision — the component holds the wiring.
import {
  DATE_COL_ID,
  TIME_COL_ID,
  type CellValue,
  type ColId,
  type RowId
} from 'containers/ProjectScreen/types'

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

/**
 * Turn the highlight into the request body for POST /deleteRow.
 *
 * Walks `rowOrder` rather than the Set, so the keys follow the table rather
 * than whatever order the user happened to shift-click in.
 *
 * Rows missing a date or a time are skipped: (date, time) is the ONLY way the
 * backend identifies a row, and the delete is all-or-nothing — one unaddressable
 * key would fail the whole batch and take the valid rows down with it. Ids no
 * longer present in the table are skipped for the same reason.
 */
export function toDeleteKeys(
  rowOrder: readonly RowId[],
  rows: Record<RowId, Record<ColId, CellValue>>,
  highlighted: ReadonlySet<RowId>
): Array<{ date: string; time: string }> {
  const keys: Array<{ date: string; time: string }> = []
  for (const rowId of rowOrder) {
    if (!highlighted.has(rowId)) continue
    const row = rows[rowId]
    const date = row?.[DATE_COL_ID]
    const time = row?.[TIME_COL_ID]
    if (date == null || time == null) continue
    keys.push({ date, time })
  }
  return keys
}

/**
 * Fold a changed `rowOrder` into the current highlight.
 *
 * Deleting rows only FILTERS `rowOrder` — the survivors keep their ids — so the
 * rest of a selection must survive one row being deleted out of the middle of
 * it. Only a reload rebuilds the order, and because rowIds are positional
 * (`row_${index}`) that renumbers them: a held highlight would then point at
 * different rows. A rebuild always introduces at least one id the previous
 * order didn't have, which is what separates the two cases here.
 *
 * Returns the SAME Set when nothing changed. This runs during render, so a
 * fresh Set every pass would setState forever.
 */
export function reconcileHighlight(
  previousRowOrder: readonly RowId[],
  nextRowOrder: readonly RowId[],
  highlighted: ReadonlySet<RowId>
): ReadonlySet<RowId> {
  if (highlighted.size === 0) return highlighted

  const previous = new Set(previousRowOrder)
  for (const rowId of nextRowOrder) {
    if (!previous.has(rowId)) return new Set<RowId>()
  }

  const surviving = new Set(nextRowOrder)
  const kept = [...highlighted].filter((rowId) => surviving.has(rowId))
  return kept.length === highlighted.size ? highlighted : new Set(kept)
}
