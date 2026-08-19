import {
  BOOT_CANCELLED,
  BOOT_FAILED,
  BOOT_PROGRESS,
  BOOT_STARTED,
  BOOT_SUCCEEDED,
  CANCEL_BOOT,
  DISMISS_BOOT_ERROR,
  DISMISS_SCOPE_LOST,
  OPEN_PROJECT,
  RETRY_BOOT,
  SCENARIO_DISCARDED,
  SCOPE_LOST
} from './constants'
import type { BootError, BootProgress, ScopeLoss } from './types'

// ── Boot lifecycle ───────────────────────────────────────────────────────────

/**
 * The one way to open a project. Dispatched by a row click on Home and by the
 * app itself on restart when both ids were persisted. Everything else — the
 * screen switch, the catalog calls, the geometry — follows from the saga.
 */
export const openProject = (projectId: string) => ({
  type: OPEN_PROJECT,
  payload: { projectId }
})

export const bootStarted = (runId: number, projectId: string) => ({
  type: BOOT_STARTED,
  payload: { runId, projectId }
})

export const bootProgress = (runId: number, progress: BootProgress) => ({
  type: BOOT_PROGRESS,
  payload: { runId, progress }
})

export const bootSucceeded = (runId: number, projectId: string, scenarioId: string | null) => ({
  type: BOOT_SUCCEEDED,
  payload: { runId, projectId, scenarioId }
})

export const bootFailed = (runId: number, error: BootError) => ({
  type: BOOT_FAILED,
  payload: { runId, error }
})

export const cancelBoot = () => ({ type: CANCEL_BOOT })

export const bootCancelled = (runId: number) => ({
  type: BOOT_CANCELLED,
  payload: { runId }
})

export const retryBoot = () => ({ type: RETRY_BOOT })

// Closing the error dialog is not the same as cancelling a load. CANCEL_BOOT is
// taken by the race inside a live run, and a failure is only ever dispatched
// after that run has ended — so the buttons on the error dialog had nothing
// listening to them at all. This gets its own always-on watcher.
export const dismissBootError = () => ({ type: DISMISS_BOOT_ERROR })

export const scenarioDiscarded = () => ({ type: SCENARIO_DISCARDED })

// ── Scope loss ───────────────────────────────────────────────────────────────

export const scopeLost = (loss: ScopeLoss) => ({ type: SCOPE_LOST, payload: loss })

export const dismissScopeLost = () => ({ type: DISMISS_SCOPE_LOST })

// ── Union type ───────────────────────────────────────────────────────────────

export type ProjectBootAction =
  | ReturnType<typeof openProject>
  | ReturnType<typeof bootStarted>
  | ReturnType<typeof bootProgress>
  | ReturnType<typeof bootSucceeded>
  | ReturnType<typeof bootFailed>
  | ReturnType<typeof cancelBoot>
  | ReturnType<typeof bootCancelled>
  | ReturnType<typeof retryBoot>
  | ReturnType<typeof dismissBootError>
  | ReturnType<typeof scenarioDiscarded>
  | ReturnType<typeof scopeLost>
  | ReturnType<typeof dismissScopeLost>
