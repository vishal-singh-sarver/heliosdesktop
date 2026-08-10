import chevronDown from '@renderer/assets/ChevronDownIcon.svg'
import type { DataTypeDef, UpdateColumnPatch } from 'containers/ProjectScreen/types'
import React from 'react'
import { showFullTextOnHover } from 'utils/truncationTooltip'

// The date-time column uses the `date_time` catalog data type implicitly —
// its `units[]` are format patterns ("MM/DD/YYYY HH:MM") rather than numeric
// conversions. Picking a unit here PATCHes both helios_data_type_id and
// unit_id atomically (same contract as DataTypeUnitPicker for regular
// columns) so the backend always sees a (type, unit) pair, never a half-set
// header. Display falls back to the data type's is_base unit while the
// column has no unit committed yet.

interface Props {
  dataType: DataTypeDef | undefined
  currentUnitId: number | null
  onPatch: (patch: UpdateColumnPatch) => void
}

function DateTimeHeader({ dataType, currentUnitId, onPatch }: Props): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const units = dataType?.units ?? []

  const pickUnit = (unitId: number): void => {
    if (!dataType || unitId === currentUnitId) {
      setOpen(false)
      return
    }
    // Always send both ids — the seeded date-time column starts with
    // dataTypeId: null, so the first pick has to commit the type alongside
    // the unit. Subsequent picks send the same dataTypeId, which is a no-op
    // server-side but keeps the wire payload uniform.
    onPatch({ dataTypeId: dataType.id, unitId })
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-neutral-200 hover:text-white focus:outline-none"
      >
        <span>Date-Time</span>
        <img src={chevronDown} alt="" aria-hidden="true" className="h-2 w-2.5 opacity-80" />
      </button>
      {open && (
        <div
          role="listbox"
          className="scrollbar-custom-thin absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-app-border bg-app-panel py-1 shadow-lg"
        >
          {units.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-500">No formats</div>
          ) : (
            units.map((u) => {
              const isSelected = u.id === currentUnitId
              return (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pickUnit(u.id)}
                  onMouseEnter={showFullTextOnHover}
                  className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-neutral-800 ${
                    isSelected ? 'bg-neutral-800 text-white' : 'text-neutral-300'
                  }`}
                >
                  {u.unit}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default DateTimeHeader
