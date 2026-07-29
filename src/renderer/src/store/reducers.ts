import type { ThreeDWindowState } from 'containers/3DWindow/store/types'
import type { HomePageState } from 'containers/HomePage/reducer'
import type { ProjectScreenState } from 'containers/ProjectScreen/reducer'
import { combineReducers, Reducer, UnknownAction } from 'redux'
// import activeProjectReducer from './activeProjectReducer'
import navigationReducer, { type NavigationState } from './navigationReducer'
import snackbarReducer, { type SnackbarState } from './snackbarReducer'

export interface RootState {
  navigation: NavigationState
  snackbar: SnackbarState
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
    ...injectedReducers
  }) as unknown as Reducer<RootState, UnknownAction>
}

export default createReducer
