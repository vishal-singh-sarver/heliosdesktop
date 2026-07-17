import { fireEvent, render, screen } from '@testing-library/react'
import MaterialPropertiesPopup, { type MaterialDetailSection } from '../MaterialPropertiesPopup'

// A material carrying two types, so the tests cover the per-type sections and
// the catalog groups within them. `transmissivity` is deliberately blank — the
// service drops properties the user never filled in, and the popup still lists
// them (with an empty value) rather than hiding the row.
const radiation: MaterialDetailSection = {
  typeId: 1,
  typeName: 'Radiation',
  groups: [
    {
      group: 'model',
      label: 'Model',
      rows: [
        { property: 'surface_albedo', label: 'Surface Albedo', value: '0.2' },
        { property: 'emissivity', label: 'Emissivity', value: '0.95' },
        { property: 'transmissivity', label: 'Transmissivity', value: '' }
      ]
    },
    {
      group: 'visualisation',
      label: 'Visualisation',
      rows: [{ property: 'color_r', label: 'Color R', value: '255' }]
    }
  ]
}

const energyBalance: MaterialDetailSection = {
  typeId: 2,
  typeName: 'Energy Balance',
  groups: [
    {
      group: 'model',
      label: 'Model',
      rows: [{ property: 'surface_albedo', label: 'Surface Albedo', value: '0.4' }]
    }
  ]
}

describe('<MaterialPropertiesPopup />', () => {
  it('renders a section per material type, a label per group, and a row per property', () => {
    render(
      <MaterialPropertiesPopup
        name="Material.001"
        sections={[radiation, energyBalance]}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('Material.001')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Radiation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Energy Balance' })).toBeInTheDocument()
    // 'Model' appears under both types — each section carries its own groups.
    expect(screen.getAllByText('Model')).toHaveLength(2)
    expect(screen.getByText('Visualisation')).toBeInTheDocument()
    expect(screen.getByText('Emissivity')).toBeInTheDocument()
    expect(screen.getByText('0.95')).toBeInTheDocument()
  })

  it('lists a property the material never set, with a blank value', () => {
    render(
      <MaterialPropertiesPopup name="Material.001" sections={[radiation]} onClose={() => {}} />
    )

    // The row survives; only its value is empty. <dt>/<dd> siblings, so the
    // value is locatable from its label without a test id.
    const label = screen.getByText('Transmissivity')
    expect(label.nextElementSibling).toHaveTextContent('')
  })

  it('shows the same property separately for each type that defines it', () => {
    render(
      <MaterialPropertiesPopup
        name="Material.001"
        sections={[radiation, energyBalance]}
        onClose={() => {}}
      />
    )

    // Radiation's 0.2 and Energy Balance's 0.4 are both surface_albedo — neither
    // may swallow the other.
    expect(screen.getAllByText('Surface Albedo')).toHaveLength(2)
    expect(screen.getByText('0.2')).toBeInTheDocument()
    expect(screen.getByText('0.4')).toBeInTheDocument()
  })

  it('renders no editable control', () => {
    const { container } = render(
      <MaterialPropertiesPopup name="Material.001" sections={[radiation]} onClose={() => {}} />
    )

    // Read-only means information, not a disabled field. Guards against anyone
    // later reaching for FormField, which renders a focusable input.
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('select')).toBeNull()
    expect(container.querySelector('textarea')).toBeNull()
  })

  it('caps its height at 866px but never past the viewport', () => {
    render(
      <MaterialPropertiesPopup name="Material.001" sections={[radiation]} onClose={() => {}} />
    )

    // An inline style, not a Tailwind class: max-h-[min(866px,100vh-16px)]
    // compiles to invalid CSS and fails silently, leaving no cap at all.
    expect(screen.getByRole('dialog')).toHaveStyle({ maxHeight: 'min(866px, 100vh - 16px)' })
  })

  it('says the properties are not connected yet when it has no sections', () => {
    render(<MaterialPropertiesPopup name="Material.001" sections={[]} onClose={() => {}} />)

    expect(screen.getByText('Material properties are not connected yet.')).toBeInTheDocument()
  })

  it('closes when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<MaterialPropertiesPopup name="Material.001" sections={[radiation]} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close material properties' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
