import infoIcon from '@renderer/assets/info.svg'
import Tooltip from '@renderer/components/Tooltip'
import { setCellValidationError } from 'containers/ProjectScreen/actions'
import type { ColumnDef, DataTypeDef } from 'containers/ProjectScreen/types'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  exceedsMaxDecimals,
  expandForDisplay,
  isIncompleteExponent,
  isPartialNumericInput,
  VALIDATION_MESSAGES
} from 'utils/decimalValidation'
import { makeSelectCellError } from './selectors'
import {
  GLOBAL_CELL_MAX,
  GLOBAL_CELL_MIN,
  GLOBAL_RANGE_MESSAGE,
  validateCellValue
} from './validation'

interface CellInputProps {
  rowId: string
  colId: string
  value: string
  // col / dataTypes / scenarioId used to live as per-cell useSelector calls.
  // Each visible row × column added 3 store subscriptions; at ~300 cells that
  // meant ~900 extra subscriptions notified on every dispatch. Lifted to the
  // parent (WeatherTable) which selects them once and passes stable refs down.
  col: ColumnDef | undefined
  dataTypes: DataTypeDef[]
  scenarioId: string | null
  onCommit: (next: string) => void
}

// True when the parsed number would breach the global ±1e6 bound. Partial
// inputs like "" or "-" parse to NaN and are allowed through so the user can
// keep typing.
function exceedsGlobalBound(raw: string): boolean {
  const num = Number(raw.trim())
  if (!Number.isFinite(num)) return false
  return num < GLOBAL_CELL_MIN || num > GLOBAL_CELL_MAX
}

function CellInput({
  rowId,
  colId,
  value,
  col,
  dataTypes,
  scenarioId,
  onCommit
}: CellInputProps): React.JSX.Element {
  const dispatch = useDispatch()

  const [draft, setDraft] = React.useState(value)
  const [decimalValidationError, setDecimalValidationError] = React.useState<string | null>(null)
  // Local-only error for the global ±1e6 keystroke block. We reject the
  // character before it reaches `draft`, so this error isn't reflected in the
  // redux validationError map — using local state keeps it isolated from the
  // committed value's validation lifecycle.
  const [globalBoundError, setGlobalBoundError] = React.useState<string | null>(null)
  // Local-only error for the numeric-format keystroke block. Like the global
  // bound, the offending keystroke never reaches `draft`, so it stays out of
  // the redux validationError map.
  const [formatError, setFormatError] = React.useState<string | null>(null)
  // Re-sync the draft when the committed value changes underneath us. Adjusting
  // state during render (rather than in an effect) is React's documented reset
  // pattern: it re-renders immediately without flushing the stale draft to DOM.
  const [lastSeenValue, setLastSeenValue] = React.useState(value)
  if (lastSeenValue !== value) {
    setLastSeenValue(value)
    setDraft(value)
    setDecimalValidationError(null)
    setGlobalBoundError(null)
    setFormatError(null)
  }

  // Per-cell validation error pushed by handleCellBlur (manual edits), by
  // the updateColumnWorker saga (after data type / unit changes), and by
  // the live keystroke validator below (via SET_CELL_VALIDATION_ERROR).
  const selectError = React.useMemo(() => makeSelectCellError(rowId, colId), [rowId, colId])
  const error = useSelector(selectError)

  // Combine backend / redux validation error with local guards. The global
  // bound takes precedence because the keystroke that triggered it never
  // made it into `draft`.
  const displayError = formatError || globalBoundError || decimalValidationError || error

  // Both visuals live on the cell <td> (rendered by WeatherTable): the red
  // validation outline, and the blue focus-within selection outline (identical
  // 1px inset dimensions, different color). Keeping them on the <td> guarantees
  // identical geometry/clipping — an outline on the <input> would lose its top
  // edge against the header/row boundary.
  //
  // `outline-none!` (important) suppresses the global `:focus-visible` 2px ring
  // (index.css) on the cell input. That rule is unlayered, so it would beat a
  // plain layered `outline-none` and stack a thicker outer outline on top of
  // the <td>'s 1px one. We only reserve right-side room for the info icon when
  // in error.
  const inputCls = `h-full w-full bg-transparent px-4 ${displayError ? 'pr-8' : ''} outline-none!`

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newValue = e.target.value

    // Block #0 — numeric format. Refuse any keystroke (or paste) that isn't a
    // number-in-progress, so non-numeric input never reaches the draft.
    if (!isPartialNumericInput(newValue)) {
      setFormatError(VALIDATION_MESSAGES.NUMERIC_ONLY)
      return
    }
    if (formatError) {
      setFormatError(null)
    }

    // Block #1 — too many decimal places (existing behavior).
    if (exceedsMaxDecimals(newValue)) {
      setDecimalValidationError(VALIDATION_MESSAGES.MANUAL_INPUT)
      return
    }
    if (decimalValidationError) {
      setDecimalValidationError(null)
    }

    // Block #2 — global ±1e6 hard bound. Refuse the keystroke so the value
    // can never reach blur / backend in a state that violates the bound.
    if (exceedsGlobalBound(newValue)) {
      setGlobalBoundError(GLOBAL_RANGE_MESSAGE)
      return
    }
    if (globalBoundError) {
      setGlobalBoundError(null)
    }

    setDraft(newValue)

    // Live unit-range / number-format validation. Does NOT block — we just
    // surface the error through redux so the red <td> outline + tooltip
    // update while typing. Re-uses the same validationErrors slot that
    // handleCellBlur writes on commit, so on blur the slot is overwritten
    // with the final result (no stale live error survives).
    //
    // "1e" / "1e-" is skipped: Number() is NaN for them, so validateCellValue
    // reports "must be a number" the instant 'e' is typed and clears again on the
    // exponent digit. The value is unfinished, not wrong — blur below writes the
    // real verdict, so a cell LEFT at "1e" still ends up flagged.
    if (scenarioId && col) {
      const liveError = isIncompleteExponent(newValue)
        ? null
        : validateCellValue(newValue, { col, dataTypes })
      dispatch(setCellValidationError(scenarioId, rowId, colId, liveError))
    }
  }

  const handleBlur = (): void => {
    // Clear local guards so the redux/backend error becomes the single
    // source of truth for displayError.
    setDecimalValidationError(null)
    setGlobalBoundError(null)
    setFormatError(null)
    // Commit scientific notation in its decimal form ("1e3" -> "1000") so the cell
    // shows what will be stored. This is the one path where the raw STRING reaches
    // the backend and Python's float() converts it, so without this the cell reads
    // back changed on the next fetch with nothing having said so.
    const next = expandForDisplay(draft)
    if (next !== draft) setDraft(next)
    // Re-validate ONLY when this blur changed what handleChange last dispatched:
    // an expansion, or an unfinished "1e" whose error was held back. A cell the
    // user merely focused and left must keep whatever verdict is already in the
    // slot — a backend error, or one updateColumnWorker wrote after a data-type
    // change. handleCellBlur early-returns when the value is unchanged, so an
    // unconditional dispatch here would be the only thing clearing those.
    if (scenarioId && col && (next !== draft || isIncompleteExponent(draft))) {
      dispatch(
        setCellValidationError(scenarioId, rowId, colId, validateCellValue(next, { col, dataTypes }))
      )
    }
    onCommit(next)
  }

  return (
    <div className="relative flex h-full w-full items-center">
      <input
        type="text"
        aria-label={`${rowId} ${colId}`}
        aria-invalid={displayError ? true : undefined}
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        className={inputCls}
      />
      {displayError && (
        <Tooltip
          text={displayError}
          ariaLabel={`Validation error: ${displayError}`}
          className="absolute right-2 top-1/2 -translate-y-1/2"
          textColor="#e5e5e5"
        >
          <img src={infoIcon} alt="" className="h-4 w-4" />
        </Tooltip>
      )}
    </div>
  )
}

// Memoized so a parent re-render (e.g. another row's cell changes, or the
// scroll handler updating the visible window) doesn't reconcile cells whose
// props are referentially unchanged. With ~300 visible cells this is the
// difference between reconciling 300 inputs per scroll tick and reconciling 0.
export default React.memo(CellInput)
