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
 * exception is the 3D binary mesh download, which uses `fetch` directly
 * because the response is an ArrayBuffer rather than JSON
 * (3DWindow/api/geometry.ts). Patching `window.fetch` therefore captures the
 * 3D pipeline and NOTHING ELSE — anything recorded here is, by construction,
 * the viewport asking the backend for built geometry.
 *
 * A recorded `200` on `.../objects/{id}/geometry/binary` with a non-empty body
 * is real end-to-end evidence: the backend built the tile through libhelios
 * and the viewport fetched it. Measured for a default 10x10 / 1x1 ground: 269
 * bytes. It is NOT proof that the mesh was painted — nothing available to
 * WebDriver can prove that — so treat it as "the geometry reached the 3D
 * layer", which is the strongest claim this harness can honestly make.
 *
 * Failure modes it genuinely catches: a stale libhelios.dll (the create 500s
 * with BUILD_FAILED and no mesh is ever fetched), a broken scene-object
 * registration, and a viewport that stops requesting geometry at all.
 */

import { TIMEOUTS } from '../config/timeouts'

type MeshCall = { status: number; bytes: number; url: string }

const RECORDER = '__e2eMeshCalls'

/**
 * Start recording 3D mesh fetches. Idempotent — safe to call in a before hook
 * and again per test; the patch is installed once and the log is reset.
 *
 * A browser.refresh() drops the patch (fresh renderer), so re-arm after one.
 */
export async function recordMeshFetches(): Promise<void> {
  await browser.execute((key: string) => {
    const w = window as never as Record<string, unknown>
    w[key] = []
    if (w[`${key}__patched`]) return
    w[`${key}__patched`] = true
    const orig = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = typeof args[0] === 'string' ? args[0] : String(args[0])
      const res = await orig(...args)
      let bytes = Number(res.headers.get('content-length') ?? -1)
      if (Number.isNaN(bytes)) bytes = -1
      ;(w[key] as MeshCall[]).push({ status: res.status, bytes, url })
      return res
    }
  }, RECORDER)
}

/** Everything recorded since the last recordMeshFetches(). */
export async function meshFetches(): Promise<MeshCall[]> {
  return (await browser.execute(
    (key: string) => (window as never as Record<string, MeshCall[]>)[key] ?? [],
    RECORDER
  )) as MeshCall[]
}

/**
 * Wait until the viewport has fetched a non-empty mesh for `objectId`.
 *
 * Uses MUTATION budget: the fetch only happens after the create POST has
 * returned, which means a real backend build (libhelios) has completed first.
 */
export async function waitForMeshFetch(
  objectId: string,
  timeout = TIMEOUTS.MUTATION
): Promise<MeshCall> {
  let found: MeshCall | undefined
  await browser.waitUntil(
    async () => {
      found = (await meshFetches()).find(
        (c) => c.url.includes(`/objects/${objectId}/geometry/binary`) && c.status === 200
      )
      return found !== undefined
    },
    {
      timeout,
      timeoutMsg:
        `the 3D viewport never fetched a mesh for object ${objectId}. ` +
        'Either the create failed (check for a 500 BUILD_FAILED — usually a stale ' +
        'libhelios.dll), or the viewport stopped requesting geometry.'
    }
  )
  return found as MeshCall
}
