import React from 'react'
import { ChevronDownIcon } from './Icons'

// ── Buttons ────────────────────────────────────────────────────────────────────

interface ButtonProps {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
}

export function PrimaryBtn({
  children,
  disabled,
  onClick,
  type = 'button'
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        // Spec: 74×34, 4px radius, 1px border, 5/10 padding, 4px gap.
        'inline-flex h-[34px] w-[74px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[4px] border border-[#5888E5] bg-[#245AC5] px-[10px] py-[5px] text-sm font-medium text-white outline-none transition-colors hover:bg-[#1f4fb0] focus:outline-none focus-visible:outline-none',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function SecondaryBtn({ children, onClick }: ButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      // Spec: 74×34, 4px radius, 1px border, 5/10 padding, 4px gap.
      className="inline-flex h-[34px] w-[74px] cursor-pointer items-center justify-center gap-1 rounded-[4px] border border-neutral-300 bg-white px-[10px] py-[5px] text-sm font-medium text-neutral-900 outline-none transition-colors hover:bg-neutral-200 focus:outline-none focus-visible:outline-none"
    >
      {children}
    </button>
  )
}

interface GhostBtnProps extends ButtonProps {
  leftIcon?: React.ReactNode
}

export function GhostBtn({ children, onClick, leftIcon }: GhostBtnProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/5"
    >
      {leftIcon}
      {children}
    </button>
  )
}

// ── Select ─────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string | null
  onChange: (value: string | null) => void
  options: ReadonlyArray<SelectOption>
  placeholder?: string
  disabled?: boolean
  /** Optional stable hook for e2e tests; renders as data-testid on the <select>. */
  testId?: string
}

export function Select({
  value,
  onChange,
  options,
  placeholder = '-- none --',
  disabled,
  testId
}: SelectProps): React.JSX.Element {
  return (
    <div className="relative">
      <select
        data-testid={testId}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="w-full appearance-none rounded border border-app-border bg-app-panel px-3 py-2 pr-9 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
    </div>
  )
}

// ── Text input ─────────────────────────────────────────────────────────────────

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export function TextInput({
  className,
  ...rest
}: TextInputProps): React.JSX.Element {
  const baseClass =
    'w-full rounded border border-app-border bg-app-panel px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50'
  const merged = className ? `${baseClass} ${className}` : baseClass
  return <input {...rest} className={merged} />
}
