import { ApiError } from 'utils/api'
import { BASE_URL } from 'utils/constants'
import { getSessionId } from 'utils/session'
import type { GpuGeometry } from './geometryV2'
import { parseGpuBuffers } from './geometryV2'
import type { PrimitiveInfo, Vec2UV, Vec3 } from '../models/types'
import { countBytes, countGeometry, startTimer } from '../perf/metrics'
import { GEOMETRY_ROUTES } from './endpoints'

/**
 * Parse the backend's binary geometry wire format into PrimitiveInfo[].
 */
/**
 * Raised when the buffer runs out mid-primitive.
 *
 * Without this the failure surfaced as a bare RangeError thrown from inside
 * DataView, naming neither the object nor the byte — nothing to act on. A
 * truncated response is rare but it is exactly the case where a useful message
 * saves an afternoon.
 */
class GeometryParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeometryParseError'
  }
}

interface ParsedGeometry {
  primitives: PrimitiveInfo[]
  /** Tallied during the walk below — see the note at the return. */
  triangles: number
}

function parseBinaryPrimitives(buffer: ArrayBuffer): ParsedGeometry {
  const view = new DataView(buffer)
  let offset = 0

  // Every read is preceded by this. The wire format is a walk driven by lengths
  // read out of the stream itself, so a single bad length would otherwise send
  // the cursor off the end of the buffer.
  //
  // `what` must be a plain string constant, never a template literal. This runs
  // several times per primitive, and an interpolated argument is built BEFORE
  // the call — so passing `primitive ${i} header` allocated a fresh string on
  // every primitive whether or not anything was wrong. On a large ground that
  // was hundreds of thousands of throwaway strings for a message that never
  // fires, and it made adding a ground visibly slower. The sentence is now
  // assembled only when it is about to be thrown.
  const need = (bytes: number, index: number, what: string): void => {
    if (offset + bytes > buffer.byteLength) {
      throw new GeometryParseError(
        `Geometry data is truncated at primitive ${index} (${what}): needed ${bytes} more ` +
          `byte(s) at offset ${offset}, buffer is ${buffer.byteLength} byte(s).`
      )
    }
  }

  if (buffer.byteLength < 4) {
    throw new GeometryParseError(
      `Geometry data is truncated: ${buffer.byteLength} byte(s), too short to hold a primitive count.`
    )
  }
  const count = view.getUint32(offset, true)
  offset += 4

  const primitives: PrimitiveInfo[] = new Array(count)
  let triangles = 0
  for (let i = 0; i < count; i++) {
    need(8, i, 'header')
    const uuid = view.getInt32(offset, true)
    offset += 4
    const vertexCount = view.getUint32(offset, true)
    offset += 4

    if (vertexCount >= 3) triangles += vertexCount - 2

    need(vertexCount * 12, i, 'vertices')
    const vertices: Vec3[] = new Array(vertexCount)
    for (let v = 0; v < vertexCount; v++) {
      vertices[v] = {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true)
      }
      offset += 12
    }

    need(12, i, 'colour')
    const r = view.getFloat32(offset, true)
    const g = view.getFloat32(offset + 4, true)
    const b = view.getFloat32(offset + 8, true)
    offset += 12

    need(2, i, 'texture path length')
    const texPathLen = view.getUint16(offset, true)
    offset += 2

    let textureFile: string | undefined
    let textureMaskMode = false
    let uvs: Vec2UV[] | undefined

    if (texPathLen > 0) {
      need(texPathLen, i, 'texture path')
      const pathBytes = new Uint8Array(buffer, offset, texPathLen)
      let rawPath = new TextDecoder().decode(pathBytes)
      offset += texPathLen

      if (rawPath.startsWith('mask:')) {
        textureMaskMode = true
        rawPath = rawPath.substring(5)
      }
      textureFile = rawPath

      need(vertexCount * 8, i, 'texture coordinates')
      uvs = new Array(vertexCount)
      for (let vi = 0; vi < vertexCount; vi++) {
        uvs[vi] = {
          u: view.getFloat32(offset, true),
          v: view.getFloat32(offset + 4, true)
        }
        offset += 8
      }
    }

    primitives[i] = {
      uuid,
      vertices,
      color: { r, g, b },
      textureFile,
      textureMaskMode: textureMaskMode || undefined,
      uvs
    }
  }

  // Counted INSIDE the walk rather than by a second pass over the result.
  // A separate tally re-traverses the whole primitive graph at the exact moment
  // it is largest — 2.75 GB at a 2000x2000 ground — and on a machine that has
  // started swapping, touching every one of those objects again is far more
  // expensive than the arithmetic suggests. Two adds in a loop that already
  // performs ~20 DataView reads per primitive costs nothing measurable.
  return { primitives, triangles }
}

// Requests that have STARTED but not yet settled, keyed by path.
//
// Two callers asking for the same object at the same moment would otherwise
// each start their own download. On a 231 MB scene that is the same bytes
// pulled twice, parsed twice, and queued twice behind the backend's per-
// scenario lock. The second caller joins the first instead.
//
// This mirrors the in-flight guard in ui/textureCache.ts, which exists on the
// texture path for exactly this reason — the geometry path never got one.
//
// Callers share the SAME array. Nothing mutates a parsed result today (it is
// stored in sceneCache and read for rendering), and nothing should start.
interface InFlightRequest {
  // `unknown` because v1 and v2 parse to different shapes. They never collide:
  // the map is keyed by PATH and the two formats live on different routes, so a
  // joined caller always gets the shape it asked for.
  promise: Promise<unknown>
  // Superseding a request is the only thing that aborts it. See the note on
  // fetchBinaryGeometry for why nothing else may.
  controller: AbortController
}

const inFlight = new Map<string, InFlightRequest>()

// Second index over the same entries, so a caller that only knows which object
// it is hiding can cancel that object's download without having to look up the
// project and scenario ids to rebuild the URL.
const inFlightByObject = new Map<number, string>()

/**
 * True for the rejection a deliberately cancelled request produces.
 *
 * A superseded download is not a failure — the newer request that replaced it
 * owns the scene now — so callers must tell this apart from a real network error
 * and stay quiet rather than showing the user an error for work we cancelled
 * ourselves.
 */
export function isGeometryAborted(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError'
}

/**
 * Fetch binary geometry from a URL path. Uses fetch (not utils/api) because
 * the response is a binary ArrayBuffer, not JSON.
 *
 * There is no timeout and there must not be one: a high-resolution mesh is
 * legitimately slow to serve, and cutting it off on a clock failed loads that
 * would have completed. Matches utils/api, which carries no timeout either.
 *
 * The abort signal is for one case only — a newer request for the SAME object
 * has replaced this one. Those bytes were already going to be thrown away by the
 * staleness token in store/sceneCache, and a ground at 1000×1000 is 228 MB, so
 * letting it run to completion cost the network and the backend's per-scenario
 * lock for a result nobody would read. Cancelling on supersede is free;
 * cancelling on a clock is the thing that broke.
 */
async function fetchBinaryGeometry<T>(
  path: string,
  objectId: number | undefined,
  decode: (buffer: ArrayBuffer) => T
): Promise<T> {
  const joined = inFlight.get(path)
  if (joined) return joined.promise as Promise<T>

  const controller = new AbortController()

  const promise = (async (): Promise<T> => {
    // Timed separately because they fail for different reasons and are fixed by
    // different changes: `fetch` is the backend's packing plus transfer, `parse`
    // is main-thread work in this process. Conflating them hid which half of a
    // slow load was actually slow.
    //
    // Neither timer settles on the throw paths, deliberately — an aborted or
    // failed request is not a sample of how long a load takes.
    const endFetch = startTimer('fetch')

    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'session-id': getSessionId() },
      signal: controller.signal
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ApiError(res.status, body || res.statusText || `Failed to load geometry: ${path}`)
    }

    const buffer = await res.arrayBuffer()
    endFetch()
    countBytes(buffer.byteLength)

    const endParse = startTimer('parse')
    const decoded = decode(buffer)
    endParse()

    return decoded
  })()

  const entry: InFlightRequest = { promise, controller }
  inFlight.set(path, entry)
  if (objectId !== undefined) inFlightByObject.set(objectId, path)

  try {
    return (await promise) as T
  } finally {
    // Cleared once settled, success or failure, so a retry starts a fresh
    // request rather than replaying a stale rejection.
    //
    // Only if the entry is still OURS. A superseded request may settle after its
    // replacement started, and deleting unconditionally would drop the entry that
    // took its place — losing the dedupe for everyone who asked afterwards.
    if (inFlight.get(path) === entry) {
      inFlight.delete(path)
      if (objectId !== undefined && inFlightByObject.get(objectId) === path) {
        inFlightByObject.delete(objectId)
      }
    }
  }
}

/**
 * Cancel the download in flight for one object and forget it.
 *
 * Two callers need this. An EDIT needs it because the dedupe above would
 * otherwise hand it the request that started before the edit — that is what made
 * saving a ground's properties mid-download repaint the viewport with the
 * pre-save shape and look like the save had done nothing. A HIDE needs it
 * because the correct result for a hidden object is no geometry at all, so the
 * remaining bytes are pure waste.
 *
 * Safe to call when nothing is running.
 */
export function abortObjectGeometry(objectId: number): void {
  const path = inFlightByObject.get(objectId)
  if (path === undefined) return

  const entry = inFlight.get(path)
  inFlightByObject.delete(objectId)
  if (!entry) return

  // Dropped from the map BEFORE the abort so the rejection it triggers cannot
  // find the entry and delete a replacement that has since taken this slot.
  inFlight.delete(path)
  entry.controller.abort()
}

/** Fetch and parse one object's geometry (wire format v1). */
export async function fetchObjectGeometryBinary(
  projectId: string,
  scenarioId: string,
  objectId: number
): Promise<PrimitiveInfo[]> {
  const path = GEOMETRY_ROUTES.objectGeometryBinary(projectId, scenarioId, objectId)
  return fetchBinaryGeometry(path, objectId, (buffer) => {
    const { primitives, triangles } = parseBinaryPrimitives(buffer)
    countGeometry({ primitives: primitives.length, triangles })
    return primitives
  })
}

/**
 * Fetch one object's geometry as GPU-ready typed arrays (wire format v2).
 *
 * Shares the in-flight dedupe and the abort handling above, deliberately: those
 * guard real bugs — a save landing on a superseded download, a hidden object's
 * 228 MB continuing to arrive — and a second fetch path that quietly skipped
 * them would reintroduce both.
 *
 * Returns null when the object has no primitives, which the backend serves as an
 * empty body.
 */
export async function fetchObjectGeometryGpu(
  projectId: string,
  scenarioId: string,
  objectId: number
): Promise<GpuGeometry | null> {
  const path = GEOMETRY_ROUTES.objectGeometryGpu(projectId, scenarioId, objectId)
  return fetchBinaryGeometry(path, objectId, (buffer) => {
    const gpu = parseGpuBuffers(buffer)
    if (gpu) countGeometry({ primitives: gpu.primitiveCount, triangles: gpu.totalTris })
    return gpu
  })
}
