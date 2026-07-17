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
})

describe('clearSessionId', () => {
  beforeEach(() => {
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
