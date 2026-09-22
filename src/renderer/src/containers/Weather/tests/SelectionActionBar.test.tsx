import { fireEvent, render, screen } from '@testing-library/react'
import SelectionActionBar from '../SelectionActionBar'

describe('SelectionActionBar', () => {
  it('renders nothing when no rows are selected', () => {
    const { container } = render(<SelectionActionBar count={0} onDelete={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the count and the plural form', () => {
    render(<SelectionActionBar count={266} onDelete={vi.fn()} />)
    expect(screen.getByTestId('selection-action-bar')).toHaveTextContent('266 rows are selected')
  })

  // "1 rows are selected" is exactly the bug this kind of copy attracts —
  // store/toastMessages.ts carries the same note for the delete toasts.
  it('renders the singular form for a single row', () => {
    render(<SelectionActionBar count={1} onDelete={vi.fn()} />)
    expect(screen.getByTestId('selection-action-bar')).toHaveTextContent('1 row is selected')
  })

  it('calls onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn()
    render(<SelectionActionBar count={3} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
