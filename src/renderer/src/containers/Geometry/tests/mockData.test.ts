import {
  mockConfig,
  mockCreateGeometry,
  mockDeleteNode,
  mockListNodes,
  mockRenameGroup,
  __resetMockStore
} from '../mockData'

describe('mockData', () => {
  beforeEach(() => {
    __resetMockStore()
    mockConfig.latencyMs = 0
    mockConfig.forceListError = false
    mockConfig.forceCreateError = false
    mockConfig.forceRenameError = false
    mockConfig.forceDeleteError = false
  })

  it('seeds a tree for a fresh scope', async () => {
    const nodes = await mockListNodes('pX', 'sX')
    const names = nodes.map((n) => n.name)
    expect(names).toContain('Ground.001')
    expect(names).toContain('Group.001')
    // The group references its children by id.
    const grp = nodes.find((n) => n.kind === 'group')
    expect(grp?.childIds.length).toBeGreaterThan(0)
  })

  it('returns deep copies (callers cannot mutate the store)', async () => {
    const first = await mockListNodes('pX', 'sX')
    first[0].name = 'MUTATED'
    const second = await mockListNodes('pX', 'sX')
    expect(second[0].name).not.toBe('MUTATED')
  })

  it('throws when forceListError is set (exercises the error path)', async () => {
    mockConfig.forceListError = true
    await expect(mockListNodes('pE', 'sE')).rejects.toThrow('Unable to load Geometries')
  })

  it('mockCreateGeometry persists a new leaf visible on the next list', async () => {
    await mockCreateGeometry('pC', 'sC', { id: 'new-1', name: 'Ground.010', kind: 'ground' })
    const nodes = await mockListNodes('pC', 'sC')
    expect(nodes.find((n) => n.id === 'new-1')).toMatchObject({ name: 'Ground.010', kind: 'ground' })
  })

  it('throws when forceCreateError is set', async () => {
    mockConfig.forceCreateError = true
    await expect(
      mockCreateGeometry('pC', 'sC', { id: 'x', name: 'Ground.001', kind: 'ground' })
    ).rejects.toThrow('Unable to create geometry')
  })

  it('mockRenameGroup renames the node in the store', async () => {
    const before = await mockListNodes('pR', 'sR')
    const grp = before.find((n) => n.kind === 'group')!
    await mockRenameGroup('pR', 'sR', grp.id, 'Backyard')
    const after = await mockListNodes('pR', 'sR')
    expect(after.find((n) => n.id === grp.id)?.name).toBe('Backyard')
  })

  it('mockDeleteNode removes a group and its children', async () => {
    const before = await mockListNodes('pD', 'sD')
    const grp = before.find((n) => n.kind === 'group')!
    await mockDeleteNode('pD', 'sD', grp.id)
    const after = await mockListNodes('pD', 'sD')
    expect(after.find((n) => n.id === grp.id)).toBeUndefined()
    for (const childId of grp.childIds) {
      expect(after.find((n) => n.id === childId)).toBeUndefined()
    }
  })
})
