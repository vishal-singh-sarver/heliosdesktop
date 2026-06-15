import { deriveCounters, formatName, nextAvailableNumber, parseNameNumber } from '../naming'
import type { GeoNode } from '../types'

const node = (name: string, kind: GeoNode['kind'] = 'ground'): GeoNode => ({
  id: name,
  name,
  kind,
  parentId: null,
  childIds: [],
  expanded: false,
  visibleInViewport: true,
  modelVisibility: { mode: 'all' }
})

describe('naming', () => {
  it('formatName zero-pads to three digits', () => {
    expect(formatName('ground', 5)).toBe('Ground.005')
    expect(formatName('group', 1)).toBe('Group.001')
  })

  it('parseNameNumber recognises generated names only', () => {
    expect(parseNameNumber('Ground.005')).toEqual({ kind: 'ground', num: 5 })
    expect(parseNameNumber('Group.002')).toEqual({ kind: 'group', num: 2 })
    expect(parseNameNumber('My custom group')).toBeNull()
    expect(parseNameNumber('Ground.x')).toBeNull()
  })

  it('deriveCounters takes the max per kind, ignoring custom names', () => {
    expect(
      deriveCounters([
        node('Ground.001'),
        node('Ground.004'),
        node('Backyard', 'group'),
        node('Group.003', 'group')
      ])
    ).toEqual({ ground: 4, group: 3 })
  })

  describe('nextAvailableNumber', () => {
    it('returns 1 when no names of that kind exist', () => {
      expect(nextAvailableNumber([], 'ground')).toBe(1)
      expect(nextAvailableNumber([node('Group.001', 'group')], 'ground')).toBe(1)
    })

    it('fills the lowest gap rather than continuing past the max', () => {
      // {001, 002, 015} → 003
      expect(
        nextAvailableNumber(
          [node('Ground.001'), node('Ground.002'), node('Ground.015')],
          'ground'
        )
      ).toBe(3)
    })

    it('returns max+1 when the sequence is contiguous', () => {
      expect(nextAvailableNumber([node('Ground.001'), node('Ground.002')], 'ground')).toBe(3)
    })

    it('ignores custom names and counts only the requested kind', () => {
      expect(
        nextAvailableNumber(
          [node('Ground.002'), node('Backyard', 'group'), node('Group.001', 'group')],
          'ground'
        )
      ).toBe(1)
    })
  })
})
