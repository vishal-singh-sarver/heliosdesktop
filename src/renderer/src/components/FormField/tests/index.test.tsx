import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useFormik } from 'formik'
import FormField from '../index'

// Mock Tooltip to isolate FormField — Tooltip has its own tests.
// Captures `place` as a data attribute so tests can assert it was forwarded.
vi.mock('../../Tooltip', () => ({
  default: ({ text, ariaLabel, place }: { text: string; ariaLabel: string; place?: string }) => (
    <span data-testid="tooltip" aria-label={ariaLabel} data-place={place ?? ''}>
      {text}
    </span>
  )
}))

// FormField's error message is linked to the input by a React useId() value,
// which depends on how many components rendered earlier in the FILE. That made
// the snapshots below break whenever a test was added above them, for no real
// change. Pin the generated ids so the snapshot only tracks actual markup.
const stableIds = (root: HTMLElement): HTMLElement => {
  root.querySelectorAll('[id], [aria-describedby]').forEach((el) => {
    if (el.id.startsWith('_r_')) el.id = 'generated-id'
    if (el.getAttribute('aria-describedby')?.startsWith('_r_')) {
      el.setAttribute('aria-describedby', 'generated-id')
    }
  })
  return root
}

describe('<FormField />', () => {
  const defaultProps = {
    labelProps: {
      label: 'Project Name',
      helpText: 'Enter a project name.',
      helpAriaLabel: 'Show project name help'
    },
    inputProps: {
      name: 'projectName',
      value: '',
      onChange: vi.fn(),
      onBlur: vi.fn()
    }
  }

  // Smoke test — component mounts without throwing
  it('renders without error', () => {
    render(<FormField {...defaultProps} />)
  })

  // Verifies the label text is rendered
  it('renders the label text', () => {
    render(<FormField {...defaultProps} />)
    expect(screen.getByText('Project Name')).toBeInTheDocument()
  })

  // Verifies the red asterisk indicating a required field is shown
  it('renders the required asterisk', () => {
    render(<FormField {...defaultProps} />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  // Verifies the Tooltip child component is rendered
  it('renders the tooltip', () => {
    render(<FormField {...defaultProps} />)
    expect(screen.getByTestId('tooltip')).toBeInTheDocument()
  })

  // Verifies the input element has an id matching the name prop (for label association)
  it('renders an input with id matching name prop', () => {
    render(<FormField {...defaultProps} />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('id', 'projectName')
  })

  // Verifies the default placeholder is "Enter" when no custom placeholder is given
  it('renders with default placeholder', () => {
    render(<FormField {...defaultProps} />)
    expect(screen.getByPlaceholderText('Enter')).toBeInTheDocument()
  })

  // Verifies onChange callback fires when user types into the input
  it('calls onChange when user types', () => {
    const onChange = vi.fn()
    render(<FormField {...defaultProps} inputProps={{ ...defaultProps.inputProps, onChange }} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Test' } })
    expect(onChange).toHaveBeenCalled()
  })

  // Verifies onBlur callback fires when input loses focus
  it('calls onBlur when input loses focus', () => {
    const onBlur = vi.fn()
    render(<FormField {...defaultProps} inputProps={{ ...defaultProps.inputProps, onBlur }} />)
    fireEvent.blur(screen.getByRole('textbox'))
    expect(onBlur).toHaveBeenCalled()
  })

  // Verifies no error message is shown when error prop is absent
  it('does not show error when error prop is absent', () => {
    render(<FormField {...defaultProps} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // Verifies the error message renders with role="alert" when error prop is provided
  it('shows error message when error prop is provided', () => {
    render(
      <FormField
        {...defaultProps}
        inputProps={{ ...defaultProps.inputProps, error: 'Name is required.' }}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required.')
  })

  // Verifies aria-invalid is set to true on the input when an error exists
  it('sets aria-invalid to true when error exists', () => {
    render(
      <FormField {...defaultProps} inputProps={{ ...defaultProps.inputProps, error: 'Required' }} />
    )
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders the error-colored outline when error exists', () => {
    render(
      <FormField {...defaultProps} inputProps={{ ...defaultProps.inputProps, error: 'Required' }} />
    )
    // #D92D20 = --color-text-error-primary; index.css keeps this red on focus too.
    expect(screen.getByRole('textbox')).toHaveClass('outline-[#D92D20]')
  })

  // Verifies aria-invalid is false when no error exists
  it('sets aria-invalid to false when no error', () => {
    render(<FormField {...defaultProps} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false')
  })

  // Verifies the input's aria-describedby points to the error element's id
  it('links input to error via aria-describedby', () => {
    render(
      <FormField {...defaultProps} inputProps={{ ...defaultProps.inputProps, error: 'Required' }} />
    )
    const input = screen.getByRole('textbox')
    const errorId = input.getAttribute('aria-describedby')
    expect(errorId).toBeTruthy()
    expect(screen.getByRole('alert')).toHaveAttribute('id', errorId)
  })

  // Verifies aria-describedby is not set when there is no error
  it('does not set aria-describedby when no error', () => {
    render(<FormField {...defaultProps} />)
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby')
  })

  // Verifies the input renders as type="number" when specified
  it('renders number type input when specified', () => {
    render(
      <FormField {...defaultProps} inputProps={{ ...defaultProps.inputProps, type: 'number' }} />
    )
    expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number')
  })

  // Verifies the input is disabled when disabled prop is true
  it('disables input when disabled prop is true', () => {
    render(
      <FormField {...defaultProps} inputProps={{ ...defaultProps.inputProps, disabled: true }} />
    )
    expect(screen.getByRole('textbox')).toBeDisabled()
  })


  // ── helpPlace pass-through ──

  it('forwards helpPlace to the Tooltip when provided', () => {
    render(
      <FormField
        {...defaultProps}
        labelProps={{ ...defaultProps.labelProps, helpPlace: 'right' }}
      />
    )
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-place', 'right')
  })

  it('leaves helpPlace unset on the Tooltip when not provided', () => {
    render(<FormField {...defaultProps} />)
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-place', '')
  })

  // ── Select variant ──

  it('renders a select when options are provided', () => {
    render(
      <FormField
        {...defaultProps}
        inputProps={{
          ...defaultProps.inputProps,
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' }
          ]
        }}
      />
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders placeholder as the first, clearing entry in the list', () => {
    render(
      <FormField
        {...defaultProps}
        inputProps={{
          ...defaultProps.inputProps,
          placeholder: 'Pick one',
          options: [{ value: 'a', label: 'Alpha' }]
        }}
      />
    )
    // The list is ours now, so it only exists once opened.
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Pick one')
    // Choosing it clears the field, the way the empty <option> used to.
    fireEvent.click(options[0])
    expect(defaultProps.inputProps.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: '' }) })
    )
  })

  it('renders one option per entry in the options list', () => {
    render(
      <FormField
        {...defaultProps}
        inputProps={{
          ...defaultProps.inputProps,
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
            { value: 'c', label: 'Gamma' }
          ]
        }}
      />
    )
    fireEvent.click(screen.getByRole('combobox'))
    const options = screen.getAllByRole('option')
    // +1 for the placeholder entry
    expect(options).toHaveLength(4)
    expect(options.slice(1).map((o) => o.textContent)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('fires onChange with the picked value when an option is chosen', () => {
    const onChange = vi.fn()
    render(
      <FormField
        {...defaultProps}
        inputProps={{
          ...defaultProps.inputProps,
          onChange,
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' }
          ]
        }}
      />
    )
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }))

    // The event is shaped like a <select>'s so existing handlers — including
    // formik's handleChange, which reads name/type off the target — keep working.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          name: defaultProps.inputProps.name,
          value: 'b',
          type: 'select-one'
        })
      })
    )
  })

  it('keeps the list anchored below the field regardless of what is selected', () => {
    // The whole point of replacing the native <select>: the OS anchored its popup
    // to the SELECTED option, so the list jumped upward once anything but the
    // first entry was chosen. Ours is pinned to the control's bottom edge.
    const { rerender } = render(
      <FormField
        {...defaultProps}
        inputProps={{
          ...defaultProps.inputProps,
          value: '',
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
            { value: 'c', label: 'Gamma' }
          ]
        }}
      />
    )
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toHaveClass('absolute', 'top-full')

    // Re-render with the 2nd entry selected — the anchoring must not change.
    rerender(
      <FormField
        {...defaultProps}
        inputProps={{
          ...defaultProps.inputProps,
          value: 'b',
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
            { value: 'c', label: 'Gamma' }
          ]
        }}
      />
    )
    expect(screen.getByRole('listbox')).toHaveClass('absolute', 'top-full')
    expect(screen.getByRole('option', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true')
  })

  it('marks the selected option with a leading tick, in a slot every row reserves', () => {
    render(
      <FormField
        {...defaultProps}
        inputProps={{
          ...defaultProps.inputProps,
          value: 'b',
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' }
          ]
        }}
      />
    )
    fireEvent.click(screen.getByRole('combobox'))

    // The tick leads the row, so the label reads after it.
    const selected = screen.getByRole('option', { name: 'Beta' })
    const [tickSlot, label] = Array.from(selected.children) as HTMLElement[]
    expect(tickSlot.querySelector('img')).toBeInTheDocument()
    expect(label).toHaveTextContent('Beta')

    // An unticked row keeps the identical empty slot, so no label shifts.
    const other = screen.getByRole('option', { name: 'Alpha' })
    const [emptySlot] = Array.from(other.children) as HTMLElement[]
    expect(emptySlot.querySelector('img')).toBeNull()
    expect(emptySlot.className).toBe(tickSlot.className)
  })

  it('shows the selected option label on the closed control', () => {
    render(
      <FormField
        {...defaultProps}
        inputProps={{
          ...defaultProps.inputProps,
          value: 'b',
          placeholder: 'Pick one',
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' }
          ]
        }}
      />
    )
    expect(screen.getByRole('combobox')).toHaveTextContent('Beta')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  // The dropdown no longer emits a real DOM change event, so formik's
  // handleChange/handleBlur have to be satisfied by the synthetic one. Weather's
  // AddColumnDialog drives its two selects entirely through getFieldProps, and
  // its own tests mock FormField out — so this is the only place that check
  // exists. Without it a broken event shape would fail silently in the app.
  it('works with formik getFieldProps (the Weather dialog wiring)', async () => {
    const submitted: Record<string, unknown>[] = []

    function FormikHarness(): React.JSX.Element {
      const formik = useFormik({
        initialValues: { unitId: '' },
        onSubmit: (values) => {
          submitted.push(values)
        }
      })
      return (
        <form onSubmit={formik.handleSubmit}>
          <FormField
            labelProps={{ label: 'Unit', optional: true }}
            inputProps={{
              ...formik.getFieldProps('unitId'),
              placeholder: 'Select unit',
              options: [
                { value: '10', label: 'Celsius' },
                { value: '20', label: 'Fahrenheit' }
              ]
            }}
          />
          <button type="submit">Save</button>
        </form>
      )
    }

    render(<FormikHarness />)

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Fahrenheit' }))

    // formik resolved the field from the event target's name and stored its value.
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Fahrenheit'))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(submitted).toEqual([{ unitId: '20' }]))
  })

  it('marks the field touched on blur so formik validation can fire', async () => {
    let touched: Record<string, boolean> = {}

    function FormikHarness(): React.JSX.Element {
      const formik = useFormik({
        initialValues: { unitId: '' },
        onSubmit: () => {}
      })
      touched = formik.touched as Record<string, boolean>
      return (
        <FormField
          labelProps={{ label: 'Unit', optional: true }}
          inputProps={{
            ...formik.getFieldProps('unitId'),
            placeholder: 'Select unit',
            options: [{ value: '10', label: 'Celsius' }]
          }}
        />
      )
    }

    render(<FormikHarness />)
    expect(touched.unitId).toBeUndefined()

    // Open, then click away — the field is only "left" once the list closes.
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.mouseDown(document.body)

    await waitFor(() => expect(touched.unitId).toBe(true))
  })

  // Snapshot regression guard — default state (no error)
  it('should match the snapshot', () => {
    const { container } = render(<FormField {...defaultProps} />)
    expect(stableIds(container.firstChild as HTMLElement)).toMatchSnapshot()
  })

  // Snapshot regression guard — error state
  it('should match the snapshot with error', () => {
    const { container } = render(
      <FormField {...defaultProps} inputProps={{ ...defaultProps.inputProps, error: 'Required' }} />
    )
    expect(stableIds(container.firstChild as HTMLElement)).toMatchSnapshot()
  })
})
