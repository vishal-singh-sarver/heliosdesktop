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
