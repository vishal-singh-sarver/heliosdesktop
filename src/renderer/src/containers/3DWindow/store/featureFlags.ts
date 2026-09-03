import { GEOMETRY_FORMAT_KEY } from 'utils/storageKeys'

/**
 * Which geometry wire format the viewport asks for.
 *
 * Defaults to v1. The v2 path is a different backend route, a different reader
 * and a different mesh shape, so it ships switched off until it has been run
 * against real scenes — and leaving both live is what makes an A/B possible at
 * all: same scene, same machine, one flag.
 *
 * Read from localStorage rather than a build constant so a comparison does not
 * need a rebuild between runs:
 *
 *   __heliosPerf.gpuOn()   // then reload the scenario
 *   __heliosPerf.gpuOff()
 */
export type GeometryFormat = 'v1' | 'v2'

let override: GeometryFormat | null = null

export function getGeometryFormat(): GeometryFormat {
  if (override) return override
  try {
    return localStorage.getItem(GEOMETRY_FORMAT_KEY) === 'v2' ? 'v2' : 'v1'
  } catch {
    // Private windows and the test environment both throw here; v1 is the safe
    // answer because it is the path that has always shipped.
    return 'v1'
  }
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
