import { describe, expect, it } from 'vitest'
import { wireObjectToNode } from '../service'

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
      renderEnabled: true,
      modelVisibility: { 1: true, 2: true }
    })
  })

  it('maps the viewport and render flags onto the node, models default to empty', () => {
    const node = wireObjectToNode(
      wire(5, 'Ground.002', { visibility: { viewport: false, render: false } })
    )
    expect(node.visibleInViewport).toBe(false)
    expect(node.renderEnabled).toBe(false)
    expect(node.modelVisibility).toEqual({})
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
