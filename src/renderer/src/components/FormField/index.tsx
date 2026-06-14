import React, { useId } from 'react'
import type { PlacesType } from 'react-tooltip'
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
}

interface FormFieldProps {
  labelProps: FormFieldLabelProps
  inputProps: FormFieldInputProps
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
    ...restInputProps
  } = inputProps
  const errorId = useId()

  const outlineClasses = error ? 'outline outline-1 -outline-offset-1 outline-red-500' : 'outline-none'
  const focusBorderClassName = error ? 'focus:border-red-500' : 'focus:border-neutral-500'
  const baseClassName = `mt-1 h-9 w-full rounded border border-app-border bg-dark text-sm text-white ${focusBorderClassName} ${outlineClasses}`
  const paddedClassName = iconLeft ? `${baseClassName} pl-9 pr-3` : `${baseClassName} px-3`

  return (
    <div className="block text-sm text-neutral-300">
      <label
        htmlFor={restInputProps.name}
        className={`flex items-center gap-1${hideLabel ? ' sr-only' : ''}`}
      >
        {label}
        {!optional && <span className="text-red-400">*</span>}
        {helpText && helpAriaLabel && (
          <Tooltip text={helpText} ariaLabel={helpAriaLabel} place={helpPlace} />
        )}
      </label>

      {options ? (
        <select
          {...restInputProps}
          id={restInputProps.name}
          disabled={disabled}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={!!error}
          className={`${baseClassName} px-3 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {/* Inline style on each <option> because Chromium's native
              dropdown popup ignores most CSS but DOES honor an option's
              own background-color / color — without this the popup
              renders with the OS (GTK) light theme on Linux. */}
          <option value="" style={{ backgroundColor: '#181a1f', color: '#ffffff' }}>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              style={{ backgroundColor: '#181a1f', color: '#ffffff' }}
            >
              {opt.label}
            </option>
          ))}
        </select>
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
            type={type}
            placeholder={placeholder}
            disabled={disabled}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={!!error}
            className={paddedClassName}
          />
        </div>
      )}

      {error && (
        <p id={errorId} className="form-error-text mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default FormField
