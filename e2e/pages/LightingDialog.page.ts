/**
 * The viewport's Lighting Settings panel.
 *
 * ── It is NOT a native <dialog>, and that changes everything ──────────────
 *
 * It is a `pointer-events-none` full-screen div with a `pointer-events-auto`
 * panel pinned top-right. Consequences a test must respect:
 *
 *  - e2e/support/dialogs.ts will NOT find it, and no existing afterEach sweep
 *    closes it.
 *  - Escape does nothing. There is no outside-click handler either. The only
 *    ways out are the header x and the footer Close button.
 *  - While open, its z-50 panel physically covers the z-10 top-right toolbar —
 *    so a leaked dialog makes the stats, lighting and mode buttons unclickable
 *    for every later test in the file. ALWAYS close it in afterEach.
 *  - It does not block the canvas: the backdrop is click-through.
 *
 * ── Commit semantics ──────────────────────────────────────────────────────
 *
 * The number fields commit on BLUR and on ENTER, never on typing — the value
 * only reaches the scene at commit. The sliders are the exception: they commit
 * on every change.
 *
 * The prop -> text sync is suppressed while a field has focus, so reading a
 * field you are still focused on can return a stale string. setValue() below
 * always blurs before returning for that reason.
 */
import { TIMEOUTS } from '../config/timeouts'
import { SELECT_ALL_KEY } from '../support/harness'

type El = ReturnType<typeof $>

type NumericField = 'elevation' | 'azimuth' | 'direct-intensity' | 'diffuse-intensity'
type ColorChannel = 'r' | 'g' | 'b'

class LightingDialogPage {
  get panel(): El {
    return $('[data-testid="lighting-dialog"]')
  }
  get closeButton(): El {
    return $('[data-testid="lighting-close"]')
  }
  get closeX(): El {
    return $('[data-testid="lighting-close-x"]')
  }
  get swatch(): El {
    return $('[data-testid="lighting-swatch"]')
  }

  /**
   * The number input for a field. Elevation and azimuth wrap a slider AND a
   * number input, so those are scoped by testid then narrowed by input type;
   * the intensities wrap only a number input.
   */
  input(field: NumericField): El {
    return $(`[data-testid="lighting-${field}"] input[type="number"]`)
  }

  /** The range slider. Only elevation and azimuth have one. */
  slider(field: 'elevation' | 'azimuth'): El {
    return $(`[data-testid="lighting-${field}"] input[type="range"]`)
  }

  colorInput(channel: ColorChannel): El {
    return $(`[data-testid="lighting-color-${channel}"]`)
  }

  async isOpen(): Promise<boolean> {
    return this.panel.isExisting()
  }

  async open(): Promise<void> {
    if (await this.isOpen()) return
    await $('[data-testid="viewport-lighting-toggle"]').click()
    await this.panel.waitForDisplayed({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Lighting Settings panel did not open'
    })
  }

  /** Close via the footer button. Idempotent, and safe to call in afterEach. */
  async close(): Promise<void> {
    if (!(await this.isOpen())) return
    await this.closeButton.click()
    await this.panel.waitForExist({
      reverse: true,
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Lighting Settings panel did not close'
    })
  }

  // ----- Selector strings (the writers need a selector, not an element) -----

  inputSel(field: NumericField): string {
    return `[data-testid="lighting-${field}"] input[type="number"]`
  }
  sliderSel(field: 'elevation' | 'azimuth'): string {
    return `[data-testid="lighting-${field}"] input[type="range"]`
  }
  colorSel(channel: ColorChannel): string {
    return `[data-testid="lighting-color-${channel}"]`
  }

  /**
   * Type a value into a field with REAL keystrokes.
   *
   * Deliberately NOT the native-value-setter trick used elsewhere in this suite.
   * That trick writes the DOM directly and relies on a dispatched `input` event
   * for React to catch up, which desynchronises two pieces of state in this
   * particular component: the field is controlled by a local `text`, and its
   * prop->text effect is SUPPRESSED while the field has focus. If React misses
   * the synthetic event, the DOM keeps the typed value with nothing to correct
   * it, so a read looks right while `text` — the thing commit() actually parses
   * — still holds the old value. The commit then writes the OLD number back and
   * the test fails somewhere later, on a different assertion each run.
   *
   * That produced a ~50% failure rate here with a rotating victim, and no amount
   * of waiting fixed it: a post-setter read cannot distinguish "React took it"
   * from "React never saw it".
   *
   * Real keystrokes go through React's own event path, so `text` is always in
   * step with the DOM. The values here are a few characters, so the cost is
   * negligible.
   */
  private async type(selector: string, value: string): Promise<void> {
    const el = $(selector)
    // Focus via JS, not a click.
    //
    // A click is not reliable here: committing the PREVIOUS field re-renders the
    // whole panel, and under load the click can land mid-render and never take
    // focus — observed as "lighting-color-b never took focus" in a full run
    // while passing 3/3 standalone. Nothing about this test is concerned with
    // whether the input is clickable; it needs the caret in the field, which
    // .focus() gives deterministically. It still fires the component's onFocus.
    await el.waitForExist({ timeout: TIMEOUTS.SHORT })
    // Focus MUST be verified: the select-all chord below goes to the document
    // if it missed, the delete clears nothing, and the new text is appended to
    // the old instead of replacing it.
    //
    // And it is RE-REQUESTED on every poll, not once. Committing the previous
    // value re-renders the panel, and a focus() that lands on the node about to
    // be replaced is lost with it — observed in a full run as "lighting-elevation
    // never took focus" while the same test passed standalone. Re-querying the
    // selector each time always targets the live input.
    await browser.waitUntil(
      async () => {
        if (await el.isFocused()) return true
        await browser.execute((sel: string) => {
          ;(document.querySelector(sel) as HTMLElement | null)?.focus()
        }, selector)
        return el.isFocused()
      },
      { timeout: TIMEOUTS.SHORT, interval: 100, timeoutMsg: `${selector} never took focus` }
    )
    await browser.keys([SELECT_ALL_KEY, 'a'])
    await browser.keys(['Delete'])
    // ONE addValue, not a keystroke per character.
    //
    // Sending characters one at a time is a separate WebDriver round trip each,
    // and this is a CONTROLLED input: React re-renders between them and the
    // caret does not reliably survive, so characters land out of order or are
    // dropped entirely. Observed directly — "0.12345" arrived as "0" and "45"
    // never arrived at all, failing a different assertion on each run.
    // addValue sends the whole string in a single command, which is the pattern
    // harness.setInputValue already uses for controlled inputs elsewhere.
    if (value.length) await el.addValue(value)
  }

  /**
   * Blur a SPECIFIC field to commit it, then wait for the result to stop moving.
   *
   * Blurring document.activeElement is not good enough: if focus has drifted
   * (this component queues a select() on focus), the blur lands on the wrong
   * element and the field never commits.
   *
   * The settle afterwards matters because commit() writes the CLAMPED value
   * back into the field, and a revert on NaN writes the previous one. Neither is
   * known to the caller, so wait for two consecutive equal reads instead.
   */
  private async commitField(selector: string): Promise<void> {
    await browser.execute((sel: string) => {
      const node = document.querySelector(sel) as HTMLElement | null
      node?.blur()
    }, selector)

    let last: string | null = null
    await browser.waitUntil(
      async () => {
        const now = await $(selector).getValue()
        const stable = last !== null && now === last
        last = now
        return stable
      },
      { timeout: TIMEOUTS.SHORT, timeoutMsg: `${selector} never settled after commit` }
    )
  }

  /** Replace a field's value and COMMIT it (blur). */
  async setValue(selector: string, value: string): Promise<void> {
    await this.type(selector, value)
    await this.commitField(selector)
  }

  /** Write a value WITHOUT committing — for the "typing alone does nothing" test. */
  async typeWithoutCommit(selector: string, value: string): Promise<void> {
    await this.type(selector, value)
  }

  /** Commit with Enter instead of blur — the other supported path. */
  async commitWithEnter(selector: string): Promise<void> {
    await $(selector).click()
    await browser.keys(['Enter'])
    let last: string | null = null
    await browser.waitUntil(
      async () => {
        const now = await $(selector).getValue()
        const stable = last !== null && now === last
        last = now
        return stable
      },
      { timeout: TIMEOUTS.SHORT, timeoutMsg: `${selector} never settled after Enter` }
    )
  }

  async readValue(selector: string): Promise<string> {
    return $(selector).getValue()
  }

  /** The swatch's computed background, e.g. "rgb(255, 255, 255)". */
  async swatchColor(): Promise<string> {
    return browser.execute(() => {
      const el = document.querySelector('[data-testid="lighting-swatch"]') as HTMLElement | null
      return el ? getComputedStyle(el).backgroundColor : ''
    })
  }
}

export default new LightingDialogPage()
