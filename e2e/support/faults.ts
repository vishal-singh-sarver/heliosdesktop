/**
 * Making backend calls fail on demand.
 *
 * ── Why XHR and not fetch ─────────────────────────────────────────────────
 * The renderer talks to the backend through axios, whose default adapter chain
 * resolves `new XMLHttpRequest()` from global scope at call time. In a browser
 * XHR always wins, so EVERY REST call is an XHR. `window.fetch` carries exactly
 * one thing — the 3D binary mesh. Patching fetch would therefore intercept the
 * viewport and nothing else, and any spec built on it would pass vacuously.
 * So: patch XMLHttpRequest.prototype.open.
 *
 * ── Why redirect rather than fake a response ──────────────────────────────
 * Rewriting the URL to a dead port produces a REAL connection failure, which
 * gives axios a genuine `status 0` and drives the saga's real failure branch.
 * Synthesising a response means shadowing readonly properties (status,
 * responseText, readyState) and keeping that shim in step with axios internals
 * — brittle, and it tests the shim as much as the app.
 *
 * ── Why status 0 is the SAFE choice here ──────────────────────────────────
 * utils/scopeError.ts classifies a failure as "your project is gone" ONLY on a
 * 404. A connection failure is status 0, so an injected fault can never raise
 * the blocking go-Home dialog and eject the test from its project. Faking a 404
 * would.
 *
 * ── Lifetime ──────────────────────────────────────────────────────────────
 * A leaked fault poisons every later test in the file, so prefer withApiFault()
 * and keep a defensive clearApiFaults() in afterEach. A browser.refresh() also
 * clears it — the patch lives in the renderer, so it is fail-safe by
 * construction.
 */

const KEY = '__e2eApiFaults'

/**
 * Fail matching requests.
 *
 * @param method  HTTP verb to match, e.g. 'DELETE'. '*' matches any.
 * @param urlPart Substring of the URL to match, e.g. '/geometry/binary'.
 */
export async function installApiFault(method: string, urlPart: string): Promise<void> {
  await browser.execute(
    (key: string, m: string, u: string) => {
      const w = window as never as Record<string, unknown>
      const rules = (w[key] as { method: string; urlPart: string }[] | undefined) ?? []
      rules.push({ method: m.toUpperCase(), urlPart: u })
      w[key] = rules
      if (w[`${key}__patched`]) return
      w[`${key}__patched`] = true

      const orig = XMLHttpRequest.prototype.open
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string, ...rest: any[]) {
        const active = (w[key] as { method: string; urlPart: string }[] | undefined) ?? []
        const hit = active.some(
          (r) => (r.method === '*' || r.method === method.toUpperCase()) && url.includes(r.urlPart)
        )
        // Port 9 is the discard protocol: nothing listens, so the connection
        // fails immediately and deterministically rather than hanging.
        const target = hit ? url.replace(/^https?:\/\/[^/]+/, 'http://127.0.0.1:9') : url
        // eslint-disable-next-line prefer-spread
        return (orig as never as (...a: unknown[]) => unknown).apply(this, [method, target, ...rest])
      } as never
    },
    KEY,
    method,
    urlPart
  )
}

/** Remove every rule. The patch itself stays installed but matches nothing. */
export async function clearApiFaults(): Promise<void> {
  await browser
    .execute((key: string) => {
      ;(window as never as Record<string, unknown>)[key] = []
    }, KEY)
    .catch(() => {
      // The renderer may have been refreshed away; nothing to clear.
    })
}

/** Run `fn` with a fault installed, clearing it even if `fn` throws. */
export async function withApiFault<T>(
  method: string,
  urlPart: string,
  fn: () => Promise<T>
): Promise<T> {
  await installApiFault(method, urlPart)
  try {
    return await fn()
  } finally {
    await clearApiFaults()
  }
}
