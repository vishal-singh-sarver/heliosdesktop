import React from 'react'

interface LabeledFieldProps {
  label: string
  value: string | number
  /**
   * Omit to render a read-only display. Provide to render as an editable input.
   */
  onChange?: (value: string) => void
  onBlur?: () => void
  /**
   * Dims the value and blocks interaction. Useful for derived/read-only fields
   * like "UTC Offset" that are computed from other inputs.
   */
  disabled?: boolean
  /**
   * Applies a red border around the whole field to signal invalid input.
   * No inline error message is rendered — callers that want textual error
   * feedback should handle it separately.
   */
  invalid?: boolean
  /**
   * Optional content rendered inline with the label text (inside the label
   * cell, before the input). Intended for a Tooltip / help icon that should
   * sit right next to the label, not after the input box.
   */
  labelAdornment?: React.ReactNode
  placeholder?: string
  ariaLabel?: string
  /**
   * Override the input width. Defaults to a compact size that fits three
   * fields in the header row.
   */
  inputWidthClass?: string
}

function LabeledField({
  label,
  value,
  onChange,
  onBlur,
  disabled = false,
  invalid = false,
  labelAdornment,
  placeholder,
  ariaLabel,
  inputWidthClass = 'w-20'
}: LabeledFieldProps): React.JSX.Element {
  const readOnly = onChange === undefined
  const borderClass = invalid ? 'border-red-500' : 'border-app-border'

  return (
    <div className={`flex items-center rounded border ${borderClass} bg-dark text-sm`}>
      <span
        className={`flex items-center gap-1.5 px-3 py-1 text-neutral-200 bg-[#424242] border-r rounded-l ${borderClass}`}
      >
        {label}
        {labelAdornment}
      </span>
      <input
        aria-label={ariaLabel ?? label}
        aria-invalid={invalid || undefined}
        value={value}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value)}
        onBlur={onBlur}
        className={`${inputWidthClass} h-7 px-2 bg-dark text-right outline-none focus:bg-neutral-900 ${
          disabled ? 'text-neutral-500 cursor-not-allowed' : 'text-neutral-100'
        } ${readOnly ? 'cursor-default' : ''}`}
      />
    </div>
  )
}

export default LabeledField
