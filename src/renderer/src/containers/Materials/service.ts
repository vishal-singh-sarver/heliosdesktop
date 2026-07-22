import { api } from 'utils/api'
import { API_ROUTES, BASE_URL } from 'utils/constants'
import type { Material, MaterialGroupDetail, MaterialPropertyValues } from './types'

// The single seam between the Materials sagas and the backend — sagas import
// only this module, never `api` directly.
//
// A material IS a global group. It is created EMPTY (createGroup) and then built
// up one material type at a time: addGroupMaterial / updateGroupMaterial /
// removeGroupMaterial, each keyed by material_type_id.

// The mutating group calls take the active scenario so the backend reconciles +
// repaints it. Appended as a query param only when there is one.
function withScenario(path: string, scenarioId: string | null): string {
  return scenarioId ? `${path}?scenario_id=${encodeURIComponent(scenarioId)}` : path
}

// ── List ─────────────────────────────────────────────────────────────────────

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

// A group renders as one Saved Materials row. The row shows the name (and later
// the preview swatch); the type fields take the group's first member, since a
// group can hold several types.
function groupToMaterial(g: WireGroupListItem): Material {
  return {
    id: String(g.id),
    name: g.name,
    // Coalesce the ARRAY, not just its first element: a group missing
    // `material_type_ids` entirely would otherwise throw on `undefined[0]`, and
    // because groupToMaterial runs inside a .map() over the whole list, one such
    // row would abort the map and blank EVERY material rather than just itself.
    materialTypeId: (g.material_type_ids ?? [])[0] ?? 0,
    materialType: (g.material_types ?? [])[0] ?? '',
    preview: g.preview
      ? {
          colorR: g.preview.color_r,
          colorG: g.preview.color_g,
          colorB: g.preview.color_b,
          textureFile: g.preview.texture_file ?? null
        }
      : null,
    createdAt: g.created_at ?? ''
  }
}

// GET /library/groups — the GLOBAL material library. Called on app open / project
// change. The endpoint returns newest-first; we re-order oldest-first so the list
// reads top-to-bottom in creation order and a newly created material sits at the
// BOTTOM — matching Geometry, which sorts its objects by created_at ascending.
// ISO-8601 timestamps sort correctly as plain strings.
export function listMaterials(): Promise<Material[]> {
  return api
    .get<ListGroupsResponse>(API_ROUTES.materials.groupsList())
    .then((res) =>
      // `?? ''` on both sides: a missing timestamp must not throw inside sort and
      // take the whole list down with it.
      (res.groups ?? [])
        .map(groupToMaterial)
        .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    )
}

// ── The material (group) itself ───────────────────────────────────────────────

// The create response carries the new group; tolerate both `{group:{id}}` and a
// bare `{id}` shape.
interface CreateGroupResponse {
  group?: { id: number }
  id?: number
}

// POST /library/groups — create the material as an EMPTY group (name only) and
// return its id. The parameter-group cards are added onto it afterwards.
// Materials are GLOBAL: a group belongs to no project and no scenario, so the
// body carries nothing but the name.
export function createGroup(name: string): Promise<string> {
  return api
    .post<CreateGroupResponse>(API_ROUTES.materials.groupsCreate(), { name })
    .then((res) => String(res.group?.id ?? res.id))
}

interface WireGroupMember {
  material_id: number
  material_type_id: number
  material_type: string | null
  properties: Record<string, unknown>
}
interface GetGroupResponse {
  group: {
    id: number
    name: string
    materials: WireGroupMember[]
  }
}

// Stored values come back natively (number / boolean / string / null); the form
// inputs are strings. An unset property becomes '' and is dropped.
function valueToString(value: unknown): string {
  return value == null ? '' : String(value)
}

// GET /library/groups/{id} — one group's members + values, to populate the form.
export function getGroup(groupId: string): Promise<MaterialGroupDetail> {
  return api.get<GetGroupResponse>(API_ROUTES.materials.groupsGet(groupId)).then((res) => ({
    id: String(res.group.id),
    name: res.group.name,
    members: (res.group.materials ?? []).map((m) => {
      const properties: Record<string, string> = {}
      for (const [key, value] of Object.entries(m.properties ?? {})) {
        const str = valueToString(value)
        if (str !== '') properties[key] = str
      }
      return { materialTypeId: m.material_type_id, properties }
    })
  }))
}

// PUT /library/groups/{id} — update the group (used to rename the material).
export function renameGroup(
  groupId: string,
  name: string,
  scenarioId: string | null
): Promise<void> {
  return api
    .patch(withScenario(API_ROUTES.materials.renameGroup(groupId), scenarioId), { name })
    .then(() => undefined)
}

// DELETE /library/groups/{id} — remove the material and all its members.
export function deleteGroup(groupId: string, scenarioId: string | null): Promise<void> {
  return api
    .delete(withScenario(API_ROUTES.materials.groupsDelete(groupId), scenarioId))
    .then(() => undefined)
}

// ── One parameter group (= one material type on the group) ───────────────────

// POST /library/groups/{id}/materials — add a material type + its properties.
// The first save of a parameter-group card.
export function addGroupMaterial(
  groupId: string,
  materialTypeId: number,
  properties: MaterialPropertyValues,
  scenarioId: string | null
): Promise<void> {
  return api
    .post(withScenario(API_ROUTES.materials.groupMaterials(groupId), scenarioId), {
      material_type_id: materialTypeId,
      properties
    })
    .then(() => undefined)
}

// PUT /library/groups/{id}/materials/{typeId} — replace the properties of a
// material type already on the group. Every save after the first. Full-replace
// (not merge): the backend nulls any property we omit, so the caller sends the
// member's COMPLETE property set. (The backend switched this from PATCH to PUT.)
export function updateGroupMaterial(
  groupId: string,
  materialTypeId: number,
  properties: MaterialPropertyValues,
  scenarioId: string | null
): Promise<void> {
  return api
    .put(withScenario(API_ROUTES.materials.groupMaterial(groupId, materialTypeId), scenarioId), {
      properties
    })
    .then(() => undefined)
}

// DELETE /library/groups/{id}/materials/{typeId} — remove one material type from
// the group (the card's Delete, once it has been saved).
export function removeGroupMaterial(
  groupId: string,
  materialTypeId: number,
  scenarioId: string | null
): Promise<void> {
  return api
    .delete(withScenario(API_ROUTES.materials.groupMaterial(groupId, materialTypeId), scenarioId))
    .then(() => undefined)
}

// ── File-property upload (Visualiser texture, …) ─────────────────────────────

// POST (multipart) a file for one of a member's file properties. The backend
// stores the file and returns its stored relative path (e.g.
// "uploads/materials/8/grass.png"), which the caller stages into the draft and
// later persists via the member save.
//
// The response shape varies: some endpoints return the bare path string, others
// wrap it as { success, property, value }. Tolerate both so the same helper
// backs texture_file and (later) spectral_data uploads.
type UploadFileResponse = string | { success?: boolean; property?: string; value: string }

function uploadedPath(res: UploadFileResponse): string {
  return typeof res === 'string' ? res : res.value
}

// Upload a file for one property of a member, keyed by `property` (e.g.
// 'texture_file'). Creates the member if it doesn't exist yet.
export function uploadMaterialFile(
  groupId: string,
  materialTypeId: number,
  property: string,
  file: File,
  scenarioId: string | null
): Promise<string> {
  return api
    .uploadFile<UploadFileResponse>(
      withScenario(
        API_ROUTES.materials.groupMaterialFile(groupId, materialTypeId, property),
        scenarioId
      ),
      file
    )
    .then(uploadedPath)
}

// The Visualiser texture upload — the property is always 'texture_file'.
export function uploadTextureFile(
  groupId: string,
  materialTypeId: number,
  file: File,
  scenarioId: string | null
): Promise<string> {
  return uploadMaterialFile(groupId, materialTypeId, 'texture_file', file, scenarioId)
}

// The full URL that renders a stored texture path (upload path or a default's
// backend path) as an <img> source.
export function textureServeUrl(path: string): string {
  return `${BASE_URL}${API_ROUTES.textures.serve(path)}`
}

// GET the built-in default textures for the "From Library" grid.
interface DefaultTexture {
  name: string
  url: string
}
// The defaults are static, so the request is cached (shared in-flight promise):
// repeated mounts — including React StrictMode's double-invoke in dev — reuse the
// one call. A failure clears the cache so a later attempt retries.
let defaultTexturesCache: Promise<DefaultTexture[]> | null = null
export function listDefaultTextures(): Promise<DefaultTexture[]> {
  if (!defaultTexturesCache) {
    defaultTexturesCache = api
      .get<{ textures: DefaultTexture[] }>(API_ROUTES.textures.defaults())
      .then((res) => res.textures ?? [])
      .catch((err) => {
        defaultTexturesCache = null
        throw err
      })
  }
  return defaultTexturesCache
}
