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

/**
 * Per-row vertical offset for the delete exit animation.
 *
 * A surviving row's final resting place is exactly `rowHeight` px higher for
 * every leaving row above it — no measurement needed, because the weather
 * table's rows are a fixed `ROW_HEIGHT_PX` tall. Sliding each survivor there
 * BEFORE the store drops the leaving rows means the commit is a no-op visually:
 * the row is already where the new `rowOrder` puts it.
 *
 * Leaving rows get 0. They travel on X (see `.weather-row-leaving` in
 * index.css) and would otherwise be fighting over the same `transform`.
 *
 * Walks the whole snapshot rather than just the visible band so the caller can
 * compute this once per delete instead of once per scroll.
 */
export function buildExitOffsets(
  order: readonly RowId[],
  leaving: ReadonlySet<RowId>,
  rowHeight: number
): Record<RowId, number> {
  const offsets: Record<RowId, number> = {}
  let leavingAbove = 0
  for (const rowId of order) {
    if (leaving.has(rowId)) {
      offsets[rowId] = 0
      leavingAbove++
      continue
    }
    offsets[rowId] = leavingAbove === 0 ? 0 : -rowHeight * leavingAbove
  }
  return offsets
}

/**
 * How far the scroll container must be pulled up when the leaving rows are
 * finally dropped.
 *
 * Rows removed ABOVE the viewport shrink the content above it, so the same
 * `scrollTop` ends up addressing different data — the view jumps to rows the
 * user was not looking at. `scrollTop / rowHeight` is the index of the first
 * row at the top edge; every leaving row before it has to be paid back.
 *
 * Needed on every delete above the viewport, not just when the user scrolls
 * during the animation.
 */
export function exitScrollAdjustment(
  order: readonly RowId[],
  leaving: ReadonlySet<RowId>,
  scrollTop: number,
  rowHeight: number
): number {
  const firstVisibleIndex = Math.floor(scrollTop / rowHeight)
  const limit = Math.min(firstVisibleIndex, order.length)
  let removedAbove = 0
  for (let i = 0; i < limit; i++) {
    if (leaving.has(order[i])) removedAbove++
  }
  return removedAbove * rowHeight
}
