import { fireEvent, render, screen } from '@testing-library/react'
import MaterialPropertiesPopup, { type MaterialDetailSection } from '../MaterialPropertiesPopup'

// A material carrying two types, so the tests cover the per-type accordions and
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
  it('renders a collapsible "Parameter Group.0N" accordion per material type, collapsed by default', () => {
    render(
      <MaterialPropertiesPopup
        name="Material.001"
        sections={[radiation, energyBalance]}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('Material.001')).toBeInTheDocument()
    // One numbered accordion header per type.
    expect(screen.getByRole('button', { name: 'Parameter Group.01' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parameter Group.02' })).toBeInTheDocument()
    // Collapsed by default → the type names and property rows aren't shown yet.
    expect(screen.queryByText('Radiation')).not.toBeInTheDocument()
    expect(screen.queryByText('Emissivity')).not.toBeInTheDocument()
  })

  it('expands a type to show its material type, group labels and property rows', () => {
    render(
      <MaterialPropertiesPopup name="Material.001" sections={[radiation]} onClose={() => {}} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Parameter Group.01' }))

    // The "Parameter Group" label + the material type as its read-only value.
    expect(screen.getByText('Parameter Group')).toBeInTheDocument()
    expect(screen.getByText('Radiation')).toBeInTheDocument()
    // Group labels and the rows within them.
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('Visualisation')).toBeInTheDocument()
    expect(screen.getByText('Emissivity')).toBeInTheDocument()
    expect(screen.getByText('0.95')).toBeInTheDocument()
  })

  it('collapses an expanded type when its header is clicked again', () => {
    render(
      <MaterialPropertiesPopup name="Material.001" sections={[radiation]} onClose={() => {}} />
    )
    const header = screen.getByRole('button', { name: 'Parameter Group.01' })

    fireEvent.click(header)
    expect(screen.getByText('Emissivity')).toBeInTheDocument()
    fireEvent.click(header)
    expect(screen.queryByText('Emissivity')).not.toBeInTheDocument()
  })

  it('omits the heading for the ungrouped "General" bucket', () => {
    const withGeneral: MaterialDetailSection = {
      typeId: 3,
      typeName: 'Photosynthesis',
      groups: [
        {
          group: 'General',
          label: 'General',
          rows: [{ property: 'stomatal_sidedness', label: 'Stomatal Sidedness', value: '0.7' }]
        }
      ]
    }
    render(
      <MaterialPropertiesPopup name="Material.001" sections={[withGeneral]} onClose={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Parameter Group.01' }))

    // The row still shows; only the generic "General" heading is suppressed.
    expect(screen.getByText('Stomatal Sidedness')).toBeInTheDocument()
    expect(screen.queryByText('General')).not.toBeInTheDocument()
  })

  it('lists a property the material never set, with a blank value (once expanded)', () => {
    render(
      <MaterialPropertiesPopup name="Material.001" sections={[radiation]} onClose={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Parameter Group.01' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Parameter Group.01' }))
    fireEvent.click(screen.getByRole('button', { name: 'Parameter Group.02' }))

    // Radiation's 0.2 and Energy Balance's 0.4 are both surface_albedo — neither
    // may swallow the other.
    expect(screen.getAllByText('Surface Albedo')).toHaveLength(2)
    expect(screen.getByText('0.2')).toBeInTheDocument()
    expect(screen.getByText('0.4')).toBeInTheDocument()
  })

  it('renders no editable control, even when expanded', () => {
    const { container } = render(
      <MaterialPropertiesPopup name="Material.001" sections={[radiation]} onClose={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Parameter Group.01' }))

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

  it('renders at the caller-supplied fixed height (sized to the 3D window)', () => {
    render(
      <MaterialPropertiesPopup
        name="Material.001"
        sections={[radiation]}
        height={480}
        onClose={() => {}}
      />
    )
    // A fixed height, not a content-hugging cap: the popup is a tall panel and its
    // body scrolls inside it. The viewport-cap default only applies with no height.
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveStyle({ height: '480px' })
    expect(dialog.style.maxHeight).toBe('')
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
