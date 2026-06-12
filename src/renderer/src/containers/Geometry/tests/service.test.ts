import { describe, expect, it } from 'vitest'
import { parseListResponse, wireObjectToNode } from '../service'

// A backend object mirroring POST/GET /objects (the shape verified on Swagger).
const wire = (id: number, name: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name,
  object_type_id: 1,
  object_type: 'Ground',
  group_id: null,
  visibility: { viewport: true, render: true, models: { '1': true, '2': true } },
  ...overrides
})

describe('wireObjectToNode', () => {
  it('maps the backend object to a GeoNode (numeric id → string, visibility → flags)', () => {
    expect(wireObjectToNode(wire(27, 'Ground.001'))).toEqual({
      id: '27',
      name: 'Ground.001',
      kind: 'ground',
      parentId: null,
      childIds: [],
      expanded: false,
      visibleInViewport: true,
      modelVisibility: { mode: 'all' }
    })
  })

  it('collapses render:false to model visibility "none" and keeps the viewport flag', () => {
    const node = wireObjectToNode(
      wire(5, 'Ground.002', { visibility: { viewport: false, render: false } })
    )
    expect(node.visibleInViewport).toBe(false)
    expect(node.modelVisibility).toEqual({ mode: 'none' })
  })

  it('maps a non-null group_id onto parentId (stringified)', () => {
    expect(wireObjectToNode(wire(9, 'Ground.003', { group_id: 4 })).parentId).toBe('4')
  })

  it('defaults visibleInViewport to true when visibility is absent', () => {
    expect(wireObjectToNode(wire(1, 'Ground.004', { visibility: undefined })).visibleInViewport).toBe(
      true
    )
  })
})

describe('parseListResponse', () => {
  it('extracts the array from { objects: [...] } and maps each item', () => {
    const nodes = parseListResponse({ objects: [wire(1, 'Ground.001'), wire(2, 'Ground.002')] })
    expect(nodes.map((n) => n.id)).toEqual(['1', '2'])
    expect(nodes.map((n) => n.name)).toEqual(['Ground.001', 'Ground.002'])
  })

  it('also accepts { nodes }, { data }, and a bare array', () => {
    expect(parseListResponse({ nodes: [wire(1, 'A')] }).map((n) => n.id)).toEqual(['1'])
    expect(parseListResponse({ data: [wire(2, 'B')] }).map((n) => n.id)).toEqual(['2'])
    expect(parseListResponse([wire(3, 'C')]).map((n) => n.id)).toEqual(['3'])
  })

  it('returns an empty list for an unrecognized / empty shape', () => {
    expect(parseListResponse({})).toEqual([])
    expect(parseListResponse('string')).toEqual([])
    expect(parseListResponse(null)).toEqual([])
  })
})
