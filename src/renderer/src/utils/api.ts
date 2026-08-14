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
// There are none. Requests wait as long as the backend needs, because the work
// behind them legitimately can: saving a high-resolution geometry that carries a
// texture ran past the old 30s cap and failed a save that would have succeeded.
// The cost is that a request which never comes back never settles either — the
// caller's saga stays pending and the UI holds its loading state until the app is
// restarted. That trade is deliberate; don't reinstate a cap without a per-call
// budget for the slow endpoints.

// ── Axios instance ───────────────────────────────────────────────────────────

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    accept: 'application/json',
    'session-id': getSessionId()
  }
})

// A request that never produced a response comes back with no `response` and an
// abort code. Nothing here times out any more, so this now covers connections the
// OS or the server dropped — still worth a clear, user-facing message rather than
// axios's raw wording.
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
      headers: { 'Content-Type': undefined }
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
