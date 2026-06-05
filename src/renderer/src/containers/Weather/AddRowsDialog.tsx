import calendarIcon from '@renderer/assets/calendar.svg'
import clockIcon from '@renderer/assets/clock.svg'
import Dialog from '@renderer/components/Dialog'
import FormField from '@renderer/components/FormField'
import { Spinner } from '@renderer/components/LoadingScreen/Spinner'
import TimePicker24 from '@renderer/components/TimePicker24'
import { addRowRequested, addRowReset } from 'containers/ProjectScreen/actions'
import {
  DATE_COL_ID,
  TIME_COL_ID,
  type CellValue,
  type ColId,
  type WeatherTable
} from 'containers/ProjectScreen/types'
import { useFormik } from 'formik'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import messages from './messages'
import {
  selectActiveProjectId,
  selectActiveScenarioId,
  selectActiveWeatherTable,
  selectAddRowError,
  selectAddRowLoading,
  selectColumnOrder
} from './selectors'

export interface AddRowsValues {
  numberOfRows: string
  startDate: string
  startTime: string
  deltaHours: string
}

const INITIAL_VALUES: AddRowsValues = {
  numberOfRows: '',
  startDate: '',
  startTime: '',
  deltaHours: '1'
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

// Bounds for the native date input's year spinner. Must match the 1900–3000
// range enforced in the formik validator so the widget can't even produce a
// value the validator would reject.
const MIN_DATE = '1900-01-01'
const MAX_DATE = '3000-12-31'

const MAX_ROWS = 10_000
const MAX_DELTA_HOURS = 24
const HOUR_MS = 3_600_000
const WHOLE_NUMBER_PATTERN = /^\d+$/
const WHOLE_NUMBER_INPUT_PATTERN = /^\d*$/

const pad2 = (n: number): string => String(n).padStart(2, '0')

// Parse a row's stored date (YYYY-MM-DD) + time (HH:mm[:ss]) into UTC ms.
// UTC keeps hour arithmetic linear (no DST). Returns null if either is absent
// or malformed.
function parseRowDateTimeMs(row: Record<ColId, CellValue> | undefined): number | null {
  const date = row?.[DATE_COL_ID]
  const time = row?.[TIME_COL_ID]
  if (typeof date !== 'string' || typeof time !== 'string') return null
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})/.exec(time)
  if (!dm || !tm) return null
  const ms = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2], 0, 0)
  return Number.isFinite(ms) ? ms : null
}

// Default Delta = the hour spacing inferred from the first three rows. Uses the
// first valid consecutive gap; falls back to '1' when fewer than two parseable
// rows exist or the gap isn't a whole number of hours within bounds.
function inferDeltaHours(table: WeatherTable | null): string {
  const order = table?.rowOrder ?? []
  const stamps: number[] = []
  for (const rowId of order.slice(0, 3)) {
    const ms = parseRowDateTimeMs(table?.rows[rowId])
    if (ms != null) stamps.push(ms)
  }
  for (let i = 1; i < stamps.length; i++) {
    const diffMs = stamps[i] - stamps[i - 1]
    // Only adopt the spacing when it's an exact, positive whole number of hours
    // within bounds — the Delta field can't represent anything else, so a
    // fractional/odd gap falls back to '1'.
    if (diffMs > 0 && diffMs % HOUR_MS === 0) {
      const hours = diffMs / HOUR_MS
      if (hours <= MAX_DELTA_HOURS) return String(hours)
    }
  }
  return '1'
}

// Default Start Date + Time = the last row's full date-time advanced by the
// inferred delta, so the new rows continue right after the existing data at its
// own cadence. Crossing midnight rolls the date forward correctly across day /
// month / year boundaries (e.g. 2026-01-31 23:00 + 1h → 2026-02-01 00:00)
// because the arithmetic is done on a real timestamp, not on the time-of-day
// alone.
//
// Falls back to { date: last row's date, time: '' } when the last data row has
// a date but no parseable time, and to { date: '', time: '' } when there is no
// usable data at all (native picker then shows today).
function seededStart(
  table: WeatherTable | null,
  deltaHours: number
): { date: string; time: string } {
  const order = table?.rowOrder ?? []
  let fallbackDate = '' // last row (doc order) with a valid date but no parseable time
  for (let i = order.length - 1; i >= 0; i--) {
    const row = table?.rows[order[i]]
    const ms = parseRowDateTimeMs(row)
    if (ms != null) {
      const next = new Date(ms + deltaHours * HOUR_MS)
      const date = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`
      const time = `${pad2(next.getUTCHours())}:${pad2(next.getUTCMinutes())}`
      return { date, time }
    }
    // First valid date hit scanning backward = last in doc order — exactly what
    // the old lastRowDate fallback returned. Capture it once.
    if (!fallbackDate) {
      const date = row?.[DATE_COL_ID]
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) fallbackDate = date
    }
  }
  return { date: fallbackDate, time: '' }
}

const CalendarIcon = <img src={calendarIcon} alt="" aria-hidden="true" className="h-4 w-4" />

const ClockIcon = <img src={clockIcon} alt="" aria-hidden="true" className="h-4 w-4" />

function openPicker(input: HTMLInputElement | null): void {
  if (!input) return
  if (typeof input.showPicker === 'function') {
    input.showPicker()
  } else {
    input.focus()
    input.click()
  }
}

function keepWholeNumberInput(
  formik: ReturnType<typeof useFormik<AddRowsValues>>
): (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void {
  return (e) => {
    if (!WHOLE_NUMBER_INPUT_PATTERN.test(e.target.value)) return
    formik.handleChange(e)
  }
}

interface AddRowsDialogProps {
  isOpen: boolean
  onClose: () => void
}

function AddRowsDialog({ isOpen, onClose }: AddRowsDialogProps): React.JSX.Element {
  const dispatch = useDispatch()
  const projectId = useSelector(selectActiveProjectId)
  const scenarioId = useSelector(selectActiveScenarioId)
  const columnIds = useSelector(selectColumnOrder)
  const weatherTable = useSelector(selectActiveWeatherTable)
  const loading = useSelector(selectAddRowLoading)
  const error = useSelector(selectAddRowError)

  const startDateRef = React.useRef<HTMLInputElement>(null)
  const startTimeRef = React.useRef<HTMLInputElement>(null)
  const timePickerContainerRef = React.useRef<HTMLDivElement>(null)
  const [isTimePickerOpen, setIsTimePickerOpen] = React.useState(false)

  React.useEffect(() => {
    if (!isTimePickerOpen) return undefined
    const handleMouseDown = (e: MouseEvent): void => {
      if (
        timePickerContainerRef.current &&
        !timePickerContainerRef.current.contains(e.target as Node)
      ) {
        setIsTimePickerOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsTimePickerOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isTimePickerOpen])

  const formik = useFormik<AddRowsValues>({
    initialValues: INITIAL_VALUES,
    validateOnChange: true,
    validateOnBlur: true,
    validate: (values) => {
      const errors: Partial<Record<keyof AddRowsValues, string>> = {}

      if (values.numberOfRows === '') {
        errors.numberOfRows = 'Number of rows is required.'
      } else {
        const n = Number.parseInt(values.numberOfRows, 10)
        if (Number.isNaN(n) || n <= 0 || !WHOLE_NUMBER_PATTERN.test(values.numberOfRows)) {
          errors.numberOfRows = 'Number of rows must be a positive whole number.'
        } else if (n > MAX_ROWS) {
          errors.numberOfRows = `Number of rows must be ${MAX_ROWS} or fewer.`
        }
      }

      if (!values.startDate) {
        errors.startDate = 'Start date is required.'
      } else {
        // Match the backend: YYYY-MM-DD with a 4-digit year in 1900–3000.
        // The 4-digit guard also rejects the native picker's overflow values
        // (e.g. "275760-03-04") that otherwise reach the saga as bad rows.
        const dateMatch = /^(\d{4})-\d{2}-\d{2}$/.exec(values.startDate)
        if (!dateMatch) {
          errors.startDate = 'Start date must be in YYYY-MM-DD format with a 4-digit year.'
        } else {
          const year = Number.parseInt(dateMatch[1], 10)
          if (year < 1900 || year > 3000) {
            errors.startDate = 'Start date year must be between 1900 and 3000.'
          }
        }
      }

      if (!values.startTime) {
        errors.startTime = 'Start time is required.'
      } else if (!TIME_PATTERN.test(values.startTime)) {
        errors.startTime = 'Start time must be in 24-hour format (00:00–23:59).'
      }

      if (values.deltaHours === '') {
        errors.deltaHours = 'Delta is required.'
      } else {
        const dh = Number.parseInt(values.deltaHours, 10)
        if (Number.isNaN(dh) || dh <= 0 || !WHOLE_NUMBER_PATTERN.test(values.deltaHours)) {
          errors.deltaHours = 'Delta must be a positive whole number of hours.'
        } else if (dh > MAX_DELTA_HOURS) {
          errors.deltaHours = `Delta must be ${MAX_DELTA_HOURS} hours or fewer.`
        }
      }

      return errors
    },
    onSubmit: (values) => {
      if (loading || !projectId || !scenarioId) return
      const numberOfRows = Number.parseInt(values.numberOfRows, 10)
      const deltaHours = Number.parseInt(values.deltaHours, 10)
      // Don't close here — the toolbar listens for the loading→idle
      // transition and closes only on success. The dialog stays open with
      // the error banner on failure so the user can retry.
      dispatch(
        addRowRequested(
          projectId,
          scenarioId,
          values.startDate,
          values.startTime,
          columnIds,
          numberOfRows,
          deltaHours
        )
      )
    }
  })

  // Reset the form whenever the dialog closes — covers both user Cancel and
  // success-driven close from the toolbar. Also clear the saga request status
  // so a prior failure's error banner doesn't persist into the next open.
  React.useEffect(() => {
    if (!isOpen) {
      formik.resetForm()
      dispatch(addRowReset())
    }
    // formik is intentionally omitted; we only want isOpen edge transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // On open, seed the defaults from existing data: Start Date + Time = the last
  // row's date-time + the inferred delta (rolling the date forward when it
  // crosses midnight), Delta = the hour spacing inferred from the first three
  // rows. When
  // there is no usable data we leave Start Date and Start Time empty (native
  // picker shows today) and Delta at its '1' default — matching the prior
  // behaviour.
  //
  // Seed via a single resetForm rather than per-field setFieldValue: each
  // setFieldValue validates against a *stale* values snapshot (the sibling
  // fields it doesn't touch are still empty), so the last call would leave
  // spurious "required" errors on the just-seeded Start Date / Start Time.
  // resetForm sets every value at once and clears errors + touched, so no
  // error shows until the user actually interacts (same as Number of Rows).
  React.useEffect(() => {
    if (!isOpen) return
    const deltaHours = inferDeltaHours(weatherTable)
    const { date, time } = seededStart(weatherTable, Number(deltaHours))
    formik.resetForm({
      values: {
        numberOfRows: '',
        startDate: date,
        startTime: time,
        deltaHours
      }
    })
    // Only seed on the open edge; weatherTable is settled before the user opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleClose = (): void => {
    if (loading) return
    onClose()
  }

  return (
    <Dialog isOpen={isOpen} title={messages.addRows.dialogTitle} onClose={handleClose}>
      <FormField
        labelProps={{ label: 'Number of Rows' }}
        inputProps={{
          ...formik.getFieldProps('numberOfRows'),
          type: 'text',
          onChange: keepWholeNumberInput(formik),
          error:
            formik.touched.numberOfRows || formik.values.numberOfRows !== ''
              ? (formik.errors.numberOfRows as string | undefined)
              : undefined
        }}
      />
      <div className="relative">
        {/* key flips with isOpen to force a fresh DOM input on each open. A
            native date input keeps partially-typed segments (e.g. just a
            month) in the widget while reporting value="" — so resetForm can't
            clear them and they'd reappear on reopen. Remounting does. */}
        <FormField
          key={isOpen ? 'start-date-open' : 'start-date-closed'}
          labelProps={{ label: 'Start Date' }}
          inputProps={{
            ...formik.getFieldProps('startDate'),
            type: 'date',
            placeholder: 'Start Date',
            min: MIN_DATE,
            max: MAX_DATE,
            iconLeft: CalendarIcon,
            inputRef: startDateRef,
            onIconLeftClick: () => openPicker(startDateRef.current),
            error:
              formik.touched.startDate || formik.values.startDate !== ''
                ? (formik.errors.startDate as string | undefined)
                : undefined
          }}
        />

        <style>
          {`
      input[type='date']::-webkit-calendar-picker-indicator {
        display: none;
        -webkit-appearance: none;
      }
    `}
        </style>
      </div>
      <div ref={timePickerContainerRef} className="relative overflow-visible">
        <FormField
          labelProps={{ label: 'Start Time' }}
          inputProps={{
            ...formik.getFieldProps('startTime'),
            type: 'text',
            placeholder: 'hh:mm',
            iconLeft: ClockIcon,
            inputRef: startTimeRef,
            onIconLeftClick: () => setIsTimePickerOpen((v) => !v),
            error:
              formik.touched.startTime || formik.values.startTime !== ''
                ? (formik.errors.startTime as string | undefined)
                : undefined
          }}
        />
        {isTimePickerOpen && (
          <TimePicker24
            value={formik.values.startTime}
            listClassName="h-24"
            onChange={(v) => {
              formik.setFieldValue('startTime', v)
              setIsTimePickerOpen(false)
            }}
          />
        )}
      </div>
      <FormField
        labelProps={{ label: 'Delta (hours)' }}
        inputProps={{
          ...formik.getFieldProps('deltaHours'),
          type: 'text',
          onChange: keepWholeNumberInput(formik),
          error:
            formik.touched.deltaHours || formik.values.deltaHours !== ''
              ? (formik.errors.deltaHours as string | undefined)
              : undefined
        }}
      />

      {error && (
        <p role="alert" className="form-error-text pt-2">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={handleClose}
          disabled={loading}
          className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100 disabled:opacity-50"
        >
          {messages.addRows.cancelButton}
        </button>
        <button
          onClick={() => formik.submitForm()}
          disabled={loading}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Spinner />
              {messages.addRows.submitButtonBusy}
            </span>
          ) : (
            messages.addRows.submitButton
          )}
        </button>
      </div>
    </Dialog>
  )
}

export default AddRowsDialog
