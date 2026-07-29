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
