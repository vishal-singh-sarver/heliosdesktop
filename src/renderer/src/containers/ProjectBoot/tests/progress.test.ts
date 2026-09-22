import {
  atPercent,
  clampForward,
  fromInitEvent,
  isInitDone,
  isInitError,
  readInitError
} from '../progress'
import type { BootProgress } from '../types'

describe('atPercent', () => {
  it('reports exactly the percent it is given', () => {
    expect(atPercent('project', 0).percent).toBe(0)
    expect(atPercent('reveal', 100).percent).toBe(100)
  })

  it('clamps outside 0–100 and survives a non-finite value', () => {
    expect(atPercent('init', -20).percent).toBe(0)
    expect(atPercent('init', 500).percent).toBe(100)
    expect(atPercent('init', 0 / 0).percent).toBe(0)
  })

  it('carries no label and no counts of its own', () => {
    // The steps either side of /init exist to position the bar, not to say
    // anything. Words come from the server or not at all.
    const p = atPercent('project', 0)
    expect(p.label).toBe('')
    expect(p.total).toBe(0)
  })
})

describe('clampForward', () => {
  const at = (percent: number, label = ''): BootProgress => ({
    phase: 'init',
    percent,
    label,
    done: 0,
    total: 0
  })

  it('lets progress move forward', () => {
    expect(clampForward(at(30), at(60)).percent).toBe(60)
  })

  it('refuses to move the bar backwards', () => {
    expect(clampForward(at(60), at(30)).percent).toBe(60)
  })

  it('keeps the last backend message when the new update carries none', () => {
    // Steps the server says nothing about pass '' — the caption must hold on
    // the server's last words rather than blanking out.
    expect(clampForward(at(50, 'Preparing geometry'), at(100)).label).toBe('Preparing geometry')
  })

  it('takes the newer message as soon as the server sends one', () => {
    expect(clampForward(at(50, 'Preparing geometry'), at(100, 'Scenario ready')).label).toBe(
      'Scenario ready'
    )
  })
})

describe('fromInitEvent', () => {
  it("is the backend's progress value, verbatim", () => {
    // 0.1 → 10%, 0.5 → 50%. No phase weighting, no interpolation.
    expect(fromInitEvent({ progress: 0.1 }).percent).toBeCloseTo(10)
    expect(fromInitEvent({ progress: 0.5 }).percent).toBeCloseTo(50)
    expect(fromInitEvent({ progress: 1 }).percent).toBe(100)
  })

  it('treats a missing progress as 0 rather than guessing', () => {
    expect(fromInitEvent({ stage: 'hydrate' }).percent).toBe(0)
  })

  it("takes the caption from the server's message, verbatim", () => {
    expect(fromInitEvent({ message: 'Loading scenario context' }).label).toBe(
      'Loading scenario context'
    )
  })

  it('invents nothing when the event carries no message', () => {
    // The regression this guards: a frontend fallback string appearing in a
    // loader that is supposed to show only what the server said.
    expect(fromInitEvent({ progress: 0.5 }).label).toBe('')
  })

  it('carries counts only when the backend sends them', () => {
    expect(fromInitEvent({ progress: 0.5 }).total).toBe(0)
    const counted = fromInitEvent({ progress: 0.5, done: 3, total: 12 })
    expect(counted.done).toBe(3)
    expect(counted.total).toBe(12)
  })

  it('never reports more done than the total', () => {
    expect(fromInitEvent({ done: 20, total: 12 }).done).toBe(12)
  })
})

describe('init terminal events', () => {
  it('recognises done', () => {
    expect(isInitDone({ stage: 'done' })).toBe(true)
    expect(isInitDone({ stage: 'hydrate' })).toBe(false)
  })

  it('recognises both the current and the flattened error shapes', () => {
    expect(isInitError({ error: 'boom' })).toBe(true)
    expect(isInitError({ stage: 'error' })).toBe(true)
    expect(isInitError({ stage: 'hydrate' })).toBe(false)
  })
})

describe('readInitError', () => {
  it("reads scenario_service's bare string detail", () => {
    expect(readInitError({ error: 'Project abc not found', status: 404 })).toEqual({
      status: 404,
      code: null,
      message: 'Project abc not found'
    })
  })

  it("reads scene_object_service's {error, code} detail", () => {
    expect(
      readInitError({ error: { error: 'Scenario gone', code: 'SCENARIO_NOT_FOUND' }, status: 404 })
    ).toEqual({ status: 404, code: 'SCENARIO_NOT_FOUND', message: 'Scenario gone' })
  })

  it('reads a flat top-level code (R4)', () => {
    expect(readInitError({ stage: 'error', code: 'PROJECT_NOT_FOUND', error: 'gone', status: 404 })).toEqual(
      { status: 404, code: 'PROJECT_NOT_FOUND', message: 'gone' }
    )
  })

  it('still yields a usable message when the payload is empty', () => {
    const parsed = readInitError({ stage: 'error' })
    expect(parsed.status).toBe(0)
    expect(parsed.message).toBeTruthy()
  })
})
