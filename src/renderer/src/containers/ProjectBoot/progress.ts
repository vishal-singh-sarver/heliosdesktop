import type { BootPhase, BootProgress, InitEvent } from './types'

// The bar reports what the backend reports and nothing else. There are no phase
// weights, no interpolation and no animation: if the server has not moved, the
// bar does not move. A still bar is the truthful reading of a server that is
// working without saying so.

export const initialProgress: BootProgress = {
  phase: 'idle',
  percent: 0,
  label: '',
  done: 0,
  total: 0
}

const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0

/**
 * A fixed point on the bar, for the two steps the backend says nothing about:
 * fetching the project id before the stream opens, and revealing the screen
 * after it has finished.
 */
export function atPercent(
  phase: Exclude<BootPhase, 'idle'>,
  percent: number,
  label = ''
): BootProgress {
  return { phase, percent: clampPercent(percent), label, done: 0, total: 0 }
}

/**
 * The single door every progress update passes through.
 *
 * `percent` may never fall below what the user has already seen — a duplicated
 * event, a reordered one, or a backend that revises a value downward would
 * otherwise drag the bar back.
 */
export function clampForward(prev: BootProgress, next: BootProgress): BootProgress {
  return {
    ...next,
    // The bar never moves backwards, whatever arrives.
    percent: Math.max(next.percent, prev.percent),
    // The label only ever changes when the BACKEND says something new. Phases
    // with no message of their own pass '' and keep whatever the server last
    // said — so the loader never shows a sentence the frontend invented.
    label: next.label || prev.label
  }
}

/**
 * Map one raw /init event onto the bar.
 *
 * The bar IS the backend's `progress` field: 0.1 → 10%, 0.5 → 50%, 1.0 → 100%.
 * Nothing is scaled into a phase slice and nothing is animated, so the bar
 * moves exactly when — and only when — the server says it has.
 *
 * Today that means it holds at 50% for the whole hydration, because the server
 * sends nothing between "Preparing geometry" and "Scenario ready". That is not
 * the bar being stuck; it is the server not reporting. When it starts sending
 * per-object progress (R1) this same code draws a smooth bar with no change
 * here — it is already reading the field that would carry it.
 */
export function fromInitEvent(ev: InitEvent): BootProgress {
  const total = Number(ev.total ?? 0)
  const done = Number(ev.done ?? 0)
  const fraction = Number(ev.progress ?? 0)

  return {
    phase: 'init',
    percent: clampPercent(fraction * 100),
    // Verbatim from the server, with no substitute. An event that carries no
    // message leaves the caption on whatever the server last said (see
    // clampForward) rather than putting words in its mouth.
    label: ev.message?.trim() ?? '',
    // Only meaningful once the backend sends counts; drives the "3 of 12"
    // caption, never the bar.
    done: total > 0 ? Math.min(done, total) : 0,
    total: total > 0 ? total : 0
  }
}

/** True for the event that ends the stream successfully. */
export function isInitDone(ev: InitEvent): boolean {
  return ev.stage === 'done'
}

/** True for the event that ends the stream with a failure. */
export function isInitError(ev: InitEvent): boolean {
  return ev.stage === 'error' || ev.error !== undefined
}

/**
 * Flatten an init failure into the shape the rest of the app uses.
 *
 * The stream nests whatever the raised HTTPException carried, so `error` is a
 * plain string from scenario_service and a `{error, code}` object from
 * scene_object_service. R4 flattens this at the source; until then both shapes
 * have to be understood here.
 */
export function readInitError(ev: InitEvent): { status: number; code: string | null; message: string } {
  const status = Number(ev.status ?? 0)
  const raw = ev.error

  if (raw && typeof raw === 'object') {
    const detail = raw as { error?: unknown; code?: unknown }
    return {
      status,
      code: typeof detail.code === 'string' ? detail.code : (ev.code ?? null),
      message: typeof detail.error === 'string' ? detail.error : 'Failed to prepare the scenario.'
    }
  }

  return {
    status,
    code: ev.code ?? null,
    message: typeof raw === 'string' && raw.trim() ? raw : 'Failed to prepare the scenario.'
  }
}
