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
