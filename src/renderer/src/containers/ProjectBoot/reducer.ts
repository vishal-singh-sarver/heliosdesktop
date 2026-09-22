import { produce } from 'immer'
import type { Reducer, UnknownAction } from 'redux'
import type { ProjectBootAction } from './actions'
import {
  BOOT_CANCELLED,
  BOOT_FAILED,
  BOOT_PROGRESS,
  BOOT_STARTED,
  BOOT_SUCCEEDED,
  DISMISS_BOOT_ERROR,
  DISMISS_SCOPE_LOST,
  SCENARIO_DISCARDED,
  SCOPE_LOST
} from './constants'
import { clampForward, initialProgress } from './progress'
import type { BootError, BootProgress, ScopeLoss } from './types'

export interface ProjectBootState {
  // Identifies the run in flight. Every lifecycle action carries the run it
  // belongs to and is dropped unless it matches — so a cancelled load that is
  // still unwinding can never write over the load that replaced it.
  runId: number
  projectId: string | null
  scenarioId: string | null
  // Whether the loader is on screen. Stays true on failure so the dialog can
  // offer Retry in place rather than dumping the user somewhere.
  active: boolean
  progress: BootProgress
  error: BootError | null
  // Set when the open project or scenario has been deleted, usually by another
  // window. Blocks the screen until the user acknowledges it.
  scopeLoss: ScopeLoss | null
  // The scenario whose backend context is hydrated and still held in memory.
  // Not the same as what is on screen: it survives the loader closing and is
  // the record of what still needs releasing.
  liveScenario: { projectId: string; scenarioId: string } | null
}

export const initialState: ProjectBootState = {
  runId: 0,
  projectId: null,
  scenarioId: null,
  active: false,
  progress: initialProgress,
  error: null,
  scopeLoss: null,
  liveScenario: null
}

const projectBootReducer: Reducer<ProjectBootState> = (state = initialState, rawAction) =>
  produce(state, (draft) => {
    const action = rawAction as UnknownAction as ProjectBootAction

    switch (action.type) {
      case BOOT_STARTED: {
        const { runId, projectId } = action.payload as { runId: number; projectId: string }
        draft.runId = runId
        draft.projectId = projectId
        draft.scenarioId = null
        draft.active = true
        draft.progress = initialProgress
        draft.error = null
        break
      }

      case BOOT_PROGRESS: {
        const { runId, progress } = action.payload as { runId: number; progress: BootProgress }
        if (runId !== draft.runId) break
        draft.progress = clampForward(draft.progress, progress)
        break
      }

      case BOOT_SUCCEEDED: {
        const { runId, projectId, scenarioId } = action.payload as {
          runId: number
          projectId: string
          scenarioId: string | null
        }
        if (runId !== draft.runId) break
        draft.scenarioId = scenarioId
        draft.active = false
        draft.error = null
        draft.progress = initialProgress
        // Only a COMPLETED boot leaves a context behind. Recording it anywhere
        // else would let a cancelled or failed run be discarded — and discard
        // autosaves first, so a half-hydrated context would overwrite the
        // scenario's real context.xml and rotate the good copy into archives.
        draft.liveScenario = scenarioId ? { projectId, scenarioId } : null
        break
      }

      case BOOT_FAILED: {
        const { runId, error } = action.payload as { runId: number; error: BootError }
        if (runId !== draft.runId) break
        // Loader stays up: the dialog swaps its progress bar for the message
        // plus Retry / Go to Home.
        draft.error = error
        break
      }

      case BOOT_CANCELLED: {
        const { runId } = action.payload as { runId: number }
        if (runId !== draft.runId) break
        draft.active = false
        draft.error = null
        draft.progress = initialProgress
        draft.projectId = null
        draft.scenarioId = null
        break
      }

      // The user acknowledged a failure. Back to idle, and the project id goes
      // with it — they are leaving, not retrying.
      case DISMISS_BOOT_ERROR:
        draft.active = false
        draft.error = null
        draft.progress = initialProgress
        draft.projectId = null
        draft.scenarioId = null
        break

      // Scope loss outranks whatever the loader was showing — the ids it is
      // working with are gone, so there is nothing left to finish.
      case SCOPE_LOST:
        draft.scopeLoss = action.payload as ScopeLoss
        draft.active = false
        draft.error = null
        draft.progress = initialProgress
        break

      case DISMISS_SCOPE_LOST:
        draft.scopeLoss = null
        break

      case SCENARIO_DISCARDED:
        draft.liveScenario = null
        break

      default:
        break
    }
  })

export default projectBootReducer
