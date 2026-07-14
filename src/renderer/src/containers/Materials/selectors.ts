import { createSelector } from 'reselect'
import type { RootState } from 'store/reducers'
import { formatMaterialName, nextMaterialNumber } from './naming'
import { initialState, type MaterialsState } from './reducer'
import type { Material } from './types'

// ── Domain ─────────────────────────────────────────────────────────────────────

// The materials slice is injected lazily; fall back to initialState before it
// mounts. Cast through unknown because RootState doesn't statically know the key.
const selectMaterialsDomain = (state: RootState): MaterialsState =>
  (state as unknown as { materials?: MaterialsState }).materials ?? initialState

// ── Memoised selectors ─────────────────────────────────────────────────────────

export const selectAllMaterials = createSelector(selectMaterialsDomain, (s): Material[] =>
  s.order.map((id) => s.byId[id]).filter(Boolean)
)

export const selectSearchQuery = createSelector(selectMaterialsDomain, (s) => s.searchQuery)

// The list the UI renders: all materials filtered by the (case-insensitive)
// search query against the name.
export const selectVisibleMaterials = createSelector(
  selectAllMaterials,
  selectSearchQuery,
  (materials, query): Material[] => {
    const q = query.trim().toLowerCase()
    if (!q) return materials
    return materials.filter((m) => m.name.toLowerCase().includes(q))
  }
)

export const selectSelectedId = createSelector(selectMaterialsDomain, (s) => s.selectedId)
export const selectLoadStatus = createSelector(selectMaterialsDomain, (s) => s.loadStatus)
export const selectLoadError = createSelector(selectMaterialsDomain, (s) => s.loadError)
export const selectNameErrors = createSelector(selectMaterialsDomain, (s) => s.nameErrors)

// Lowercased names of every material — used by the rename editor's uniqueness
// check (the row excludes its own name).
export const selectMaterialNamesLower = createSelector(
  selectAllMaterials,
  (materials): Set<string> => new Set(materials.map((m) => m.name.toLowerCase()))
)

// Proposed label for the next +Add Materials — continues the Material.NNN
// sequence over the current rows (backend + local), filling the lowest free gap.
export const selectNextMaterialName = createSelector(selectAllMaterials, (materials): string =>
  formatMaterialName(nextMaterialNumber(materials.map((m) => m.name)))
)

// ── Right-panel material Properties draft ────────────────────────────────────
// The material open in the Properties form (null when none). Consumed by
// MaterialPropertiesForm. `selectMaterialDraftNonce` is the monotonic open
// counter the RightPanel watches to auto-expand (mirrors Geometry's nonce).
export const selectMaterialDraft = createSelector(selectMaterialsDomain, (s) => s.editDraft)
export const selectMaterialDraftNonce = createSelector(
  selectMaterialsDomain,
  (s) => s.editDraftNonce
)

// Cached group details, by group id. The open-material saga reads this first so a
// material that was already fetched reopens without a second GET.
export const selectMaterialDetailsById = createSelector(selectMaterialsDomain, (s) => s.detailsById)

// +Add Materials (create-empty-group) status + error, consumed by the left panel.
export const selectCreateStatus = createSelector(selectMaterialsDomain, (s) => s.createStatus)
export const selectCreateError = createSelector(selectMaterialsDomain, (s) => s.createError)

const makeSelectMaterials = () => createSelector(selectMaterialsDomain, (s) => s)

export default makeSelectMaterials
export { selectMaterialsDomain }
