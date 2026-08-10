import { fireEvent, render, screen } from '@testing-library/react'
import Select from '../index'

// The list is portalled out of the control so no scrolling ancestor can clip it.
// WHERE it lands matters: <body> is wrong inside a modal dialog, because
// Dialog opens with showModal() and a modal <dialog> sits in the browser's TOP
// LAYER — painted above the whole normal document. A list in <body> is in that
// normal document, so it renders BEHIND the dialog whatever its z-index. These
// pin the host so that can't regress.

const OPTIONS = [
  { value: '1', label: 'Temperature' },
  { value: '2', label: 'Humidity' }
]

const renderSelect = (wrap: boolean): void => {
  const select = (
    <Select
      options={OPTIONS}
      value=""
      placeholder="Select"
      onChange={() => {}}
      ariaLabel="Data type"
    />
  )
  render(wrap ? <dialog open>{select}</dialog> : select)
}

const openList = (): void => {
  fireEvent.click(screen.getByRole('combobox', { name: 'Data type' }))
}

describe('Select — where the list is portalled', () => {
  it('lands in <body> for a control on the page', () => {
    renderSelect(false)
    openList()

    const list = screen.getByRole('listbox')
    expect(list.parentElement).toBe(document.body)
  })

  it('lands INSIDE the dialog for a control in one', () => {
    renderSelect(true)
    openList()

    const dialog = document.querySelector('dialog')
    const list = screen.getByRole('listbox')
    // Inside the dialog element — i.e. on the same layer, where it paints above
    // rather than behind it.
    expect(dialog).not.toBeNull()
    expect(dialog?.contains(list)).toBe(true)
    expect(list.parentElement).not.toBe(document.body)
  })

  it('still positions the list fixed, so the dialog cannot clip or scroll it away', () => {
    renderSelect(true)
    openList()

    expect(screen.getByRole('listbox')).toHaveStyle({ position: 'fixed' })
  })
})
