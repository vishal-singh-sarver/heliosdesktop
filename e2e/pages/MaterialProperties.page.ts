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

type El = ReturnType<typeof $>

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
    ;(await this.typeCombo(cardId)).click()
    // The listbox is portalled to document.body — query from the root.
    await $('[role="listbox"]').waitForExist({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the material type listbox never opened'
    })
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
    let offered: string[] = []
    await browser.waitUntil(
      async () => {
        offered = (await this.typeOptions()).map((o) => o.label)
        return offered.includes(label)
      },
      {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: `pickType: the type list never offered "${label}" (offered: ${JSON.stringify(offered)})`
      }
    )
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
   * Close any open listbox.
   *
   * An open Select listbox is portalled and sits above the panel, so a leaked
   * one intercepts later clicks the same way a leaked dialog does. Cheap
   * insurance in afterEach.
   */
  async closeEnum(): Promise<void> {
    await browser.execute(() => {
      const open = document.querySelector('[role="combobox"][aria-expanded="true"]') as HTMLElement | null
      open?.click()
    })
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

  async saveCard(cardId: number): Promise<void> {
    await this.cardSave(cardId).click()
    await browser.waitUntil(async () => !(await this.saveEnabled(cardId)), {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: `card ${cardId} Save never completed`
    })
  }

  async nameValue(): Promise<string> {
    return this.nameInput.getValue()
  }
}

export default new MaterialPropertiesPage()
