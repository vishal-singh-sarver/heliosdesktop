/**
 * The right "Properties" panel shell — the chevron that collapses it.
 *
 * WHY THIS EXISTS AS ITS OWN PAGE OBJECT
 * Collapsing is a purely VISUAL operation: the panel hides its body with
 * `display:none` (the `hidden`/`contents` swap in RightPanel/index.tsx) and
 * never unmounts the form. That is deliberate — unmounting used to discard the
 * form's own `touched` map, which is what gates the "Required Field" errors, so
 * a cleared field came back after a reopen with no error and a disabled Save
 * that nothing explained.
 *
 * Two consequences for any test that uses this:
 *  - Assert isDisplayed(), NEVER isExisting(). The form is in the DOM the whole
 *    time; only its visibility changes.
 *  - The panel force-EXPANDS itself whenever a draft opens (it watches each
 *    feature's open-nonce), so a test that collapses it must not assume it
 *    stays collapsed across a +Ground or a row click.
 *
 * SELECTOR: by testid, not by aria-label. CollapseButton labels itself
 * 'Expand panel'/'Collapse panel' and the LEFT panel's button carries the very
 * same strings — the component takes a `dataTestId` prop precisely so the two
 * can be told apart (see components/CollapseButton/index.tsx:9).
 */

import { TIMEOUTS } from '../config/timeouts'

type El = ReturnType<typeof $>

class RightPanelPage {
  get panel(): El {
    return $('[data-testid="right-panel"]')
  }

  get collapseButton(): El {
    return $('[data-testid="right-panel-collapse-btn"]')
  }

  /**
   * Read the state from the button's own label rather than the panel's width
   * class: the width animates (`transition-[width] duration-150`), so a class
   * read races the transition while the aria-label flips synchronously.
   */
  async isCollapsed(): Promise<boolean> {
    return (await this.collapseButton.getAttribute('aria-label')) === 'Expand panel'
  }

  private async toggleTo(collapsed: boolean): Promise<void> {
    if ((await this.isCollapsed()) === collapsed) return
    await this.collapseButton.waitForClickable({ timeout: TIMEOUTS.MEDIUM })
    await this.collapseButton.click()
    await browser.waitUntil(async () => (await this.isCollapsed()) === collapsed, {
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: `the right panel never became ${collapsed ? 'collapsed' : 'expanded'}`
    })
  }

  async collapse(): Promise<void> {
    await this.toggleTo(true)
  }

  async expand(): Promise<void> {
    await this.toggleTo(false)
  }

  /** Collapse and re-expand — the round trip every persistence case makes. */
  async cycle(): Promise<void> {
    await this.collapse()
    await this.expand()
  }
}

export default new RightPanelPage()
