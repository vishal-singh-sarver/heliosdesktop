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

// ── Axios instance ───────────────────────────────────────────────────────────

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    accept: 'application/json',
    'session-id': getSessionId()
  }
})

// ── Core request ─────────────────────────────────────────────────────────────

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    const res = await client.request<T>({ method, url: path, data: body })
    return res.data
  } catch (err) {
    const axErr = err as AxiosError
    if (axErr.response) {
      const parsed = parseErrorBody(axErr.response.data, axErr.response.statusText || axErr.message)
      throw new ApiError(axErr.response.status, parsed.message, parsed.fieldErrors)
    }
    throw new ApiError(0, axErr.message || 'Network error')
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
    const axErr = err as AxiosError
    if (axErr.response) {
      const parsed = parseErrorBody(axErr.response.data, axErr.response.statusText || axErr.message)
      throw new ApiError(axErr.response.status, parsed.message, parsed.fieldErrors)
    }
    throw new ApiError(0, axErr.message || 'Network error')
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
