/*
 * Scope loss — "the project or scenario on screen no longer exists".
 *
 * Two windows share one process, one backend and one session id (a second
 * launch takes the single-instance lock and opens another window instead of
 * starting a second app). So a project deleted in one window is genuinely gone
 * for the other, and the other only finds out when it next calls the backend.
 *
 * Three code paths can be the one that finds out: the axios client, the raw
 * fetch used for binary geometry, and the /init progress stream. They all
 * report here so a single place decides what it means and a single dialog is
 * shown — not one per failed call.
 */

export type ScopeKind = 'project' | 'scenario'

export interface ScopeLossReport {
  kind: ScopeKind
  projectId: string | null
  message: string
}

interface ScopeFailureInput {
  status: number
  /** Backend error code, when the route sends one. */
  code?: string | null
  /** Request path — used to tell whose 404 this is when no code is sent. */
  url?: string | null
  message?: string
}

const PROJECT_CODE = 'PROJECT_NOT_FOUND'
const SCENARIO_CODE = 'SCENARIO_NOT_FOUND'

let activeProjectId: string | null = null
let activeScenarioId: string | null = null
let listener: ((loss: ScopeLossReport) => void) | null = null
// A dead project fails every in-flight call at once. Latch on the first so the
// user gets one dialog instead of ten.
let reported = false

/** Point the detector at whatever the user currently has open. */
export function setActiveScope(projectId: string | null, scenarioId: string | null): void {
  if (projectId !== activeProjectId || scenarioId !== activeScenarioId) reported = false
  activeProjectId = projectId
  activeScenarioId = scenarioId
}

export function clearActiveScope(): void {
  activeProjectId = null
  activeScenarioId = null
  reported = false
}

/** Re-arm after the user dismisses the dialog. */
export function resetScopeLossLatch(): void {
  reported = false
}

/** Register the sink (App wires this to a dispatch). Returns an unsubscribe. */
export function onScopeLost(fn: (loss: ScopeLossReport) => void): () => void {
  listener = fn
  return () => {
    if (listener === fn) listener = null
  }
}

function classify(input: ScopeFailureInput): ScopeKind | null {
  const { status, code, url, message } = input

  if (status !== 404) return null
  if (!activeProjectId) return null

  // R4 not shipped: scene_object_service sends a machine-readable `code`,
  // scenario_service sends a bare English string. When a code is present it is
  // the whole answer — and it is also what rules out the object-level 404s
  // (GEOMETRY_NOT_FOUND fires whenever a single deleted object is fetched, and
  // must never be mistaken for the project going away).
  if (code) {
    if (code === PROJECT_CODE) return 'project'
    if (code === SCENARIO_CODE) return 'scenario'
    return null
  }

  // No code: only scenario_service reaches here, and it 404s solely for a
  // missing project or scenario. Confirm the failure is about the ids on
  // screen rather than some other project, then read which one from the ids
  // themselves — never from the wording, which is free to change.
  const haystack = `${url ?? ''} ${message ?? ''}`
  if (!haystack.includes(activeProjectId)) return null
  if (activeScenarioId && haystack.includes(activeScenarioId)) return 'scenario'
  return 'project'
}

/**
 * Report a failed call. Returns true when it was scope loss and has been
 * raised — the caller should stop its own error handling, because the screen
 * is about to be replaced anyway.
 */
export function reportScopeFailure(input: ScopeFailureInput): boolean {
  const kind = classify(input)
  if (!kind) return false
  if (reported) return true

  reported = true
  listener?.({
    kind,
    projectId: activeProjectId,
    message: input.message ?? ''
  })
  return true
}
