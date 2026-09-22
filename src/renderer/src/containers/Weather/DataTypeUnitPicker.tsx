import {
  type ColumnDef,
  type DataTypeDef,
  type UpdateColumnPatch
} from 'containers/ProjectScreen/types'
import React from 'react'
import { showFullTextOnHover } from 'utils/truncationTooltip'

// One button + popover. The popover has two steps:
//   1. Data type list (shown when no data type is set, or after the user clicks
//      "Back to Assign Type").
//   2. Unit list for the chosen data type, with a "Back to Assign Type" header
//      link that returns to step 1.
// Data type + unit are an atomic pair: picking a data type stashes it as
// *pending* locally (no patch yet) and advances to step 2; picking a unit
// then commits { dataTypeId, unitId } together. Closing the popover without
// picking a unit discards the pending data type — leaving a type set with
// no unit would let the saga run a conversion against an assumed unit the
// user never chose.

interface DataTypeUnitPickerProps {
  col: ColumnDef
  dataTypes: DataTypeDef[]
  currentDataType: DataTypeDef | undefined
  unitsForType: DataTypeDef['units']
  onPatch: (patch: UpdateColumnPatch) => void
}

function DataTypeUnitPicker({
  col,
  dataTypes,
  currentDataType,
  unitsForType,
  onPatch
}: DataTypeUnitPickerProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<'type' | 'unit'>(col.dataTypeId == null ? 'type' : 'unit')
  const [pendingDataTypeId, setPendingDataTypeId] = React.useState<number | null>(null)
  const wrapRef = React.useRef<HTMLDivElement>(null)

  // Derived during render rather than in an effect, so the popover never paints
  // a frame with the previous open-state's view.
  const [lastSeenOpen, setLastSeenOpen] = React.useState(open)
  const [lastSeenDataTypeId, setLastSeenDataTypeId] = React.useState(col.dataTypeId)
  if (lastSeenOpen !== open || lastSeenDataTypeId !== col.dataTypeId) {
    setLastSeenOpen(open)
    setLastSeenDataTypeId(col.dataTypeId)
    if (!open) {
      // Closing always discards a pending data type — only an explicit unit
      // pick commits the pair, per the atomic-pair contract above.
      setPendingDataTypeId(null)
    } else {
      setView(col.dataTypeId == null ? 'type' : 'unit')
    }
  }

  React.useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const currentUnit = currentDataType?.units.find((u) => u.id === col.unitId)

  const buttonLabel = currentUnit
    ? currentUnit.unit
    : currentDataType
      ? currentDataType.data_type
      : 'Data Type'

  // When a pending data type is selected, the unit list must reflect that
  // pending type's units (the parent's `unitsForType` prop is derived from
  // the committed `col.dataTypeId` and is stale during the pending step).
  const pendingDataType =
    pendingDataTypeId == null ? undefined : dataTypes.find((dt) => dt.id === pendingDataTypeId)
  const unitsToShow = pendingDataType ? pendingDataType.units : unitsForType

  const pickDataType = (dtId: number): void => {
    // Stash the choice locally and advance to the unit step. The patch is
    // deferred until the user picks a unit, so a half-finished selection
    // can't leave a data type committed without a matching unit.
    setPendingDataTypeId(dtId === col.dataTypeId ? null : dtId)
    setView('unit')
  }

  const pickUnit = (unitId: number): void => {
    if (pendingDataTypeId != null) {
      onPatch({ dataTypeId: pendingDataTypeId, unitId })
    } else if (unitId !== col.unitId) {
      onPatch({ unitId })
    }
    setPendingDataTypeId(null)
    setOpen(false)
  }

  const handleBackToAssignType = (): void => {
    if (pendingDataTypeId != null) {
      // Pending selection wasn't committed — just discard it and return to
      // the type list. The column's stored type/unit are untouched.
      setPendingDataTypeId(null)
    } else {
      onPatch({ dataTypeId: null, unitId: null })
    }
    setView('type')
  }

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={`Column ${col.id} data type and unit`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1 rounded border border-app-border bg-[#424242] px-2 py-1 text-xs text-neutral-200 outline-none hover:border-neutral-500 focus:border-neutral-500"
      >
        <span className="truncate" onMouseEnter={showFullTextOnHover}>
          {buttonLabel}
        </span>
        <span aria-hidden className="text-neutral-400">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="scrollbar-custom-thin absolute left-0 top-full z-20 mt-1 max-h-[260px] w-[216px] overflow-y-auto overflow-x-hidden rounded border border-app-border bg-[#1f1f1f] py-1 shadow-lg"
        >
          {view === 'unit' && (
            <button
              type="button"
              onClick={handleBackToAssignType}
              className="mb-1 flex h-8 w-full items-center gap-1 bg-neutral-200 px-3 text-left text-xs text-[#245AC5] hover:bg-neutral-100"
            >
              <span
                className="h-5 w-[134px] font-main text-[13px] font-medium leading-5 tracking-normal text-[#245AC5]"
              >
                ‹ Back to Assign Type
              </span>
            </button>
          )}
          {view === 'type' &&
            dataTypes.map((dt) => {
              const selectedId = pendingDataTypeId ?? col.dataTypeId
              const isSelected = dt.id === selectedId
              return (
                <button
                  key={dt.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pickDataType(dt.id)}
                  onMouseEnter={showFullTextOnHover}
                  className={`block h-[42px] w-full truncate px-3 text-left text-xs leading-[42px] hover:bg-[#2b2b2b] ${
                    isSelected ? 'bg-[#111111] text-neutral-100' : 'text-neutral-300'
                  }`}
                >
                  {dt.data_type}
                </button>
              )
            })}
          {view === 'unit' &&
            (unitsToShow.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-500">No units</div>
            ) : (
              unitsToShow.map((u) => {
                // Don't highlight the committed unitId while a pending data
                // type is staged — the committed unit belongs to the old
                // type and isn't a valid selection in the pending list.
                const isSelected = pendingDataTypeId == null && u.id === col.unitId
                return (
                  <button
                    key={u.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pickUnit(u.id)}
                    className={`flex h-[42px] w-full items-center justify-between gap-3 px-3 text-left text-xs hover:bg-[#2b2b2b] ${
                      isSelected ? 'bg-[#111111] text-neutral-100' : 'text-neutral-300'
                    }`}
                  >
                    <span className="truncate" onMouseEnter={showFullTextOnHover}>
                      {u.alias ? `${u.unit} (${u.alias})` : u.unit}
                    </span>
                  </button>
                )
              })
            ))}
        </div>
      )}
    </div>
  )
}

export default DataTypeUnitPicker
