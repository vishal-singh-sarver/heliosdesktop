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
import RightPanel from './RightPanel.page'

type El = ReturnType<typeof $>

/**
 * One label/value pair out of the read-only material detail popup.
 *
 * Rows carry their SECTION because a material may hold several material TYPES
 * and each renders its own <dl>: a label like "R" or "gs, o" means nothing
 * without saying which type's it is. Two properties can also share a label
 * across types (`two_sided_heat_transfer` is "Heat Transfer Flag" on four of
 * them), so section+label is the only stable key.
 */
export interface DetailRow {
  /** The material TYPE heading this row sits under. */
  section: string
  /** The catalog label rendered in the <dt>. */
  label: string
  /** The stored value in the <dd> — '' when the material never set it. */
  value: string
}

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

/**
 * What a save helper waits FOR.
 *
 *  - 'saved'   (the default) the write LANDED: the in-flight window is over AND
 *              Save is no longer offered, because UPDATE_OBJECT_SUCCEEDED folded
 *              the saved values into the baseline and cleared `dirty`. A save that
 *              fails, or that raises the Replace confirmation instead of saving,
 *              throws straight away naming what happened rather than after 60s.
 *  - 'settled' the in-flight window is over, WHATEVER the outcome. For a caller
 *              that expects the save to fail (an injected API fault) and asserts
 *              the error itself. Returns at once when Save opened a dialog
 *              instead, since no request was ever made.
 */
export type SaveOutcome = 'saved' | 'settled'

/** ObjectPropertiesForm renders `draft.saving ? 'Saving…' : 'Save'` — a literal, not in messages.ts. */
const SAVE_IDLE_LABEL = 'Save'

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
    // Same panel as the Material Properties form: wait out its opening width
    // transition, or the fields are 0px wide. See RightPanel.waitForExpanded.
    await RightPanel.waitForExpanded()
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

    // A field that is not on screen is NOT a field that is "valid and empty".
    //
    // Every read below degrades to exactly the shape of a healthy, untouched
    // input — { value: '', error: null, invalid: false } — so without this guard
    // a form that never mounted, a row that was never selected, or a renamed
    // field all satisfy assertions like "the field shows no error". Around 17
    // assertions across the geometry and material specs compare against that
    // precise triple, which makes the failure mode both silent and widespread.
    //
    // The per-command catches below are kept deliberately: they absorb genuine
    // transient tear (the tooltip mounting/unmounting mid-read), which is a
    // different problem from the element not being there at all.
    if (!(await input.isExisting())) {
      throw new Error(
        `ObjectProperties.fieldState('${name}'): the field is not in the DOM.\n` +
          '  Reading it would return { value: "", error: null, invalid: false }, which is ' +
          'indistinguishable from a healthy empty field — so this throws instead of ' +
          'reporting a false pass.\n' +
          '  Check the Properties form is open and the intended row is selected.'
      )
    }

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
    // Wait for focus before sending the select-all chord.
    //
    // Without this the sequence is timing-dependent: under full-suite load the
    // click can still be settling when Control+A arrives, the chord goes to the
    // document instead of the input, Delete clears nothing, and the typed text
    // is APPENDED to the blueprint default. That surfaced as a flake asserting
    // "101.1234567" against an expected "1.1234567" — the guard had worked
    // correctly and only the clear had failed. Passes in isolation, fails in a
    // full run, which is the signature worth removing.
    await browser.waitUntil(async () => el.isFocused(), {
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: `the ${name} field never took focus, so select-all would miss it`
    })
    // Confirm the clear actually took before typing, and redo it if not. A focus
    // wait alone was not enough: in a full run on 15 Sep 2026 the field was
    // focused, yet `1e` still landed on top of the default — "101e" against an
    // expected "1e" (ground.test.ts, the incomplete-exponent blur test; passed in
    // the three runs before). Whatever left the default in place, typing into a
    // field that does not read '' can only produce a wrong-but-plausible value.
    await browser.waitUntil(
      async () => {
        await browser.keys([process.platform === 'darwin' ? 'Meta' : 'Control', 'a'])
        await browser.keys(['Delete'])
        return (await el.getValue()) === ''
      },
      {
        timeout: TIMEOUTS.SHORT,
        interval: 150,
        timeoutMsg: `the ${name} field would not clear, so typed text would append to its old value`
      }
    )
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

  /**
   * Every VALUE row in the read-only detail popup, tagged with its section.
   *
   * MaterialPropertiesPopup renders each property as a <dt> (the catalog label)
   * over a <dd> (the stored value), inside one <dl> per parameter group, inside
   * one collapsible card per material TYPE. detailSections() reads only the
   * headings, so this is the only way to read a VALUE off a ground.
   *
   * The section header button is a direct child of its card, so the card is its
   * parentElement — there is no testid on either.
   *
   * Two things to know before asserting on the result:
   *  - The popup lists EVERY catalog property of an active group, including the
   *    ones the material never set; those come back with value ''. So assert per
   *    row, never on the whole popup's text.
   *  - A SELECTOR enum shows the stored code HUMANIZED ('farquhar_model' →
   *    'Farquhar Model', 'BWB' → 'BWB'), which is NOT the label the editable
   *    Materials form shows for the same value (there it is the group name,
   *    'Farquhar model' / 'Ball-woodrow-berry'). Map through the catalog, not
   *    through what you typed.
   */
  async detailRows(name: string): Promise<DetailRow[]> {
    return browser.execute((want: string) => {
      const out: { section: string; label: string; value: string }[] = []
      const popup = document.querySelector(`[role="dialog"][aria-label="${want} properties"]`)
      Array.from(popup?.querySelectorAll('[aria-expanded]') ?? []).forEach((btn) => {
        const section = (btn.textContent || '').trim()
        Array.from(btn.parentElement?.querySelectorAll('dl > div') ?? []).forEach((pair) => {
          out.push({
            section,
            label: (pair.querySelector('dt')?.textContent || '').trim(),
            value: (pair.querySelector('dd')?.textContent || '').trim()
          })
        })
      })
      return out
    }, name) as Promise<DetailRow[]>
  }

  /**
   * One row's value, by section and label.
   *
   * Returns a self-describing miss rather than throwing or returning '', so a
   * failed expectation reads `<no "Vcmax_25" row in Photosynthesis>` instead of
   * the empty string a genuinely-blank field also produces. Those two cases mean
   * very different things and must not look alike in a diff.
   */
  valueIn(rows: DetailRow[], section: string, label: string): string {
    const row = rows.find((r) => r.section === section && r.label === label)
    return row ? row.value : `<no "${label}" row in ${section}>`
  }

  /**
   * `src` of every image rendered inside the detail popup.
   *
   * buildMaterialSections turns a member's `texture_file` into a row carrying an
   * `image`, so a non-empty result is how an UPLOADED texture proves it reached
   * the geometry's material data — the nearest DOM-readable thing to "the
   * texture is on the ground". Whether the surface is actually painted with it
   * stays manual: nothing available to WebDriver reads pixels out of the WebGL
   * canvas.
   */
  async detailImages(name: string): Promise<string[]> {
    return browser.execute((want: string) => {
      const popup = document.querySelector(`[role="dialog"][aria-label="${want} properties"]`)
      return Array.from(popup?.querySelectorAll('img') ?? [])
        .map((i) => i.getAttribute('src') ?? '')
        .filter((s) => s.length > 0)
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
   * The Save button's label: 'Save' at rest, 'Saving…' for EXACTLY the window
   * the PATCH is in flight. The reducer sets `draft.saving` on
   * UPDATE_OBJECT_REQUESTED and clears it on SUCCEEDED and FAILED alike.
   *
   * textContent through an ELEMENT command, deliberately. Not getText: that
   * returns '' for a control WebDriver considers hidden (clipped by the panel's
   * own scroller), which would read as "never settled". Not browser.execute: a
   * pending page error would surface there (see fieldState).
   */
  async saveLabel(): Promise<string> {
    return String((await this.saveButton.getProperty('textContent')) ?? '').trim()
  }

  /**
   * The form-level save error (`draft.saveError`), or null.
   *
   * `.form-error-text` has exactly two render sites in this form and the other
   * is gated on `objectDeleted`, so the selector is unambiguous. UPDATE_OBJECT_
   * REQUESTED clears `saveError`, so anything here after a click belongs to THAT
   * save. Element commands for the same reason as saveLabel.
   */
  async formError(): Promise<string | null> {
    const el = $('[data-testid="object-properties-form"] .form-error-text')
    if (!(await el.isExisting())) return null
    return String((await el.getProperty('textContent')) ?? '').trim()
  }

  /**
   * Press Save, having first proved it is actually available.
   *
   * Without the gate a disabled Save clicks nothing, and every "the save landed"
   * oracle downstream is satisfied by the button that was disabled all along: a
   * pass for the wrong reason. A caller asserting that Save is BLOCKED (invalid
   * or clean form) must read saveEnabled() instead; this times out on purpose.
   *
   * Split from waitForSaveSettled so a caller can do something between the click
   * and the settle: confirm the Replace dialog, or catch a ~2.66s toast.
   */
  async clickSave(): Promise<void> {
    await browser.waitUntil(async () => this.saveEnabled(), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Save never enabled: the form did not become dirty, or it is invalid'
    })
    await this.saveButton.click()
  }

  /**
   * Wait for a save to be OVER. `outcome` says what "over" must mean; see SaveOutcome.
   *
   * `disabled` alone is NOT a settle, and this used to trust it. The button is
   * disabled both WHILE the PATCH is in flight (`draft.saving`) and once it has
   * landed and cleared `dirty`, so the first poll after the click could pass
   * while the request was still pending. A reselect or a refresh straight after
   * then raced the write (geometry.test.ts save round-trip and persistence,
   * ground.test.ts maxima). The LABEL is the discriminator: it cannot read
   * 'Save' again until SUCCEEDED or FAILED has been reduced.
   *
   * No early-read hazard: the click dispatches UPDATE_OBJECT_REQUESTED
   * synchronously and React commits a discrete-event update before the click
   * command returns, so the first poll already sees 'Saving…'.
   *
   * For 'saved', idle + STILL ENABLED means the save did not land. It is ended
   * early when the reason is on screen (a form error, or the Replace dialog
   * that Save raises instead of saving). Otherwise it keeps polling, since a
   * value typed mid-save legitimately re-enables Save.
   *
   * 100ms interval, not the default 500: both sagas raise the saved toast
   * immediately after SUCCEEDED, and several callers wait for that ~2.66s toast
   * right after this returns.
   *
   * MUTATION (60s) because a 1000x1000 build measured 10.9s (large-ground.test.ts).
   * The diagnostic is built INSIDE the condition and thrown from the catch: a
   * template literal in timeoutMsg is evaluated before the first poll.
   */
  async waitForSaveSettled(outcome: SaveOutcome = 'saved'): Promise<void> {
    let last = 'no reading taken'
    let failure = null as string | null
    try {
      await browser.waitUntil(
        async () => {
          const label = await this.saveLabel()
          const enabled = await this.saveEnabled()
          last = `label "${label}", Save ${enabled ? 'enabled' : 'disabled'}`
          if (label !== SAVE_IDLE_LABEL) return false
          if (outcome === 'settled' || !enabled) return true
          const error = await this.formError()
          if (error !== null) {
            failure = `the save FAILED, and the form reports "${error}"`
            return true
          }
          if (await this.replaceDialog.isExisting()) {
            failure =
              'Save raised the Replace Material confirmation instead of saving. Use clickSave(), ' +
              'confirm the dialog, then waitForSaveSettled()'
            return true
          }
          return false
        },
        { timeout: TIMEOUTS.MUTATION, interval: 100 }
      )
    } catch (err) {
      throw new Error(
        `ObjectProperties: the save never ${outcome === 'saved' ? 'landed' : 'settled'} ` +
          `within ${TIMEOUTS.MUTATION}ms (last seen: ${last}). ` +
          (err instanceof Error ? err.message : String(err))
      )
    }
    if (failure !== null) throw new Error(`ObjectProperties.waitForSaveSettled: ${failure}`)
  }

  /**
   * Press Save and wait for the write to LAND (default), or only for it to be
   * over (`'settled'`). Not for the Replace path: that needs a dialog between the
   * click and the settle, so drive clickSave() + waitForSaveSettled() instead.
   */
  async save(outcome: SaveOutcome = 'saved'): Promise<void> {
    await this.clickSave()
    await this.waitForSaveSettled(outcome)
  }

  async nameValue(): Promise<string> {
    return this.nameInput.getValue()
  }

  // ===== The name row: double-click, blur-commit, validation tooltip =====
  //
  // THREE THINGS DECIDE HOW THESE ARE WRITTEN:
  //
  // 1. THE NAME IS READ-ONLY UNTIL IT IS DOUBLE-CLICKED. The pencil that used to
  //    unlock it was removed in 10a5a51; while locked the input carries
  //    GEOMETRY_MSG.renameHint as its `title`. Writing into it without editName()
  //    first still mutates the draft — React does not honour `readOnly` against a
  //    native-setter write — so a test that skips the double-click proves nothing
  //    about the lock.
  // 2. IT COMMITS ON BLUR, not on Enter and not via Save. `handleNameBlur`
  //    (ObjectPropertiesForm.tsx:899) is the only path to renameRequested, and
  //    Save is field-only — `dirty` never consults the name.
  // 3. THE ERROR TOOLTIP IS NOT IN A formfield-{name} BOX. For the numeric
  //    fields the trigger sits inside `formfield-{property}`; the name's sits as
  //    a SIBLING of the input inside its own `relative` wrapper. Scoping a
  //    `[aria-label^="Validation error:"]` query to the form would match every
  //    field's tooltip too, so it is read from the input's parentElement.

  /** The REMOVED pencil (10a5a51). An absence oracle only — it must not exist. */
  get editNameButton(): El {
    return this.form.$('button[aria-label="Edit name"]')
  }

  /** The header trash. Same scoping reason as the pencil. */
  get deleteButton(): El {
    return this.form.$('button[aria-label="Delete geometry"]')
  }

  /**
   * The "This geometry was deleted. Close the panel." notice.
   *
   * UNREACHABLE from the GUI's own delete: DELETE_NODE_SUCCEEDED nulls
   * createDraft whenever the removed object is the one on screen, so the form
   * unmounts instead of entering the deleted state (reducer.ts:465-470).
   * Reaching it needs the node to vanish from nodesById while the draft
   * survives — a LIST_NODES refetch after a delete performed elsewhere. Kept
   * addressable for whoever tests that path.
   */
  get deletedNotice(): El {
    return this.form.$('p[role="alert"]')
  }

  /**
   * The name tooltip's trigger. An ADJACENT-SIBLING selector, because the name's
   * Tooltip renders immediately after the input inside its `relative` wrapper —
   * unlike the numeric fields, whose triggers sit inside a formfield-{name} box.
   * Scoping to the form instead would match every field's tooltip as well.
   */
  private get nameTooltip(): El {
    return $('[data-testid="object-name"] + span[aria-label^="Validation error:"]')
  }

  /**
   * Value + lock + disabled + validation message.
   *
   * READ WITH ELEMENT COMMANDS, NEVER browser.execute. Committing an invalid
   * name makes the app throw out of its change/blur handler, and WebdriverIO
   * holds that pending page error and re-raises it on the NEXT `execute/sync` —
   * so a browser.execute read comes back as
   * `WebDriverError: Geometry name already exists`, the app's own copy arriving
   * as a driver failure instead of the value under assertion. It fails the
   * command rather than the expectation, and names the wrong cause. The same
   * trap governs fieldState's callers on an out-of-range field.
   */
  async nameState(): Promise<{
    value: string
    readOnly: boolean
    disabled: boolean
    error: string | null
  }> {
    await this.nameInput.waitForExist({ timeout: TIMEOUTS.MEDIUM })
    const value = await this.nameInput.getValue()
    // React removes the attribute entirely when the field is unlocked.
    const readOnly = (await this.nameInput.getAttribute('readonly')) !== null
    const disabled = !(await this.nameInput.isEnabled())
    const error = (await this.nameTooltip.isExisting())
      ? await this.nameTooltip.getAttribute('data-tooltip-content')
      : null
    return { value, readOnly, disabled, error }
  }

  /** The name input's hover hint (`title`) — present only while it is locked. */
  async nameHint(): Promise<string | null> {
    return this.nameInput.getAttribute('title')
  }

  /**
   * Double-click the name and wait for the field to actually unlock.
   *
   * Dispatched in-page on the input itself: the double-click is the only way in
   * since the pencil was removed.
   */
  async editName(): Promise<void> {
    await this.nameInput.waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await browser.execute(() => {
      const el = document.querySelector('[data-testid="object-name"]')
      if (!el) throw new Error('editName: the Properties form has no name input')
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })
    await browser.waitUntil(async () => !(await this.nameState()).readOnly, {
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: 'double-clicking the name never unlocked it'
    })
  }

  /**
   * Write a name WITHOUT committing it.
   *
   * The native value setter plus an `input` event, because a plain setValue()
   * loses to React on a controlled input — the same technique setField uses.
   * Commit is a separate step: see commitName().
   */
  async setName(value: string): Promise<void> {
    await this.nameInput.waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await browser.execute((val: string) => {
      const node = document.querySelector('[data-testid="object-name"]') as HTMLInputElement | null
      if (!node) throw new Error('setName: the Properties form has no name input')
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      node.focus()
      setter?.call(node, val)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  }

  /** Blur the name field — the ONLY thing that commits a rename. */
  async commitName(): Promise<void> {
    await browser.execute(() => {
      const node = document.querySelector('[data-testid="object-name"]') as HTMLInputElement | null
      node?.blur()
    })
  }

  /**
   * Consume a pending page error so it cannot fail an unrelated later command.
   *
   * A rejected rename makes the app throw asynchronously, out of its own
   * handler. WebdriverIO stores that and re-raises it on the NEXT execute/sync
   * — which is typically some later helper (Geometry.rowState snapshots through
   * browser.execute), so the run dies mid-teardown reporting
   * "Geometry name already exists" against a command that had nothing to do
   * with it. Burning it deliberately keeps the failure where it belongs.
   */
  async drainPageError(): Promise<void> {
    try {
      await browser.execute(() => undefined)
    } catch {
      // That WAS the stored page error. It is now cleared.
    }
  }

  /** The name's validation message, waiting briefly for it to appear.
   *  `timeout` is widened to `number` deliberately — TIMEOUTS is a const object,
   *  so an inferred default would fix the parameter to that one literal and
   *  reject every other entry in the table. */
  async nameError(timeout: number = TIMEOUTS.SHORT): Promise<string | null> {
    try {
      await browser.waitUntil(async () => (await this.nameState()).error !== null, { timeout })
    } catch {
      // No error appeared inside the window — the caller asserts on null.
    }
    const { error } = await this.nameState()
    // The message is on screen, so the app has already thrown if it was going
    // to. Clear it here rather than leaving it for the next unrelated command.
    await this.drainPageError()
    return error
  }
}

export default new ObjectPropertiesPage()
