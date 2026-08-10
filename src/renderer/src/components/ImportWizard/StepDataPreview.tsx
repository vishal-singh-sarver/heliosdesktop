import React from 'react'
import { DELIMITERS } from 'containers/Weather/parsers'
import { AlertTriangleIcon } from './Icons'
import { Select, TextInput } from './primitives'
import type { StepDataPreviewProps } from './types'

const XML_OPTION = [{ value: '__xml__', label: 'XML — auto-structured' }]

export default function StepDataPreview({
  parsed,
  parseError,
  onChangeDelimiter,
  onChangeSkip
}: StepDataPreviewProps): React.JSX.Element {
  const isXml = parsed.format === 'xml'
  const previewRows = parsed.rows.slice(0, 12)

  return (
    <div className="flex flex-col gap-4 overflow-hidden px-6 pb-2">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="mb-2 block text-sm text-neutral-200">Delimiter</label>
          <Select
            testId="dt-delimiter"
            value={isXml ? '__xml__' : parsed.delimiter}
            onChange={(v) => {
              if (v) onChangeDelimiter(v)
            }}
            disabled={isXml}
            placeholder={isXml ? 'Not applicable for XML' : 'Select delimiter'}
            options={isXml ? XML_OPTION : DELIMITERS}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-neutral-200">Header Lines to Skip</label>
          <TextInput
            data-testid="dt-header-skip"
            type="number"
            min={0}
            value={isXml ? 0 : parsed.headerLinesToSkip}
            onChange={(e) =>
              onChangeSkip(Math.max(0, parseInt(e.target.value, 10) || 0))
            }
            disabled={isXml}
          />
        </div>
      </div>

      {parseError && (
        <div className="flex items-start gap-2 rounded border border-amber-900/40 bg-amber-900/15 px-3 py-2 text-sm text-amber-300">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong className="font-semibold">Parse error: </strong>
            {parseError}{' '}
            <span className="text-amber-300/70">Showing the previous successful parse.</span>
          </div>
        </div>
      )}

      <div
        className="flex-1 overflow-auto rounded border border-app-border scrollbar-custom"
        style={{ maxHeight: 300 }}
      >
        {/* border-collapse + per-cell grey borders → Excel-style grid */}
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[#3a3a3a]">
            <tr>
              {parsed.headers.map((h, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap border border-neutral-500 px-4 py-2.5 text-left font-medium text-neutral-200"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="whitespace-nowrap border border-neutral-500 px-4 py-2 text-neutral-200"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="mb-2 text-sm text-neutral-300">Column Labels Preview</div>
        <div className="flex flex-wrap gap-2">
          {parsed.headers.map((h, i) => (
            <span
              key={i}
              className="rounded-[3px] border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-900"
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
