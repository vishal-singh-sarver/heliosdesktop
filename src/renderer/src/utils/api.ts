import axios, { AxiosError, AxiosInstance } from 'axios'
import { BASE_URL } from './constants'
import { getSessionId } from './session'

// ── Error type ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors: Record<string, string> = {}
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ParsedError {
  message: string
  fieldErrors: Record<string, string>
}

function parseErrorBody(data: unknown, fallback: string): ParsedError {
  if (data == null) return { message: fallback, fieldErrors: {} }
  if (typeof data === 'string') return { message: data || fallback, fieldErrors: {} }

  const detail = (data as { detail?: unknown })?.detail

  if (typeof detail === 'string') return { message: detail, fieldErrors: {} }

  // Custom backend error shape: { detail: { error, code } }. Surface the
  // human-readable `error` (e.g. "Geometry name already exists") instead of the
  // bare HTTP status text ("Conflict").
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const errorText = (detail as { error?: unknown }).error
    if (typeof errorText === 'string' && errorText.trim()) {
      return { message: errorText, fieldErrors: {} }
    }
  }

  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {}
    const parts: string[] = []

    for (const d of detail as Array<{ loc?: unknown[]; msg?: unknown }>) {
      if (typeof d?.msg !== 'string') continue
      const loc = Array.isArray(d.loc) && d.loc.length > 0 ? String(d.loc[d.loc.length - 1]) : null
      if (loc) {
        fieldErrors[loc] = d.msg
        parts.push(`${loc}: ${d.msg}`)
      } else {
        parts.push(d.msg)
      }
    }

    if (parts.length > 0) {
      return { message: parts.join('; '), fieldErrors }
    }
  }

  return { message: fallback, fieldErrors: {} }
}

// ── Timeouts ─────────────────────────────────────────────────────────────────
// Without a timeout a hung request never settles: the caller's saga stays pending
// forever and the UI sits in a permanent loading/saving state with no error and no
// recovery but an app restart. A default caps ordinary JSON calls; uploads get a
// longer budget because a multi-MB file legitimately takes longer.
const DEFAULT_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000

// ── Axios instance ───────────────────────────────────────────────────────────

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    accept: 'application/json',
    'session-id': getSessionId()
  }
})

// A request that exceeded its timeout comes back with no `response` and
// `code === 'ECONNABORTED'`; surface it as a clear, user-facing message rather
// than axios's raw "timeout of 30000ms exceeded".
export function toApiError(err: AxiosError): ApiError {
  if (err.response) {
    const parsed = parseErrorBody(err.response.data, err.response.statusText || err.message)
    return new ApiError(err.response.status, parsed.message, parsed.fieldErrors)
  }
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return new ApiError(0, 'The request timed out. Please try again.')
  }
  return new ApiError(0, err.message || 'Network error')
}

// ── Core request ─────────────────────────────────────────────────────────────

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    const res = await client.request<T>({ method, url: path, data: body })
    return res.data
  } catch (err) {
    throw toApiError(err as AxiosError)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Multipart POST for file uploads. Passing `Content-Type: undefined` drops the
// instance's default JSON header so the browser sets `multipart/form-data` with
// the correct boundary itself; errors are normalised exactly like `request`.
async function upload<T>(path: string, form: FormData): Promise<T> {
  try {
    const res = await client.request<T>({
      method: 'POST',
      url: path,
      data: form,
      headers: { 'Content-Type': undefined },
      // A file upload gets a longer budget than a JSON call, but still a finite
      // one — so a stalled upload fails and releases the "Uploading…" state.
      timeout: UPLOAD_TIMEOUT_MS
    })
    return res.data
  } catch (err) {
    throw toApiError(err as AxiosError)
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  // Upload one file as multipart/form-data (field name `file`).
  uploadFile: <T>(path: string, file: File): Promise<T> => {
    const form = new FormData()
    form.append('file', file)
    return upload<T>(path, form)
  }
}
