/**
 * Material Properties — the right-hand panel for a selected material.
 *
 * Selector model (deliberately aria/role-driven; no new source testids needed):
 *  - form name input        [data-testid="material-form-name"]
 *  - "Add Material Type"    [data-testid="toolbar-material-type"] (from the
 *                           ToolbarButton label; its ARIA name is different)
 *  - a card                 [data-testid="material-card-{cardId}"]
 *  - a card's Save          [data-testid="material-card-save-{cardId}"]
 *  - card chrome            button[aria-label="Toggle Material Type.01"] and
 *                           button[aria-label="Remove Material Type.01"]
 *  - type dropdown          input[role="combobox"][aria-label="Material Type.01"]
 *  - visualiser tabs        button with text Custom / Select Texture, aria-pressed
 *  - colour channels        [data-testid="color-channel-{r|g|b|opacity}"]
 *  - texture tiles          button[aria-label="Use texture <name>"][aria-pressed]
 *  - spectral toggle        [role="switch"][aria-label="Apply spectral data"]
 *
 * TWO IDs, DO NOT CONFUSE THEM:
 *   cardId  = group.id      — monotonic; what field names and testids key on
 *   number  = group.number  — the DISPLAY number in "Material Type.0N"
 * They coincide on a fresh material and diverge after a card is removed.
 * cardIdForTitle() is the only sanctioned bridge between them.
 *
 * The type dropdown's listbox is PORTALLED to document.body — never scope it
 * under the panel. It is also parked at top/left:-9999 until measured, so its
 * options are read and clicked IN-PAGE rather than by coordinate.
 */

import { TIMEOUTS } from '../config/timeouts'
import RightPanel from './RightPanel.page'

type El = ReturnType<typeof $>

/**
 * What saveCard / waitForCardSaveSettled wait FOR.
 *
 *  - 'saved'   (the default) the member write LANDED: the in-flight window is
 *              over, Save is no longer offered (SAVE_PARAMETER_GROUP_SUCCEEDED
 *              snapshots savedValues, so the card is clean) AND the type Select
 *              is locked (`group.saved`, which only that action sets). A save
 *              that fails throws at once with the card's own error text.
 *  - 'settled' the in-flight window is over, WHATEVER the outcome. For a caller
 *              that expects the save to fail and asserts the error itself.
 */
export type CardSaveOutcome = 'saved' | 'settled'

/** messages.saveParameterGroup, the label a card's Save shows at rest. While the
 *  write is in flight it reads messages.savingParameterGroup ('Saving…'). */
const CARD_SAVE_IDLE_LABEL = 'Save'

class MaterialPropertiesPage {
  get form(): El {
    return $('[data-testid="material-form"], [data-testid="right-panel"]')
  }
  get nameInput(): El {
    return $('[data-testid="material-form-name"]')
  }
  get addTypeButton(): El {
    return $('[data-testid="toolbar-material-type"]')
  }
  card(cardId: number): El {
    return $(`[data-testid="material-card-${cardId}"]`)
  }
  cardSave(cardId: number): El {
    return $(`[data-testid="material-card-save-${cardId}"]`)
  }

  async waitForOpen(): Promise<void> {
    await this.nameInput.waitForDisplayed({
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'the Material Properties form never opened'
    })
    // "Displayed" is not "clickable": the right panel may still be widening, with
    // this form 0px wide inside it. See RightPanel.waitForExpanded.
    await RightPanel.waitForExpanded()
  }

  // ===== Cards =====

  /** Card ids present, in DOM order. */
  async cardIds(): Promise<number[]> {
    return (await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid^="material-card-"]'))
        .map((el) => (el.getAttribute('data-testid') || '').replace('material-card-', ''))
        // Exclude material-card-save-{id}, which shares the prefix.
        .filter((s) => /^\d+$/.test(s))
        .map(Number)
    )) as number[]
  }

  /** The visible heading of a card, e.g. "Material Type.01". */
  async cardTitle(cardId: number): Promise<string> {
    return (await browser.execute((id: number) => {
      const el = document.querySelector(`[data-testid="material-card-${id}"]`)
      const toggle = el?.querySelector('[aria-label^="Toggle Material Type."]')
      return (toggle?.getAttribute('aria-label') || '').replace('Toggle ', '')
    }, cardId)) as string
  }

  /** THE bridge from a display title to the cardId everything else keys on. */
  async cardIdForTitle(title: string): Promise<number | null> {
    for (const id of await this.cardIds()) {
      if ((await this.cardTitle(id)) === title) return id
    }
    return null
  }

  /** Add a type card and return its new cardId (diffed, never assumed). */
  async addCard(): Promise<number> {
    const before = new Set(await this.cardIds())
    await this.addTypeButton.click()
    let created = -1
    await browser.waitUntil(
      async () => {
        const fresh = (await this.cardIds()).filter((id) => !before.has(id))
        if (!fresh.length) return false
        created = fresh[0]
        return true
      },
      { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'Add Material Type did not add a card' }
    )
    return created
  }

  async addTypeEnabled(): Promise<boolean> {
    return this.addTypeButton.isEnabled()
  }

  async removeCard(cardId: number): Promise<void> {
    const title = await this.cardTitle(cardId)
    await browser.execute((label: string) => {
      const btn = document.querySelector(`[aria-label="Remove ${label}"]`) as HTMLElement | null
      if (!btn) throw new Error(`removeCard: no remove control for ${label}`)
      btn.click()
    }, title)
  }

  async toggleCard(cardId: number): Promise<void> {
    const title = await this.cardTitle(cardId)
    await browser.execute((label: string) => {
      const btn = document.querySelector(`[aria-label="Toggle ${label}"]`) as HTMLElement | null
      if (!btn) throw new Error(`toggleCard: no toggle for ${label}`)
      btn.click()
    }, title)
  }

  async cardOpen(cardId: number): Promise<boolean> {
    const title = await this.cardTitle(cardId)
    const el = $(`[aria-label="Toggle ${title}"]`)
    return (await el.getAttribute('aria-expanded')) === 'true'
  }

  // ===== Type dropdown (portalled Select) =====

  private async typeCombo(cardId: number): Promise<El> {
    const title = await this.cardTitle(cardId)
    return $(`[role="combobox"][aria-label="${title}"]`)
  }

  async openTypeDropdown(cardId: number): Promise<void> {
    const title = await this.cardTitle(cardId)
    const sel = `[role="combobox"][aria-label="${title}"]`
    // AWAITED. This used to be `;(await this.typeCombo(cardId)).click()` — a
    // floating promise, so a click that failed (not interactable, a stale node)
    // was silently dropped and the only symptom was "the listbox never opened"
    // 10s later. The real click stays the first attempt; its error is logged
    // rather than thrown so the in-page fallback below still gets its turn.
    await $(sel)
      .click()
      .catch((e: Error) => console.warn(`[openTypeDropdown] WebDriver click failed: ${e.message}`))
    // Wait on THIS combobox's own aria-expanded, not on any listbox in the page.
    // Both the input's onFocus and onClick call the idempotent openList
    // (Select/index.tsx), so re-requesting them in-page can never close it.
    //
    // The diagnostic is thrown from the CATCH, not passed as timeoutMsg. A
    // template literal in the options object is evaluated when waitUntil is
    // CALLED, before the first poll, so `last` was always '' and every timeout
    // read `(<sel>: )`, dropping exactly the state it exists to report.
    let last = 'no reading taken'
    try {
      await browser.waitUntil(
        async () => {
          last = (await browser.execute((s: string) => {
            const input = document.querySelector(s) as HTMLElement | null
            if (!input) return 'combobox missing'
            if (input.getAttribute('aria-expanded') === 'true') {
              const list = document.getElementById(input.getAttribute('aria-controls') ?? '')
              return list ? 'open' : 'expanded, but no listbox (no options?)'
            }
            input.focus()
            input.click()
            return 'closed — re-requested open in-page'
          }, sel)) as string
          return last === 'open'
        },
        { timeout: TIMEOUTS.MEDIUM, interval: 250 }
      )
    } catch (err) {
      throw new Error(
        `the material type listbox never opened (${sel}: ${last}). ` +
          (err instanceof Error ? err.message : String(err))
      )
    }
  }

  /** Option labels currently offered, and whether each is disabled/taken. */
  async typeOptions(): Promise<{ label: string; disabled: boolean; selected: boolean }[]> {
    return (await browser.execute(() =>
      Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).map((o) => ({
        label: (o.textContent || '').trim(),
        disabled: (o as HTMLButtonElement).disabled === true,
        selected: o.getAttribute('aria-selected') === 'true'
      }))
    )) as { label: string; disabled: boolean; selected: boolean }[]
  }

  /** Pick by label, clicking IN-PAGE (the list is parked off-screen at first). */
  async pickType(cardId: number, label: string): Promise<void> {
    await this.openTypeDropdown(cardId)
    // The listbox EXISTING is not the same as its options being there: the list
    // mounts parked off-screen and its options render a moment later. Picking on
    // the first sample threw `pickType: no option "Visualiser"` once in a full
    // run (15 Sep 2026) on a test that passes standalone. Wait for THIS label,
    // and report what was offered if it never comes.
    // Thrown from the catch for the same reason as openTypeDropdown: as a
    // timeoutMsg, `offered` was captured before the first poll and always read [].
    let offered: string[] = []
    try {
      await browser.waitUntil(
        async () => {
          offered = (await this.typeOptions()).map((o) => o.label)
          return offered.includes(label)
        },
        { timeout: TIMEOUTS.MEDIUM }
      )
    } catch (err) {
      throw new Error(
        `pickType: the type list never offered "${label}" (offered: ${JSON.stringify(offered)}). ` +
          (err instanceof Error ? err.message : String(err))
      )
    }
    await browser.execute((want: string) => {
      const opt = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).find(
        (o) => (o.textContent || '').trim() === want
      ) as HTMLElement | undefined
      if (!opt) throw new Error(`pickType: no option "${want}"`)
      opt.click()
    }, label)
  }

  /** Selected type label. MUST be read while CLOSED — a searchable Select shows
   *  the live query instead of the selection while open. */
  async selectedType(cardId: number): Promise<string> {
    return (await this.typeCombo(cardId)).getValue()
  }

  async typeLocked(cardId: number): Promise<boolean> {
    return !(await (await this.typeCombo(cardId)).isEnabled())
  }

  // ===== Fields (FormField derives `input-{cardId}-{property}`) =====

  field(cardId: number, property: string): El {
    return $(`[data-testid="input-${cardId}-${property}"]`)
  }

  /**
   * Value + error + aria-invalid via ELEMENT commands.
   * Not browser.execute: an out-of-range field raises a global error in this
   * app, and WebdriverIO surfaces a pending page error on the next
   * execute/sync — turning a read into a driver error carrying the app's own
   * validation copy. Same trap as the Ground form.
   */
  async fieldState(
    cardId: number,
    property: string
  ): Promise<{ value: string; error: string | null; invalid: boolean }> {
    const input = this.field(cardId, property)

    // A field that is not on screen is NOT a field that is "valid and empty".
    // Every read below degrades to { value: '', error: null, invalid: false },
    // which is exactly a healthy untouched input — so a card that never rendered,
    // or a property renamed in the catalog, would satisfy "shows no error".
    // See the twin guard in ObjectProperties.fieldState for the full reasoning.
    if (!(await input.isExisting())) {
      throw new Error(
        `MaterialProperties.fieldState(${cardId}, '${property}'): the field is not in the DOM.\n` +
          '  Reading it would return { value: "", error: null, invalid: false }, which is ' +
          'indistinguishable from a healthy empty field — so this throws instead of ' +
          'reporting a false pass.\n' +
          '  Check the card is open and the property exists on this material type.'
      )
    }

    const value = (await input.getValue().catch(() => '')) as string
    const invalid = (await input.getAttribute('aria-invalid').catch(() => null)) === 'true'
    const tip = $(`[data-testid="formfield-${cardId}-${property}"]`).$(
      '[aria-label^="Validation error:"]'
    )
    const error = (await tip.isExisting().catch(() => false))
      ? await tip.getAttribute('data-tooltip-content').catch(() => null)
      : null
    return { value, error, invalid }
  }

  async setField(cardId: number, property: string, value: string): Promise<void> {
    const sel = `[data-testid="input-${cardId}-${property}"]`
    await $(sel).waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await browser.execute(
      (s: string, val: string) => {
        const node = document.querySelector(s) as HTMLInputElement | null
        if (!node) throw new Error(`setField: no input for ${s}`)
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set
        node.focus()
        setter?.call(node, val)
        // Isolated: an invalid value makes a downstream subscriber rethrow the
        // validation message, which would escape as a WebDriverError.
        try {
          node.dispatchEvent(new Event('input', { bubbles: true }))
          node.dispatchEvent(new Event('change', { bubbles: true }))
        } catch {
          /* see above */
        }
      },
      sel,
      value
    )
  }

  // ===== Enum fields (a catalog `enum` property) =====
  //
  // THESE NEED THEIR OWN HELPERS, and this is the single mechanical reason
  // every material dropdown was untested.
  //
  // FormField branches on `options`. For a text/number field it puts
  // `input-{name}` on the real <input>. For an ENUM it renders components/Select
  // instead and puts `input-{name}` on a WRAPPER DIV — its own comment says
  // "The test id sits on the wrapper, not the control: Select renders a button
  // (or a filter input) rather than a native <select>, so there is no single
  // element that carries the old input-<name> contract."
  //
  // So setField()/fieldState() — which resolve that testid and call the
  // HTMLInputElement value setter on it — throw `Illegal invocation` against a
  // <div> for every enum property. Use these instead.
  //
  // FormField passes no `ariaLabel` and no `searchable`, so the control is the
  // BUTTON branch of Select: `role="combobox"` whose visible <span> reads the
  // selected label, or the placeholder ("Select") when nothing is chosen. Its
  // listbox is PORTALLED to document.body and falls back to `name` for its
  // aria-label — i.e. `{cardId}-{property}`. Query it from the ROOT.

  /** The combobox button for an enum field. */
  enumControl(cardId: number, property: string): El {
    return $(`[data-testid="input-${cardId}-${property}"] [role="combobox"]`)
  }

  /** Portalled listbox for an enum field. NEVER scope this under the panel. */
  enumList(cardId: number, property: string): El {
    return $(`[role="listbox"][aria-label="${cardId}-${property}"]`)
  }

  /**
   * Label, enabled and invalid state in one read.
   *
   * `label` is what the user SEES: the chosen option's label, or the "Select"
   * placeholder when the field is empty. There is no value attribute to read —
   * Select keeps the value in React state, not in the DOM.
   */
  async enumState(
    cardId: number,
    property: string
  ): Promise<{ label: string; enabled: boolean; invalid: boolean; expanded: boolean }> {
    const el = this.enumControl(cardId, property)
    return {
      label: ((await el.getText().catch(() => '')) as string).trim(),
      enabled: await el.isEnabled().catch(() => false),
      invalid: (await el.getAttribute('aria-invalid').catch(() => null)) === 'true',
      expanded: (await el.getAttribute('aria-expanded').catch(() => null)) === 'true'
    }
  }

  /** Open an enum's listbox. Clicked in-page: a card can be scrolled out of view. */
  async openEnum(cardId: number, property: string): Promise<void> {
    await browser.execute((sel: string) => {
      const btn = document.querySelector(sel) as HTMLElement | null
      if (!btn) throw new Error(`openEnum: no combobox for ${sel}`)
      btn.click()
    }, `[data-testid="input-${cardId}-${property}"] [role="combobox"]`)
    await this.enumList(cardId, property).waitForExist({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the ${property} listbox never opened on card ${cardId}`
    })
  }

  /**
   * Options currently offered, with their state.
   *
   * `disabled` is Select's "already taken elsewhere" rendering — the option is
   * still LISTED so the user can see it exists, but cannot be chosen.
   */
  async enumOptions(
    cardId: number,
    property: string
  ): Promise<{ label: string; selected: boolean; disabled: boolean }[]> {
    return (await browser.execute((label: string) => {
      const list = document.querySelector(`[role="listbox"][aria-label="${label}"]`)
      return Array.from(list?.querySelectorAll('[role="option"]') ?? []).map((o) => ({
        label: (o.textContent || '').trim(),
        selected: o.getAttribute('aria-selected') === 'true',
        disabled: (o as HTMLButtonElement).disabled === true
      }))
    }, `${cardId}-${property}`)) as { label: string; selected: boolean; disabled: boolean }[]
  }

  /** Open, pick by exact label, and wait for the control to show it. */
  async setEnum(cardId: number, property: string, label: string): Promise<void> {
    await this.openEnum(cardId, property)
    await browser.execute(
      (listLabel: string, want: string) => {
        const list = document.querySelector(`[role="listbox"][aria-label="${listLabel}"]`)
        const opt = Array.from(list?.querySelectorAll('[role="option"]') ?? []).find(
          (o) => (o.textContent || '').trim() === want
        ) as HTMLElement | undefined
        if (!opt) throw new Error(`setEnum: no option "${want}" in ${listLabel}`)
        opt.click()
      },
      `${cardId}-${property}`,
      label
    )
    await browser.waitUntil(async () => (await this.enumState(cardId, property)).label === label, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `${property} never showed "${label}" after picking it`
    })
  }

  /**
   * Close EVERY open Select, and wait until none is left open.
   *
   * An open Select listbox is portalled and sits above the panel, so a leaked
   * one intercepts later clicks the same way a leaked dialog does. Cheap
   * insurance in afterEach.
   *
   * ALL of them, not the first. This used to click only
   * `querySelector(...)`'s single match, and the SPECTRUM-pickers test opens two
   * (in-page clicks move no focus, so nothing blurs the first shut): the second
   * stayed expanded, and the shared afterEach reported "closed a leaked
   * full-screen overlay" in every full run (traced 17 Sep 2026).
   *
   * A button combobox toggles on click, but a SEARCHABLE Select's input only ever
   * opens on click (onClick={openList}) — that one is closed through its own
   * chevron button, which toggles.
   */
  async closeEnum(): Promise<void> {
    const expanded = '[role="combobox"][aria-expanded="true"]'
    const clicked = (await browser.execute((sel: string) => {
      const open = Array.from(document.querySelectorAll(sel)) as HTMLElement[]
      for (const combo of open) {
        const chevron =
          combo.tagName === 'INPUT'
            ? (combo.parentElement?.querySelector('button[aria-hidden="true"]') as HTMLElement | null)
            : null
        ;(chevron ?? combo).click()
      }
      return open.length
    }, expanded)) as number
    if (clicked === 0) return
    // Read-only polls: re-clicking here could toggle a closing Select back open.
    let left = clicked
    try {
      await browser.waitUntil(
        async () => {
          left = (await browser.execute(
            (sel: string) => document.querySelectorAll(sel).length,
            expanded
          )) as number
          return left === 0
        },
        { timeout: TIMEOUTS.SHORT, interval: 100 }
      )
    } catch (err) {
      throw new Error(
        `closeEnum: ${left} of ${clicked} open Select(s) stayed expanded. ` +
          (err instanceof Error ? err.message : String(err))
      )
    }
  }

  /** Whether a card currently renders a control for `property` at all. */
  async hasField(cardId: number, property: string): Promise<boolean> {
    return $(`[data-testid="input-${cardId}-${property}"]`).isExisting()
  }

  /** Every catalog property this card is currently rendering, in DOM order. */
  async renderedProps(cardId: number): Promise<string[]> {
    return (await browser.execute((id: number) => {
      const card = document.querySelector(`[data-testid="material-card-${id}"]`)
      return Array.from(card?.querySelectorAll('[data-testid^="input-"]') ?? [])
        .map((el) => (el.getAttribute('data-testid') || '').replace(`input-${id}-`, ''))
        .filter((s) => !s.startsWith('input-'))
    }, cardId)) as string[]
  }

  /** Per-character typing — REQUIRED for the keystroke guards, which reject the
   *  incoming value outright and so are invisible to a native-setter write. */
  async typeField(cardId: number, property: string, text: string): Promise<void> {
    const el = this.field(cardId, property)
    await el.click()
    // Confirm focus before the select-all chord: a chord that lands on the
    // document leaves the old value in place and the keystrokes APPEND to it
    // (the flake ObjectProperties.typeField documents). Re-request focus in-page
    // on a miss, as LightingDialog.type does.
    const sel = `[data-testid="input-${cardId}-${property}"]`
    await browser.waitUntil(
      async () => {
        if (await el.isFocused()) return true
        await browser.execute((s: string) => {
          ;(document.querySelector(s) as HTMLElement | null)?.focus()
        }, sel)
        return el.isFocused()
      },
      { timeout: 5_000, interval: 100, timeoutMsg: `${sel} never took focus, so select-all would miss it` }
    )
    await browser.keys([process.platform === 'darwin' ? 'Meta' : 'Control', 'a'])
    await browser.keys(['Delete'])
    for (const ch of text) await browser.keys([ch])
  }

  async commitField(): Promise<void> {
    await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
  }

  // ===== Visualiser =====

  visTab(which: 'custom' | 'texture'): El {
    return $(`button=${which === 'custom' ? 'Custom' : 'Select Texture'}`)
  }

  async activeVisTab(): Promise<'custom' | 'texture' | null> {
    const custom = await $('button=Custom')
    if (!(await custom.isExisting())) return null
    return (await custom.getAttribute('aria-pressed')) === 'true' ? 'custom' : 'texture'
  }

  colorChannel(which: 'r' | 'g' | 'b' | 'opacity'): El {
    return $(`[data-testid="color-channel-${which}"]`)
  }

  async setColorChannel(which: 'r' | 'g' | 'b' | 'opacity', value: string): Promise<void> {
    const sel = `[data-testid="color-channel-${which}"]`
    await browser.execute(
      (s: string, val: string) => {
        const node = document.querySelector(s) as HTMLInputElement | null
        if (!node) throw new Error(`setColorChannel: no input ${s}`)
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set
        node.focus()
        setter?.call(node, val)
        try {
          node.dispatchEvent(new Event('input', { bubbles: true }))
          node.dispatchEvent(new Event('change', { bubbles: true }))
        } catch {
          /* validation may rethrow */
        }
      },
      sel,
      value
    )
  }

  async colorChannelInvalid(which: 'r' | 'g' | 'b' | 'opacity'): Promise<boolean> {
    return (await this.colorChannel(which).getAttribute('aria-invalid')) === 'true'
  }

  /** Sub-tabs exist ONLY while the texture tab is active (conditionally
   *  rendered, not disabled — a documented deviation from the story). */
  subTab(which: 'library' | 'upload'): El {
    return $(`button=${which === 'library' ? 'From Library' : 'Upload File'}`)
  }

  get textureFileInput(): El {
    // A real hidden <input type=file>, not a native dialog — setValue works and
    // no IPC stub is needed (unlike the weather importer).
    return $('input[type="file"]')
  }

  async textureTiles(): Promise<{ name: string; selected: boolean }[]> {
    return (await browser.execute(() =>
      Array.from(document.querySelectorAll('[aria-label^="Use texture "]')).map((b) => ({
        name: (b.getAttribute('aria-label') || '').replace('Use texture ', ''),
        selected: b.getAttribute('aria-pressed') === 'true'
      }))
    )) as { name: string; selected: boolean }[]
  }

  // ===== Radiation =====

  get spectralToggle(): El {
    return $('[role="switch"][aria-label="Apply spectral data"]')
  }

  async spectralApplied(): Promise<boolean> {
    return (await this.spectralToggle.getAttribute('aria-checked')) === 'true'
  }

  // ===== File uploads (texture image + spectral XML) =====
  //
  // Both are real hidden <input type="file"> elements. WebDriver's own file
  // upload cannot drive them here — the inputs are `className="hidden"`, and the
  // app opens them through a button that calls fileInputRef.current.click(), so
  // there is no visible control to send a path to. The working route is to build
  // the File in the page and assign it through a DataTransfer, then dispatch a
  // BUBBLING `change`: React routes file inputs through the native change event
  // (shouldUseChangeEvent), so that is what its onChange listens for.
  //
  // Every query is scoped to the card. Unscoped, a spectral pick on a Radiation
  // card could resolve to a Visualiser card's texture input in the same form.

  /**
   * Hand a card's file input a TEXT file (spectral XML) built in the page.
   *
   * `text` is the real file's content, read in the node process by the caller —
   * these tests upload genuine fixtures from e2e/fixtures/materials rather than
   * hand-built strings.
   */
  async pickTextFile(
    cardId: number,
    fileName: string,
    text: string,
    mime = 'text/xml'
  ): Promise<void> {
    await browser.execute(
      (sel: string, name: string, body: string, type: string) => {
        const input = document.querySelector(`${sel} input[type="file"]`) as HTMLInputElement | null
        if (!input) throw new Error(`no file input inside ${sel}`)
        const dt = new DataTransfer()
        dt.items.add(new File([body], name, { type }))
        input.files = dt.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
      },
      `[data-testid="material-card-${cardId}"]`,
      fileName,
      text,
      mime
    )
  }

  /**
   * Hand a card's file input a BINARY file (a texture image) built in the page.
   *
   * The bytes travel as base64 because everything crossing into browser.execute
   * is JSON-serialised — a Buffer or a Uint8Array arrives as an object of
   * numeric keys, which File() then stringifies into garbage that fails the PNG
   * signature check. atob + a Uint8Array rebuilds the exact bytes, which matters:
   * validateTextureFile reads the real signature and decodes the image.
   */
  async pickBinaryFile(
    cardId: number,
    fileName: string,
    base64: string,
    mime = 'image/png'
  ): Promise<void> {
    await browser.execute(
      (sel: string, name: string, b64: string, type: string) => {
        const input = document.querySelector(`${sel} input[type="file"]`) as HTMLInputElement | null
        if (!input) throw new Error(`no file input inside ${sel}`)
        const binary = atob(b64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        const dt = new DataTransfer()
        dt.items.add(new File([bytes], name, { type }))
        input.files = dt.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
      },
      `[data-testid="material-card-${cardId}"]`,
      fileName,
      base64,
      mime
    )
  }

  /**
   * The card's visible error text, or null.
   *
   * Covers both the file-validation error and the upload error — they render
   * through the same `.form-error-text` paragraph.
   */
  async cardError(cardId: number): Promise<string | null> {
    return browser.execute((sel: string) => {
      const el = document.querySelector(`${sel} .form-error-text`)
      return el ? (el.textContent ?? '').trim() : null
    }, `[data-testid="material-card-${cardId}"]`)
  }

  // ----- Spectral file (Radiation) -----

  /**
   * True once a spectral file is STORED on the card.
   *
   * The Remove button is the oracle rather than the absence of an error: the
   * file row REPLACES the upload button entirely and renders only when
   * spectralPath is set, so its presence means the POST returned a path. An
   * error simply not appearing would also be true one frame before the upload
   * finished.
   */
  async spectralStored(cardId: number): Promise<boolean> {
    return this.spectralRemove(cardId).isExisting()
  }

  spectralRemove(cardId: number): El {
    return this.card(cardId).$('[aria-label="Remove spectral data file"]')
  }

  /** The stored file's basename, as shown beside the Remove button. */
  async spectralFileName(cardId: number): Promise<string | null> {
    return browser.execute((sel: string) => {
      const btn = document.querySelector(`${sel} [aria-label="Remove spectral data file"]`)
      const row = btn?.parentElement
      const span = row?.querySelector('span span')
      return span ? (span.textContent ?? '').trim() : null
    }, `[data-testid="material-card-${cardId}"]`)
  }

  // ----- Texture preview (Visualiser) -----

  /**
   * The preview image's src, or null when no texture is chosen.
   *
   * Keyed off alt="Selected texture", which the component already sets from
   * messages.texturePreviewAlt — so this needs no new testid. The placeholder
   * state renders a checkerboard div with no <img> at all, making null a real
   * signal rather than a timing artefact.
   */
  async texturePreviewSrc(cardId: number): Promise<string | null> {
    return browser.execute((sel: string) => {
      const img = document.querySelector(`${sel} img[alt="Selected texture"]`) as HTMLImageElement | null
      return img ? img.getAttribute('src') : null
    }, `[data-testid="material-card-${cardId}"]`)
  }

  // ===== Save =====

  async saveEnabled(cardId: number): Promise<boolean> {
    return this.cardSave(cardId).isEnabled()
  }

  /**
   * A card Save's label: 'Save' at rest, 'Saving…' for EXACTLY the window
   * `saveStatus === 'saving'`. SAVE_PARAMETER_GROUP_REQUESTED sets it, and
   * SUCCEEDED ('idle') and FAILED ('error') both end it.
   *
   * textContent through an ELEMENT command. Not getText: that returns '' for a
   * Save clipped by the panel's scroller (a tall Photosynthesis card), which
   * would read as "never settled". Not browser.execute: an out-of-range field
   * leaves a pending page error that the next execute would surface (see fieldState).
   */
  async saveLabel(cardId: number): Promise<string> {
    return String((await this.cardSave(cardId).getProperty('textContent')) ?? '').trim()
  }

  /**
   * The type Select's lock, read with ELEMENT commands only. `input[role="combobox"]`
   * is the type Select alone: enum fields take Select's BUTTON branch.
   * typeLocked() resolves the title through browser.execute, so a settle poll
   * must not use it.
   */
  private async typeLockedByElement(cardId: number): Promise<boolean> {
    const combo = this.card(cardId).$('input[role="combobox"][aria-label^="Material Type."]')
    return (await combo.isExisting()) && !(await combo.isEnabled())
  }

  /** cardError() without browser.execute, for use inside a settle poll. */
  private async cardErrorByElement(cardId: number): Promise<string | null> {
    const el = this.card(cardId).$('.form-error-text')
    if (!(await el.isExisting())) return null
    return String((await el.getProperty('textContent')) ?? '').trim()
  }

  /**
   * Press a card's Save, having first proved it is actually available.
   *
   * A click on a disabled Save does nothing, and the old settle ("Save is
   * disabled") then passed at once: a save that never happened reported as
   * landed. A caller asserting that Save is BLOCKED must read saveEnabled()
   * instead; this times out on purpose.
   */
  async clickCardSave(cardId: number): Promise<void> {
    await browser.waitUntil(async () => this.saveEnabled(cardId), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `Save never enabled for card ${cardId}: the card is not dirty, incomplete or invalid`
    })
    await this.cardSave(cardId).click()
  }

  /**
   * Wait for a card's save to be OVER. `outcome` says what "over" must mean; see CardSaveOutcome.
   *
   * `disabled` alone is NOT a settle, and saveCard used to trust it: `canSave`
   * includes `!saving`, so Save is disabled both WHILE the write is in flight
   * and once it has landed. The first poll after the click routinely passed
   * with the POST still pending and `group.saved` still false. A removeCard
   * straight after then dropped the card with NO confirmation (onDeleteClick
   * skips the dialog for an unsaved card), and a typeLocked or cardOpen read
   * raced the write. material-submodels.test.ts documented this and fixed it
   * locally; this is that fix in the shared helper.
   *
   * The LABEL is the discriminator. It cannot read 'Save' again until SUCCEEDED
   * or FAILED has been reduced, and the click commits 'Saving…' before the click
   * command returns (a synchronous dispatch in a discrete event). For 'saved' the
   * type lock is also required. It is written in the SAME reducer case, so it
   * costs no extra wait, but it tells a landed write from a Save that went quiet
   * for another reason (an upload in flight also disables it with the idle label).
   *
   * For 'saved', idle + STILL ENABLED + an error on the card means the save
   * failed. That ends the wait at once with the card's own text instead of 60s
   * later. REQUESTED clears `saveError`, so a message there belongs to this save.
   *
   * 100ms interval: the saga raises the saved toast right after SUCCEEDED, and
   * several callers wait for that ~2.66s toast as soon as this returns.
   */
  async waitForCardSaveSettled(cardId: number, outcome: CardSaveOutcome = 'saved'): Promise<void> {
    let last = 'no reading taken'
    let failure = null as string | null
    try {
      await browser.waitUntil(
        async () => {
          const label = await this.saveLabel(cardId)
          const enabled = await this.saveEnabled(cardId)
          last = `label "${label}", Save ${enabled ? 'enabled' : 'disabled'}`
          if (label !== CARD_SAVE_IDLE_LABEL) return false
          if (outcome === 'settled') return true
          if (!enabled) {
            const locked = await this.typeLockedByElement(cardId)
            last += `, type ${locked ? 'locked' : 'NOT locked'}`
            return locked
          }
          const error = await this.cardErrorByElement(cardId)
          if (error !== null) {
            failure = `the save FAILED, and the card reports "${error}"`
            return true
          }
          return false
        },
        { timeout: TIMEOUTS.MUTATION, interval: 100 }
      )
    } catch (err) {
      // "Save never completed" is kept verbatim: materials.test.ts quotes it as
      // the failure a rejected member write produces.
      throw new Error(
        `card ${cardId} Save never completed: the save never ` +
          `${outcome === 'saved' ? 'landed' : 'settled'} within ${TIMEOUTS.MUTATION}ms ` +
          `(last seen: ${last}). ` +
          (err instanceof Error ? err.message : String(err))
      )
    }
    if (failure !== null) throw new Error(`card ${cardId} Save never completed: ${failure}`)
  }

  /**
   * Press a card's Save and wait for the write to LAND (default), or only for it
   * to be over (`'settled'`).
   *
   * It does NOT scroll the Save into view first: that needs browser.execute,
   * which would move where a pending page error surfaces. Callers with a card
   * taller than the panel keep their own revealSave step before calling this.
   */
  async saveCard(cardId: number, outcome: CardSaveOutcome = 'saved'): Promise<void> {
    await this.clickCardSave(cardId)
    await this.waitForCardSaveSettled(cardId, outcome)
  }

  async nameValue(): Promise<string> {
    return this.nameInput.getValue()
  }
}

export default new MaterialPropertiesPage()
