import React, { useMemo } from 'react'
import { InfoIcon } from './Icons'
import type { StepReviewProps } from './types'

function fmtBritish(d: Date | null): string {
  if (!d) return 'Invalid'
  // Parsed dates are anchored in UTC (see buildDate in parsers.ts), so format
  // in UTC to show the file's wall-clock values exactly, not shifted by the
  // host timezone.
  return d.toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function StepReview({
  parsed,
  parsedDateTimes,
  dtColumns,
  columnSelection,
  disabledColumnIndices,
  onToggleColumn,
  onToggleAll
}: StepReviewProps): React.JSX.Element {
  const dtSet = useMemo(() => new Set(dtColumns), [dtColumns])
  const disabledSet = useMemo(() => new Set(disabledColumnIndices), [disabledColumnIndices])
  const selectableIndices = useMemo(
    () => parsed.headers.flatMap((h, i) => (dtSet.has(h) || disabledSet.has(i) ? [] : [i])),
    [parsed.headers, dtSet, disabledSet]
  )
  const allSelectableChecked =
    selectableIndices.length > 0 && selectableIndices.every((i) => columnSelection[i] !== false)

  const dtPreview = parsedDateTimes
    .slice(0, 3)
    .map((d) => fmtBritish(d))
    .join(', ')

  return (
    <div className="flex flex-col gap-4 overflow-hidden px-6 pb-2">
      <div className="text-sm text-neutral-300">
        Review columns to import. Uncheck columns you want to exclude.
      </div>

      {disabledColumnIndices.length > 0 && (
        <div className="flex items-start gap-2 rounded-[3px] bg-[#edf3ff] px-3 py-3 text-sm text-[#245AC5]">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="font-medium">
            Character-based columns are disabled as this input is unsupported
          </div>
        </div>
      )}

      <label className="flex items-center gap-3 text-sm text-neutral-100">
        <input
          type="checkbox"
          data-testid="dt-select-all"
          checked={allSelectableChecked}
          onChange={(e) => onToggleAll(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[#245AC5]"
        />
        <span>Select All</span>
      </label>

      <div
        className="flex-1 overflow-auto rounded-[3px] border border-[#3f3f46] bg-[#262626] scrollbar-custom"
        style={{ maxHeight: 320 }}
      >
        <table className="w-full text-sm">
          <tbody>
            {/* Synthetic Date-Time row — always included, cannot be excluded */}
            <tr className="border-b border-[#4b4b4b] bg-[#3a3a3a]">
              <td className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked
                  disabled
                  readOnly
                  className="h-4 w-4 cursor-not-allowed accent-[#245AC5] opacity-60"
                  title="Date-Time is required and cannot be excluded"
                />
              </td>
              <td className="px-2 py-3 font-medium text-neutral-500">
                Date-Time
              </td>
              <td className="px-4 py-3 text-neutral-500">{dtPreview}</td>
            </tr>

            {parsed.headers.map((h, i) => {
              if (dtSet.has(h)) return null
              const disabled = disabledSet.has(i)
              const checked = !disabled && columnSelection[i] !== false
              const examples = parsed.rows
                .slice(0, 3)
                .map((r) => r[i])
                .join(', ')
              return (
                <tr
                  key={i}
                  className={`border-b border-[#4b4b4b] last:border-0 ${disabled ? 'bg-[#313131]' : 'bg-[#262626]'}`}
                >
                  <td className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      data-testid={`dt-col-${h}`}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onToggleColumn(i)}
                      className={`h-4 w-4 accent-[#245AC5] ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    />
                  </td>
                  <td className={`${disabled ? 'text-neutral-500' : 'text-neutral-100'} px-2 py-3`}>
                    {h}
                  </td>
                  <td className={`${disabled ? 'text-neutral-500' : 'text-neutral-200'} px-4 py-3`}>
                    {examples}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-white">
        Date/Time column(s) will be merged into the “Date-Time” column automatically.
      </div>
    </div>
  )
}
