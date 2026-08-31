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

  // Groups and leaf geometries are separate namespaces, so the clash has to name
  // the kind that actually clashed — a group hitting another group's name is not
  // a geometry conflict, and saying so sends the user looking for a geometry that
  // need not exist.
  it('names the GROUP namespace when a group is the one being renamed', () => {
    expect(validateGroupName('Backyard', existing, true)).toBe('Group name already exists')
    // The other two rules are kind-agnostic and read the same either way.
    expect(validateGroupName('', existing, true)).toBe('Name is required')
    expect(validateGroupName('a'.repeat(MAX_NAME_LENGTH + 1), existing, true)).toBe(
      'Character limit exceeded'
    )
  })

  it('accepts a unique, valid name (trimming leading/trailing space)', () => {
    expect(validateGroupName('  North Field  ', existing)).toBeNull()
  })
})
