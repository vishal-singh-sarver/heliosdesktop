import Spinner from 'components/LoadingScreen/Spinner'
import {
  DATETIME_FORMATS,
  INITIAL_MAPPING,
  parseDelimited,
  parseFile,
  parseRowDateTimeSelections,
  tryParseDate,
  tryParseDateTime,
  type DateFormatKey,
  type DateSelectionMode,
  type DateTimeFormatKey,
  type DateTimeMapping,
  type ImportedDataset,
  type ImportedDatasetColumn,
  type ImportedDatasetRecord,
  type ParseResult,
  type TimeSelectionMode
} from 'containers/Weather/parsers'
import React, { useCallback, useMemo, useState } from 'react'
import { isValidNumber, truncateToMaxDecimals, wouldTruncateAny } from 'utils/decimalValidation'
import { AlertTriangleIcon, ChevronLeftIcon, CloseIcon } from './Icons'
import { GhostBtn, PrimaryBtn, SecondaryBtn } from './primitives'
import StepDataPreview from './StepDataPreview'
import StepDateTime from './StepDateTime'
import StepFilePreview from './StepFilePreview'
import Stepper, { STEPS } from './Stepper'
import StepReview from './StepReview'
import type { DateTimeStats, ImportWizardProps } from './types'

const DATE_PART_KEYS: ReadonlyArray<keyof DateTimeMapping> = ['year', 'month', 'day']
const JULIAN_KEYS: ReadonlyArray<keyof DateTimeMapping> = ['julianYear', 'julianDay']
const TIME_PART_KEYS: ReadonlyArray<keyof DateTimeMapping> = ['hour', 'minute']

function isUnsupportedCharacterValue(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') return false
  return !isValidNumber(trimmed)
}

// Substring match on the header text, with an exact-match fallback for the
// terse abbreviations agency exports use. NASA POWER writes YEAR,MO,DY,HR — no
// substring of those contains "month"/"day"/"hour", so without the aliases the
// whole file is left unmapped. They are matched EXACTLY and only after the
// substring pass, so a short alias like "dy" can never hijack a column that a
// full keyword already describes.
const findHeaderByKeyword = (
  headers: string[],
  keywords: string[],
  exactAliases: string[] = []
): string | null => {
  const lower = headers.map((h) => h.toLowerCase().trim())
  const i = lower.findIndex((h) => keywords.some((k) => h.includes(k)))
  if (i >= 0) return headers[i]
  if (exactAliases.length === 0) return null
  const j = lower.findIndex((h) => exactAliases.includes(h))
  return j >= 0 ? headers[j] : null
}

// Day-first / month-first pairs that are indistinguishable from the data alone
// whenever every sampled day-of-month is <= 12. Detection has to pick one, so
// the UI warns and names the alternative rather than presenting a silent guess
// as "all rows valid".
const AMBIGUOUS_DATE_COUNTERPART: Partial<Record<DateFormatKey, DateFormatKey>> = {
  'DD/MM/YYYY': 'MM/DD/YYYY',
  'MM/DD/YYYY': 'DD/MM/YYYY',
  'DD-MM-YYYY': 'MM-DD-YYYY',
  'MM-DD-YYYY': 'DD-MM-YYYY'
}

const AMBIGUOUS_DATETIME_COUNTERPART: Partial<Record<DateTimeFormatKey, DateTimeFormatKey>> = {
  'DD/MM/YYYY HH:MM': 'MM/DD/YYYY HH:MM',
  'MM/DD/YYYY HH:MM': 'DD/MM/YYYY HH:MM',
  'DD-MM-YYYY HH:MM': 'MM-DD-YYYY HH:MM',
  'MM-DD-YYYY HH:MM': 'DD-MM-YYYY HH:MM'
}

const columnSamples = (headers: string[], rows: string[][], col: string): string[] => {
  const idx = headers.indexOf(col)
  if (idx < 0) return []
  return rows
    .map((r) => (r[idx] ?? '').trim())
    .filter(Boolean)
    .slice(0, DATE_FORMAT_SAMPLE_COUNT)
}

const detectDateTimeFormat = (
  headers: string[],
  rows: string[][],
  datetimeCol: string
): { format: DateTimeFormatKey; ambiguousWith: DateTimeFormatKey | null } | null => {
  const samples = columnSamples(headers, rows, datetimeCol)
  if (samples.length === 0) return null
  for (const { value } of DATETIME_FORMATS) {
    if (!tryParseDateTime(samples[0], value)) continue
    const counterpart = AMBIGUOUS_DATETIME_COUNTERPART[value] ?? null
    // Ambiguous only if the counterpart also parses EVERY sample; one row with
    // a day > 12 is enough to settle it.
    const ambiguousWith =
      counterpart && samples.every((s) => tryParseDateTime(s, counterpart)) ? counterpart : null
    return { format: value, ambiguousWith }
  }
  return null
}

// How many non-empty values a format is scored against. One sample is not
// enough to separate genuinely ambiguous layouts: "03/04/2026" parses under
// both DD/MM/YYYY and MM/DD/YYYY, and only a later row with a >12 first token
// rules one of them out.
const DATE_FORMAT_SAMPLE_COUNT = 20

// Does this column actually hold full date-times, whatever its header says?
// Header keywords alone mismap Open-Meteo exports: their column is named
// `time`, which matches the 'time' keyword long before 'datetime' is
// considered, so ISO values like "2024-01-01T00:00" were mapped as a
// time-of-day and never parsed. Value shape is the reliable signal.
const columnHoldsDateTimes = (headers: string[], rows: string[][], col: string): boolean => {
  const idx = headers.indexOf(col)
  if (idx < 0) return false
  const samples = rows
    .map((r) => (r[idx] ?? '').trim())
    .filter(Boolean)
    .slice(0, DATE_FORMAT_SAMPLE_COUNT)
  if (samples.length === 0) return false
  return samples.every((s) => DATETIME_FORMATS.some(({ value }) => tryParseDateTime(s, value)))
}

// Probe order, and the tiebreak when several formats parse every sample. It is
// DATE_FORMATS reordered so YYYY-MM-DD (the wizard's default, and the most
// common unambiguous layout) is tried before the compact YYYYMMDD, and so the
// day-first / month-first pairs keep their existing relative order.
const DATE_FORMAT_DETECTION_ORDER: ReadonlyArray<DateFormatKey> = [
  'YYYY-MM-DD',
  'YYYYMMDD',
  'YYYY/MM/DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'DD.MM.YYYY',
  'YYYY DOY',
  'DOY YYYY'
]

// Pick the date format that parses the most sampled values of the mapped date
// column. Without this the wizard left `dateFormat` at its 'YYYY-MM-DD'
// initial value, so a compact "20260203" column showed as Invalid until the
// user set the format by hand. Returns null when nothing parses, which leaves
// the default in place (same fallback as detectDateTimeFormat).
const detectDateFormat = (
  headers: string[],
  rows: string[][],
  dateCol: string
): { format: DateFormatKey; ambiguousWith: DateFormatKey | null } | null => {
  const samples = columnSamples(headers, rows, dateCol)
  if (samples.length === 0) return null

  let best: DateFormatKey | null = null
  let bestScore = 0
  for (const value of DATE_FORMAT_DETECTION_ORDER) {
    const score = samples.filter((s) => tryParseDate(s, value)).length
    // Strictly greater keeps the first format in probe order on a tie.
    if (score > bestScore) {
      bestScore = score
      best = value
    }
  }
  if (!best) return null

  const counterpart = AMBIGUOUS_DATE_COUNTERPART[best] ?? null
  // Ambiguous only when the counterpart parses every sample too — a single
  // day > 12 disambiguates the file and no warning is warranted.
  const ambiguousWith =
    counterpart && samples.every((s) => tryParseDate(s, counterpart)) ? counterpart : null
  return { format: best, ambiguousWith }
}

function ImportWizard({
  isOpen,
  onClose,
  onRequestPickFile,
  onSubmit,
  pickedFile,
  fileLoading,
  fileError,
  importing,
  importError
}: ImportWizardProps): React.JSX.Element | null {
  const [stepIdx, setStepIdx] = useState(0)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedDateTimes, setParsedDateTimes] = useState<Array<Date | null>>([])
  const [dateMode, setDateMode] = useState<DateSelectionMode>('string')
  const [timeMode, setTimeMode] = useState<TimeSelectionMode>('string')
  const [mapping, setMapping] = useState<DateTimeMapping>(INITIAL_MAPPING)
  const [dateFormat, setDateFormat] = useState<DateFormatKey>('YYYY-MM-DD')
  const [datetimeFormat, setDateTimeFormat] = useState<DateTimeFormatKey>('YYYY-MM-DDTHH:MM:SSZ')
  // Set when auto-detection had to guess between a day-first and a month-first
  // layout that the data cannot distinguish. Cleared as soon as the user picks
  // a format themselves — at that point the choice is theirs, not a guess.
  const [ambiguousDateFormat, setAmbiguousDateFormat] = useState<string | null>(null)
  const [columnSelection, setColumnSelection] = useState<Record<number, boolean>>({})
  const [filename, setFilename] = useState<string | null>(null)
  // Tracks the last pickedFile we observed so the render-time parse runs
  // exactly once per new file. React's recommended pattern for deriving
  // state from props (https://react.dev/reference/react/useState).
  const [lastSeenPickedFile, setLastSeenPickedFile] = useState<typeof pickedFile>(null)

  // Ref on the modal panel so the focus-trap effect can scope its DOM queries
  // and so we can fall back to focusing the panel itself when no interactive
  // child exists yet.
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Reset of wizard-local state happens automatically: the parent unmounts
  // <ImportWizard /> via its `{showWizard && …}` guard, so closing the modal
  // discards all hooks. No effect needed.

  // Parse on pickedFile change — adjusts state during render (React's documented
  // alternative to a setState-in-effect cascade), so the component re-runs with
  // the parsed result before anything is committed to the DOM.
  if (pickedFile !== lastSeenPickedFile) {
    setLastSeenPickedFile(pickedFile)

    if (pickedFile) {
      setFilename(pickedFile.filename)

      try {
        const result = parseFile(pickedFile.filename, pickedFile.rawText)

        setParsed(result)
        setParseError(null)

        const auto: DateTimeMapping = {
          year: findHeaderByKeyword(result.headers, ['year'], ['yr']),
          month: findHeaderByKeyword(result.headers, ['month'], ['mo', 'mon', 'mm']),
          day: findHeaderByKeyword(result.headers, ['day'], ['dy', 'dd']),
          julianYear: findHeaderByKeyword(result.headers, ['julian year', 'year'], ['yr']),
          julianDay: findHeaderByKeyword(result.headers, ['julian day', 'day of year', 'doy']),
          hour: findHeaderByKeyword(result.headers, ['hour'], ['hr', 'hh']),
          minute: findHeaderByKeyword(result.headers, ['minute'], ['min', 'mi']),
          date: findHeaderByKeyword(result.headers, ['date']),
          time: findHeaderByKeyword(result.headers, ['time']),
          datetime: findHeaderByKeyword(result.headers, ['datetime', 'timestamp', 'date_time'])
        }

        // Promote a keyword-mapped date/time column to the datetime slot when
        // its values are really full date-times. Covers `time` columns holding
        // ISO timestamps (Open-Meteo) and `date` columns holding the same.
        if (!auto.datetime) {
          const promoted = [auto.time, auto.date].find(
            (col): col is string =>
              Boolean(col) && columnHoldsDateTimes(result.headers, result.rows, col as string)
          )
          if (promoted) {
            auto.datetime = promoted
            // Clear the slot it was borrowed from so the same column is not
            // also read as a bare time-of-day / date.
            if (auto.time === promoted) auto.time = null
            if (auto.date === promoted) auto.date = null
          }
        }

        setMapping(auto)

        setAmbiguousDateFormat(null)

        if (auto.datetime) {
          setDateMode('datetime')
          setTimeMode('none')
          const detected = detectDateTimeFormat(result.headers, result.rows, auto.datetime)
          if (detected) {
            setDateTimeFormat(detected.format)
            if (detected.ambiguousWith) {
              setAmbiguousDateFormat(`${detected.format} or ${detected.ambiguousWith}`)
            }
          }
        } else {
          if (auto.year && auto.month && auto.day) setDateMode('parts')
          else if (auto.julianYear && auto.julianDay) setDateMode('julian')
          else if (auto.date) setDateMode('string')

          if (auto.date) {
            const detected = detectDateFormat(result.headers, result.rows, auto.date)
            if (detected) {
              setDateFormat(detected.format)
              if (detected.ambiguousWith) {
                setAmbiguousDateFormat(`${detected.format} or ${detected.ambiguousWith}`)
              }
            }
          }

          if (auto.hour || auto.minute) setTimeMode('parts')
          else if (auto.time) setTimeMode('string')
          else setTimeMode('none')
        }
      } catch (err) {
        setParseError((err as Error).message)
        setParsed(null)
      }
    }
  }

  // Close on Esc — the wizard uses a custom <div> overlay (not <dialog>),
  // so we wire up the key handler ourselves. Skipped while importing.
  React.useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !importing) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, importing, onClose])

  // Focus trap — the wizard is a <div> overlay, not <dialog>, so Tab would
  // otherwise walk out into the page behind the backdrop. We focus the
  // first interactive child on open, wrap Tab/Shift+Tab around the panel,
  // catch any stray focus that lands outside, and restore focus to the
  // element that opened the wizard when it closes.
  React.useEffect(() => {
    if (!isOpen) return
    const panel = panelRef.current
    if (!panel) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const getFocusable = (): HTMLElement[] =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === panel)

    const initial = getFocusable()
    if (initial.length > 0) initial[0].focus()
    else panel.focus()

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const focusables = getFocusable()
      if (focusables.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    const handleFocusIn = (e: FocusEvent): void => {
      if (panel.contains(e.target as Node)) return
      const focusables = getFocusable()
      ;(focusables[0] ?? panel).focus()
    }

    panel.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      panel.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocusIn)
      previouslyFocused?.focus?.()
    }
  }, [isOpen])

  // Re-parse delimited input when delimiter changes (step 2).
  const handleChangeDelimiter = useCallback(
    (d: string) => {
      if (!pickedFile || !parsed || parsed.format === 'xml') return
      try {
        const r = parseDelimited(pickedFile.rawText, d, parsed.headerLinesToSkip)
        setParseError(null)
        setParsed({ ...parsed, delimiter: d, ...r })
      } catch (e) {
        setParseError((e as Error).message)
      }
    },
    [pickedFile, parsed]
  )

  // Re-parse delimited input when header-skip changes (step 2).
  const handleChangeSkip = useCallback(
    (n: number) => {
      if (!pickedFile || !parsed || parsed.format === 'xml') return
      try {
        const r = parseDelimited(pickedFile.rawText, parsed.delimiter, n)
        setParseError(null)
        setParsed({ ...parsed, headerLinesToSkip: n, ...r })
      } catch (e) {
        setParseError((e as Error).message)
      }
    },
    [pickedFile, parsed]
  )

  // Step 3 stats. configReady = required dropdowns filled.
  const dtStats: DateTimeStats = useMemo(() => {
    if (!parsed) return { configReady: false, valid: 0, invalid: 0, total: 0 }
    const configReady =
      dateMode === 'string'
        ? Boolean(mapping.date) && Boolean(dateFormat)
        : dateMode === 'datetime'
          ? Boolean(mapping.datetime) && Boolean(datetimeFormat)
          : dateMode === 'julian'
            ? Boolean(mapping.julianYear) && Boolean(mapping.julianDay)
            : Boolean(mapping.year) && Boolean(mapping.month) && Boolean(mapping.day)
    if (!configReady) {
      return {
        configReady: false,
        valid: 0,
        invalid: parsed.rows.length,
        total: parsed.rows.length
      }
    }
    let valid = 0
    let invalid = 0
    for (const row of parsed.rows) {
      // Both invalid_date and invalid_time block Next. invalid_time produces a
      // technically-importable Date (time defaults to 00:00), but the preview
      // shows those rows as red "Invalid time format", so counting them as
      // valid here would contradict what the user sees and let them proceed
      // with no rows that actually parsed cleanly.
      const r = parseRowDateTimeSelections(
        row,
        parsed.headers,
        dateMode,
        dateMode === 'datetime' ? 'none' : timeMode,
        mapping,
        dateFormat,
        datetimeFormat
      )
      if (r.kind === 'ok') valid++
      else invalid++
    }
    return { configReady: true, valid, invalid, total: parsed.rows.length }
  }, [parsed, dateMode, timeMode, mapping, dateFormat, datetimeFormat])

  const dtColumns: string[] = useMemo(() => {
    const dateColumns =
      dateMode === 'string'
        ? [mapping.date]
        : dateMode === 'datetime'
          ? [mapping.datetime]
          : dateMode === 'julian'
            ? JULIAN_KEYS.map((k) => mapping[k])
            : DATE_PART_KEYS.map((k) => mapping[k])

    const timeColumns =
      dateMode === 'datetime' || timeMode === 'none'
        ? []
        : timeMode === 'parts'
          ? TIME_PART_KEYS.map((k) => mapping[k])
          : [mapping.time]

    return [...dateColumns, ...timeColumns].filter((v): v is string => v !== null)
  }, [dateMode, timeMode, mapping])

  const disabledColumnIndices = useMemo(() => {
    if (!parsed) return []
    const dtSet = new Set(dtColumns)
    return parsed.headers.flatMap((header, index) => {
      if (dtSet.has(header)) return []
      return parsed.rows.some((row) => isUnsupportedCharacterValue(row[index])) ? [index] : []
    })
  }, [parsed, dtColumns])

  // Allow proceed as long as required date dropdowns are filled and at least
  // one row produces a usable Date. Time is optional — invalid time doesn't
  // block Next.
  const canProceedDateTime = dtStats.configReady && dtStats.valid > 0

  const handleNext = useCallback((): void => {
    if (!parsed) return
    if (stepIdx === 2) {
      const dts: Array<Date | null> = parsed.rows.map((r) => {
        const result = parseRowDateTimeSelections(
          r,
          parsed.headers,
          dateMode,
          dateMode === 'datetime' ? 'none' : timeMode,
          mapping,
          dateFormat,
          datetimeFormat
        )
        return result.kind === 'invalid_date' ? null : result.date
      })
      setParsedDateTimes(dts)
    }
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1))
  }, [parsed, stepIdx, dateMode, timeMode, mapping, dateFormat, datetimeFormat])

  const handleBack = useCallback((): void => {
    // A delimiter / header-skip parse error belongs to the Data-Preview step's
    // current input. It must not follow the user back to earlier steps and gate
    // navigation there — `parsed` still holds the last successful parse, so the
    // wizard stays in a valid state. Clear the transient error on Back.
    setParseError(null)
    setStepIdx((i) => Math.max(i - 1, 0))
  }, [])

  const handleImport = useCallback((): void => {
    if (!parsed) return
    const dtSet = new Set(dtColumns)
    // Safety net: skip any column whose name exactly matches a date/time
    // keyword (case-insensitive), even if the user didn't map it. The
    // synthetic "Date-Time" is encoded into each value's {date,time} fields,
    // so these columns would be redundant in the payload.
    const DT_NAME_KEYWORDS = new Set([
      'year',
      'month',
      'day',
      'hour',
      'minute',
      'date',
      'time',
      'datetime',
      'timestamp',
      'date_time'
    ])
    const isDtName = (h: string): boolean => DT_NAME_KEYWORDS.has(h.trim().toLowerCase())
    const disabledSet = new Set(disabledColumnIndices)
    const keptIndices = parsed.headers
      .map((h, i) => ({ h, i }))
      .filter(
        ({ h, i }) =>
          !dtSet.has(h) && !isDtName(h) && !disabledSet.has(i) && columnSelection[i] !== false
      )

    // Pre-check: determine if ANY values would need truncation
    // by collecting all relevant values and checking them
    let truncatedAnyDecimals = false
    const allRelevantValues: string[] = []
    for (const row of parsed.rows) {
      for (const { i } of keptIndices) {
        const val = String(row[i] ?? '').trim()
        if (val) allRelevantValues.push(val)
      }
    }
    if (wouldTruncateAny(allRelevantValues)) {
      truncatedAnyDecimals = true
    }

    // Synthetic "check" column — always added on import, defaults to true for
    // every record. Lets downstream tools include/exclude rows after import.
    const checkColumn: ImportedDatasetColumn = {
      key: '__check__',
      label: 'check',
      index: -1
    }

    const userColumns: ImportedDatasetColumn[] = keptIndices.map(({ h, i }) => ({
      key: `${i}__${h}`,
      label: h,
      index: i
    }))

    const columns: ImportedDatasetColumn[] = [checkColumn, ...userColumns]

    const records: ImportedDatasetRecord[] = parsed.rows.map((row, rowIdx) => {
      const dt = parsedDateTimes[rowIdx] ?? null
      // Backend stores `check` as 0/1 strings, not 'true'/'false'.
      const values: Record<string, string> = { __check__: '1' }
      for (const { h, i } of keptIndices) {
        const rawValue = row[i] ?? ''
        const normalized = truncateToMaxDecimals(String(rawValue))
        values[`${i}__${h}`] = normalized.value
      }
      return {
        dtIso: dt ? dt.toISOString() : null,
        values
      }
    })

    // Sort by Date-Time ascending; rows with null dt (Invalid) sort to the end.
    records.sort((a, b) => {
      if (a.dtIso === null && b.dtIso === null) return 0
      if (a.dtIso === null) return 1
      if (b.dtIso === null) return -1
      if (a.dtIso < b.dtIso) return -1
      if (a.dtIso > b.dtIso) return 1
      return 0
    })

    const dataset: ImportedDataset = {
      filename: filename ?? pickedFile?.filename ?? 'unknown',
      columns,
      records
    }

    // Toast for truncation is fired by Weather's saga-completion effect after
    // the import finalizes — don't surface it while the wizard is still open.
    onSubmit(dataset, truncatedAnyDecimals)
  }, [
    parsed,
    parsedDateTimes,
    dtColumns,
    disabledColumnIndices,
    columnSelection,
    filename,
    pickedFile,
    onSubmit
  ])

  const canGoNext = ((): boolean => {
    if (!parsed) return false
    // Step 0 (File Preview) only needs a file that parsed successfully — which
    // is exactly `parsed !== null` (already guarded above). A transient
    // delimiter/skip error from the Data-Preview step must not block it.
    if (stepIdx === 0) return true
    if (stepIdx === 1) return parseError === null
    if (stepIdx === 2) return canProceedDateTime
    return true
  })()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={importing ? undefined : onClose}
      />

      <div className="relative flex h-full items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Import Weather Data"
          tabIndex={-1}
          className="flex flex-col rounded-[3px] border border-app-border bg-app-bg shadow-2xl focus:outline-none"
          style={{ width: 580, maxHeight: '92vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-[3px] border-b border-[#e2e8f0] bg-[#f8fafc] px-6 py-4">
            <h2 className="text-base font-medium text-neutral-900">Import Weather Data</h2>
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              aria-label="Close"
              className="cursor-pointer text-neutral-500 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>

          {/* Stepper */}
          <div className="px-4 pt-4">
            <Stepper currentIndex={stepIdx} />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto pt-2 scrollbar-custom">
            {stepIdx === 0 && (
              <StepFilePreview
                filename={filename}
                fileLoading={fileLoading}
                fileError={fileError}
                parseError={parseError}
                onBrowse={onRequestPickFile}
              />
            )}
            {stepIdx === 1 && parsed && (
              <StepDataPreview
                parsed={parsed}
                parseError={parseError}
                onChangeDelimiter={handleChangeDelimiter}
                onChangeSkip={handleChangeSkip}
              />
            )}
            {stepIdx === 2 && parsed && (
              <StepDateTime
                parsed={parsed}
                dateMode={dateMode}
                onChangeDateMode={(nextMode) => {
                  setDateMode(nextMode)
                  if (nextMode === 'datetime') setTimeMode('none')
                }}
                timeMode={timeMode}
                onChangeTimeMode={setTimeMode}
                mapping={mapping}
                onChangeMapping={(k, v) => setMapping((current) => ({ ...current, [k]: v }))}
                dateFormat={dateFormat}
                onChangeDateFormat={(v) => {
                  setDateFormat(v)
                  setAmbiguousDateFormat(null)
                }}
                datetimeFormat={datetimeFormat}
                onChangeDateTimeFormat={(v) => {
                  setDateTimeFormat(v)
                  setAmbiguousDateFormat(null)
                }}
                ambiguousDateFormat={ambiguousDateFormat}
                stats={dtStats}
              />
            )}
            {stepIdx === 3 && parsed && (
              <StepReview
                parsed={parsed}
                parsedDateTimes={parsedDateTimes}
                dtColumns={dtColumns}
                columnSelection={columnSelection}
                disabledColumnIndices={disabledColumnIndices}
                onToggleColumn={(i) =>
                  setColumnSelection((s) => ({ ...s, [i]: s[i] === false ? true : false }))
                }
                onToggleAll={(checked) =>
                  setColumnSelection(() => {
                    const next: Record<number, boolean> = {}
                    parsed.headers.forEach((header, index) => {
                      const isDateTimeColumn = dtColumns.includes(header)
                      const isDisabled = disabledColumnIndices.includes(index)
                      if (!isDateTimeColumn && !isDisabled) {
                        next[index] = checked
                      }
                    })
                    return next
                  })
                }
              />
            )}
          </div>

          {/* The finalize error is raised on the Review & Import step (the only
              step with an Import button). Scope the banner to that step so it
              stays tied to where it happened — hidden when the user navigates
              back to adjust input, and shown again on returning to Review. */}
          {importError && stepIdx === STEPS.length - 1 && (
            <div className="mx-6 mb-2 flex items-start gap-2 rounded border border-red-900/40 bg-red-900/20 px-3 py-2 text-sm text-red-300">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong className="font-semibold">Import failed: </strong>
                {importError}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              {stepIdx > 0 && !importing && (
                <GhostBtn onClick={handleBack} leftIcon={<ChevronLeftIcon className="h-4 w-4" />}>
                  Back
                </GhostBtn>
              )}
            </div>
            <div className="flex gap-3">
              <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
              {stepIdx < STEPS.length - 1 ? (
                <PrimaryBtn onClick={handleNext} disabled={!canGoNext}>
                  Next
                </PrimaryBtn>
              ) : (
                <PrimaryBtn onClick={handleImport} disabled={!canGoNext || importing}>
                  {importing ? <Spinner className="h-4 w-4 text-white" /> : 'Import'}
                </PrimaryBtn>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ImportWizard
