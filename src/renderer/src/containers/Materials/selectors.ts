import { createSelector } from 'reselect'
import type { RootState } from 'store/reducers'
import { initialState, type MaterialsState } from './reducer'

// ── Domain ─────────────────────────────────────────────────────────────────────

const selectMaterialsDomain = (state: RootState): MaterialsState =>
  (state as any).materials ?? initialState

// ── Memoised selectors ─────────────────────────────────────────────────────────

export const selectStatus = createSelector(selectMaterialsDomain, (s) => s.status)
export const selectLoading = createSelector(selectMaterialsDomain, (s) => s.loading)
export const selectError = createSelector(selectMaterialsDomain, (s) => s.error)
export const selectStreaming = createSelector(selectMaterialsDomain, (s) => s.streaming)
export const selectStreamLog = createSelector(selectMaterialsDomain, (s) => s.streamLog)

// ── Legacy factory (kept for test compatibility) ───────────────────────────────

const makeSelectMaterials = () => createSelector(selectMaterialsDomain, (s) => s)

export default makeSelectMaterials
export { selectMaterialsDomain as selectMaterialsDomain }
