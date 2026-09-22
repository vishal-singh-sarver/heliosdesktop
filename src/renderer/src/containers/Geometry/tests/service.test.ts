import { describe, expect, it } from 'vitest'
import {
  kindFromObjectType,
  mergeTree,
  wireObjectToMaterialGroups,
  wireObjectToNode
} from '../service'

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
      modelVisibility: { 1: true, 2: true },
      materialGroupIds: []
    })
  })

  it('seeds materialGroupIds from the object list material_groups', () => {
    const node = wireObjectToNode(
      wire(27, 'Ground.001', {
        material_groups: [
          { object_id: 27, group_id: 55, name: 'Concrete', sync: true, source: 'x', materials: [] },
          { object_id: 27, group_id: 12, name: 'Grass', sync: true, source: 'x', materials: [] }
        ]
      })
    )
    expect(node.materialGroupIds).toEqual(['55', '12'])
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

  // The kind is what picks the row's icon, so a create must land on the same one
  // the list merge would give the row after a refresh.
  it('reads the kind from object_type rather than assuming Ground', () => {
    expect(wireObjectToNode(wire(2, 'Crop.001', { object_type: 'Crop' })).kind).toBe('crop')
    expect(wireObjectToNode(wire(3, 'barn.obj', { object_type: 'Mesh' })).kind).toBe('imported')
  })
})

describe('kindFromObjectType', () => {
  it('maps the catalog types to their own kinds and everything else to imported', () => {
    expect(kindFromObjectType('Ground')).toBe('ground')
    expect(kindFromObjectType('Crop')).toBe('crop')
    expect(kindFromObjectType('Mesh')).toBe('imported')
    expect(kindFromObjectType(undefined)).toBe('imported')
  })
})

describe('wireObjectToMaterialGroups', () => {
  it('maps assigned material_groups (group_id → string, members carried through)', () => {
    const groups = wireObjectToMaterialGroups(
      wire(27, 'Ground.001', {
        material_groups: [
          {
            object_id: 27,
            group_id: 41,
            name: 'Grass',
            sync: true,
            source: 'library',
            materials: [
              {
                material_id: 3,
                material_type_id: 5,
                material_type: 'Radiation',
                properties: { reflectivity: 0.3 }
              }
            ]
          }
        ]
      })
    )
    expect(groups).toEqual([
      {
        groupId: '41',
        name: 'Grass',
        stale: false,
        drift: false,
        materials: [
          { materialTypeId: 5, materialTypeName: 'Radiation', properties: { reflectivity: 0.3 } }
        ]
      }
    ])
  })

  it('defaults absent material_groups to [], and derives stale/drift + empty properties', () => {
    expect(wireObjectToMaterialGroups(wire(1, 'g'))).toEqual([])
    const [g] = wireObjectToMaterialGroups(
      wire(2, 'g', {
        material_groups: [
          {
            object_id: 2,
            group_id: 7,
            name: 'Dirt',
            sync: false,
            source: 'frozen',
            stale: true,
            materials: [
              { material_id: 1, material_type_id: 5, material_type: 'Radiation', library_drift: true }
            ]
          }
        ]
      })
    )
    expect(g.stale).toBe(true)
    expect(g.drift).toBe(true) // any member library_drift → drift
    expect(g.materials?.[0]?.properties).toEqual({}) // absent properties → {}
  })
})

// The node list on a REFRESH comes from mergeTree (the objects+groups lists),
// NOT from wireObjectToNode — which only runs for a single-object create/get.
// mergeTree used to drop material_groups, so after a reload every node had no
// assignments. The 3D viewport's material-save listener skips objects that don't
// list the saved group, so it re-fetched nothing and the ground kept its old
// colour until a reload or a viewport toggle.
describe('mergeTree', () => {
  const apiObject = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    name: `Ground.00${id}`,
    object_type: 'Ground',
    group_id: null,
    visibility: { viewport: true, render: true, models: {} },
    created_at: `2026-01-0${id}T00:00:00Z`,
    ...overrides
  })

  it('seeds materialGroupIds from the objects list so a save can find the object', () => {
    const [node] = mergeTree([apiObject(1, { material_groups: [{ group_id: 55 }] })], [])
    expect(node.materialGroupIds).toEqual(['55'])
  })

  it('keeps every assigned group id, in order', () => {
    const [node] = mergeTree(
      [apiObject(1, { material_groups: [{ group_id: 55 }, { group_id: 12 }] })],
      []
    )
    expect(node.materialGroupIds).toEqual(['55', '12'])
  })

  it('falls back to [] when the backend omits material_groups', () => {
    const [node] = mergeTree([apiObject(1)], [])
    expect(node.materialGroupIds).toEqual([])
  })
})
