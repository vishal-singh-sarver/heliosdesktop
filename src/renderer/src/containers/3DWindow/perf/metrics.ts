/**
 * Render-path instrumentation for the 3D viewport.
 *
 * Exists to turn the optimisation plan's ESTIMATES into measurements. Every
 * number the plan quotes — parse time, build time, retained heap, draw calls —
 * is derived from reading the code, and none of it has ever been measured in
 * this app. This module is the harness that settles them, so each optimisation
 * step has a real before/after rather than an impression.
 *
 * Two properties matter more than breadth:
 *
 *   1. OFF BY DEFAULT, and genuinely free when off. `startTimer` sits in the
 *      caller of the primitive parse loop and runs on every frame; a profiler
 *      that allocates a closure per call would be manufacturing the very
 *      garbage it exists to measure. Disabled, it hands back one shared no-op.
 *
 *   2. COUNTS, not just totals. The single most useful number here is how many
 *      times a stage ran during one scene load. A 12-object load that rebuilds
 *      the whole merged geometry once per object reports `build x12` — the
 *      redundant work is visible directly, where a total would hide it behind
 *      "the scene is simply large".
 */

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * The four stages of the geometry path, in the order they run:
 *   fetch  — HTTP request for one object's binary (api/geometry.ts)
 *   parse  — wire bytes → PrimitiveInfo[] (parseBinaryPrimitives)
 *   build  — PrimitiveInfo[] → BufferGeometry (buildTexturedGeometries)
 *   upload — geometry committed and drawn for the first time
 */
export type StageName = 'fetch' | 'parse' | 'build' | 'upload'

const STAGE_NAMES: StageName[] = ['fetch', 'parse', 'build', 'upload']

export interface StageStat {
  /** How many times this stage ran during the current scene load. */
  count: number
  totalMs: number
  maxMs: number
}

export interface FrameStat {
  samples: number
  p50: number
  p95: number
  max: number
}

export interface RenderStat {
  calls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
}

export interface HeapStat {
  currentMB: number
  peakMB: number
}

export interface PerfReport {
  enabled: boolean
  /** Wall clock of the last completed scene load, or null if none has finished. */
  sceneLoadMs: number | null
  stages: Record<StageName, StageStat>
  bytesFetched: number
  primitives: number
  triangles: number
  frame: FrameStat
  render: RenderStat | null
  /** Null outside Chromium — `performance.memory` is non-standard. */
  heap: HeapStat | null
}

// ── State ────────────────────────────────────────────────────────────────────

let enabled = false

const stages = new Map<StageName, StageStat>()

let bytesFetched = 0
let primitives = 0
let triangles = 0

let sceneLoadStart: number | null = null
let sceneLoadMs: number | null = null

let render: RenderStat | null = null
let heapPeakBytes = 0

/**
 * Frame times, as a fixed-size ring.
 *
 * Bounded because the numbers must describe the view RIGHT NOW. A 2-second
 * stall while a large scene loads would otherwise sit in the p95 for the rest
 * of the session and make every later measurement unreadable — and an unbounded
 * array in a long profiling run is its own leak.
 */
const FRAME_WINDOW = 600
const frames = new Float64Array(FRAME_WINDOW)
let frameWrite = 0
let frameCount = 0

/**
 * The one timer handed out while disabled. Shared on purpose: see property (1)
 * in the module comment — a fresh arrow function per call would allocate on the
 * hot path of a profiler that is switched off.
 */
const NOOP_TIMER = (): void => {}

function statFor(stage: StageName): StageStat {
  let s = stages.get(stage)
  if (!s) {
    s = { count: 0, totalMs: 0, maxMs: 0 }
    stages.set(stage, s)
  }
  return s
}

// ── Control ──────────────────────────────────────────────────────────────────

export function isPerfEnabled(): boolean {
  return enabled
}

export function setPerfEnabled(on: boolean): void {
  enabled = on
}

/** Drop every sample. Does not change the enabled flag. */
export function resetPerf(): void {
  stages.clear()
  bytesFetched = 0
  primitives = 0
  triangles = 0
  sceneLoadStart = null
  sceneLoadMs = null
  render = null
  heapPeakBytes = 0
  frameWrite = 0
  frameCount = 0
}

// ── Recording ────────────────────────────────────────────────────────────────

/**
 * Start timing one run of `stage`. Call the returned function when it ends.
 *
 * The elapsed time lives in the returned closure rather than in a module-level
 * "current start" so that overlapping runs of the same stage each measure
 * themselves — object fetches overlap as soon as they stop being sequential,
 * and a shared start time would report nonsense for all but the last to finish.
 *
 * Ending twice is ignored, so a caller may put the end in both a success path
 * and a `finally` without double-counting.
 */
export function startTimer(stage: StageName): () => void {
  if (!enabled) return NOOP_TIMER

  const started = performance.now()
  let done = false

  return function endTimer(): void {
    if (done) return
    done = true

    const ms = performance.now() - started
    const s = statFor(stage)
    s.count += 1
    s.totalMs += ms
    if (ms > s.maxMs) s.maxMs = ms
  }
}

export function recordFrame(ms: number): void {
  if (!enabled) return
  frames[frameWrite] = ms
  frameWrite = (frameWrite + 1) % FRAME_WINDOW
  if (frameCount < FRAME_WINDOW) frameCount += 1
  sampleHeap()
}

export function countBytes(n: number): void {
  if (!enabled) return
  bytesFetched += n
}

export function countGeometry(counts: { primitives: number; triangles: number }): void {
  if (!enabled) return
  primitives += counts.primitives
  triangles += counts.triangles
}

export function recordRenderInfo(info: RenderStat): void {
  if (!enabled) return
  render = info
}

/**
 * Start a scene load's measurement window.
 *
 * Clears the previous load's stage stats and counters: each load is its own
 * measurement, and carrying the last one forward would make every reload look
 * worse than the one before it. Frame samples deliberately survive — they
 * describe the viewport, not the load.
 */
export function beginSceneLoad(): void {
  if (!enabled) return
  stages.clear()
  bytesFetched = 0
  primitives = 0
  triangles = 0
  sceneLoadMs = null
  sceneLoadStart = performance.now()
  sampleHeap()
}

export function endSceneLoad(): void {
  if (!enabled || sceneLoadStart === null) return
  sceneLoadMs = performance.now() - sceneLoadStart
  sceneLoadStart = null
  sampleHeap()
}

// ── Heap ─────────────────────────────────────────────────────────────────────

interface ChromiumMemory {
  usedJSHeapSize: number
}

function readHeapBytes(): number | null {
  const mem = (performance as unknown as { memory?: ChromiumMemory }).memory
  return mem ? mem.usedJSHeapSize : null
}

function sampleHeap(): void {
  const bytes = readHeapBytes()
  if (bytes !== null && bytes > heapPeakBytes) heapPeakBytes = bytes
}

// ── Reporting ────────────────────────────────────────────────────────────────

/** Nearest-rank percentile over the frame ring. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)]
}

function frameStat(): FrameStat {
  if (frameCount === 0) return { samples: 0, p50: 0, p95: 0, max: 0 }

  const sorted: number[] = new Array(frameCount)
  for (let i = 0; i < frameCount; i++) sorted[i] = frames[i]
  sorted.sort((a, b) => a - b)

  return {
    samples: frameCount,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1]
  }
}

export function getReport(): PerfReport {
  const stageReport = {} as Record<StageName, StageStat>
  for (const name of STAGE_NAMES) {
    const s = stages.get(name)
    stageReport[name] = s ? { ...s } : { count: 0, totalMs: 0, maxMs: 0 }
  }

  const currentBytes = readHeapBytes()

  return {
    enabled,
    sceneLoadMs,
    stages: stageReport,
    bytesFetched,
    primitives,
    triangles,
    frame: frameStat(),
    render: render ? { ...render } : null,
    heap:
      currentBytes === null
        ? null
        : {
            currentMB: currentBytes / 1_048_576,
            peakMB: heapPeakBytes / 1_048_576
          }
  }
}

// ── Formatting ───────────────────────────────────────────────────────────────

const ms = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(1))

export function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * A copyable block for pasting into a before/after comparison.
 *
 * Deliberately plain text: the point is that a step's result can be recorded in
 * an issue or a commit message next to the step before it.
 */
export function formatReport(report: PerfReport): string {
  const lines: string[] = []

  lines.push('── 3D render path ──────────────────────────────')
  lines.push(
    `scene load    ${report.sceneLoadMs === null ? '(none)' : `${ms(report.sceneLoadMs)} ms`}`
  )

  for (const name of STAGE_NAMES) {
    const s = report.stages[name]
    if (s.count === 0) continue
    lines.push(
      `  ${name.padEnd(11)} ${ms(s.totalMs).padStart(8)} ms  x${s.count}` +
        `  (worst ${ms(s.maxMs)} ms)`
    )
  }

  lines.push(
    `transferred   ${formatBytes(report.bytesFetched)}` +
      `  ${formatCount(report.primitives)} prims / ${formatCount(report.triangles)} tris`
  )

  const f = report.frame
  lines.push(
    `frame         p50 ${ms(f.p50)} ms  p95 ${ms(f.p95)} ms  max ${ms(f.max)} ms  (n=${f.samples})`
  )

  if (report.render) {
    const r = report.render
    lines.push(
      `gpu           ${r.calls} calls  ${formatCount(r.triangles)} tris  ` +
        `${r.geometries} geo  ${r.textures} tex  ${r.programs} prog`
    )
  }

  if (report.heap) {
    lines.push(
      `heap          ${report.heap.currentMB.toFixed(0)} MB now  ` +
        `${report.heap.peakMB.toFixed(0)} MB peak`
    )
  }

  return lines.join('\n')
}
