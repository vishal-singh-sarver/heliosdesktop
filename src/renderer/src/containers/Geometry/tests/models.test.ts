import { isModelOn } from '../models'

describe('model visibility helpers', () => {
  it('isModelOn defaults absent ids to on, and reflects explicit flags', () => {
    expect(isModelOn({}, 1)).toBe(true) // absent → visible
    expect(isModelOn({ 1: false }, 1)).toBe(false)
    expect(isModelOn({ 1: false, 2: true }, 2)).toBe(true)
  })
})
