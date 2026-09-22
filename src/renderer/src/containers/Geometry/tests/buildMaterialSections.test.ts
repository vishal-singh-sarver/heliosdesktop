import { describe, expect, it } from 'vitest'
import { textureServeUrl } from 'containers/Materials/service'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import { buildMaterialSections, type PopupMaterialMember } from '../ObjectPropertiesForm'

// The read-only material popup opened from a geometry's Materials row builds its
// rows from the CATALOG (labels + grouping) and its values from the material's
// stored properties. The catalog lists every conditional group a type can have,
// so the popup has to filter them by the member's own selector value — otherwise
// a Stomatal Conductance material set to Medlyn also rendered empty
// Ball-woodrow-berry / Ball-berry-leuning / Buckley-mott-farquhar sections,
// implying settings it does not have. The editable Materials form has always
// filtered; this keeps the two views in agreement.

const float = (property: string, display_order: number, label?: string) => ({
  property_type_id: display_order,
  property,
  label,
  description: '',
  datatype: 'float' as const,
  min: 0,
  max: 50,
  display_order
})

const subModel = (name: string, selector_value: string, prefix: string, order: number) => ({
  name,
  selector_property: 'stomatal_model',
  selector_value,
  display_order: order,
  properties: [float(`${prefix}_gs0`, order, 'gs, o'), float(`${prefix}_a1`, order + 1, 'a1')]
})

const stomatal: MaterialTypeDef = {
  id: 6,
  materialtype: 'Stomatal Conductance',
  description: '',
  properties: [
    float('gamma_co2', 5, 'Gamma_CO2'),
    {
      property_type_id: 74,
      property: 'stomatal_model',
      label: 'Stomatal Conductance',
      description: '',
      datatype: 'enum',
      min: null,
      max: null,
      enum_values: ['BWB', 'BBL', 'Medlyn', 'BMF'],
      display_order: 10
    }
  ],
  groups: [
    subModel('Ball-woodrow-berry', 'BWB', 'bwb', 11),
    subModel('Ball-berry-leuning', 'BBL', 'bbl', 13),
    subModel('Medlyn Optimality', 'Medlyn', 'medlyn', 16),
    subModel('Buckley-mott-farquhar', 'BMF', 'bmf', 18)
  ]
}

// A Photosynthesis-shaped type whose group has NO selector — always shown.
const photosynthesis: MaterialTypeDef = {
  id: 4,
  materialtype: 'Photosynthesis',
  description: '',
  properties: [float('stomatal_sidedness', 6, 'Stomatal Sidedness')],
  groups: [
    {
      name: 'Farquhar model',
      selector_property: null,
      selector_value: null,
      display_order: 7,
      properties: [float('vcmax25', 7, 'V cmax25')]
    }
  ]
}

// The LIVE Photosynthesis shape: the Farquhar group hangs off a `submodel`
// selector, so the stored value is the code 'farquhar_model' and the group's name
// is the friendly text the popup has to show for it.
const photosynthesisWithSelector: MaterialTypeDef = {
  id: 4,
  materialtype: 'Photosynthesis',
  description: '',
  properties: [
    {
      property_type_id: 90,
      property: 'submodel',
      label: 'Photosynthesis Model',
      description: '',
      datatype: 'enum',
      min: null,
      max: null,
      enum_values: ['farquhar_model'],
      display_order: 5
    }
  ],
  groups: [
    {
      name: 'Farquhar model',
      selector_property: 'submodel',
      selector_value: 'farquhar_model',
      display_order: 7,
      properties: [float('vcmax25', 7, 'Vcmax_25')]
    }
  ]
}

// An enum that drives NO group — nothing to map its value through.
const plainEnumType: MaterialTypeDef = {
  id: 9,
  materialtype: 'Energy Balance',
  description: '',
  properties: [
    {
      property_type_id: 91,
      property: 'two_sided_heat_transfer',
      label: 'Heat Transfer Flag',
      description: '',
      datatype: 'enum',
      min: null,
      max: null,
      enum_values: ['one_sided', 'two_sided'],
      display_order: 1
    }
  ],
  groups: []
}

const groupNames = (member: Parameters<typeof buildMaterialSections>[0][number]): unknown[] =>
  buildMaterialSections([member], [stomatal, photosynthesis])[0].groups.map((g) => g.label)

describe('buildMaterialSections — conditional groups', () => {
  it('shows ONLY the sub-model the material actually selected', () => {
    expect(
      groupNames({
        materialTypeId: 6,
        properties: { stomatal_model: 'Medlyn', medlyn_gs0: 1, medlyn_g1: 1 }
      })
    ).toEqual(['General', 'Medlyn Optimality'])
  })

  it('follows the selector — BWB shows Ball-woodrow-berry and nothing else', () => {
    expect(
      groupNames({
        materialTypeId: 6,
        properties: { stomatal_model: 'BWB', bwb_gs0: 0.2, bwb_a1: 45 }
      })
    ).toEqual(['General', 'Ball-woodrow-berry'])
  })

  it('shows no sub-model at all when the selector is unset', () => {
    expect(groupNames({ materialTypeId: 6, properties: { gamma_co2: 500 } })).toEqual(['General'])
  })

  it('still shows a group that has no selector (Farquhar is unconditional)', () => {
    expect(groupNames({ materialTypeId: 4, properties: { vcmax25: 500 } })).toEqual([
      'General',
      'Farquhar model'
    ])
  })

  // The selector row itself. The popup reports what the material actually HOLDS,
  // so it shows the stored code — 'BMF' is the backend's name for that sub-model,
  // and the section heading beside it already spells out "Buckley-mott-farquhar".
  // An acronym has no underscores, so humanizing touches only its first letter
  // and it survives verbatim.
  it('shows the selector’s stored code, not the sub-model’s full name', () => {
    const [section] = buildMaterialSections(
      [{ materialTypeId: 6, properties: { stomatal_model: 'BMF', bmf_em: 10, bmf_i0: 10 } }],
      [stomatal, photosynthesis]
    )
    const general = section.groups.find((g) => g.label === 'General')
    expect(general?.rows.find((r) => r.property === 'stomatal_model')?.value).toBe('BMF')
  })

  // …but an UNDERSCORED code is not something to print raw, so it is humanized
  // the same way an unlabeled property name is.
  it('humanizes an underscored code (farquhar_model → Farquhar Model)', () => {
    const [section] = buildMaterialSections(
      [{ materialTypeId: 4, properties: { submodel: 'farquhar_model', vcmax25: 500 } }],
      [photosynthesisWithSelector]
    )
    const general = section.groups.find((g) => g.label === 'General')
    expect(general?.rows.find((r) => r.property === 'submodel')?.value).toBe('Farquhar Model')
  })

  // A plain enum — one with no group hanging off it — is not a selector, so its
  // stored value is shown exactly as the backend sent it.
  it('leaves a non-selector enum’s value alone', () => {
    const [section] = buildMaterialSections(
      [{ materialTypeId: 9, properties: { two_sided_heat_transfer: 'two_sided' } }],
      [plainEnumType]
    )
    expect(section.groups[0].rows[0].value).toBe('two_sided')
  })

  it('renders the selected sub-model’s values', () => {
    const [section] = buildMaterialSections(
      [{ materialTypeId: 6, properties: { stomatal_model: 'BWB', bwb_gs0: 0.2, bwb_a1: 45 } }],
      [stomatal, photosynthesis]
    )
    const bwb = section.groups.find((g) => g.label === 'Ball-woodrow-berry')
    expect(bwb?.rows.map((r) => [r.label, r.value])).toEqual([
      ['gs, o', '0.2'],
      ['a1', '45']
    ])
  })
})

// The live Visualiser type (id 7) — colour channels + opacity + texture_file, all
// top-level (so its fields fall under the "General" bucket).
const visualiser: MaterialTypeDef = {
  id: 7,
  materialtype: 'Visualiser',
  description: '',
  properties: [
    {
      property_type_id: 11,
      property: 'color_r',
      description: '',
      datatype: 'integer',
      min: 0,
      max: 255,
      display_order: 90
    },
    {
      property_type_id: 12,
      property: 'color_g',
      description: '',
      datatype: 'integer',
      min: 0,
      max: 255,
      display_order: 91
    },
    {
      property_type_id: 13,
      property: 'color_b',
      description: '',
      datatype: 'integer',
      min: 0,
      max: 255,
      display_order: 92
    },
    {
      property_type_id: 85,
      property: 'opacity',
      description: '',
      datatype: 'integer',
      min: 0,
      max: 100,
      display_order: 93
    },
    {
      property_type_id: 14,
      property: 'texture_file',
      description: '',
      datatype: 'file',
      min: null,
      max: null,
      display_order: 94
    }
  ],
  groups: []
}

const memberWith = (properties: PopupMaterialMember['properties']): PopupMaterialMember => ({
  materialTypeId: 7,
  materialTypeName: 'Visualiser',
  properties
})

describe('buildMaterialSections — Visualiser texture mode', () => {
  it('emits a single-column "Texture" section with the name + image when texture mode is on', () => {
    const sections = buildMaterialSections(
      [memberWith({ texture_toggle: true, texture_file: 'uploads/materials/7/dirt.jpg' })],
      [visualiser]
    )

    expect(sections).toHaveLength(1)
    const groups = sections[0].groups
    expect(groups).toHaveLength(1)
    const group = groups[0]
    // No caption: the two rows below name themselves, so the popup renders them
    // bare (an empty label is its signal to skip the heading).
    expect(group.label).toBe('')
    expect(group.singleColumn).toBe(true)

    // Name derived from the file path (basename → drop extension → title-case).
    const nameRow = group.rows.find((r) => r.property === 'texture_name')
    expect(nameRow?.value).toBe('dirt.jpg')

    // The image row carries the serve URL, not a text value.
    const imageRow = group.rows.find((r) => r.property === 'texture_file')
    expect(imageRow?.value).toBe('')
    expect(imageRow?.image).toEqual({
      src: textureServeUrl('uploads/materials/7/dirt.jpg'),
      alt: 'dirt.jpg'
    })
  })

  it('tolerates the string form of the toggle (Materials detail cache stores strings)', () => {
    const sections = buildMaterialSections(
      [memberWith({ texture_toggle: 'true', texture_file: 'grass_tile.png' })],
      [visualiser]
    )
    const group = sections[0].groups[0]
    expect(group.label).toBe('')
    expect(group.rows.find((r) => r.property === 'texture_name')?.value).toBe('grass_tile.png')
  })

  it('shows a — placeholder and no image when texture mode is on but no file is set', () => {
    const sections = buildMaterialSections([memberWith({ texture_toggle: true })], [visualiser])
    const group = sections[0].groups[0]
    expect(group.rows.find((r) => r.property === 'texture_name')?.value).toBe('—')
    expect(group.rows.find((r) => r.property === 'texture_file')?.image).toBeUndefined()
  })

  it('keeps the generic text rows (no image) when in colour mode', () => {
    const sections = buildMaterialSections(
      [memberWith({ texture_toggle: false, color_r: 128, color_g: 64, color_b: 32, opacity: 100 })],
      [visualiser]
    )
    const rows = sections[0].groups.flatMap((g) => g.rows)
    // Not the texture section, and nothing renders as an image. Keyed on the
    // group id, not the label — the texture section's label is '' now, which
    // every ungrouped bucket also carries.
    expect(sections[0].groups.some((g) => g.group === 'visualisation')).toBe(false)
    expect(rows.every((r) => r.image === undefined)).toBe(true)
    expect(rows.find((r) => r.property === 'color_r')?.value).toBe('128')
  })

  // The catalog ships no `label` for the colour channels, so the generic fallback
  // humanized them into "Color R" / "Color G" / "Color B" — while the editable
  // form's ColorPicker calls the same three fields "R", "G", "B". The popup exists
  // to mirror that form, so it now reads the same.
  it('labels the colour channels R / G / B, not the humanized "Color R"', () => {
    const sections = buildMaterialSections(
      [memberWith({ texture_toggle: false, color_r: 73, color_g: 8, color_b: 8, opacity: 100 })],
      [visualiser]
    )
    const rows = sections[0].groups.flatMap((g) => g.rows)
    const labelOf = (property: string): string | undefined =>
      rows.find((r) => r.property === property)?.label

    expect(labelOf('color_r')).toBe('R')
    expect(labelOf('color_g')).toBe('G')
    expect(labelOf('color_b')).toBe('B')
    // Opacity carries its unit. The popup renders a bare value, so "100" alone
    // named no unit — readable as fully opaque or fully transparent depending on
    // what you assumed. The editable ColorPicker prints a "%" inside the box; with
    // no box here, it goes in the label.
    expect(labelOf('opacity')).toBe('Opacity (%)')
  })

  // Colour mode was listing the mode machinery alongside the colour: a bare
  // "Texture Toggle: false" and a "Texture File" holding either nothing or a path
  // left over from an earlier texture save. Neither describes how the material
  // looks — the four colour rows do — so both are dropped. (Texture mode never
  // reached this branch; it renders its own Texture Name + Texture Image rows.)
  it('omits the texture toggle and texture file rows in colour mode', () => {
    const withToggle: MaterialTypeDef = {
      ...visualiser,
      properties: [
        ...visualiser.properties,
        {
          property_type_id: 15,
          property: 'texture_toggle',
          description: '',
          datatype: 'boolean',
          min: null,
          max: null,
          display_order: 89
        }
      ]
    }
    const sections = buildMaterialSections(
      [
        memberWith({
          texture_toggle: false,
          texture_file: 'uploads/materials/7/stale.png',
          color_r: 48,
          color_g: 22,
          color_b: 22,
          opacity: 100
        })
      ],
      [withToggle]
    )
    const properties = sections[0].groups.flatMap((g) => g.rows).map((r) => r.property)

    expect(properties).not.toContain('texture_toggle')
    expect(properties).not.toContain('texture_file')
    expect(properties).toEqual(['color_r', 'color_g', 'color_b', 'opacity'])
  })
})

// A Radiation-shaped type carrying the spectral data FILE property. The stored
// value is a path; the popup must show the file's name, exactly as the Materials
// editor does once it's uploaded.
const radiation: MaterialTypeDef = {
  id: 1,
  materialtype: 'Radiation',
  description: '',
  properties: [
    float('specular_scale', 6, 'Specular scale'),
    {
      property_type_id: 22,
      property: 'spectral_data',
      label: 'Spectral Data File',
      description: '',
      datatype: 'file',
      min: null,
      max: null,
      display_order: 8
    }
  ],
  groups: []
}

const spectralRow = (
  properties: PopupMaterialMember['properties']
): { value: string } | undefined =>
  buildMaterialSections([{ materialTypeId: 1, properties }], [radiation])[0]
    .groups.flatMap((g) => g.rows)
    .find((r) => r.property === 'spectral_data')

describe('buildMaterialSections — file properties', () => {
  it('shows the spectral file NAME, not the path it is stored at', () => {
    expect(spectralRow({ spectral_data: 'uploads/materials/8/leaf_optics.xml' })?.value).toBe(
      'leaf_optics.xml'
    )
  })

  it('handles a Windows path, which has no forward slash to split on', () => {
    expect(
      spectralRow({ spectral_data: 'C:\\Program Files\\Helios\\assets\\leaf.xml' })?.value
    ).toBe('leaf.xml')
  })

  it('decodes a percent-encoded name', () => {
    expect(spectralRow({ spectral_data: 'uploads/8/leaf%20optics.xml' })?.value).toBe(
      'leaf optics.xml'
    )
  })

  it('leaves a bare filename alone', () => {
    expect(spectralRow({ spectral_data: 'leaf.xml' })?.value).toBe('leaf.xml')
  })

  it('leaves an unset file blank rather than inventing a name', () => {
    expect(spectralRow({ spectral_data: '' })?.value).toBe('')
    expect(spectralRow({})?.value).toBe('')
  })

  it('does not touch non-file values that happen to contain a slash', () => {
    const rows = buildMaterialSections(
      [{ materialTypeId: 1, properties: { specular_scale: '1/2' } }],
      [radiation]
    )[0].groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.property === 'specular_scale')?.value).toBe('1/2')
  })
})
