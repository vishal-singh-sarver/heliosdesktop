import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import { getSessionId } from 'utils/session'
import { createSseChannel, type SseChannel } from 'utils/sse'
import type { InitEvent } from './types'

/**
 * Open the scenario-init progress stream.
 *
 * This is the one route that takes the session id as a QUERY PARAM: EventSource
 * cannot set request headers, so the `session-id` header every other call sends
 * is not available here.
 *
 * The stream both does the work and reports it — it creates the scenario's
 * context and hydrates it (rebuilding the saved scene into memory). Once it
 * ends with stage `done`, every other scenario-scoped call is warm and fast.
 * That is why it runs first and alone, before the catalog and geometry calls
 * that used to trigger hydration by accident from whichever one arrived first.
 */
export function openInitChannel(projectId: string, scenarioId: string): SseChannel<InitEvent> {
  const path = `${API_ROUTES.scenario.init(projectId, scenarioId)}?session_id=${encodeURIComponent(
    getSessionId()
  )}`
  return createSseChannel<InitEvent>(path)
}

/**
 * Autosave the scenario's context and release it from memory.
 *
 * Only safe to call for a scenario whose load COMPLETED. Discarding mid-init
 * would autosave a half-hydrated context, and the autosave overwrites
 * context.xml while rotating the good copy into archives — so cancelling a load
 * would replace the user's real scene with a partial one. Until the backend
 * grows a cancel path that skips the save (R6), a cancelled boot leaves the
 * backend alone entirely.
 */
export function discardScenario(projectId: string, scenarioId: string): Promise<unknown> {
  return api.post(API_ROUTES.scenario.discard(projectId, scenarioId))
}
