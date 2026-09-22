import { fireEvent, render, screen } from '@testing-library/react'
import Select from '../index'

// A locked control has to LOOK locked, chevron included.
//
// The searchable shape draws its chevron as a SIBLING button of the input, so the
// caller's disabled styling — which rides on `className`, and `className` reaches
// the input alone — never touched it. The Material Type picker locks once its card
// is saved (the backend keys the member by material_type_id), and it locked into
// exactly that state: greyed text beside a full-strength chevron, the one part of
// the control that advertises a list behind it.

const OPTIONS = [
  { value: '1', label: 'Visualiser' },
  { value: '2', label: 'Radiation' }
]

// The chevron is aria-hidden and untabbable, so it is not reachable by role.
const chevronButton = (): HTMLButtonElement => {
  const el = document.querySelector('button[aria-hidden="true"]')
  if (!(el instanceof HTMLButtonElement)) throw new Error('no chevron button')
  return el
}

const renderSelect = (disabled: boolean): void => {
  render(
    <Select
      searchable
      options={OPTIONS}
      value="1"
      placeholder="Select"
      ariaLabel="Material Type.01"
      disabled={disabled}
      className="disabled:cursor-not-allowed disabled:opacity-60"
      onChange={() => {}}
    />
  )
}

describe('Select — a disabled searchable control', () => {
  it('disables and fades the chevron along with the input', () => {
    renderSelect(true)

    const chevron = chevronButton()
    expect(chevron).toBeDisabled()
    // The fade is the control's own, not the caller's: the caller cannot reach
    // this element.
    expect(chevron.className).toContain('disabled:opacity-60')
    expect(chevron.className).toContain('disabled:cursor-not-allowed')
  })

  it('does not open the list when the chevron is clicked', () => {
    renderSelect(true)

    fireEvent.click(chevronButton())

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('still opens from the chevron when the control is enabled', () => {
    renderSelect(false)

    fireEvent.click(chevronButton())

    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })
})
