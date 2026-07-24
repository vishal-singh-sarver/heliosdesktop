import { describe, expect, it } from 'vitest'
import { textureServeUrl } from 'containers/Materials/service'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import { buildMaterialSections, type PopupMaterialMember } from '../ObjectPropertiesForm'

// The live Visualiser type (id 7) — colour channels + opacity + texture_file, no
// `group` tag (so its fields fall under the "General" bucket).
const visualiser: MaterialTypeDef = {
  id: 7,
  materialtype: 'Visualiser',
  description: '',
  properties: [
    { property_type_id: 11, property: 'color_r', description: '', datatype: 'integer', min: 0, max: 255, display_order: 90 },
    { property_type_id: 12, property: 'color_g', description: '', datatype: 'integer', min: 0, max: 255, display_order: 91 },
    { property_type_id: 13, property: 'color_b', description: '', datatype: 'integer', min: 0, max: 255, display_order: 92 },
    { property_type_id: 85, property: 'opacity', description: '', datatype: 'integer', min: 0, max: 100, display_order: 93 },
    { property_type_id: 14, property: 'texture_file', description: '', datatype: 'file', min: null, max: null, display_order: 94 }
  ]
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
    expect(group.label).toBe('Visualisation properties (Texture)')
    expect(group.singleColumn).toBe(true)

    // Name derived from the file path (basename → drop extension → title-case).
    const nameRow = group.rows.find((r) => r.property === 'texture_name')
    expect(nameRow?.value).toBe('Dirt')

    // The image row carries the serve URL, not a text value.
    const imageRow = group.rows.find((r) => r.property === 'texture_file')
    expect(imageRow?.value).toBe('')
    expect(imageRow?.image).toEqual({
      src: textureServeUrl('uploads/materials/7/dirt.jpg'),
      alt: 'Dirt'
    })
  })

  it('tolerates the string form of the toggle (Materials detail cache stores strings)', () => {
    const sections = buildMaterialSections(
      [memberWith({ texture_toggle: 'true', texture_file: 'grass_tile.png' })],
      [visualiser]
    )
    const group = sections[0].groups[0]
    expect(group.label).toBe('Visualisation properties (Texture)')
    expect(group.rows.find((r) => r.property === 'texture_name')?.value).toBe('Grass Tile')
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
    // Not the texture section, and nothing renders as an image.
    expect(sections[0].groups.some((g) => g.label === 'Visualisation properties (Texture)')).toBe(false)
    expect(rows.every((r) => r.image === undefined)).toBe(true)
    expect(rows.find((r) => r.property === 'color_r')?.value).toBe('128')
  })
})
