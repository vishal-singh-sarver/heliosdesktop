// Unit tests for the shared HTTP client. Coverage previously sat at ~15% because
// only the happy path was exercised through container sagas; the error-parsing
// branches (FastAPI `detail` string / validation array / bare network failure)
// were untested. We mock the axios instance's `request` so every branch of
// `parseErrorBody` + `request` can be driven deterministically without a server.
import { api, ApiError } from '../utils/api'

// vi.hoisted so the mock fn exists before the vi.mock factory (which is hoisted
// above imports) references it. api.ts only uses `axios.create(...).request` and
// treats AxiosError purely as a type, so a `default.create` stub is enough.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }))
vi.mock('axios', () => ({
  default: { create: vi.fn(() => ({ request: mockRequest })) }
}))

/** Build an axios-style rejection carrying a `response` (server replied 4xx/5xx). */
function httpError(status: number, data: unknown, statusText = ''): unknown {
  return { response: { status, statusText, data }, message: `Request failed with status code ${status}` }
}

beforeEach(() => {
  mockRequest.mockReset()
})

describe('api — success path', () => {
  it('returns res.data for GET', async () => {
    mockRequest.mockResolvedValue({ data: { ok: true, n: 42 } })
    await expect(api.get('/things')).resolves.toEqual({ ok: true, n: 42 })
  })

  it('forwards method, url and body for each verb', async () => {
    mockRequest.mockResolvedValue({ data: null })

    await api.get('/g')
    expect(mockRequest).toHaveBeenLastCalledWith({ method: 'GET', url: '/g', data: undefined })

    await api.post('/p', { a: 1 })
    expect(mockRequest).toHaveBeenLastCalledWith({ method: 'POST', url: '/p', data: { a: 1 } })

    await api.put('/u', { b: 2 })
    expect(mockRequest).toHaveBeenLastCalledWith({ method: 'PUT', url: '/u', data: { b: 2 } })

    await api.patch('/pa', { c: 3 })
    expect(mockRequest).toHaveBeenLastCalledWith({ method: 'PATCH', url: '/pa', data: { c: 3 } })

    await api.delete('/d')
    expect(mockRequest).toHaveBeenLastCalledWith({ method: 'DELETE', url: '/d', data: undefined })
  })
})

describe('api — error parsing (response present)', () => {
  it('uses a string `detail` verbatim as the message', async () => {
    mockRequest.mockRejectedValue(httpError(400, { detail: 'Project name already exists' }))
    await expect(api.post('/project/create')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Project name already exists',
      fieldErrors: {}
    })
  })

  it('flattens a FastAPI validation array into fieldErrors + a joined message', async () => {
    const detail = [
      { loc: ['body', 'name'], msg: 'ensure this value has at most 30 characters' },
      { loc: ['body', 'latitude'], msg: 'must be between -90 and 90' }
    ]
    mockRequest.mockRejectedValue(httpError(422, { detail }))
    let caught: ApiError | undefined
    try {
      await api.post('/project/create', {})
    } catch (e) {
      caught = e as ApiError
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect(caught?.status).toBe(422)
    expect(caught?.fieldErrors).toEqual({
      name: 'ensure this value has at most 30 characters',
      latitude: 'must be between -90 and 90'
    })
    expect(caught?.message).toBe(
      'name: ensure this value has at most 30 characters; latitude: must be between -90 and 90'
    )
  })

  it('keeps a validation entry with no loc as a bare message (no field key)', async () => {
    mockRequest.mockRejectedValue(httpError(422, { detail: [{ msg: 'body is required' }] }))
    await expect(api.post('/x')).rejects.toMatchObject({
      status: 422,
      message: 'body is required',
      fieldErrors: {}
    })
  })

  it('skips array entries whose msg is not a string and falls back to statusText', async () => {
    mockRequest.mockRejectedValue(httpError(422, { detail: [{ loc: ['body'], msg: 123 }] }, 'Unprocessable'))
    await expect(api.post('/x')).rejects.toMatchObject({
      status: 422,
      message: 'Unprocessable',
      fieldErrors: {}
    })
  })

  it('treats a plain string body as the message', async () => {
    mockRequest.mockRejectedValue(httpError(500, 'Internal Server Error'))
    await expect(api.get('/boom')).rejects.toMatchObject({
      status: 500,
      message: 'Internal Server Error'
    })
  })

  it('falls back to statusText for an empty string body', async () => {
    mockRequest.mockRejectedValue(httpError(503, '', 'Service Unavailable'))
    await expect(api.get('/x')).rejects.toMatchObject({ status: 503, message: 'Service Unavailable' })
  })

  it('falls back to statusText for a null body', async () => {
    mockRequest.mockRejectedValue(httpError(404, null, 'Not Found'))
    await expect(api.get('/x')).rejects.toMatchObject({ status: 404, message: 'Not Found', fieldErrors: {} })
  })

  it('falls back to statusText for an object body with no detail', async () => {
    mockRequest.mockRejectedValue(httpError(400, { error: 'nope' }, 'Bad Request'))
    await expect(api.get('/x')).rejects.toMatchObject({ status: 400, message: 'Bad Request' })
  })
})

describe('api — network failure (no response)', () => {
  it('maps a responseless axios error to ApiError(0, message)', async () => {
    mockRequest.mockRejectedValue({ message: 'Network Error' })
    await expect(api.get('/x')).rejects.toMatchObject({ name: 'ApiError', status: 0, message: 'Network Error' })
  })

  it('uses a generic message when the error carries none', async () => {
    mockRequest.mockRejectedValue({})
    await expect(api.get('/x')).rejects.toMatchObject({ status: 0, message: 'Network error' })
  })
})
