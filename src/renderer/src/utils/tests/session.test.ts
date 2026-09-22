// src/renderer/src/utils/tests/session.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getSessionId, clearSessionId } from '../session'

// ── Mock localStorage ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// ── Mock crypto.randomUUID ────────────────────────────────────────────────────

const MOCK_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: vi.fn(() => MOCK_UUID) }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getSessionId', () => {
  beforeEach(() => {
    // Also drops the module's in-memory copy — the id is deliberately cached
    // for the life of the run, so clearing storage alone would leak the
    // previous test's id into this one.
    clearSessionId()
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('generates a UUID when localStorage is empty', () => {
    const id = getSessionId()
    expect(id).toBe(MOCK_UUID)
  })

  it('saves the generated ID to localStorage', () => {
    getSessionId()
    expect(localStorage.getItem('helios_session_id')).toBe(MOCK_UUID)
  })

  it('returns the same ID on every call without regenerating', () => {
    const first = getSessionId()
    const second = getSessionId()
    expect(first).toBe(second)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1) // generated only once
  })

  it('reuses existing ID from localStorage without generating a new one', () => {
    localStorage.setItem('helios_session_id', 'existing-id-123')
    const id = getSessionId()
    expect(id).toBe('existing-id-123')
    expect(crypto.randomUUID).not.toHaveBeenCalled()
  })

  // Regression: a stored id with a trailing newline. Header values get their
  // trailing whitespace stripped by the browser, so axios kept matching, but
  // the init SSE url passes the id as a query parameter where "\n" survives as
  // %0A — a different session to the backend, answered with an in-band 404 the
  // app reports as "this project was deleted".
  it('trims whitespace around a stored id', () => {
    localStorage.setItem('helios_session_id', '  existing-id-123\n')
    expect(getSessionId()).toBe('existing-id-123')
    expect(crypto.randomUUID).not.toHaveBeenCalled()
  })

  it('writes the trimmed id back so the next launch starts clean', () => {
    localStorage.setItem('helios_session_id', 'existing-id-123\n')
    getSessionId()
    expect(localStorage.getItem('helios_session_id')).toBe('existing-id-123')
  })

  it('mints a fresh id when the stored value is only whitespace', () => {
    localStorage.setItem('helios_session_id', '   \n')
    expect(getSessionId()).toBe(MOCK_UUID)
  })

  // The bug this guards: the id is read once at module load for the axios
  // header, but PER CALL for the init SSE url and the binary geometry fetch.
  // With storage dead every one of those calls minted a fresh uuid, so the
  // axios calls all agreed while the init stream asked under a session that
  // owned nothing — a bare 404 the app reports as "this project was deleted".
  describe('when localStorage is unavailable', () => {
    // A profile whose storage cannot be read or written at all: getItem keeps
    // returning null however many times setItem is called.
    const deadStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    }
    const restore = (): void => {
      Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })
    }

    beforeEach(() => {
      Object.defineProperty(globalThis, 'localStorage', { value: deadStorage })
    })

    it('still returns one stable id for the whole run', () => {
      const first = getSessionId()
      const second = getSessionId()
      const third = getSessionId()
      expect(second).toBe(first)
      expect(third).toBe(first)
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
      restore()
    })

    it('survives storage that THROWS rather than no-ops', () => {
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: () => {
            throw new Error('storage disabled')
          },
          setItem: () => {
            throw new Error('storage disabled')
          },
          removeItem: () => {
            throw new Error('storage disabled')
          }
        }
      })

      const first = getSessionId()
      expect(first).toBe(MOCK_UUID)
      expect(getSessionId()).toBe(first)
      // And clearing must not blow up either.
      expect(() => clearSessionId()).not.toThrow()
      restore()
    })
  })
})

describe('clearSessionId', () => {
  beforeEach(() => {
    clearSessionId()
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('removes the ID from localStorage', () => {
    getSessionId()
    clearSessionId()
    expect(localStorage.getItem('helios_session_id')).toBeNull()
  })

  it('generates a fresh ID after clearing', () => {
    const SECOND_UUID = 'a1b2c3d4-1234-4abc-89ab-abcdef012345'
    const first = getSessionId()

    clearSessionId()
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(
      SECOND_UUID as `${string}-${string}-${string}-${string}-${string}`
    )
    const second = getSessionId()

    expect(first).toBe(MOCK_UUID)
    expect(second).toBe(SECOND_UUID)
    expect(first).not.toBe(second)
  })
})
