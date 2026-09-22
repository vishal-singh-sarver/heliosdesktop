import type { RootState } from 'store/reducers'
import { initialState, type ProjectBootState } from './reducer'
import type { BootError, BootProgress, ScopeLoss } from './types'

// The slice is registered on the root reducer (not injected on mount) because
// the loader has to be able to open before any screen exists — on restart it
// is the first thing the user sees.
const slice = (state: RootState): ProjectBootState => state.projectBoot ?? initialState

export const selectBootActive = (state: RootState): boolean => slice(state).active

export const selectBootProgress = (state: RootState): BootProgress => slice(state).progress

export const selectBootError = (state: RootState): BootError | null => slice(state).error

export const selectBootProjectId = (state: RootState): string | null => slice(state).projectId

export const selectBootRunId = (state: RootState): number => slice(state).runId

export const selectScopeLoss = (state: RootState): ScopeLoss | null => slice(state).scopeLoss

export const selectLiveScenario = (
  state: RootState
): { projectId: string; scenarioId: string } | null => slice(state).liveScenario
