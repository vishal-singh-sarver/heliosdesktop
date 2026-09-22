import axios, { AxiosError, AxiosInstance } from 'axios'
import { BASE_URL } from './constants'
import { reportScopeFailure } from './scopeError'
import { getSessionId } from './session'

// ── Error type ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors: Record<string, string> = {},
    // The backend's house error shape is `detail: {error, code}`. The code is
    // what lets callers tell "this project is gone" apart from "this one object
    // is gone" without matching on English text, which is free to be reworded.
    // Null when the route sent no code (see utils/scopeError for the fallback).
    public readonly code: string | null = null
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ParsedError {
  message: string
  fieldErrors: Record<string, string>
  code?: string | null
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
    const errorCode = (detail as { code?: unknown }).code
    if (typeof errorText === 'string' && errorText.trim()) {
      return {
        message: errorText,
        fieldErrors: {},
        code: typeof errorCode === 'string' ? errorCode : null
      }
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
    return new ApiError(
      err.response.status,
      parsed.message,
      parsed.fieldErrors,
      parsed.code ?? null
    )
  }
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return new ApiError(0, 'The request timed out. Please try again.')
  }
  return new ApiError(0, err.message || 'Network error')
}

// ── Core request ─────────────────────────────────────────────────────────────

export interface RequestOptions {
  // Skip scope-loss detection for this call.
  //
  // The detector reads a 404 that carries no machine `code` as "the project or
  // scenario is gone" — it can only match the ids in the URL — and raises a
  // blocking "Go to Home" dialog. That is right for the routes it was written
  // for, but wrong for any endpoint that 404s about something INSIDE a healthy
  // scenario. POST /deleteRow is one: it is all-or-nothing, so a single already
  // -deleted row 404s the whole batch, and the user would be thrown out of a
  // perfectly good project instead of being told which rows were missing.
  //
  // Callers that pass this MUST handle the error themselves — nothing else will
  // surface it.
  skipScopeCheck?: boolean
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: RequestOptions
): Promise<T> {
  try {
    const res = await client.request<T>({ method, url: path, data: body })
    return res.data
  } catch (err) {
    const apiError = toApiError(err as AxiosError)
    // A project deleted in the other window fails every in-flight call at once.
    // The detector latches on the first and raises one blocking dialog; the
    // error is still thrown so each caller can unwind its own state.
    if (!opts?.skipScopeCheck) {
      reportScopeFailure({
        status: apiError.status,
        code: apiError.code,
        url: path,
        message: apiError.message
      })
    }
    throw apiError
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
    const apiError = toApiError(err as AxiosError)
    reportScopeFailure({
      status: apiError.status,
      code: apiError.code,
      url: path,
      message: apiError.message
    })
    throw apiError
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('POST', path, body, opts),
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
