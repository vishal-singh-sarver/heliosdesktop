import { MAX_NAME_LENGTH, validateGroupName } from '../validation'

describe('validateGroupName', () => {
  const existing = new Set(['group.001', 'backyard'])

  it('rejects an empty / whitespace-only name', () => {
    expect(validateGroupName('', existing)).toBe('Name is required')
    expect(validateGroupName('   ', existing)).toBe('Name is required')
  })

  it('rejects names longer than the limit (internal spaces count)', () => {
    const tooLong = 'a'.repeat(MAX_NAME_LENGTH + 1)
    expect(validateGroupName(tooLong, existing)).toBe('Character limit exceeded')
    expect(validateGroupName('a'.repeat(MAX_NAME_LENGTH), existing)).toBeNull()
  })

  it('rejects a duplicate name case-insensitively', () => {
    expect(validateGroupName('Backyard', existing)).toBe('Geometry name already exists')
    expect(validateGroupName('BACKYARD', existing)).toBe('Geometry name already exists')
  })

  it('accepts a unique, valid name (trimming leading/trailing space)', () => {
    expect(validateGroupName('  North Field  ', existing)).toBeNull()
  })
})
