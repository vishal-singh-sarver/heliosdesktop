import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectMaterialsPopup, { type SelectMaterialsItem } from '../SelectMaterialsPopup'

const MATERIALS: SelectMaterialsItem[] = [
  { id: 'm1', name: 'Cotton', selected: false },
  { id: 'm2', name: 'Grass', selected: true }
]

const renderPopup = (maxHeight?: number, onSelectMaterial = vi.fn()): HTMLElement => {
  const { container } = render(
    <SelectMaterialsPopup
      materials={MATERIALS}
      onSelectMaterial={onSelectMaterial}
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
    expect(screen.getByRole('radio', { name: /Cotton/ })).toBeInTheDocument()
  })

  it('never stretches past its designed height on a tall window', () => {
    expect(renderPopup(900)).toHaveStyle({ height: '343px' })
  })
})

describe('SelectMaterialsPopup single-select', () => {
  it('marks the assigned material with a tick and leaves the others unticked', () => {
    // A ground carries ONE material, so the list is a radio group: exactly the
    // assigned row reads as checked.
    renderPopup()
    expect(screen.getByRole('radio', { name: /Grass/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /Cotton/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('renders the tick to the LEFT of the material name', () => {
    // The tick slot leads the row, so the name reads after it — and the slot is
    // reserved on every row so ticking one never shifts any label.
    renderPopup()
    const selected = screen.getByRole('radio', { name: /Grass/ })
    const [tickSlot, label] = Array.from(selected.children) as HTMLElement[]

    expect(tickSlot.querySelector('img')).toBeInTheDocument()
    expect(label).toHaveTextContent('Grass')

    // The unselected row keeps the same empty slot, so both labels start level.
    const unselected = screen.getByRole('radio', { name: /Cotton/ })
    const [emptySlot] = Array.from(unselected.children) as HTMLElement[]
    expect(emptySlot.querySelector('img')).toBeNull()
    expect(emptySlot.className).toBe(tickSlot.className)
  })

  it('drops the old checkbox box entirely', () => {
    // The 19x19 bordered square the multi-select list used is gone — the tick is
    // now the only selection visual.
    const popup = renderPopup()
    expect(popup.querySelector('.w-\\[19px\\]')).toBeNull()
  })

  it('reports a pick so the parent can replace the current material', async () => {
    const onSelectMaterial = vi.fn()
    renderPopup(undefined, onSelectMaterial)

    await userEvent.click(screen.getByRole('radio', { name: /Cotton/ }))

    expect(onSelectMaterial).toHaveBeenCalledTimes(1)
    expect(onSelectMaterial).toHaveBeenCalledWith({ id: 'm1', name: 'Cotton' })
  })

  it('reports a re-click of the already-selected material to the parent', async () => {
    // The row never toggles off — clearing the material is the trash icon's job
    // back in the Materials section. It still reports up, so the parent can say
    // the material is already assigned instead of the click vanishing.
    const onSelectMaterial = vi.fn()
    renderPopup(undefined, onSelectMaterial)

    await userEvent.click(screen.getByRole('radio', { name: /Grass/ }))

    expect(onSelectMaterial).toHaveBeenCalledTimes(1)
    expect(onSelectMaterial).toHaveBeenCalledWith({ id: 'm2', name: 'Grass' })
  })
})

describe('SelectMaterialsPopup keyboard focus', () => {
  it('gives each row an inset, rounded focus outline instead of the browser default', () => {
    // Matches the selected-row cue in the left-hand geometry tree (TreeRow): a
    // rounded blue border, not a square outline running flush to the popup edges.
    renderPopup()
    const row = screen.getByRole('radio', { name: /Cotton/ })

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

describe('SelectMaterialsPopup search', () => {
  it('says no materials were found when the query matches nothing', async () => {
    // The library is NOT empty, so the "add a new material" empty state would be
    // wrong here — the user just needs to widen the search.
    renderPopup()

    await userEvent.type(screen.getByRole('textbox', { name: 'Search materials' }), 'zzz')

    expect(screen.getByText('No materials found')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    // Not the whole-popup empty state — the search field stays put.
    expect(screen.queryByText('No Material Found')).not.toBeInTheDocument()
  })

  it('brings the rows back when the query matches again', async () => {
    renderPopup()
    const search = screen.getByRole('textbox', { name: 'Search materials' })

    await userEvent.type(search, 'zzz')
    await userEvent.clear(search)
    await userEvent.type(search, 'cot')

    expect(screen.getByRole('radio', { name: /Cotton/ })).toBeInTheDocument()
    expect(screen.queryByText('No materials found')).not.toBeInTheDocument()
  })
})
