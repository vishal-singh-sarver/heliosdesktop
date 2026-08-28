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
   * therefore the range validation — sees exactly one value.
   *
   * IT DOES NOT BYPASS THE KEYSTROKE GUARDS. This comment used to claim it did,
   * and two tests written on that belief failed: React's onChange IS
   * handleFieldChange, which tests the whole incoming value and returns without
   * storing it when the value is non-numeric, or adds a '.' to an integer field,
   * or would add an 8th decimal. What setField skips is per-CHARACTER delivery,
   * not the guard.
   *
   * So the difference from typeField() is the OBSERVABLE OUTCOME, not whether a
   * guard runs: setField('1.12345678') is refused whole and leaves the field at
   * its previous value, whereas typing it lands '1.1234567' and stops at the
   * 8th. Use typeField() whenever the test cares about the partial value.
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

  // ===== Materials section =====
  //
  // The ground form's Materials row: a "Select" button, the picker popup it
  // opens, the assigned-material rows below it, and three dialogs.
  //
  // FOUR THINGS DECIDE HOW THESE ARE WRITTEN:
  //
  // 1. BOTH POPUPS ARE PORTALLED. AnchoredPopup renders into document.body, so
  //    nothing here may be scoped under the form. It also returns null when
  //    closed — so unlike the accordions, isExisting() IS a valid closed-oracle
  //    for a popup (and the only place in Geometry where that is true).
  // 2. THE PICKER HAS TWO SHAPES. With a non-empty library it renders a
  //    role="radiogroup" of role="radio" rows. With an EMPTY library there is no
  //    radiogroup at all — just "No Material Found" and an "Add New Material"
  //    button. A test that keys on the radiogroup fails on a fresh database for
  //    a reason that has nothing to do with what it is testing, so `pickerOpen`
  //    keys on the heading, which both shapes render.
  // 3. A GROUND CARRIES EXACTLY ONE MATERIAL. The list is a RADIO group, not
  //    checkboxes, and picking replaces. DEVIATION: the story asks for multiple
  //    selection.
  // 4. THREE DIALOGS LIVE ON THIS FORM — delete (the name-row trash), unassign
  //    (a material's trash) and replace (raised by SAVE, not by picking). Always
  //    disambiguate by aria-label AND [open].

  /** The "Select" button on the Materials row. */
  get materialSelectButton(): El {
    return this.form.$('button=Select')
  }

  async pickerOpen(): Promise<boolean> {
    return (await this.materialSelectButton.getAttribute('aria-expanded')) === 'true'
  }

  /**
   * Open the picker. Clicked IN-PAGE: once any AnchoredPopup is open its overlay
   * is `fixed inset-0 z-40` across the whole panel, so a WebDriver click on the
   * button underneath is intercepted — and the same overlay is what makes a
   * second click close it.
   */
  async openMaterialPicker(): Promise<void> {
    if (await this.pickerOpen()) return
    await browser.execute(() => {
      const form = document.querySelector('[data-testid="object-properties-form"]')
      const btn = Array.from(form?.querySelectorAll('button') ?? []).find(
        (b) => (b.textContent || '').trim() === 'Select'
      ) as HTMLElement | undefined
      if (!btn) throw new Error('openMaterialPicker: no Select button on the form')
      btn.click()
    })
    await browser.waitUntil(async () => this.pickerOpen(), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Select Materials popup never opened'
    })
  }

  async closeMaterialPicker(): Promise<void> {
    if (!(await this.pickerOpen())) return
    await browser.execute(() => {
      const form = document.querySelector('[data-testid="object-properties-form"]')
      const btn = Array.from(form?.querySelectorAll('button') ?? []).find(
        (b) => (b.textContent || '').trim() === 'Select'
      ) as HTMLElement | undefined
      btn?.click()
    })
    await browser.waitUntil(async () => !(await this.pickerOpen()), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Select Materials popup never closed'
    })
  }

  /**
   * The picker's contents in ONE read — which shape it is in, and what it lists.
   *
   * `heading` is present in both shapes; `rows` is empty in the empty-library
   * shape and in the no-match shape, which `noMatchText` tells apart.
   */
  async pickerState(): Promise<{
    heading: string | null
    rows: { name: string; selected: boolean }[]
    noMatchText: string | null
    emptyLibrary: boolean
  }> {
    return browser.execute(() => {
      const group = document.querySelector('[role="radiogroup"][aria-label="Select Materials"]')
      // The popup wrapper is the radiogroup's popup root, or — with an empty
      // library — the container holding the "No Material Found" heading.
      const headingEl = Array.from(document.querySelectorAll('p')).find(
        (p) => (p.textContent || '').trim() === 'Select Materials'
      )
      const popup = headingEl?.closest('div')?.parentElement ?? null
      const emptyLibrary =
        Array.from(popup?.querySelectorAll('p') ?? []).some(
          (p) => (p.textContent || '').trim() === 'No Material Found'
        ) || false
      const noMatch = Array.from(popup?.querySelectorAll('p') ?? []).find((p) => {
        const t = (p.textContent || '').trim()
        return t === 'No materials found'
      })
      return {
        heading: headingEl ? (headingEl.textContent || '').trim() : null,
        rows: Array.from(group?.querySelectorAll('[role="radio"]') ?? []).map((r) => ({
          name: (r.textContent || '').trim(),
          selected: r.getAttribute('aria-checked') === 'true'
        })),
        noMatchText: noMatch ? (noMatch.textContent || '').trim() : null,
        emptyLibrary
      }
    }) as Promise<{
      heading: string | null
      rows: { name: string; selected: boolean }[]
      noMatchText: string | null
      emptyLibrary: boolean
    }>
  }

  /** Type into the picker's own search box (a fourth SearchBar instance). */
  async searchMaterials(text: string): Promise<void> {
    await browser.execute((val: string) => {
      const node = document.querySelector('[aria-label="Search materials"]') as HTMLInputElement | null
      if (!node) throw new Error('searchMaterials: the picker search box is not open')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(node, val)
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.dispatchEvent(new Event('change', { bubbles: true }))
    }, text)
  }

  /** Click a material row in the picker by exact name. */
  async pickMaterial(name: string): Promise<void> {
    await browser.execute((want: string) => {
      const group = document.querySelector('[role="radiogroup"][aria-label="Select Materials"]')
      const row = Array.from(group?.querySelectorAll('[role="radio"]') ?? []).find(
        (r) => (r.textContent || '').trim() === want
      ) as HTMLElement | undefined
      if (!row) throw new Error(`pickMaterial: no row "${want}" in the picker`)
      row.click()
    }, name)
  }

  /** The "Add New Material" button, shown only in the empty-library shape. */
  get addNewMaterialButton(): El {
    return $('button=Add New Material')
  }

  /**
   * Materials currently listed under the Select button.
   *
   * `syncFlag` is the amber dot: `stale` = the group was removed from the
   * library, `drift` = its values differ from the library's. Both are read from
   * the dot's title, which is the only place either state is exposed.
   */
  async assignedMaterials(): Promise<{ name: string; syncFlag: string | null }[]> {
    return browser.execute(() => {
      const form = document.querySelector('[data-testid="object-properties-form"]')
      return Array.from(form?.querySelectorAll('[aria-haspopup="dialog"]') ?? []).map((b) => {
        const dot = b.querySelector('span[title]')
        // The name span is the first child; the dot (when present) is the second.
        const nameEl = b.querySelector('span')
        return {
          name: (nameEl?.textContent || '').trim(),
          syncFlag: dot ? dot.getAttribute('title') : null
        }
      })
    }) as Promise<{ name: string; syncFlag: string | null }[]>
  }

  async assignedNames(): Promise<string[]> {
    return (await this.assignedMaterials()).map((m) => m.name)
  }

  /** Click an assigned material's trash. Opens the unassign dialog when SAVED. */
  async removeAssigned(name: string): Promise<void> {
    await browser.execute((want: string) => {
      const btn = document.querySelector(`[aria-label="Remove ${want}"]`) as HTMLElement | null
      if (!btn) throw new Error(`removeAssigned: no trash for "${want}"`)
      btn.click()
    }, name)
  }

  /** Open an assigned material's read-only properties popup. */
  async openMaterialDetail(name: string): Promise<void> {
    await browser.execute((want: string) => {
      const form = document.querySelector('[data-testid="object-properties-form"]')
      const btn = Array.from(form?.querySelectorAll('[aria-haspopup="dialog"]') ?? []).find(
        (b) => (b.querySelector('span')?.textContent || '').trim() === want
      ) as HTMLElement | undefined
      if (!btn) throw new Error(`openMaterialDetail: no assigned material "${want}"`)
      btn.click()
    }, name)
    await this.materialDetail(name).waitForExist({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the properties popup for "${name}" never opened`
    })
  }

  /** The read-only detail popup. Its aria-label is `{name} properties`. */
  materialDetail(name: string): El {
    return $(`[role="dialog"][aria-label="${name} properties"]`)
  }

  /** Section headings inside the detail popup, in DOM order. */
  async detailSections(name: string): Promise<string[]> {
    return browser.execute((want: string) => {
      const popup = document.querySelector(`[role="dialog"][aria-label="${want} properties"]`)
      return Array.from(popup?.querySelectorAll('[aria-expanded]') ?? [])
        .map((b) => (b.textContent || '').trim())
        .filter((t) => t.length > 0)
    }, name) as Promise<string[]>
  }

  async closeMaterialDetail(name: string): Promise<void> {
    await browser.execute((want: string) => {
      const popup = document.querySelector(`[role="dialog"][aria-label="${want} properties"]`)
      const btn = popup?.querySelector('[aria-label="Close material properties"]') as HTMLElement | null
      btn?.click()
    }, name)
  }

  /** The unassign confirmation. [open] is load-bearing — three dialogs live here. */
  get unassignDialog(): El {
    return $('dialog[aria-label="Unassign Material"][open]')
  }

  /** The replace confirmation, which SAVE raises — not the picker. */
  get replaceDialog(): El {
    return $('dialog[aria-label="Replace Material"][open]')
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
