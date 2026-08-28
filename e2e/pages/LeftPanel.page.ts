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

  async setSection(key: Section, open: boolean): Promise<void> {
    if ((await this.sectionExpanded(key)) !== open) await this.toggleSection(key)
  }

  async setCollapsed(collapsed: boolean): Promise<void> {
    if ((await this.collapsed()) === collapsed) return
    await this.collapseButton.click()
    await browser.waitUntil(async () => (await this.collapsed()) === collapsed, {
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: `the panel never became ${collapsed ? 'collapsed' : 'expanded'}`
    })
  }

  /** Restore the as-mounted state: panel open, all three sections open. */
  async resetToDefault(): Promise<void> {
    await this.setCollapsed(false)
    for (const key of ['geometry', 'materials', 'models'] as Section[]) {
      await this.setSection(key, true)
    }
  }
}

export default new LeftPanelPage()
