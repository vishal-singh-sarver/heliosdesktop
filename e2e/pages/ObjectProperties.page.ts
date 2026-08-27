/**
 * The Ground Properties form in the right panel.
 *
 * Selector model:
 *  - Fields render through the shared FormField, which derives its own hooks
 *    from the input `name` (= the catalog property): input-length,
 *    input-resolution_x, ...
 *  - Labels are sr-only, so `aria-label` does NOT address these inputs.
 *  - Every field passes errorAsTooltip, so `error-{name}` is NEVER rendered.
 *    The message lives on a Tooltip trigger as `aria-label="Validation error: X"`
 *    and `data-tooltip-content`, inside the field's formfield-{name} wrapper.
 *    `aria-invalid` on the input is the cheap boolean.
 *
 * Two behaviours that decide how a test must drive a field:
 *  - RANGE validation runs on change, so a single native-setter write is
 *    enough to observe it.
 *  - KEYSTROKE GUARDS (non-numeric, a decimal in an integer field, >7 decimals)
 *    REJECT the incoming value, leaving the field at its PREVIOUS content. A
 *    native-setter write bypasses them entirely, so guard tests must type
 *    character by character with typeField().
 */

import { TIMEOUTS } from '../config/timeouts'

type El = ReturnType<typeof $>

/** Catalog property names on the Ground object type. */
export type GroundField =
  | 'length'
  | 'breadth'
  | 'resolution_x'
  | 'resolution_y'
  | 'position_x'
  | 'position_y'
  | 'position_z'
  | 'rotation_z'
  | 'texture_x'
  | 'texture_y'

class ObjectPropertiesPage {
  get form(): El {
    return $('[data-testid="object-properties-form"]')
  }
  get nameInput(): El {
    return $('[data-testid="object-name"]')
  }
  get saveButton(): El {
    return $('[data-testid="object-save"]')
  }
  field(name: GroundField): El {
    return $(`[data-testid="input-${name}"]`)
  }
  fieldWrapper(name: GroundField): El {
    return $(`[data-testid="formfield-${name}"]`)
  }

  async waitForOpen(): Promise<void> {
    await this.form.waitForDisplayed({
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'the Ground Properties form never opened'
    })
  }

  /**
   * Value + inline error + aria-invalid, from ONE snapshot.
   *
   * Split reads tear: the tooltip mounts and unmounts as the error appears and
   * clears, and blur rewrites the value (scientific-notation expansion, texture
   * repeat snapping). Same reasoning as Weather.cellValidation.
   */
  async fieldState(
    name: GroundField
  ): Promise<{ value: string; error: string | null; invalid: boolean }> {
    // Element-level commands, NOT browser.execute.
    //
    // This form raises a global error when a field goes out of range (the
    // validation message reaches window's error handler). WebdriverIO surfaces
    // a pending page error on the NEXT execute/sync call, so any read done
    // through browser.execute here fails with
    //   WebDriverError: Values should be between (0.01 - 1000000)
    // — the app's own copy, arriving as a driver error rather than as the
    // assertion it belongs to. Separate element endpoints are unaffected.
    //
    // FINDING (not tested): an out-of-range field produces an uncaught error in
    // the app. It does not break the UI — the field flags correctly and the form
    // stays usable — but it would reach an error boundary or any window.onerror
    // reporting in production. Worth a look by the feature owner.
    const input = this.field(name)
    const value = (await input.getValue().catch(() => '')) as string
    const invalid = (await input.getAttribute('aria-invalid').catch(() => null)) === 'true'
    const tip = this.fieldWrapper(name).$('[aria-label^="Validation error:"]')
    const error = (await tip.isExisting().catch(() => false))
      ? await tip.getAttribute('data-tooltip-content').catch(() => null)
      : null
    return { value, error, invalid }
  }

  async errorFor(name: GroundField, timeout = TIMEOUTS.SHORT): Promise<string | null> {
    try {
      await browser.waitUntil(async () => (await this.fieldState(name)).error !== null, { timeout })
    } catch {
      // Returning null lets a caller assert the ABSENCE of an error instead of
      // this throwing an unrelated timeout.
    }
    return (await this.fieldState(name)).error
  }

  /**
   * Replace a field's value in one atomic step.
   *
   * Drives the native value setter + input/change so React's onChange — and
   * therefore the range validation — sees exactly one value. Bypasses the
   * per-keystroke guards by design; use typeField() to exercise those.
   */
  async setField(name: GroundField, value: string): Promise<void> {
    await this.field(name).waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await browser.execute(
      (prop: string, val: string) => {
        const node = document.querySelector(`[data-testid="input-${prop}"]`) as HTMLInputElement | null
        if (!node) throw new Error(`setField: no input for ${prop}`)
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set
        node.focus()
        setter?.call(node, val)
        // Isolate the dispatch. React runs onChange SYNCHRONOUSLY inside
        // dispatchEvent, and on this form an invalid value makes a downstream
        // subscriber rethrow the validation message — which would otherwise
        // escape as `WebDriverError: Values should be between (0.01 - 1000000)`
        // and fail the command instead of the assertion. React has already
        // committed the state change by then, so the field and its error render
        // correctly; the assertions that follow read the real DOM.
        // FINDING (not tested): the app throws out of the change handler when a
        // field goes out of range. Harmless here, but worth a look — an error
        // boundary in the real app would see it too.
        try {
          node.dispatchEvent(new Event('input', { bubbles: true }))
          node.dispatchEvent(new Event('change', { bubbles: true }))
        } catch {
          /* see above */
        }
      },
      name,
      value
    )
  }

  /**
   * Type into a field character by character, after clearing it.
   *
   * REQUIRED for the keystroke-guard cases: handleFieldChange rejects the whole
   * incoming value, so setField('1.12345678') leaves the field at its previous
   * content, whereas typing leaves it at '1.1234567' with the guard message
   * showing. Different observable outcomes — a guard test written on setField
   * asserts the wrong thing.
   */
  async typeField(name: GroundField, text: string): Promise<void> {
    const el = this.field(name)
    await el.click()
    await browser.keys([process.platform === 'darwin' ? 'Meta' : 'Control', 'a'])
    await browser.keys(['Delete'])
    for (const ch of text) await browser.keys([ch])
  }

  /** Blur the focused field, which is what triggers snap/expand/reconcile. */
  async commitField(): Promise<void> {
    await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
  }

  async saveEnabled(): Promise<boolean> {
    return this.saveButton.isEnabled()
  }

  /**
   * Press Save and wait for the write to settle.
   *
   * The label flips to "Saving…" while in flight, and `dirty` clears once the
   * PATCH lands — waiting on the button being disabled again is a more reliable
   * settle than the label, which flickers back first.
   */
  async save(): Promise<void> {
    await this.saveButton.click()
    await browser.waitUntil(async () => !(await this.saveEnabled()), {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: 'Save never completed (the PATCH may not have landed)'
    })
  }

  async nameValue(): Promise<string> {
    return this.nameInput.getValue()
  }
}

export default new ObjectPropertiesPage()
