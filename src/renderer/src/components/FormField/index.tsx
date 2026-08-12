import infoIcon from '@renderer/assets/info.svg'
import React, { useId } from 'react'
import type { PlacesType } from 'react-tooltip'
import Select from '../Select'
import Tooltip from '../Tooltip'

export interface FormFieldLabelProps {
  label: string
  optional?: boolean
  helpText?: string
  helpAriaLabel?: string
  helpPlace?: PlacesType
  // Visually hide the label (kept for screen readers via sr-only) when the
  // field name is shown as the input placeholder instead — and a separate
  // section heading already labels the row. The htmlFor/id association is
  // preserved, so the accessible name is unchanged.
  hideLabel?: boolean
}

export interface FormFieldOption {
  value: string
  label: string
}

export interface FormFieldInputProps {
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => void
  // Optional focus hook, forwarded to the underlying input/select (via the spread).
  onFocus?: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => void
  error?: string
  type?: string
  placeholder?: string
  disabled?: boolean
  options?: readonly FormFieldOption[]
  iconLeft?: React.ReactNode
  onIconLeftClick?: () => void
  inputRef?: React.Ref<HTMLInputElement>
  lang?: string
  min?: string
  max?: string
  // Extra classes appended to the <input>/<select> (e.g. a custom background).
  // Appended last so they override the defaults.
  inputClassName?: string
  // Show the validation error as a hover tooltip on an in-cell info icon
  // (matching Weather's CellInput) instead of as a text line below the field.
  // Applies to text inputs only; selects keep the inline message.
  errorAsTooltip?: boolean
}

interface FormFieldProps {
  labelProps: FormFieldLabelProps
  inputProps: FormFieldInputProps
}

// components/Select reports a plain value, but FormField's callers were written
// against a native <select> — including formik's handleChange/handleBlur, which
// pull `name` off the target to decide which field to update and `type` to decide
// how to coerce the value. So the adapter lives here, at the boundary, rather
// than leaking event plumbing into Select's other callers.
function selectEvent<T>(name: string, value: string): T {
  const target = { name, id: name, value, type: 'select-one' }
  return {
    target,
    currentTarget: target,
    // Formik calls persist() on React 16 pooled events; harmless no-op here.
    persist: () => {}
  } as unknown as T
}

function FormField({ labelProps, inputProps }: FormFieldProps): React.JSX.Element {
  const { label, optional = false, helpText, helpAriaLabel, helpPlace, hideLabel = false } = labelProps
  const {
    error,
    type = 'text',
    placeholder = 'Enter',
    disabled = false,
    options,
    iconLeft,
    onIconLeftClick,
    inputRef,
    inputClassName = '',
    errorAsTooltip = false,
    ...restInputProps
  } = inputProps
  const errorId = useId()

  // Tooltip errors apply to text inputs only; selects keep the inline message
  // (no room beside the native dropdown arrow). The inline <p> shows whenever
  // the error isn't surfaced as a tooltip.
  const errorAsIcon = !!error && errorAsTooltip && !options
  const inlineError = !!error && !errorAsIcon

  // All error cues use the app error color (#D92D20 = --color-text-error-primary),
  // matching the helper text in .form-error-text. index.css keeps this red on the
  // focus ring too, so editing an invalid field doesn't flip the outline to blue.
  const outlineClasses = error
    ? 'outline outline-1 -outline-offset-1 outline-[#D92D20]'
    : 'outline-none'
  const focusBorderClassName = error ? 'focus:border-[#D92D20]' : 'focus:border-neutral-500'
  // Split out so the dropdown can put `mt-1` on its positioning wrapper instead
  // of the control — an absolutely-placed list anchors to the wrapper, and a
  // margin on the child would make `top-full` land in the wrong place. The
  // composed baseClassName below is unchanged, so the <input> branch is identical.
  const controlClassName = `h-9 w-full rounded border border-app-border bg-dark text-sm text-white ${focusBorderClassName} ${outlineClasses}${inputClassName ? ` ${inputClassName}` : ''}`
  // `text-ellipsis` (only the input branch — Select truncates its own span). An
  // <input> clips overflow hard by default, so over-long text ends mid-letter
  // with nothing to say it was cut; this marks the cut instead, the same
  // treatment Select already gives a long value.
  //
  // It is a BACKSTOP for placeholders, not the fix. Chromium drops it the moment
  // the field is focused (deliberately — so a long value can be scrolled while
  // editing), and it has never supported an ellipsis on ::placeholder at all. So
  // a long placeholder is shortened at the source instead, by the callers that
  // pass one (see utils/trimText). This still earns its place twice over: it
  // catches long VALUES, and it catches a placeholder whose caller budgeted a
  // character or two too generously — a character count is not a width.
  const baseClassName = `mt-1 text-ellipsis ${controlClassName}`
  // When the error icon is shown, reserve right padding so the value doesn't run
  // under it (matches Weather's `pr-8`). Otherwise keep the original padding so
  // existing layouts stay byte-identical.
  const paddedClassName = errorAsIcon
    ? iconLeft
      ? `${baseClassName} pl-9 pr-8`
      : `${baseClassName} pl-3 pr-8`
    : iconLeft
      ? `${baseClassName} pl-9 pr-3`
      : `${baseClassName} px-3`

  return (
    <div
      data-testid={`formfield-${restInputProps.name}`}
      className="block text-sm text-neutral-300"
    >
      <label
        htmlFor={restInputProps.name}
        className={`flex items-center gap-1${hideLabel ? ' sr-only' : ''}`}
      >
        {/* Label + star are ONE flex item: the row's gap-1 exists to space the
            help icon off the label, and it was pushing the asterisk a space to
            the right too ("Number of Rows *"). Grouping them keeps the gap for
            the tooltip alone, so the star sits flush against the text. */}
        <span>
          {label}
          {!optional && <span className="text-red-400">*</span>}
        </span>
        {helpText && helpAriaLabel && (
          <Tooltip text={helpText} ariaLabel={helpAriaLabel} place={helpPlace} />
        )}
      </label>

      {options ? (
        // Our own dropdown rather than a native <select>: the OS anchors a
        // select's popup to the SELECTED option, so the list jumped around as
        // soon as anything but the first entry was chosen. See components/Select.
        // The test id sits on the wrapper, not the control: Select renders a
        // button (or a filter input) rather than a native <select>, so there is
        // no single element that carries the old `input-<name>` contract.
        <div data-testid={`input-${restInputProps.name}`} className="mt-1">
          <Select
            id={restInputProps.name}
            name={restInputProps.name}
            value={restInputProps.value}
            options={options}
            placeholder={placeholder}
            disabled={disabled}
            invalid={!!error}
            describedBy={error ? errorId : undefined}
            // The empty <option> a native select carried, and the tick marking
            // which row is live.
            clearable
            showTick
            className={`${controlClassName} px-3 disabled:cursor-not-allowed disabled:opacity-50`}
            listClassName="bg-[#181a1f]"
            onChange={(v) => restInputProps.onChange(selectEvent(restInputProps.name, v))}
            onBlur={() => restInputProps.onBlur(selectEvent(restInputProps.name, restInputProps.value))}
            onFocus={() => restInputProps.onFocus?.(selectEvent(restInputProps.name, restInputProps.value))}
          />
        </div>
      ) : (
        <div className="relative">
          {iconLeft &&
            (onIconLeftClick ? (
              <button
                type="button"
                onClick={onIconLeftClick}
                disabled={disabled}
                aria-label={`Open ${restInputProps.name} picker`}
                className="absolute inset-y-0 left-3 top-1 flex items-center text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
              >
                {iconLeft}
              </button>
            ) : (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-3 top-1 flex items-center text-neutral-400"
              >
                {iconLeft}
              </span>
            ))}
          <input
            ref={inputRef}
            {...restInputProps}
            id={restInputProps.name}
            data-testid={`input-${restInputProps.name}`}
            type={type}
            placeholder={placeholder}
            disabled={disabled}
            aria-describedby={inlineError ? errorId : undefined}
            aria-invalid={!!error}
            className={paddedClassName}
          />
          {errorAsIcon && (
            <Tooltip
              text={error}
              ariaLabel={`Validation error: ${error}`}
              place="top"
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <img src={infoIcon} alt="" className="h-4 w-4" />
            </Tooltip>
          )}
        </div>
      )}

      {inlineError && (
        <p
          id={errorId}
          data-testid={`error-${restInputProps.name}`}
          className="form-error-text mt-1"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}

export default FormField
