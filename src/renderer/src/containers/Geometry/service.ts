import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import {
  mockCreateGeometry,
  mockCreateObject,
  mockDeleteNode,
  mockListNodes,
  mockRenameGroup
} from './mockData'
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

// Subset of the backend's persisted object we actually consume.
interface WireObject {
  id: number
  name: string
  object_type_id: number
  object_type: string
  group_id: number | null
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

// Minimal create payload — only the two fields the backend needs for now; the
// full geometry params are filled in later by the right-panel Properties form.
export interface CreateGeometryInput {
  id: string
  name: string
  kind: 'ground'
}

// The single seam between the Geometry sagas and the data source. While
// VITE_USE_MOCK is "true", every call resolves from the in-memory mock; flip
// the env flag (no code change) once the scenario-scoped backend endpoints
// exist. Sagas import only this module — never the mock or `api` directly.
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

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
  if (USE_MOCK) return mockListNodes(projectId, scenarioId)
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
  if (USE_MOCK) return mockCreateGeometry(projectId, scenarioId, input)
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
  if (USE_MOCK) return mockRenameGroup(projectId, scenarioId, id, name)
  return api
    .patch(API_ROUTES.geometry.rename(projectId, scenarioId, id), { name })
    .then(() => undefined)
}

// Deletes a node. A group also removes its children server-side; the reducer
// mirrors that on success.
export function deleteNode(projectId: string, scenarioId: string, id: string): Promise<void> {
  if (USE_MOCK) return mockDeleteNode(projectId, scenarioId, id)
  return api.delete(API_ROUTES.geometry.remove(projectId, scenarioId, id)).then(() => undefined)
}

// Creates an object (e.g. a Ground) from the right-panel Properties form. Sends
// the full create payload and returns the persisted node mapped to a GeoNode.
export function createObject(
  projectId: string,
  scenarioId: string,
  input: CreateObjectInput
): Promise<GeoNode> {
  if (USE_MOCK) return mockCreateObject(projectId, scenarioId, input)
  return api
    .post<CreateObjectResponse | WireObject>(API_ROUTES.geometry.create(projectId, scenarioId), {
      object_type_id: input.objectTypeId,
      name: input.name,
      properties: input.properties,
      visibility: {},
      materials: input.materials
    })
    .then((res) => wireObjectToNode('object' in res ? res.object : res))
}
