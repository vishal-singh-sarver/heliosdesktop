import { describe, expect, it } from 'vitest'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import { buildMaterialSections } from '../ObjectPropertiesForm'

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
