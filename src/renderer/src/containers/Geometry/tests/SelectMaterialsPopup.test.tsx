import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SelectMaterialsPopup, { type SelectMaterialsItem } from '../SelectMaterialsPopup'

const MATERIALS: SelectMaterialsItem[] = [
  { id: 'm1', name: 'Cotton', checked: false },
  { id: 'm2', name: 'Grass', checked: true }
]

const renderPopup = (maxHeight?: number): HTMLElement => {
  const { container } = render(
    <SelectMaterialsPopup
      materials={MATERIALS}
      onToggleMaterial={vi.fn()}
      onAddNewMaterial={vi.fn()}
      maxHeight={maxHeight}
    />
  )
  return container.firstElementChild as HTMLElement
}

describe('SelectMaterialsPopup sizing', () => {
  it('renders at its designed height when given no cap', () => {
    // Standalone use (and any window with room) keeps the Figma's 343px.
    expect(renderPopup()).toHaveStyle({ height: '343px' })
  })

  it('shrinks to the cap on a short window', () => {
    // AnchoredPopup passes the room available beside the panel; the list inside
    // scrolls to absorb the difference rather than overflowing the viewport.
    expect(renderPopup(200)).toHaveStyle({ height: '200px' })
    expect(screen.getByRole('button', { name: /Cotton/ })).toBeInTheDocument()
  })

  it('never stretches past its designed height on a tall window', () => {
    expect(renderPopup(900)).toHaveStyle({ height: '343px' })
  })
})

describe('SelectMaterialsPopup keyboard focus', () => {
  it('gives each row an inset, rounded focus outline instead of the browser default', () => {
    // Matches the selected-row cue in the left-hand geometry tree (TreeRow): a
    // rounded blue border, not a square outline running flush to the popup edges.
    renderPopup()
    const row = screen.getByRole('button', { name: /Cotton/ })

    expect(row).toHaveClass('rounded', 'focus:outline-none', 'focus-visible:border-[#245AC5]')
    // The border is always present (transparent when unfocused), so gaining focus
    // shifts nothing — the same trick TreeRow uses.
    expect(row).toHaveClass('border', 'border-transparent')
  })

  it('leaves room inside the popup for the outline to sit', () => {
    // The list's own horizontal padding is what insets the rows; without it the
    // focus outline runs flush against the popup's edges.
    const popup = renderPopup()
    const list = popup.querySelector('.overflow-y-auto') as HTMLElement
    expect(list).toHaveClass('px-2')
  })
})
