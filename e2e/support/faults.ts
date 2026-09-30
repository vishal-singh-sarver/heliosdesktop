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

/**
 * ── Making backend calls SLOW on demand ───────────────────────────────────
 *
 * Failing a request and delaying one are different tools. Faults prove the
 * error branch; latency is the only way to observe a TRANSIENT state at all.
 *
 * Why this is needed: a project boot completes in 64-97ms end to end (measured
 * from the app's own `[boot] … total Nms` telemetry). The "Opening" dialog, its
 * progress bar and its Cancel button are therefore on screen for well under a
 * tenth of a second, and no WebDriver poll can catch them. The same is true of
 * every other loading/busy state in the app — the disabled Save, the row
 * spinner, the "Deleting…" label. Without a way to slow a request down, none of
 * them is testable, which is exactly why none of them is tested today.
 *
 * Implementation notes:
 *  - This patches `send`, not `open`, and keeps its own rule list and patch
 *    flag. It therefore COMPOSES with installApiFault rather than editing it —
 *    both wrap `open`, each calling the previous implementation, so a request
 *    can be delayed and faulted at once if a test wants that.
 *  - `open` is wrapped only to record the method and URL on the request object;
 *    `send` has no arguments that carry them.
 *  - Same lifetime rules as faults: a browser.refresh() drops the patch, so
 *    prefer withApiLatency() and keep a defensive clearApiLatency() in afterEach.
 *  - Each rule also COUNTS the requests it holds (`hits`, read with
 *    apiLatencyHits). That is what lets a test say "exactly one request was
 *    sent" about a busy state it is holding open — see the double-click guard
 *    tests in homepage.test.ts.
 */

const LATENCY_KEY = '__e2eApiLatency'
const SSE_LATENCY_KEY = '__e2eSseLatency'

type LatencyRule = { method: string; urlPart: string; ms: number; hits?: number; released?: number }

/**
 * Delay matching REST requests by `ms` before they are actually sent.
 *
 * @param method  HTTP verb to match, e.g. 'GET'. '*' matches any.
 * @param urlPart Substring of the URL to match, e.g. '/api/project/'.
 */
export async function installApiLatency(method: string, urlPart: string, ms: number): Promise<void> {
  await browser.execute(
    (key: string, m: string, u: string, delay: number) => {
      const w = window as never as Record<string, unknown>
      const rules = (w[key] as LatencyRule[] | undefined) ?? []
      rules.push({ method: m.toUpperCase(), urlPart: u, ms: delay, hits: 0, released: 0 })
      w[key] = rules
      if (w[`${key}__patched`]) return
      w[`${key}__patched`] = true

      type Tagged = XMLHttpRequest & { __e2eMethod?: string; __e2eUrl?: string }

      const origOpen = XMLHttpRequest.prototype.open
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      XMLHttpRequest.prototype.open = function (this: Tagged, method: string, url: string, ...rest: any[]) {
        this.__e2eMethod = String(method).toUpperCase()
        this.__e2eUrl = String(url)
        // eslint-disable-next-line prefer-spread
        return (origOpen as never as (...a: unknown[]) => unknown).apply(this, [method, url, ...rest])
      } as never

      const origSend = XMLHttpRequest.prototype.send
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      XMLHttpRequest.prototype.send = function (this: Tagged, ...args: any[]) {
        const active = (w[key] as LatencyRule[] | undefined) ?? []
        const rule = active.find(
          (r) =>
            (r.method === '*' || r.method === this.__e2eMethod) &&
            (this.__e2eUrl ?? '').includes(r.urlPart)
        )
        const fire = (): void => {
          try {
            ;(origSend as never as (...a: unknown[]) => unknown).apply(this, args)
          } catch {
            /* the request was aborted while we were holding it — nothing to do */
          }
        }
        if (!rule) return fire()
        // Counted when send() is CALLED, before the hold, so a second request
        // is visible the moment the app issues it — not seconds later.
        rule.hits = (rule.hits ?? 0) + 1
        setTimeout(() => {
          rule.released = (rule.released ?? 0) + 1
          fire()
        }, rule.ms)
        return undefined
      } as never
    },
    LATENCY_KEY,
    method,
    urlPart,
    ms
  )
}

/**
 * How many requests the latency rule(s) for exactly this method + urlPart have
 * held since they were installed.
 *
 * The count lives in the renderer beside the rule, so it dies with it:
 * clearApiLatency(), withApiLatency()'s cleanup, and any browser.refresh() or
 * reloadToHome() all reset it. Install AFTER any reload, before the action, and
 * read BEFORE clearing. A request is credited to the FIRST rule that matches it,
 * so install one method-specific rule per request you count. Returns 0 (never
 * undefined) when no such rule exists, so `toBe(1)` fails with a clear reason.
 */
export async function apiLatencyHits(method: string, urlPart: string): Promise<number> {
  return latencyCount(method, urlPart, 'hits')
}

/**
 * How many of those held requests have been LET GO (their hold expired and they
 * were actually sent). Same lifetime and matching as apiLatencyHits.
 *
 * Tells "the hold ran out before the test looked" apart from "the app never went
 * busy": the first is a timing problem, the second a product regression, and
 * they otherwise fail with the same message.
 */
export async function apiLatencyReleased(method: string, urlPart: string): Promise<number> {
  return latencyCount(method, urlPart, 'released')
}

async function latencyCount(
  method: string,
  urlPart: string,
  field: 'hits' | 'released'
): Promise<number> {
  return browser.execute(
    (key: string, m: string, u: string, f: 'hits' | 'released') => {
      const rules = ((window as never as Record<string, unknown>)[key] as LatencyRule[] | undefined) ?? []
      return rules
        .filter((r) => r.method === m && r.urlPart === u)
        .reduce((sum, r) => sum + (r[f] ?? 0), 0)
    },
    LATENCY_KEY,
    method.toUpperCase(),
    urlPart,
    field
  )
}

/**
 * Stagger the `message` events of a matching EventSource, so a stream that
 * normally completes in milliseconds stays observable.
 *
 * Event N is delayed by `ms * N` rather than a flat `ms`: a flat delay shifts
 * the whole stream and the dialog still flashes past, whereas staggering
 * actually holds it open and lets the caption and percentage advance between
 * polls. Ordering is preserved because the delay grows monotonically.
 *
 * Targets the `onmessage` SETTER specifically — utils/sse.ts assigns
 * `source.onmessage = …` rather than using addEventListener, so wrapping
 * addEventListener alone would do nothing. `onerror` is deliberately untouched:
 * it is the channel's END signal and delaying it would change control flow.
 */
export async function installSseLatency(urlPart: string, ms: number): Promise<void> {
  await browser.execute(
    (key: string, u: string, delay: number) => {
      const w = window as never as Record<string, unknown>
      const rules = (w[key] as { urlPart: string; ms: number }[] | undefined) ?? []
      rules.push({ urlPart: u, ms: delay })
      w[key] = rules
      if (w[`${key}__patched`]) return
      w[`${key}__patched`] = true

      // A FUNCTION constructor that returns a real EventSource, not a subclass.
      //
      // `class Delayed extends EventSource` with an overridden onmessage
      // accessor looks cleaner and does not work here: assigning through
      // `super.onmessage` inside a setter did not reach the native setter in
      // this Electron build, so the wrapper silently never applied and the
      // stream ran at full speed. Returning an object from a constructor
      // overrides `this`, which lets us hand back a genuine EventSource with
      // the accessor redefined on the INSTANCE — no inheritance involved.
      const Orig = window.EventSource
      const proto = Orig.prototype
      const nativeDesc = Object.getOwnPropertyDescriptor(proto, 'onmessage')

      function Delayed(this: unknown, url: string | URL, init?: EventSourceInit): EventSource {
        const src = new Orig(url, init)
        const active = (w[key] as { urlPart: string; ms: number }[] | undefined) ?? []
        const rule = active.find((r) => String(url).includes(r.urlPart))
        const ms = rule ? rule.ms : 0
        if (ms > 0 && nativeDesc && nativeDesc.set && nativeDesc.get) {
          let seq = 0
          Object.defineProperty(src, 'onmessage', {
            configurable: true,
            enumerable: true,
            get() {
              return nativeDesc.get?.call(src)
            },
            set(fn: unknown) {
              if (typeof fn !== 'function') {
                nativeDesc.set?.call(src, fn)
                return
              }
              nativeDesc.set?.call(src, (ev: MessageEvent) => {
                seq += 1
                setTimeout(() => (fn as (e: MessageEvent) => void).call(src, ev), ms * seq)
              })
            }
          })
        }
        return src
      }
      Delayed.prototype = proto
      w['EventSource'] = Delayed
    },
    SSE_LATENCY_KEY,
    urlPart,
    ms
  )
}

/** Remove every latency rule. The patches stay installed but match nothing. */
export async function clearApiLatency(): Promise<void> {
  await browser
    .execute(
      (key: string, sseKey: string) => {
        const w = window as never as Record<string, unknown>
        w[key] = []
        w[sseKey] = []
      },
      LATENCY_KEY,
      SSE_LATENCY_KEY
    )
    .catch(() => {
      // The renderer may have been refreshed away; nothing to clear.
    })
}

/** Run `fn` with REST latency installed, clearing it even if `fn` throws. */
export async function withApiLatency<T>(
  method: string,
  urlPart: string,
  ms: number,
  fn: () => Promise<T>
): Promise<T> {
  await installApiLatency(method, urlPart, ms)
  try {
    return await fn()
  } finally {
    await clearApiLatency()
  }
}
