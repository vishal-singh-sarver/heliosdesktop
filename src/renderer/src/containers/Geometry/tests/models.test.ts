import { isAllHidden, isModelOn, toggleAllModels, toggleOneModel } from '../models'
import type { ModelVisibility } from '../types'

describe('model visibility helpers', () => {
  it('isModelOn reflects all / none / custom', () => {
    expect(isModelOn({ mode: 'all' }, 'radiation')).toBe(true)
    expect(isModelOn({ mode: 'none' }, 'radiation')).toBe(false)
    const custom: ModelVisibility = {
      mode: 'custom',
      perModel: {
        solar_position: true,
        radiation: false,
        energy_balance: true,
        photosynthesis: true,
        stomatal_conductance: true
      }
    }
    expect(isModelOn(custom, 'radiation')).toBe(false)
    expect(isModelOn(custom, 'solar_position')).toBe(true)
  })

  it('isAllHidden is true only for mode none', () => {
    expect(isAllHidden({ mode: 'none' })).toBe(true)
    expect(isAllHidden({ mode: 'all' })).toBe(false)
  })

  it('toggleAllModels flips none<->all (render-icon behaviour)', () => {
    expect(toggleAllModels({ mode: 'all' })).toEqual({ mode: 'none' })
    expect(toggleAllModels({ mode: 'none' })).toEqual({ mode: 'all' })
    // From custom, the render icon hides all.
    expect(
      toggleAllModels({
        mode: 'custom',
        perModel: {
          solar_position: true,
          radiation: false,
          energy_balance: true,
          photosynthesis: true,
          stomatal_conductance: true
        }
      })
    ).toEqual({ mode: 'none' })
  })

  it('toggleOneModel moves to custom and flips just that model', () => {
    const result = toggleOneModel({ mode: 'all' }, 'radiation')
    expect(result.mode).toBe('custom')
    if (result.mode === 'custom') {
      expect(result.perModel.radiation).toBe(false)
      expect(result.perModel.solar_position).toBe(true) // others stay on
    }
  })
})
