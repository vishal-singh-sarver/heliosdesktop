import deleteIcon from '@renderer/assets/delete.svg'
import Dialog from '@renderer/components/Dialog'
import {
  deleteColumnRequested,
  deleteRowRequested,
  setAllRowsSelection,
  setRowSelection,
  updateAllCheckboxesRequested,
  updateCellLocal,
  updateColumnRequested
} from 'containers/ProjectScreen/actions'
import {
  CHECK_COL_NAME,
  DATE_COL_ID,
  DATE_TIME_COL_NAME,
  TIME_COL_ID,
  isReservedColId,
  type CellValue,
  type ColId,
  type ColumnDef,
  type DataTypeDef,
  type DeleteColumnSnapshot,
  type DeleteRowSnapshot,
  type RowId,
  type UpdateColumnPatch
} from 'containers/ProjectScreen/types'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import CellInput from './CellInput'
import DateTimeHeader from './DateTimeHeader'
import HeaderEditor from './HeaderEditor'
import messages from './messages'
import {
  selectActiveDateTimeFormat,
  selectActiveProject,
  selectActiveProjectId,
  selectActiveScenarioId,
  selectActiveWeatherTable,
  selectAllChecked,
  selectAllRowsSelected,
  selectCheckColId,
  selectColumnOrder,
  selectColumns,
  selectDateTimeDataType,
  selectRowOrder,
  selectRowSelection,
  selectSelectableDataTypes
} from './selectors'
import { validateCellValue } from './validation'

const ROW_HEIGHT_PX = 36
const ROW_OVERSCAN = 12

// Shared empty-row sentinel so missing rows don't break React.memo equality
// on `row` — `{}` literals would be a fresh reference each render and force
// every empty row to reconcile.
const EMPTY_ROW: Record<ColId, CellValue> = Object.freeze({}) as Record<ColId, CellValue>

// A column is backend-managed (PATCH-able) when its id is a positive integer —
// the stringified WeatherDataHeader.id. Reserved date/time, upload-slug, and
// the seeded date-time/check columns fail this check and stay read-only.
function isBackendManagedCol(col: ColumnDef): boolean {
  if (isReservedColId(col.id)) return false
  if (col.name === DATE_TIME_COL_NAME || col.name === CHECK_COL_NAME) return false
  const n = Number(col.id)
  return Number.isFinite(n) && n > 0 && String(n) === col.id
}

// "2026-02-26" + "10:00:00" → "02/26/2026 10:00". Returns "" when either
// half is missing so the merged cell renders blank, matching how unfilled
// date/time cells render today. `format` is the catalog unit string for the
// `date_time` data type (e.g. "MM/DD/YYYY HH:MM"); unknown formats fall back
// to the spec's base pattern so a backend-added unit can't break rendering.
function formatDateTime(
  date: CellValue,
  time: CellValue,
  format: string,
  utcOffset: string
): string {
  if (date == null || time == null) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return ''
  const [, y, mo, d] = m
  const hhmm = time.slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return ''
  const ss = /^\d{2}:\d{2}:(\d{2})/.exec(time)?.[1] ?? '00'
  switch (format) {
    case 'MM/DD/YYYY HH:MM':
      return `${mo}/${d}/${y} ${hhmm}`
    case 'DD/MM/YYYY HH:MM':
      return `${d}/${mo}/${y} ${hhmm}`
    case 'MM-DD-YYYY HH:MM':
      return `${mo}-${d}-${y} ${hhmm}`
    case 'DD-MM-YYYY HH:MM':
      return `${d}-${mo}-${y} ${hhmm}`
    case 'YYYY-MM-DD HH:MM':
      return `${y}-${mo}-${d} ${hhmm}`
    case 'YYYYMMDDHH':
      return `${y}${mo}${d}${hhmm.slice(0, 2)}`
    case 'YYYY-MM-DDTHH:MM:SS-HH:MM':
      return `${y}-${mo}-${d}T${hhmm}:${ss}${utcOffset || '+00:00'}`
    case 'YYYY-MM-DDTHH:MM:SSZ':
      return `${y}-${mo}-${d}T${hhmm}:${ss}`
    case 'YYYY DOY HH:MM':
      return `${y} ${dayOfYear(+y, +mo, +d)} ${hhmm}`
    case 'DOY YYYY HH:MM':
      return `${dayOfYear(+y, +mo, +d)} ${y} ${hhmm}`
    default:
      return `${mo}/${d}/${y} ${hhmm}`
  }
}

// 1-based day-of-year, zero-padded to 3 digits ("001"–"366") to match the
// canonical DOY shape the importer accepts on the way in.
function dayOfYear(y: number, mo: number, d: number): string {
  const start = Date.UTC(y, 0, 1)
  const cur = Date.UTC(y, mo - 1, d)
  const doy = Math.round((cur - start) / 86_400_000) + 1
  return String(doy).padStart(3, '0')
}

// One <tr> in the body. Extracted so React.memo can skip rows whose inputs
// didn't change — by far the dominant cost during scrolling. Inputs are
// chosen to be referentially stable when the row's underlying state didn't
// change:
//   * `row` and `rowValidationErrors` come straight from immer-produced
//     immutable maps, so untouched rows keep identity across dispatches.
//   * Table-wide props (columns, dataTypes, callbacks, etc.) are stable refs
//     produced by the parent's useCallback / useSelector pairs.
interface WeatherRowProps {
  rowId: RowId
  row: Record<ColId, CellValue>
  rowValidationErrors: Record<ColId, string | null> | undefined
  rowSelected: boolean
  visibleColumnOrder: ColId[]
  columns: Record<ColId, ColumnDef>
  dataTypes: DataTypeDef[]
  scenarioId: string | null
  checkColId: ColId | null
  dateTimeColId: ColId | null
  dateFormat: string
  utcOffset: string
  onToggleRow: (rowId: string) => void
  onToggleCheck: (rowId: string, currentValue: CellValue) => void
  onCellBlur: (rowId: string, colId: string, newValue: string, originalValue: string) => void
  onRequestDelete: (rowId: string) => void
}

const WeatherRow = React.memo(function WeatherRow({
  rowId,
  row,
  rowValidationErrors,
  rowSelected,
  visibleColumnOrder,
  columns,
  dataTypes,
  scenarioId,
  checkColId,
  dateTimeColId,
  dateFormat,
  utcOffset,
  onToggleRow,
  onToggleCheck,
  onCellBlur,
  onRequestDelete
}: WeatherRowProps): React.JSX.Element {
  const checkValue: CellValue = checkColId != null ? (row[checkColId] ?? null) : null
  return (
    <tr className="h-9 border-b border-app-border">
      <td className="w-12 border-r border-app-border px-3 py-2">
        <input
          type="checkbox"
          aria-label={`Select ${rowId}`}
          checked={checkColId != null ? checkValue === '1' : rowSelected}
          onChange={
            checkColId != null ? () => onToggleCheck(rowId, checkValue) : () => onToggleRow(rowId)
          }
          className="h-4 w-4 accent-blue-600"
        />
      </td>
      {visibleColumnOrder.map((colId) => {
        const value: CellValue = row[colId] ?? null
        const isDateTime = colId === dateTimeColId
        const display = isDateTime
          ? formatDateTime(row[DATE_COL_ID] ?? null, row[TIME_COL_ID] ?? null, dateFormat, utcOffset)
          : (value ?? '')
        const readOnly = isReservedColId(colId) || isDateTime
        const widthCls = isDateTime
          ? 'w-[269px] min-w-[269px] max-w-[269px]'
          : readOnly
            ? 'w-32 min-w-32 max-w-32'
            : 'w-[162px] min-w-[162px] max-w-[162px]'
        // Read-only cells can never carry a validation error.
        const cellError = readOnly ? null : (rowValidationErrors?.[colId] ?? null)
        const borderCls = cellError
          ? 'border-r border-app-border outline outline-1 -outline-offset-1 outline-[#F04438]'
          : 'border-r border-app-border focus-within:outline focus-within:outline-1 focus-within:-outline-offset-1 focus-within:outline-blue-500/60'
        return (
          <td key={colId} className={`${widthCls} h-9 ${borderCls}`}>
            {readOnly ? (
              <span className="block truncate px-3">{display}</span>
            ) : (
              <CellInput
                rowId={rowId}
                colId={colId}
                value={display}
                col={columns[colId]}
                dataTypes={dataTypes}
                scenarioId={scenarioId}
                onCommit={(next) => onCellBlur(rowId, colId, next, display)}
              />
            )}
          </td>
        )
      })}
      <td className="w-20 min-w-20 max-w-20 border-r border-app-border px-3 py-2">
        <button
          type="button"
          aria-label={`Delete row ${rowId}`}
          onClick={() => onRequestDelete(rowId)}
          className="rounded p-1 hover:bg-neutral-800"
        >
          <img src={deleteIcon} alt="" className="h-4 w-4" />
        </button>
      </td>
      <td aria-hidden className="w-auto" />
    </tr>
  )
})

function WeatherTable(): React.JSX.Element {
  const dispatch = useDispatch()
  const projectId = useSelector(selectActiveProjectId)
  const scenarioId = useSelector(selectActiveScenarioId)
  const columns = useSelector(selectColumns)
  const columnOrder = useSelector(selectColumnOrder)
  const rowOrder = useSelector(selectRowOrder)
  const rowSelection = useSelector(selectRowSelection)
  const allSelected = useSelector(selectAllRowsSelected)
  const allChecked = useSelector(selectAllChecked)
  const checkColId = useSelector(selectCheckColId)
  const table = useSelector(selectActiveWeatherTable)
  const dataTypes = useSelector(selectSelectableDataTypes)
  const dateTimeDataType = useSelector(selectDateTimeDataType)
  const activeProject = useSelector(selectActiveProject)
  const [pendingDeleteColumn, setPendingDeleteColumn] = React.useState<ColumnDef | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<RowId | null>(null)
  const [bodyViewportHeight, setBodyViewportHeight] = React.useState(0)
  // Visible row band is the only scroll-derived state that drives JSX. Storing
  // it as { startIndex, endIndex } (instead of raw scrollTop) lets the scroll
  // handler bail out when the band hasn't actually changed — i.e. most scroll
  // events that move a few pixels within the current band do zero React work.
  const [visibleWindow, setVisibleWindow] = React.useState({ startIndex: 0, endIndex: 0 })

  // Refs the scroll handler reads to compute the latest band. Kept in refs
  // so the handler is closure-stable and doesn't need to recreate on every
  // render.
  const scrollTopRef = React.useRef(0)
  const viewportHeightRef = React.useRef(0)
  const totalRowsRef = React.useRef(0)

  // Stable refs for the per-cell commit handler. Lets us hand a stable
  // `onCommit` to every CellInput so React.memo skips reconciliation when
  // nothing else about the cell changed.
  const projectIdRef = React.useRef(projectId)
  const scenarioIdRef = React.useRef(scenarioId)
  const columnsRef = React.useRef(columns)
  const dataTypesRef = React.useRef(dataTypes)
  React.useEffect(() => {
    projectIdRef.current = projectId
  }, [projectId])
  React.useEffect(() => {
    scenarioIdRef.current = scenarioId
  }, [scenarioId])
  React.useEffect(() => {
    columnsRef.current = columns
  }, [columns])
  React.useEffect(() => {
    dataTypesRef.current = dataTypes
  }, [dataTypes])

  const toggleAll = (): void => {
    if (!scenarioId) return
    dispatch(setAllRowsSelection(scenarioId, !allSelected))
  }

  const toggleRow = React.useCallback(
    (rowId: string): void => {
      const sid = scenarioIdRef.current
      if (!sid) return
      // rowSelection is read off the latest render via the closure rebuild
      // below — we want the toggle to flip the *current* value, not a stale
      // one. Captured fresh on each render because toggle is dispatched on
      // user intent, not on a hot loop.
      dispatch(setRowSelection(sid, rowId, !rowSelection[rowId]))
    },
    [dispatch, rowSelection]
  )

  const handleCellBlur = React.useCallback(
    (rowId: string, colId: string, newValue: string, originalValue: string): void => {
      const pid = projectIdRef.current
      const sid = scenarioIdRef.current
      if (!pid || !sid || newValue === originalValue) return
      const col = columnsRef.current[colId]
      const validationError = col
        ? validateCellValue(newValue, { col, dataTypes: dataTypesRef.current })
        : null
      dispatch(
        updateCellLocal({
          projectId: pid,
          scenarioId: sid,
          rowId,
          colId,
          value: newValue,
          validationError
        })
      )
    },
    [dispatch]
  )

  const dispatchHeaderPatch = (col: ColumnDef, patch: UpdateColumnPatch): void => {
    if (!projectId || !scenarioId) return
    const previous: UpdateColumnPatch = {}
    if (patch.name !== undefined) previous.name = col.name
    if (patch.dataTypeId !== undefined) previous.dataTypeId = col.dataTypeId
    if (patch.unitId !== undefined) previous.unitId = col.unitId
    dispatch(updateColumnRequested(projectId, scenarioId, col.id, patch, previous))
  }

  const handleRequestHeaderDelete = (col: ColumnDef): void => {
    setPendingDeleteColumn(col)
  }

  const handleCancelHeaderDelete = (): void => {
    setPendingDeleteColumn(null)
  }

  const handleConfirmHeaderDelete = (): void => {
    if (!pendingDeleteColumn) return
    const col = columns[pendingDeleteColumn.id] ?? pendingDeleteColumn
    if (!projectId || !scenarioId || !table) return
    const snapshot: DeleteColumnSnapshot = {
      column: { ...col },
      index: table.columnOrder.indexOf(col.id),
      rowValues: {},
      validationErrors: {},
      cellSync: {}
    }
    for (const rowId of table.rowOrder) {
      snapshot.rowValues[rowId] = table.rows[rowId]?.[col.id]
      snapshot.validationErrors[rowId] = table.validationErrors[rowId]?.[col.id]
    }
    for (const [key, status] of Object.entries(table.cellSync)) {
      if (key.endsWith(`:${col.id}`)) snapshot.cellSync[key] = status
    }
    dispatch(deleteColumnRequested(projectId, scenarioId, col.id, snapshot))
    setPendingDeleteColumn(null)
  }

  // Row delete is requested from the per-row trash icon. Stable so React.memo
  // can keep skipping untouched rows during scroll.
  const handleRequestRowDelete = React.useCallback((rowId: RowId): void => {
    setPendingDeleteRow(rowId)
  }, [])

  const handleCancelRowDelete = (): void => {
    setPendingDeleteRow(null)
  }

  const handleConfirmRowDelete = (): void => {
    if (pendingDeleteRow == null) return
    if (!projectId || !scenarioId || !table) {
      setPendingDeleteRow(null)
      return
    }
    const rowId = pendingDeleteRow
    const row = table.rows[rowId]
    const date = row?.[DATE_COL_ID]
    const time = row?.[TIME_COL_ID]
    // Without a (date, time) key the backend can't identify the row, so bail
    // rather than fire a request that can only fail.
    if (!row || date == null || time == null) {
      setPendingDeleteRow(null)
      return
    }

    const snapshot: DeleteRowSnapshot = {
      cells: { ...row },
      index: table.rowOrder.indexOf(rowId),
      validationErrors: table.validationErrors[rowId]
        ? { ...table.validationErrors[rowId] }
        : undefined,
      cellSync: {},
      selected: table.rowSelection[rowId] === true
    }
    for (const [key, status] of Object.entries(table.cellSync)) {
      if (key.startsWith(`${rowId}:`)) snapshot.cellSync[key] = status
    }

    dispatch(deleteRowRequested(projectId, scenarioId, rowId, date, time, snapshot))
    setPendingDeleteRow(null)
  }

  const dateTimeColId = React.useMemo(() => {
    for (const colId of Object.keys(columns)) {
      if (columns[colId]?.name === DATE_TIME_COL_NAME) return colId
    }
    return null
  }, [columns])

  // Display format pulls from Redux: the selector reads the active
  // scenario's date-time column unit_id, looks it up in the catalog, and
  // falls back to the data type's is_base unit. Centralising the lookup
  // means any other consumer (preview, export, etc.) sees the same string.
  const dateTimeCol = dateTimeColId != null ? columns[dateTimeColId] : undefined
  const dateFormat = useSelector(selectActiveDateTimeFormat)

  const handleDateTimePatch = React.useCallback(
    (patch: UpdateColumnPatch): void => {
      if (!dateTimeCol) return
      dispatchHeaderPatch(dateTimeCol, patch)
    },
    // dispatchHeaderPatch closes over projectId/scenarioId/dispatch — its
    // identity changes on render, so we don't memoize it here; the inner
    // ref-read still produces a stable PATCH.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateTimeCol]
  )

  // Columns rendered in the table body: hide check (rendered as the leftmost
  // checkbox column instead) and hide the raw date/time pseudo-columns when
  // the merged date-time column is present.
  const visibleColumnOrder = React.useMemo(
    () =>
      columnOrder.filter((colId) => {
        if (colId === checkColId) return false
        if (dateTimeColId != null && (colId === DATE_COL_ID || colId === TIME_COL_ID)) {
          return false
        }
        return true
      }),
    [columnOrder, checkColId, dateTimeColId]
  )

  // Per-row check-cell handler. Toggle flips "1" ↔ "0" via the same
  // optimistic UPDATE_CELL_LOCAL path the saga already handles for normal
  // cell edits — so the value persists round-trip. Stable across renders so
  // the memoized row component can skip reconciliation.
  const checkColIdRef = React.useRef(checkColId)
  React.useEffect(() => {
    checkColIdRef.current = checkColId
  }, [checkColId])
  const toggleCheck = React.useCallback(
    (rowId: string, currentValue: CellValue): void => {
      const pid = projectIdRef.current
      const sid = scenarioIdRef.current
      const cid = checkColIdRef.current
      if (!pid || !sid || !cid) return
      const next = currentValue === '1' ? '0' : '1'
      dispatch(
        updateCellLocal({
          projectId: pid,
          scenarioId: sid,
          rowId,
          colId: cid,
          value: next,
          validationError: null
        })
      )
    },
    [dispatch]
  )

  // Header select-all when the check column is present: dispatch one
  // UPDATE_CELL_LOCAL per row, flipping every row to match the inverse of
  // "are they all currently checked".
  const toggleAllCheck = (): void => {
    if (!projectId || !scenarioId || !checkColId) return
    const next = allChecked ? '0' : '1'
    // console.log(projectId, scenarioId, checkColId, next)

    dispatch(updateAllCheckboxesRequested(projectId, scenarioId, checkColId, next))
  }

  // Vertical divider rendered as an absolutely-positioned pseudo-element so
  // the line can be shorter than the header cell — centered, ~60% of the
  // cell height, 2px wide. The cell needs `relative` to anchor it.
  const headerDivider =
    "relative after:absolute after:right-0 after:top-[20%] after:bottom-[20%] after:w-0.5 after:bg-white/40 after:content-['']"

  // Header lives outside the scroll container so the body's vertical
  // scrollbar starts beneath the header strip rather than extending up to
  // the very top. The strip uses `overflow-x: clip` (not `hidden`) so that
  // header dropdowns (DataTypeUnitPicker, DateTimeHeader) can extend
  // vertically below the strip without being clipped — a side effect of
  // the spec rule that `overflow-x: hidden` forces `overflow-y` to also
  // clip. Because `clip` disallows programmatic `scrollLeft`, we sync the
  // horizontal pan via CSS `translateX()` on the header table instead.
  const headerTableRef = React.useRef<HTMLTableElement>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)

  const totalRows = rowOrder.length
  React.useEffect(() => {
    totalRowsRef.current = totalRows
  }, [totalRows])
  React.useEffect(() => {
    viewportHeightRef.current = bodyViewportHeight
  }, [bodyViewportHeight])

  // Recompute the visible band off the latest scrollTop / viewport / row
  // count. Setter is functional and short-circuits when the band is
  // unchanged so scroll events within the same row interval are free.
  const recomputeWindow = React.useCallback(() => {
    const viewportRows = Math.max(1, Math.ceil(viewportHeightRef.current / ROW_HEIGHT_PX))
    const startIndex = Math.max(0, Math.floor(scrollTopRef.current / ROW_HEIGHT_PX) - ROW_OVERSCAN)
    const endIndex = Math.min(totalRowsRef.current, startIndex + viewportRows + ROW_OVERSCAN * 2)
    setVisibleWindow((prev) =>
      prev.startIndex === startIndex && prev.endIndex === endIndex
        ? prev
        : { startIndex, endIndex }
    )
  }, [])

  // Recompute when row count or viewport size changes (scroll position is
  // preserved via the ref).
  React.useEffect(() => {
    recomputeWindow()
  }, [recomputeWindow, totalRows, bodyViewportHeight])

  const onBodyScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>): void => {
      // Pan the header synchronously — visual fidelity during momentum
      // scroll matters more here than batching, and a transform write is
      // essentially free (no layout / paint of the table body).
      if (headerTableRef.current) {
        headerTableRef.current.style.transform = `translateX(-${e.currentTarget.scrollLeft}px)`
      }
      scrollTopRef.current = e.currentTarget.scrollTop
      // Synchronous compute + setState. The setter inside recomputeWindow
      // short-circuits when the band hasn't changed, so within-band scrolls
      // are essentially free (a few math ops, no React re-render). For
      // jump-scrolls (scrollbar-track click, drag) this updates the band
      // before the browser paints, so the destination renders rows in the
      // same frame instead of flashing the spacer for a frame first.
      recomputeWindow()
    },
    [recomputeWindow]
  )

  React.useEffect(() => {
    if (!bodyRef.current) return
    const el = bodyRef.current
    setBodyViewportHeight(el.clientHeight)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setBodyViewportHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const visibleRowIds = React.useMemo(
    () => rowOrder.slice(visibleWindow.startIndex, visibleWindow.endIndex),
    [rowOrder, visibleWindow]
  )

  const topSpacerHeight = visibleWindow.startIndex * ROW_HEIGHT_PX
  const bottomSpacerHeight = Math.max(0, (totalRows - visibleWindow.endIndex) * ROW_HEIGHT_PX)
  const spacerColSpan = visibleColumnOrder.length + 3

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-dark">
      {/* Header strip — overflow-x: clip so its own scrollbar never shows
          AND so dropdowns inside the header (Data Type / Date-Time) can
          extend vertically below the strip without being clipped. The
          horizontal pan is applied as a transform on the inner table. */}
      <div className="relative z-10 overflow-x-clip bg-neutral-900 pr-[22px]">
        <table ref={headerTableRef} className="w-full border-collapse text-sm text-neutral-200">
          <thead>
            <tr className="border-b border-app-border">
              <th className={`w-12 ${headerDivider} px-3 py-2 text-left align-middle`}>
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={checkColId != null ? allChecked : allSelected}
                  onChange={checkColId != null ? toggleAllCheck : toggleAll}
                  className="h-4 w-4 accent-blue-600"
                />
              </th>
              {visibleColumnOrder.map((colId) => {
                const col = columns[colId]
                if (!col) return null
                const managed = isBackendManagedCol(col)
                const isDateTime = colId === dateTimeColId
                const widthCls = isDateTime
                  ? 'w-[269px] min-w-[269px] max-w-[269px]'
                  : managed
                    ? 'w-[162px] min-w-[162px] max-w-[162px]'
                    : 'w-32 min-w-32 max-w-32'
                const alignCls = managed ? 'align-top' : 'align-middle'
                return (
                  <th
                    key={colId}
                    className={`${widthCls} ${alignCls} ${headerDivider} px-3 py-2 text-left font-bold text-neutral-300`}
                  >
                    {managed ? (
                      <HeaderEditor
                        col={col}
                        dataTypes={dataTypes}
                        onPatch={(patch) => dispatchHeaderPatch(col, patch)}
                        onDelete={() => handleRequestHeaderDelete(col)}
                      />
                    ) : isDateTime ? (
                      <DateTimeHeader
                        dataType={dateTimeDataType}
                        currentUnitId={dateTimeCol?.unitId ?? null}
                        onPatch={handleDateTimePatch}
                      />
                    ) : (
                      <span className="block truncate">{col.name}</span>
                    )}
                  </th>
                )
              })}
              <th
                className={`w-20 min-w-20 max-w-20 ${headerDivider} px-3 py-2 text-left align-middle font-bold text-neutral-300`}
              >
                Action
              </th>
              <th aria-hidden className="w-auto" />
            </tr>
          </thead>
        </table>
      </div>

      {/* Body — owns both scrollbars. */}
      <div ref={bodyRef} className="scrollbar-custom flex-1 overflow-auto" onScroll={onBodyScroll}>
        <table className="w-full border-collapse text-sm text-neutral-200">
          <tbody>
            {topSpacerHeight > 0 && (
              <tr aria-hidden="true">
                <td colSpan={spacerColSpan} style={{ height: topSpacerHeight, padding: 0 }} />
              </tr>
            )}
            {visibleRowIds.map((rowId) => (
              <WeatherRow
                key={rowId}
                rowId={rowId}
                row={table?.rows[rowId] ?? EMPTY_ROW}
                rowValidationErrors={table?.validationErrors?.[rowId]}
                rowSelected={rowSelection[rowId] === true}
                visibleColumnOrder={visibleColumnOrder}
                columns={columns}
                dataTypes={dataTypes}
                scenarioId={scenarioId}
                checkColId={checkColId}
                dateTimeColId={dateTimeColId}
                dateFormat={dateFormat}
                utcOffset={activeProject?.utc_offset ?? ''}
                onToggleRow={toggleRow}
                onToggleCheck={toggleCheck}
                onCellBlur={handleCellBlur}
                onRequestDelete={handleRequestRowDelete}
              />
            ))}
            {bottomSpacerHeight > 0 && (
              <tr aria-hidden="true">
                <td colSpan={spacerColSpan} style={{ height: bottomSpacerHeight, padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        isOpen={pendingDeleteColumn !== null}
        title={messages.deleteColumn.dialogTitle}
        onClose={handleCancelHeaderDelete}
      >
        <h3 className="text-base font-medium text-white">
          {pendingDeleteColumn ? messages.deleteColumn.heading(pendingDeleteColumn.name) : ''}
        </h3>
        <p className="text-sm text-neutral-400">{messages.deleteColumn.body}</p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleCancelHeaderDelete}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
          >
            {messages.deleteColumn.cancelButton}
          </button>
          <button
            type="button"
            onClick={handleConfirmHeaderDelete}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
          >
            {messages.deleteColumn.confirmButton}
          </button>
        </div>
      </Dialog>

      <Dialog
        isOpen={pendingDeleteRow !== null}
        title={messages.deleteRow.dialogTitle}
        onClose={handleCancelRowDelete}
      >
        <h3 className="text-base font-medium text-white">{messages.deleteRow.heading}</h3>
        <p className="text-sm text-neutral-400">{messages.deleteRow.body}</p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleCancelRowDelete}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
          >
            {messages.deleteRow.cancelButton}
          </button>
          <button
            type="button"
            onClick={handleConfirmRowDelete}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
          >
            {messages.deleteRow.confirmButton}
          </button>
        </div>
      </Dialog>
    </div>
  )
}

export default WeatherTable
