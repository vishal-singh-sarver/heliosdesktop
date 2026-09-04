// Centralized localStorage keys. Anything written or read across the
// renderer should go through these constants — searching for the literal
// string and finding it in only one place keeps cross-feature wiring
// auditable.
export const STORAGE_KEYS = {
  activeProjectId: 'helios:activeProjectId',
  activeScenarioId: 'helios:activeScenarioId',
  // Recently-used material visualisation colours (the picker's "Used colors"
  // row) — a global, most-recent-first list persisted across restarts.
  recentColors: 'helios:materials:recentColors'
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

// Which geometry wire format the 3D viewport requests — 'v1' (per-primitive) or
// 'v2' (GPU-ready typed arrays). See containers/3DWindow/store/featureFlags.ts.
export const GEOMETRY_FORMAT_KEY = 'helios.geometryFormat'
