import { getGeometryFormat, setGeometryFormat } from '../store/featureFlags'
import type { PerfReport } from './metrics'
import { formatReport, getReport, isPerfEnabled, resetPerf, setPerfEnabled } from './metrics'

/**
 * DevTools bridge for the render-path harness.
 *
 * The stats overlay covers the interactive case, but a before/after comparison
 * wants something scriptable: switch on, reload the scenario, print one block,
 * paste it next to the previous step's block. That is this.
 *
 *   __heliosPerf.on()      // then reload the scenario
 *   __heliosPerf.log()     // prints the block, returns the raw report
 *   __heliosPerf.off()
 *
 * And the A/B for the geometry wire format — same scene, one flag:
 *
 *   __heliosPerf.gpuOn()   // v2, then reload the scenario
 *   __heliosPerf.gpuOff()  // back to v1
 */
export interface HeliosPerfBridge {
  on(): string
  off(): string
  reset(): string
  report(): PerfReport
  log(): PerfReport
  gpuOn(): string
  gpuOff(): string
  format(): string
}

const bridge: HeliosPerfBridge = {
  on() {
    setPerfEnabled(true)
    resetPerf()
    return 'perf ON — reload the scenario to measure a scene load, then __heliosPerf.log()'
  },
  off() {
    setPerfEnabled(false)
    return 'perf OFF'
  },
  reset() {
    resetPerf()
    return 'perf counters cleared'
  },
  report() {
    return getReport()
  },
  gpuOn() {
    setGeometryFormat('v2')
    return 'geometry format v2 (GPU buffers) — reload the scenario to apply'
  },
  gpuOff() {
    setGeometryFormat('v1')
    return 'geometry format v1 (per-primitive) — reload the scenario to apply'
  },
  format() {
    return getGeometryFormat()
  },
  log() {
    const report = getReport()
    // eslint-disable-next-line no-console -- this function exists to print
    console.log(formatReport(report))
    if (!isPerfEnabled()) {
      // eslint-disable-next-line no-console -- the empty report is otherwise baffling
      console.log('(harness is OFF — call __heliosPerf.on() first)')
    }
    return report
  }
}

/**
 * Attach the bridge to `window`. Idempotent, so importing it from more than one
 * module is safe.
 */
export function installPerfBridge(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __heliosPerf?: HeliosPerfBridge }
  if (w.__heliosPerf) return
  w.__heliosPerf = bridge
}
