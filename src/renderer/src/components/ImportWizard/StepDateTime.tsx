import {
  DATE_FORMATS,
  DATETIME_FORMATS,
  parseRowDateTimeSelections,
  type DateFormatKey,
  type DateTimeFormatKey,
  type DateTimeMapping,
  type DateSelectionMode
} from 'containers/Weather/parsers'
import React, { useMemo } from 'react'
import { AlertTriangleIcon, CheckCircleIcon } from './Icons'
import { Select, type SelectOption } from './primitives'
import type { StepDateTimeProps } from './types'

const DATE_PART_KEYS: ReadonlyArray<keyof DateTimeMapping> = ['year', 'month', 'day']
const JULIAN_KEYS: ReadonlyArray<keyof DateTimeMapping> = ['julianYear', 'julianDay']
const PREVIEW_ROW_COUNT = 8

interface PreviewRow {
  raw: string
  parsedStr: string
  valid: boolean
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

interface GroupedChoiceProps {
  selected: boolean
  disabled?: boolean
  onSelect?: () => void
  children: React.ReactNode
  /** Stable e2e hook on the radio button. */
  testId?: string
}

interface RadioIndicatorProps {
  selected: boolean
  disabled?: boolean
}

interface ModeChoiceProps {
  modeKey: DateSelectionMode
  activeMode: DateSelectionMode
  label: string
  children: React.ReactNode
  onSelect: (mode: DateSelectionMode) => void
}

interface FieldRowProps {
  label: string
  children: React.ReactNode
  emphasized?: boolean
  muted?: boolean
}

function fmtPreviewDateTime(d: Date): string {
  // Parsed dates are anchored in UTC (see buildDate in parsers.ts), so the
  // preview must format in UTC to echo the file's wall-clock values exactly —
  // otherwise the host timezone would shift the displayed time.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d)
}

function Section({ title, children }: SectionProps): React.JSX.Element {
  return (
    <section className="overflow-hidden rounded-[3px] border border-[#3b3b3b] bg-[#323232]">
      <div className="border-b border-[#454545] bg-[#474747] px-4 py-2 text-sm font-medium text-neutral-100">
        {title}
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  )
}

function GroupedChoice({
  selected,
  disabled = false,
  onSelect,
  children,
  testId
}: GroupedChoiceProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-4">
      <button
        type="button"
        data-testid={testId}
        onClick={onSelect}
        disabled={!onSelect}
        className="flex items-start justify-center pt-[10px] disabled:cursor-default"
      >
        <RadioIndicator selected={selected} disabled={disabled} />
      </button>
      <div className={['min-w-0 pt-[2px]', disabled ? 'opacity-60' : ''].join(' ')}>{children}</div>
    </div>
  )
}

function RadioIndicator({ selected, disabled = false }: RadioIndicatorProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={[
        'block h-4 w-4 rounded-full border transition-colors',
        disabled
          ? 'border-neutral-600 bg-neutral-700'
          : selected
          ? 'border-[#d4d4d4] bg-[#245AC5] shadow-[inset_0_0_0_2px_#323232]'
          : 'border-neutral-300 bg-transparent'
      ].join(' ')}
    />
  )
}

function FieldRow({ label, children, emphasized, muted }: FieldRowProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-[118px_minmax(0,1fr)] items-center gap-[14px]">
      <label
        className={[
          'text-sm',
          emphasized ? 'text-white' : 'text-neutral-200',
          muted ? 'opacity-60' : ''
        ].join(' ')}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function ModeChoice({
  modeKey,
  activeMode,
  label,
  children,
  onSelect
}: ModeChoiceProps): React.JSX.Element {
  const selected = activeMode === modeKey

  return (
    <GroupedChoice
      selected={selected}
      onSelect={() => onSelect(modeKey)}
      testId={`dt-datemode-${modeKey}`}
    >
      <div aria-label={label}>{children}</div>
    </GroupedChoice>
  )
}

function DateGroupFields({
  mapping,
  onChangeMapping,
  allOptions,
  disabled
}: {
  mapping: DateTimeMapping
  onChangeMapping: (key: keyof DateTimeMapping, value: string | null) => void
  allOptions: ReadonlyArray<SelectOption>
  disabled: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <FieldRow label="Day" emphasized>
        <Select
          testId="dt-day"
          value={mapping.day}
          onChange={(v) => onChangeMapping('day', v)}
          options={allOptions}
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label="Month">
        <Select
          testId="dt-month"
          value={mapping.month}
          onChange={(v) => onChangeMapping('month', v)}
          options={allOptions}
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label="Year">
        <Select
          testId="dt-year"
          value={mapping.year}
          onChange={(v) => onChangeMapping('year', v)}
          options={allOptions}
          disabled={disabled}
        />
      </FieldRow>
    </div>
  )
}

function JulianFields({
  mapping,
  onChangeMapping,
  allOptions,
  disabled
}: {
  mapping: DateTimeMapping
  onChangeMapping: (key: keyof DateTimeMapping, value: string | null) => void
  allOptions: ReadonlyArray<SelectOption>
  disabled: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <FieldRow label="Julian Year" emphasized>
        <Select
          testId="dt-julianYear"
          value={mapping.julianYear}
          onChange={(v) => onChangeMapping('julianYear', v)}
          options={allOptions}
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label="Julian Day">
        <Select
          testId="dt-julianDay"
          value={mapping.julianDay}
          onChange={(v) => onChangeMapping('julianDay', v)}
          options={allOptions}
          disabled={disabled}
        />
      </FieldRow>
    </div>
  )
}

function DateStringFields({
  dateFormat,
  onChangeDateFormat,
  mapping,
  onChangeMapping,
  allOptions,
  disabled
}: {
  dateFormat: DateFormatKey
  onChangeDateFormat: (value: DateFormatKey) => void
  mapping: DateTimeMapping
  onChangeMapping: (key: keyof DateTimeMapping, value: string | null) => void
  allOptions: ReadonlyArray<SelectOption>
  disabled: boolean
}): React.JSX.Element {
  return (
    <FieldRow label="Date String" emphasized>
      <div className="grid grid-cols-2 gap-3">
        <Select
          testId="dt-date-format"
          value={dateFormat}
          onChange={(v) => {
            if (v) onChangeDateFormat(v as DateFormatKey)
          }}
          options={DATE_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
          placeholder="Select Date Format"
          disabled={disabled}
        />
        <Select
          testId="dt-date"
          value={mapping.date}
          onChange={(v) => onChangeMapping('date', v)}
          options={allOptions}
          disabled={disabled}
        />
      </div>
    </FieldRow>
  )
}

function DateTimeFields({
  datetimeFormat,
  onChangeDateTimeFormat,
  mapping,
  onChangeMapping,
  allOptions,
  disabled
}: {
  datetimeFormat: DateTimeFormatKey
  onChangeDateTimeFormat: (value: DateTimeFormatKey) => void
  mapping: DateTimeMapping
  onChangeMapping: (key: keyof DateTimeMapping, value: string | null) => void
  allOptions: ReadonlyArray<SelectOption>
  disabled: boolean
}): React.JSX.Element {
  return (
    <FieldRow label="Date-Time" emphasized>
      <div className="grid grid-cols-2 gap-3">
        <Select
          testId="dt-datetime-format"
          value={datetimeFormat}
          onChange={(v) => {
            if (v) onChangeDateTimeFormat(v as DateTimeFormatKey)
          }}
          options={DATETIME_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
          placeholder="Select Date Format"
          disabled={disabled}
        />
        <Select
          testId="dt-datetime"
          value={mapping.datetime}
          onChange={(v) => onChangeMapping('datetime', v)}
          options={allOptions}
          disabled={disabled}
        />
      </div>
    </FieldRow>
  )
}

export default function StepDateTime({
  parsed,
  dateMode,
  onChangeDateMode,
  timeMode,
  onChangeTimeMode,
  mapping,
  onChangeMapping,
  dateFormat,
  onChangeDateFormat,
  datetimeFormat,
  onChangeDateTimeFormat,
  ambiguousDateFormat,
  stats
}: StepDateTimeProps): React.JSX.Element {
  // Keep all source columns available in every dropdown so the UI can mirror
  // designs where multiple date/time parts point at the same input column.
  const allOptions: SelectOption[] = parsed.headers.map((h, i) => ({ value: h, label: `${i + 1}: ${h}` }))
  const timeDisabled = dateMode === 'datetime'

  const previewRows: PreviewRow[] = useMemo(() => {
    return parsed.rows.slice(0, PREVIEW_ROW_COUNT).map((row) => {
      const getMappedValue = (key: keyof DateTimeMapping): string | null => {
        const colName = mapping[key]
        if (!colName) return null
        const idx = parsed.headers.indexOf(colName)
        return idx >= 0 ? row[idx] : null
      }

      const dateRaw =
        dateMode === 'string'
          ? getMappedValue('date')
          : dateMode === 'datetime'
            ? getMappedValue('datetime')
            : dateMode === 'julian'
              ? JULIAN_KEYS.map((k) => getMappedValue(k)).filter((v): v is string => Boolean(v)).join(' ')
              : DATE_PART_KEYS.map((k) => getMappedValue(k)).filter((v): v is string => Boolean(v)).join(' ')

      const timeRaw =
        timeDisabled || timeMode === 'none'
          ? ''
          : timeMode === 'parts'
            ? ['hour', 'minute']
                .map((k) => {
                  const colName = mapping[k as keyof DateTimeMapping]
                  if (!colName) return null
                  const idx = parsed.headers.indexOf(colName)
                  return idx >= 0 ? row[idx] : null
                })
                .filter((v): v is string => Boolean(v))
                .join(' ')
            : getMappedValue('time') ?? ''

      const raw = [dateRaw, timeRaw].filter(Boolean).join(' ')

      const result = parseRowDateTimeSelections(
        row,
        parsed.headers,
        dateMode,
        timeDisabled ? 'none' : timeMode,
        mapping,
        dateFormat,
        datetimeFormat
      )
      if (result.kind === 'ok') {
        return { raw, parsedStr: fmtPreviewDateTime(result.date), valid: true }
      }
      if (result.kind === 'invalid_time') {
        return { raw, parsedStr: 'Invalid time format', valid: false }
      }
      return { raw, parsedStr: 'Invalid', valid: false }
    })
  }, [parsed, dateMode, timeMode, timeDisabled, mapping, dateFormat, datetimeFormat])

  return (
    <div className="flex max-h-full flex-col gap-5 overflow-y-auto px-6 pb-4 scrollbar-custom">
      <div className="text-sm text-neutral-300">Map each day/time component to a column.</div>

      {ambiguousDateFormat && (
        <div
          data-testid="dt-ambiguous-warning"
          role="status"
          className="flex items-start gap-2 rounded-[3px] border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-200"
        >
          <AlertTriangleIcon className="mt-[2px] h-4 w-4 shrink-0" />
          <span>
            Every date in this file fits <span className="font-medium">{ambiguousDateFormat}</span>,
            so the day and month cannot be told apart automatically. Confirm the date format below —
            the preview updates as you change it.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3 pr-1">
        <Section title="Date">
          <div className="flex flex-col gap-4">
            <ModeChoice
              modeKey="parts"
              activeMode={dateMode}
              label="day month year"
              onSelect={onChangeDateMode}
            >
              <DateGroupFields
                mapping={mapping}
                onChangeMapping={onChangeMapping}
                allOptions={allOptions}
                disabled={dateMode !== 'parts'}
              />
            </ModeChoice>

            <ModeChoice
              modeKey="string"
              activeMode={dateMode}
              label="date string"
              onSelect={onChangeDateMode}
            >
              <DateStringFields
                dateFormat={dateFormat}
                onChangeDateFormat={onChangeDateFormat}
                mapping={mapping}
                onChangeMapping={onChangeMapping}
                allOptions={allOptions}
                disabled={dateMode !== 'string'}
              />
            </ModeChoice>

            <GroupedChoice
              selected={dateMode === 'julian'}
              onSelect={() => onChangeDateMode('julian')}
              testId="dt-datemode-julian"
            >
              <JulianFields
                mapping={mapping}
                onChangeMapping={onChangeMapping}
                allOptions={allOptions}
                disabled={dateMode !== 'julian'}
              />
            </GroupedChoice>

            <ModeChoice modeKey="datetime" activeMode={dateMode} label="date-time" onSelect={onChangeDateMode}>
              <DateTimeFields
                datetimeFormat={datetimeFormat}
                onChangeDateTimeFormat={onChangeDateTimeFormat}
                mapping={mapping}
                onChangeMapping={onChangeMapping}
                allOptions={allOptions}
                disabled={dateMode !== 'datetime'}
              />
            </ModeChoice>
          </div>
        </Section>

        <Section title="Time">
          <div className="flex flex-col gap-4">
            <GroupedChoice
              selected={timeMode === 'parts' && !timeDisabled}
              disabled={timeDisabled}
              onSelect={timeDisabled ? undefined : () => onChangeTimeMode('parts')}
              testId="dt-timemode-parts"
            >
              <div className="flex flex-col gap-3">
                <FieldRow label="Hour" emphasized>
                  <Select
                    testId="dt-hour"
                    value={mapping.hour}
                    onChange={(v) => onChangeMapping('hour', v)}
                    options={allOptions}
                    disabled={timeDisabled || timeMode !== 'parts'}
                  />
                </FieldRow>
                <FieldRow label="Minute">
                  <Select
                    testId="dt-minute"
                    value={mapping.minute}
                    onChange={(v) => onChangeMapping('minute', v)}
                    options={allOptions}
                    disabled={timeDisabled || timeMode !== 'parts'}
                  />
                </FieldRow>
              </div>
            </GroupedChoice>

            <GroupedChoice
              selected={timeMode === 'string' && !timeDisabled}
              disabled={timeDisabled}
              onSelect={timeDisabled ? undefined : () => onChangeTimeMode('string')}
              testId="dt-timemode-string"
            >
              <FieldRow label="Hour:Minute" emphasized>
                <Select
                  testId="dt-time-string"
                  value={mapping.time}
                  onChange={(v) => onChangeMapping('time', v)}
                  options={allOptions}
                  disabled={timeDisabled || timeMode !== 'string'}
                />
              </FieldRow>
            </GroupedChoice>

            <GroupedChoice
              selected={timeMode === 'compact' && !timeDisabled}
              disabled={timeDisabled}
              onSelect={timeDisabled ? undefined : () => onChangeTimeMode('compact')}
              testId="dt-timemode-compact"
            >
              <FieldRow label="HourMinute" emphasized>
                <Select
                  testId="dt-time-compact"
                  value={mapping.time}
                  onChange={(v) => onChangeMapping('time', v)}
                  options={allOptions}
                  disabled={timeDisabled || timeMode !== 'compact'}
                />
              </FieldRow>
            </GroupedChoice>
          </div>
        </Section>
      </div>

      <div className="flex flex-col gap-2 pr-1">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-neutral-100">Date/Time Preview</div>
          {stats.configReady &&
            (stats.invalid === 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                All {stats.total} rows valid
              </div>
            ) : stats.valid === 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertTriangleIcon className="h-3.5 w-3.5" />0 of {stats.total} rows valid
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertTriangleIcon className="h-3.5 w-3.5" />
                {stats.valid} of {stats.total} valid · {stats.invalid} invalid
              </div>
            ))}
        </div>

        <div className="overflow-hidden rounded-[3px] border border-[#3b3b3b] bg-[#161616]">
          <table className="w-full text-sm">
            <thead className="bg-[#353535]">
              <tr>
                <th className="w-1/2 border-b border-[#4a4a4a] px-4 py-3 text-left font-medium text-neutral-100">
                  Raw
                </th>
                <th className="border-b border-[#4a4a4a] px-4 py-3 text-left font-medium text-neutral-100">
                  Parsed
                </th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[178px] overflow-y-auto scrollbar-custom">
            <table className="w-full text-sm">
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-[#343434] last:border-0">
                    <td className="w-1/2 px-4 py-3 text-neutral-100">
                      {r.raw || <span className="text-neutral-500">-- none --</span>}
                    </td>
                    <td
                      className={[
                        'px-4 py-3 whitespace-nowrap',
                        r.valid ? 'text-[#a7f3d0]' : 'text-[#fca5a5]'
                      ].join(' ')}
                    >
                      {r.parsedStr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
