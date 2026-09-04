import { useEffect, useState } from 'react'
import type { PerfReport } from './metrics'
import { getReport } from './metrics'

/**
 * Poll the harness while `active`.
 *
 * Polled rather than pushed on purpose. The numbers change on every frame, and
 * a React state update per frame would put the overlay's own re-render inside
 * the measurement — the classic profiler-perturbs-the-subject problem. Twice a
 * second is fast enough to read and slow enough to be invisible in the numbers.
 */
export function usePerfReport(active: boolean, intervalMs = 500): PerfReport | null {
  const [report, setReport] = useState<PerfReport | null>(null)

  useEffect(() => {
    if (!active) return

    const tick = (): void => setReport(getReport())
    // The first sample is scheduled rather than taken inline: setting state in
    // an effect body triggers a cascading render, and this hook exists to stay
    // out of the measurement it is reading.
    const first = window.setTimeout(tick, 0)
    const id = window.setInterval(tick, intervalMs)

    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [active, intervalMs])

  // Gated on `active` rather than cleared on deactivate, so switching the
  // overlay off needs no state write at all.
  return active ? report : null
}
