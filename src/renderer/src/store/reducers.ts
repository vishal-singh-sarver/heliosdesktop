import type { ThreeDWindowState } from 'containers/3DWindow/store/types'
import type { HomePageState } from 'containers/HomePage/reducer'
import projectBootReducer, { type ProjectBootState } from 'containers/ProjectBoot/reducer'
import type { ProjectScreenState } from 'containers/ProjectScreen/reducer'
import { combineReducers, Reducer, UnknownAction } from 'redux'
// import activeProjectReducer from './activeProjectReducer'
import navigationReducer, { type NavigationState } from './navigationReducer'
import snackbarReducer, { type SnackbarState } from './snackbarReducer'

export interface RootState {
  navigation: NavigationState
  snackbar: SnackbarState
  // Always present at runtime, never injected: the loader has to be able to
  // open before any screen mounts — on restart it is the first thing the user
  // sees. Optional only so a test can hand a selector a bare state object; the
  // selectors fall back to the slice's initial state.
  projectBoot?: ProjectBootState
  homePage?: HomePageState
  projectScreen?: ProjectScreenState
  threeDWindow?: ThreeDWindowState
}

function createReducer(
  injectedReducers: Record<string, Reducer> = {}
): Reducer<RootState, UnknownAction> {
  return combineReducers({
    navigation: navigationReducer,
    snackbar: snackbarReducer,
    projectBoot: projectBootReducer,
    ...injectedReducers
  }) as unknown as Reducer<RootState, UnknownAction>
}

export default createReducer
