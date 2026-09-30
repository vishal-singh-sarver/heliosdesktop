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

  /**
   * Click the chevron to reach `collapsed`, and return only once the width
   * transition that click starts has FINISHED.
   *
   * Both waits around the click matter. The aria-label flips at once, but the
   * panel keeps animating for ~2.5s in the never-shown e2e window, and the
   * chevron MOVES while it does (measured 17 Sep 2026: after a collapse click it
   * jumps from x=1574 to x=1420, since the collapsed header centres it, then
   * drifts back as the panel narrows; on an expand it passes x=1629, off a
   * 1600px screen). A second toggle sent meanwhile can be aimed at where the
   * chevron WAS: the click lands on nothing, raises no error, and the panel never
   * changes. "a collapse and re-expand leaves the SAME material selected" failed
   * on the Mac with "the right panel never became expanded" (17 Sep 2026) while
   * clicking exactly that way. That this hazard caused it is NOT proven — it did
   * not reproduce on Linux, hidden, slowed or headed — so a timeout here reports
   * what was under the chevron instead of guessing again.
   */
  private async toggleTo(collapsed: boolean): Promise<void> {
    await this.waitForSettled('either')
    if ((await this.isCollapsed()) === collapsed) return
    await this.collapseButton.waitForClickable({ timeout: TIMEOUTS.MEDIUM })
    await this.collapseButton.click()
    try {
      await browser.waitUntil(async () => (await this.isCollapsed()) === collapsed, {
        timeout: TIMEOUTS.SHORT
      })
    } catch (err) {
      const state = await browser
        .execute(() => {
          const panel = document.querySelector('[data-testid="right-panel"]') as HTMLElement | null
          const btn = document.querySelector('[data-testid="right-panel-collapse-btn"]') as HTMLElement | null
          if (!panel || !btn) return 'panel or chevron missing'
          const r = btn.getBoundingClientRect()
          const x = r.left + r.width / 2
          const y = r.top + r.height / 2
          const hit = document.elementFromPoint(x, y) as HTMLElement | null
          const onChevron = !!hit && (hit === btn || btn.contains(hit))
          return (
            `label="${btn.getAttribute('aria-label')}", panel ${Math.round(panel.getBoundingClientRect().width)}px, ` +
            `${panel.getAnimations().length} running transition(s), chevron centre (${Math.round(x)},${Math.round(y)}) ` +
            `in a ${window.innerWidth}x${window.innerHeight} viewport, element there: ` +
            (onChevron ? 'the chevron' : hit ? hit.outerHTML.slice(0, 160) : 'nothing') +
            `, open dialogs: ${document.querySelectorAll('dialog[open]').length}, ` +
            `expanded Selects: ${document.querySelectorAll('[role="combobox"][aria-expanded="true"]').length}`
          )
        })
        .catch((e: Error) => `state unreadable: ${e.message}`)
      throw new Error(
        `the right panel never became ${collapsed ? 'collapsed' : 'expanded'} after its chevron ` +
          `was clicked (${state}). ${err instanceof Error ? err.message : String(err)}`
      )
    }
    await this.waitForSettled(collapsed ? 'collapsed' : 'expanded')
  }

  async collapse(): Promise<void> {
    await this.toggleTo(true)
  }

  async expand(): Promise<void> {
    await this.toggleTo(false)
  }

  /**
   * Wait until the panel is expanded AND its width transition has FINISHED.
   *
   * The panel opens from the 32px strip to 340px with `transition-[width]
   * duration-150`. In the never-shown e2e window that transition does not run on
   * a normal frame clock: measured 17 Sep 2026 it took ~2.5s, standing still
   * part-way for ~1.75s. Until it ends the form inside is 0px WIDE, so a click
   * there fails with "element not interactable: element has zero size" —
   * webdriverio retries it, and that retry was the ERROR line every full
   * materials.test.ts run printed (a Save clicked ~0.5s after a fresh project's
   * first material opened).
   *
   * Neither obvious check proves the transition is over. `isDisplayed()` uses
   * checkVisibility(), which ignores size. "The width stopped changing" is fooled
   * by that mid-animation stall. `getAnimations()` lists the running transition
   * itself, so an empty list is its real end, whatever the duration.
   */
  async waitForExpanded(timeout: number = TIMEOUTS.MEDIUM): Promise<void> {
    await this.waitForSettled('expanded', timeout)
  }

  /**
   * Wait until the panel's width transition has finished and, unless `want` is
   * 'either', the panel is in that state. `getAnimations()` on the panel itself
   * is the transition's own end — see waitForExpanded for why nothing weaker
   * works.
   */
  async waitForSettled(
    want: 'expanded' | 'collapsed' | 'either',
    timeout: number = TIMEOUTS.MEDIUM
  ): Promise<void> {
    let last = 'no reading taken'
    try {
      await browser.waitUntil(
        async () => {
          const s = (await browser.execute(() => {
            const panel = document.querySelector('[data-testid="right-panel"]') as HTMLElement | null
            const btn = document.querySelector('[data-testid="right-panel-collapse-btn"]')
            if (!panel) return null
            return {
              width: Math.round(panel.getBoundingClientRect().width),
              running: panel.getAnimations().length,
              collapsed: btn?.getAttribute('aria-label') === 'Expand panel'
            }
          })) as { width: number; running: number; collapsed: boolean } | null
          last = s
            ? `width ${s.width}px, ${s.running} running transition(s), collapsed=${s.collapsed}`
            : 'no right panel in the DOM'
          if (!s || s.running !== 0) return false
          return want === 'either' || s.collapsed === (want === 'collapsed')
        },
        { timeout, interval: 100 }
      )
    } catch (err) {
      // Thrown from the catch: a timeoutMsg would be built before the first poll.
      throw new Error(
        `the right panel never settled ${want === 'either' ? '' : `${want} `}(${last}). ` +
          (err instanceof Error ? err.message : String(err))
      )
    }
  }

  /** Collapse and re-expand — the round trip every persistence case makes. */
  async cycle(): Promise<void> {
    await this.collapse()
    await this.expand()
  }
}

export default new RightPanelPage()
