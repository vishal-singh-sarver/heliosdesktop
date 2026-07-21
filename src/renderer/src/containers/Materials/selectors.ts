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

// ── Plain field reads ──────────────────────────────────────────────────────────
// Not memoised: each returns a value already stored on the slice, so it is stable
// by identity whenever the slice is. Wrapping these in createSelector only added
// a cache around an identity function.

export const selectSearchQuery = (state: RootState): string =>
  selectMaterialsDomain(state).searchQuery
export const selectSelectedId = (state: RootState): string | null =>
  selectMaterialsDomain(state).selectedId
export const selectLoadStatus = (state: RootState): MaterialsState['loadStatus'] =>
  selectMaterialsDomain(state).loadStatus
export const selectLoadError = (state: RootState): string | null =>
  selectMaterialsDomain(state).loadError
export const selectNameErrors = (state: RootState): MaterialsState['nameErrors'] =>
  selectMaterialsDomain(state).nameErrors
export const selectMaterialsById = (state: RootState): MaterialsState['byId'] =>
  selectMaterialsDomain(state).byId
// Ids whose whole-material delete is in flight — the row disables its trash while
// its id is here, so a pessimistic delete can't be fired twice.
export const selectDeletingIds = (state: RootState): string[] =>
  selectMaterialsDomain(state).deletingIds

// ── Memoised selectors ─────────────────────────────────────────────────────────

// Keyed on `byId` and `order` rather than the whole slice: immer hands back a new
// slice object for EVERY handled action, so a domain-wide input made this recompute
// on each keystroke in a property field or the search box — producing a fresh array
// identity that re-rendered every row and rebuilt the name Set below. These two
// fields change only when the list itself does.
export const selectAllMaterials = createSelector(
  (state: RootState) => selectMaterialsDomain(state).byId,
  (state: RootState) => selectMaterialsDomain(state).order,
  (byId, order): Material[] => order.map((id) => byId[id]).filter(Boolean)
)

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
export const selectMaterialDraft = (state: RootState): MaterialsState['editDraft'] =>
  selectMaterialsDomain(state).editDraft
export const selectMaterialDraftNonce = (state: RootState): number =>
  selectMaterialsDomain(state).editDraftNonce
// The material whose detail is being fetched (a row click that missed the cache),
// or null. Drives the right-panel "opening…" spinner.
export const selectOpeningMaterialId = (state: RootState): string | null =>
  selectMaterialsDomain(state).openingId

// Cached group details, by group id. The open-material saga reads this first so a
// material that was already fetched reopens without a second GET.
export const selectMaterialDetailsById = (state: RootState): MaterialsState['detailsById'] =>
  selectMaterialsDomain(state).detailsById

// +Add Materials (create-empty-group) status + error, consumed by the left panel.
export const selectCreateStatus = (state: RootState): MaterialsState['createStatus'] =>
  selectMaterialsDomain(state).createStatus
export const selectCreateError = (state: RootState): string | null =>
  selectMaterialsDomain(state).createError
// The row +Add Materials just created — drives its transient "just appeared" cue.
export const selectLastCreatedId = (state: RootState): string | null =>
  selectMaterialsDomain(state).lastCreatedId

// A failed open (row click) or delete — shown as a banner above the list, since
// neither has a row or field of its own to hang an error off.
export const selectActionError = (state: RootState): string | null =>
  selectMaterialsDomain(state).actionError

// The visualisation colour picker's "Used colors" history (most-recent-first).
export const selectRecentColors = (state: RootState): MaterialsState['recentColors'] =>
  selectMaterialsDomain(state).recentColors

const makeSelectMaterials = () => createSelector(selectMaterialsDomain, (s) => s)

export default makeSelectMaterials
export { selectMaterialsDomain }
