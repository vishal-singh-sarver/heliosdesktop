import type { CatalogPropertyDef, ObjectTypeDef } from 'containers/ProjectScreen/types'
import { describe, expect, it } from 'vitest'
import {
  defaultValuesForObject,
  GROUND_FORM_BLUEPRINT,
  humanizeProperty,
  isObjectFormValid,
  resolveObjectForm,
  resolveObjectFormByType,
  validateFieldValue,
  type ObjectFormBlueprint,
  type ResolvedFormField
} from '../propertyBlueprint'

// Minimal catalog property factory — only the fields the resolver reads.
const prop = (
  property: string,
  display_order: number,
  overrides: Partial<CatalogPropertyDef> = {}
): CatalogPropertyDef => ({
  property_type_id: display_order,
  property,
  description: `${property} desc`,
  datatype: 'float',
  min: null,
  max: null,
  display_order,
  ...overrides
})

// A Ground object type mirroring the real /api/catalog/object-types payload.
const groundType: ObjectTypeDef = {
  id: 1,
  object: 'Ground',
  properties: [
    prop('length', 1, { min: 0, required: true }),
    prop('breadth', 2, { min: 0, required: true }),
    prop('resolution_x', 3, { datatype: 'integer', min: 1, max: 25000, required: true }),
    prop('resolution_y', 4, { datatype: 'integer', min: 1, max: 25000, required: true }),
    prop('position_x', 5, { required: false }),
    prop('position_y', 6, { required: false }),
    prop('position_z', 7, { required: false }),
    prop('rotation_z', 8, { min: 0, max: 360, required: false }),
    prop('texture_x', 9, { datatype: 'integer', min: 1, required: true }),
    prop('texture_y', 10, { datatype: 'integer', min: 1, required: true })
  ]
}

describe('humanizeProperty', () => {
  it('title-cases snake_case property names', () => {
    expect(humanizeProperty('resolution_x')).toBe('Resolution X')
    expect(humanizeProperty('length')).toBe('Length')
    expect(humanizeProperty('two_sided_heat_transfer')).toBe('Two Sided Heat Transfer')
  })
})

describe('resolveObjectForm (Ground)', () => {
  const resolved = resolveObjectFormByType(groundType)

  it('groups the catalog properties under the mockup headings with the right columns', () => {
    const layout = resolved.groups.map((g) => ({
      heading: g.heading,
      columns: g.columns,
      fields: g.fields.map((f) => `${f.property}:${f.label}`)
    }))
    expect(layout).toEqual([
      { heading: 'Ground Size', columns: 2, fields: ['length:Length', 'breadth:Breadth'] },
      {
        heading: 'Ground Resolution',
        columns: 2,
        fields: ['resolution_x:Width', 'resolution_y:Height']
      },
      {
        heading: 'Position',
        columns: 3,
        fields: ['position_x:X', 'position_y:Y', 'position_z:Z']
      },
      { heading: 'Rotation', columns: 1, fields: ['rotation_z:degree'] },
      { heading: 'Texture Repeat (X x Y)', columns: 2, fields: ['texture_x:R', 'texture_y:C'] }
    ])
  })

  it('carries each property’s catalog validation metadata onto the field', () => {
    const length = resolved.groups[0].fields[0]
    expect(length).toMatchObject({
      property: 'length',
      label: 'Length',
      datatype: 'float',
      min: 0,
      max: null,
      required: true
    })
    const resX = resolved.groups[1].fields[0]
    expect(resX).toMatchObject({ datatype: 'integer', min: 1, max: 25000, required: true })
  })

  it('maps every Ground property exactly once (no leftovers)', () => {
    expect(resolved.unmappedProperties).toEqual([])
  })
})

describe('resolveObjectForm (forward-compat)', () => {
  it('appends unmapped catalog properties into a trailing group by default', () => {
    const withExtra: ObjectTypeDef = {
      ...groundType,
      properties: [...groundType.properties, prop('new_backend_prop', 11)]
    }
    const resolved = resolveObjectForm(withExtra, GROUND_FORM_BLUEPRINT)
    expect(resolved.unmappedProperties).toEqual(['new_backend_prop'])
    const trailing = resolved.groups[resolved.groups.length - 1]
    expect(trailing.heading).toBeUndefined()
    expect(trailing.fields.map((f) => f.property)).toEqual(['new_backend_prop'])
    expect(trailing.fields[0].label).toBe('New Backend Prop')
  })

  it('omits unmapped properties when appendUnmapped is false', () => {
    const withExtra: ObjectTypeDef = {
      ...groundType,
      properties: [...groundType.properties, prop('new_backend_prop', 11)]
    }
    const resolved = resolveObjectForm(withExtra, GROUND_FORM_BLUEPRINT, { appendUnmapped: false })
    expect(resolved.unmappedProperties).toEqual(['new_backend_prop'])
    expect(resolved.groups).toHaveLength(GROUND_FORM_BLUEPRINT.length)
  })

  it('skips blueprint fields the catalog does not define', () => {
    const blueprint: ObjectFormBlueprint = [
      { heading: 'Size', columns: 2, fields: [{ property: 'length' }, { property: 'ghost' }] }
    ]
    const resolved = resolveObjectForm(groundType, blueprint, { appendUnmapped: false })
    expect(resolved.groups[0].fields.map((f) => f.property)).toEqual(['length'])
  })

  it('returns an empty form for an object type with no blueprint (e.g. Crop)', () => {
    const crop: ObjectTypeDef = { id: 2, object: 'Crop', properties: [] }
    expect(resolveObjectFormByType(crop)).toEqual({ groups: [], unmappedProperties: [] })
  })
})

describe('validateFieldValue', () => {
  const field = (overrides: Partial<ResolvedFormField> = {}): ResolvedFormField => ({
    property: 'p',
    label: 'P',
    propertyTypeId: 1,
    datatype: 'float',
    description: '',
    min: null,
    max: null,
    required: true,
    ...overrides
  })

  it('flags empty required fields, allows empty optional ones', () => {
    expect(validateFieldValue(field({ required: true }), '  ')).toBe('Required Field')
    expect(validateFieldValue(field({ required: false }), '')).toBeNull()
  })

  it('rejects non-numeric input with the generic "Invalid Input" copy', () => {
    expect(validateFieldValue(field(), 'abc')).toBe('Invalid Input')
  })

  it('shows the catalog range message for out-of-range values', () => {
    // One-sided bounds get the matching variant…
    expect(validateFieldValue(field({ min: 0 }), '-1')).toBe(
      'Values should be greater than or equal to 0'
    )
    expect(validateFieldValue(field({ max: 360 }), '400')).toBe(
      'Values should be less than or equal to 360'
    )
    // …and a two-sided range gets the "between" copy (negatives read cleanly).
    expect(validateFieldValue(field({ min: -1000000, max: 1000000 }), '2000000')).toBe(
      'Values should be between (-1000000 - 1000000)'
    )
  })

  it('enforces integer datatype with the standard Invalid Input copy', () => {
    expect(validateFieldValue(field({ datatype: 'integer' }), '1.5')).toBe('Invalid Input')
    expect(validateFieldValue(field({ datatype: 'integer', min: 1 }), '100')).toBeNull()
  })

  it('uses range copy for out-of-range, generic copy for non-numeric, required copy for empty', () => {
    const positive = field({ min: 0 })
    expect(validateFieldValue(positive, 'abc')).toBe('Invalid Input')
    expect(validateFieldValue(positive, '-5')).toBe('Values should be greater than or equal to 0')
    // Empty still uses the uniform required copy.
    expect(validateFieldValue(positive, '')).toBe('Required Field')
    // Valid value passes.
    expect(validateFieldValue(positive, '3')).toBeNull()
  })

  it('shows "Invalid Input" (not the range copy) for an in-range decimal in an integer field', () => {
    // resolution_x: integer, 1–25000.
    const resolution = field({ datatype: 'integer', min: 1, max: 25000 })
    // 5.5 IS within 1–25000, so the range copy would be misleading; a decimal in
    // an integer field is an invalid input, not an out-of-range value.
    expect(validateFieldValue(resolution, '5.5')).toBe('Invalid Input')
    // Genuinely out-of-range values (whole or not) still get the range copy.
    expect(validateFieldValue(resolution, '30000')).toBe('Values should be between (1 - 25000)')
    expect(validateFieldValue(resolution, '0.5')).toBe('Values should be between (1 - 25000)')
    // A valid whole number passes.
    expect(validateFieldValue(resolution, '100')).toBeNull()
  })
})

describe('defaultValuesForObject (Ground)', () => {
  it('seeds the spec defaults (Ground Size 10×10, Resolution 1×1, Position 0,0,0, Rotation 0, Tiles 1×1)', () => {
    expect(defaultValuesForObject(groundType)).toEqual({
      length: '10',
      breadth: '10',
      resolution_x: '1',
      resolution_y: '1',
      position_x: '0',
      position_y: '0',
      position_z: '0',
      rotation_z: '0',
      texture_x: '1',
      texture_y: '1'
    })
  })

  it('seeds Ground Size length/breadth to 10', () => {
    const values = defaultValuesForObject(groundType)
    expect(values.length).toBe('10')
    expect(values.breadth).toBe('10')
  })

  it('returns an empty object for an unknown object type', () => {
    expect(defaultValuesForObject(undefined)).toEqual({})
  })
})

describe('validateFieldValue against the real Ground catalog', () => {
  const groups = resolveObjectFormByType(groundType).groups
  const fieldByProperty = (property: string): ResolvedFormField => {
    for (const group of groups) {
      const found = group.fields.find((f) => f.property === property)
      if (found) return found
    }
    throw new Error(`field ${property} not resolved`)
  }

  it('shows the two-sided range for Ground Resolution (1–25000)', () => {
    expect(validateFieldValue(fieldByProperty('resolution_x'), '30000')).toBe(
      'Values should be between (1 - 25000)'
    )
  })

  it('shows the one-sided minimum for Ground Size length (min 0, no max)', () => {
    expect(validateFieldValue(fieldByProperty('length'), '-1')).toBe(
      'Values should be greater than or equal to 0'
    )
  })

  it('shows the one-sided minimum for a Texture field (min 1, no max)', () => {
    expect(validateFieldValue(fieldByProperty('texture_x'), '0')).toBe(
      'Values should be greater than or equal to 1'
    )
  })
})

describe('isObjectFormValid', () => {
  const groups = resolveObjectFormByType(groundType).groups
  // Every required Ground field filled with an in-range value.
  const validValues: Record<string, string> = {
    length: '10',
    breadth: '10',
    resolution_x: '100',
    resolution_y: '100',
    texture_x: '1',
    texture_y: '1'
  }

  it('is true when all required fields pass (optional ones may be blank)', () => {
    expect(isObjectFormValid(groups, validValues)).toBe(true)
  })

  it('is false when a required field is missing or out of range', () => {
    expect(isObjectFormValid(groups, { ...validValues, length: '' })).toBe(false)
    expect(isObjectFormValid(groups, { ...validValues, resolution_x: '99999' })).toBe(false)
  })
})
