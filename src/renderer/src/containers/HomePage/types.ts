export interface AppStatus {
  version: string
  uptime: number
}

export interface StreamEvent {
  type: string
  data: unknown
  timestamp: number
}

// ── Create project ────────────────────────────────────────────────────────────

export interface CreateProjectPayload {
  name: string
  latitude: number
  longitude: number
}

export interface CreateProjectResponse {
  success: boolean
  project_id: string // UUID
  name: string
  latitude: number
  longitude: number
  utc_offset: number
  session_id: string
}

export interface ApiErrorPayload {
  status: number // HTTP status (0 = network failure)
  message: string // flat human-readable message
  fieldErrors: Record<string, string> // per-field detail (FastAPI 422 → loc-keyed)
}

// ── Recent projects ───────────────────────────────────────────────────────────

export interface RecentProjectItem {
  id: string // UUID
  name: string
  last_updated: string // ISO 8601
  size: number // bytes
}

export interface RecentProjectsResponse {
  projects: RecentProjectItem[]
}

// ── Delete project ────────────────────────────────────────────────────────────

export interface DeleteProjectPayload {
  projectId: string
  // Carried so the outcome toast can name the project. The confirm dialog
  // already has it, and after a successful DELETE it is gone from the store —
  // so reading it back at that point would find nothing.
  name: string
}

// ── Rename project ───────────────────────────────────────────────────────────

export interface RenameProjectPayload {
  projectId: string
  name: string
}
