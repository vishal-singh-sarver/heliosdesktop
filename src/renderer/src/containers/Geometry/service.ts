import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import type { GeoNode, ModelVisibility } from './types'

// ── Create-object payload + wire shapes ──────────────────────────────────────
//
// The real POST /objects body the backend accepts (verified against Swagger):
// object_type_id + name + a flat `properties` map + visibility + materials.
// On success it returns the persisted object, which we map back to a GeoNode.
export interface CreateObjectInput {
  objectTypeId: number
  name: string
  properties: Record<string, number>
  materials: Array<{ material_id: number; sync: boolean }>
}

// Subset of the backend's persisted object we actually consume. `properties` is
// the flat catalog-property→value map (e.g. { length: 10, position_x: 0 }) the
// POST/GET returns; the right-panel form reads it to show the saved values.
interface WireObject {
  id: number
  name: string
  object_type_id: number
  object_type: string
  group_id: number | null
  properties?: Record<string, number | null>
  visibility?: {
    viewport?: boolean
    render?: boolean
    models?: Record<string, boolean>
  }
}

interface CreateObjectResponse {
  success: boolean
  object: WireObject
}

// Map the backend object → the tree's GeoNode. The backend models visibility as
// { viewport, render, models:{<modelId>:bool} }; our GeoNode uses a viewport
// flag + a coarse all/none model visibility, so we collapse `render` into that
// (per-model custom visibility maps onto numeric model ids later — see the
// catalog model-types). Numeric backend ids become string node ids.
export function wireObjectToNode(obj: WireObject): GeoNode {
  const modelVisibility: ModelVisibility =
    obj.visibility?.render === false ? { mode: 'none' } : { mode: 'all' }
  return {
    id: String(obj.id),
    name: obj.name,
    kind: 'ground',
    parentId: obj.group_id == null ? null : String(obj.group_id),
    childIds: [],
    expanded: false,
    visibleInViewport: obj.visibility?.viewport ?? true,
    modelVisibility
  }
}

// The backend's flat `properties` map → the form's raw string values (the form
// keeps every field as a controlled string). Null/absent values become "".
export function wireObjectToValues(obj: WireObject): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [property, value] of Object.entries(obj.properties ?? {})) {
    values[property] = value == null ? '' : String(value)
  }
  return values
}

// Minimal create payload — only the two fields the backend needs for now; the
// full geometry params are filled in later by the right-panel Properties form.
export interface CreateGeometryInput {
  id: string
  name: string
  kind: 'ground'
}

// The single seam between the Geometry sagas and the backend: every call goes
// through `api` to the scenario-scoped endpoints. Sagas import only this module
// — never `api` directly.

// The backend returns the object list wrapped under one of a few keys (the
// Swagger schema is loose). Pull the array out wherever it lives, then map each
// wire object → GeoNode. Tolerant by design so a shape tweak doesn't blank the
// tree. Exported for unit testing.
export function parseListResponse(res: unknown): GeoNode[] {
  let arr: unknown[] = []
  if (Array.isArray(res)) {
    arr = res
  } else if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>
    const candidate = r.objects ?? r.nodes ?? r.data ?? r.items
    if (Array.isArray(candidate)) arr = candidate
  }
  return arr.filter((o): o is WireObject => !!o && typeof o === 'object').map(wireObjectToNode)
}

export function listNodes(projectId: string, scenarioId: string): Promise<GeoNode[]> {
  return api
    .get<unknown>(API_ROUTES.geometry.list(projectId, scenarioId))
    .then(parseListResponse)
}

// Sends only { id, name } to the backend (the agreed minimal payload). The
// client owns the id, so no reconcile is needed — the slice inserts the node
// on success.
export function createGeometry(
  projectId: string,
  scenarioId: string,
  input: CreateGeometryInput
): Promise<void> {
  return api
    .post(API_ROUTES.geometry.create(projectId, scenarioId), { id: input.id, name: input.name })
    .then(() => undefined)
}

export function renameGroup(
  projectId: string,
  scenarioId: string,
  id: string,
  name: string
): Promise<void> {
  return api
    .patch(API_ROUTES.geometry.rename(projectId, scenarioId, id), { name })
    .then(() => undefined)
}

// Deletes a node. A group also removes its children server-side; the reducer
// mirrors that on success.
export function deleteNode(projectId: string, scenarioId: string, id: string): Promise<void> {
  return api.delete(API_ROUTES.geometry.remove(projectId, scenarioId, id)).then(() => undefined)
}

// The persisted object as the slice needs it: the tree node plus its raw form
// values (so the right-panel form can show the just-created object's properties).
export interface CreatedObject {
  node: GeoNode
  values: Record<string, string>
}

// Creates an object (e.g. a Ground) with its default property values. The
// backend returns the full persisted object ({ success, object }); we map it to
// the tree node AND extract the property values for the form (no extra GET).
export function createObject(
  projectId: string,
  scenarioId: string,
  input: CreateObjectInput
): Promise<CreatedObject> {
  return api
    .post<CreateObjectResponse | WireObject>(API_ROUTES.geometry.create(projectId, scenarioId), {
      object_type_id: input.objectTypeId,
      name: input.name,
      properties: input.properties,
      visibility: {},
      materials: input.materials
    })
    .then((res) => {
      const obj = 'object' in res ? res.object : res
      return { node: wireObjectToNode(obj), values: wireObjectToValues(obj) }
    })
}

// PATCH an existing object's properties / visibility / group — the right-panel
// Save. The backend keys objects by integer; group_id is sent as a number (null
// at the root). The response is ignored (the tree node already holds name/parent).
export interface UpdateObjectInput {
  properties: Record<string, number>
  visibility: { viewport: boolean; render: boolean }
  groupId: string | null
}

export function updateObject(
  projectId: string,
  scenarioId: string,
  id: string,
  input: UpdateObjectInput
): Promise<void> {
  return api
    .patch(API_ROUTES.geometry.update(projectId, scenarioId, id), {
      properties: input.properties,
      visibility: input.visibility,
      group_id: input.groupId == null ? null : Number(input.groupId)
    })
    .then(() => undefined)
}
