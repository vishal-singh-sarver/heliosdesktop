import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import type { Material, SaveMaterialInput } from './types'

// The single seam between the Materials sagas and the backend — sagas import
// only this module, never `api` directly.

// GET /api/materials/library/groups list-item shape. `preview` is the single
// colour swatch the backend derives from the group's precedence-winning member.
interface WirePreview {
  color_r: number
  color_g: number
  color_b: number
  texture_file: string | null
}
interface WireGroupListItem {
  id: number
  name: string
  material_type_ids: number[]
  material_types: string[]
  preview: WirePreview | null
  created_at: string
}
interface ListGroupsResponse {
  groups: WireGroupListItem[]
}

// A group renders as one Saved Materials row. The list keeps the app's existing
// single-type Material shape by taking the group's first member for the
// (currently unused) type fields; the array of types lives on the wire only.
function groupToMaterial(g: WireGroupListItem): Material {
  return {
    id: String(g.id),
    name: g.name,
    materialTypeId: g.material_type_ids[0] ?? 0,
    materialType: g.material_types[0] ?? '',
    preview: g.preview
      ? {
          colorR: g.preview.color_r,
          colorG: g.preview.color_g,
          colorB: g.preview.color_b,
          textureFile: g.preview.texture_file ?? null
        }
      : null,
    createdAt: g.created_at,
    visible: true,
    local: false
  }
}

// GET /api/materials/library/groups — the GLOBAL material-group library,
// newest-first (the backend orders by created_at descending). Called on app
// open / project change.
export function listMaterials(): Promise<Material[]> {
  return api
    .get<ListGroupsResponse>(API_ROUTES.materials.groupsList())
    .then((res) => (res.groups ?? []).map(groupToMaterial))
}

// POST /api/materials/library/groups — persist the right-panel draft as one
// named group (Save Material). The response (the created group) is ignored; the
// saga refreshes the list afterwards.
export function createGroup(input: SaveMaterialInput): Promise<void> {
  return api
    .post(API_ROUTES.materials.groupsCreate(), {
      name: input.name,
      project_id: input.projectId,
      scenario_id: input.scenarioId,
      materials: input.materials.map((m) => ({
        material_type_id: m.materialTypeId,
        properties: m.properties
      }))
    })
    .then(() => undefined)
}

// PATCH .../library/{id}/rename (§7.5). The backend enforces the ≤20-char +
// unique-name rules (200-no-ops an unchanged name). The response is ignored —
// the slice already knows the new name.
export function renameMaterial(projectId: string, materialId: string, name: string): Promise<void> {
  return api
    .patch(API_ROUTES.materials.rename(projectId, materialId), { name })
    .then(() => undefined)
}
