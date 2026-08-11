import { describe, expect, it } from 'vitest'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import {
  isMaterialFormValid,
  isRadiationFieldSet,
  isVisualisationComplete,
  isVisualisationFieldSet,
  radiationBandSumViolations,
  radiationHeaderFields,
  readApplySpectral,
  resolveParameterGroups,
  spectralSetupIncomplete,
  spectrumGroup,
  toNativeProperties,
  toRadiationProperties,
  toVisualisationProperties,
  validateMaterialFieldValue,
  visibleParameterGroups
} from '../materialBlueprint'
import type { ResolvedMaterialField } from '../materialBlueprint'

// The live Visualiser type (id 7) — colour channels + opacity + texture_file, all
// top-level (no groups).
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

// A Photosynthesis-shaped type: two top-level fields + one always-shown group
// (selector null), with API-supplied labels.
const photosynthesis: MaterialTypeDef = {
  id: 4,
  materialtype: 'Photosynthesis',
  description: '',
  properties: [
    {
      property_type_id: 21,
      property: 'two_sided_heat_transfer',
      label: 'Heat Transfer Flag',
      description: '',
      datatype: 'enum',
      min: null,
      max: null,
      enum_values: ['One Sided', 'Two Sided'],
      display_order: 5
    },
    {
      property_type_id: 26,
      property: 'stomatal_sidedness',
      label: 'Stomatal Sidedness',
      description: '',
      datatype: 'float',
      min: 0,
      max: 1,
      display_order: 6
    }
  ],
  groups: [
    {
      name: 'Farquhar model',
      selector_property: null,
      selector_value: null,
      display_order: 7,
      properties: [
        {
          property_type_id: 44,
          property: 'vcmax25',
          label: 'V cmax25',
          description: '',
          datatype: 'float',
          min: 0,
          max: 1000,
          display_order: 7
        },
        {
          property_type_id: 45,
          property: 'jmax25',
          label: 'J max25',
          description: '',
          datatype: 'float',
          min: 0,
          max: 1000,
          display_order: 8
        }
      ]
    }
  ]
}

// A Stomatal-Conductance-shaped type: a top-level selector enum + two conditional
// groups keyed off it.
const stomatal: MaterialTypeDef = {
  id: 6,
  materialtype: 'Stomatal Conductance',
  description: '',
  properties: [
    {
      property_type_id: 74,
      property: 'stomatal_model',
      label: 'Stomatal Conductance',
      description: '',
      datatype: 'enum',
      min: null,
      max: null,
      enum_values: ['BWB', 'BBL'],
      display_order: 10
    }
  ],
  groups: [
    {
      name: 'Ball-woodrow-berry',
      selector_property: 'stomatal_model',
      selector_value: 'BWB',
      display_order: 11,
      properties: [
        {
          property_type_id: 62,
          property: 'bwb_gs0',
          label: 'gs, o',
          description: '',
          datatype: 'float',
          min: 0,
          max: 1,
          display_order: 11
        }
      ]
    },
    {
      name: 'Ball-berry-leuning',
      selector_property: 'stomatal_model',
      selector_value: 'BBL',
      display_order: 13,
      properties: [
        {
          property_type_id: 64,
          property: 'bbl_gs0',
          label: 'gs, o',
          description: '',
          datatype: 'float',
          min: 0,
          max: 1,
          display_order: 13
        }
      ]
    }
  ]
}

// A Radiation-shaped type: curated header fields + hidden props + the 9 band props.
const numeric = (property: string, display_order: number, label?: string) => ({
  property_type_id: display_order,
  property,
  label,
  description: '',
  datatype: 'float' as const,
  min: 0,
  max: 1,
  display_order
})
const radiation: MaterialTypeDef = {
  id: 1,
  materialtype: 'Radiation',
  description: '',
  // surface_temperature and the broadband trio are deliberately absent: the
  // catalog stops returning them (migration 031 tags them 'computed' /
  // 'superseded'), so a fixture carrying them tests a response the backend can
  // no longer produce.
  properties: [
    {
      property_type_id: 19,
      property: 'specular_exponent',
      label: 'Specular exponent',
      description: '',
      datatype: 'float',
      min: 1,
      max: 1000,
      display_order: 5
    },
    {
      property_type_id: 20,
      property: 'specular_scale',
      label: 'Specular scale',
      description: '',
      datatype: 'float',
      min: 0,
      max: 100,
      display_order: 6
    },
    {
      property_type_id: 21,
      property: 'two_sided_heat_transfer',
      label: 'Heat Transfer Flag',
      description: '',
      datatype: 'enum',
      min: null,
      max: null,
      enum_values: ['One Sided', 'Two Sided'],
      display_order: 7
    },
    {
      property_type_id: 22,
      property: 'spectral_data',
      description: '',
      datatype: 'file',
      min: null,
      max: null,
      display_order: 8
    },
    {
      property_type_id: 84,
      property: 'use_radiation_bands',
      description: '',
      datatype: 'boolean',
      min: null,
      max: null,
      display_order: 9
    },
    numeric('reflectivity_PAR', 10),
    numeric('transmissivity_PAR', 11),
    numeric('emissivity_PAR', 12),
    numeric('reflectivity_NIR', 13),
    numeric('transmissivity_NIR', 14),
    numeric('emissivity_NIR', 15),
    numeric('reflectivity_LW', 16),
    numeric('transmissivity_LW', 17),
    numeric('emissivity_LW', 18)
  ],
  // The spectrum choices arrive as a SELECTOR-GATED group (migration 031), not as
  // top-level properties: use_radiation_bands === 'false' is spectral mode, so
  // the group is live only then. That gating is what keeps them out of the
  // header grid and out of the manual-mode payload without any rule here.
  groups: [
    {
      name: 'Spectrum',
      selector_property: 'use_radiation_bands',
      selector_value: 'false',
      display_order: 19,
      properties: [
        {
          property_type_id: 40,
          property: 'reflectivity_spectrum',
          description: '',
          datatype: 'string',
          min: null,
          max: null,
          display_order: 19
        },
        {
          property_type_id: 41,
          property: 'transmissivity_spectrum',
          description: '',
          datatype: 'string',
          min: null,
          max: null,
          display_order: 20
        }
      ]
    }
  ]
}

describe('Radiation editor helpers', () => {
  const fields = resolveParameterGroups([radiation])[0].fields

  it('recognises the Radiation field set by its band signature', () => {
    expect(isRadiationFieldSet(fields)).toBe(true)
    expect(isRadiationFieldSet(resolveParameterGroups([photosynthesis])[0].fields)).toBe(false)
  })

  it('header fields are only specular + heat transfer (bands + controls excluded)', () => {
    expect(radiationHeaderFields(fields).map((f) => f.property)).toEqual([
      'specular_exponent',
      'specular_scale',
      'two_sided_heat_transfer'
    ])
  })

  it('keeps the spectrum choices out of the header — they are a gated group', () => {
    // Not filtered by name: they are simply not top-level, because the backend
    // put them in a group. Nothing in the frontend mentions them.
    const header = radiationHeaderFields(fields).map((f) => f.property)
    expect(header).not.toContain('reflectivity_spectrum')
    expect(header).not.toContain('transmissivity_spectrum')
  })

  it('finds the spectrum group by its selector, not by property name', () => {
    const groups = resolveParameterGroups([radiation])
    const group = spectrumGroup(groups)
    expect(group?.name).toBe('Spectrum')
    expect(group?.fields.map((f) => f.property)).toEqual([
      'reflectivity_spectrum',
      'transmissivity_spectrum'
    ])
    // A type with no such group — nothing to find, and no crash.
    expect(spectrumGroup(resolveParameterGroups([photosynthesis]))).toBeUndefined()
  })
})

// Spectral mode with a file uploaded requires BOTH spectrum choices before Save.
// A label the engine can't resolve doesn't error — RadiationModel falls back to a
// reflectivity of 0 and blackens the surface for the whole run — so an unmade
// choice is caught here instead.
describe('spectralSetupIncomplete', () => {
  const groups = resolveParameterGroups([radiation])
  const spectral = {
    use_radiation_bands: 'false',
    spectral_data: 'uploads/leaf.xml',
    reflectivity_spectrum: 'leaf_r',
    transmissivity_spectrum: 'leaf_t'
  }

  it('passes once both choices are made', () => {
    expect(spectralSetupIncomplete(groups, spectral)).toBe(false)
  })

  it('blocks while either choice is missing', () => {
    expect(spectralSetupIncomplete(groups, { ...spectral, reflectivity_spectrum: '' })).toBe(true)
    expect(spectralSetupIncomplete(groups, { ...spectral, transmissivity_spectrum: '' })).toBe(
      true
    )
    // Whitespace is not a choice.
    expect(spectralSetupIncomplete(groups, { ...spectral, reflectivity_spectrum: '  ' })).toBe(
      true
    )
  })

  it('does not block in manual mode — the choices are not sent at all there', () => {
    expect(
      spectralSetupIncomplete(groups, {
        ...spectral,
        use_radiation_bands: 'true',
        reflectivity_spectrum: '',
        transmissivity_spectrum: ''
      })
    ).toBe(false)
  })

  it('blocks spectral mode with NO file — the material would carry no optics', () => {
    // Spectral mode drops the per-band values on save, on the understanding that
    // a file replaces them. With no file the material ships with no reflectivity
    // or transmissivity at all. Safe to block: the upload needs only the material
    // group, so uploading one is always available as the way out.
    expect(
      spectralSetupIncomplete(groups, {
        use_radiation_bands: 'false',
        spectral_data: '',
        reflectivity_spectrum: '',
        transmissivity_spectrum: ''
      })
    ).toBe(true)
  })

  it('blocks names left over from a file that was deleted', () => {
    // Toggle off, save (which deletes the file), toggle back on: the names are
    // deliberately kept across the toggle, so they can outlive their file. The
    // engine resolves a name it cannot find to a reflectivity of 0 — a black
    // surface, with no error anywhere.
    expect(
      spectralSetupIncomplete(groups, {
        use_radiation_bands: 'false',
        spectral_data: '',
        reflectivity_spectrum: 'leaf_r',
        transmissivity_spectrum: 'leaf_t'
      })
    ).toBe(true)
  })

  it('does not block a type that has no spectrum group', () => {
    expect(spectralSetupIncomplete(resolveParameterGroups([photosynthesis]), spectral)).toBe(
      false
    )
  })

  it('reads "apply spectral data" as use_radiation_bands === false', () => {
    expect(readApplySpectral({})).toBe(false)
    expect(readApplySpectral({ use_radiation_bands: 'true' })).toBe(false)
    expect(readApplySpectral({ use_radiation_bands: 'false' })).toBe(true)
  })

  it('manual payload sends the bands with use_radiation_bands true, no spectral file', () => {
    const payload = toRadiationProperties(
      radiation,
      {
        specular_exponent: '999',
        reflectivity_PAR: '0.7',
        emissivity_PAR: '0.5',
        spectral_data: 'uploads/materials/1/leaf.xml'
      },
      false
    )
    expect(payload).toEqual({
      specular_exponent: 999,
      reflectivity_PAR: 0.7,
      emissivity_PAR: 0.5,
      use_radiation_bands: true
    })
    expect(payload).not.toHaveProperty('spectral_data')
  })

  it('spectral payload sends the file with use_radiation_bands false, no bands', () => {
    const payload = toRadiationProperties(
      radiation,
      {
        specular_exponent: '999',
        reflectivity_PAR: '0.7',
        emissivity_PAR: '0.5',
        spectral_data: 'uploads/materials/1/leaf.xml'
      },
      true
    )
    expect(payload).toEqual({
      specular_exponent: 999,
      use_radiation_bands: false,
      spectral_data: 'uploads/materials/1/leaf.xml'
    })
    expect(payload).not.toHaveProperty('reflectivity_PAR')
  })
})

describe('resolveParameterGroups', () => {
  it('puts top-level fields in a leading nameless group, then each catalog group', () => {
    const groups = resolveParameterGroups([photosynthesis])
    expect(groups.map((g) => g.name)).toEqual([null, 'Farquhar model'])
    expect(groups[0].fields.map((f) => f.property)).toEqual([
      'two_sided_heat_transfer',
      'stomatal_sidedness'
    ])
    expect(groups[1].fields.map((f) => f.property)).toEqual(['vcmax25', 'jmax25'])
  })

  it('prefers the API label, falling back to a humanized property name', () => {
    const [, farquhar] = resolveParameterGroups([photosynthesis])
    expect(farquhar.fields[0].label).toBe('V cmax25')
    // A type with an unlabeled property humanizes it instead.
    const unlabeled: MaterialTypeDef = {
      id: 99,
      materialtype: 'X',
      description: '',
      properties: [
        {
          property_type_id: 1,
          property: 'surface_temperature',
          description: '',
          datatype: 'float',
          min: 0,
          max: 1,
          display_order: 1
        }
      ],
      groups: []
    }
    expect(resolveParameterGroups([unlabeled])[0].fields[0].label).toBe('Surface Temperature')
  })

  it('carries the catalog required flag through, defaulting to optional', () => {
    // The material-type payload carries no `required` today (the API sends it on
    // object types only), so a field resolves as optional and its label shows no
    // star — but a marked property drives one without further wiring.
    const mixed: MaterialTypeDef = {
      id: 98,
      materialtype: 'X',
      description: '',
      properties: [
        {
          property_type_id: 1,
          property: 'density',
          description: '',
          datatype: 'float',
          min: 0,
          max: 1,
          display_order: 1,
          required: true
        },
        {
          property_type_id: 2,
          property: 'emissivity',
          description: '',
          datatype: 'float',
          min: 0,
          max: 1,
          display_order: 2
        }
      ],
      groups: []
    }
    const [top] = resolveParameterGroups([mixed])
    expect(top.fields.map((f) => f.required)).toEqual([true, false])
  })

  it('carries each group selector through', () => {
    const groups = resolveParameterGroups([stomatal])
    const bwb = groups.find((g) => g.name === 'Ball-woodrow-berry')
    expect(bwb?.selectorProperty).toBe('stomatal_model')
    expect(bwb?.selectorValue).toBe('BWB')
  })

  it('gives the selector enum friendly labels drawn from the group names', () => {
    const [top] = resolveParameterGroups([stomatal])
    const selector = top.fields.find((f) => f.property === 'stomatal_model')
    // Values stay the raw codes; labels are the human-readable model names.
    expect(selector?.enumValues).toEqual(['BWB', 'BBL'])
    expect(selector?.enumLabels).toEqual({
      BWB: 'Ball-woodrow-berry',
      BBL: 'Ball-berry-leuning'
    })
  })
})

describe('visibleParameterGroups', () => {
  const groups = resolveParameterGroups([stomatal])

  it('shows only the selector group matching the current value', () => {
    const bwb = visibleParameterGroups(groups, { stomatal_model: 'BWB' })
    expect(bwb.map((g) => g.name)).toEqual([null, 'Ball-woodrow-berry'])
    const bbl = visibleParameterGroups(groups, { stomatal_model: 'BBL' })
    expect(bbl.map((g) => g.name)).toEqual([null, 'Ball-berry-leuning'])
  })

  it('hides every conditional group when the selector is unset', () => {
    expect(visibleParameterGroups(groups, {}).map((g) => g.name)).toEqual([null])
  })
})

describe('validateMaterialFieldValue', () => {
  const field = (overrides: Partial<ResolvedMaterialField> = {}): ResolvedMaterialField => ({
    property: 'reflectivity',
    label: 'Reflectivity',
    datatype: 'float',
    description: '',
    min: 0,
    max: 1,
    required: false,
    ...overrides
  })

  it('flags an empty REQUIRED field, and only a required one', () => {
    // Same copy and same rule as the Geometry form's validateFieldValue.
    expect(validateMaterialFieldValue(field({ required: true }), '')).toBe('Required Field')
    expect(validateMaterialFieldValue(field({ required: true }), '   ')).toBe('Required Field')
    expect(validateMaterialFieldValue(field({ required: false }), '')).toBeNull()
  })

  it('flags an empty required field of ANY datatype, not just numbers', () => {
    // The datatype gate used to run first, so a required enum/file read as valid
    // when blank.
    expect(validateMaterialFieldValue(field({ datatype: 'enum', required: true }), '')).toBe(
      'Required Field'
    )
    expect(validateMaterialFieldValue(field({ datatype: 'file', required: true }), '')).toBe(
      'Required Field'
    )
    // A filled non-numeric field still skips the numeric checks entirely.
    expect(validateMaterialFieldValue(field({ datatype: 'enum', required: true }), 'BWB')).toBeNull()
  })

  it('rejects a minus-signed zero on a range that starts at 0', () => {
    // Number("-0") is -0 and -0 < 0 is false, so these used to slip past the
    // range check and commit as negative-looking values on a 0–1 band optic.
    const band = field()
    expect(validateMaterialFieldValue(band, '-0')).toBe('Values should be between 0-1')
    expect(validateMaterialFieldValue(band, '-0.00')).toBe('Values should be between 0-1')
    // The unsigned zero is a legitimate value and still passes.
    expect(validateMaterialFieldValue(band, '0')).toBeNull()
    expect(validateMaterialFieldValue(band, '0.5')).toBeNull()
  })

  it('rejects a minus-signed zero in an integer channel too', () => {
    const channel = field({ property: 'color_r', datatype: 'integer', min: 0, max: 255 })
    expect(validateMaterialFieldValue(channel, '-0')).toBe('Values should be between 0-255')
    expect(validateMaterialFieldValue(channel, '0')).toBeNull()
  })

  it('leaves -0 alone on a range that genuinely admits negatives', () => {
    // There -0 is just zero, which is in range.
    expect(validateMaterialFieldValue(field({ min: -1, max: 1 }), '-0')).toBeNull()
    expect(validateMaterialFieldValue(field({ min: null, max: 1 }), '-0')).toBeNull()
  })
})

describe('isMaterialFormValid', () => {
  const groups = resolveParameterGroups([stomatal])

  it('ignores hidden groups — an out-of-range BBL field does not block BWB', () => {
    expect(isMaterialFormValid(groups, { stomatal_model: 'BWB', bbl_gs0: '999' })).toBe(true)
  })

  it('flags an out-of-range field in the ACTIVE group', () => {
    expect(isMaterialFormValid(groups, { stomatal_model: 'BWB', bwb_gs0: '999' })).toBe(false)
  })
})

describe('toNativeProperties', () => {
  const density: MaterialTypeDef = {
    id: 3,
    materialtype: 'Physical',
    description: '',
    properties: [
      {
        property_type_id: 30,
        property: 'density',
        description: '',
        datatype: 'float',
        min: 0.5,
        max: 100,
        display_order: 1
      }
    ],
    groups: []
  }

  it('sends a real numeric value', () => {
    expect(toNativeProperties(density, { density: '2.5' })).toEqual({ density: 2.5 })
  })

  it('omits a genuinely empty field', () => {
    expect(toNativeProperties(density, { density: '' })).toEqual({})
  })

  // The bug: a whitespace-only field is not === '' so it slipped past the blank
  // check, and Number(' ') is 0 — so it shipped a real 0 for a value the user left
  // unset, bypassing the min: 0.5 bound. Trimming first treats it as empty.
  it('omits a whitespace-only field instead of sending 0', () => {
    expect(toNativeProperties(density, { density: ' ' })).toEqual({})
    expect(toNativeProperties(density, { density: '   ' })).toEqual({})
  })

  it('still sends a real zero the user actually typed', () => {
    const flux: MaterialTypeDef = {
      id: 4,
      materialtype: 'Flux',
      description: '',
      properties: [
        {
          property_type_id: 40,
          property: 'radiation_flux',
          description: '',
          datatype: 'float',
          min: 0,
          max: 100,
          display_order: 1
        }
      ],
      groups: []
    }
    expect(toNativeProperties(flux, { radiation_flux: '0' })).toEqual({ radiation_flux: 0 })
  })

  it('includes the active group fields alongside the top-level ones', () => {
    expect(toNativeProperties(photosynthesis, { stomatal_sidedness: '0.7', vcmax25: '500' })).toEqual(
      { stomatal_sidedness: 0.7, vcmax25: 500 }
    )
  })

  it('excludes an inactive selector group and includes the active one', () => {
    // Medlyn-less fixture: BWB active. A stray BBL value must not be sent.
    const payload = toNativeProperties(stomatal, {
      stomatal_model: 'BWB',
      bwb_gs0: '0.2',
      bbl_gs0: '0.9'
    })
    expect(payload).toEqual({ stomatal_model: 'BWB', bwb_gs0: 0.2 })
  })
})

describe('isVisualisationFieldSet', () => {
  it('recognises the Visualiser by its colour channel', () => {
    expect(
      isVisualisationFieldSet(resolveParameterGroups([visualiser]).flatMap((g) => g.fields))
    ).toBe(true)
  })

  it('is false for a set without colour channels', () => {
    expect(
      isVisualisationFieldSet(resolveParameterGroups([photosynthesis]).flatMap((g) => g.fields))
    ).toBe(false)
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

describe('radiationBandSumViolations', () => {
  it('flags all three properties of a band whose R+T+E exceed 1', () => {
    expect(
      radiationBandSumViolations({ reflectivity_PAR: '0.6', transmissivity_PAR: '0.6' })
    ).toEqual(new Set(['reflectivity_PAR', 'transmissivity_PAR', 'emissivity_PAR']))
  })

  it('allows a band summing to exactly 1, even with floating-point drift', () => {
    // 0.1 + 0.2 + 0.7 lands at 1.0000000000000002 in IEEE-754 — the epsilon keeps
    // it valid.
    expect(
      radiationBandSumViolations({
        reflectivity_PAR: '0.1',
        transmissivity_PAR: '0.2',
        emissivity_PAR: '0.7'
      }).size
    ).toBe(0)
  })

  it('treats empty boxes as 0 and skips a band with a non-numeric value', () => {
    expect(radiationBandSumViolations({ reflectivity_PAR: '0.9' }).size).toBe(0)
    expect(
      radiationBandSumViolations({ reflectivity_PAR: 'x', transmissivity_PAR: '0.9' }).size
    ).toBe(0)
  })

  it('flags only the offending band, not the others', () => {
    const v = radiationBandSumViolations({ reflectivity_NIR: '0.7', transmissivity_NIR: '0.7' })
    expect(v.has('reflectivity_NIR')).toBe(true)
    expect(v.has('reflectivity_PAR')).toBe(false)
  })
})
