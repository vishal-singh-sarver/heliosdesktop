import type { ModelVisibility } from './types'

// Per-model visibility helpers. The model list itself now comes from the catalog
// (GET /api/catalog/model-types, surfaced via ProjectScreen's selectModelTypes);
// these operate on a node's `modelVisibility` map keyed by catalog model id.

// Whether a single model is currently enabled for a node. A model id absent from
// the map defaults to visible (matches the API, where an unset model is shown).
export function isModelOn(vis: ModelVisibility, id: number): boolean {
  return vis[id] ?? true
}

// Whether any catalog model is on. Drives the row render icon and keeps the
// backend `render` flag in sync: render is on iff at least one model is on
// (a model id absent from the map defaults to on).
export function anyModelOn(vis: ModelVisibility, modelIds: number[]): boolean {
  return modelIds.some((id) => isModelOn(vis, id))
}

// The visibility fields a group derives from its members. Both the refresh-time
// build (service.deriveGroupVisibility) and the optimistic recompute
// (reducer.recomputeParentGroup) feed this the same way, so the union lives here
// once.
export interface VisibilityLike {
  modelVisibility: ModelVisibility
  renderEnabled: boolean
  visibleInViewport: boolean
}

// A group has no visibility of its own — it's the union of its members: a model
// (and viewport/render) is "on" for the group iff it's on for any member. We OR
// per model id via isModelOn so a member whose map omits an id (and thus defaults
// that model on) correctly keeps the group on — otherwise an explicitly-off
// sibling would mask a still-visible member. The result map only spans the ids
// any member mentions; an id no member mentions defaults on for the group too,
// matching every member. Empty input ⇒ shown (groups never legitimately empty).
export function unionVisibility(members: VisibilityLike[]): VisibilityLike {
  if (members.length === 0) {
    return { modelVisibility: {}, renderEnabled: true, visibleInViewport: true }
  }
  const ids = new Set<number>()
  for (const m of members) for (const key of Object.keys(m.modelVisibility)) ids.add(Number(key))
  const modelVisibility: ModelVisibility = {}
  for (const id of ids) modelVisibility[id] = members.some((m) => isModelOn(m.modelVisibility, id))
  return {
    modelVisibility,
    renderEnabled: members.some((m) => m.renderEnabled),
    visibleInViewport: members.some((m) => m.visibleInViewport)
  }
}
