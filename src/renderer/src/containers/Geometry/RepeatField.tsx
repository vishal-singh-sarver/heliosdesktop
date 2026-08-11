import FormField from '@renderer/components/FormField'
import React from 'react'
import { trimText } from 'utils/trimText'
import messages from './messages'

// One Texture Repeat input (R or C): the plain numeric field the form already
// rendered, plus a stepper that moves between VALID values rather than by one.
//
// Deliberately dumb. It knows nothing about divisors, the store, or snapping —
// the parent computes the valid set and owns every value change. This component
// only decides when to ask: `onCommit` on blur/Enter (the parent snaps), `onStep`
// on a chevron or Arrow key (the parent moves to the neighbouring valid value).
//
// The shared components/FormField is used UNCHANGED. Three things make that
// work: the chevrons are absolutely positioned by the wrapper here rather than
// rendered by FormField, the input's right padding comes through FormField's
// existing `inputClassName` prop, and ArrowUp/ArrowDown are caught on the
// wrapper <div> — React's synthetic events bubble up from the input, so no new
// FormField prop and no ref plumbing is needed.
export interface RepeatFieldProps {
  property: string
  // The short in-field label ("R" / "C") — also the placeholder and the name
  // inside the stepper buttons' accessible labels.
  label: string
  value: string
  error?: string
  disabled?: boolean
  // Disable the stepper independently of the field: with no usable resolution
  // there is no valid set to step through, but the value stays editable.
  canStepUp: boolean
  canStepDown: boolean
  onChange: (next: string) => void
  onCommit: () => void
  onStep: (direction: 1 | -1) => void
  onBlur: () => void
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => void
}

function RepeatField({
  property,
  label,
  value,
  error,
  disabled = false,
  canStepUp,
  canStepDown,
  onChange,
  onCommit,
  onStep,
  onBlur,
  onFocus
}: RepeatFieldProps): React.JSX.Element {
  // FormField surfaces this field's error as an in-cell info icon at `right-2`
  // (errorAsTooltip), so the chevrons step aside when one is showing rather than
  // stacking on top of it — and the input's padding grows to clear both.
  const hasErrorIcon = !!error
  const stepperOffset = hasErrorIcon ? 'right-7' : 'right-1.5'
  const inputPadding = hasErrorIcon ? 'pr-14' : 'pr-7'
  // The label doubles as this field's placeholder (its own label is sr-only), so
  // it has to be shortened to what the box can show. Tighter than the plain
  // fields beside it, because the stepper — and the error icon when there is one
  // — eat into the same row from the right. The two budgets track the padding
  // above: whatever the chevrons take, the placeholder cannot use.
  const placeholderChars = hasErrorIcon ? 11 : 15

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return
    if (e.key === 'ArrowUp') {
      // The browser's own caret-to-start/end behaviour would otherwise fire too.
      e.preventDefault()
      if (canStepUp) onStep(1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (canStepDown) onStep(-1)
      return
    }
    // Enter commits without leaving the field, so the snap is visible before the
    // user tabs away. The form has no <form> element, so this submits nothing.
    if (e.key === 'Enter') {
      e.preventDefault()
      onCommit()
    }
  }

  const stepButton = (direction: 1 | -1): React.JSX.Element => {
    const enabled = !disabled && (direction === 1 ? canStepUp : canStepDown)
    return (
      <button
        type="button"
        tabIndex={-1}
        disabled={!enabled}
        aria-label={
          direction === 1 ? messages.repeatStepUp(label) : messages.repeatStepDown(label)
        }
        // Keep focus (and the caret) in the input: a chevron that stole focus
        // would fire the field's blur-commit first, snapping the value a step
        // before moving it — two changes for one click.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onStep(direction)}
        // White at rest, matching the solid-white fill the old chevron asset had
        // — a 1.5px stroke reads lighter than a filled glyph, so inheriting the
        // previous neutral-400 left the arrows dimmer than they used to be.
        className="pointer-events-auto flex h-[13px] w-4 items-center justify-center rounded-[2px] text-white hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30"
      >
        {/* Drawn inline rather than from ChevronDownIcon.svg. That asset's glyph
            is not centred in its own 10×6 box — it sits ~0.3px left and ~0.3px
            high — so rotating it 180° for the up arrow moved it the same amount
            the OTHER way on both axes, leaving the pair visibly out of line.
            6 wide × 3 deep, not the near-flat 8 × 2.5 it started as — a shallow
            chevron at this size reads as a line rather than an arrow.
            Symmetric about x=5, and with round caps adding half the stroke width
            it clears 1.125 on each side and 0.625 top and bottom — symmetric on
            both axes, so the rotation lands exactly on the mirror image. Keep
            those two clearances equal if the path or stroke width changes, or
            the two arrows drift out of line again.
            currentColor also lets the stroke follow the button's text colour,
            including the disabled state — the asset was a fixed white fill. */}
        <svg
          viewBox="0 0 10 6"
          aria-hidden="true"
          className={`h-[6px] w-[10px]${direction === 1 ? ' rotate-180' : ''}`}
        >
          <path
            d="M2 1.5 L5 4.5 L8 1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    )
  }

  return (
    <div className="relative" onKeyDown={handleKeyDown}>
      <FormField
        labelProps={{
          label,
          // The group heading ("Number of Textures") is the visible label; the
          // field name shows as the placeholder — same as every other field on
          // this form.
          hideLabel: true,
          optional: false
        }}
        inputProps={{
          name: property,
          value,
          placeholder: trimText(label, placeholderChars),
          error,
          errorAsTooltip: true,
          disabled,
          inputClassName: `bg-[#121212] ${inputPadding}`,
          onChange: (e) => onChange(e.target.value),
          onBlur,
          onFocus
        }}
      />
      {/* Anchored to the BOTTOM of the wrapper, not its centre: FormField's
          sr-only label contributes no height but the input carries `mt-1`, so a
          top-1/2 stepper would sit 2px high. The input is h-9 and the last box
          in the field (the error is a tooltip, not an inline line), so bottom-0
          + h-9 centres the stepper on it exactly. */}
      <div
        className={`pointer-events-none absolute bottom-0 ${stepperOffset} flex h-9 flex-col items-center justify-center gap-[1px]`}
      >
        {stepButton(1)}
        {stepButton(-1)}
      </div>
    </div>
  )
}

export default RepeatField
