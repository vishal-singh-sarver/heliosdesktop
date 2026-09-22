/*
 * Navigation reducer
 *
 * Manages the active screen without a URL router.
 * Screens are string identifiers — add new ones to the Screen union as needed.
 */

import { STORAGE_KEYS } from 'utils/storageKeys'

export type Screen = 'home' | 'project'

export interface NavigationState {
  screen: Screen
  // True only for the 'project' screen pickInitialScreen() RESTORED below —
  // never for one we navigated to.
  //
  // The distinction matters because navigate('project') is dispatched from
  // exactly one place: the boot's reveal(), after /init has finished hydrating
  // the scenario. A restored 'project' has had none of that yet, so App uses
  // this to hold ProjectScreen back until the boot settles. Without it the
  // screen mounted in the first frame and fired its whole data load — the type
  // catalogs, listScenarios and the scene it chains, the geometry tree —
  // ahead of the /init they were meant to run after, where they simply queued
  // behind the backend's hydration lock.
  //
  // Cleared by ANY navigation, which is what makes it self-resetting: the boot
  // ends by dispatching navigate('project') whether or not we were already
  // there, and cancelling or failing out leads to navigate('home').
  restored: boolean
}

export const NAVIGATE = 'app/navigation/NAVIGATE'

interface NavigateAction {
  type: typeof NAVIGATE
  payload: Screen
  // Index signature required by Redux 5's UnknownAction type so dispatch
  // accepts this action without a cast.
  [extraProps: string]: unknown
}

export type NavigationAction = NavigateAction

export function navigate(screen: Screen): NavigateAction {
  return { type: NAVIGATE, payload: screen }
}

// Open directly to the project screen when both ids were persisted on the
// last session — ProjectScreen clears the scenario id on unmount, so the
// pair is only present when the user quit while still on the project view.
// Falls back to home if localStorage is unavailable (e.g. sandbox boot).
function pickInitialScreen(): Screen {
  try {
    const projectId = localStorage.getItem(STORAGE_KEYS.activeProjectId)
    const scenarioId = localStorage.getItem(STORAGE_KEYS.activeScenarioId)
    return projectId && scenarioId ? 'project' : 'home'
  } catch {
    return 'home'
  }
}

const initialScreen = pickInitialScreen()

export const initialState: NavigationState = {
  screen: initialScreen,
  restored: initialScreen === 'project'
}

export default function navigationReducer(
  state: NavigationState = initialState,
  action: NavigationAction
): NavigationState {
  switch (action.type) {
    case NAVIGATE:
      return { ...state, screen: action.payload, restored: false }
    default:
      return state
  }
}
