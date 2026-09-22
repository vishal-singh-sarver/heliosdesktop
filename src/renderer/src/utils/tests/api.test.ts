import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { ApiError, toApiError } from '../api'

// toApiError normalises every axios failure into an ApiError with a guaranteed,
// user-facing string message. The important behaviours: a real HTTP response is
// parsed for its backend message, and a request that never came back (timeout /
// network) becomes a clear message instead of axios's raw internals — the reason
// the timeouts were added in the first place.
describe('toApiError', () => {
  const axiosError = (over: Partial<AxiosError>): AxiosError =>
    ({ isAxiosError: true, name: 'AxiosError', message: '', ...over }) as AxiosError

  it('maps a timed-out request to a friendly, retry-able message', () => {
    const err = toApiError(
      axiosError({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })
    )
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
    expect(err.message).toBe('The request timed out. Please try again.')
  })

  it('maps ETIMEDOUT the same way', () => {
    expect(toApiError(axiosError({ code: 'ETIMEDOUT' })).message).toBe(
      'The request timed out. Please try again.'
    )
  })

  it('parses a backend error envelope from a real response', () => {
    const err = toApiError(
      axiosError({
        response: {
          status: 409,
          statusText: 'Conflict',
          data: { detail: { error: 'Material name already exists' } },
          headers: {},
          config: {} as never
        }
      })
    )
    expect(err.status).toBe(409)
    expect(err.message).toBe('Material name already exists')
  })

  it('falls back to a network-error message when there is no response and no timeout code', () => {
    expect(toApiError(axiosError({ message: 'Network Error' })).message).toBe('Network Error')
    expect(toApiError(axiosError({})).message).toBe('Network error')
  })
})
