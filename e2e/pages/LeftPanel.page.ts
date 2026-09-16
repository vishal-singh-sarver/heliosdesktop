/**
 * The left "Tools" panel: its collapse chrome and the three Accordion sections
 * (Geometry / Materials / Models).
 *
 * State model — two things make this panel unusual:
 *  1. NOTHING UNMOUNTS. Collapsing the panel or a section hides it with CSS
 *     (display:none), so every element stays in the DOM. Assert isDisplayed(),
 *     never isExisting(). This is deliberate in the app: the sections keep
 *     their state and never re-run their data-loading effects on a toggle.
 *  2. Open/closed state is component-local React useState, NOT Redux, and is
 *     not persisted. A reload resets all three sections to open.
 *
 * The chevron is one asset rotated by an inline transform and is aria-hidden,
 * so it is not a usable state oracle. `aria-expanded` on the header button is.
 */

import { TIMEOUTS } from '../config/timeouts'

type El = ReturnType<typeof $>

export type Section = 'geometry' | 'materials' | 'models'

class LeftPanelPage {
  get panel(): El {
    return $('[data-testid="left-panel"]')
  }
  get collapseButton(): El {
    return $('[data-testid="left-panel-collapse-btn"]')
  }

  section(key: Section): El {
    return $(`[data-testid="accordion-${key}"]`)
  }
  sectionToggle(key: Section): El {
    return $(`[data-testid="accordion-${key}-toggle"]`)
  }
  sectionBody(key: Section): El {
    return $(`[data-testid="accordion-${key}-body"]`)
  }
  /** Only rendered while the panel is collapsed. */
  rail(key: Section): El {
    return $(`[data-testid="left-rail-${key}"]`)
  }

  // ===== Reads =====

  async sectionExpanded(key: Section): Promise<boolean> {
    return (await this.sectionToggle(key).getAttribute('aria-expanded')) === 'true'
  }

  /**
   * The panel's own collapsed state. CollapseButton names itself for the action
   * it will perform, so "Expand panel" means it is currently collapsed.
   */
  async collapsed(): Promise<boolean> {
    return (await this.collapseButton.getAttribute('aria-label')) === 'Expand panel'
  }

  /**
   * Every accordion's VISIBLE heading text, in DOM order.
   *
   * The rest of this page object addresses sections through the derived testid
   * `accordion-{title.toLowerCase()}`, which means every existing assertion
   * would still pass if a title were changed to "geometry" or "Geometry Tools".
   * This is the only read that observes the copy the user actually sees, and
   * the only one that would notice a FOURTH section appearing.
   */
  async sectionTitles(): Promise<string[]> {
    return browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid^="accordion-"][data-testid$="-toggle"]'))
        .map((el) => (el.querySelector('span')?.textContent ?? '').trim())
        .filter((s) => s.length > 0)
    ) as Promise<string[]>
  }

  /**
   * The inline transform on a section's chevron, e.g. "rotate(180deg)" or "none".
   *
   * Read the STYLE ATTRIBUTE, never getCSSProperty('transform') — the latter
   * resolves to a matrix(...) and cannot be compared to the value the component
   * writes. The chevron is one asset (a down-pointing glyph) rotated 180° when
   * open, and it is aria-hidden, so this is the only way to observe the
   * direction the user sees. `aria-expanded` remains the state oracle; this is
   * specifically for asserting the ICON follows it.
   */
  async chevronTransform(key: Section): Promise<string> {
    return browser.execute((k: string) => {
      // `:scope >` is load-bearing. The header also carries an optional section
      // ICON, and that one is nested inside the title <span> — a bare
      // querySelector('img') would return it (it comes first in document order)
      // and report the icon's transform, which never changes. The chevron is
      // the button's own direct img child.
      const img = document
        .querySelector(`[data-testid="accordion-${k}-toggle"]`)
        ?.querySelector(':scope > img') as HTMLElement | null
      return img?.style.transform ?? ''
    }, key) as Promise<string>
  }

  /** All three sections' expanded state in one read. */
  async expandedMap(): Promise<Record<Section, boolean>> {
    return browser.execute(() => {
      const read = (k: string): boolean =>
        document.querySelector(`[data-testid="accordion-${k}-toggle"]`)?.getAttribute('aria-expanded') ===
        'true'
      return { geometry: read('geometry'), materials: read('materials'), models: read('models') }
    }) as Promise<Record<Section, boolean>>
  }

  // ===== Intents =====

  async toggleSection(key: Section): Promise<void> {
    const before = await this.sectionExpanded(key)
    await this.sectionToggle(key).click()
    await browser.waitUntil(async () => (await this.sectionExpanded(key)) !== before, {
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: `the ${key} section never changed expanded state`
    })
  }

  /**
   * Drive one section to `open`, retrying the click — the same shape as
   * setCollapsed below, and for the same reason.
   *
   * This was a single unretried click, and it carries the same consequence: it
   * runs in `resetToDefault` (teardown) AND in the ungrouping `beforeEach`,
   * where Materials and Models are collapsed to give the geometry tree enough
   * height for the drop target to exist at all. A click that does not land there
   * leaves the tree a third of its expected height, and
   * `dragRowsToTreeBackground` then throws "no empty tree area below the last
   * row" — which reads as a product bug rather than a missed click.
   *
   * Every retry re-reads the state first, so a toggle that merely landed SLOWLY
   * is never undone by a second click.
   */
  async setSection(key: Section, open: boolean): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if ((await this.sectionExpanded(key)) === open) return
      await this.sectionToggle(key).click()
      const settled = await browser
        .waitUntil(async () => (await this.sectionExpanded(key)) === open, {
          timeout: TIMEOUTS.SHORT,
          interval: 100
        })
        .then(
          () => true,
          () => false
        )
      if (settled) return
    }
    throw new Error(
      `the ${key} section never became ${open ? 'expanded' : 'collapsed'} after 3 click attempts`
    )
  }

  /**
   * Drive the panel to `collapsed`, retrying the click.
   *
   * A SINGLE unretried click here was the whole of a long-standing flake. This
   * runs in teardown (`resetToDefault`), where a click that does not land leaves
   * the panel collapsed for the NEXT test — which then fails on its first line
   * with `expected false, received true` and no hint where the state came from.
   * Measured 16 Sep 2026: that is exactly how `geometry.test.ts:388`
   * ("the rail is ABSENT while the panel is expanded") failed on a loaded
   * machine while passing in isolation.
   *
   * Every retry is gated on re-reading the state, so a toggle that merely
   * landed SLOWLY is never undone by a second click.
   */
  async setCollapsed(collapsed: boolean): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if ((await this.collapsed()) === collapsed) return
      await this.collapseButton.click()
      const settled = await browser
        .waitUntil(async () => (await this.collapsed()) === collapsed, {
          timeout: TIMEOUTS.SHORT,
          interval: 100
        })
        .then(
          () => true,
          () => false
        )
      if (settled) return
    }
    throw new Error(
      `the panel never became ${collapsed ? 'collapsed' : 'expanded'} after 3 click attempts`
    )
  }

  /** Restore the as-mounted state: panel open, all three sections open. */
  async resetToDefault(): Promise<void> {
    await this.setCollapsed(false)
    for (const key of ['geometry', 'materials', 'models'] as Section[]) {
      await this.setSection(key, true)
    }
  }

  /**
   * Why the panel is NOT in its as-mounted state, or '' when it is.
   *
   * For teardown to assert on. `resetToDefault()` is called as a best-effort
   * `step(...)`, whose errors are COLLECTED and then discarded unless something
   * else also went wrong — so a failed reset used to vanish and surface as an
   * unrelated failure in a later test. Panel state belongs in the same category
   * as a leaked row: it is not benign, because it corrupts the NEXT test.
   */
  async defaultStateViolation(): Promise<string> {
    if (await this.collapsed()) return 'the panel is still COLLAPSED'
    const shut: Section[] = []
    for (const key of ['geometry', 'materials', 'models'] as Section[]) {
      if (!(await this.sectionExpanded(key))) shut.push(key)
    }
    return shut.length ? `section(s) still closed: ${shut.join(', ')}` : ''
  }
}

export default new LeftPanelPage()
