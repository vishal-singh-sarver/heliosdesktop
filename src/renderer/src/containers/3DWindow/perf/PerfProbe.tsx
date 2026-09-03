import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { isPerfEnabled, recordFrame, recordRenderInfo } from './metrics'

/**
 * Longest gap still counted as a frame, in ms.
 *
 * The canvas runs `frameloop="demand"`, so consecutive rAF ticks only happen
 * while something is actually driving the view — a camera drag, a damped
 * transition, a texture landing. Between those the gap is idle time, and
 * recording it would report a stationary viewport as running at 0.2 FPS.
 *
 * 250ms is comfortably longer than any frame worth calling a frame (that is
 * already 4 FPS) and comfortably shorter than a human pause.
 */
const IDLE_GAP_MS = 250

/**
 * Samples frame time and renderer counters from inside the Canvas.
 *
 * NO render priority. In R3F, giving any `useFrame` a priority above zero hands
 * rendering over to the caller and switches off the automatic render — the
 * probe would silently blank the viewport. It has to stay on the default
 * priority, which also means `gl.info` is read BEFORE this frame's render and
 * therefore reports the previous frame's totals. That one-frame lag is harmless
 * for the steady-state numbers this exists to collect.
 */
export function PerfProbe(): null {
  const gl = useThree((s) => s.gl)
  const lastFrameAt = useRef(0)

  useFrame(() => {
    if (!isPerfEnabled()) {
      // Reset so the first frame after switching on is not measured against a
      // timestamp from before the harness was enabled.
      lastFrameAt.current = 0
      return
    }

    const now = performance.now()
    if (lastFrameAt.current !== 0) {
      const dt = now - lastFrameAt.current
      if (dt < IDLE_GAP_MS) recordFrame(dt)
    }
    lastFrameAt.current = now

    const info = gl.info
    recordRenderInfo({
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0
    })
  })

  return null
}

export default PerfProbe
