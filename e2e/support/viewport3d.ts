/**
 * Verifying that geometry actually reached the 3D viewport.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * The 3D window is react-three-fiber drawing into a WebGL <canvas>. WebDriver
 * sees one opaque element: there is no DOM for meshes, no testid inside the
 * canvas, and nothing exposes the three.js scene or the Redux store on
 * `window`. Reading pixels back is no good either — the context is created
 * without preserveDrawingBuffer, so toDataURL() returns a blank image.
 *
 * ── What DOES work ────────────────────────────────────────────────────────
 * The renderer talks to the backend through axios, which resolves
 * `new XMLHttpRequest()` at call time — so every REST call is XHR. The ONE
 * exception is the 3D mesh download, which uses `fetch` directly because the
 * response is an ArrayBuffer rather than JSON (3DWindow/api/geometry.ts).
 * Patching `window.fetch` therefore captures the 3D pipeline and NOTHING ELSE.
 *
 * ── The route ─────────────────────────────────────────────────────────────
 * The viewport downloads meshes from `…/objects/{id}/geometry/gpu` (wire
 * format v2, 3DWindow/api/geometryV2.ts) while the geometry-format flag is
 * 'v2', which is the shipped default. `…/geometry/binary` (v1) is still
 * accepted so a flip back to v1 cannot silently blind every caller. A default
 * 10x10 / 1x1 ground is 1 primitive, 2 triangles and 4 vertices.
 *
 * ── The summary ───────────────────────────────────────────────────────────
 * For a v2 response the recorder also decodes, in the page, a summary per
 * part ("group" in v2): its texture path, whether it carries vertex colours,
 * and its average vertex colour. An untextured part carries its colour per
 * vertex and a textured part carries a texture path instead
 * (pyhelios_wrapper_context.cpp packGPUBuffers: has_colors = untextured ||
 * mask). That is the nearest thing to "what colour is this ground" WebDriver
 * can reach. Only the summary is kept, and responses over 8 MB are not decoded.
 *
 * It is still NOT proof of what was painted — treat it as "this geometry, in
 * this colour, reached the 3D layer".
 */

import { TIMEOUTS } from '../config/timeouts'

export type Rgb = [number, number, number]

export type MeshGroupSummary = {
  textureFile: string | null
  hasColors: boolean
  hasUVs: boolean
  vertexCount: number
  avgColor: Rgb | null
}

export type MeshSummary = {
  primitiveCount: number
  totalTris: number
  totalVerts: number
  groups: MeshGroupSummary[]
}

export type MeshCall = { status: number; bytes: number; url: string; summary: MeshSummary | null }

const RECORDER = '__e2eMeshCalls'
const MESH_FAULTS = '__e2eMeshFaults'

/** True when `url` is a mesh download for `objectId`, on either wire format. */
export function isMeshUrlFor(url: string, objectId: string): boolean {
  return (
    url.includes(`/objects/${objectId}/geometry/gpu`) ||
    url.includes(`/objects/${objectId}/geometry/binary`)
  )
}

/**
 * Start recording 3D mesh fetches. Idempotent — safe to call in a before hook
 * and again per test; the patch is installed once and the log is reset.
 *
 * A browser.refresh() drops the patch (fresh renderer), so re-arm after one.
 */
export async function recordMeshFetches(): Promise<void> {
  await browser.execute((key: string, MESH_FAULT_KEY: string) => {
    const w = window as never as Record<string, unknown>
    w[key] = []
    if (!w[MESH_FAULT_KEY]) w[MESH_FAULT_KEY] = []
    if (w[`${key}__patched`]) return
    w[`${key}__patched`] = true

    // The same layout 3DWindow/api/geometryV2.ts parseGpuBuffers reads: a
    // 16-byte header, one descriptor per group, padding to 4 bytes, then
    // positions f32x3 and colors f32x3 per vertex. Returns null for anything
    // that is not a well-formed v2 buffer.
    const summarise = (buf: ArrayBuffer) => {
      if (buf.byteLength < 16) return null
      const view = new DataView(buf)
      if (view.getUint8(0) !== 2) return null
      const groupCount = view.getUint16(2, true)
      const totalVerts = view.getUint32(4, true)
      const totalTris = view.getUint32(8, true)
      const primitiveCount = view.getUint32(12, true)
      const decoder = new TextDecoder()
      const descriptors: {
        vertexStart: number
        vertexCount: number
        textureFile: string | null
        flags: number
      }[] = []
      let offset = 16
      for (let i = 0; i < groupCount; i++) {
        if (offset + 19 > buf.byteLength) return null
        const vertexStart = view.getUint32(offset, true)
        const vertexCount = view.getUint32(offset + 4, true)
        const pathLen = view.getUint16(offset + 16, true)
        const flags = view.getUint8(offset + 18)
        offset += 19
        if (offset + pathLen > buf.byteLength) return null
        const textureFile =
          pathLen > 0 ? decoder.decode(new Uint8Array(buf, offset, pathLen)) : null
        offset += pathLen
        descriptors.push({ vertexStart, vertexCount, textureFile, flags })
      }
      const colorsAt = ((offset + 3) & ~3) + totalVerts * 12
      if (colorsAt + totalVerts * 12 > buf.byteLength) return null
      const colors = new Float32Array(buf, colorsAt, totalVerts * 3)
      return {
        primitiveCount,
        totalTris,
        totalVerts,
        groups: descriptors.map((d) => {
          let avgColor: [number, number, number] | null = null
          if (d.vertexCount > 0) {
            let r = 0
            let g = 0
            let b = 0
            for (let v = d.vertexStart; v < d.vertexStart + d.vertexCount; v++) {
              r += colors[v * 3]
              g += colors[v * 3 + 1]
              b += colors[v * 3 + 2]
            }
            avgColor = [r / d.vertexCount, g / d.vertexCount, b / d.vertexCount]
          }
          return {
            textureFile: d.textureFile,
            hasColors: (d.flags & 0x04) !== 0,
            hasUVs: (d.flags & 0x02) !== 0,
            vertexCount: d.vertexCount,
            avgColor
          }
        })
      }
    }

    const orig = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = typeof args[0] === 'string' ? args[0] : String(args[0])
      // Fault injection lives HERE rather than in support/faults.ts, which
      // patches XMLHttpRequest only. The mesh is the one thing in this app that
      // travels by fetch, so this wrapper is the only place that can fail it —
      // and failing it is the only way to reach the viewport's error banner.
      const faults = (w[MESH_FAULT_KEY] as string[] | undefined) ?? []
      if (faults.some((part) => url.includes(part))) {
        throw new TypeError(`Failed to fetch (e2e mesh fault): ${url}`)
      }
      const res = await orig(...args)
      let bytes = Number(res.headers.get('content-length') ?? -1)
      if (Number.isNaN(bytes)) bytes = -1
      const entry: { status: number; bytes: number; url: string; summary: unknown } = {
        status: res.status,
        bytes,
        url,
        summary: null
      }
      ;(w[key] as unknown[]).push(entry)
      if (res.status === 200 && url.includes('/geometry/gpu') && bytes <= 8_000_000) {
        res
          .clone()
          .arrayBuffer()
          .then((buf) => {
            entry.summary = summarise(buf)
          })
          .catch(() => {
            // The summary is optional; the recorded call stands without it.
          })
      }
      return res
    }
  }, RECORDER, MESH_FAULTS)
}

/** Everything recorded since the last recordMeshFetches(). */
export async function meshFetches(): Promise<MeshCall[]> {
  return (await browser.execute(
    (key: string) => (window as never as Record<string, MeshCall[]>)[key] ?? [],
    RECORDER
  )) as MeshCall[]
}

/**
 * Wait until the viewport has fetched a mesh for `objectId` with a 200.
 *
 * Uses MUTATION budget: the fetch only happens after the create or save has
 * returned, which means a real backend build has completed first.
 */
export async function waitForMeshFetch(
  objectId: string,
  timeout: number = TIMEOUTS.MUTATION
): Promise<MeshCall> {
  const found: { call: MeshCall | null } = { call: null }
  await browser.waitUntil(
    async () => {
      found.call =
        (await meshFetches()).find((c) => isMeshUrlFor(c.url, objectId) && c.status === 200) ??
        null
      return found.call !== null
    },
    {
      timeout,
      timeoutMsg:
        `the 3D viewport never fetched a mesh for object ${objectId}. ` +
        'Either the create failed (check for a 500 BUILD_FAILED — usually a stale ' +
        'libhelios), or the viewport stopped requesting geometry.'
    }
  )
  return found.call as MeshCall
}

/**
 * Wait for the NEWEST decoded mesh of `objectId` to satisfy `accept`.
 *
 * Only decoded v2 responses count. On a timeout the error carries the newest
 * summary seen, so a colour or texture mismatch reads as data, not a timeout.
 */
export async function waitForMeshSummary(
  objectId: string,
  accept: (summary: MeshSummary) => boolean = () => true,
  timeout: number = TIMEOUTS.MUTATION
): Promise<MeshSummary> {
  const state: { match: MeshSummary | null; last: MeshSummary | null } = { match: null, last: null }
  try {
    await browser.waitUntil(
      async () => {
        const decoded = (await meshFetches()).filter(
          (c) => isMeshUrlFor(c.url, objectId) && c.status === 200 && c.summary !== null
        )
        state.last = decoded.length ? decoded[decoded.length - 1].summary : null
        if (state.last !== null && accept(state.last)) {
          state.match = state.last
          return true
        }
        return false
      },
      { timeout }
    )
  } catch {
    throw new Error(
      `no decoded mesh for object ${objectId} matched the expectation within ${timeout}ms. ` +
        `Newest decoded summary: ${JSON.stringify(state.last)}`
    )
  }
  return state.match as MeshSummary
}

/** The single untextured, coloured part's average colour, or null. */
export function solidColour(summary: MeshSummary): Rgb | null {
  const coloured = summary.groups.filter((g) => g.hasColors && g.textureFile === null)
  return coloured.length === 1 ? coloured[0].avgColor : null
}

/** Every texture path the mesh is drawn with. */
export function textureFiles(summary: MeshSummary): string[] {
  return summary.groups
    .map((g) => g.textureFile)
    .filter((t): t is string => t !== null)
}

/** The engine's default tile colour is (0, 0.75, 0). */
export const isGreen = (c: Rgb | null): boolean =>
  c !== null && c[1] >= 0.6 && c[0] <= 0.1 && c[2] <= 0.1
export const isRed = (c: Rgb | null): boolean =>
  c !== null && c[0] >= 0.9 && c[1] <= 0.1 && c[2] <= 0.1
export const isBlue = (c: Rgb | null): boolean =>
  c !== null && c[2] >= 0.9 && c[0] <= 0.1 && c[1] <= 0.1

/**
 * Make the mesh fetch fail for any URL containing `urlPart`.
 *
 * Throws a TypeError from fetch, which is exactly what a real network failure
 * produces, so the saga's own catch runs and dispatches LOAD_SCENE_FAILED.
 *
 * Requires recordMeshFetches() to have installed the patch first. Like every
 * renderer-side patch in this suite, a browser.refresh() drops it.
 */
export async function installMeshFault(urlPart: string): Promise<void> {
  await recordMeshFetches()
  await browser.execute(
    (key: string, part: string) => {
      const w = window as never as Record<string, unknown>
      const rules = (w[key] as string[] | undefined) ?? []
      rules.push(part)
      w[key] = rules
    },
    MESH_FAULTS,
    urlPart
  )
}

/** Remove every mesh fault. The patch stays installed but matches nothing. */
export async function clearMeshFaults(): Promise<void> {
  await browser
    .execute((key: string) => {
      ;(window as never as Record<string, unknown>)[key] = []
    }, MESH_FAULTS)
    .catch(() => {
      // The renderer may have been refreshed away; nothing to clear.
    })
}
