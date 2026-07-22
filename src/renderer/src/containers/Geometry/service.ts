import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import { unionVisibility, type VisibilityLike } from './models'
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
  return {
    id: String(obj.id),
    name: obj.name,
    kind: 'ground',
    parentId: obj.group_id == null ? null : String(obj.group_id),
    childIds: [],
    expanded: false,
    visibleInViewport: obj.visibility?.viewport ?? true,
    renderEnabled: obj.visibility?.render ?? true,
    modelVisibility: parseModels(obj.visibility?.models)
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

// The API's visibility.models is keyed by stringified model id; convert to the
// numeric-keyed map the slice holds. Absent → empty (every model defaults on).
function parseModels(models: Record<string, boolean> | undefined): ModelVisibility {
  const out: ModelVisibility = {}
  if (models) for (const [id, on] of Object.entries(models)) out[Number(id)] = on
  return out
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

// A group carries no visibility of its own in the API — its render state is the
// union of its members (see unionVisibility): a model/viewport/render is "on" for
// the group iff it's on for any member. So the group's render icon shows on while
// any member is still rendered, and only goes off once every member is off
// (matching the cascade the reducer applies optimistically). Built from the
// per-object visibility (in VisibilityLike shape) parsed in mergeTree.
function deriveGroupVisibility(
  memberIds: number[],
  visByObject: Map<number, VisibilityLike>
): VisibilityLike {
  const members = memberIds
    .map((id) => visByObject.get(id))
    .filter((v): v is VisibilityLike => v !== undefined)
  return unionVisibility(members)
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

  // Per-object visibility (in VisibilityLike shape), used both for the leaf rows
  // below and to derive each group's (union) render state — otherwise a refreshed
  // group always reads as on.
  const visByObject = new Map<number, VisibilityLike>()
  for (const o of objects) {
    visByObject.set(o.id, {
      modelVisibility: parseModels(o.visibility?.models),
      renderEnabled: o.visibility?.render ?? true,
      visibleInViewport: o.visibility?.viewport ?? true
    })
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
        // Derived from members — a group has no visibility of its own (§6).
        ...deriveGroupVisibility(g.member_ids, visByObject)
      }
    })
  }

  for (const o of objects) {
    const id = String(o.id)
    let parentId = parentByChild.get(id) ?? (o.group_id == null ? null : String(o.group_id))
    if (parentId && !groupIds.has(parentId)) parentId = null
    const vis = visByObject.get(o.id)
    rows.push({
      ts: o.created_at,
      node: {
        id,
        name: o.name,
        kind: o.object_type === 'Ground' ? 'ground' : 'imported',
        parentId,
        childIds: [],
        expanded: false,
        // VisibilityLike already carries the node's visibility fields verbatim.
        visibleInViewport: vis?.visibleInViewport ?? true,
        renderEnabled: vis?.renderEnabled ?? true,
        // Per-model map keyed by catalog model id; absent ids default to on.
        modelVisibility: vis?.modelVisibility ?? {}
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

// Persist an object visibility toggle (§5.4). Partial PATCH: only the keys
// present in `visibility` change. The eye sends { viewport }, the render icon
// sends { render }, a kebab per-model toggle sends { models: { "<id>": bool } }.
// Called per object/leaf id — group viewport/render go through
// updateGroupVisibility instead.
export function updateVisibility(
  projectId: string,
  scenarioId: string,
  objectId: string,
  visibility: { viewport?: boolean; render?: boolean; models?: Record<string, boolean> }
): Promise<void> {
  return api
    .patch(API_ROUTES.geometry.update(projectId, scenarioId, objectId), { visibility })
    .then(() => undefined)
}

// Group-level visibility toggle — viewport, render, and per-model (models) all
// go through the dedicated group endpoint, which cascades to members
// server-side. Body is nested under `visibility` (same shape as the object PATCH).
export function updateGroupVisibility(
  projectId: string,
  scenarioId: string,
  groupId: string,
  visibility: { viewport?: boolean; render?: boolean; models?: Record<string, boolean> }
): Promise<void> {
  return api
    .patch(API_ROUTES.geometry.groupVisibility(projectId, scenarioId, groupId), { visibility })
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

// The full detail the right-panel form needs to edit an existing object: its
// tree node, raw form values, and the catalog type (to resolve the form fields).
export interface LoadedObject {
  node: GeoNode
  values: Record<string, string>
  objectTypeId: number
  objectName: string
}

// GET one object's detail — used when a ground is clicked in the tree. Tolerant
// of a { success, object } wrapper or a bare object (same as createObject).
export function getObject(
  projectId: string,
  scenarioId: string,
  id: string
): Promise<LoadedObject> {
  return api
    .get<CreateObjectResponse | WireObject>(API_ROUTES.geometry.getObject(projectId, scenarioId, id))
    .then((res) => {
      const obj = 'object' in res ? res.object : res
      return {
        node: wireObjectToNode(obj),
        values: wireObjectToValues(obj),
        objectTypeId: obj.object_type_id,
        objectName: obj.object_type
      }
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


// POST — assign a material GROUP to one object (drag-and-drop). The backend keys
// both objects and groups by integer; `sync` asks it to reconcile + repaint the
// scenario. Returns nothing we consume — feedback is the caller's toast.
export function assignMaterialGroup(
  projectId: string,
  scenarioId: string,
  objectId: string,
  groupId: string,
  sync = true
): Promise<void> {
  return api
    .post(API_ROUTES.geometry.assignMaterialGroup(projectId, scenarioId, objectId), {
      group_id: Number(groupId),
      sync
    })
    .then(() => undefined)
}
