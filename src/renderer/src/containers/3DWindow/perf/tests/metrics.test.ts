import {
  beginSceneLoad,
  countBytes,
  countGeometry,
  endSceneLoad,
  formatReport,
  getReport,
  isPerfEnabled,
  recordFrame,
  recordRenderInfo,
  resetPerf,
  setPerfEnabled,
  startTimer
} from '../metrics'

// performance.now is the clock every timing here reads. Driving it by hand is
// what makes duration assertions exact rather than flaky.
let clock = 0
beforeEach(() => {
  clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  resetPerf()
  setPerfEnabled(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  setPerfEnabled(false)
  resetPerf()
})

const advance = (ms: number): void => {
  clock += ms
}

describe('startTimer — stage durations', () => {
  it('records one sample per timer, with its duration', () => {
    const end = startTimer('parse')
    advance(120)
    end()

    const { stages } = getReport()
    expect(stages.parse.count).toBe(1)
    expect(stages.parse.totalMs).toBe(120)
    expect(stages.parse.maxMs).toBe(120)
  })

  it('accumulates repeat calls and keeps the worst one', () => {
    // The COUNT is the point, not just the total. A scene load that rebuilds
    // geometry once per object shows up here as count=12 for a 12-object scene,
    // which is exactly the redundant work we are trying to remove — a total
    // alone would hide it behind "the scene is just big".
    for (const ms of [30, 90, 45]) {
      const end = startTimer('build')
      advance(ms)
      end()
    }

    const { stages } = getReport()
    expect(stages.build.count).toBe(3)
    expect(stages.build.totalMs).toBe(165)
    expect(stages.build.maxMs).toBe(90)
  })

  it('keeps concurrent timers of the same stage independent', () => {
    // Object geometry fetches overlap once they stop being sequential, so a
    // single module-level "start time" would report nonsense for all but the
    // last one to finish.
    const a = startTimer('fetch')
    advance(50)
    const b = startTimer('fetch')
    advance(25)
    a() // 75ms
    advance(10)
    b() // 35ms

    const { stages } = getReport()
    expect(stages.fetch.count).toBe(2)
    expect(stages.fetch.totalMs).toBe(110)
    expect(stages.fetch.maxMs).toBe(75)
  })

  it('ignores a timer ended twice', () => {
    const end = startTimer('parse')
    advance(10)
    end()
    end()

    expect(getReport().stages.parse.count).toBe(1)
  })
})

describe('disabled by default', () => {
  it('starts disabled so an unmeasured session pays nothing', () => {
    resetPerf()
    setPerfEnabled(false)
    expect(isPerfEnabled()).toBe(false)
  })

  it('records nothing at all while disabled', () => {
    setPerfEnabled(false)

    const end = startTimer('parse')
    advance(500)
    end()
    recordFrame(16)
    countBytes(1024)
    countGeometry({ primitives: 10, triangles: 20 })

    const report = getReport()
    expect(report.stages.parse.count).toBe(0)
    expect(report.frame.samples).toBe(0)
    expect(report.bytesFetched).toBe(0)
    expect(report.primitives).toBe(0)
  })

  it('hands back the SAME no-op timer while disabled, allocating nothing per call', () => {
    // startTimer sits in the parse loop's caller and on every frame. If it
    // allocated a fresh closure per call while switched off, the profiler would
    // be adding the garbage it exists to measure.
    setPerfEnabled(false)
    expect(startTimer('parse')).toBe(startTimer('build'))
  })
})

describe('frame times', () => {
  it('reports p50, p95 and max over the samples', () => {
    for (let i = 1; i <= 100; i++) recordFrame(i)

    const { frame } = getReport()
    expect(frame.samples).toBe(100)
    expect(frame.p50).toBe(50)
    expect(frame.p95).toBe(95)
    expect(frame.max).toBe(100)
  })

  it('reports zeroes rather than NaN when nothing has been sampled', () => {
    // The overlay renders this before the first frame lands; NaN in the UI is
    // indistinguishable from a broken probe.
    const { frame } = getReport()
    expect(frame).toEqual({ samples: 0, p50: 0, p95: 0, max: 0 })
  })

  it('keeps a bounded window so a long session cannot grow without limit', () => {
    for (let i = 0; i < 5000; i++) recordFrame(16)
    expect(getReport().frame.samples).toBeLessThanOrEqual(600)
  })

  it('measures the recent window, not the whole session', () => {
    // A 2000ms stall during load must not drag the idle p95 down for the rest of
    // the session — the ring buffer is what makes the number reflect NOW.
    recordFrame(2000)
    for (let i = 0; i < 600; i++) recordFrame(16)
    expect(getReport().frame.max).toBe(16)
  })
})

describe('scene-load wall clock', () => {
  it('measures from beginSceneLoad to endSceneLoad', () => {
    beginSceneLoad()
    advance(4200)
    endSceneLoad()
    expect(getReport().sceneLoadMs).toBe(4200)
  })

  it('is null until a load has finished', () => {
    expect(getReport().sceneLoadMs).toBeNull()
    beginSceneLoad()
    advance(100)
    expect(getReport().sceneLoadMs).toBeNull()
  })

  it('clears the previous load stats when a new load begins', () => {
    // Each load is its own measurement. Carrying the last one's stage counts
    // forward would make every reload look worse than the one before it.
    const end = startTimer('parse')
    advance(10)
    end()
    beginSceneLoad()

    expect(getReport().stages.parse.count).toBe(0)
  })
})

describe('geometry and transfer counters', () => {
  it('sums bytes and primitive counts across objects', () => {
    countBytes(1000)
    countBytes(2400)
    countGeometry({ primitives: 5, triangles: 8 })
    countGeometry({ primitives: 3, triangles: 6 })

    const report = getReport()
    expect(report.bytesFetched).toBe(3400)
    expect(report.primitives).toBe(8)
    expect(report.triangles).toBe(14)
  })
})

describe('renderer info', () => {
  it('keeps the latest sample from gl.info', () => {
    recordRenderInfo({ calls: 4, triangles: 900, geometries: 3, textures: 2, programs: 5 })
    recordRenderInfo({ calls: 6, triangles: 1200, geometries: 4, textures: 2, programs: 5 })

    expect(getReport().render).toEqual({
      calls: 6,
      triangles: 1200,
      geometries: 4,
      textures: 2,
      programs: 5
    })
  })

  it('is null before the first frame reports', () => {
    expect(getReport().render).toBeNull()
  })
})

describe('formatReport', () => {
  it('renders a copyable before/after block naming every stage', () => {
    beginSceneLoad()
    const end = startTimer('build')
    advance(80)
    end()
    advance(20)
    endSceneLoad()
    countBytes(1024 * 1024)
    countGeometry({ primitives: 2, triangles: 4 })
    recordFrame(16)

    const text = formatReport(getReport())
    expect(text).toContain('build')
    expect(text).toContain('x1')       // the call count is the headline for F2
    expect(text).toContain('1.0 MB')
    expect(text).toContain('100')      // scene load wall clock
  })
})
