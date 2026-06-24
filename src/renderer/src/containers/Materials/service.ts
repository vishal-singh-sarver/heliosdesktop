import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import type { Material } from './types'

// The single seam between the Materials sagas and the backend — sagas import
// only this module, never `api` directly.

// §7.2 list-item shape. `preview` carries visualisation props only.
interface WirePreview {
  color_r: number
  color_g: number
  color_b: number
  texture_file: string | null
}
interface WireMaterialListItem {
  id: number
  name: string
  material_type_id: number
  material_type: string
  preview: WirePreview | null
  created_at: string
}
interface ListMaterialsResponse {
  materials: WireMaterialListItem[]
}

function wireToMaterial(m: WireMaterialListItem): Material {
  return {
    id: String(m.id),
    name: m.name,
    materialTypeId: m.material_type_id,
    materialType: m.material_type,
    preview: m.preview
      ? {
          colorR: m.preview.color_r,
          colorG: m.preview.color_g,
          colorB: m.preview.color_b,
          textureFile: m.preview.texture_file ?? null
        }
      : null,
    createdAt: m.created_at,
    visible: true,
    local: false
  }
}

// GET .../library — the project's persisted material library, newest-first
// (the backend orders by created_at descending).
export function listMaterials(projectId: string): Promise<Material[]> {
  return api
    .get<ListMaterialsResponse>(API_ROUTES.materials.list(projectId))
    .then((res) => (res.materials ?? []).map(wireToMaterial))
}

// PATCH .../library/{id}/rename (§7.5). The backend enforces the ≤20-char +
// unique-name rules (200-no-ops an unchanged name). The response is ignored —
// the slice already knows the new name.
export function renameMaterial(projectId: string, materialId: string, name: string): Promise<void> {
  return api
    .patch(API_ROUTES.materials.rename(projectId, materialId), { name })
    .then(() => undefined)
}
