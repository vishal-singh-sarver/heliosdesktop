/**
 * The 3D viewport: its two toolbars, the scene-statistics overlay, the scene
 * selector, and the loading / error states.
 *
 * ── Why the stats overlay is the point of this page object ────────────────
 *
 * WebDriver cannot see inside a WebGL canvas, and toDataURL() returns blank
 * (the app never sets preserveDrawingBuffer). But the viewport renders its
 * scene contents as plain DOM text behind the stats toggle, so `Objects`,
 * `Primitives` and `Triangles` are a readable proxy for "what is actually in
 * the scene" — the oracle the suite has never had.
 *
 * ── THE STALENESS PROTOCOL — read this before using readStats() ───────────
 *
 * The overlay is NOT self-refreshing. Its useMemo deps are
 * `[showStats, objects.length, sceneLoad]`, but the primitive counts come from
 * a module-level Map that changes independently of all three:
 *
 *   - HIDE and DELETE evict synchronously, in the same dispatch as the reducer,
 *     so `objects.length` changes and the memo recomputes. These are correct.
 *   - CREATE and UN-HIDE re-fetch ASYNCHRONOUSLY and land via
 *     `objectGeometryCached`, whose reducer touches only `draft.scene`
 *     (geometryVersion) and never `draft.sceneLoad`. Immer therefore returns the
 *     identical sceneLoad reference, NO dep changes, and the memo never re-runs.
 *     The overlay keeps reporting `Primitives: 0` for a ground that is visible
 *     and rendered.
 *
 * `showStats` IS a dep, so closing and reopening the overlay forces a recompute
 * against the live cache. readStats() therefore ALWAYS re-toggles. Never read
 * the overlay across a mutation without it — that is exactly how this oracle
 * would produce false passes.
 *
 * (The product fix would be adding `scene.geometryVersion` to the dep array;
 * SceneContent.tsx already does precisely that for the same reason. Out of scope
 * here — it is beyond a testid-only change.)
 *
 * ── Layout traps ──────────────────────────────────────────────────────────
 *
 *  - The stats overlay (left-3 top-10) paints OVER the top of the left toolbar
 *    (left-2 top-14), covering Layers and Zoom in. Close it before driving those.
 *  - The loading overlay is `inset-0 z-20` and covers the whole canvas, so it
 *    intercepts clicks. Prefer focusCanvas(), which focuses via JS.
 */
import { TIMEOUTS } from '../config/timeouts'

type El = ReturnType<typeof $>

export interface SceneStats {
  objects: number
  primitives: number
  triangles: number
  vertices: number
  /** Absent from the DOM entirely when zero, so null rather than 0. */
  quads: number | null
}

class Viewport3DPage {
  // ----- Left toolbar (gated on objects.length > 0 && !showLoader) -----
  get toolbar(): El {
    return $('[data-testid="viewport-toolbar"]')
  }
  get zoomIn(): El {
    return $('[data-testid="viewport-zoom-in"]')
  }
  get zoomOut(): El {
    return $('[data-testid="viewport-zoom-out"]')
  }
  get resetView(): El {
    return $('[data-testid="viewport-reset-view"]')
  }
  /** The four "coming soon" buttons, which ship disabled. */
  get comingSoonButtons(): El[] {
    return ['layers', 'pan', 'camera', 'hierarchy'].map((k) => $(`[data-testid="viewport-${k}"]`))
  }

  // ----- Top-right toolbar (always rendered, even with no geometry) -----
  get toolbarRight(): El {
    return $('[data-testid="viewport-toolbar-right"]')
  }
  get statsToggle(): El {
    return $('[data-testid="viewport-stats-toggle"]')
  }
  get lightingToggle(): El {
    return $('[data-testid="viewport-lighting-toggle"]')
  }
  modeButton(mode: 'flat' | 'phong' | 'phong-shadows'): El {
    return $(`[data-testid="viewport-mode-${mode}"]`)
  }

  /**
   * Which lighting mode is active.
   *
   * Class-based because there is no aria-pressed and frontend changes are
   * restricted to data-testid — the active button is the one carrying
   * `text-sky-400`.
   */
  async activeMode(): Promise<string | null> {
    return browser.execute(() => {
      const modes = ['flat', 'phong', 'phong-shadows']
      for (const m of modes) {
        const el = document.querySelector(`[data-testid="viewport-mode-${m}"]`)
        if (el && el.className.includes('text-sky-400')) return m
      }
      return null
    })
  }

  // ----- Stats overlay -----
  get statsOverlay(): El {
    return $('[data-testid="scene-stats"]')
  }

  async statsOpen(): Promise<boolean> {
    return this.statsOverlay.isExisting()
  }

  /**
   * Click the stats toggle IN-PAGE rather than through WebDriver.
   *
   * The loading overlay is `inset-0 z-20` and covers this z-10 button, so a
   * real click is intermittently intercepted. Waiting for the loader to clear
   * first is not enough: it can reappear between the check and the click, and
   * that TOCTOU gap is exactly what produced "the overlay did not close" on
   * roughly one run in four while passing in isolation.
   *
   * This is the same in-page technique the suite already uses for controls that
   * are legitimately covered or transparent (see CLAUDE.md trap 7). It is
   * instrumentation for reading the scene, not the behaviour under test — the
   * assertion that matters is that the overlay's STATE changes, which is still
   * verified below.
   */
  private async clickStatsToggle(): Promise<void> {
    const clicked = await browser.execute(() => {
      const btn = document.querySelector(
        '[data-testid="viewport-stats-toggle"]'
      ) as HTMLElement | null
      if (!btn) return false
      btn.click()
      return true
    })
    if (!clicked) throw new Error('the scene-statistics toggle button is not in the DOM')
  }

  /** Open the overlay if it is closed. Idempotent. */
  async openStats(): Promise<void> {
    if (await this.statsOpen()) return
    await this.clickStatsToggle()
    await this.statsOverlay.waitForExist({
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: 'the scene-statistics overlay did not open'
    })
  }

  /** Close the overlay if it is open. Idempotent. */
  async closeStats(): Promise<void> {
    if (!(await this.statsOpen())) return
    await this.clickStatsToggle()
    await this.statsOverlay.waitForExist({
      reverse: true,
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: 'the scene-statistics overlay did not close'
    })
  }

  /**
   * UNUSABLE while Viewport3D.tsx ships SHOW_STATS_UI = false — use sceneObjectNames().
   *
   * Read the scene statistics, forcing a recompute first.
   *
   * ALWAYS closes and reopens the overlay — see the staleness note in this
   * file's header. Without that, create and un-hide report stale primitive
   * counts and the assertions built on them pass for the wrong reason.
   */
  async readStats(): Promise<SceneStats> {
    await this.closeStats()
    await this.openStats()

    const raw = await browser.execute(() => {
      const read = (name: string): string | null => {
        const el = document.querySelector(`[data-testid="scene-stat-${name}"]`)
        return el ? (el.textContent ?? '').trim() : null
      }
      return {
        objects: read('objects'),
        primitives: read('primitives'),
        triangles: read('triangles'),
        vertices: read('vertices'),
        quads: read('quads')
      }
    })

    return {
      objects: parseStat(raw.objects) ?? 0,
      primitives: parseStat(raw.primitives) ?? 0,
      triangles: parseStat(raw.triangles) ?? 0,
      vertices: parseStat(raw.vertices) ?? 0,
      // The Quads row is rendered only when > 0, so absence is meaningful.
      quads: parseStat(raw.quads)
    }
  }

  // ----- Canvas focus (gates every keyboard shortcut) -----

  /**
   * Give the canvas keyboard focus.
   *
   * Focused via JS rather than a click: the loading overlay is `inset-0 z-20`
   * and would intercept a real click, and a click on the canvas is also a
   * zero-distance camera drag. The canvas is focusable because SceneCanvas sets
   * `tabIndex = 0` on it imperatively.
   *
   * Focus is lost by any geometry click, form field, rename editor or dialog and
   * is never restored, so call this immediately before every browser.keys().
   */
  async focusCanvas(): Promise<void> {
    const focused = await browser.execute(() => {
      const canvas = document.querySelector('canvas') as HTMLElement | null
      if (!canvas) return false
      canvas.focus()
      return document.activeElement === canvas
    })
    if (!focused) {
      throw new Error(
        'could not focus the 3D canvas — every viewport shortcut is gated on it. ' +
          'Check the 3D tab is active and the canvas has mounted.'
      )
    }
  }

  async canvasFocused(): Promise<boolean> {
    return browser.execute(() => document.activeElement?.tagName === 'CANVAS')
  }

  // ----- Scene selector -----
  get sceneSelector(): El {
    return $('[data-testid="scene-selector"]')
  }
  get sceneSelectorTrigger(): El {
    return $('[data-testid="scene-selector-trigger"]')
  }

  /** The trigger's current label — "All", or the isolated object's name. */
  async selectorLabel(): Promise<string> {
    return (await $('[data-testid="scene-selector-label"]').getText()).trim()
  }

  async openSelector(): Promise<void> {
    await this.sceneSelectorTrigger.click()
    await $('[data-testid="scene-selector-option-all"]').waitForExist({
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: 'the scene selector did not open'
    })
  }

  /** Option labels in DOM order — "All" first, then each visible object. */
  async selectorOptions(): Promise<string[]> {
    return browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid^="scene-selector-option-"]')).map((el) =>
        (el.textContent ?? '').trim()
      )
    )
  }

  /** Pick an option. Pass 'all' for the All row, or an object id. */
  async selectSceneObject(idOrAll: string | number): Promise<void> {
    await this.openSelector()
    await $(`[data-testid="scene-selector-option-${idOrAll}"]`).click()
  }

  /**
   * Names of the objects the 3D scene holds, read from the scene selector
   * ("All" excluded).
   *
   * The replacement for readStats(): the statistics toggle and overlay are
   * hidden (Viewport3D.tsx `SHOW_STATS_UI = false`, d9b9d39). The selector lists
   * every VISIBLE object; it is closed again before this returns so it cannot
   * cover a later click.
   */
  async sceneObjectNames(): Promise<string[]> {
    if (!(await this.sceneSelectorTrigger.isExisting())) return []
    await this.waitForIdle()
    await this.openSelector()
    const names = (await this.selectorOptions()).slice(1)
    await this.sceneSelectorTrigger.click()
    await $('[data-testid="scene-selector-option-all"]').waitForExist({
      reverse: true,
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: 'the scene selector did not close'
    })
    return names
  }

  // ----- Loading / error -----
  get loadingOverlay(): El {
    return $('[data-testid="viewport-loading"]')
  }
  get errorBanner(): El {
    return $('[data-testid="viewport-error"]')
  }

  async loadingText(): Promise<string | null> {
    return browser.execute(() => {
      const el = document.querySelector('[data-testid="viewport-loading"]')
      return el ? (el.textContent ?? '').trim() : null
    })
  }

  async errorText(): Promise<string | null> {
    return browser.execute(() => {
      const el = document.querySelector('[data-testid="viewport-error"]')
      return el ? (el.textContent ?? '').trim() : null
    })
  }

  /**
   * Wait until no loading overlay is on screen. Several controls sit under it
   * (`inset-0 z-20`), so driving them before it clears fails as an intercepted
   * click naming the wrong element.
   */
  async waitForIdle(timeout = TIMEOUTS.LONG): Promise<void> {
    await this.loadingOverlay.waitForExist({
      reverse: true,
      timeout,
      timeoutMsg: 'the viewport loading overlay never cleared'
    })
  }
}

/**
 * Parse a stats value back to a number.
 *
 * Handles the two shapes formatNumber produces below and above its threshold:
 * `toLocaleString()` inserts thousands separators ("1,234"), and at 1000+ it
 * collapses to "1.2K" / "3.4M" — lossy, which is why tests assert exact counts
 * only on `Objects` (rendered raw) and use the rest for direction.
 */
function parseStat(raw: string | null): number | null {
  if (raw === null || raw === '') return null
  const text = raw.replace(/,/g, '')
  const m = /^([\d.]+)([KM]?)$/.exec(text)
  if (!m) return null
  const n = Number(m[1])
  if (m[2] === 'K') return n * 1_000
  if (m[2] === 'M') return n * 1_000_000
  return n
}

export default new Viewport3DPage()
