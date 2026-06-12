import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import type { GeoNode } from './types'

// Minimal create payload — only the two fields the backend needs for now; the
// full geometry params are filled in later by the right-panel Properties form.
export interface CreateGeometryInput {
  id: string
  name: string
  kind: 'ground'
}

// The single seam between the Geometry sagas and the backend — sagas import only
// this module, never `api` directly.

// Backend list shapes (spec §5.2 objects, §6.2 groups). Leaves live in /objects
// (each with an optional group_id); groups live in /groups (each with the
// ordered member_ids). We fetch both and merge into the flat GeoNode[] the
// reducer turns into a tree.
interface ApiObject {
  id: number
  name: string
  object_type: string
  group_id: number | null
  visibility: { viewport: boolean; render: boolean; models: Record<string, boolean> }
  created_at: string
}

interface ApiGroup {
  id: number
  name: string
  member_ids: number[]
  created_at: string
}

interface ListObjectsResponse {
  objects: ApiObject[]
}

interface ListGroupsResponse {
  groups: ApiGroup[]
}

// Merge the two endpoints into the flat node list. `member_ids` is authoritative
// for group membership and child order; a leaf whose group_id points at a group
// not in the list falls back to the root so it never disappears. Root rows
// (leaves + groups) are ordered by created_at ascending — oldest first, matching
// the objects endpoint's own ordering.
function mergeTree(objects: ApiObject[], groups: ApiGroup[]): GeoNode[] {
  const groupIds = new Set(groups.map((g) => String(g.id)))
  const parentByChild = new Map<string, string>()
  for (const g of groups) {
    for (const memberId of g.member_ids) parentByChild.set(String(memberId), String(g.id))
  }

  const rows: Array<{ node: GeoNode; ts: string }> = []

  for (const g of groups) {
    rows.push({
      ts: g.created_at,
      node: {
        id: String(g.id),
        name: g.name,
        kind: 'group',
        parentId: null,
        childIds: g.member_ids.map(String),
        expanded: false,
        // Groups carry no visibility in the API; default for display only.
        visibleInViewport: true,
        modelVisibility: { mode: 'all' }
      }
    })
  }

  for (const o of objects) {
    const id = String(o.id)
    let parentId = parentByChild.get(id) ?? (o.group_id == null ? null : String(o.group_id))
    if (parentId && !groupIds.has(parentId)) parentId = null
    rows.push({
      ts: o.created_at,
      node: {
        id,
        name: o.name,
        kind: o.object_type === 'Ground' ? 'ground' : 'imported',
        parentId,
        childIds: [],
        expanded: false,
        visibleInViewport: o.visibility?.viewport ?? true,
        // Read-only slice: collapse to all/none for display. The per-model
        // 'custom' state lands with the visibility-write feature (keyed by
        // model-type id), which this view never edits.
        modelVisibility: o.visibility?.render === false ? { mode: 'none' } : { mode: 'all' }
      }
    })
  }

  // ISO-8601 timestamps sort correctly as plain strings.
  rows.sort((a, b) => a.ts.localeCompare(b.ts))
  return rows.map((r) => r.node)
}

export function listNodes(projectId: string, scenarioId: string): Promise<GeoNode[]> {
  return Promise.all([
    api.get<ListObjectsResponse>(API_ROUTES.geometry.list(projectId, scenarioId)),
    api.get<ListGroupsResponse>(API_ROUTES.geometry.listGroups(projectId, scenarioId))
  ]).then(([objectsRes, groupsRes]) => mergeTree(objectsRes.objects ?? [], groupsRes.groups ?? []))
}

// Drop one geometry onto another → create a group holding both (§6.1). Sending
// name: null lets the backend auto-number (Group.001…). The server owns the id
// and name, which we map back to strings for the slice.
interface CreateGroupResponse {
  group: { id: number; name: string; member_ids: number[] }
}

export interface CreatedGroup {
  id: string
  name: string
  memberIds: string[]
}

export function createGroup(
  projectId: string,
  scenarioId: string,
  memberIds: string[]
): Promise<CreatedGroup> {
  return api
    .post<CreateGroupResponse>(API_ROUTES.geometry.createGroup(projectId, scenarioId), {
      name: null,
      member_ids: memberIds.map(Number)
    })
    .then((res) => ({
      id: String(res.group.id),
      name: res.group.name,
      memberIds: res.group.member_ids.map(String)
    }))
}

// Ungroup / delete a group (§6.4). Used to clean up a group left empty by a move
// — the backend doesn't auto-delete an emptied group, so we do it explicitly.
export function deleteGroup(
  projectId: string,
  scenarioId: string,
  groupId: string
): Promise<void> {
  return api
    .delete(API_ROUTES.geometry.deleteGroup(projectId, scenarioId, groupId))
    .then(() => undefined)
}

// Drag a leaf into a group, between groups, or back to root. Membership lives on
// the object as group_id, so each moved node is one PATCH (§5.4). toGroupId is a
// string id, or null to ungroup back to the root.
export function moveNodes(
  projectId: string,
  scenarioId: string,
  nodeIds: string[],
  toGroupId: string | null
): Promise<void> {
  const groupId = toGroupId == null ? null : Number(toGroupId)
  return Promise.all(
    nodeIds.map((id) =>
      api.patch(API_ROUTES.geometry.update(projectId, scenarioId, id), { group_id: groupId })
    )
  ).then(() => undefined)
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

// Rename a leaf geometry (§5.5). Membership/name live on the object; the backend
// enforces the per-project unique + ≤20-char rules and 200-no-ops an unchanged
// name.
export function renameObject(
  projectId: string,
  scenarioId: string,
  id: string,
  name: string
): Promise<void> {
  return api
    .patch(API_ROUTES.geometry.renameObject(projectId, scenarioId, id), { name })
    .then(() => undefined)
}

// Rename a group (§6.3). Distinct endpoint from object rename; same body shape.
export function renameGroup(
  projectId: string,
  scenarioId: string,
  id: string,
  name: string
): Promise<void> {
  return api
    .patch(API_ROUTES.geometry.renameGroup(projectId, scenarioId, id), { name })
    .then(() => undefined)
}

// Deletes a node. A group also removes its children server-side; the reducer
// mirrors that on success.
export function deleteNode(projectId: string, scenarioId: string, id: string): Promise<void> {
  return api.delete(API_ROUTES.geometry.remove(projectId, scenarioId, id)).then(() => undefined)
}
