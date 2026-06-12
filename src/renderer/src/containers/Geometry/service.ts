import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import { mockCreateGeometry, mockDeleteNode, mockListNodes, mockRenameGroup } from './mockData'
import type { GeoNode } from './types'

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

interface ListNodesResponse {
  nodes: GeoNode[]
}

export function listNodes(projectId: string, scenarioId: string): Promise<GeoNode[]> {
  if (USE_MOCK) return mockListNodes(projectId, scenarioId)
  return api
    .get<ListNodesResponse>(API_ROUTES.geometry.list(projectId, scenarioId))
    .then((res) => res.nodes)
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
