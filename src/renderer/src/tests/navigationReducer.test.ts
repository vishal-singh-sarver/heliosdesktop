import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { STORAGE_KEYS } from 'utils/storageKeys'
import navigationReducer, {
  navigate,
  NAVIGATE,
  initialState,
  type NavigationState,
  type NavigationAction,
  type Screen
} from '../store/navigationReducer'

// ── navigate action creator ──────────────────────────────────────────────────

describe('navigate() action creator', () => {
  it('builds a NAVIGATE action targeting the project screen', () => {
    expect(navigate('project')).toEqual({ type: NAVIGATE, payload: 'project' })
  })

  it('builds a NAVIGATE action targeting the home screen', () => {
    expect(navigate('home')).toEqual({ type: NAVIGATE, payload: 'home' })
  })
})

// ── reducer ───────────────────────────────────────────────────────────────────

describe('navigationReducer', () => {
  it('sets screen to the payload on NAVIGATE (home → project)', () => {
    const next = navigationReducer({ screen: 'home' }, navigate('project'))
    expect(next).toEqual({ screen: 'project' })
  })

  it('sets screen to the payload on NAVIGATE (project → home)', () => {
    const next = navigationReducer({ screen: 'project' }, navigate('home'))
    expect(next).toEqual({ screen: 'home' })
  })

  it('produces a new state object without mutating the previous one', () => {
    const prev: NavigationState = { screen: 'home' }
    const next = navigationReducer(prev, navigate('project'))
    expect(next).not.toBe(prev)
    expect(prev.screen).toBe('home') // untouched
  })

  it('returns the identical state reference for an unrecognized action (default branch)', () => {
    const prev: NavigationState = { screen: 'project' }
    const next = navigationReducer(prev, {
      type: 'app/other/UNKNOWN',
      payload: 'home'
    } as unknown as NavigationAction)
    expect(next).toBe(prev)
  })

  it('falls back to initialState when called with undefined state (default param + default branch)', () => {
    const next = navigationReducer(undefined, {
      type: 'app/other/UNKNOWN'
    } as unknown as NavigationAction)
    expect(next).toBe(initialState)
  })
})

// ── pickInitialScreen() — exercised through a fresh module evaluation ─────────
//
// pickInitialScreen runs once, at module load, to compute `initialState`.
// To cover every branch we seed localStorage, reset the module registry, then
// re-import so pickInitialScreen re-runs against the seeded storage.

describe('pickInitialScreen (via initialState on a fresh import)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  async function freshInitialScreen(): Promise<Screen> {
    const mod = await import('../store/navigationReducer')
    return mod.initialState.screen
  }

  it("opens directly to 'project' when BOTH ids are persisted", async () => {
    localStorage.setItem(STORAGE_KEYS.activeProjectId, 'proj-1')
    localStorage.setItem(STORAGE_KEYS.activeScenarioId, 'scen-1')
    expect(await freshInitialScreen()).toBe('project')
  })

  it("falls back to 'home' when only the project id is present", async () => {
    localStorage.setItem(STORAGE_KEYS.activeProjectId, 'proj-1')
    expect(await freshInitialScreen()).toBe('home')
  })

  it("falls back to 'home' when only the scenario id is present", async () => {
    localStorage.setItem(STORAGE_KEYS.activeScenarioId, 'scen-1')
    expect(await freshInitialScreen()).toBe('home')
  })

  it("falls back to 'home' when neither id is present", async () => {
    expect(await freshInitialScreen()).toBe('home')
  })

  describe('when localStorage access throws (catch branch)', () => {
    let original: Storage

    beforeEach(() => {
      original = globalThis.localStorage
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: () => {
            throw new Error('localStorage unavailable (sandbox boot)')
          }
        },
        configurable: true,
        writable: true
      })
    })

    afterEach(() => {
      Object.defineProperty(globalThis, 'localStorage', {
        value: original,
        configurable: true,
        writable: true
      })
    })

    it("swallows the error and returns 'home'", async () => {
      expect(await freshInitialScreen()).toBe('home')
    })
  })
})
