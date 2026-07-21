import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the HTTP seam so we can feed listMaterials arbitrary (including malformed)
// backend payloads without a network.
const get = vi.fn()
vi.mock('utils/api', () => ({ api: { get: (...a: unknown[]) => get(...a) } }))

import { listMaterials } from '../service'

beforeEach(() => get.mockReset())

describe('listMaterials — one malformed group must not blank the whole list', () => {
  // A well-formed group as the backend sends it (snake_case wire shape).
  const good = (id: number, name: string, created: string): unknown => ({
    id,
    name,
    material_type_ids: [1],
    material_types: ['Radiation'],
    preview: null,
    created_at: created
  })

  it('keeps the good rows when one group is missing its type array', async () => {
    // Glass is missing material_type_ids entirely — the field the mapping reads.
    const glass = {
      id: 2,
      name: 'Glass',
      material_types: [],
      preview: null,
      created_at: '2026-06-02'
    }
    get.mockResolvedValue({
      groups: [good(1, 'Concrete', '2026-06-01'), glass, good(3, 'Brick', '2026-06-03')]
    })

    const result = await listMaterials()

    // All three survive — Glass degrades to a blank type instead of throwing.
    expect(result.map((m) => m.name)).toEqual(['Concrete', 'Glass', 'Brick'])
    const glassRow = result.find((m) => m.name === 'Glass')!
    expect(glassRow.materialTypeId).toBe(0)
    expect(glassRow.materialType).toBe('')
  })

  it('does not throw when a group is missing its created_at timestamp', async () => {
    const noDate = {
      id: 5,
      name: 'Undated',
      material_type_ids: [1],
      material_types: ['Radiation'],
      preview: null
      // created_at omitted
    }
    get.mockResolvedValue({ groups: [good(1, 'Concrete', '2026-06-01'), noDate] })

    // The sort must not blow up on the missing timestamp.
    await expect(listMaterials()).resolves.toHaveLength(2)
  })

  it('tolerates an entirely absent groups array', async () => {
    get.mockResolvedValue({})
    await expect(listMaterials()).resolves.toEqual([])
  })
})
