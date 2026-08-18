// Ordered phases of a project open. Each owns a fixed slice of the progress
// bar (see progress.ts) so a counter starting at zero inside a phase can never
// drag the bar backwards across a boundary.
export type BootPhase = 'idle' | 'project' | 'init' | 'reveal'

export interface BootProgress {
  phase: BootPhase
  // 0–100, straight from the backend's own `progress` field. Monotonic for the
  // lifetime of one run.
  percent: number
  // The backend's `message`, verbatim. Empty when the server has not said
  // anything yet.
  label: string
  // Populated only once the backend sends counts; drives the "3 of 12" caption
  // and never the bar.
  done: number
  total: number
}

export interface BootError {
  status: number
  code: string | null
  message: string
  // A 5xx or a dropped connection is worth retrying; a 4xx means the ids are
  // stale and retrying would fail identically.
  retryable: boolean
}

// Owned by utils/scopeError, which is what detects and reports it — this slice
// only stores what it is handed. Defining the same shape twice invites the two
// drifting apart.
export type { ScopeKind, ScopeLossReport as ScopeLoss } from 'utils/scopeError'

// ── Wire shape of GET /api/project/{p}/scenarios/{s}/init ────────────────────
//
// Every field is optional because the stream is versioned by addition: today
// the backend sends {stage, progress, message} and a bare {error, status}.
// `done` / `total` / `code` are the fields R1 and R4 will add — reading them
// defensively now means those upgrades need no frontend change beyond
// progress.ts.
export interface InitEvent {
  stage?: string
  progress?: number
  message?: string
  done?: number
  total?: number
  error?: unknown
  status?: number
  code?: string
}
