import { describe, expect, it } from 'vitest'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import {
  isVisualisationComplete,
  isVisualisationFieldSet,
  resolveParameterGroups,
  toVisualisationProperties
} from '../materialBlueprint'

// The live Visualiser type (id 7) — colour channels + opacity + texture_file, no
// `group` tag.
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
  ]
}

describe('isVisualisationFieldSet', () => {
  it('recognises the Visualiser by its colour channel', () => {
    expect(
      isVisualisationFieldSet(resolveParameterGroups([visualiser]).flatMap((g) => g.fields))
    ).toBe(true)
  })

  it('is false for a set without colour channels', () => {
    const model: MaterialTypeDef = {
      id: 1,
      materialtype: 'Radiation',
      description: '',
      properties: [
        {
          property_type_id: 1,
          property: 'emissivity',
          description: '',
          datatype: 'float',
          min: 0,
          max: 1,
          display_order: 1
        }
      ]
    }
    expect(isVisualisationFieldSet(resolveParameterGroups([model]).flatMap((g) => g.fields))).toBe(
      false
    )
  })
})

describe('toVisualisationProperties', () => {
  it('builds the colour payload with texture_toggle:false and omits texture_file', () => {
    const values = { color_r: '200', color_g: '100', color_b: '50', opacity: '90' }
    expect(toVisualisationProperties(visualiser, values, 'custom')).toEqual({
      texture_toggle: false,
      color_r: 200,
      color_g: 100,
      color_b: 50,
      opacity: 90
    })
  })

  it('always carries texture_toggle even with no colour set', () => {
    // (The Save gate blocks this, but the builder must never drop the toggle.)
    expect(toVisualisationProperties(visualiser, {}, 'custom')).toEqual({ texture_toggle: false })
  })

  it('builds the texture payload with the stored path and no colour', () => {
    const values = { color_r: '200', texture_file: 'uploads/materials/8/grass.png' }
    expect(toVisualisationProperties(visualiser, values, 'texture')).toEqual({
      texture_toggle: true,
      texture_file: 'uploads/materials/8/grass.png'
    })
  })

  it('lets a freshly-picked library path override the stored one', () => {
    expect(toVisualisationProperties(visualiser, {}, 'texture', '/assets/dirt.jpg')).toEqual({
      texture_toggle: true,
      texture_file: '/assets/dirt.jpg'
    })
  })
})

describe('isVisualisationComplete (colour required)', () => {
  const groups = resolveParameterGroups([visualiser])

  it('is false until every colour channel + opacity is present and valid', () => {
    expect(isVisualisationComplete(groups, {})).toBe(false)
    expect(isVisualisationComplete(groups, { color_r: '10', color_g: '20', color_b: '30' })).toBe(
      false
    )
    expect(
      isVisualisationComplete(groups, {
        color_r: '10',
        color_g: '20',
        color_b: '30',
        opacity: '80'
      })
    ).toBe(true)
  })

  it('is false when a channel is out of range', () => {
    expect(
      isVisualisationComplete(groups, {
        color_r: '300',
        color_g: '20',
        color_b: '30',
        opacity: '80'
      })
    ).toBe(false)
  })
})
