import type { ModelKey, ModelVisibility } from './types'

// The five models shown in the Models dropdown (and the left-panel Models
// section). Order matches the mockup.
export const MODELS: ReadonlyArray<{ key: ModelKey; label: string }> = [
  { key: 'solar_position', label: 'Solar Position' },
  { key: 'radiation', label: 'Radiation' },
  { key: 'energy_balance', label: 'Energy Balance' },
  { key: 'photosynthesis', label: 'Photosynthesis' },
  { key: 'stomatal_conductance', label: 'Stomatal Conductance' }
]

// Whether a single model is currently enabled for a node.
export function isModelOn(vis: ModelVisibility, key: ModelKey): boolean {
  if (vis.mode === 'custom') return vis.perModel[key]
  return vis.mode === 'all'
}

// True when the node is hidden from every model (render-icon "hide all"). In
// this state the per-model dropdown is disabled (spec).
export function isAllHidden(vis: ModelVisibility): boolean {
  return vis.mode === 'none'
}

// Render-icon toggle: hide-all <-> show-all. Independent of the dropdown — from
// any state it flips to none, and from none back to all (spec point 4).
export function toggleAllModels(vis: ModelVisibility): ModelVisibility {
  return vis.mode === 'none' ? { mode: 'all' } : { mode: 'none' }
}

// Dropdown toggle for one model. Moves into 'custom' mode (mutually exclusive
// with the render-icon all/none mode), seeding per-model flags from the current
// effective visibility, then flipping the chosen model.
export function toggleOneModel(vis: ModelVisibility, key: ModelKey): ModelVisibility {
  const perModel = {} as Record<ModelKey, boolean>
  for (const model of MODELS) perModel[model.key] = isModelOn(vis, model.key)
  perModel[key] = !perModel[key]
  return { mode: 'custom', perModel }
}
