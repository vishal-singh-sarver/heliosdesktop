import { fireEvent, render, screen } from '@testing-library/react'
import Select from '../index'

// Scrolling an open list must never dismiss it. A trackpad scroll is a wheel
// event and was always fine; DRAGGING a scrollbar is a press, and a scrollbar
// gutter belongs to no element and cannot take focus — so the browser blurs the
// control with a null relatedTarget, and the blur handler used to shut the list
// mid-drag. That applies to the list's own scrollbar and to the panel's, so both
// are pinned here, alongside the outside-press behaviour they must not weaken.

const OPTIONS = [
  { value: '1', label: 'Radiation' },
  { value: '2', label: 'Energy Balance' }
]

const renderSelect = (onBlur?: () => void): void => {
  render(
    <div data-testid="panel">
      <Select
        options={OPTIONS}
        value=""
        placeholder="Select"
        onChange={() => {}}
        ariaLabel="Material type"
        onBlur={onBlur}
      />
    </div>
  )
}

const openList = (): HTMLElement => {
  const control = screen.getByRole('combobox', { name: 'Material type' })
  fireEvent.click(control)
  return control
}

describe('Select — scrollbar presses do not dismiss the list', () => {
  it('survives a drag on the list’s own scrollbar', () => {
    const onBlur = vi.fn()
    renderSelect(onBlur)
    const control = openList()

    // The press lands on the list container itself: a scrollbar cannot be
    // hit-tested, so it reports the element it belongs to.
    fireEvent.mouseDown(screen.getByRole('listbox'))
    // Which the browser follows by blurring the control, focus going nowhere.
    fireEvent.blur(control, { relatedTarget: null })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(onBlur).not.toHaveBeenCalled()
  })

  it('survives a drag on the surrounding panel’s scrollbar', () => {
    const onBlur = vi.fn()
    renderSelect(onBlur)
    const control = openList()

    // A press past `clientWidth` but still inside the border box is the gutter —
    // the only way to tell a scrollbar press from a content one.
    const panel = screen.getByTestId('panel')
    Object.defineProperty(panel, 'clientWidth', { value: 50, configurable: true })
    fireEvent.mouseDown(panel, { clientX: 200 })
    fireEvent.blur(control, { relatedTarget: null })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(onBlur).not.toHaveBeenCalled()
  })

  it('hands focus back to the control when the drag ends', () => {
    renderSelect()
    const control = openList()

    fireEvent.mouseDown(screen.getByRole('listbox'))
    fireEvent.blur(control, { relatedTarget: null })
    fireEvent.mouseUp(document)

    // Still open, and usable by keyboard again — the drag must not cost the user
    // their arrow keys or Escape.
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(control).toHaveFocus()
  })

  it('still closes and reports the blur on a genuine outside press', () => {
    const onBlur = vi.fn()
    renderSelect(onBlur)
    openList()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onBlur).toHaveBeenCalled()
  })
})
