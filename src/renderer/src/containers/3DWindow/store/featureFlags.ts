import { GEOMETRY_FORMAT_KEY } from 'utils/storageKeys'

/**
 * Which geometry wire format the viewport asks for.
 *
 * The v2 path is a different backend route, a different reader and a different
 * mesh shape, so both stay live: that is what makes an A/B possible at all —
 * same scene, same machine, one flag.
 *
 * Resolved in three layers, most specific first:
 *
 *   1. an in-memory override, for this session only
 *   2. localStorage, so a comparison needs a reload rather than a rebuild
 *   3. VITE_GEOMETRY_FORMAT, baked in by Vite at build time
 *
 * Layer 3 is what ships a packaged app on v2 without asking every user to type
 * into a console. Layer 2 still beats it, deliberately: a v2 build that turns
 * out to render something wrong on a particular machine can be put back on v1
 * from DevTools, with no new build and no downgrade.
 *
 *   __heliosPerf.gpuOn()   // then reload the scenario
 *   __heliosPerf.gpuOff()
 */
export type GeometryFormat = 'v1' | 'v2'

let override: GeometryFormat | null = null

/**
 * Baked in at build time. Anything other than an explicit "v2" means v1 — a
 * typo in the env file must not silently ship the newer path.
 */
const BUILD_DEFAULT: GeometryFormat =
  import.meta.env.VITE_GEOMETRY_FORMAT === 'v2' ? 'v2' : 'v1'

export function getGeometryFormat(): GeometryFormat {
  if (override) return override
  try {
    // Both values are matched explicitly rather than testing for "v2" alone: a
    // v2 BUILD has to be switchable back to v1 at runtime, and a truthy check
    // cannot express "the user chose v1".
    const stored = localStorage.getItem(GEOMETRY_FORMAT_KEY)
    if (stored === 'v2') return 'v2'
    if (stored === 'v1') return 'v1'
  } catch {
    // Private windows and the test environment both throw here; fall through to
    // whatever the build chose.
  }
  return BUILD_DEFAULT
}

export function setGeometryFormat(format: GeometryFormat): void {
  override = format
  try {
    localStorage.setItem(GEOMETRY_FORMAT_KEY, format)
  } catch {
    // Non-fatal: the in-memory override still applies for this session.
  }
}

/** Test seam — drops the in-memory override so the next read hits storage. */
export function resetGeometryFormat(): void {
  override = null
}
