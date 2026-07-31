import type {
  DateFormatKey,
  DateTimeFormatKey,
  DateTimeMapping,
  DateSelectionMode,
  TimeSelectionMode,
  ImportedDataset,
  ParseResult
} from 'containers/Weather/parsers'
import type { PickedFile } from 'containers/Weather/types'

// ── Public props (controlled by the Weather container) ────────────────────────

export interface ImportWizardProps {
  isOpen: boolean
  onClose: () => void
  onRequestPickFile: () => void
  onSubmit: (dataset: ImportedDataset, truncatedDecimals: boolean) => void
  onImportWarning: (message: string | null) => void
  pickedFile: PickedFile | null
  fileLoading: boolean
  fileError: string | null
  importing: boolean
  importError: string | null
}

// ── Step 1 (file preview) ──────────────────────────────────────────────────────

export interface StepFilePreviewProps {
  filename: string | null
  fileLoading: boolean
  fileError: string | null
  parseError: string | null
  onBrowse: () => void
}

// ── Step 2 (data preview) ──────────────────────────────────────────────────────

export interface StepDataPreviewProps {
  parsed: ParseResult
  parseError: string | null
  onChangeDelimiter: (delimiter: string) => void
  onChangeSkip: (n: number) => void
}

// ── Step 3 (date / time) ───────────────────────────────────────────────────────

export interface DateTimeStats {
  configReady: boolean
  valid: number
  invalid: number
  total: number
}

export interface StepDateTimeProps {
  parsed: ParseResult
  dateMode: DateSelectionMode
  onChangeDateMode: (mode: DateSelectionMode) => void
  timeMode: TimeSelectionMode
  onChangeTimeMode: (mode: TimeSelectionMode) => void
  mapping: DateTimeMapping
  onChangeMapping: (key: keyof DateTimeMapping, value: string | null) => void
  dateFormat: DateFormatKey
  onChangeDateFormat: (value: DateFormatKey) => void
  datetimeFormat: DateTimeFormatKey
  onChangeDateTimeFormat: (value: DateTimeFormatKey) => void
  /**
   * "<picked> or <counterpart>" when auto-detection could not tell a day-first
   * from a month-first layout, else null. Drives the step's ambiguity warning.
   */
  ambiguousDateFormat: string | null
  stats: DateTimeStats
}

// ── Step 4 (review) ────────────────────────────────────────────────────────────

export interface StepReviewProps {
  parsed: ParseResult
  parsedDateTimes: Array<Date | null>
  dtColumns: string[]
  columnSelection: Record<number, boolean>
  disabledColumnIndices: number[]
  onToggleColumn: (index: number) => void
  onToggleAll: (checked: boolean) => void
}

// ── Stepper ────────────────────────────────────────────────────────────────────

export interface StepperProps {
  currentIndex: number
}
