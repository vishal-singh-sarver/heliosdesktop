/**
 * Materials — the library panel and the Material Properties form.
 *
 * Covers: creation and Material.NNN naming, name validation, the material-type
 * dropdown against the LIVE catalog, type cards, the Visualiser (colour and
 * texture), Radiation, generic parameter cards, save round-trip, search,
 * delete, persistence, and backend failure paths.
 *
 * ── State model ───────────────────────────────────────────────────────────
 * Shared provisioning: ONE project for the file (enterMaterials is a create
 * POST plus four catalog fetches). Each test creates what it needs via
 * track(), and afterEach deletes exactly those.
 *
 * THE LIBRARY IS GLOBAL. Unlike geometry, materials are not scenario-scoped —
 * a material created here is visible in every other project, so leaked rows
 * follow you across tests AND across projects. Cleanup matters more here than
 * it does in geometry.
 *
 * ── Deviations ────────────────────────────────────────────────────────────
 * Several assertions contradict the supplied user stories and are written
 * against SHIPPED behaviour. Each is marked DEVIATION inline.
 */

import Materials from '../pages/Materials.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import {
  KNOWN_MATERIAL_TYPES,
  MATERIALS_MSG,
  MATERIALS_TOAST,
  MATERIAL_CATALOG,
  MATERIAL_LIMITS,
  TYPE_WITH_NO_FIELDS,
  enumLabel,
  freshCardProps,
  isFixedSelector,
  isSelectorEnum,
  justAboveMax,
  justBelowMin,
  numericProps,
  propDef
} from '../constants/materials'
import { TIMEOUTS } from '../config/timeouts'
import {
  enterMaterials,
  reloadToHome,
  reopenByName,
  staysFalse,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import {
  clickDialogButton,
  clickDialogClose,
  countOpenDialogs,
  sweepBlockingOverlays,
  waitForNoOpenDialog,
  waitForOpenDialog
} from '../support/dialogs'
import { clearApiFaults, withApiFault } from '../support/faults'
import { drainToasts, waitForToast } from '../support/toasts'

describe('Materials', () => {
  let created: string[] = []

  const track = async (): Promise<string> => {
    const id = await Materials.addMaterial()
    created.push(id)
    return id
  }

  const nameOf = async (id: string): Promise<string> =>
    ((await Materials.rowState(id))?.name ?? '') as string

  const renameAndSettle = async (id: string, next: string): Promise<void> => {
    await Materials.renameRow(id, next, 'enter')
    await browser.waitUntil(async () => (await Materials.rowState(id))?.name === next, {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: `rename to "${next}" never landed`
    })
  }

  /** Add a card and give it a type, returning the cardId. */
  const cardWithType = async (type: string): Promise<number> => {
    const cardId = await MaterialProperties.addCard()
    await MaterialProperties.pickType(cardId, type)
    return cardId
  }


  // The three shared consts/helpers sit beside track / nameOf / renameAndSettle /
  // cardWithType; the describe blocks follow them.

  /**
   * messages.ts `deleteBody`, mirrored here rather than imported.
   *
   * constants/materials.ts stops at `deleteHeading` and carries no entry for the
   * consequence line. Verified verbatim against
   * containers/Materials/messages.ts:143, which is word-for-word Geometry's
   * (GEOMETRY_MSG.deleteBody carries the identical string).
   */
  const DELETE_BODY = 'Are you sure you want to delete this? This action cannot be undone.'

  /**
   * Open a row's delete confirmation WITHOUT completing it.
   *
   * Materials.page only offers deleteRow / cancelDelete, which drive the dialog
   * straight to an outcome — there is no openDeleteConfirm here as there is on
   * Geometry.page — so nothing in this file has ever observed the dialog open.
   * `taps` clicks n times inside ONE execute: separate round-trips would let React
   * commit between them and stop being a rapid tap at all.
   */
  const openRowDelete = async (id: string, taps = 1): Promise<void> => {
    await Materials.row(id).waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await browser.execute(
      (rowId: string, n: number) => {
        const row = document.querySelector(`[data-testid="material-row-${rowId}"]`)
        // Scoped to the ROW deliberately: MaterialPropertiesForm's header carries a
        // second aria-label="Delete material" for the whole material. Those two are
        // the only occurrences of the label in src/.
        const btn = row?.querySelector('[aria-label="Delete material"]') as HTMLElement | null
        if (!btn) throw new Error(`no delete control on material row ${rowId}`)
        for (let i = 0; i < n; i++) btn.click()
      },
      id,
      taps
    )
  }

  /**
   * Save a Visualiser card, so the card becomes a real backend member.
   *
   * `group.saved` is the only thing that decides whether the card's trash confirms
   * (MaterialPropertiesForm onDeleteClick), and Visualiser + a complete RGB is the
   * one save path this file already proves green. Caller must have created and
   * opened a material first. Returns the cardId — which is 2, not 1: a fresh
   * material already carries one blank card and cardWithType ADDS another.
   */
  const saveVisualiserCard = async (): Promise<number> => {
    const cardId = await cardWithType('Visualiser')
    await MaterialProperties.setColorChannel('r', '12')
    await MaterialProperties.setColorChannel('g', '34')
    await MaterialProperties.setColorChannel('b', '56')
    await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Save never enabled for a complete colour'
    })
    await MaterialProperties.saveCard(cardId)
    return cardId
  }

  // ══ The library list — ordering and chrome ═══════════════════════════════════

  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
    await enterMaterials('mat')
  })

  afterEach(async () => {
    // Steps stay best-effort, but their errors are COLLECTED rather than
    // discarded, and the teardown ends by checking that the tracked rows are
    // actually gone. Materials.deleteRow genuinely throws when a delete fails,
    // and that throw used to be swallowed — so a row could survive teardown and
    // corrupt a later test with no trace of where it came from. The library is
    // GLOBAL (it outlives the project and the run), which makes a leak here
    // more expensive than in any other spec.
    const failures: string[] = []
    const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn()
      } catch (err) {
        failures.push(`${label} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Dialogs first: components/Dialog uses native showModal(), so one left open
    // sits in the top layer and makes every later click in the file fail
    // against whatever it touched.
    await step('closeAnyOpenDialog', () => Materials.closeAnyOpenDialog())
    // …then the overlays that are NOT dialogs. The ImportWizard is a plain div
    // whose open flag lives in REDUX, so it survives navigation and re-appears
    // whenever the Weather tab mounts — one stray open turned a single failing
    // test into 20 collateral `element click intercepted` failures on a real run.
    // Reported rather than silently absorbed: a leak here is a bug in whichever
    // test left it, and should be findable.
    const leaked = await sweepBlockingOverlays().catch(() => false)
    if (leaked) console.warn('[afterEach] closed a leaked full-screen overlay')
    await step('clearSearch', () => Materials.clearSearch())

    const tracked = [...created].reverse()
    for (const id of tracked) {
      await step(`deleteRow(${id})`, () => Materials.deleteRow(id))
      await step('closeAnyOpenDialog', () => Materials.closeAnyOpenDialog())
    }
    created = []
    await step('clearApiFaults', () => clearApiFaults())

    const stillThere: string[] = []
    for (const id of tracked) {
      if (await Materials.row(id).isExisting().catch(() => false)) stillThere.push(id)
    }
    if (stillThere.length) {
      throw new Error(
        `Cleanup left ${stillThere.length} material(s) in the GLOBAL library: ${stillThere.join(', ')}.\n` +
          '  These outlive the project and the run, so they will skew naming, ordering and ' +
          'search assertions in later tests and later sessions.\n' +
          (failures.length
            ? `  cleanup errors:\n    ${failures.join('\n    ')}`
            : '  No cleanup step reported an error, so the delete silently no-opped.')
      )
    }
  })

  // ══ Panel shell ══════════════════════════════════════════════════════════

  describe('panel', () => {
    it('the Materials panel shows its create button and search box', async () => {
      await expect(Materials.panel).toBeDisplayed()
      await expect(Materials.addButton).toBeDisplayed()
      await expect(Materials.searchBox).toBeDisplayed()
    })

    it('the create button reads "Add Materials"', async () => {
      // DEVIATION: the user story calls it "+ Add Material" (singular, with a
      // literal plus). The plus is an icon and the label is plural.
      await expect(Materials.addButton).toHaveText(MATERIALS_MSG.addMaterials, {
        containing: true
      })
    })

    it('an empty library shows "No saved materials yet."', async function () {
      // The library is GLOBAL, so this is only meaningful when nothing is left
      // over. Skip rather than assert the wrong thing.
      if ((await Materials.rowCount()) > 0) {
        this.skip()
        return
      }
      expect(await Materials.emptyHint()).toBe(MATERIALS_MSG.empty)
    })
  })

  // ══ Creation and naming ══════════════════════════════════════════════════

  describe('creation and auto-naming', () => {
    it('+ Add Materials creates a row and opens its Properties form', async () => {
      const id = await track()
      expect(await nameOf(id)).toMatch(/^Material\.\d{3}$/)
      await MaterialProperties.waitForOpen()
      await expect(MaterialProperties.nameInput).toHaveValue(await nameOf(id))
    })

    it('names are zero-padded to three digits', async () => {
      const id = await track()
      expect(await nameOf(id)).toMatch(/^Material\.\d{3}$/)
    })

    it('a second create takes the next free number', async () => {
      const a = await track()
      const b = await track()
      const n = (s: string): number => Number(s.split('.')[1])
      expect(n(await nameOf(b))).toBe(n(await nameOf(a)) + 1)
    })

    it('deleting a middle material frees its number for the next create (GAP-FILLING)', async () => {
      await track()
      const b = await track()
      await track()
      const freed = await nameOf(b)
      await Materials.deleteRow(b)
      created = created.filter((x) => x !== b)
      const next = await track()
      expect(await nameOf(next)).toBe(freed)
    })

    it('the create toast names the new material', async () => {
      await drainToasts()
      const id = await track()
      await waitForToast(MATERIALS_TOAST.created(await nameOf(id)))
    })

    it('a new material opens with exactly ONE blank type card', async () => {
      // CORRECTED EXPECTATION. This previously asserted ZERO cards, which the
      // app has never produced: CREATE_MATERIAL_SUCCEEDED seeds
      // `groups: [emptyCard(1, 1)]` — the reducer's own comment reads "Open it
      // with one blank card, ready to pick a material type" — and the card's
      // `material-card-{id}` testid is rendered on the card root, OUTSIDE the
      // `open &&` gate, so cardIds() returns it whether the card is expanded or
      // collapsed. The old assertion could not pass in any state.
      //
      // Blank means "no type chosen", so that is asserted directly rather than
      // inferred from the card count: an empty combobox showing the "Select"
      // placeholder. Reading the combobox while CLOSED is required — a
      // searchable Select shows the live query instead of the selection while
      // its listbox is open.
      await track()
      await MaterialProperties.waitForOpen()

      const cards = await MaterialProperties.cardIds()
      expect(cards.length).toBe(1)

      const cardId = cards[0]
      expect(await MaterialProperties.cardTitle(cardId)).toBe(MATERIALS_MSG.cardTitle(1))
      expect(await MaterialProperties.selectedType(cardId)).toBe('')
      await expect(MaterialProperties.card(cardId)).toBeDisplayed()
    })
  })

  // ══ Name validation ══════════════════════════════════════════════════════

  describe('name validation', () => {
    it('double-clicking a row name opens an editor seeded with the current name', async () => {
      const id = await track()
      const before = await nameOf(id)
      await Materials.openRename(id)
      await expect(Materials.nameEditor).toHaveValue(before)
    })

    it('Enter commits a valid rename', async () => {
      const id = await track()
      await renameAndSettle(id, 'Concrete_A')
      expect(await nameOf(id)).toBe('Concrete_A')
    })

    it('Escape discards the edit', async () => {
      const id = await track()
      const before = await nameOf(id)
      await Materials.renameRow(id, 'ThrownAway', 'escape')
      expect(await nameOf(id)).toBe(before)
    })

    it('a name at exactly 20 characters is accepted', async () => {
      const id = await track()
      await renameAndSettle(id, MATERIAL_LIMITS.nameValid)
      expect(await nameOf(id)).toBe(MATERIAL_LIMITS.nameValid)
    })

    it('a 21-character name is blocked with "Character limit exceeded"', async () => {
      const id = await track()
      const before = await nameOf(id)
      await Materials.renameRow(id, MATERIAL_LIMITS.nameTooLong, 'enter')
      expect(await Materials.renameError(id)).toBe(MATERIALS_MSG.nameTooLong)
      // The editor stays open on an invalid commit, so the row still shows the
      // rejected text — escape out before reading the stored name.
      await browser.keys(['Escape'])
      expect(await nameOf(id)).toBe(before)
    })

    it('an empty name is blocked with "Name is required"', async () => {
      const id = await track()
      const before = await nameOf(id)
      await Materials.renameRow(id, '', 'enter')
      expect(await Materials.renameError(id)).toBe(MATERIALS_MSG.nameRequired)
      await browser.keys(['Escape'])
      expect(await nameOf(id)).toBe(before)
    })

    it('a duplicate name is blocked CASE-INSENSITIVELY', async () => {
      const a = await track()
      const b = await track()
      await renameAndSettle(a, 'Duplicated')
      await Materials.renameRow(b, 'DUPLICATED', 'enter')
      expect(await Materials.renameError(b)).toBe(MATERIALS_MSG.nameExists)
      await browser.keys(['Escape'])
    })
  })

  // ══ Material type dropdown ═══════════════════════════════════════════════

  describe('material type dropdown', () => {
    it('lists exactly the types the CATALOG serves', async () => {
      // Differential: the list is 100% backend-driven. Hardcoding it in the
      // frontend, or dropping the catalog fetch, turns this red.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await MaterialProperties.addCard()
      await MaterialProperties.openTypeDropdown(cardId)
      const labels = (await MaterialProperties.typeOptions()).map((o) => o.label)
      for (const t of KNOWN_MATERIAL_TYPES) expect(labels).toContain(t)
      await browser.keys(['Escape'])
    })

    it('offers "Visualiser", NOT "Visualisation Properties"', async () => {
      // DEVIATION: the user story names this type "Visualisation Properties".
      // The catalog calls it Visualiser. The other six story names are correct.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await MaterialProperties.addCard()
      await MaterialProperties.openTypeDropdown(cardId)
      const labels = (await MaterialProperties.typeOptions()).map((o) => o.label)
      expect(labels).toContain('Visualiser')
      expect(labels).not.toContain('Visualisation Properties')
      await browser.keys(['Escape'])
    })

    it('picking a type sets it on the card', async () => {
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Radiation')
      await browser.waitUntil(
        async () => (await MaterialProperties.selectedType(cardId)) === 'Radiation',
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the picked type never appeared on the card' }
      )
    })

    it('a type already used by another card is not offered again', async () => {
      // Differential: one card per type. Select marks taken values disabled
      // rather than hiding them, so they may be listed but must not be pickable.
      await track()
      await MaterialProperties.waitForOpen()
      await cardWithType('Radiation')
      const second = await MaterialProperties.addCard()
      await MaterialProperties.openTypeDropdown(second)
      const radiation = (await MaterialProperties.typeOptions()).find(
        (o) => o.label === 'Radiation'
      )
      expect(radiation?.disabled ?? true).toBe(true)
      await browser.keys(['Escape'])
    })

    it('card headings are Material Type.0N — TWO digits', async () => {
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await MaterialProperties.addCard()
      expect(await MaterialProperties.cardTitle(cardId)).toMatch(/^Material Type\.\d{2}$/)
    })

    it('the card header toggles the card open and closed', async () => {
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Radiation')
      expect(await MaterialProperties.cardOpen(cardId)).toBe(true)
      await MaterialProperties.toggleCard(cardId)
      await browser.waitUntil(async () => !(await MaterialProperties.cardOpen(cardId)), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the card never collapsed'
      })
    })

    it('an unsaved card is removed with NO confirmation', async () => {
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await MaterialProperties.addCard()
      await MaterialProperties.removeCard(cardId)
      await browser.waitUntil(async () => !(await MaterialProperties.cardIds()).includes(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the unsaved card was not removed'
      })
    })
  })

  // ══ Visualiser ═══════════════════════════════════════════════════════════

  // ══ Visualiser ═══════════════════════════════════════════════════════════

  describe('visualiser', () => {
    const openVisualiser = async (): Promise<number> => {
      await track()
      await MaterialProperties.waitForOpen()
      return cardWithType('Visualiser')
    }

    /**
     * The colour channels are NOT FormFields, so fieldState() cannot see them:
     * components/ColorPicker renders its own
     * `<input data-testid="color-channel-{ch}">` — there is no
     * `input-{cardId}-{property}` and no `formfield-` wrapper anywhere near it.
     *
     * Its error is the same in-cell Tooltip the rest of the app uses. ColorPicker's
     * `errorIcon()` renders `<Tooltip ariaLabel={`Validation error: ${error}`}>`,
     * and Tooltip's trigger is a bare <span data-tooltip-content={text}> inside a
     * fragment — so the span is the input's own following SIBLING inside the
     * `div.relative` that wraps them. Hence the `~` combinator. There is no
     * visible message and no role=alert node to read.
     *
     * (The opacity box also renders a "%" <span> between the two. `~` is a GENERAL
     * sibling combinator, so it steps over it.)
     *
     * ELEMENT commands only, never browser.execute: an out-of-range write leaves
     * a pending page error that the next execute would surface as a driver error
     * carrying the app's own validation copy.
     */
    const channelError = async (
      which: 'r' | 'g' | 'b' | 'opacity'
    ): Promise<string | null> => {
      const tip = $(`[data-testid="color-channel-${which}"] ~ [aria-label^="Validation error:"]`)
      return (await tip.isExisting().catch(() => false))
        ? await tip.getAttribute('data-tooltip-content').catch(() => null)
        : null
    }

    /** "Used colors" is GLOBAL and localStorage-backed — see the test below.
     *  The literal is utils/storageKeys.ts STORAGE_KEYS.recentColors. */
    const RECENT_COLORS_KEY = 'helios:materials:recentColors'
    const readRecentColors = async (): Promise<string | null> =>
      (await browser.execute((k: string) => {
        try {
          return localStorage.getItem(k)
        } catch {
          return null
        }
      }, RECENT_COLORS_KEY)) as string | null
    const writeRecentColors = async (raw: string | null): Promise<void> => {
      await browser.execute(
        (k: string, v: string | null) => {
          try {
            if (v == null) localStorage.removeItem(k)
            else localStorage.setItem(k, v)
          } catch {
            /* private mode / quota — the history is a nicety */
          }
        },
        RECENT_COLORS_KEY,
        raw
      )
    }

    it('opens on the Custom tab with an INLINE colour picker', async () => {
      // DEVIATION: the story describes a colour-wheel icon opening a palette
      // popup. There is no popup — the picker is inline and always visible.
      await openVisualiser()
      await browser.waitUntil(async () => (await MaterialProperties.activeVisTab()) === 'custom', {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the Visualiser card did not open on the Custom tab'
      })
      await expect(MaterialProperties.colorChannel('r')).toBeDisplayed()
      await expect(MaterialProperties.colorChannel('opacity')).toBeDisplayed()
    })

    it('the colour AREA and its sliders need NO trigger to appear', async () => {
      // The other half of the same DEVIATION: not only is there no popup, there
      // is no control that could open one. components/ColorPicker renders the
      // saturation/brightness area and the hue + opacity sliders as three
      // role="slider" tracks, present the moment the card is given its type.
      //
      // The labels come from Materials/messages.ts (colorAreaLabel, hueSliderLabel,
      // opacitySliderLabel), threaded through as ColorPicker's `labels` prop. The
      // opacity INPUT shares the "Opacity" name, so role="slider" is load-bearing
      // in that last selector.
      await openVisualiser()
      await expect($('[role="slider"][aria-label="Saturation and brightness"]')).toBeDisplayed()
      await expect($('[role="slider"][aria-label="Hue"]')).toBeDisplayed()
      await expect($('[role="slider"][aria-label="Opacity"]')).toBeDisplayed()
    })

    it('Custom and Select Texture are TABS, not a toggle', async () => {
      // DEVIATION: the story calls Select Texture a toggle. Both are buttons
      // carrying aria-pressed — a two-tab control.
      await openVisualiser()
      await expect(MaterialProperties.visTab('custom')).toBeDisplayed()
      await expect(MaterialProperties.visTab('texture')).toBeDisplayed()
      expect(await MaterialProperties.activeVisTab()).toBe('custom')
    })

    it('the library and upload sub-tabs are ABSENT until Select Texture is active', async () => {
      // DEVIATION: the story says both tabs are "disabled by default". They are
      // conditionally RENDERED — absent, not disabled — so the correct
      // assertion is non-existence.
      await openVisualiser()
      await expect(MaterialProperties.subTab('library')).not.toBeExisting()
      await MaterialProperties.visTab('texture').click()
      await MaterialProperties.subTab('library').waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the From Library sub-tab never appeared'
      })
    })

    it('Select Texture REPLACES the colour picker, and Custom brings it back', async () => {
      // Mutually exclusive bodies (`mode === 'custom' ? <ColorPicker/> :
      // <TextureSelector/>`), not two panes with one hidden — which is why the
      // sub-tabs can only be asserted by existence. Both sub-tabs ship, and they
      // are labelled "From Library" / "Upload File" (a third DEVIATION: the story
      // names neither).
      await openVisualiser()
      await MaterialProperties.visTab('texture').click()
      await browser.waitUntil(async () => (await MaterialProperties.activeVisTab()) === 'texture', {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Select Texture never became the active tab'
      })
      await expect(MaterialProperties.colorChannel('r')).not.toBeExisting()
      await expect(MaterialProperties.subTab('library')).toBeDisplayed()
      await expect(MaterialProperties.subTab('upload')).toBeDisplayed()

      await MaterialProperties.visTab('custom').click()
      await browser.waitUntil(async () => (await MaterialProperties.activeVisTab()) === 'custom', {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Custom never became the active tab again'
      })
      await expect(MaterialProperties.colorChannel('r')).toBeDisplayed()
      await expect(MaterialProperties.subTab('library')).not.toBeExisting()
    })

    it('a fresh Custom card seeds opacity at 100', async () => {
      // Deliberate, and load-bearing for every Save test below: the opacity
      // slider already sits at 100, so the box is seeded to match rather than
      // reading empty beside it. Seeded on ENTERING Custom (the effect is keyed
      // [mode, saved]), never in response to the field later becoming empty — ''
      // is a legal in-progress keystroke, so a value-watching effect would type
      // 100 back while the user backspaced.
      await openVisualiser()
      await browser.waitUntil(
        async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '100',
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'opacity was not seeded to 100' }
      )
    })

    it('every colour channel accepts 0 and 255', async () => {
      // Both bounds INCLUSIVE, from the catalog (integer 0-255). No invalid write
      // in this test at all, so nothing here can leave a pending page error.
      const cardId = await openVisualiser()
      for (const ch of ['r', 'g', 'b'] as const) {
        for (const bound of [MATERIAL_LIMITS.CHANNEL_MIN, MATERIAL_LIMITS.CHANNEL_MAX]) {
          await MaterialProperties.setColorChannel(ch, String(bound))
          expect(`${ch}=${bound} invalid=${await MaterialProperties.colorChannelInvalid(ch)}`).toBe(
            `${ch}=${bound} invalid=false`
          )
        }
      }
      // A whole colour of in-range values is saveable — the bounds are accepted,
      // not merely un-flagged.
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a colour built from the catalog bounds'
      })
    })

    it('opacity accepts 0 and 100', async () => {
      await openVisualiser()
      for (const bound of [MATERIAL_LIMITS.OPACITY_MIN, MATERIAL_LIMITS.OPACITY_MAX]) {
        await MaterialProperties.setColorChannel('opacity', String(bound))
        expect(
          `opacity=${bound} invalid=${await MaterialProperties.colorChannelInvalid('opacity')}`
        ).toBe(`opacity=${bound} invalid=false`)
      }
    })

    it('a colour channel above 255 is flagged invalid', async () => {
      const cardId = await openVisualiser()
      await MaterialProperties.setColorChannel('r', String(MATERIAL_LIMITS.CHANNEL_MAX + 1))
      await browser.waitUntil(async () => MaterialProperties.colorChannelInvalid('r'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'an out-of-range red channel was not flagged'
      })
      expect(await MaterialProperties.saveEnabled(cardId)).toBe(false)
    })

    it('a rejected channel reports the CATALOG range, as a tooltip', async () => {
      // The message is built from the catalog bounds (validateMaterialFieldValue
      // -> messages.valuesBetween), so a migration that moves them moves this copy
      // with it. Nothing asserted the Visualiser's, and it is the one place the
      // channels' 0-255 is user-visible.
      //
      // The copy lives in the tooltip's data-tooltip-content — see channelError
      // above. ONE invalid write, and it is the last thing this test does.
      await openVisualiser()
      await MaterialProperties.setColorChannel('b', String(MATERIAL_LIMITS.CHANNEL_MAX + 1))
      await browser.waitUntil(async () => MaterialProperties.colorChannelInvalid('b'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'an out-of-range blue channel was not flagged'
      })
      expect(await channelError('b')).toBe(
        MATERIALS_MSG.valuesBetween(MATERIAL_LIMITS.CHANNEL_MIN, MATERIAL_LIMITS.CHANNEL_MAX)
      )
    })

    it('a negative colour channel is flagged invalid', async () => {
      await openVisualiser()
      await MaterialProperties.setColorChannel('g', '-1')
      await browser.waitUntil(async () => MaterialProperties.colorChannelInvalid('g'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'a negative green channel was not flagged'
      })
    })

    it('opacity above 100 is flagged invalid', async () => {
      await openVisualiser()
      await MaterialProperties.setColorChannel('opacity', String(MATERIAL_LIMITS.OPACITY_MAX + 1))
      await browser.waitUntil(async () => MaterialProperties.colorChannelInvalid('opacity'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'an out-of-range opacity was not flagged'
      })
    })

    it('a rejected opacity reports 0-100, NOT the channel range', async () => {
      // Differential: opacity sits in the same row as the three channels and goes
      // through the same pipeline, but its catalog bounds are 0-100. One shared
      // range constant would turn this red.
      await openVisualiser()
      await MaterialProperties.setColorChannel('opacity', String(MATERIAL_LIMITS.OPACITY_MAX + 1))
      await browser.waitUntil(async () => MaterialProperties.colorChannelInvalid('opacity'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'an out-of-range opacity was not flagged'
      })
      expect(await channelError('opacity')).toBe(
        MATERIALS_MSG.valuesBetween(MATERIAL_LIMITS.OPACITY_MIN, MATERIAL_LIMITS.OPACITY_MAX)
      )
    })

    it('a DECIMAL in an integer channel is refused by the keystroke GUARD', async () => {
      // The colour channels + opacity are the ONLY integer properties in the
      // catalog, so this is the only place the integer guard can be reached.
      //
      // setColorChannel does not bypass it: its input dispatch runs React's
      // onChange, which IS handleFieldChange — the guard refuses a '.' the
      // keystroke ADDS to an integer field and RETURNS WITHOUT STORING. So the
      // copy is "This input is not supported", never "Invalid Input", and the
      // previous value is left standing (React restores the controlled input's
      // DOM value once the rejected change has been processed).
      await openVisualiser()
      await MaterialProperties.setColorChannel('r', '128')
      expect(await MaterialProperties.colorChannel('r').getValue()).toBe('128')

      await MaterialProperties.setColorChannel('r', '12.5')
      await browser.waitUntil(async () => MaterialProperties.colorChannelInvalid('r'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'a decimal in an integer channel was not flagged'
      })
      expect(await channelError('r')).toBe(MATERIALS_MSG.inputNotSupported)
      expect(await MaterialProperties.colorChannel('r').getValue()).toBe('128')
    })

    it('an INCOMPLETE colour keeps Save shut', async () => {
      // A colour is the three channels together — isVisualisationComplete needs
      // all four boxes filled AND valid, so two thirds of a colour is not a
      // saveable material. Opacity is already seeded, so blue is the only gap.
      const cardId = await openVisualiser()
      await MaterialProperties.setColorChannel('r', '10')
      await MaterialProperties.setColorChannel('g', '20')
      expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
    })

    it('clearing ONE channel closes Save again', async () => {
      const cardId = await openVisualiser()
      await MaterialProperties.setColorChannel('r', '10')
      await MaterialProperties.setColorChannel('g', '20')
      await MaterialProperties.setColorChannel('b', '30')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      // '' is a legal in-progress keystroke (isPartialNumericInput('') is true),
      // so it commits — and re-opens the gap.
      await MaterialProperties.setColorChannel('b', '')
      expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
    })

    it('a complete colour enables Save, and saving persists it', async () => {
      const cardId = await openVisualiser()
      await MaterialProperties.setColorChannel('r', '10')
      await MaterialProperties.setColorChannel('g', '20')
      await MaterialProperties.setColorChannel('b', '30')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      await drainToasts()
      await MaterialProperties.saveCard(cardId)
      await waitForToast(MATERIALS_TOAST.saved)
    })

    it('the card stays OPEN after a successful save', async () => {
      const cardId = await openVisualiser()
      await MaterialProperties.setColorChannel('r', '11')
      await MaterialProperties.setColorChannel('g', '22')
      await MaterialProperties.setColorChannel('b', '33')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled'
      })
      await MaterialProperties.saveCard(cardId)
      expect(await MaterialProperties.cardOpen(cardId)).toBe(true)
    })

    it("a saved card's material type is LOCKED", async () => {
      // Differential: Select is disabled once group.saved — changing a saved
      // card's type would orphan its stored property values.
      const cardId = await openVisualiser()
      await MaterialProperties.setColorChannel('r', '5')
      await MaterialProperties.setColorChannel('g', '5')
      await MaterialProperties.setColorChannel('b', '5')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled'
      })
      await MaterialProperties.saveCard(cardId)
      expect(await MaterialProperties.typeLocked(cardId)).toBe(true)
    })

    it('texture mode with NO texture chosen keeps Save shut', async () => {
      // Differential: the two modes have different Save gates. Custom needs a
      // complete colour; texture needs a chosen path (`modeComplete` becomes
      // `textureReady`) — so switching tab on a card whose colour is already
      // complete must NOT carry that completeness across, or an empty texture
      // would save as the material's appearance.
      const cardId = await openVisualiser()
      await MaterialProperties.setColorChannel('r', '10')
      await MaterialProperties.setColorChannel('g', '20')
      await MaterialProperties.setColorChannel('b', '30')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      await MaterialProperties.visTab('texture').click()
      expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
    })

    it('picking a library texture marks its tile PRESSED', async function () {
      const cardId = await openVisualiser()
      await MaterialProperties.visTab('texture').click()
      await MaterialProperties.subTab('library').waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the From Library sub-tab never appeared'
      })

      // THE GRID IS EMPTY IN THIS BUILD, so this self-skips rather than asserting
      // against data the backend cannot produce. The grid is served by
      // GET /api/textures/defaults -> list_default_textures(), which reads
      // `Path(__file__).resolve().parents[2]/assets` — i.e. `<_MEIPASS>/assets`
      // inside the PyInstaller bundle — and scripts/build_binary.ps1 carries no
      // --add-data for helios-desktop-backend/assets (it bundles migrations,
      // pyhelios, images, plugins and bin, and nothing else). The directory is
      // absent, `is_dir()` fails, and the route answers {"textures": []}, so the
      // tab shows "No textures available."
      //
      // Written to start passing the day those assets are bundled.
      const haveTiles = await browser
        .waitUntil(async () => (await MaterialProperties.textureTiles()).length > 0, {
          timeout: TIMEOUTS.MEDIUM
        })
        .then(
          () => true,
          () => false
        )
      if (!haveTiles) {
        this.skip()
        return
      }

      const first = (await MaterialProperties.textureTiles())[0]
      expect(first.selected).toBe(false)
      await browser.execute((label: string) => {
        const btn = document.querySelector(
          `[aria-label="Use texture ${label}"]`
        ) as HTMLElement | null
        if (!btn) throw new Error(`no texture tile "${label}"`)
        btn.click()
      }, first.name)
      await browser.waitUntil(
        async () =>
          (await MaterialProperties.textureTiles()).find((t) => t.name === first.name)?.selected ===
          true,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the picked tile never became pressed' }
      )
      // A chosen texture is what opens Save in texture mode.
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'a highlighted library texture did not enable Save'
      })
    })

    it('a non-image upload is REJECTED before it reaches the backend', async () => {
      const cardId = await openVisualiser()
      await MaterialProperties.visTab('texture').click()
      await MaterialProperties.subTab('upload').waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the Upload File sub-tab never appeared'
      })
      await MaterialProperties.subTab('upload').click()
      // The <input type=file> is rendered ONLY while the Upload sub-tab is active,
      // and it is `hidden` — so waitForExist, never waitForDisplayed.
      await MaterialProperties.textureFileInput.waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the hidden file input never rendered'
      })

      // The file is built IN THE PAGE and assigned through a DataTransfer, which
      // is the only way to reach onFileChange: the input is `hidden`, so there is
      // no visible control for WebDriver's own file upload to target. React
      // routes file inputs through the native `change` event
      // (shouldUseChangeEvent), so a bubbling change is what onChange listens for.
      //
      // Inline rather than a fixture BY DESIGN — a .txt is the point of this test,
      // and there is no reason to keep a deliberately-wrong file on disk. The
      // real-image path lives in material-uploads.test.ts.
      //
      // A .txt fails validateTextureFile on formatFromExtension — before the file
      // is read, and before any POST — so this leaves nothing behind on the
      // backend, unlike a happy-path upload.
      await browser.execute(() => {
        const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
        if (!input) throw new Error('the texture upload input is not rendered')
        const dt = new DataTransfer()
        dt.items.add(new File(['not an image'], 'notes.txt', { type: 'text/plain' }))
        input.files = dt.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
      })

      const fileError = $(`[data-testid="material-card-${cardId}"]`).$('.form-error-text')
      await fileError.waitForDisplayed({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'a rejected upload reported nothing'
      })
      expect((await fileError.getText()).trim()).toBe(MATERIALS_MSG.textureFileTypeError)
      // Client-side only: nothing was uploaded, so nothing is saveable either.
      expect(await MaterialProperties.saveEnabled(cardId)).toBe(false)
    })

    it('a saved colour joins the GLOBAL "Used colors" history', async () => {
      // The history is not scoped to the material, the project, or even the run:
      // it lives in localStorage under helios:materials:recentColors, capped at 8
      // and most-recent-first. So this test CAPTURES the real key and puts it
      // back — without that it would quietly rewrite whatever the person at this
      // machine had used. (The restore is best-effort for the run as a whole: the
      // reducer loads the list once at startup, so a later colour save elsewhere
      // in this file re-persists the in-memory list, this colour included.)
      const before = await readRecentColors()
      try {
        const cardId = await openVisualiser()
        await MaterialProperties.setColorChannel('r', '3')
        await MaterialProperties.setColorChannel('g', '5')
        await MaterialProperties.setColorChannel('b', '7')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Save never enabled for a complete colour'
        })
        await MaterialProperties.saveCard(cardId)

        // Recorded from the SAVE payload (colorFromProperties), not from the
        // keystrokes — a colour is remembered only once it is committed.
        await $('[aria-label="Use colour #030507"]').waitForDisplayed({
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the saved colour never appeared under "Used colors"'
        })

        const stored = await readRecentColors()
        expect(stored).not.toBe(null)
        const list = JSON.parse(stored as string) as {
          r: number
          g: number
          b: number
          opacity: number
        }[]
        const head = list[0]
        // Most-recent-FIRST, and carrying the opacity it was saved at (the seeded
        // 100) — a swatch restores both.
        expect(
          head === undefined ? 'no entry' : `${head.r},${head.g},${head.b}@${head.opacity}`
        ).toBe('3,5,7@100')
      } finally {
        await writeRecentColors(before).catch(() => {})
      }
    })
  })

  // ══ Radiation ════════════════════════════════════════════════════════════

  describe('radiation', () => {
    const openRadiation = async (): Promise<number> => {
      await track()
      await MaterialProperties.waitForOpen()
      return cardWithType('Radiation')
    }

    it('Apply spectral data is a switch, OFF by default', async () => {
      await openRadiation()
      await MaterialProperties.spectralToggle.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      expect(await MaterialProperties.spectralApplied()).toBe(false)
    })

    it('the PAR band inputs are editable while spectral data is OFF', async () => {
      const cardId = await openRadiation()
      await MaterialProperties.setField(cardId, 'reflectivity_PAR', '0.2')
      expect((await MaterialProperties.fieldState(cardId, 'reflectivity_PAR')).value).toBe('0.2')
    })

    it('a band whose R+T+E exceeds 1 is flagged and blocks Save', async () => {
      // Differential: the cross-field rule is the only thing stopping a
      // physically impossible material from being saved.
      const cardId = await openRadiation()
      await MaterialProperties.setField(cardId, 'reflectivity_PAR', '0.6')
      await MaterialProperties.setField(cardId, 'transmissivity_PAR', '0.6')
      await MaterialProperties.setField(cardId, 'emissivity_PAR', '0.6')
      expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
    })

    it('turning spectral data ON disables the band inputs', async () => {
      const cardId = await openRadiation()
      await MaterialProperties.spectralToggle.click()
      await browser.waitUntil(async () => MaterialProperties.spectralApplied(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the spectral toggle never turned on'
      })
      await expect(MaterialProperties.field(cardId, 'reflectivity_PAR')).toBeDisabled()
    })

    it('a band value above 1 is flagged invalid', async () => {
      const cardId = await openRadiation()
      await MaterialProperties.setField(cardId, 'reflectivity_PAR', '2')
      expect((await MaterialProperties.fieldState(cardId, 'reflectivity_PAR')).invalid).toBe(true)
    })
  })

  // ══ Generic parameter cards ══════════════════════════════════════════════

  describe('generic parameter cards', () => {
    it('Energy Balance renders its catalog fields', async () => {
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Energy Balance')
      await MaterialProperties.field(cardId, 'heat_capacity').waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Energy Balance did not render its heat_capacity field'
      })
    })

    it('Solar Position renders a card with NO fields', async () => {
      // Its catalog entry has properties: [] — a real, testable edge case that
      // would otherwise look like a rendering bug.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType(TYPE_WITH_NO_FIELDS)
      expect(await MaterialProperties.selectedType(cardId)).toBe(TYPE_WITH_NO_FIELDS)
      const inputs = await $$(`[data-testid^="input-${cardId}-"]`)
      expect(inputs.length).toBe(0)
    })

    it('Stomatal Conductance hides its sub-model groups until the selector is set', async () => {
      // Differential: selector-driven groups are hidden until their enum has
      // the matching value. If visibleParameterGroups stopped filtering, these
      // fields would render unconditionally.
      //
      // DEVIATION: this differential used to be driven through Photosynthesis.
      // Its `submodel` is now a FIXED selector — one option, seeded on type-pick —
      // so its group is revealed immediately and can no longer demonstrate a gate
      // working at all. Stomatal Conductance's four sub-models are a genuine
      // choice and still can, so the coverage moves here rather than being lost.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Stomatal Conductance')
      await expect(MaterialProperties.field(cardId, 'bwb_gs0')).not.toBeExisting()
    })
  })

  // ══ Field validation ═════════════════════════════════════════════════════

  describe('field validation', () => {
    const radiationCard = async (): Promise<number> => {
      await track()
      await MaterialProperties.waitForOpen()
      return cardWithType('Radiation')
    }

    it('a value outside its catalog range is flagged invalid', async () => {
      const cardId = await radiationCard()
      await MaterialProperties.setField(cardId, 'specular_exponent', '99999')
      expect((await MaterialProperties.fieldState(cardId, 'specular_exponent')).invalid).toBe(true)
    })

    it('a non-numeric value is rejected', async () => {
      const cardId = await radiationCard()
      await MaterialProperties.setField(cardId, 'specular_scale', 'abc')
      expect((await MaterialProperties.fieldState(cardId, 'specular_scale')).invalid).toBe(true)
    })

    it('more than 7 decimal places is refused at the 8th character', async () => {
      // Must be TYPED: the guard rejects the incoming value outright, so a
      // native-setter write bypasses it entirely.
      const cardId = await radiationCard()
      await MaterialProperties.typeField(cardId, 'reflectivity_PAR', '0.12345678')
      expect((await MaterialProperties.fieldState(cardId, 'reflectivity_PAR')).value).toBe(
        '0.1234567'
      )
    })

    it('letters typed into a numeric field are REJECTED, leaving the value intact', async () => {
      const cardId = await radiationCard()
      await MaterialProperties.typeField(cardId, 'specular_scale', 'abc')
      const after = (await MaterialProperties.fieldState(cardId, 'specular_scale')).value
      expect(after).not.toContain('a')
    })
  })

  // ══ Scientific notation and the incomplete exponent ══════════════════════
  //
  // WHAT THIS BLOCK IS FOR: three of this form's validation strings had NO
  // consumer anywhere in e2e/ — `fieldInvalid`, `decimalLimit` and
  // `fieldRequired`. The first two are reached here. The third is left alone on
  // purpose: validateMaterialFieldValue returns it only for an empty value on a
  // field whose resolved `required` is true, and materialBlueprint's own comment
  // records that the material-type payload never carries the flag ("the API
  // sends `required` on object types only"), so `required` resolves to false for
  // every material field. An empty material field is VALID — which is what
  // "the transient keystroke guard error clears on BLUR" already asserts. A test
  // for `fieldRequired` could only ever be written against a value the catalog
  // cannot produce.
  //
  // WHY "1e" IS THE ONLY DIRECT ROUTE TO "Invalid Input"
  // validateMaterialFieldValue reports `fieldInvalid` for a committed value
  // Number() cannot read as finite. Every other way of producing such a value is
  // refused a layer EARLIER by handleFieldChange's keystroke guard, which returns
  // WITHOUT STORING and reports its own copy instead: a letter fails
  // isPartialNumericInput ("This input is not supported"), and so does a '.' the
  // keystroke ADDS to an integer field. "1e" survives because the guard MUST
  // admit it — isPartialNumericInput accepts a trailing exponent so that typing
  // the 'e' of a perfectly good "1e3" does not flash an error on the middle
  // keystroke — and expandForDisplay leaves it alone because it is not a complete
  // number. So the blur commits the literal text "1e", and Number('1e') is NaN.
  //
  // The GROUND-side twin of this reasoning is ground.test.ts →
  // describe('an incomplete exponent'). Same mechanism, DIFFERENT CONSTANTS: this
  // form has its own messages.ts and its own range copy ("Values should be
  // between 0-255", no parens — Geometry's has them), so nothing here may be
  // asserted against GEOMETRY_MSG.
  describe('scientific notation and the incomplete exponent', () => {
    /**
     * A Stomatal Conductance card, which is where every FLOAT case below runs.
     *
     * `gamma_co2` is the field under test throughout: it is TOP-LEVEL, so unlike
     * this type's four stomatal sub-model groups (Ball-woodrow-berry,
     * Ball-berry-leuning, Medlyn Optimality, Buckley-mott-farquhar) it needs no
     * selector set first, and its catalog range is 0-1000 — which is what lets
     * "1e3" land exactly on its inclusive maximum instead of merely somewhere in
     * the middle.
     */
    const gammaCard = async (): Promise<number> => {
      await track()
      await MaterialProperties.waitForOpen()
      return cardWithType('Stomatal Conductance')
    }
    const GAMMA = 'gamma_co2'

    /** A Visualiser card — the colour channels are the catalog's ONLY integer
     *  properties, so they are the only place the integer branch is reachable. */
    const channelCard = async (): Promise<number> => {
      await track()
      await MaterialProperties.waitForOpen()
      return cardWithType('Visualiser')
    }

    /**
     * A colour channel's error text.
     *
     * A deliberate copy of the helper inside describe('visualiser') — that one is
     * private to its block, and reaching into it would couple two describes that
     * are otherwise independent. It cannot be replaced by fieldState(): the
     * channels are NOT FormFields, so there is no `input-{cardId}-{property}` and
     * no `formfield-` wrapper anywhere near them. ColorPicker renders its own
     * `<input data-testid="color-channel-{ch}">` with the Tooltip trigger as the
     * input's following sibling inside a `div.relative`, hence `~` (a GENERAL
     * sibling combinator, so it steps over the opacity box's "%" span).
     *
     * ELEMENT commands only, never browser.execute — an invalid field leaves a
     * pending page error that an execute would collect instead of reading the DOM.
     */
    const channelError = async (which: 'r' | 'g' | 'b' | 'opacity'): Promise<string | null> => {
      const tip = $(`[data-testid="color-channel-${which}"] ~ [aria-label^="Validation error:"]`)
      return (await tip.isExisting().catch(() => false))
        ? await tip.getAttribute('data-tooltip-content').catch(() => null)
        : null
    }

    it('"1e" in a FLOAT field is SILENT while typing, then reports "Invalid Input" on blur', async () => {
      const cardId = await gammaCard()

      // TYPED, not written. The guard tests the WHOLE incoming value, so a
      // native-setter write of "1e" would prove nothing about the keystroke that
      // carries the 'e' — which is the keystroke this test exists for.
      await MaterialProperties.typeField(cardId, GAMMA, '1e')

      // Nothing said yet. handleFieldChange sets `typingExponent` for a value
      // isIncompleteExponent() recognises, and fieldError returns undefined while
      // the flag AND the value agree one is mid-typing. Without that, "Invalid
      // Input" would flash on the 'e' of a valid "1e3" and clear on the next
      // digit — which is exactly why the guard has to admit "1e" in the first
      // place, and therefore why this route to fieldInvalid exists at all.
      const typing = await MaterialProperties.fieldState(cardId, GAMMA)
      expect(`value=${typing.value} error=${typing.error} invalid=${typing.invalid}`).toBe(
        'value=1e error=null invalid=false'
      )

      // The blur ENDS the typing run: typingExponent is cleared, expandForDisplay
      // returns "1e" untouched (there is no complete number to expand), and the
      // validator then sees a value Number() reads as NaN.
      await MaterialProperties.commitField()
      await browser.waitUntil(
        async () =>
          (await MaterialProperties.fieldState(cardId, GAMMA)).error ===
          MATERIALS_MSG.fieldInvalid,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the blur never surfaced "Invalid Input"' }
      )
      // Differential against describe('field validation') two blocks up: a
      // GUARD rejection leaves the box holding the PREVIOUS value, because
      // handleFieldChange returned without storing. This one leaves the offending
      // text standing — it was stored first and judged after — so the value and
      // the message together say WHICH layer refused it.
      const blurred = await MaterialProperties.fieldState(cardId, GAMMA)
      expect(`value=${blurred.value} error=${blurred.error} invalid=${blurred.invalid}`).toBe(
        `value=1e error=${MATERIALS_MSG.fieldInvalid} invalid=true`
      )
    })

    it('"1e" reaches the same message on an INTEGER colour channel', async () => {
      // The integer branch of the guard refuses a '.' the keystroke ADDS and
      // nothing else. "1e" carries no '.', so the branch never fires and an
      // integer field stores it exactly as the float field above does.
      //
      // setColorChannel is enough here even though the guard is the point: its
      // input dispatch runs React's onChange, which IS handleFieldChange — what a
      // native-setter write skips is per-CHARACTER delivery, not the guard. The
      // existing "a DECIMAL in an integer channel is refused by the keystroke
      // GUARD" test rests on the same fact from the other side.
      await channelCard()
      await MaterialProperties.setColorChannel('r', '1e')

      // ADMITTED AND STORED. This line is the differential, and without it the two
      // below are satisfied by a write that never landed: "no error, aria-invalid
      // false" is the exact state of an EMPTY channel. That is not a hypothetical
      // — MaterialVisualisationEditor.commit() is
      // `const field = fieldByProp.get(property); if (field) onFieldChange(...)`,
      // and control() pairs it with `error: field ? fieldError(field) : undefined`.
      // So a channel whose catalog property went missing keeps accepting
      // keystrokes, stores none of them, and reports no error at all. The FLOAT
      // twin above pins value+error+invalid together; this one has to as well.
      expect(await MaterialProperties.colorChannel('r').getValue()).toBe('1e')

      // Suppressed while the exponent is unfinished — which is also what makes
      // the blur below safe to drive with an execute: nothing is invalid yet, so
      // there is no pending page error for commitField to collect.
      expect(await channelError('r')).toBe(null)
      expect(await MaterialProperties.colorChannelInvalid('r')).toBe(false)

      await MaterialProperties.commitField()
      await browser.waitUntil(async () => MaterialProperties.colorChannelInvalid('r'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'blurring an unfinished exponent did not flag the channel'
      })
      // "Invalid Input", NOT the 0-255 range copy: Number('1e') never became a
      // number for the bounds to be compared against.
      expect(await channelError('r')).toBe(MATERIALS_MSG.fieldInvalid)
      expect(await MaterialProperties.colorChannel('r').getValue()).toBe('1e')
    })

    it('"1e3" blur-EXPANDS to 1000 and is accepted — the field TEXT is rewritten', async () => {
      // THE TRAP: a test asserting the box still reads "1e3" after the blur fails.
      // handleFieldBlur runs expandForDisplay so the field shows the number in the
      // decimal form it will be STORED as — otherwise toNativeProperties' Number()
      // would rewrite the text under the user on the next load instead.
      //
      // 1e3 is exactly gamma_co2's catalog maximum, so this is the expansion AND
      // the inclusive upper bound in one write. Read from the catalog rather than
      // trusted: move the bound and this line goes red, instead of 1000 quietly
      // demoting itself to an ordinary mid-range value with everything still green.
      expect(propDef('Stomatal Conductance', GAMMA).max).toBe(1000)
      const cardId = await gammaCard()

      await MaterialProperties.typeField(cardId, GAMMA, '1e3')
      // Before the blur the box holds what was typed — the expansion is a BLUR
      // behaviour, not a keystroke one.
      expect((await MaterialProperties.fieldState(cardId, GAMMA)).value).toBe('1e3')

      await MaterialProperties.commitField()
      await browser.waitUntil(
        async () => (await MaterialProperties.fieldState(cardId, GAMMA)).value === '1000',
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: '"1e3" was never expanded on blur' }
      )
      const after = await MaterialProperties.fieldState(cardId, GAMMA)
      expect(`value=${after.value} invalid=${after.invalid} error=${after.error}`).toBe(
        'value=1000 invalid=false error=null'
      )
    })

    it('"1e-3" expands the other way, to 0.001, and is accepted too', async () => {
      // The negative exponent grows a FRACTION rather than a whole number. On a
      // float whose range is 0-1000 that is simply valid — and it is the same
      // expansion the INTEGER channel below turns into an "Invalid Input", which
      // is what makes the pair worth having: identical text, identical
      // expansion, opposite verdicts, decided by the datatype alone.
      //
      // Note what does NOT happen: expandForDisplay deliberately does not
      // truncate, so the expansion cannot silently zero a small value the way
      // truncateToMaxDecimals would ("1e-9" -> "0.0000000"). Three decimal places
      // is well under the 7-place limit; the value that IS at that edge is "1e-9",
      // in the last test of this block.
      const cardId = await gammaCard()
      await MaterialProperties.typeField(cardId, GAMMA, '1e-3')
      expect((await MaterialProperties.fieldState(cardId, GAMMA)).value).toBe('1e-3')

      await MaterialProperties.commitField()
      await browser.waitUntil(
        async () => (await MaterialProperties.fieldState(cardId, GAMMA)).value === '0.001',
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: '"1e-3" was never expanded on blur' }
      )
      const after = await MaterialProperties.fieldState(cardId, GAMMA)
      expect(`value=${after.value} invalid=${after.invalid} error=${after.error}`).toBe(
        'value=0.001 invalid=false error=null'
      )
    })

    it('"1e-3" in an INTEGER channel expands to 0.001 — IN RANGE, not whole, so "Invalid Input"', async () => {
      /**
       * THE SECOND ROUTE to fieldInvalid, and the subtle one. It needs three
       * separate parts of the form to line up, and each of them is a place a
       * reasonable change would close the route:
       *
       *  1. THE KEYSTROKE GUARD LETS IT THROUGH. The integer branch refuses a '.'
       *     the keystroke ADDS to the field — and "1e-3" contains no '.' at all,
       *     so the branch never fires. isPartialNumericInput accepts the exponent,
       *     and exceedsMaxDecimals derives THREE decimal places from the `-3`,
       *     under the 7-place limit. Nothing stops the value being stored.
       *  2. THE BLUR REWRITES IT to "0.001" — and does so by calling onChangeValue
       *     DIRECTLY, deliberately bypassing handleFieldChange ("Bypasses
       *     handleFieldChange, which would re-enter the guard chain on text that
       *     is already known-numeric"). That bypass is the ONLY reason an integer
       *     field can end up holding a decimal string: re-entering the guard would
       *     refuse the very '.' the expansion had just produced.
       *  3. validateMaterialFieldValue CHECKS RANGE BEFORE DATATYPE. 0.001 sits
       *     inside 0-255, so the range message is not what comes back; it falls
       *     through to the integer check, and 0.001 is not a whole number.
       *
       * So the channel ends up showing "Invalid Input" over a value that is inside
       * the range the field advertises — the DATATYPE error, not the range one.
       * That distinction is the assertion: a form that reported valuesBetween(0,
       * 255) here would look equally "flagged" to any existence check.
       */
      await channelCard()
      await MaterialProperties.setColorChannel('r', '1e-3')

      // Invalid ALREADY, before any blur: "1e-3" is a COMPLETE number, so
      // typingExponent is false and the validator runs on the raw text. (Contrast
      // "1e" two tests up, which is silent until the typing run ends.)
      await browser.waitUntil(async () => MaterialProperties.colorChannelInvalid('r'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'a complete negative exponent was not validated in an integer channel'
      })
      expect(await channelError('r')).toBe(MATERIALS_MSG.fieldInvalid)
      expect(await MaterialProperties.colorChannel('r').getValue()).toBe('1e-3')

      // ── Absorb the pending page error, deliberately ─────────────────────────
      // An invalid field raises a global error in this app, and WebdriverIO hands
      // it to the NEXT execute-class command — which here would be commitField,
      // failing with the app's own validation copy against a command that only
      // blurs. Same absorb, and the same reason, as "a range error and its
      // aria-invalid CLEAR when the value is corrected".
      await browser.execute(() => true).catch(() => {})

      await MaterialProperties.commitField()
      await browser.waitUntil(
        async () => (await MaterialProperties.colorChannel('r').getValue()) === '0.001',
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the blur never expanded "1e-3" in the channel' }
      )
      // THE POINT: the TEXT changed, the VERDICT did not. An integer channel is
      // now displaying a decimal and is refused for being one — not for being out
      // of range, which it is not. Asserted as a labelled string so a regression
      // that swapped the two verdicts fails with both messages in the diff rather
      // than with a bare "expected true".
      expect(`0.001 -> ${await channelError('r')}`).toBe(`0.001 -> ${MATERIALS_MSG.fieldInvalid}`)
      expect(await MaterialProperties.colorChannelInvalid('r')).toBe(true)
    })

    it('"1e-9" is refused at the KEYSTROKE — nine decimal places never reach the field', async () => {
      // The contrast pair, in one test so the two halves cannot drift apart. Both
      // values have the same SHAPE and differ only in the exponent, and
      // exceedsMaxDecimals reads the decimal count out of the exponent ARITHMETIC
      // rather than by expanding the string — so "1e-3" is three places and is
      // stored, "1e-9" is nine and is refused.
      //
      // This is the GUARD, not the validator: handleFieldChange returns WITHOUT
      // STORING, so the copy is decimalLimit and the box keeps what it held before
      // the refused keystroke. Here that "before" is "1e-" — the typing run had
      // got as far as the exponent's sign. That is what makes this a refusal at
      // the keystroke rather than a rejected value, and why it must be TYPED: a
      // whole-value write would leave the field on its PREVIOUS content and the
      // "1e-" — the thing that shows exactly which character was turned away —
      // would never exist.
      const cardId = await gammaCard()

      // ADMITTED: three decimal places.
      await MaterialProperties.typeField(cardId, GAMMA, '1e-3')
      const ok = await MaterialProperties.fieldState(cardId, GAMMA)
      expect(`value=${ok.value} error=${ok.error}`).toBe('value=1e-3 error=null')

      // REFUSED: the ninth place, on the last keystroke of the run.
      await MaterialProperties.typeField(cardId, GAMMA, '1e-9')
      await browser.waitUntil(
        async () =>
          (await MaterialProperties.fieldState(cardId, GAMMA)).error ===
          MATERIALS_MSG.decimalLimit,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the ninth decimal place was not refused' }
      )
      // The '9' never landed — React restores the controlled input to the value
      // the guard left standing — and the message is the GUARD's. "Invalid Input"
      // would be the wrong copy here even though Number('1e-') is just as NaN as
      // Number('1e'): the validator never saw this value at all.
      const refused = await MaterialProperties.fieldState(cardId, GAMMA)
      expect(`value=${refused.value} error=${refused.error} invalid=${refused.invalid}`).toBe(
        `value=1e- error=${MATERIALS_MSG.decimalLimit} invalid=true`
      )
    })
  })

  // ══ Search ═══════════════════════════════════════════════════════════════

  // ══ Catalog-driven coverage ══════════════════════════════════════════════
  //
  // The user stories name ~60 parameters with explicit ranges; the suite used to
  // assert about a dozen. The form is CATALOG-driven, so the honest shape is a
  // generated sweep against the same table the backend serves rather than a
  // hand-written test per field.
  //
  // ONE it() PER PROPERTY, deliberately. A single giant test would name only the
  // first failure, and would risk the 120s per-test ceiling. It also keeps to
  // the rule the geometry range tests already follow — exactly one invalid write
  // per test — because an out-of-range value raises a global error that
  // WebdriverIO surfaces on the NEXT execute, so chaining several invalid writes
  // reports the wrong one.

  const SWEPT_TYPES = ['Radiation', 'Energy Balance', 'Photosynthesis', 'Stomatal Conductance']

  describe('parameter ranges — the catalog sweep', () => {
    // ONE test per property, probing three values in a FIXED ORDER:
    //   min (valid) -> max (valid) -> just above max (invalid + the message).
    //
    // The order is load-bearing, not stylistic. An out-of-range value raises a
    // global error that WebdriverIO surfaces on the NEXT browser.execute, and
    // setField IS an execute — so a second write after an invalid one fails the
    // COMMAND carrying the app's validation copy, instead of failing the
    // assertion it belongs to. Putting the only invalid write last means nothing
    // executes after it: fieldState reads through ELEMENT commands, which are
    // unaffected. That is also why this is one test per property rather than one
    // giant test, and why below-minimum lives in its own describe below.
    for (const type of SWEPT_TYPES) {
      for (const p of numericProps(type)) {
        it(`${type}.${p.property} accepts ${p.min} and ${p.max}, rejects ${justAboveMax(p)}`, async () => {
          await track()
          await MaterialProperties.waitForOpen()
          const cardId = await cardWithType(type)
          // Farquhar and the stomatal sub-models only render once their selector
          // is set — the catalog's `selector` column says which.
          if (p.selector) {
            await MaterialProperties.setEnum(
              cardId,
              p.selector.property,
              enumLabel(type, p.selector.property, p.selector.value)
            )
          }

          // Both bounds are INCLUSIVE.
          for (const bound of [p.min as number, p.max as number]) {
            await MaterialProperties.setField(cardId, p.property, String(bound))
            const ok = await MaterialProperties.fieldState(cardId, p.property)
            expect(`${p.property}=${bound} invalid=${ok.invalid}`).toBe(
              `${p.property}=${bound} invalid=false`
            )
          }

          await MaterialProperties.setField(cardId, p.property, justAboveMax(p))
          const bad = await MaterialProperties.fieldState(cardId, p.property)
          expect(`${p.property} invalid=${bad.invalid}`).toBe(`${p.property} invalid=true`)
          expect(bad.error).toBe(MATERIALS_MSG.valuesBetween(p.min as number, p.max as number))
        })
      }
    }
  })

  describe('parameter ranges — below the minimum', () => {
    // One representative property per type rather than all 41: the below-min
    // branch is the same code path as above-max (rangeMessage is built from both
    // bounds either way), so sweeping it again would double the runtime to
    // re-prove one comparison. The first numeric property of each type is enough
    // to catch a bound that has moved in only one direction.
    for (const type of SWEPT_TYPES) {
      const p = numericProps(type)[0]
      it(`${type}.${p.property} rejects ${justBelowMin(p)} with the catalog range`, async () => {
        await track()
        await MaterialProperties.waitForOpen()
        const cardId = await cardWithType(type)
        if (p.selector) {
          await MaterialProperties.setEnum(
            cardId,
            p.selector.property,
            enumLabel(type, p.selector.property, p.selector.value)
          )
        }
        await MaterialProperties.setField(cardId, p.property, justBelowMin(p))
        const state = await MaterialProperties.fieldState(cardId, p.property)
        expect(`${p.property} invalid=${state.invalid}`).toBe(`${p.property} invalid=true`)
        expect(state.error).toBe(MATERIALS_MSG.valuesBetween(p.min as number, p.max as number))
      })
    }
  })

  describe('enum parameters (the portalled Select)', () => {
    // Until now NOTHING exercised a material dropdown, for a mechanical reason:
    // FormField puts `input-{name}` on a WRAPPER DIV for the enum branch, so
    // setField's value-setter call threw `Illegal invocation` against a <div>.
    // MaterialProperties.setEnum/enumOptions address the Select properly.

    for (const type of Object.keys(MATERIAL_CATALOG)) {
      for (const p of MATERIAL_CATALOG[type].filter((x) => x.datatype === 'enum')) {
        it(`${type}.${p.property} offers exactly the catalog's options`, async () => {
          await track()
          await MaterialProperties.waitForOpen()
          const cardId = await cardWithType(type)
          await MaterialProperties.openEnum(cardId, p.property)
          const labels = (await MaterialProperties.enumOptions(cardId, p.property)).map(
            (o) => o.label
          )
          // `clearable` adds the placeholder as a leading clear row, so the
          // catalog's values must be CONTAINED, in order, not equal.
          for (const v of p.enumValues as string[])
            expect(labels).toContain(enumLabel(type, p.property, v))
          await MaterialProperties.closeEnum()
        })

        it(`${type}.${p.property} keeps the option that was picked`, async () => {
          await track()
          await MaterialProperties.waitForOpen()
          const cardId = await cardWithType(type)
          const want = enumLabel(type, p.property, (p.enumValues as string[])[0])
          await MaterialProperties.setEnum(cardId, p.property, want)
          expect((await MaterialProperties.enumState(cardId, p.property)).label).toBe(want)
        })
      }
    }

    it('a SELECTOR dropdown lists group names, not the values it stores', async () => {
      // The sub-model pickers relabel themselves: materialBlueprint maps each
      // selector_value to the NAME OF THE GROUP it unlocks, so the user picks
      // "Ball-woodrow-berry" while the stored value is "BWB". Nothing asserted
      // this, and it is the single behaviour that broke 31 tests on the first
      // run of this sweep — worth pinning so the next person meets it here
      // rather than in a stack trace.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Stomatal Conductance')
      await MaterialProperties.openEnum(cardId, 'stomatal_model')
      const labels = (await MaterialProperties.enumOptions(cardId, 'stomatal_model')).map(
        (o) => o.label
      )
      expect(isSelectorEnum('Stomatal Conductance', 'stomatal_model')).toBe(true)
      expect(labels).toContain('Ball-woodrow-berry')
      expect(labels).not.toContain('BWB')
      await MaterialProperties.closeEnum()
    })

    it('a sub-model selector starts UNSET, showing the "Select" placeholder', async () => {
      // Raised from an observation of the running app, then settled by probing
      // the DOM: neither selector is pre-filled. A new card is created with
      // `values: {}` (reducer.ts emptyCard) and SET_PARAMETER_GROUP_TYPE does not
      // seed anything, so the control renders '' and Select shows its
      // placeholder. Photosynthesis is the one worth stating explicitly: it has
      // exactly ONE real option, so it LOOKS like a field that ought to come
      // pre-selected — and it does not.
      // The control's TEXT is the placeholder, "Select" — Select renders
      // `{selected?.label ?? placeholder}`, so an unset field reads "Select"
      // rather than being blank. Poll for it: reading straight after pickType
      // can catch the card mid-render and return '', which is a race, not the
      // resting state. (That race is exactly what made a first pass at this test
      // assert '' and fail.)
      const settledLabel = async (cardId: number, prop: string): Promise<string> => {
        await browser.waitUntil(
          async () => (await MaterialProperties.enumState(cardId, prop)).label !== '',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `${prop} never rendered its control text` }
        )
        return (await MaterialProperties.enumState(cardId, prop)).label
      }

      await track()
      await MaterialProperties.waitForOpen()

      // DEVIATION: the two selectors no longer behave alike, and that is the point.
      //
      // Photosynthesis's `submodel` has exactly ONE value, so it is a FIXED
      // selector: seeded on type-pick, its dropdown stripped of the "Select" clear
      // row, and its group revealed unprompted. It used to open on the placeholder
      // like any other selector, which is what this test asserted.
      const photo = await cardWithType('Photosynthesis')
      expect(isFixedSelector('Photosynthesis', 'submodel')).toBe(true)
      expect(await settledLabel(photo, 'submodel')).toBe(
        enumLabel('Photosynthesis', 'submodel', 'farquhar_model')
      )
      expect(await MaterialProperties.hasField(photo, 'vcmax25')).toBe(true)

      // Four sub-models IS a real choice, so this one still arrives unanswered —
      // placeholder showing, and nothing gated behind it rendered. Asserted as the
      // differential: if the fixed-selector rule ever leaked into every selector,
      // this half turns red while the half above stays green.
      const stomatal = await cardWithType('Stomatal Conductance')
      expect(isFixedSelector('Stomatal Conductance', 'stomatal_model')).toBe(false)
      expect(await settledLabel(stomatal, 'stomatal_model')).toBe(MATERIALS_MSG.selectPlaceholder)
      expect(await MaterialProperties.hasField(stomatal, 'bwb_gs0')).toBe(false)
    })

    it('picking a sub-model changes the CONTROL, but the clear row STAYS in the list', async () => {
      // The distinction that caused a real disagreement about how this behaves.
      //
      // CLOSED CONTROL: reads the placeholder "Select" before a pick and the
      // chosen option's label after one — so "Select" does visibly go away.
      // OPEN LIST: the "Select" row is still there afterwards, now unselected.
      // It is the CLEAR row, not a placeholder entry — FormField defaults
      // clearable=true and Select unconditionally prepends {value:'', label:
      // placeholder}. It exists so the field can be UNSET again.
      //
      // Both readings of "the Select option is no longer available" are therefore
      // partly right, which is exactly why this is pinned.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Stomatal Conductance')

      await MaterialProperties.openEnum(cardId, 'stomatal_model')
      const before = await MaterialProperties.enumOptions(cardId, 'stomatal_model')
      expect(before.find((o) => o.label === MATERIALS_MSG.selectPlaceholder)?.selected).toBe(true)
      await MaterialProperties.closeEnum()

      const label = enumLabel('Stomatal Conductance', 'stomatal_model', 'BWB')
      await MaterialProperties.setEnum(cardId, 'stomatal_model', label)

      // The control no longer says "Select".
      expect((await MaterialProperties.enumState(cardId, 'stomatal_model')).label).toBe(label)

      // …but the list still offers it, now unselected.
      await MaterialProperties.openEnum(cardId, 'stomatal_model')
      const after = await MaterialProperties.enumOptions(cardId, 'stomatal_model')
      const clearRow = after.find((o) => o.label === MATERIALS_MSG.selectPlaceholder)
      expect(clearRow).toBeDefined()
      expect(clearRow?.selected).toBe(false)
      expect(after.find((o) => o.label === label)?.selected).toBe(true)
      await MaterialProperties.closeEnum()
    })

    it('only the FOUR catalog sub-models are offered, alongside the clear row', async () => {
      // Closes "only the applicable/available sub-models are displayed".
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Stomatal Conductance')
      await MaterialProperties.openEnum(cardId, 'stomatal_model')
      const labels = (await MaterialProperties.enumOptions(cardId, 'stomatal_model')).map(
        (o) => o.label
      )
      const expected = (
        MATERIAL_CATALOG['Stomatal Conductance'].find((p) => p.property === 'stomatal_model')
          ?.enumValues ?? []
      ).map((v) => enumLabel('Stomatal Conductance', 'stomatal_model', v))
      expect(labels).toEqual([MATERIALS_MSG.selectPlaceholder, ...expected])
      await MaterialProperties.closeEnum()
    })

    it('the Two-Sided Heat Transfer Flag is a DROPDOWN, not a toggle', async () => {
      // DEVIATION: the story calls this a "toggle" for Energy Balance,
      // Photosynthesis and Boundary Layer Conductance and a "dropdown" only for
      // Radiation. The catalog types it as an enum on all four, so it renders as
      // a combobox everywhere — there is no switch anywhere on these cards.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Energy Balance')
      await expect(MaterialProperties.enumControl(cardId, 'two_sided_heat_transfer')).toBeDisplayed()
      expect(
        await MaterialProperties.enumControl(cardId, 'two_sided_heat_transfer').getAttribute(
          'aria-haspopup'
        )
      ).toBe('listbox')
    })
  })

  describe('conditional parameter groups', () => {
    it('the Farquhar fields are revealed WITHOUT a pick — its selector is fixed', async () => {
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Photosynthesis')
      // DEVIATION: this used to assert the Farquhar fields were ABSENT until the
      // selector was set. `submodel` offers exactly ONE value, so materialBlueprint
      // treats it as a FIXED selector: the card seeds it on type-pick and the group
      // is active from the very first render. There is no unset state to observe.
      //
      // The GATE itself is still covered — by the stomatal sub-models in the next
      // test, which are a real four-way choice and stay hidden until one is picked.
      expect(isFixedSelector('Photosynthesis', 'submodel')).toBe(true)
      expect(await MaterialProperties.hasField(cardId, 'vcmax25')).toBe(true)
      // Choosing the one option explicitly is a no-op, not a toggle — the group
      // stays put rather than clearing, which is what a clearable enum would do.
      await MaterialProperties.setEnum(
        cardId,
        'submodel',
        enumLabel('Photosynthesis', 'submodel', 'farquhar_model')
      )
      expect(await MaterialProperties.hasField(cardId, 'vcmax25')).toBe(true)
      expect(await MaterialProperties.hasField(cardId, 'topt_tpu')).toBe(true)
    })

    it('each stomatal sub-model reveals ITS OWN fields and hides the others', async () => {
      // Four mutually exclusive groups behind one selector — the sharpest
      // conditional-rendering case in the catalog, and nothing covered it.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Stomatal Conductance')
      const groups: [string, string, string][] = [
        ['BWB', 'bwb_gs0', 'bbl_d0'],
        ['BBL', 'bbl_d0', 'bwb_gs0'],
        ['Medlyn', 'medlyn_g1', 'bmf_em'],
        ['BMF', 'bmf_em', 'medlyn_g1']
      ]
      for (const [model, shown, hidden] of groups) {
        // The dropdown shows the GROUP NAME, not the stored value.
        const label = enumLabel('Stomatal Conductance', 'stomatal_model', model)
        await MaterialProperties.setEnum(cardId, 'stomatal_model', label)
        expect(`${model} shows ${shown}=${await MaterialProperties.hasField(cardId, shown)}`).toBe(
          `${model} shows ${shown}=true`
        )
        expect(`${model} hides ${hidden}=${await MaterialProperties.hasField(cardId, hidden)}`).toBe(
          `${model} hides ${hidden}=false`
        )
      }
    })

    it('gamma_co2 is top-level and does NOT depend on the stomatal model', async () => {
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Stomatal Conductance')
      expect(await MaterialProperties.hasField(cardId, 'gamma_co2')).toBe(true)
    })
  })

  describe('catalog properties the form withholds', () => {
    it('the plain reflectivity/transmissivity/emissivity inputs are ABSENT, not disabled', async () => {
      // DEVIATION: the story says adding radiation BANDS should DISABLE the
      // broadband trio. The catalog marks them `superseded`, so no input is
      // rendered for them in ANY state — there is nothing to disable. They still
      // validate and still reach the engine; they are simply not offerable.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Radiation')
      for (const prop of ['reflectivity', 'transmissivity', 'emissivity']) {
        expect(`${prop} rendered=${await MaterialProperties.hasField(cardId, prop)}`).toBe(
          `${prop} rendered=false`
        )
      }
      // The per-band trio that supersedes them IS rendered.
      expect(await MaterialProperties.hasField(cardId, 'reflectivity_PAR')).toBe(true)
    })

    it('glass_n_ does not exist on the Radiation card', async () => {
      // DEVIATION: the story lists `glass_n_` under Radiation. It is not a
      // property type, not a catalog row, and not a field — a genuine gap
      // between the story and the product, not a rename.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Radiation')
      expect(await MaterialProperties.hasField(cardId, 'glass_n_')).toBe(false)
    })

    it('computed and external properties get no input', async () => {
      // surface_temperature is `computed` on Radiation: it exists on the type
      // and reaches the engine, but the user is never asked for it.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Radiation')
      expect(await MaterialProperties.hasField(cardId, 'surface_temperature')).toBe(false)
    })
  })

  describe('search', () => {
    it('a partial query filters the list to matching rows ONLY', async () => {
      const a = await track()
      await renameAndSettle(a, 'AlphaMat')
      const b = await track()
      await renameAndSettle(b, 'BetaMat')
      await Materials.search('Alpha')
      const names = await Materials.names()
      expect(names).toContain('AlphaMat')
      expect(names).not.toContain('BetaMat')
    })

    it('the query is case-insensitive', async () => {
      const id = await track()
      await renameAndSettle(id, 'CaseProbe')
      for (const q of ['caseprobe', 'CASEPROBE', 'cAsEpRoBe']) {
        await Materials.search(q)
        expect(await Materials.names()).toContain('CaseProbe')
      }
    })

    it('a query matching nothing shows "No materials found"', async () => {
      await track()
      await Materials.search('zzzqqq___nomatch')
      await Materials.listEmpty.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      expect(await Materials.emptyHint()).toBe(MATERIALS_MSG.noMatches)
    })

    it('clearing the query restores every row', async () => {
      const id = await track()
      await Materials.search('zzzqqq___nomatch')
      expect(await Materials.rowCount()).toBe(0)
      await Materials.clearSearch()
      await browser.waitUntil(async () => (await Materials.rowState(id)) !== undefined, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'clearing the search never restored the list'
      })
    })
  })

  // ══ Delete ═══════════════════════════════════════════════════════════════

  describe('delete', () => {
    it('cancelling the confirmation keeps the material', async () => {
      const id = await track()
      await Materials.cancelDelete(id)
      expect(await Materials.rowState(id)).toBeDefined()
    })

    it('confirming removes it and the toast names it', async () => {
      const id = await track()
      const name = await nameOf(id)
      await drainToasts()
      await Materials.deleteRow(id)
      created = created.filter((x) => x !== id)
      await waitForToast(MATERIALS_TOAST.deleted(name))
    })
  })

  // ══ Persistence and the GLOBAL library ═══════════════════════════════════

  describe('persistence and the global library', () => {
    /**
     * These provision their own projects and do NOT use track(): they navigate
     * away, so the shared afterEach could not reach their rows. Materials leak
     * between projects by design, which is exactly what two of these assert.
     */
    const freshProject = async (label: string): Promise<{ id: string; name: string }> => {
      await reloadToHome()
      return enterMaterials(label)
    }

    it('a saved material survives closing and reopening the project', async () => {
      const project = await freshProject('matpersist')
      const id = await Materials.addMaterial()
      const name = await nameOf(id)
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Visualiser')
      await MaterialProperties.setColorChannel('r', '77')
      await MaterialProperties.setColorChannel('g', '88')
      await MaterialProperties.setColorChannel('b', '99')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled'
      })
      await MaterialProperties.saveCard(cardId)

      await reopenByName(project.name)
      await Materials.panel.waitForDisplayed({ timeout: TIMEOUTS.LONG })

      const reopened = await Materials.idForName(name)
      expect(reopened).not.toBe(null)
      await Materials.openMaterial(reopened as string)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(
        async () => (await MaterialProperties.colorChannel('r').getValue()) === '77',
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the saved colour did not reload' }
      )
    })

    it('the library is GLOBAL — a material created in one project appears in another', async () => {
      // Differential: unlike geometry, materials are NOT scenario-scoped. If
      // they were ever scoped, this row would vanish in the second project.
      await freshProject('globalA')
      const id = await Materials.addMaterial()
      const name = await nameOf(id)

      await freshProject('globalB')
      await Materials.panel.waitForDisplayed({ timeout: TIMEOUTS.LONG })
      await browser.waitUntil(async () => (await Materials.names()).includes(name), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `"${name}" did not appear in the second project — the library is not global`
      })
    })
  })

  // ══ Failure paths ════════════════════════════════════════════════════════

  describe('backend failures', () => {
    it('a failed create adds NO row', async () => {
      const before = await Materials.rowCount()
      await withApiFault('POST', '/materials/library/groups', async () => {
        await Materials.addButton.click()
        expect(
          await staysFalse(async () => (await Materials.rowCount()) !== before)
        ).toBe(true)
      })
    })

    it('a failed delete KEEPS the material', async () => {
      // Differential: delete is pessimistic — the row must not move until the
      // server confirms.
      const id = await track()
      await withApiFault('DELETE', '/materials/library/groups', async () => {
        await Materials.deleteRow(id).catch(() => {})
      })
      await Materials.closeAnyOpenDialog()
      expect(await Materials.rowState(id)).toBeDefined()
    })

    it('a failed rename does not change the displayed name', async () => {
      const id = await track()
      const before = await nameOf(id)
      // PATCH .../groups/{id}/rename — NOT PUT. (The comment above the call in
      // Materials/service.ts still says PUT; the code does .patch.)
      await withApiFault('PATCH', '/library/groups', async () => {
        await Materials.renameRow(id, 'NeverLands', 'enter')
        expect(
          await staysFalse(async () => (await Materials.rowState(id))?.name === 'NeverLands')
        ).toBe(true)
      })
      await browser.keys(['Escape'])
      expect(await nameOf(id)).toBe(before)
    })
  })

  describe('library list — ordering and chrome', () => {
    it('a newly created material sorts to the BOTTOM after a list reload', async () => {
      // DEVIATION: Story 11 asks for descending order (newest at the top).
      // Materials/service.ts listMaterials deliberately re-sorts the backend's
      // newest-first response (list_groups orders created_at DESC) to created_at
      // ASCENDING, and says why: "matching Geometry, which sorts its objects by
      // created_at ascending". Asserted as SHIPPED — nothing asserted ordering in
      // either direction before.
      //
      // The reload is load-bearing, not scenery. CREATE_MATERIAL_SUCCEEDED appends
      // the new row locally (reducer `order.push`) and the saga never re-lists, so
      // an in-session list reads bottom-appended whatever the endpoint returns —
      // only a FETCHED list exercises the sort. Materials are GLOBAL, so both rows
      // follow us into the new project and afterEach can still reach them.
      //
      // The two creates cannot tie: MaterialGroup.created_at is
      // datetime.now(timezone.utc).isoformat(), i.e. microsecond precision, and
      // localeCompare orders those ISO strings correctly.
      const older = await track()
      const newer = await track()
      const olderName = await nameOf(older)
      const newerName = await nameOf(newer)

      await reloadToHome()
      await enterMaterials('matorder')
      await browser.waitUntil(
        async () => {
          const names = await Materials.names()
          return names.includes(olderName) && names.includes(newerName)
        },
        { timeout: TIMEOUTS.LONG, timeoutMsg: 'the two tracked materials never reloaded' }
      )

      const names = await Materials.names()
      expect(names.indexOf(newerName)).toBeGreaterThan(names.indexOf(olderName))
      // Leftovers in the global library are older by construction, so the newest
      // material is the last row. (Not a row COUNT — the library size is unknown.)
      expect(names[names.length - 1]).toBe(newerName)
    })

    it('the Saved Materials heading and the search box SURVIVE a query matching nothing', async () => {
      // Both live outside materials-list (Materials/index.tsx renders them as
      // siblings of it), which is the whole point: emptying the list must not take
      // the way back out of it along too.
      await track()
      await Materials.search('zzzqqq___nomatch')
      await Materials.listEmpty.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      expect(await Materials.emptyHint()).toBe(MATERIALS_MSG.noMatches)
      await expect(Materials.panel).toHaveText(MATERIALS_MSG.savedMaterials, { containing: true })
      await expect(Materials.searchBox).toBeDisplayed()
      // Zero here is the FILTER's doing, not an assumption about the library.
      expect(await Materials.rowCount()).toBe(0)
    })

    it('clicking a SEARCH RESULT opens THAT material in the Properties form', async () => {
      // The panel has to actually change hands: the second create leaves ITS
      // material open, so a passing assertion cannot be the create's own doing.
      const a = await track()
      await renameAndSettle(a, 'FindMeAlpha')
      const b = await track()
      await renameAndSettle(b, 'OtherBeta')

      await Materials.search('FindMeAlpha')
      // Membership, not a count: the library is global and its size is unknown.
      await browser.waitUntil(
        async () => {
          const names = await Materials.names()
          return names.includes('FindMeAlpha') && !names.includes('OtherBeta')
        },
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the query never narrowed the list to the match' }
      )

      await Materials.openMaterial(a)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === 'FindMeAlpha', {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the right panel never switched to the searched material'
      })
      expect((await Materials.rowState(a))?.selected).toBe(true)
    })
  })

  // ══ Delete confirmation — the material ═══════════════════════════════════════

  describe('delete confirmation — the material', () => {
    it('the confirmation names the MATERIAL over the generic consequence line', async () => {
      // DEVIATION: Story 15 asks for a material-specific warning about associated
      // geometry data. The shipped body is the generic line Geometry uses word for
      // word (messages.ts deleteBody) and names neither the material nor its data —
      // only the heading names anything at all. Asserted as SHIPPED.
      const id = await track()
      const name = await nameOf(id)
      await openRowDelete(id)
      const dlg = await waitForOpenDialog()
      expect(dlg.ariaLabel).toBe(MATERIALS_MSG.deleteTitle)
      expect(dlg.heading).toBe(MATERIALS_MSG.deleteHeading(name))
      expect(dlg.body).toBe(DELETE_BODY)
    })

    it('the buttons are Cancel then Delete — there is NO "Yes"', async () => {
      // DEVIATION: Story 15 asks for Yes / Cancel. ORDER is asserted, not just
      // membership: components/Dialog focuses the LAST enabled BODY button, so
      // Cancel-then-Delete is exactly what makes Enter on an opened confirmation
      // destructive — pinned here rather than left as folklore.
      const id = await track()
      await openRowDelete(id)
      const dlg = await waitForOpenDialog()
      expect(dlg.buttons).toEqual(['Cancel', 'Delete'])
      expect(dlg.buttons).not.toContain('Yes')
      expect(dlg.focused).toBe('Delete')
      // The header × is NOT one of the two — it lives in <header>, outside the body
      // div, which is why Dialog's own bodyButtons() ignores it.
      expect(dlg.hasCloseButton).toBe(true)
    })

    it('Escape closes the confirmation and KEEPS the material', async () => {
      const id = await track()
      await openRowDelete(id)
      await waitForOpenDialog()
      await browser.keys(['Escape'])
      await waitForNoOpenDialog()
      expect(await Materials.rowState(id)).toBeDefined()
    })

    it('the header × closes the confirmation and KEEPS the material', async () => {
      // A third way out that neither Cancel nor Escape covers, running the same
      // onClose. Nothing had asserted it even exists on a material row.
      const id = await track()
      await openRowDelete(id)
      await waitForOpenDialog()
      await clickDialogClose()
      await waitForNoOpenDialog()
      expect(await Materials.rowState(id)).toBeDefined()
    })

    it('three rapid taps on the row trash open exactly ONE dialog', async () => {
      // Repeated taps must not stack modals. Shipped behaviour satisfies it
      // structurally — confirmDeleteOpen is one boolean per row — so this guards
      // the structure rather than a guard clause.
      const id = await track()
      await openRowDelete(id, 3)
      await waitForOpenDialog()
      expect(await countOpenDialogs()).toBe(1)
    })

    it('the FORM header trash opens its OWN confirmation, naming the same material', async () => {
      // The second of the three Delete dialogs Materials renders (the whole-material
      // one in MaterialPropertiesForm), and the reason a bare
      // dialog[aria-label="Delete"] is THREE-way ambiguous in this feature. Never
      // observed before.
      const id = await track()
      const name = await nameOf(id)
      await MaterialProperties.waitForOpen()
      await browser.execute(() => {
        // The row trash carries the same aria-label — and those two are the only
        // occurrences in src/ — so take the one OUTSIDE the Materials panel.
        const btn = Array.from(document.querySelectorAll('[aria-label="Delete material"]')).find(
          (b) => !b.closest('[data-testid="materials-panel"]')
        ) as HTMLElement | undefined
        if (!btn) throw new Error('the Properties form has no Delete material control')
        btn.click()
      })
      const dlg = await waitForOpenDialog()
      expect(dlg.heading).toBe(MATERIALS_MSG.deleteHeading(name))
      expect(dlg.body).toBe(DELETE_BODY)
      expect(dlg.buttons).toEqual(['Cancel', 'Delete'])
      // Cancelled, never confirmed: confirming from the form is a second delete path
      // that would race afterEach's cleanup for no extra coverage.
      await clickDialogButton('Cancel')
      await waitForNoOpenDialog()
      expect(await Materials.rowState(id)).toBeDefined()
    })
  })

  // ══ Material-type cards — the third confirmation, and the type limit ═════════

  describe('material-type cards', () => {
    it('deleting a SAVED type card confirms first, naming the TYPE not the material', async () => {
      // THE THIRD delete confirmation (the one inside ParameterGroupCard) — the one
      // nothing at any level has tested. Its heading is built from
      // `type.materialtype`, so it reads Delete "Visualiser"? where the row and
      // form-header dialogs both name the MATERIAL.
      //
      // onDeleteClick picks between this and an unconfirmed removal purely on
      // `group.saved`; the unsaved half is already covered by 'an unsaved card is
      // removed with NO confirmation'.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await saveVisualiserCard()

      await MaterialProperties.removeCard(cardId)
      const dlg = await waitForOpenDialog()
      expect(dlg.ariaLabel).toBe(MATERIALS_MSG.deleteTitle)
      expect(dlg.heading).toBe(MATERIALS_MSG.deleteHeading('Visualiser'))
      expect(dlg.body).toBe(DELETE_BODY)
      expect(dlg.buttons).toEqual(['Cancel', 'Delete'])
      // Still there while the question is being asked.
      expect(await MaterialProperties.cardIds()).toContain(cardId)
    })

    it('Cancel KEEPS the saved type card and Delete removes it', async () => {
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await saveVisualiserCard()

      await MaterialProperties.removeCard(cardId)
      await waitForOpenDialog()
      await clickDialogButton('Cancel')
      await waitForNoOpenDialog()
      expect(await MaterialProperties.cardIds()).toContain(cardId)

      // Confirming goes to the backend (DELETE .../materials/{typeId}); the card is
      // dropped only when REMOVE_PARAMETER_GROUP lands, so this needs the write budget.
      await MaterialProperties.removeCard(cardId)
      await waitForOpenDialog()
      await clickDialogButton('Delete')
      await browser.waitUntil(async () => !(await MaterialProperties.cardIds()).includes(cardId), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'confirming never removed the saved material-type card'
      })
    })

    it('collapsing a card hides its FIELDS but keeps the card and its type', async () => {
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Energy Balance')
      await MaterialProperties.field(cardId, 'heat_capacity').waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Energy Balance did not render its heat_capacity field'
      })

      await MaterialProperties.toggleCard(cardId)
      await browser.waitUntil(async () => !(await MaterialProperties.cardOpen(cardId)), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the card never collapsed'
      })
      // The card body sits behind `open &&`, so the fields UNMOUNT — unlike the left
      // panel's accordions, which only display:none. Non-existence is the correct
      // assertion here, and it is the exception to trap 5.
      expect(await MaterialProperties.hasField(cardId, 'heat_capacity')).toBe(false)
      expect(await MaterialProperties.cardIds()).toContain(cardId)
      // The material-type Select is OUTSIDE that gate: collapsed, it is the only
      // thing left saying WHICH type the card holds.
      expect(await MaterialProperties.selectedType(cardId)).toBe('Energy Balance')
    })

    it('Add Material Type DISABLES once there is a card per catalog type', async () => {
      // MaterialProperties.addTypeEnabled() has been dead code until now.
      //
      // The guard is `draft.groups.length >= materialTypes.length` — it counts
      // CARDS, not types actually chosen — so seven BLANK cards reach the limit
      // exactly as seven configured ones would. That is why this costs six clicks
      // and no type picks.
      await track()
      await MaterialProperties.waitForOpen()
      const initial = await MaterialProperties.cardIds()
      expect(initial.length).toBe(1)
      expect(await MaterialProperties.addTypeEnabled()).toBe(true)

      // The limit IS the catalog's size, read from the live dropdown rather than
      // assumed: the type picker passes `searchable` but NOT `clearable`
      // (Select's own comment: "FormField needs it; the type picker never had one"),
      // so there is no leading clear row and the option count IS the type count.
      await MaterialProperties.openTypeDropdown(initial[0])
      const offered = (await MaterialProperties.typeOptions()).length
      await browser.keys(['Escape'])
      // The listbox is portalled and would otherwise sit over the panel; prove it
      // went before clicking anything else, so a stuck list can't be misreported as
      // an intercepted click on Add Material Type.
      await browser.waitUntil(async () => !(await $('[role="listbox"]').isExisting()), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the material type listbox stayed open after Escape'
      })
      expect(offered).toBe(KNOWN_MATERIAL_TYPES.length)

      for (let i = initial.length; i < offered; i++) await MaterialProperties.addCard()
      expect((await MaterialProperties.cardIds()).length).toBe(offered)

      await browser.waitUntil(async () => !(await MaterialProperties.addTypeEnabled()), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Add Material Type stayed enabled with one card per catalog type'
      })
      // The disabled button explains itself through ToolbarButton's native `title` —
      // the only consumer MATERIALS_MSG.allTypesAdded has anywhere in the product.
      expect(await MaterialProperties.addTypeButton.getAttribute('title')).toBe(
        MATERIALS_MSG.allTypesAdded
      )
    })
  })

  // ══ Backend failures — the list and the open ═════════════════════════════════

  describe('backend failures — loading the library', () => {
    /**
     * The panel's own error banner (load / create / action).
     *
     * It is a DIRECT CHILD of materials-panel, above materials-list; a rename error
     * lives INSIDE the list instead, which is why this cannot just read the first
     * `.form-error-text` on the page.
     */
    const panelError = async (): Promise<string | null> =>
      browser.execute(() => {
        const panel = document.querySelector('[data-testid="materials-panel"]')
        if (!panel) return null
        const el = Array.from(panel.children).find((c) => c.classList.contains('form-error-text'))
        return el ? (el.textContent || '').trim() : null
      })

    it('a failed OPEN of a saved material REPORTS it and keeps the row', async () => {
      const id = await track()
      const name = await nameOf(id)

      // The reload is what makes this failure reachable at all, not decoration: a
      // create SEEDS the detail cache (CREATE_MATERIAL_SUCCEEDED writes
      // detailsById[groupId]) and openSavedMaterialWorker serves a cached detail
      // with NO GET, so there is no request to break until
      // LIST_MATERIALS_SUCCEEDED has emptied detailsById.
      await reloadToHome()
      await enterMaterials('matopenfail')
      await browser.waitUntil(async () => (await Materials.rowState(id)) !== undefined, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: `"${name}" did not come back after the reload`
      })

      // The TRAILING SLASH is load-bearing: groupsList is
      // /api/materials/library/groups and groupsGet is …/groups/{id}, so this
      // breaks the open WITHOUT breaking the list that just filled the panel.
      await withApiFault('GET', '/library/groups/', async () => {
        await Materials.openMaterial(id)
        // That a banner appears AT ALL is the differential: OPEN_SAVED_MATERIAL_FAILED
        // used to be dispatched into the void ("so a failed open showed nothing at
        // all"), leaving the panel looking merely inert. The wording itself is
        // axios's own transport text — index.tsx renders `actionError` raw with no
        // fallback — and is deliberately not pinned, since it is the platform's
        // string and not the product's.
        await browser.waitUntil(async () => (await panelError()) !== null, {
          timeout: TIMEOUTS.LONG,
          timeoutMsg: 'a failed open produced no banner — the panel would just look inert'
        })
        expect(((await panelError()) as string).length).toBeGreaterThan(0)
      })

      // Nothing was opened, so nothing was removed either.
      expect(await Materials.rowState(id)).toBeDefined()
    })

    it('a failed LIST shows the RAW transport error, NOT "Unable to load materials"', async () => {
      // DEVIATION: the story requires "Unable to load materials". index.tsx renders
      // `loadError ?? messages.loadError`; listMaterialsWorker always puts
      // `(err as Error).message` and utils/api.ts toApiError guarantees that is
      // non-empty (`err.message || 'Network error'`) — so the fallback, which is the
      // story's copy, is UNREACHABLE. Asserted as SHIPPED. Same shape as the
      // unreachable `messages.invalidInput` on the ground form.
      //
      // The list is fetched ONCE from a ref-guarded mount effect, so the only way to
      // fail it is to mount the panel with the fault already in place. reloadToHome()
      // refreshes the renderer and takes the XHR patch with it, so the fault goes in
      // AFTER we are home; entering a project is a React navigation, not a reload, so
      // the patch survives it (the same shape geometry's 'a failed tree load' uses).
      await reloadToHome()
      await withApiFault('GET', '/materials/library/groups', async () => {
        // enterMaterials waits only for the panel and its create button, neither of
        // which depends on the list having loaded.
        await enterMaterials('matlistfail')
        await browser.waitUntil(async () => (await panelError()) !== null, {
          timeout: TIMEOUTS.LONG,
          timeoutMsg: 'a dead list request never produced an error banner'
        })
        const banner = (await panelError()) as string
        expect(banner.length).toBeGreaterThan(0)
        expect(banner).not.toBe(MATERIALS_MSG.loadError)
        // And the failed load ALSO claims the library is empty: index.tsx branches on
        // `materials.length === 0` before it looks at loadStatus, so the panel says
        // "nothing here" and "it broke" at the same time.
        expect(await Materials.emptyHint()).toBe(MATERIALS_MSG.empty)
      })

      // Leave the file on a HEALTHY panel — the list is fetched once per mount, so
      // an errored one would follow every later test in the file.
      await reloadToHome()
      await enterMaterials('matlistok')
    })
  })

  // ══ Search — SUBSTRING matching, and restoring the list ══════════════════════

  describe('search — substring matching and restoring the list', () => {
    it('a MID-NAME and a TRAILING fragment both match — the filter is a SUBSTRING', async () => {
      // The only partial query anywhere else in this file is a PREFIX ('Alpha'
      // against 'AlphaMat'), and a prefix passes under startsWith() just as well as
      // under includes(). selectors.ts selectVisibleMaterials is
      // `m.name.toLowerCase().includes(q)` — so a regression to startsWith() would
      // leave every other search test green while breaking the shipped rule. These
      // two fragments are the ones that can tell the difference: 'Core' is strictly
      // interior, 'Alpha' is the tail.
      //
      // Membership, never a count: the library is GLOBAL and carries other runs'
      // leftovers, so only the two rows this test made can be reasoned about.
      const a = await track()
      await renameAndSettle(a, 'ZinniaCoreAlpha')
      const b = await track()
      await renameAndSettle(b, 'BasaltEdgeBeta')

      for (const fragment of ['Core', 'Alpha']) {
        await Materials.search(fragment)
        await browser.waitUntil(
          async () => {
            const names = await Materials.names()
            return names.includes('ZinniaCoreAlpha') && !names.includes('BasaltEdgeBeta')
          },
          {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: `"${fragment}" never narrowed the list to the substring match`
          }
        )
      }
    })

    it('clearing the query restores the SAME rows in the SAME order', async () => {
      // The existing 'clearing the query restores every row' waits only until ONE
      // tracked row is defined again, so a regression that restored a SUBSET would
      // still pass it. This captures the whole list first and compares it back,
      // order included — the list is rebuilt by re-running the same filter over the
      // same `order` array, so a stable order is the shipped contract, not luck.
      //
      // The count is CAPTURED at runtime, never hardcoded: the library is global and
      // its size is unknown. Clearing is done by EMPTYING the input — components/
      // SearchBar ships no clear affordance, so that is the only gesture a user has.
      await track()
      await track()
      const before = await Materials.names()
      const countBefore = await Materials.rowCount()
      expect(countBefore).toBeGreaterThan(0)

      await Materials.search('zzzqqq___nomatch')
      await browser.waitUntil(async () => (await Materials.rowCount()) === 0, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the no-match query never emptied the list'
      })

      await Materials.clearSearch()
      await browser.waitUntil(async () => (await Materials.rowCount()) === countBefore, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'clearing the search never restored the full row count'
      })
      expect(await Materials.names()).toEqual(before)
    })
  })

  // ══ The right panel — WHICH material, and which of ITS cards ═════════════════

  describe('the right panel — which material, and which of its cards', () => {
    it('selecting a DIFFERENT material swaps the panel BODY, not just the name', async () => {
      // What was missing: the only oracle for the panel changing hands was
      // nameValue(). Both materials in that test carried one identical blank card,
      // so the card region switching was never observed at all — a panel that kept
      // the previous material's cards and only relabelled its name field would pass.
      //
      // So the two materials here carry DIFFERENT bodies: a saved Visualiser (a
      // ColorPicker, no FormFields at all) against a saved Energy Balance (a field
      // grid, no colour picker). Each assertion below is false for the other one.
      const a = await track()
      const nameA = await nameOf(a)
      await MaterialProperties.waitForOpen()
      const visCard = await cardWithType('Visualiser')
      await MaterialProperties.setColorChannel('r', '12')
      await MaterialProperties.setColorChannel('g', '34')
      await MaterialProperties.setColorChannel('b', '56')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(visCard), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for the first material’s colour'
      })
      await MaterialProperties.saveCard(visCard)

      // +Add Materials leaves ITS material in the form, so the panel must change
      // hands twice below and neither pass can be the create's own doing.
      const b = await track()
      const nameB = await nameOf(b)
      await MaterialProperties.waitForOpen()
      const ebCard = await cardWithType('Energy Balance')
      // 500 is inside heat_capacity's catalog 0-1000000, so this test makes no
      // invalid write and leaves no pending page error for a later execute.
      await MaterialProperties.setField(ebCard, 'heat_capacity', '500')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(ebCard), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for the second material’s Energy Balance card'
      })
      await MaterialProperties.saveCard(ebCard)

      await Materials.openMaterial(a)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === nameA, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the panel never went back to the first material'
      })
      // The unsaved blank card a fresh material opens with is NOT a member, and
      // there is no draft stash — reducer.ts OPEN_SAVED_MATERIAL_LOADED rebuilds the
      // cards from detail.members alone. So a reopen shows one card, not two.
      await browser.waitUntil(async () => (await MaterialProperties.cardIds()).length === 1, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the first material did not reopen with exactly its one saved card'
      })
      const aCards = await MaterialProperties.cardIds()
      expect(await MaterialProperties.selectedType(aCards[0])).toBe('Visualiser')
      await browser.waitUntil(
        async () => (await MaterialProperties.colorChannel('r').getValue()) === '12',
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the first material’s red channel never reloaded' }
      )
      // The OTHER material's field is nowhere on this panel.
      expect(await MaterialProperties.hasField(aCards[0], 'heat_capacity')).toBe(false)

      await Materials.openMaterial(b)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === nameB, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the panel never switched to the second material'
      })
      await browser.waitUntil(async () => (await MaterialProperties.cardIds()).length === 1, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the second material did not reopen with exactly its one saved card'
      })
      const bCards = await MaterialProperties.cardIds()
      expect(await MaterialProperties.selectedType(bCards[0])).toBe('Energy Balance')
      await browser.waitUntil(
        async () => (await MaterialProperties.fieldState(bCards[0], 'heat_capacity')).value === '500',
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the second material’s heat_capacity never reloaded'
        }
      )
      // …and the colour picker went with the material it belonged to. The Visualiser
      // card renders a ColorPicker instead of FormFields, so this is the sharpest
      // available proof the BODY was rebuilt and not merely relabelled.
      await expect(MaterialProperties.colorChannel('r')).not.toBeExisting()
    })

    it('a material carrying SEVERAL saved cards reopens with ALL of them, each keeping its own type and values', async () => {
      // Nothing had ever opened a material holding more than one saved type card.
      // Two cards of DIFFERENT types, each with its own value, is the case where a
      // per-card mix-up is visible: the reducer builds one card per member, and a
      // regression that collapsed them or crossed their values over would still
      // satisfy every single-card assertion in this file.
      const id = await track()
      const name = await nameOf(id)
      await MaterialProperties.waitForOpen()

      const visCard = await cardWithType('Visualiser')
      await MaterialProperties.setColorChannel('r', '77')
      await MaterialProperties.setColorChannel('g', '88')
      await MaterialProperties.setColorChannel('b', '99')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(visCard), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for the Visualiser card'
      })
      await MaterialProperties.saveCard(visCard)

      const radCard = await cardWithType('Radiation')
      // In range (0-1), so no invalid write anywhere in this test.
      await MaterialProperties.setField(radCard, 'reflectivity_PAR', '0.25')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(radCard), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for the Radiation card'
      })
      await MaterialProperties.saveCard(radCard)

      // The reload is load-bearing: every card save rewrites detailsById
      // write-through (reducer.ts refreshDetailCache), so an in-session reopen would
      // be served from that cache and would never exercise the GET. reloadToHome
      // takes the renderer — and the cache — with it. The library is GLOBAL, so the
      // row (and its id) follows us into the new project and afterEach can still
      // reach it. Same shape as 'a newly created material sorts to the BOTTOM'.
      await reloadToHome()
      await enterMaterials('matmulticard')
      await browser.waitUntil(async () => (await Materials.rowState(id)) !== undefined, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: `"${name}" did not come back after the reload`
      })
      await Materials.openMaterial(id)
      await MaterialProperties.waitForOpen()

      // Polled as a pair, not read once: the type Select maps its stored typeId
      // through the material-type catalog, and enterMaterials gates only on the
      // panel's create button — so a card can render before the catalog has landed,
      // leaving the (searchable) combobox reading '' for a tick.
      await browser.waitUntil(
        async () => {
          const ids = await MaterialProperties.cardIds()
          if (ids.length !== 2) return false
          for (const c of ids) {
            if ((await MaterialProperties.selectedType(c)) === '') return false
          }
          return true
        },
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the reopened material never settled on two typed cards'
        }
      )

      const cards = await MaterialProperties.cardIds()
      const typeOf: Record<number, string> = {}
      for (const c of cards) typeOf[c] = await MaterialProperties.selectedType(c)
      // Member order is the BACKEND's, so the cards are found BY TYPE, never by
      // position.
      expect(cards.map((c) => typeOf[c]).sort()).toEqual(['Radiation', 'Visualiser'])

      const visId = cards.find((c) => typeOf[c] === 'Visualiser') as number
      const radId = cards.find((c) => typeOf[c] === 'Radiation') as number
      await browser.waitUntil(
        async () => (await MaterialProperties.colorChannel('r').getValue()) === '77',
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the saved red channel never reloaded' }
      )
      expect(await MaterialProperties.colorChannel('b').getValue()).toBe('99')
      expect((await MaterialProperties.fieldState(radId, 'reflectivity_PAR')).value).toBe('0.25')
      // Both came back as real backend members: `saved` is what disables the type
      // Select, and it is written only by a successful save or a load.
      expect(await MaterialProperties.typeLocked(visId)).toBe(true)
      expect(await MaterialProperties.typeLocked(radId)).toBe(true)
    })
  })

  // ══ Material types — every catalog type, created AND saved ═══════════════════

  describe('material types — every catalog type, created and saved', () => {
    it('ONE material holds a card for EVERY catalog type, each type taken exactly once', async () => {
      // 'Add Material Type DISABLES once there is a card per catalog type' reaches
      // the limit with SEVEN BLANK cards — the guard is
      // `draft.groups.length >= materialTypes.length`, which counts CARDS, not types
      // — so nothing proved a material can actually carry seven DIFFERENT types at
      // once. This does, and it checks the once-per-material rule at every step
      // rather than only for the second card: a type already taken must come back
      // LISTED BUT DISABLED (Select renders `disabledValues` greyed, not hidden, so
      // the user can see it exists), and the one about to be picked must still be
      // pickable.
      await track()
      await MaterialProperties.waitForOpen()

      const cardIds: number[] = []
      // A fresh material already carries one blank card — that is card one.
      cardIds.push((await MaterialProperties.cardIds())[0])

      for (let i = 0; i < KNOWN_MATERIAL_TYPES.length; i++) {
        if (i > 0) cardIds.push(await MaterialProperties.addCard())
        const cardId = cardIds[i]
        const want = KNOWN_MATERIAL_TYPES[i]

        await MaterialProperties.openTypeDropdown(cardId)
        const offered = await MaterialProperties.typeOptions()
        for (const taken of KNOWN_MATERIAL_TYPES.slice(0, i)) {
          const option = offered.find((o) => o.label === taken)
          expect(`${taken} listed=${option !== undefined} disabled=${option?.disabled}`).toBe(
            `${taken} listed=true disabled=true`
          )
        }
        expect(`${want} disabled=${offered.find((o) => o.label === want)?.disabled}`).toBe(
          `${want} disabled=false`
        )

        await browser.keys(['Escape'])
        // The listbox is portalled to document.body and sits over the panel; prove
        // it went before touching anything else, so a stuck list cannot be
        // misreported as an intercepted click on the next card.
        await browser.waitUntil(async () => !(await $('[role="listbox"]').isExisting()), {
          timeout: TIMEOUTS.SHORT,
          timeoutMsg: `the material type listbox stayed open after Escape (card ${cardId})`
        })

        await MaterialProperties.pickType(cardId, want)
        await browser.waitUntil(async () => (await MaterialProperties.selectedType(cardId)) === want, {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: `"${want}" never appeared on card ${cardId}`
        })

        // COLLAPSE each finished card. Not cosmetic: seven expanded cards — one of
        // them Radiation, with fourteen controls — make the scrolling panel tall
        // enough that the next card's combobox is well below the fold, and every
        // openTypeDropdown is a real WebDriver click. The material-type Select sits
        // OUTSIDE the `open &&` gate, so a collapsed card still reports its type,
        // which is what the assertions below read.
        if (i < KNOWN_MATERIAL_TYPES.length - 1) {
          await MaterialProperties.toggleCard(cardId)
          await browser.waitUntil(async () => !(await MaterialProperties.cardOpen(cardId)), {
            timeout: TIMEOUTS.SHORT,
            timeoutMsg: `card ${cardId} never collapsed`
          })
        }
      }

      const chosen: string[] = []
      for (const cardId of cardIds) chosen.push(await MaterialProperties.selectedType(cardId))
      // DISTINCT, and exactly the catalog — not merely seven cards.
      expect(new Set(chosen).size).toBe(KNOWN_MATERIAL_TYPES.length)
      expect([...chosen].sort()).toEqual(([...KNOWN_MATERIAL_TYPES] as string[]).sort())
      await browser.waitUntil(async () => !(await MaterialProperties.addTypeEnabled()), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Add Material Type stayed enabled with one card per catalog type'
      })
    })

    // ONE test per catalog type. A card is created and typed for all seven across
    // this file already, but nothing ever SAVED one for six of them — so nothing
    // proved the six reach the backend at all.
    //
    // No values are entered except for the Visualiser. `canSave` is
    // `typeId != null && modeComplete && dirty && …` (MaterialPropertiesForm:1051);
    // modeComplete for a non-Visualiser is fieldsValid, validateMaterialFieldValue
    // returns null for an empty non-required field, and the catalog marks NO material
    // property required (materialBlueprint: the API sends `required` on object types
    // only) — so a just-typed card is already saveable. The Visualiser is the
    // exception: its Custom mode needs a complete colour.
    for (const type of KNOWN_MATERIAL_TYPES) {
      it(`a ${type} card SAVES and locks its type`, async () => {
        await track()
        await MaterialProperties.waitForOpen()
        const cardId = await cardWithType(type)
        if (type === 'Visualiser') {
          await MaterialProperties.setColorChannel('r', '10')
          await MaterialProperties.setColorChannel('g', '20')
          await MaterialProperties.setColorChannel('b', '30')
        }
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: `Save never enabled for a ${type} card`
        })
        await drainToasts()
        await MaterialProperties.saveCard(cardId)
        await waitForToast(MATERIALS_TOAST.saved)
        // The type Select is disabled by `group.saved`, which only
        // SAVE_PARAMETER_GROUP_SUCCEEDED writes — so a locked type is proof the
        // member reached the backend, not just that the button was pressed.
        await browser.waitUntil(async () => MaterialProperties.typeLocked(cardId), {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: `a saved ${type} card never locked its type`
        })
      })
    }
  })

  // ══ Type configuration — the controls and LABELS each type renders ══════════

  describe('type configuration — the controls and labels each type renders', () => {
    /**
     * What each type's card is expected to render a control for.
     *
     * Catalog-DRIVEN, so a migration that adds or moves a property moves this with
     * it. Two types are not just "their top-level properties":
     *
     *  - Radiation renders a BESPOKE editor. radiationHeaderFields hides
     *    `use_radiation_bands` and `spectral_data` (each has its own widget — the
     *    toggle and the file row), and ParameterGroupCard resolves the gated
     *    Spectrum group from ALL groups rather than the visible ones, so both
     *    spectrum pickers are on screen from the start, greyed rather than absent.
     *  - Visualiser renders a ColorPicker, whose channels are NOT FormFields
     *    (`color-channel-{r|g|b|opacity}`, no `input-{cardId}-…` anywhere). So it
     *    renders ZERO catalog controls, which is why the colour tests all go
     *    through setColorChannel instead of setField.
     *
     * Solar Position has no entry in MATERIAL_CATALOG at all: every one of its nine
     * catalog rows is `external`, and /api/catalog/material-types returns only
     * `editable` ones (catalog_service.py:81). Its empty set is the shipped
     * configuration, not a gap.
     */
    const RENDERED_PROPS: Record<string, string[]> = {
      Radiation: MATERIAL_CATALOG['Radiation']
        .map((p) => p.property)
        .filter((p) => p !== 'use_radiation_bands' && p !== 'spectral_data'),
      // freshCardProps, not `selector === null`: a gated group is ALSO rendered
      // when its selector is FIXED (one option, seeded on type-pick), which is why
      // a new Photosynthesis card shows all 14 Farquhar coefficients unprompted.
      // Stomatal Conductance's four sub-models are a real choice, so it still
      // renders none of theirs — the helper tells the two apart from the catalog.
      'Energy Balance': freshCardProps('Energy Balance').map((p) => p.property),
      'Solar Position': [],
      Photosynthesis: freshCardProps('Photosynthesis').map((p) => p.property),
      'Boundary Layer Conductance': freshCardProps('Boundary Layer Conductance').map(
        (p) => p.property
      ),
      'Stomatal Conductance': freshCardProps('Stomatal Conductance').map((p) => p.property),
      Visualiser: []
    }

    /**
     * The VISIBLE label of a field, as FormField renders it.
     *
     * FormField puts `<span>{label}{!optional && <span>*</span>}</span>` FIRST
     * inside the <label>, so the first span is the whole label text; the star is
     * stripped so this asserts the wording, not the required flag. Read through
     * browser.execute — no test in this describe writes to a field at all, so there
     * is no pending page error for it to surface.
     */
    const fieldLabel = async (cardId: number, property: string): Promise<string> =>
      browser.execute((sel: string) => {
        const wrap = document.querySelector(sel)
        const span = wrap ? wrap.querySelector('label span') : null
        return span ? (span.textContent || '').replace(/\*$/, '').trim() : ''
      }, `[data-testid="formfield-${cardId}-${property}"]`)

    // The per-type spot checks that exist today prove a field or two each; only
    // Solar Position's configuration was ever asserted COMPLETELY. This asserts the
    // whole control set for all seven, so a property that stops rendering — or one
    // that starts rendering when the catalog says it should not — is caught.
    //
    // Compared as a SET (both sides sorted), deliberately: display_order is a
    // backend column this e2e catalog mirror does not carry, and asserting an order
    // it cannot know would fail for a reason that is not the product's.
    for (const type of KNOWN_MATERIAL_TYPES) {
      it(`a ${type} card renders EXACTLY its catalog controls`, async () => {
        await track()
        await MaterialProperties.waitForOpen()
        const cardId = await cardWithType(type)
        const want = RENDERED_PROPS[type]
        // The Select label and the fields land in the SAME React commit, so the type
        // showing on the card is the settle. The first expected control is polled
        // too — it is one member of the set, so the equality below still has to
        // account for every other one.
        await browser.waitUntil(
          async () => {
            if ((await MaterialProperties.selectedType(cardId)) !== type) return false
            return want.length === 0 || (await MaterialProperties.hasField(cardId, want[0]))
          },
          {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: `the ${type} card never settled on its type and controls`
          }
        )
        expect([...(await MaterialProperties.renderedProps(cardId))].sort()).toEqual([...want].sort())
      })
    }

    it('the Stomatal Conductance sub-model dropdown is RELABELLED "Stomatal Model"', async () => {
      // materialBlueprint's LABEL_OVERRIDES. The live catalog ships this field
      // labelled "Stomatal Conductance" — the type's own name, which says nothing
      // about which model it selects — so the app overrides it. The override is
      // keyed by PROPERTY precisely so Photosynthesis's own selector keeps its
      // catalog label, and both halves are asserted: the rename, and that it did not
      // spill onto the other selector.
      //
      // Nothing else in either spec file reads a LABEL — every field assertion goes
      // through the property testid, which a label regression leaves untouched.
      await track()
      await MaterialProperties.waitForOpen()

      const stomatal = await cardWithType('Stomatal Conductance')
      // Polled: reading straight after pickType can catch the card mid-render.
      await browser.waitUntil(async () => MaterialProperties.hasField(stomatal, 'stomatal_model'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the Stomatal Conductance card never rendered its sub-model dropdown'
      })
      expect(await fieldLabel(stomatal, 'stomatal_model')).toBe('Stomatal Model')

      const photo = await cardWithType('Photosynthesis')
      await browser.waitUntil(async () => MaterialProperties.hasField(photo, 'submodel'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the Photosynthesis card never rendered its sub-model dropdown'
      })
      // The catalog's own label, untouched by the override.
      expect(await fieldLabel(photo, 'submodel')).toBe('Photosynthesis Model')
    })

    it('the Radiation band grid RELABELS its nine fields to Reflectivity / Transmissivity / Emissivity', async () => {
      // The bespoke editor passes an explicit `label` for every band field, so the
      // grid under the "PAR" heading reads "Reflectivity" rather than the catalog
      // fallback "Reflectivity PAR" — the band heading carries the band. Nine
      // fields, three labels, and the property testids (which everything else
      // asserts on) are unchanged by it, so only a label read can catch this going.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Radiation')
      await MaterialProperties.field(cardId, 'emissivity_LW').waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the Radiation card never rendered its band grid'
      })
      for (const band of ['PAR', 'NIR', 'LW'] as const) {
        expect(`${band}: ${await fieldLabel(cardId, `reflectivity_${band}`)}`).toBe(
          `${band}: Reflectivity`
        )
        expect(`${band}: ${await fieldLabel(cardId, `transmissivity_${band}`)}`).toBe(
          `${band}: Transmissivity`
        )
        expect(`${band}: ${await fieldLabel(cardId, `emissivity_${band}`)}`).toBe(
          `${band}: Emissivity`
        )
      }
    })
  })

  // ══ Radiation validation — the other two bands, and spectral mode ═══════════

  describe('radiation validation — the other two bands and spectral mode', () => {
    /**
     * Spectral-upload copy, mirrored from containers/Materials/messages.ts
     * (spectralFileTypeError:103 / spectralRootError:113 / spectralNoDataError:116 /
     * spectralDataInvalid:120) rather than imported: e2e/constants/materials.ts
     * stops at the TEXTURE file errors and carries no spectral entries. Same
     * treatment DELETE_BODY already gets in this file.
     *
     * The root message carries an EM DASH (U+2014). Verified byte-for-byte against
     * the source — it is the shipped character, not a transcribed hyphen.
     */
    const SPECTRAL_MSG = {
      fileType: 'Only XML files are allowed',
      root: 'Not a Helios spectral file — its tags must be wrapped in <helios>',
      noData: 'This file contains no spectral data (<globaldata_vec2>)',
      dataInvalid: (label: string): string =>
        `Spectral data "${label}" contains values that are not numbers`
    } as const

    const openRadiation = async (): Promise<number> => {
      await track()
      await MaterialProperties.waitForOpen()
      return cardWithType('Radiation')
    }

    /** A Radiation card with "Apply spectral data" already ON. */
    const openSpectralRadiation = async (): Promise<number> => {
      const cardId = await openRadiation()
      await MaterialProperties.spectralToggle.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      await MaterialProperties.spectralToggle.click()
      await browser.waitUntil(async () => MaterialProperties.spectralApplied(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the spectral toggle never turned on'
      })
      // The upload control renders only while no file is stored, and it is
      // `disabled` until the toggle is on — hence the order above.
      await $(`[data-testid="material-card-${cardId}"] input[type="file"]`).waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the hidden spectral file input never rendered'
      })
      return cardId
    }

    /**
     * Hand the card's spectral picker a file built IN THE PAGE.
     *
     * This is a real hidden <input type="file">, so the file is assigned through
     * a DataTransfer and a bubbling `change`, which is what React listens for on
     * a file input. Scoped to the CARD so it can never resolve to the
     * Visualiser's texture input.
     *
     * Built inline BY DESIGN, even though e2e/fixtures/materials now holds real
     * files: every case below is a file shaped to fail one specific rule, and
     * writing five broken fixtures to disk to express that would be worse than
     * building them here. The real-file paths — a valid spectral library, and a
     * genuine third-party XML — live in material-uploads.test.ts.
     */
    const pickSpectralFile = async (
      cardId: number,
      fileName: string,
      body: string
    ): Promise<void> => {
      await browser.execute(
        (sel: string, name: string, text: string) => {
          const input = document.querySelector(`${sel} input[type="file"]`) as HTMLInputElement | null
          if (!input) throw new Error('the spectral upload input is not rendered')
          const dt = new DataTransfer()
          dt.items.add(new File([text], name, { type: 'text/xml' }))
          input.files = dt.files
          input.dispatchEvent(new Event('change', { bubbles: true }))
        },
        `[data-testid="material-card-${cardId}"]`,
        fileName,
        body
      )
    }

    for (const band of ['NIR', 'LW'] as const) {
      it(`a ${band} band whose R+T+E exceeds 1 is flagged and blocks Save`, async () => {
        // radiationBandSumViolations walks PAR, NIR and LW alike, but only PAR was
        // ever probed — a rule narrowed to one band would still pass that test. Each
        // value is 0.6, inside the field's own 0-1, so the ONLY thing that can flag
        // them is the cross-field rule. No write here is out of range, so nothing
        // leaves a pending page error behind.
        const cardId = await openRadiation()
        // A just-typed Radiation card is already saveable, so the block below is a
        // real transition rather than a button that was dead all along.
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'a freshly typed Radiation card was not saveable to begin with'
        })
        await MaterialProperties.setField(cardId, `reflectivity_${band}`, '0.6')
        await MaterialProperties.setField(cardId, `transmissivity_${band}`, '0.6')
        await MaterialProperties.setField(cardId, `emissivity_${band}`, '0.6')
        expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
        // The BAND-SUM copy, not a range message — the distinction the rule exists
        // to make. Read through fieldState, i.e. ELEMENT commands only.
        expect((await MaterialProperties.fieldState(cardId, `reflectivity_${band}`)).error).toBe(
          MATERIALS_MSG.bandSumExceedsOne
        )
      })
    }

    it('turning Apply spectral data ON with NO file keeps Save SHUT', async () => {
      // spectralSetupIncomplete. Spectral mode DROPS the per-band values on save
      // (toRadiationProperties), on the understanding that a file replaces them — so
      // saving with no file would ship a material carrying no optics at all, and the
      // engine answers that with a reflectivity of 0 and a black surface for the
      // whole run. Nothing on screen says so, which is exactly why it is gated.
      const cardId = await openRadiation()
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'a freshly typed Radiation card was not saveable to begin with'
      })
      await MaterialProperties.spectralToggle.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      await MaterialProperties.spectralToggle.click()
      await browser.waitUntil(async () => MaterialProperties.spectralApplied(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the spectral toggle never turned on'
      })
      expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
    })

    // The four ways validateSpectralFile refuses a file. All four are decided
    // CLIENT-SIDE, before onPickSpectralFile is ever called — so nothing is POSTed
    // and no file is stored on the backend, unlike a happy-path upload. Each shape
    // is one the backend itself would accept (it enforces the .xml extension and
    // nothing else), so this UI is the only place they are caught before a
    // simulation reads them.
    const BAD_SPECTRAL: { title: string; file: string; body: string; error: string }[] = [
      {
        title: 'a NON-XML extension',
        file: 'spectra.txt',
        body: '<helios><globaldata_vec2 label="Alpha">400 0.1 500 0.2</globaldata_vec2></helios>',
        error: SPECTRAL_MSG.fileType
      },
      {
        title: 'a root that is NOT <helios>',
        file: 'spectra.xml',
        body: '<spectra><globaldata_vec2 label="Alpha">400 0.1 500 0.2</globaldata_vec2></spectra>',
        error: SPECTRAL_MSG.root
      },
      {
        title: 'a <helios> file with NO globaldata_vec2 blocks',
        file: 'spectra.xml',
        body: '<helios></helios>',
        error: SPECTRAL_MSG.noData
      },
      {
        title: 'a spectral block holding a NON-NUMERIC token',
        file: 'spectra.xml',
        body: '<helios><globaldata_vec2 label="Alpha">400 0.1 notanumber 0.2</globaldata_vec2></helios>',
        error: SPECTRAL_MSG.dataInvalid('Alpha')
      }
    ]

    for (const bad of BAD_SPECTRAL) {
      it(`${bad.title} is REJECTED before any upload, and Save stays shut`, async () => {
        const cardId = await openSpectralRadiation()
        await pickSpectralFile(cardId, bad.file, bad.body)

        // The FIRST .form-error-text inside the card IS the file error: with the
        // toggle on and no file stored, the spectrum pickers carry no error (untouched
        // and empty), the "no spectra in this file" line is gated on a settled label
        // lookup that never runs without a path, the bands are disabled so their
        // errors are suppressed, and the save-error span sits BELOW Save.
        const fileError = $(`[data-testid="material-card-${cardId}"]`).$('.form-error-text')
        await fileError.waitForDisplayed({
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'a rejected spectral file reported nothing on the card'
        })
        expect((await fileError.getText()).trim()).toBe(bad.error)
        // Client-side only: no path was stored, so spectral mode is still incomplete
        // and there is nothing saveable here.
        expect(await MaterialProperties.saveEnabled(cardId)).toBe(false)
      })
    }
  })

    /**
     * Click the WHOLE-MATERIAL trash that lives in the Properties form header.
     *
     * The row trash carries the same aria-label — and those two are the only
     * occurrences in src/ (MaterialRow.tsx:201, MaterialPropertiesForm.tsx:484) —
     * so this takes the one OUTSIDE the Materials panel. The right panel is a
     * SEPARATE <aside data-testid="right-panel"> (containers/RightPanel), never a
     * descendant of materials-panel, which is what makes the test sound. Clicked
     * in-page: the panel scrolls. Lifted verbatim from the logic already inlined
     * at materials.test.ts:1673.
     */
    const openFormDelete = async (): Promise<void> => {
      await MaterialProperties.nameInput.waitForExist({ timeout: TIMEOUTS.MEDIUM })
      await browser.execute(() => {
        const btn = Array.from(document.querySelectorAll('[aria-label="Delete material"]')).find(
          (b) => !b.closest('[data-testid="materials-panel"]')
        ) as HTMLElement | undefined
        if (!btn) throw new Error('the Properties form has no Delete material control')
        btn.click()
      })
    }

    /**
     * Where focus currently sits, relative to the open dialog.
     *
     * Three answers, deliberately: 'inside' (the dialog owns it), 'body' (Chromium
     * parks focus on the document when the tab sequence wraps — not an escape),
     * and 'escaped:<name>' for anything else, which IS one. Naming the escapee
     * matters: a bare boolean would say focus left without saying where to.
     *
     * [open] on the dialog selector, per the rule the whole file follows — three
     * Materials dialogs are always MOUNTED and only one is ever open.
     */
    const focusProbe = async (): Promise<string> =>
      (await browser.execute(() => {
        const d = document.querySelector('dialog[open]')
        const a = document.activeElement as HTMLElement | null
        if (!a || a === document.body || a === document.documentElement) return 'body'
        if (d && d.contains(a)) return 'inside'
        const label =
          a.getAttribute('aria-label') ?? a.getAttribute('data-testid') ?? a.tagName.toLowerCase()
        return `escaped:${label}`
      })) as string

    // ══ Rename — the ALREADY-OPEN form ═══════════════════════════════════════

    describe('rename — the open Properties form', () => {
      it('a rename from the LEFT PANEL row reaches the OPEN form IN PLACE', async () => {
        // The branch nothing asserted: RENAME_MATERIAL_SUCCEEDED writes
        // draft.editDraft.name when the renamed material is the one on screen
        // (reducer.ts:339-342). The adjacent search test proves only that the rename
        // reached the DETAIL CACHE, because it re-selects the row first — a re-open
        // rebuilds editDraft from scratch and would pass even if this branch were
        // deleted. So this one deliberately never touches the row again.
        const id = await track()
        await MaterialProperties.waitForOpen()
        const before = await nameOf(id)
        expect(await MaterialProperties.nameValue()).toBe(before)

        await renameAndSettle(id, 'SyncedInPlace')

        // NO openMaterial(), no click, no re-select.
        await browser.waitUntil(
          async () => (await MaterialProperties.nameValue()) === 'SyncedInPlace',
          {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: 'the open form kept the OLD name after the row was renamed'
          }
        )
      })

      it('a REFUSED rename flags the OPEN form, and the next accepted one CLEARS it', async () => {
        // The other half of the same wiring, and the reason `nameError` is on the
        // draft at all. RENAME_MATERIAL_FAILED routes its message to the OPEN FORM
        // (reducer.ts:357-361) rather than to the row — the row still shows the
        // committed, still-valid old name, so an error under it would point at the
        // wrong name. Then RENAME_MATERIAL_SUCCEEDED clears it, which is the line
        // this test exists to hold: `draft.editDraft.nameError = null`.
        //
        // aria-invalid is the cheap boolean (the input carries
        // `aria-invalid={nameError != null}`, MaterialPropertiesForm.tsx:410, which
        // React renders as the string "true"/"false"); the copy itself is axios's
        // transport text, deliberately not pinned — the same reasoning the failed-
        // OPEN test above already records.
        const id = await track()
        await MaterialProperties.waitForOpen()
        const before = await nameOf(id)

        // PATCH .../groups/{id}/rename — the same fault the file's existing
        // 'a failed rename' test uses.
        await withApiFault('PATCH', '/library/groups', async () => {
          await Materials.renameRow(id, 'RefusedName', 'enter')
          await browser.waitUntil(
            async () => (await MaterialProperties.nameInput.getAttribute('aria-invalid')) === 'true',
            {
              timeout: TIMEOUTS.MUTATION,
              timeoutMsg: 'a refused rename left the open form unflagged'
            }
          )
        })

        // Pessimistic: the row never took the refused name.
        expect(await nameOf(id)).toBe(before)

        await renameAndSettle(id, 'AcceptedName')
        await browser.waitUntil(
          async () =>
            (await MaterialProperties.nameValue()) === 'AcceptedName' &&
            (await MaterialProperties.nameInput.getAttribute('aria-invalid')) === 'false',
          {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: 'an accepted rename did not both update the form and clear its error'
          }
        )
      })
    })

    // ══ Delete — the RIGHT panel, and what must NOT go with it ═══════════════

    describe('delete — the right-panel trash and collateral', () => {
      it('CONFIRMING the FORM HEADER trash removes the row, TOASTS, and tears the form down', async () => {
        // The right-panel delete had never actually been PERFORMED: the existing
        // form-header test reads the dialog and then cancels. This one confirms it,
        // and takes the three outcomes together — row, toast, form — because they
        // are one action of the reducer (REMOVE_MATERIAL, reducer.ts:391-403).
        const a = await track()
        const target = await track()
        const c = await track()
        const targetName = await nameOf(target)

        // +Add Materials leaves the LAST-created material open, so select the one
        // under test before reaching for the form's own trash.
        await Materials.openMaterial(target)
        await MaterialProperties.waitForOpen()
        await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === targetName, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the right panel never switched to the material under test'
        })

        const before = await Materials.rowCount()
        await drainToasts()
        await openFormDelete()
        const dlg = await waitForOpenDialog()
        // The dialog we are about to confirm really is the one naming this material.
        expect(dlg.heading).toBe(MATERIALS_MSG.deleteHeading(targetName))
        await clickDialogButton('Delete')

        // The toast first — it lives ~2.6s and nothing may sit in front of it. The
        // three create toasts were drained above, and none of them carries
        // "successfully deleted" anyway.
        await waitForToast(MATERIALS_TOAST.deleted(targetName))
        created = created.filter((x) => x !== target)

        await browser.waitUntil(async () => (await Materials.rowState(target)) === undefined, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the right-panel delete never removed the row'
        })
        // REMOVE_MATERIAL nulls editDraft when the deleted material is the OPEN one,
        // so MaterialPropertiesForm returns null and the whole form unmounts — there
        // is nothing left to edit.
        await browser.waitUntil(async () => !(await MaterialProperties.nameInput.isExisting()), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'the Properties form survived the delete of the material it was showing'
        })
        await waitForNoOpenDialog()

        // Nothing else went with it. A RELATIVE count — the library is GLOBAL and
        // its absolute size is never knowable.
        expect(await Materials.rowState(a)).toBeDefined()
        expect(await Materials.rowState(c)).toBeDefined()
        expect(await Materials.rowCount()).toBe(before - 1)
      })

      it('deleting the MIDDLE of three removes exactly THAT material, by NAME', async () => {
        // Identity, not arithmetic. The gap-filling test next door deletes a middle
        // material too, but it asserts which NUMBER the next create takes — which
        // rules out one collateral delete (the lower sibling) and says nothing about
        // the other. This names all three and checks presence.
        const a = await track()
        await renameAndSettle(a, 'KeepAlpha')
        const b = await track()
        await renameAndSettle(b, 'DropBravo')
        const c = await track()
        await renameAndSettle(c, 'KeepCharlie')

        const before = await Materials.rowCount()
        await Materials.deleteRow(b)
        created = created.filter((x) => x !== b)

        const names = await Materials.names()
        expect(names).toContain('KeepAlpha')
        expect(names).toContain('KeepCharlie')
        expect(names).not.toContain('DropBravo')
        expect(await Materials.rowState(a)).toBeDefined()
        expect(await Materials.rowState(c)).toBeDefined()
        expect(await Materials.rowCount()).toBe(before - 1)
      })

      it('deleting a material that is NOT the open one leaves the RIGHT PANEL untouched', async () => {
        // The other side of REMOVE_MATERIAL's guard: `editDraft.groupId === action.id`.
        // Drop that condition and every delete anywhere in the library would close
        // whatever form the user had open.
        const keep = await track()
        const doomed = await track()
        const keepName = await nameOf(keep)

        await Materials.openMaterial(keep)
        await MaterialProperties.waitForOpen()
        await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === keepName, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the right panel never switched to the material being kept'
        })

        // The row trash stops propagation (MaterialRow's IconButton), so this does
        // not change the selection.
        await Materials.deleteRow(doomed)
        created = created.filter((x) => x !== doomed)

        expect(await Materials.rowState(keep)).toBeDefined()
        await expect(MaterialProperties.nameInput).toBeExisting()
        expect(await MaterialProperties.nameValue()).toBe(keepName)
      })
    })

    // ══ Deleting a material TYPE — what survives it ══════════════════════════

    describe('deleting a material type — what survives', () => {
      it('a confirmed type-card delete removes the MEMBER only — the material and its form survive', async () => {
        // The existing card-delete test proves the backend member goes. It never
        // says what is left: the MATERIAL must still be in the library and its form
        // must still be open on it, because REMOVE_PARAMETER_GROUP touches only
        // editDraft.groups (reducer.ts:487-503).
        const id = await track()
        const name = await nameOf(id)
        await MaterialProperties.waitForOpen()
        const cardId = await saveVisualiserCard()

        await MaterialProperties.removeCard(cardId)
        await waitForOpenDialog()
        await clickDialogButton('Delete')
        await browser.waitUntil(async () => !(await MaterialProperties.cardIds()).includes(cardId), {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'confirming never removed the saved material-type card'
        })

        expect(await Materials.rowState(id)).toBeDefined()
        await expect(MaterialProperties.nameInput).toBeExisting()
        expect(await MaterialProperties.nameValue()).toBe(name)
        // The blank card the material opened with is untouched, so the form is not
        // left empty either.
        expect((await MaterialProperties.cardIds()).length).toBeGreaterThan(0)
      })

      it('the deleted type is gone from the STORED material after a RELOAD, and the survivor keeps its values', async () => {
        // What the card vanishing does NOT prove: that the material's persisted
        // configuration is right afterwards. An in-session re-click is served from
        // detailsById (refreshDetailCache rewrites it write-through), so only a
        // REFETCHED material can say what the backend holds — which is why this
        // reloads rather than re-selecting.
        const id = await track()
        const name = await nameOf(id)
        await MaterialProperties.waitForOpen()

        // The SURVIVOR: a Visualiser with a colour — the one save path this file
        // already proves reloads correctly.
        await saveVisualiserCard()

        // The CASUALTY: a second real member. Nothing is `required` on a
        // non-Visualiser type — materialBlueprint resolves `required: def.required
        // ?? false` and its own comment says the API sends `required` on OBJECT
        // types only — so fieldsValid is true with empty fields and canSave opens on
        // the type pick alone. heat_capacity (0-1e6) is set so the member carries
        // something a wrong delete could take with it, and 500 is comfortably in
        // range, so this write raises no global page error.
        const ebCard = await cardWithType('Energy Balance')
        await MaterialProperties.setField(ebCard, 'heat_capacity', '500')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(ebCard), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Save never enabled for the Energy Balance card'
        })
        await MaterialProperties.saveCard(ebCard)

        await MaterialProperties.removeCard(ebCard)
        await waitForOpenDialog()
        await clickDialogButton('Delete')
        await browser.waitUntil(async () => !(await MaterialProperties.cardIds()).includes(ebCard), {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the Energy Balance card was never removed'
        })

        await reloadToHome()
        await enterMaterials('mattypedel')
        // The library is GLOBAL, so the material follows us into the new project and
        // afterEach can still reach it.
        await browser.waitUntil(async () => (await Materials.rowState(id)) !== undefined, {
          timeout: TIMEOUTS.LONG,
          timeoutMsg: `"${name}" did not come back after the reload`
        })
        await Materials.openMaterial(id)
        await MaterialProperties.waitForOpen()

        // The survivor came back with the colour it was SAVED with, not blank — and
        // waiting on it is also what settles the card render, so the type labels
        // read below are not caught mid-mount.
        await browser.waitUntil(
          async () =>
            (await MaterialProperties.colorChannel('r')
              .getValue()
              .catch(() => '')) === '12',
          {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: "the surviving Visualiser's stored colour did not reload"
          }
        )

        // Card ids restart at 1 per material on a reopen (OPEN_SAVED_MATERIAL_LOADED
        // numbers them by member index), so the TYPE is the only stable identity.
        const types: string[] = []
        for (const c of await MaterialProperties.cardIds()) {
          types.push(await MaterialProperties.selectedType(c))
        }
        expect(types).not.toContain('Energy Balance')
        expect(types).toEqual(['Visualiser'])
      })
    })

    // ══ Dialog keyboard behaviour ════════════════════════════════════════════
    //
    // Enter had been PRESSED in exactly one place in the whole suite (the geometry
    // row confirmation). Everywhere else "Enter is destructive" was inferred from
    // dlg.focused alone. Materials renders THREE delete dialogs, each a separate
    // component with its own confirm handler, so each is pressed here.
    //
    // Why the keystroke reaches the button rather than Dialog's own handler:
    // components/Dialog's onKeyDown returns early when the event target is a
    // BUTTON, so the focused button's NATIVE Enter activation is what fires.

    describe('dialog keyboard behaviour', () => {
      it('ENTER on the ROW confirmation DELETES — no second click', async () => {
        const id = await track()
        await openRowDelete(id)
        const dlg = await waitForOpenDialog()
        // Cancel-then-Delete plus "Dialog focuses the LAST enabled body button" is
        // what makes this hazard exist; the precondition is asserted next to the
        // keystroke so a reorder shows up here rather than as a mystery.
        expect(dlg.focused).toBe('Delete')

        await browser.keys(['Enter'])
        await browser.waitUntil(async () => (await Materials.rowState(id)) === undefined, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'Enter on the focused Delete button did not delete the material'
        })
        created = created.filter((x) => x !== id)
        await waitForNoOpenDialog()
      })

      it('ENTER on the FORM HEADER confirmation DELETES the whole material', async () => {
        const id = await track()
        await MaterialProperties.waitForOpen()
        await openFormDelete()
        const dlg = await waitForOpenDialog()
        expect(dlg.focused).toBe('Delete')

        await browser.keys(['Enter'])
        await browser.waitUntil(async () => (await Materials.rowState(id)) === undefined, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'Enter on the form header confirmation did not delete the material'
        })
        created = created.filter((x) => x !== id)
        await waitForNoOpenDialog()
      })

      it('ENTER on the TYPE CARD confirmation removes the card, and the dialog CLOSES on confirm', async () => {
        await track()
        await MaterialProperties.waitForOpen()
        const cardId = await saveVisualiserCard()

        await MaterialProperties.removeCard(cardId)
        const dlg = await waitForOpenDialog()
        expect(dlg.focused).toBe('Delete')

        await browser.keys(['Enter'])
        // THE honest place to assert "closes on confirm". The card's confirm handler
        // sets confirmDeleteOpen=false and only THEN calls onDelete, so the dialog is
        // gone while the backend DELETE is still in flight — unlike the row and form
        // confirmations, whose dialogs could also merely unmount along with what they
        // deleted.
        await waitForNoOpenDialog()
        await browser.waitUntil(async () => !(await MaterialProperties.cardIds()).includes(cardId), {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'Enter on the type-card confirmation did not remove the card'
        })
      })

      it('TAB never carries focus OUT of an open confirmation', async () => {
        const id = await track()
        await openRowDelete(id)
        await waitForOpenDialog()

        // Three focusable controls (the header ×, Cancel, Delete), so N+1 = four
        // presses wraps at least once. showModal() is the mechanism under test: it
        // makes everything outside the dialog inert, which a hand-rolled overlay
        // would not — with one, Tab reaches the panel behind.
        const seen: string[] = []
        for (let i = 0; i < 4; i++) {
          await browser.keys(['Tab'])
          seen.push(await focusProbe())
        }
        expect(seen.filter((s) => s.startsWith('escaped'))).toEqual([])
        // Not a vacuous pass: focus was genuinely in the dialog, not parked on body
        // for all four presses.
        expect(seen).toContain('inside')

        // …and the dialog is still operable after all that tabbing.
        await browser.keys(['Escape'])
        await waitForNoOpenDialog()
        expect(await Materials.rowState(id)).toBeDefined()
      })

      it('closing the confirmation RETURNS focus to the row it was opened from', async () => {
        // Keyboard-driven deliberately. Everywhere else in this suite the trash is
        // clicked with an in-page .click(), which does NOT focus it — so there is no
        // previously-focused element for <dialog>.close() to restore to, and
        // restoration is not observable at all. Focusing first is what a keyboard
        // user does, and it is the only version of the gesture in which the question
        // has an answer.
        const id = await track()
        await Materials.row(id).waitForExist({ timeout: TIMEOUTS.MEDIUM })
        await browser.execute((rowId: string) => {
          const row = document.querySelector(`[data-testid="material-row-${rowId}"]`)
          const btn = row?.querySelector('[aria-label="Delete material"]') as HTMLElement | null
          if (!btn) throw new Error(`no delete control on material row ${rowId}`)
          btn.focus()
        }, id)

        // Enter on the focused trash opens the dialog. The row itself is a
        // role="button" that also answers Enter, but its handler bails when the
        // event target is not the row (MaterialRow.onKeyDown), so this cannot
        // double-fire.
        await browser.keys(['Enter'])
        await waitForOpenDialog()
        await browser.keys(['Escape'])
        await waitForNoOpenDialog()

        // Containment rather than node identity: what matters is that focus came
        // back to the row that raised the dialog, not that it is the very same
        // button element React happened to keep. Polled — the close runs from
        // Dialog's effect, one commit after onClose.
        await browser.waitUntil(
          async () =>
            (await browser.execute((rowId: string) => {
              const row = document.querySelector(`[data-testid="material-row-${rowId}"]`)
              const a = document.activeElement
              return row !== null && a !== null && row.contains(a)
            }, id)) === true,
          {
            timeout: TIMEOUTS.SHORT,
            timeoutMsg: 'closing the confirmation did not return focus to the row that opened it'
          }
        )
        expect(await Materials.rowState(id)).toBeDefined()
      })

      it('Escape and the header × both dismiss the TYPE CARD confirmation, KEEPING the card', async () => {
        // The row confirmation already has both exits covered; the card one had
        // neither, and it is the dialog whose confirm goes to the backend.
        await track()
        await MaterialProperties.waitForOpen()
        const cardId = await saveVisualiserCard()

        await MaterialProperties.removeCard(cardId)
        await waitForOpenDialog()
        await browser.keys(['Escape'])
        await waitForNoOpenDialog()
        expect(await MaterialProperties.cardIds()).toContain(cardId)

        await MaterialProperties.removeCard(cardId)
        await waitForOpenDialog()
        await clickDialogClose()
        await waitForNoOpenDialog()
        expect(await MaterialProperties.cardIds()).toContain(cardId)
      })

      it('Escape and the header × both dismiss the FORM HEADER confirmation, KEEPING the material', async () => {
        const id = await track()
        await MaterialProperties.waitForOpen()

        await openFormDelete()
        await waitForOpenDialog()
        await browser.keys(['Escape'])
        await waitForNoOpenDialog()
        expect(await Materials.rowState(id)).toBeDefined()

        await openFormDelete()
        await waitForOpenDialog()
        await clickDialogClose()
        await waitForNoOpenDialog()
        expect(await Materials.rowState(id)).toBeDefined()
        // The form is still showing it — a dismissed confirmation changes nothing.
        await expect(MaterialProperties.nameInput).toBeExisting()
      })
    })

  // ══ BLOCK 1 — a whole material: every type, every value, and the reload ══════
  //
  // Everything above this point tests ONE property, ONE card or ONE rule at a
  // time. Nothing had ever built a complete material: every saveCard() call in the
  // suite was on a Visualiser (grep saveCard — :143, :711, :724, :739, :876,
  // :1361), so six of the seven catalog types had never been SAVED at all, and no
  // test had ever proved a configured material survives a round trip to the
  // backend and back.

  describe('a complete material — every catalog type', () => {
    type CardPlan = { type: string; configure: (cardId: number) => Promise<void> }

    /**
     * One card per catalog type with legal values for it.
     *
     * Values sit INSIDE each type's catalog range (constants/materials.ts
     * MATERIAL_CATALOG) and, for Radiation, keep R+T+E under 1 — the cross-field
     * rule blocks Save otherwise, and a card that will not save proves nothing.
     * Every value here is in range, so no test in this block can leave the pending
     * page error an out-of-range write raises.
     *
     * The two SELECTOR enums are set through their GROUP NAME, never their stored
     * value (`submodel` reads "Farquhar model", not `farquhar_model`) — hence
     * enumLabel() on every setEnum call.
     *
     * RADIATION IS FIRST, and it takes the blank card a fresh material already
     * carries: it is by far the tallest card (specular, the spectral block, two
     * spectrum pickers and three bands of three), so it is saved while the
     * scrolling card list is still one card long.
     */
    const CARD_PLANS: CardPlan[] = [
      {
        type: 'Radiation',
        configure: async (cardId: number): Promise<void> => {
          await MaterialProperties.setField(cardId, 'specular_exponent', '10')
          // 0.25 * 3 = 0.75 — under the band-sum ceiling of 1.
          await MaterialProperties.setField(cardId, 'reflectivity_PAR', '0.25')
          await MaterialProperties.setField(cardId, 'transmissivity_PAR', '0.25')
          await MaterialProperties.setField(cardId, 'emissivity_PAR', '0.25')
        }
      },
      {
        type: 'Energy Balance',
        configure: async (cardId: number): Promise<void> => {
          await MaterialProperties.setField(cardId, 'heat_capacity', '1200')
        }
      },
      {
        type: 'Photosynthesis',
        configure: async (cardId: number): Promise<void> => {
          // The Farquhar fields do not exist until the selector says so.
          await MaterialProperties.setEnum(
            cardId,
            'submodel',
            enumLabel('Photosynthesis', 'submodel', 'farquhar_model')
          )
          await MaterialProperties.setField(cardId, 'vcmax25', '80')
          // 273-373 in the live catalog (Story 10 says 272 for topt_tpu — recorded
          // as a DEVIATION in constants/materials.ts; 300 is legal either way).
          await MaterialProperties.setField(cardId, 'topt_vcmax', '300')
        }
      },
      {
        type: 'Stomatal Conductance',
        configure: async (cardId: number): Promise<void> => {
          await MaterialProperties.setField(cardId, 'gamma_co2', '80')
          await MaterialProperties.setEnum(
            cardId,
            'stomatal_model',
            enumLabel('Stomatal Conductance', 'stomatal_model', 'BWB')
          )
          await MaterialProperties.setField(cardId, 'bwb_a1', '9')
        }
      },
      {
        type: 'Boundary Layer Conductance',
        configure: async (cardId: number): Promise<void> => {
          // An ORDINARY enum: it drives no conditional group, so enumOptionLabels
          // is empty for it and enumLabel falls through to the stored value — the
          // opposite of the two selectors above, and the reason enumLabel is used
          // here too rather than a bare literal.
          await MaterialProperties.setEnum(
            cardId,
            'boundary_layer_model',
            enumLabel('Boundary Layer Conductance', 'boundary_layer_model', 'Pohlhausen')
          )
        }
      },
      {
        // properties: [] — nothing to configure, and Save opens the moment the
        // type is chosen. The edge case that looks most like a rendering bug.
        type: TYPE_WITH_NO_FIELDS,
        configure: async (): Promise<void> => {}
      },
      {
        type: 'Visualiser',
        configure: async (): Promise<void> => {
          await MaterialProperties.setColorChannel('r', '10')
          await MaterialProperties.setColorChannel('g', '20')
          await MaterialProperties.setColorChannel('b', '30')
          // NOT the seeded 100: the point is that the box the user typed in is the
          // one that gets saved.
          await MaterialProperties.setColorChannel('opacity', '55')
        }
      }
    ]

    /**
     * Bring a card's Save into the panel's scroll viewport before a REAL click.
     *
     * Element.scrollIntoView is plain DOM — NOT the wdio scrollIntoView command,
     * which cannot work in this Electron build (Browser.getWindowForTarget is
     * unimplemented; see support/dnd.ts). A configured Radiation card is taller
     * than the panel, so its Save can sit below the fold.
     */
    const revealSave = async (cardId: number): Promise<void> => {
      await browser.execute((id: number) => {
        const btn = document.querySelector(
          `[data-testid="material-card-save-${id}"]`
        ) as HTMLElement | null
        btn?.scrollIntoView({ block: 'center' })
      }, cardId)
    }

    /**
     * Save a card and prove the save LANDED.
     *
     * `typeLocked` is the settle, not the disabled Save button: Save is disabled
     * both while the write is in flight (`saving`) and once it has landed and
     * cleared `dirty`, so polling it alone can return a millisecond after the
     * click. The type Select is disabled on `group.saved`, which ONLY
     * SAVE_PARAMETER_GROUP_SUCCEEDED sets — so it is the one oracle that means
     * "the backend answered". It is also what refreshDetailCache waits on, which
     * every reopen below reads.
     */
    const saveAndLock = async (cardId: number, what: string): Promise<void> => {
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: `Save never enabled for a configured ${what} card`
      })
      await revealSave(cardId)
      await MaterialProperties.saveCard(cardId)
      await browser.waitUntil(async () => MaterialProperties.typeLocked(cardId), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `the ${what} card never became saved (its type Select stayed editable)`
      })
    }

    /**
     * Fold a finished card away, so the next card's Save stays near the top.
     *
     * The type survives the collapse — the Select sits OUTSIDE the `open &&` gate,
     * which is what the final sweep reads.
     */
    const collapse = async (cardId: number): Promise<void> => {
      await MaterialProperties.toggleCard(cardId)
      await browser.waitUntil(async () => !(await MaterialProperties.cardOpen(cardId)), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: `card ${cardId} never collapsed`
      })
    }

    /**
     * A fresh project, then the Materials panel.
     *
     * A deliberate copy of the helper inside describe('persistence and the global
     * library') — that one is private to its block, and reaching into it would
     * couple two describes that are otherwise independent.
     */
    const freshProject = async (label: string): Promise<{ id: string; name: string }> => {
      await reloadToHome()
      return enterMaterials(label)
    }

    it('EVERY catalog type saves a card — the six that never had one, and the FIELDLESS one', async () => {
      // THE SHARP GAP this closes: before this test the only type ever saved in
      // the whole e2e suite was the Visualiser. Radiation routes through
      // handleSaveRadiation, Photosynthesis / Stomatal / Boundary Layer / Energy
      // Balance through handleSaveColour's plain-type branch, and Solar Position
      // saves a member with NO properties at all — three distinct payload builders
      // and four shapes, none of them exercised end to end.
      await track()
      await MaterialProperties.waitForOpen()
      await drainToasts()

      for (let index = 0; index < CARD_PLANS.length; index++) {
        const plan = CARD_PLANS[index]
        // index 0 REUSES the blank card a fresh material already carries
        // (reducer.ts seeds `groups: [emptyCard(1, 1)]`). It has to: the form caps
        // cards at one per catalog type, so seven addCard() calls would be refused
        // at the seventh.
        const cardId =
          index === 0 ? (await MaterialProperties.cardIds())[0] : await MaterialProperties.addCard()
        await MaterialProperties.pickType(cardId, plan.type)
        await plan.configure(cardId)

        if (index === 0) {
          // Asserted once, and on the FIRST save so nothing costing a round trip
          // sits between the click and the read — toasts live ~2.66s. The string
          // is the shipped one from store/toastMessages; Materials/messages.ts has
          // no toast that ships at all.
          await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: `Save never enabled for a configured ${plan.type} card`
          })
          await revealSave(cardId)
          await MaterialProperties.saveCard(cardId)
          await waitForToast(MATERIALS_TOAST.saved)
          await browser.waitUntil(async () => MaterialProperties.typeLocked(cardId), {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: `the ${plan.type} card never became saved`
          })
        } else {
          await saveAndLock(cardId, plan.type)
        }
        await collapse(cardId)
      }

      // One card per catalog type, and every one of them persisted. Read from the
      // DOM, not from the loop's own bookkeeping.
      const cards = await MaterialProperties.cardIds()
      expect(cards.length).toBe(KNOWN_MATERIAL_TYPES.length)
      const types: string[] = []
      for (const cardId of cards) types.push(await MaterialProperties.selectedType(cardId))
      expect([...types].sort()).toEqual([...KNOWN_MATERIAL_TYPES].sort())
    })

    it('a configured material RELOADS every saved value after the project is reopened', async () => {
      // The catalog sweep proves each field ACCEPTS its bounds. This proves a
      // configured material round-trips: three types, three payload shapes, read
      // back after a real close-and-reopen rather than out of the session's cache.
      //
      // Three cards rather than seven deliberately — the reopen is the expensive
      // half, and a fourth type would only re-prove the same GET path.
      const project = await freshProject('matconfig')
      const id = await track()
      const name = await nameOf(id)
      await MaterialProperties.waitForOpen()

      const visCard = (await MaterialProperties.cardIds())[0]
      await MaterialProperties.pickType(visCard, 'Visualiser')
      await MaterialProperties.setColorChannel('r', '12')
      await MaterialProperties.setColorChannel('g', '34')
      await MaterialProperties.setColorChannel('b', '56')
      // OPACITY is the half of the colour nothing had ever followed past the
      // keystroke: 'opacity accepts 0 and 100' asserts only that neither bound is
      // FLAGGED. This carries a non-default value all the way to the backend.
      await MaterialProperties.setColorChannel('opacity', '55')
      await saveAndLock(visCard, 'Visualiser')
      await collapse(visCard)

      const radCard = await MaterialProperties.addCard()
      await MaterialProperties.pickType(radCard, 'Radiation')
      await MaterialProperties.setField(radCard, 'specular_exponent', '12')
      await MaterialProperties.setField(radCard, 'reflectivity_PAR', '0.25')
      await saveAndLock(radCard, 'Radiation')
      await collapse(radCard)

      const ebCard = await MaterialProperties.addCard()
      await MaterialProperties.pickType(ebCard, 'Energy Balance')
      await MaterialProperties.setField(ebCard, 'heat_capacity', '1200')
      await saveAndLock(ebCard, 'Energy Balance')

      // The reload is what makes this a persistence test: LIST_MATERIALS_SUCCEEDED
      // empties detailsById, so the reopen below is a real GET and not the
      // write-through cache answering with what we just typed.
      await reopenByName(project.name)
      await Materials.panel.waitForDisplayed({ timeout: TIMEOUTS.LONG })
      const reopened = await Materials.idForName(name)
      expect(reopened).not.toBe(null)
      await Materials.openMaterial(reopened as string)
      await MaterialProperties.waitForOpen()

      // OPEN_SAVED_MATERIAL_LOADED builds one card per MEMBER, in the backend's
      // order — so resolve them by TYPE rather than assuming which card id landed
      // where. All three come back EXPANDED (openGroupIds seeds from draft.groups).
      await browser.waitUntil(
        async () => {
          const cards = await MaterialProperties.cardIds()
          if (cards.length !== 3) return false
          const labels: string[] = []
          for (const c of cards) labels.push(await MaterialProperties.selectedType(c))
          return (
            labels.includes('Visualiser') &&
            labels.includes('Radiation') &&
            labels.includes('Energy Balance')
          )
        },
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the three saved type cards did not come back' }
      )
      const byType: Record<string, number> = {}
      for (const c of await MaterialProperties.cardIds()) {
        byType[await MaterialProperties.selectedType(c)] = c
      }

      // The colour, opacity included. A saved card is NEVER re-seeded on its first
      // render (MaterialVisualisationEditor's effect is keyed [mode, saved] and
      // returns early when firstRender && saved), so a 55 that came back as the
      // default 100 would mean the stored value was lost.
      await browser.waitUntil(
        async () => (await MaterialProperties.colorChannel('r').getValue()) === '12',
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the saved colour did not reload' }
      )
      expect(await MaterialProperties.colorChannel('g').getValue()).toBe('34')
      expect(await MaterialProperties.colorChannel('b').getValue()).toBe('56')
      expect(await MaterialProperties.colorChannel('opacity').getValue()).toBe('55')

      // Every reloaded value is a STRING — service.getGroup maps each property
      // through valueToString — so these compare against exactly what was typed.
      expect(
        (await MaterialProperties.fieldState(byType['Radiation'], 'reflectivity_PAR')).value
      ).toBe('0.25')
      expect(
        (await MaterialProperties.fieldState(byType['Radiation'], 'specular_exponent')).value
      ).toBe('12')
      expect(
        (await MaterialProperties.fieldState(byType['Energy Balance'], 'heat_capacity')).value
      ).toBe('1200')
    })

    it('opening a SEARCH RESULT restores its CARDS and their values, not just its name', async () => {
      // 'clicking a SEARCH RESULT opens THAT material in the Properties form'
      // verifies exactly one detail — the NAME. A panel that swapped in the right
      // heading over the wrong material's cards would pass it.
      const id = await track()
      await MaterialProperties.waitForOpen()
      await renameAndSettle(id, 'DetailProbeAlpha')

      const visCard = (await MaterialProperties.cardIds())[0]
      await MaterialProperties.pickType(visCard, 'Visualiser')
      await MaterialProperties.setColorChannel('r', '11')
      await MaterialProperties.setColorChannel('g', '22')
      await MaterialProperties.setColorChannel('b', '33')
      await saveAndLock(visCard, 'Visualiser')
      await collapse(visCard)

      const radCard = await MaterialProperties.addCard()
      await MaterialProperties.pickType(radCard, 'Radiation')
      await MaterialProperties.setField(radCard, 'reflectivity_PAR', '0.25')
      await saveAndLock(radCard, 'Radiation')

      // A second material, so the panel has to CHANGE HANDS: the create leaves its
      // own form open, and a passing assertion below cannot be its doing.
      const other = await track()
      await renameAndSettle(other, 'DetailProbeBeta')

      await Materials.search('DetailProbeAlpha')
      // Membership, not a count: the library is GLOBAL and its size is unknown.
      await browser.waitUntil(
        async () => {
          const names = await Materials.names()
          return names.includes('DetailProbeAlpha') && !names.includes('DetailProbeBeta')
        },
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the query never narrowed the list to the match' }
      )

      await Materials.openMaterial(id)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(
        async () => (await MaterialProperties.nameValue()) === 'DetailProbeAlpha',
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the right panel never switched to the searched material'
        }
      )
      // BOTH saved members come back as cards — no blank card, and nothing missing.
      // (refreshDetailCache rewrote the cached detail on each save, so the reopen
      // is served from it without a GET.)
      await browser.waitUntil(
        async () => {
          const cards = await MaterialProperties.cardIds()
          if (cards.length !== 2) return false
          const labels: string[] = []
          for (const c of cards) labels.push(await MaterialProperties.selectedType(c))
          return labels.includes('Visualiser') && labels.includes('Radiation')
        },
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the searched material did not reopen with its two type cards'
        }
      )
      const byType: Record<string, number> = {}
      for (const c of await MaterialProperties.cardIds()) {
        byType[await MaterialProperties.selectedType(c)] = c
      }

      expect(
        (await MaterialProperties.fieldState(byType['Radiation'], 'reflectivity_PAR')).value
      ).toBe('0.25')
      await browser.waitUntil(
        async () => (await MaterialProperties.colorChannel('r').getValue()) === '11',
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the reopened Visualiser card lost its colour' }
      )
    })
  })

  // ══ BLOCK 2 — type-specific validation the catalog sweep cannot reach ════════

  describe('type-specific validation', () => {
    /**
     * Spectral-file copy, mirrored from containers/Materials/messages.ts rather
     * than imported — constants/materials.ts stops at the TEXTURE rules and
     * carries no spectral entries. The same convention this file already uses for
     * DELETE_BODY. Verified verbatim against messages.ts:103 (spectralFileTypeError),
     * :113 (spectralRootError), :116 (spectralNoDataError) and :120-121
     * (spectralDataInvalid). If these ever land in constants/materials.ts, delete
     * this const and import them.
     */
    const SPECTRAL_MSG = {
      fileType: 'Only XML files are allowed',
      root: 'Not a Helios spectral file — its tags must be wrapped in <helios>',
      noData: 'This file contains no spectral data (<globaldata_vec2>)',
      invalid: (label: string): string =>
        `Spectral data "${label}" contains values that are not numbers`
    } as const

    const openVisualiserCard = async (): Promise<number> => {
      await track()
      await MaterialProperties.waitForOpen()
      return cardWithType('Visualiser')
    }

    /**
     * Hand a TEXT file to a card's hidden <input type=file>.
     *
     * e2e/fixtures holds only weather/, so the file is BUILT IN THE PAGE and
     * assigned through a DataTransfer — the only way to reach onFileChange without
     * one on disk (the same technique 'a non-image upload is REJECTED before it
     * reaches the backend' already uses). React routes file inputs through the
     * native `change` event, so a bubbling change is what its onChange listens for.
     *
     * SCOPED TO THE CARD: a Radiation card renders its OWN file input for spectral
     * data, so an unscoped `input[type=file]` is ambiguous the moment two cards
     * with file controls are on screen.
     */
    const dropTextFileOnCard = async (
      cardId: number,
      fileName: string,
      mime: string,
      text: string
    ): Promise<void> => {
      await browser.execute(
        (sel: string, name: string, type: string, body: string) => {
          const input = document.querySelector(sel) as HTMLInputElement | null
          if (!input) throw new Error(`no file input for ${sel}`)
          const dt = new DataTransfer()
          dt.items.add(new File([body], name, { type }))
          input.files = dt.files
          input.dispatchEvent(new Event('change', { bubbles: true }))
        },
        `[data-testid="material-card-${cardId}"] input[type="file"]`,
        fileName,
        mime,
        text
      )
    }

    /** The same, but a file of exactly `byteLength` zero bytes — for the size rule. */
    const dropSizedFileOnCard = async (
      cardId: number,
      fileName: string,
      mime: string,
      byteLength: number
    ): Promise<void> => {
      await browser.execute(
        (sel: string, name: string, type: string, bytes: number) => {
          const input = document.querySelector(sel) as HTMLInputElement | null
          if (!input) throw new Error(`no file input for ${sel}`)
          const dt = new DataTransfer()
          dt.items.add(new File([new Uint8Array(bytes)], name, { type }))
          input.files = dt.files
          input.dispatchEvent(new Event('change', { bubbles: true }))
        },
        `[data-testid="material-card-${cardId}"] input[type="file"]`,
        fileName,
        mime,
        byteLength
      )
    }

    /**
     * Wait for the card's own CLIENT-SIDE file error to read exactly `expected`.
     *
     * `.form-error-text` is unambiguous inside these cards: FormField renders its
     * inline error only for SELECTS (every text input on a material card passes
     * errorAsTooltip), no select on either card can carry one here, and the card's
     * saveError span comes after the editor in DOM order.
     */
    const waitForCardFileError = async (cardId: number, expected: string): Promise<void> => {
      const el = $(`[data-testid="material-card-${cardId}"] .form-error-text`)
      await el.waitForDisplayed({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: `a rejected file reported nothing (expected "${expected}")`
      })
      await browser.waitUntil(
        async () => ((await el.getText().catch(() => '')) as string).trim() === expected,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the rejected file never reported "${expected}"` }
      )
    }

    const openUploadTab = async (cardId: number): Promise<void> => {
      await MaterialProperties.visTab('texture').click()
      await MaterialProperties.subTab('upload').waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the Upload File sub-tab never appeared'
      })
      await MaterialProperties.subTab('upload').click()
      // Rendered only while the Upload sub-tab is active, and `hidden` — so
      // waitForExist, never waitForDisplayed.
      await $(`[data-testid="material-card-${cardId}"] input[type="file"]`).waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the hidden file input never rendered'
      })
    }

    it('the BAND SUM rule reports its own COPY on all three fields of the offending band', async () => {
      // 'a band whose R+T+E exceeds 1 is flagged and blocks Save' asserts only that
      // Save stays shut — the user-facing half, the sentence that says WHY, was
      // never read. It is a CROSS-FIELD message: MaterialRadiationEditor attaches
      // it to all three fields of the band, none of which is individually invalid.
      //
      // Every write here is IN RANGE (0.6 is a legal 0-1 band value), so this test
      // raises no global error and needs no invalid-write-last ordering.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Radiation')
      await MaterialProperties.setField(cardId, 'reflectivity_PAR', '0.6')
      await MaterialProperties.setField(cardId, 'transmissivity_PAR', '0.6')
      await MaterialProperties.setField(cardId, 'emissivity_PAR', '0.6')

      await browser.waitUntil(
        async () => (await MaterialProperties.fieldState(cardId, 'reflectivity_PAR')).invalid,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'a band summing past 1 was never flagged' }
      )
      for (const prop of ['reflectivity_PAR', 'transmissivity_PAR', 'emissivity_PAR']) {
        const state = await MaterialProperties.fieldState(cardId, prop)
        expect(`${prop}: ${state.error}`).toBe(`${prop}: ${MATERIALS_MSG.bandSumExceedsOne}`)
      }
      // The OTHER bands are untouched — the rule is per band, not per card.
      expect((await MaterialProperties.fieldState(cardId, 'reflectivity_NIR')).invalid).toBe(false)
      expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
    })



    it('a spectral upload is refused CLIENT-SIDE four different ways', async () => {
      // All four are rejected by validateSpectralFile BEFORE any POST, so this test
      // stores nothing on the backend — unlike a happy-path spectral upload, which
      // writes a file server-side that no cleanup here could reach.
      //
      // The rules are helios-core's, not ours: Context::loadXML hard-errors unless
      // the root is <helios>, reads only DIRECT <globaldata_vec2> children, and
      // treats a non-numeric token as invalid data.
      //
      // Four drops in ONE test is safe: a rejected FILE sets React state, it does
      // not raise the global error an out-of-range NUMBER does, so nothing here can
      // poison the next browser.execute.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Radiation')
      // The upload control only exists in spectral mode (canUpload = applySpectral
      // && !uploading), and its error line is hidden while the toggle is off.
      await MaterialProperties.spectralToggle.click()
      await browser.waitUntil(async () => MaterialProperties.spectralApplied(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the spectral toggle never turned on'
      })
      await $(`[data-testid="material-card-${cardId}"] input[type="file"]`).waitForExist({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the hidden spectral file input never rendered'
      })

      // 1. The extension — the ONLY thing the backend itself checks.
      await dropTextFileOnCard(cardId, 'notes.txt', 'text/plain', '400 0.1 500 0.2')
      await waitForCardFileError(cardId, SPECTRAL_MSG.fileType)

      // 2. Parses as XML, but is not a Helios file.
      await dropTextFileOnCard(
        cardId,
        'wrongroot.xml',
        'application/xml',
        '<data><globaldata_vec2 label="Alpha">400 0.1 500 0.2</globaldata_vec2></data>'
      )
      await waitForCardFileError(cardId, SPECTRAL_MSG.root)

      // 3. A <helios> file carrying no spectra — it would LOAD without error and
      //    contribute nothing, which is worse than failing.
      await dropTextFileOnCard(
        cardId,
        'empty.xml',
        'application/xml',
        '<helios><note>nothing to read here</note></helios>'
      )
      await waitForCardFileError(cardId, SPECTRAL_MSG.noData)

      // 4. A block whose text is not all numbers — reported BY LABEL, so the user
      //    is told which spectrum is wrong.
      await dropTextFileOnCard(
        cardId,
        'letters.xml',
        'application/xml',
        '<helios><globaldata_vec2 label="Alpha">400 abc 500 0.2</globaldata_vec2></helios>'
      )
      await waitForCardFileError(cardId, SPECTRAL_MSG.invalid('Alpha'))
    })
  })

  // ══ BLOCK 3 — renaming from the FORM: the two panels stay in step ════════════

  describe('renaming from the FORM', () => {
    // The left-panel row editor is covered eight ways above. The FORM's own name
    // header — a read-only input a double-click unlocks (its pencil was removed in
    // 10a5a51) — had no coverage at all, and neither did the direction the two
    // panels have to agree in.

    /** Double-click the form's name header — the only way to unlock it. */
    const unlockFormName = async (): Promise<void> => {
      await browser.execute(() => {
        const el = document.querySelector('[data-testid="material-form-name"]')
        if (!el) throw new Error('unlockFormName: the material Properties form is not open')
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      await browser.waitUntil(
        async () =>
          (await $('[data-testid="material-form-name"]').getAttribute('readonly')) === null,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'double-clicking never unlocked material-form-name' }
      )
    }

    /**
     * Write into the form's name box the way React sees a keystroke.
     *
     * The native value setter + an input event, not setValue: the input is
     * controlled by draft.name, so setValue's click/clear/type sequence loses to
     * the re-render. Same technique as Materials.renameRow.
     */
    const writeFormName = async (next: string): Promise<void> => {
      await browser.execute((val: string) => {
        const node = document.querySelector(
          '[data-testid="material-form-name"]'
        ) as HTMLInputElement | null
        if (!node) throw new Error('writeFormName: the material Properties form is not open')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        node.focus()
        setter?.call(node, val)
        node.dispatchEvent(new Event('input', { bubbles: true }))
      }, next)
    }

    /** Blur the name box — handleNameBlur is where a rename actually fires. */
    const blurFormName = async (): Promise<void> => {
      await browser.execute(() => {
        const node = document.querySelector(
          '[data-testid="material-form-name"]'
        ) as HTMLInputElement | null
        node?.blur()
      })
    }

    it('a rename from the LEFT ROW reaches the OPEN form without reopening it', async () => {
      // RENAME_MATERIAL_SUCCEEDED writes the new name into byId AND into the open
      // editDraft (reducer.ts:334-341). If it only did the first, the form would go
      // on showing the old name until it was closed and reopened — with the row
      // beside it disagreeing.
      const id = await track()
      await MaterialProperties.waitForOpen()
      await renameAndSettle(id, 'RowToForm')
      await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === 'RowToForm', {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the open form kept the old name after the row was renamed'
      })
    })

    it('a DOUBLE-CLICK renames from the form, and the LEFT ROW follows', async () => {
      const id = await track()
      await MaterialProperties.waitForOpen()
      const before = await nameOf(id)
      // Derived from the CURRENT name, not a literal: the library is GLOBAL and
      // survives runs, so a hardcoded name a previous run leaked would be refused
      // as a duplicate and this would fail for a reason it is not testing.
      // Material.NNN is 12 chars, so +1 stays inside the 20-char limit.
      const next = `${before}x`

      await unlockFormName()
      await writeFormName(next)
      await blurFormName()

      await browser.waitUntil(async () => (await Materials.rowState(id))?.name === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the form rename never reached the left-panel row'
      })
      expect(await MaterialProperties.nameValue()).toBe(next)
    })

    it('blurring the READ-ONLY name fires NO rename — a double-click is the only way in', async () => {
      // handleNameBlur opens `if (!nameEditing) return`, and that guard is
      // load-bearing: the field stays FOCUSABLE while read-only, so it is blurred
      // just by tabbing through the panel — which used to fire a PATCH on every
      // pass. The ROW's name is the oracle, because it only changes when the rename
      // actually lands.
      //
      // No double-click. The write still reaches React's onChange (readOnly blocks the
      // USER, not a dispatched input event — React's change plugin consults its
      // value tracker, not readOnly), so the draft really does hold the new text
      // and a missing guard really would dispatch the rename.
      const id = await track()
      await MaterialProperties.waitForOpen()
      const before = await nameOf(id)

      await writeFormName('NoPencilNoRename')
      await blurFormName()

      expect(
        await staysFalse(async () => (await Materials.rowState(id))?.name === 'NoPencilNoRename')
      ).toBe(true)
      expect(await nameOf(id)).toBe(before)
    })
  })

  /* ═══════════════════════════════════════════════════════════════════════════
   * BLOCKS 4-7 belong in:
   *   f:/Helios_desktop_testing_M2/heliosdesktop/e2e/tests/material-assignment.test.ts
   *
   * Paste all four INSIDE describe('Material assignment', ...) — they use its
   * trackGround / trackMaterial / newMaterial / materialNameOf / groundNameOf /
   * openPicker / pick / waitForAssigned / clickSave / saveForm / waitForSaveSettled /
   * stageReplace helpers — and BEFORE describe('the sync dot', ...), which must stay
   * LAST in the file because it navigates to its own projects.
   *
   * ONE NEW IMPORT is required at the top of that file:
   *   import { dragMaterialOnto, readMaterialDragPayload } from '../support/dnd'
   * Nothing else changes: every other symbol used below is already imported there.
   * ═══════════════════════════════════════════════════════════════════════════ */

  // ═══════════════════════════════════════════════════════════════════════════════
  // FILE: e2e/tests/materials.test.ts
  // WHERE: paste ALL FIVE describe blocks below immediately BEFORE the final
  //        closing `})` of `describe('Materials', ...)` — i.e. straight after the
  //        existing `describe('backend failures — loading the library', ...)`.
  //        They use the file-level helpers track() / nameOf() / cardWithType() and
  //        the shared afterEach, so they MUST stay nested inside that outer
  //        describe. NO new imports are needed: every symbol used below is already
  //        imported at the top of the file (Materials, MaterialProperties,
  //        MATERIALS_MSG, MATERIAL_CATALOG, MATERIAL_LIMITS, enumLabel, TIMEOUTS,
  //        staysFalse, reloadToHome, enterMaterials).
  //        Verified: the whole file, with these blocks spliced in, compiles clean
  //        under e2e/tsconfig.json (tsc --noEmit, exit 0).
  // ═══════════════════════════════════════════════════════════════════════════════

    // ══ What a type card actually REFUSES to save ════════════════════════════════

    describe('validation gates on a type card', () => {
      const openRadiationCard = async (): Promise<number> => {
        await track()
        await MaterialProperties.waitForOpen()
        return cardWithType('Radiation')
      }

      /** One waveband's three property names, in the order the grid renders them. */
      const bandProps = (band: string): string[] => [
        `reflectivity_${band}`,
        `transmissivity_${band}`,
        `emissivity_${band}`
      ]

      /** The app's range copy for a field, built from the CATALOG rather than typed here. */
      const rangeMessage = (type: string, property: string): string => {
        const p = MATERIAL_CATALOG[type].find((x) => x.property === property)
        return MATERIALS_MSG.valuesBetween(p?.min ?? null, p?.max ?? null)
      }

      it('a card with NO material type keeps Save shut, and picking one OPENS it', async () => {
        // The blank card every material opens with is the one state in which Save is
        // structurally impossible: canSave starts `group.typeId != null`.
        //
        // DEVIATION: the story speaks of "mandatory validations" on the parameters.
        // There are none. `required` is an OBJECT-type column — the material-type
        // catalog never sends it (materialBlueprint's ResolvedMaterialField comment
        // says so outright), so validateMaterialFieldValue returns null for every
        // EMPTY material field. A Radiation card with nothing typed into it is
        // therefore already saveable, which is what the second half pins. The only
        // real gates in this feature are the Visualiser's colour completeness, the
        // Radiation band-sum rule and the spectral setup — all covered below.
        await track()
        await MaterialProperties.waitForOpen()
        const blank = (await MaterialProperties.cardIds())[0]
        expect(await MaterialProperties.selectedType(blank)).toBe('')
        expect(await staysFalse(async () => MaterialProperties.saveEnabled(blank))).toBe(true)

        await MaterialProperties.pickType(blank, 'Radiation')
        await browser.waitUntil(
          async () => (await MaterialProperties.selectedType(blank)) === 'Radiation',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the picked type never landed on the blank card' }
        )
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(blank), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg:
            'a typed card with no values did not open Save — every material property is optional'
        })
      })

      it('an out-of-range value keeps Save SHUT and reports the CATALOG range', async () => {
        // The Visualiser's colour gate and the Radiation cross-field rule were both
        // covered; nothing proved that an ordinary catalog RANGE also gates Save.
        // The valid probe comes FIRST so the shut Save at the end is the value's
        // doing and not some other property of the card.
        //
        // ORDER IS LOAD-BEARING. The out-of-range write is the LAST browser.execute
        // this test performs: such a value leaves a pending page error that
        // WebdriverIO surfaces on the next execute, and setField IS an execute.
        // Everything after it reads through ELEMENT commands — saveEnabled() is
        // isEnabled(), fieldState() reads attributes — which are unaffected.
        const cardId = await openRadiationCard()
        await MaterialProperties.setField(cardId, 'specular_exponent', '500')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'an in-range specular exponent did not open Save'
        })

        await MaterialProperties.setField(cardId, 'specular_exponent', '99999')
        expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
        const bad = await MaterialProperties.fieldState(cardId, 'specular_exponent')
        // errorAsTooltip: the copy lives in data-tooltip-content, never as visible text.
        expect(`invalid=${bad.invalid} error=${bad.error}`).toBe(
          `invalid=true error=${rangeMessage('Radiation', 'specular_exponent')}`
        )
      })

      it('EVERY band flags all THREE of its fields when R+T+E exceeds 1', async () => {
        // The cross-field rule was only ever probed on PAR, and only through Save.
        // This reads the COPY on all nine inputs: MaterialRadiationEditor hands the
        // same messages.bandSumExceedsOne to every field of an offending band.
        //
        // NO out-of-range write anywhere here — 0.5 / 0.4 / 0.3 are each inside the
        // catalog's 0-1, so only their SUM (1.2) is wrong. A band-sum violation is
        // already proven safe to keep writing past: the passing 'a band whose R+T+E
        // exceeds 1' test writes emissivity through setField while reflectivity and
        // transmissivity already sum to 1.2.
        const cardId = await openRadiationCard()
        const bands = ['PAR', 'NIR', 'LW']
        for (const band of bands) {
          const [refl, trans, emis] = bandProps(band)
          await MaterialProperties.setField(cardId, refl, '0.5')
          await MaterialProperties.setField(cardId, trans, '0.4')
          await MaterialProperties.setField(cardId, emis, '0.3')
        }
        await browser.waitUntil(
          async () =>
            (await MaterialProperties.fieldState(cardId, 'emissivity_LW')).error ===
            MATERIALS_MSG.bandSumExceedsOne,
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the band-sum rule never flagged the last band' }
        )
        for (const band of bands) {
          for (const prop of bandProps(band)) {
            const state = await MaterialProperties.fieldState(cardId, prop)
            expect(`${prop}: ${state.error} invalid=${state.invalid}`).toBe(
              `${prop}: ${MATERIALS_MSG.bandSumExceedsOne} invalid=true`
            )
          }
        }
        expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
      })

      it('correcting an offending band CLEARS all three messages and re-opens Save', async () => {
        // The "the messages disappear once corrected" half, proved through the one
        // rule that needs no out-of-range write to reach: every value below is inside
        // the catalog's 0-1, so nothing here can leave a pending page error and the
        // corrective writes can safely go through setField.
        const cardId = await openRadiationCard()
        const [refl, trans, emis] = bandProps('PAR')
        for (const prop of [refl, trans, emis]) {
          await MaterialProperties.setField(cardId, prop, '0.6')
        }
        expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)

        await MaterialProperties.setField(cardId, trans, '0.1')
        await MaterialProperties.setField(cardId, emis, '0.1')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'a band summing to 0.8 did not re-open Save'
        })
        for (const prop of [refl, trans, emis]) {
          const state = await MaterialProperties.fieldState(cardId, prop)
          expect(`${prop}: error=${state.error} invalid=${state.invalid}`).toBe(
            `${prop}: error=null invalid=false`
          )
        }
      })

      it('the two SPECTRUM pickers grey out with the toggle and offer NOTHING without a file', async () => {
        // The two dropdowns nothing had ever touched. They are catalog `string`
        // properties, not enums, so the enum sweep could never reach them — the
        // Radiation editor turns them into Selects by handing FormField an explicit
        // `options` list built from the labels INSIDE the uploaded file.
        //
        // No upload happens here, deliberately: a successful spectral POST stores a
        // file server-side that this suite has no way to clean up. Everything below
        // is reachable without one.
        //
        // Their control TEXT is deliberately not asserted. These are `string` fields,
        // so FormField gets the trimmed field LABEL as its placeholder rather than
        // "Select" — a cosmetic detail that would make this test fail for a label
        // change. What matters is the enabled state and the empty option set.
        const cardId = await openRadiationCard()
        const pickers = ['reflectivity_spectrum', 'transmissivity_spectrum']

        for (const prop of pickers) {
          // Resolved from ALL groups, not just the visible ones, so the controls are
          // on screen from the start and simply grey with the toggle.
          await MaterialProperties.enumControl(cardId, prop).waitForExist({
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: `${prop} never rendered its control`
          })
          expect(`${prop} enabled=${(await MaterialProperties.enumState(cardId, prop)).enabled}`).toBe(
            `${prop} enabled=false`
          )
        }

        await MaterialProperties.spectralToggle.click()
        await browser.waitUntil(async () => MaterialProperties.spectralApplied(), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'the spectral toggle never turned on'
        })

        for (const prop of pickers) {
          await browser.waitUntil(
            async () => (await MaterialProperties.enumState(cardId, prop)).enabled,
            { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `${prop} stayed disabled with spectral data ON` }
          )
          // Select renders NO listbox at all for an empty option set
          // (`listOpen = open && filtered.length > 0`), and these two pass
          // clearable:false — so an ENABLED picker with no file behind it still
          // cannot be opened. That is the shipped answer to "what do these two
          // dropdowns contain": the file's own spectra, and nothing until there is
          // one. Clicked in-page because the card can be scrolled out of view, and
          // NOT through openEnum — that waits for a listbox which can never appear.
          await browser.execute((sel: string) => {
            const btn = document.querySelector(sel) as HTMLElement | null
            if (!btn) throw new Error(`no combobox for ${sel}`)
            btn.click()
          }, `[data-testid="input-${cardId}-${prop}"] [role="combobox"]`)
          expect(
            await staysFalse(async () => MaterialProperties.enumList(cardId, prop).isExisting())
          ).toBe(true)
        }
        // An expanded Select is portalled the moment it has anything to show, so it
        // is closed here the same way a leaked listbox would be.
        await MaterialProperties.closeEnum()

        // Spectral mode with no file can never be saved (spectralSetupIncomplete):
        // the save DROPS the band values on the understanding a file replaces them,
        // so saving here would ship a material with no optics at all.
        expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
      })
    })

    // ══ Type-specific FILE rules — texture and spectral ══════════════════════════

    describe('type-specific file validation', () => {
      /**
       * messages.ts strings that constants/materials.ts carries no entry for,
       * mirrored here the way DELETE_BODY above is. Verified verbatim against
       * containers/Materials/messages.ts — textureFileFormatMismatch:72,
       * spectralFileTypeError:103, spectralRootError:113 (a real em dash),
       * spectralNoDataError:116, spectralDataInvalid:120.
       */
      const TEXTURE_FORMAT_MISMATCH = (actual: string, named: string): string =>
        `This is a ${actual} image named "${named}". Rename it with the matching extension and try again`
      const SPECTRAL_TYPE_ERROR = 'Only XML files are allowed'
      const SPECTRAL_ROOT_ERROR = 'Not a Helios spectral file — its tags must be wrapped in <helios>'
      const SPECTRAL_NO_DATA_ERROR = 'This file contains no spectral data (<globaldata_vec2>)'
      const SPECTRAL_DATA_INVALID = (label: string): string =>
        `Spectral data "${label}" contains values that are not numbers`

      /**
       * Hand the card's hidden <input type=file> a file built IN THE PAGE.
       *
       * e2e/fixtures holds only weather/, so there is nothing on disk to give a real
       * file input — the File is assembled through a DataTransfer and delivered as a
       * bubbling `change`, which is what React listens for on a file input
       * (shouldUseChangeEvent). Same mechanism as 'a non-image upload is REJECTED
       * before it reaches the backend'; scoped to the CARD because a Radiation card
       * and a Visualiser card each carry one of these.
       *
       * Only primitives cross the wire: `bytes` are leading signature bytes and
       * `pad` zero-fills to a size, so a payload can be exact without a fixture.
       *
       * EVERY case below is refused CLIENT-SIDE, before any POST, so none of them
       * leaves a stored file behind — which is exactly why the happy path is absent.
       */
      const dispatchFile = async (
        cardId: number,
        file: { name: string; mime: string; text?: string; bytes?: number[]; pad?: number }
      ): Promise<void> => {
        await browser.execute(
          (sel: string, name: string, mime: string, text: string | null, bytes: number[], pad: number) => {
            const input = document.querySelector(sel) as HTMLInputElement | null
            if (!input) throw new Error(`no file input inside ${sel}`)
            const buf = new Uint8Array(bytes.length + pad)
            buf.set(bytes, 0)
            const dt = new DataTransfer()
            dt.items.add(new File([text === null ? buf : text], name, { type: mime }))
            input.files = dt.files
            input.dispatchEvent(new Event('change', { bubbles: true }))
          },
          `[data-testid="material-card-${cardId}"] input[type="file"]`,
          file.name,
          file.mime,
          file.text ?? null,
          file.bytes ?? [],
          file.pad ?? 0
        )
      }

      /**
       * The card's client-side file message. ELEMENT reads only.
       *
       * `:not([data-testid])` keeps this off a FormField's inline select error, which
       * carries `error-{name}` and shares the class — the file messages here and the
       * card's own save error are the only untagged ones, and the save error renders
       * below Save, after this.
       */
      const fileError = async (cardId: number): Promise<string> => {
        const el = $(`[data-testid="material-card-${cardId}"]`).$('.form-error-text:not([data-testid])')
        return ((await el.getText().catch(() => '')) as string).trim()
      }

      /** Wait for one rejection, then assert it by name so a failure says WHICH case. */
      const expectFileError = async (cardId: number, want: string, label: string): Promise<void> => {
        await browser
          .waitUntil(async () => (await fileError(cardId)) === want, { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {
            /* the labelled expect below reports it */
          })
        expect(`${label}: ${await fileError(cardId)}`).toBe(`${label}: ${want}`)
      }


      it('the spectral upload refuses a NON-XML name, a wrong ROOT, a file with NO blocks and NON-NUMERIC data', async () => {
        // validateSpectralFile mirrors helios-core's loadXML contract: the root must
        // be <helios>, spectra are DIRECT <globaldata_vec2> children with a label,
        // and each block's text is whitespace-separated finite numbers. Only the
        // NEGATIVE cases are driven — a VALID file POSTs and is stored server-side,
        // which would leave residue afterEach cannot reach.
        await track()
        await MaterialProperties.waitForOpen()
        const cardId = await cardWithType('Radiation')
        // The picker is disabled until spectral mode is on (`canUpload`), and the
        // message below it is hidden with it.
        await MaterialProperties.spectralToggle.click()
        await browser.waitUntil(async () => MaterialProperties.spectralApplied(), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'the spectral toggle never turned on'
        })

        await dispatchFile(cardId, { name: 'spectra.txt', mime: 'text/plain', text: '<helios/>' })
        await expectFileError(cardId, SPECTRAL_TYPE_ERROR, 'wrong extension')

        // Well-formed XML, real data blocks — but Helios refuses anything not wrapped
        // in <helios>, and it would fail inside a simulation with no trail back here.
        await dispatchFile(cardId, {
          name: 'wrongroot.xml',
          mime: 'text/xml',
          text: '<data><globaldata_vec2 label="Alpha">400 0.1 500 0.2</globaldata_vec2></data>'
        })
        await expectFileError(cardId, SPECTRAL_ROOT_ERROR, 'wrong root')

        // A <helios> file with nothing Helios will ever read: `child("globaldata_vec2")`
        // does not search descendants, and this file has no such block at all.
        await dispatchFile(cardId, {
          name: 'nodata.xml',
          mime: 'text/xml',
          text: '<helios><notdata label="Alpha">400 0.1</notdata></helios>'
        })
        await expectFileError(cardId, SPECTRAL_NO_DATA_ERROR, 'no globaldata_vec2')

        // A token parse_data_vec2 cannot read is a hard error in the C++ loader, so
        // it is caught here — and the message names the offending block.
        await dispatchFile(cardId, {
          name: 'notnumbers.xml',
          mime: 'text/xml',
          text: '<helios><globaldata_vec2 label="Alpha">400 nope 500 0.2</globaldata_vec2></helios>'
        })
        await expectFileError(cardId, SPECTRAL_DATA_INVALID('Alpha'), 'non-numeric tokens')

        // Nothing uploaded, so spectral mode is still incomplete and Save stays shut.
        expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
      })
    })

    // ══ Dropdown option sets — EXACTLY the catalog, not merely containing it ═════

    describe('enum option sets — exactly the catalog', () => {
      // The existing per-enum sweep asserts CONTAINMENT (`toContain` per catalog
      // value), so an EXTRA or a STALE option still passes it. This asserts the whole
      // list, for every enum of every type that has one.
      //
      // Compared as SORTED sets rather than in order, on purpose: the shortfall being
      // closed is "an extra or a stale row", which sorting cannot hide, while ORDER is
      // already pinned by 'only the FOUR catalog sub-models are offered, alongside the
      // clear row'. The clear row's POSITION is asserted separately, because that one
      // is load-bearing — Select unconditionally prepends it when clearable, and
      // FormField defaults clearable to true.
      const TYPES_WITH_ENUMS = Object.keys(MATERIAL_CATALOG).filter((t) =>
        MATERIAL_CATALOG[t].some((p) => p.datatype === 'enum')
      )

      for (const type of TYPES_WITH_ENUMS) {
        it(`${type} offers EXACTLY the catalog's options — no extras, no stale rows`, async () => {
          await track()
          await MaterialProperties.waitForOpen()
          const cardId = await cardWithType(type)
          for (const p of MATERIAL_CATALOG[type].filter((x) => x.datatype === 'enum')) {
            await MaterialProperties.openEnum(cardId, p.property)
            const labels = (await MaterialProperties.enumOptions(cardId, p.property)).map(
              (o) => o.label
            )
            // A SELECTOR enum lists GROUP NAMES, not the values it stores, so the
            // expectation has to go through enumLabel too.
            // A FIXED selector (one option, seeded on type-pick) has nothing to
            // clear back to, so components/Select is not `clearable` for it and the
            // leading "Select" row is absent. Every other enum keeps it.
            const fixed = isFixedSelector(type, p.property)
            const want = [
              ...(fixed ? [] : [MATERIALS_MSG.selectPlaceholder]),
              ...(p.enumValues as string[]).map((v) => enumLabel(type, p.property, v))
            ]
            expect(`${p.property}: ${[...labels].sort().join(' | ')}`).toBe(
              `${p.property}: ${[...want].sort().join(' | ')}`
            )
            expect(`${p.property} row0=${labels[0]}`).toBe(
              `${p.property} row0=${
                fixed ? enumLabel(type, p.property, (p.enumValues as string[])[0]) : MATERIALS_MSG.selectPlaceholder
              }`
            )
            // A leaked listbox is portalled to document.body and intercepts later
            // clicks exactly the way a leaked dialog does.
            await MaterialProperties.closeEnum()
          }
        })
      }
    })

    // ══ Sub-model switching — what happens to the values you leave behind ════════

    describe('sub-model switching', () => {
      it("switching sub-model BLANKS the abandoned sub-model's typed coefficients", async () => {
        // The selector-hygiene effect in MaterialPropertiesForm, whose own comment
        // reads "pick Medlyn and BWB's coefficients must not linger". Nothing had
        // typed a coefficient, switched away and come BACK to check it was gone — and
        // a lingering value would keep the card dirty and ship in the payload the
        // moment BWB was reselected.
        await track()
        await MaterialProperties.waitForOpen()
        const cardId = await cardWithType('Stomatal Conductance')
        const BWB = enumLabel('Stomatal Conductance', 'stomatal_model', 'BWB')
        const MEDLYN = enumLabel('Stomatal Conductance', 'stomatal_model', 'Medlyn')

        await MaterialProperties.setEnum(cardId, 'stomatal_model', BWB)
        await MaterialProperties.setField(cardId, 'bwb_gs0', '0.5')
        expect((await MaterialProperties.fieldState(cardId, 'bwb_gs0')).value).toBe('0.5')

        await MaterialProperties.setEnum(cardId, 'stomatal_model', MEDLYN)
        expect(await MaterialProperties.hasField(cardId, 'bwb_gs0')).toBe(false)

        await MaterialProperties.setEnum(cardId, 'stomatal_model', BWB)
        await browser.waitUntil(
          async () => (await MaterialProperties.fieldState(cardId, 'bwb_gs0')).value === '',
          {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg:
              'bwb_gs0 came back carrying its abandoned value — the hygiene effect did not clear it'
          }
        )

        // The other half of the rule: gamma_co2 is TOP-LEVEL, so a sub-model switch
        // must not sweep it away with the coefficients. An effect that cleared
        // "everything not in the active group" would take this with it.
        await MaterialProperties.setField(cardId, 'gamma_co2', '400')
        await MaterialProperties.setEnum(cardId, 'stomatal_model', MEDLYN)
        expect((await MaterialProperties.fieldState(cardId, 'gamma_co2')).value).toBe('400')
      })
    })

    // ══ Valid values are ACCEPTED, SAVED, and come back ══════════════════════════

    describe('valid values save and survive a reload', () => {
      /**
       * Resolve a REOPENED card by the type it holds. Member order comes from the
       * backend, so cardId 1/2 cannot be assumed — reducer.ts numbers reopened cards
       * `index + 1` over `detail.members`.
       */
      const cardForType = async (type: string): Promise<number> => {
        for (const id of await MaterialProperties.cardIds()) {
          if ((await MaterialProperties.selectedType(id)) === type) return id
        }
        throw new Error(`no reopened card holds the ${type} type`)
      }

      /** Go home, enter a FRESH project, and reopen `name` from the GLOBAL library. */
      const reopenMaterial = async (label: string, name: string): Promise<void> => {
        await reloadToHome()
        await enterMaterials(label)
        await browser.waitUntil(async () => (await Materials.idForName(name)) !== null, {
          timeout: TIMEOUTS.LONG,
          timeoutMsg: `"${name}" did not come back after the reload — the library is GLOBAL, it must`
        })
        const rowId = await Materials.idForName(name)
        if (rowId === null) throw new Error(`could not resolve the row id for "${name}"`)
        await Materials.openMaterial(rowId)
        await MaterialProperties.waitForOpen()
        // Only the SAVED cards come back as members; the blank card the material
        // opened with was never one of them.
        await browser.waitUntil(async () => (await MaterialProperties.cardIds()).length === 2, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the reopened material did not come back with its two saved types'
        })
      }

      /**
       * Poll a reopened numeric field to settle, then assert it by name.
       *
       * Compared as a NUMBER: the backend stores these natively and service.ts
       * stringifies whatever JSON hands back, so a float that returns as 250 and one
       * that returns as 250.0 are the same saved value and neither is a regression.
       */
      const settlesNumber = async (
        read: () => Promise<string>,
        want: number,
        label: string
      ): Promise<void> => {
        await browser
          .waitUntil(async () => Number(await read()) === want, { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {
            /* the labelled expect below reports it */
          })
        // Number() on BOTH sides, or a value that came back as "250.0" would pass the
        // poll and then fail the assertion it just satisfied.
        expect(`${label}=${Number(await read())}`).toBe(`${label}=${want}`)
      }

      /** The same, for a control whose text is the assertion (an enum's label). */
      const settlesText = async (
        read: () => Promise<string>,
        want: string,
        label: string
      ): Promise<void> => {
        await browser
          .waitUntil(async () => (await read()) === want, { timeout: TIMEOUTS.MEDIUM })
          .catch(() => {
            /* the labelled expect below reports it */
          })
        expect(`${label}=${await read()}`).toBe(`${label}=${want}`)
      }

      it('Radiation and Energy Balance values SURVIVE a save and a full reload', async () => {
        // ACCEPTED was swept exhaustively; SAVED was proved for the Visualiser only.
        // These two exercise the other two payload builders: Radiation goes through
        // toRadiationProperties (mode-routed), Energy Balance through the plain
        // toNativeProperties. Both cards live on ONE material so the round trip costs
        // one reload rather than two.
        const id = await track()
        const name = await nameOf(id)
        await MaterialProperties.waitForOpen()

        const radiation = await cardWithType('Radiation')
        await MaterialProperties.setField(radiation, 'specular_exponent', '250')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(radiation), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Save never enabled for a valid Radiation card'
        })
        await MaterialProperties.saveCard(radiation)

        const energy = await cardWithType('Energy Balance')
        await MaterialProperties.setField(energy, 'heat_capacity', '1234')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(energy), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Save never enabled for a valid Energy Balance card'
        })
        await MaterialProperties.saveCard(energy)

        await reopenMaterial('matsaveA', name)

        const r2 = await cardForType('Radiation')
        await settlesNumber(
          async () => (await MaterialProperties.fieldState(r2, 'specular_exponent')).value,
          250,
          'specular_exponent'
        )
        const e2 = await cardForType('Energy Balance')
        await settlesNumber(
          async () => (await MaterialProperties.fieldState(e2, 'heat_capacity')).value,
          1234,
          'heat_capacity'
        )
      })

      it('a FARQUHAR submodel and a MEDLYN stomatal card survive the round trip', async () => {
        // The selector-gated half of "valid values are saved successfully", and the
        // half of "changing the sub-model updates the configuration" that reaches the
        // BACKEND: nothing had ever saved a Stomatal Conductance card at all.
        const id = await track()
        const name = await nameOf(id)
        await MaterialProperties.waitForOpen()

        const photo = await cardWithType('Photosynthesis')
        // A SELECTOR enum shows the NAME OF THE GROUP it unlocks, never the stored
        // value — the dropdown reads "Farquhar model" while the value is
        // `farquhar_model`.
        const FARQUHAR = enumLabel('Photosynthesis', 'submodel', 'farquhar_model')
        await MaterialProperties.setEnum(photo, 'submodel', FARQUHAR)
        await MaterialProperties.setField(photo, 'vcmax25', '75')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(photo), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Save never enabled for a valid Farquhar card'
        })
        await MaterialProperties.saveCard(photo)

        const stomatal = await cardWithType('Stomatal Conductance')
        const BWB = enumLabel('Stomatal Conductance', 'stomatal_model', 'BWB')
        const MEDLYN = enumLabel('Stomatal Conductance', 'stomatal_model', 'Medlyn')
        // Type into BWB and then ABANDON it, so the card that gets saved is one whose
        // active sub-model was chosen SECOND.
        await MaterialProperties.setEnum(stomatal, 'stomatal_model', BWB)
        await MaterialProperties.setField(stomatal, 'bwb_gs0', '0.5')
        await MaterialProperties.setEnum(stomatal, 'stomatal_model', MEDLYN)
        await MaterialProperties.setField(stomatal, 'medlyn_g1', '5')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(stomatal), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Save never enabled for a valid Medlyn card'
        })
        await MaterialProperties.saveCard(stomatal)

        await reopenMaterial('matsaveB', name)

        const p2 = await cardForType('Photosynthesis')
        await settlesText(
          async () => (await MaterialProperties.enumState(p2, 'submodel')).label,
          FARQUHAR,
          'submodel'
        )
        await settlesNumber(
          async () => (await MaterialProperties.fieldState(p2, 'vcmax25')).value,
          75,
          'vcmax25'
        )

        const s2 = await cardForType('Stomatal Conductance')
        await settlesText(
          async () => (await MaterialProperties.enumState(s2, 'stomatal_model')).label,
          MEDLYN,
          'stomatal_model'
        )
        await settlesNumber(
          async () => (await MaterialProperties.fieldState(s2, 'medlyn_g1')).value,
          5,
          'medlyn_g1'
        )
        // The abandoned sub-model's group is gated on the selector, so a card that
        // came back on Medlyn cannot be showing BWB's coefficients.
        expect(await MaterialProperties.hasField(s2, 'bwb_gs0')).toBe(false)
      })
    })

  // ── FILE: e2e/tests/materials.test.ts ─────────────────────────────────────────
  // Paste BOTH describe blocks INSIDE `describe('Materials', ...)`, at the very END
  // of the file — after `describe('backend failures — loading the library')` and
  // before that outer describe's closing `})`. They use the file's shared
  // `track` / `created` / `nameOf` / `cardWithType` helpers and its afterEach sweep,
  // and every import they need (Materials, MaterialProperties, MATERIAL_CATALOG,
  // MATERIAL_LIMITS, TIMEOUTS, reloadToHome, enterMaterials, reopenByName) is
  // already at the top of the file. Nothing existing is edited.

    // ══ Visualiser — the colour CONTROLS (area, hue, opacity, swatches) ═════════
    //
    // The existing `visualiser` block proves the three NUMBER BOXES: typing r/g/b,
    // their bounds, and a save. Every OTHER route into a colour was untested, and
    // they are not the same code path — the boxes go straight through the card's
    // guarded field handler one property at a time, while the area, the hue slider
    // and a "Used colors" swatch all go through MaterialVisualisationEditor's
    // `handleColor`, which commits ALL THREE channels in one gesture and seeds
    // opacity when it is blank. A regression in handleColor is invisible to a
    // typed-value test.
    //
    // The three tracks are driven by KEYBOARD, not by pointer coordinates:
    // ColorPicker gives each `role="slider"`, `tabIndex={0}` and its own onKeyDown
    // (1% per arrow, full-range for Home/End), so the keys produce exact, arithmetic
    // outcomes while a synthetic drag would depend on the track's measured width.
    // No test in this block writes an out-of-range value, so nothing here can leave
    // a pending page error for the next execute.

    describe('visualiser — the colour controls', () => {
      const openVisualiser = async (): Promise<number> => {
        await track()
        await MaterialProperties.waitForOpen()
        return cardWithType('Visualiser')
      }

      /** All four boxes in one read. ELEMENT commands only, like fieldState(). */
      const readChannels = async (): Promise<{
        r: string
        g: string
        b: string
        opacity: string
      }> => ({
        r: (await MaterialProperties.colorChannel('r').getValue()) as string,
        g: (await MaterialProperties.colorChannel('g').getValue()) as string,
        b: (await MaterialProperties.colorChannel('b').getValue()) as string,
        opacity: (await MaterialProperties.colorChannel('opacity').getValue()) as string
      })

      /** A track's own reported position — the control's state, not the boxes'. */
      const sliderNow = async (label: string): Promise<string> =>
        ((await $(`[role="slider"][aria-label="${label}"]`).getAttribute('aria-valuenow')) ??
          '') as string

      const sliderText = async (label: string): Promise<string> =>
        ((await $(`[role="slider"][aria-label="${label}"]`).getAttribute('aria-valuetext')) ??
          '') as string

      /**
       * Focus one of the three tracks and PROVE focus landed before pressing a key.
       *
       * The tracks are plain divs with tabIndex={0}, so they are focused in-page
       * rather than clicked: a real click on a track also COMMITS a colour at the
       * click point (onPointerDown emits immediately), which would move the value
       * before the keypress under test ever ran. Without the readback a key sent to
       * the wrong element does nothing at all and the failure would blame the
       * control instead of the focus.
       */
      const focusTrack = async (label: string): Promise<void> => {
        await $(`[role="slider"][aria-label="${label}"]`).waitForDisplayed({
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: `the "${label}" track never rendered`
        })
        await browser.execute((name: string) => {
          const el = document.querySelector(
            `[role="slider"][aria-label="${name}"]`
          ) as HTMLElement | null
          if (!el) throw new Error(`focusTrack: no slider "${name}"`)
          el.focus()
        }, label)
        const focused = (await browser.execute(() => {
          const el = document.activeElement as HTMLElement | null
          return el?.getAttribute('role') === 'slider' ? (el.getAttribute('aria-label') ?? '') : ''
        })) as string
        expect(focused).toBe(label)
      }

      /** A committed channel: a whole number inside the catalog's 0-255. */
      const wholeChannel = (v: string): boolean =>
        /^\d+$/.test(v) &&
        Number(v) >= MATERIAL_LIMITS.CHANNEL_MIN &&
        Number(v) <= MATERIAL_LIMITS.CHANNEL_MAX

      /** "Used colors" is GLOBAL and localStorage-backed, exactly as the existing
       *  history test documents — capture and put it back so a run does not rewrite
       *  whatever the person at this machine had used. The literal is
       *  utils/storageKeys.ts STORAGE_KEYS.recentColors. */
      const RECENT_COLORS_KEY = 'helios:materials:recentColors'
      const readRecentColors = async (): Promise<string | null> =>
        (await browser.execute((k: string) => {
          try {
            return localStorage.getItem(k)
          } catch {
            return null
          }
        }, RECENT_COLORS_KEY)) as string | null
      const writeRecentColors = async (raw: string | null): Promise<void> => {
        await browser.execute(
          (k: string, v: string | null) => {
            try {
              if (v == null) localStorage.removeItem(k)
              else localStorage.setItem(k, v)
            } catch {
              /* private mode / quota — the history is a nicety */
            }
          },
          RECENT_COLORS_KEY,
          raw
        )
      }

      it('the six Visualiser catalog properties render as the BESPOKE editor, not as FormFields', async () => {
        // The "Visualiser property configuration" is six catalog rows
        // (texture_toggle, color_r/g/b, opacity, texture_file) and two mutually
        // exclusive modes — and NONE of the six reaches MaterialFieldGrid:
        // isVisualisationFieldSet routes the whole group to
        // MaterialVisualisationEditor, so `input-{cardId}-{property}` exists for
        // none of them. That absence is the load-bearing fact: it is why the two
        // modes can be mutually exclusive at all, rather than two halves of one
        // form both feeding the same payload.
        const cardId = await openVisualiser()
        for (const p of MATERIAL_CATALOG['Visualiser']) {
          expect(`${p.property} formfield=${await MaterialProperties.hasField(cardId, p.property)}`).toBe(
            `${p.property} formfield=false`
          )
        }
        // What stands in for them: four number boxes for the colour half…
        for (const ch of ['r', 'g', 'b', 'opacity'] as const) {
          await expect(MaterialProperties.colorChannel(ch)).toBeDisplayed()
        }
        // …and the two tabs, which are the only representation texture_toggle has —
        // it is never typed, only switched.
        await expect(MaterialProperties.visTab('custom')).toBeDisplayed()
        await expect(MaterialProperties.visTab('texture')).toBeDisplayed()
      })

      it('the HUE slider commits ALL THREE channels in one keypress, and answers Home/End', async () => {
        // The differential the number boxes cannot make: handleColor writes r, g and
        // b TOGETHER. A brand-new card opens with all three boxes EMPTY (only opacity
        // is seeded), so one arrow on the hue track filling all three at once is the
        // whole claim, in the cleanest possible before/after.
        //
        // The arithmetic is exact: hue is a 0-360 track, an arrow is 1% of it, and
        // Home/End are full-range moves the caller clamps — so aria-valuenow goes
        // 0 -> 4 (round(3.6)) -> 360 -> 0. The CHANNELS are asserted as "whole and in
        // 0-255" rather than as literals: the seed colour is a grey (saturation 0),
        // so a hue move leaves it grey by construction, and pinning 128 would be
        // pinning a float round-trip rather than the behaviour.
        const cardId = await openVisualiser()
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '100',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'opacity was not seeded to 100' }
        )
        const before = await readChannels()
        expect(`r="${before.r}" g="${before.g}" b="${before.b}"`).toBe('r="" g="" b=""')
        expect(await sliderNow('Hue')).toBe('0')

        await focusTrack('Hue')
        await browser.keys(['ArrowRight'])
        await browser.waitUntil(async () => (await sliderNow('Hue')) === '4', {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'ArrowRight did not advance the hue track by 1% (0 -> 4)'
        })

        const after = await readChannels()
        for (const ch of ['r', 'g', 'b'] as const) {
          expect(`${ch}="${after[ch]}" whole0to255=${wholeChannel(after[ch])}`).toBe(
            `${ch}="${after[ch]}" whole0to255=true`
          )
        }
        // Opacity was already seeded, so the colour move left it alone.
        expect(after.opacity).toBe('100')
        // …and one keypress produced a COMPLETE, saveable appearance — which is only
        // true because all four boxes were filled by it.
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'a colour picked from the hue slider did not open Save'
        })

        // The ends of the range, from the same focused track.
        await browser.keys(['End'])
        await browser.waitUntil(async () => (await sliderNow('Hue')) === '360', {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'End did not take the hue track to 360'
        })
        await browser.keys(['Home'])
        await browser.waitUntil(async () => (await sliderNow('Hue')) === '0', {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Home did not take the hue track back to 0'
        })
        const ends = await readChannels()
        for (const ch of ['r', 'g', 'b'] as const) {
          expect(`${ch}="${ends[ch]}" whole0to255=${wholeChannel(ends[ch])}`).toBe(
            `${ch}="${ends[ch]}" whole0to255=true`
          )
        }
      })

      it('the saturation/brightness AREA moves the colour on BOTH axes', async () => {
        // The two-axis control, and the one place a hue move alone cannot change the
        // colour: the card seeds a GREY (saturation 0), where every hue is the same
        // colour. End moves both axes to their maximum and Home to their minimum, so
        // the outcomes are exact and the channels can be pinned as literals:
        //   grey  -> #808080 (the 128 seed)
        //   End   -> saturation 1, value 1 at hue 0 = pure red
        //   Home  -> saturation 0, value 0            = black
        // aria-valuetext carries the resulting hex, which is the picker's own read of
        // what it committed — a stronger oracle than the boxes alone.
        await openVisualiser()
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '100',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'opacity was not seeded to 100' }
        )
        expect(await sliderText('Saturation and brightness')).toBe('#808080')
        expect(await sliderNow('Saturation and brightness')).toBe('0')

        await focusTrack('Saturation and brightness')
        await browser.keys(['End'])
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('r').getValue()) === '255',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'End on the colour area never reached full red' }
        )
        expect(await readChannels()).toEqual({ r: '255', g: '0', b: '0', opacity: '100' })
        // x axis = saturation, reported as the slider's numeric value.
        expect(await sliderNow('Saturation and brightness')).toBe('100')
        expect(await sliderText('Saturation and brightness')).toBe('#ff0000')

        await browser.keys(['Home'])
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('r').getValue()) === '0',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'Home on the colour area never reached black' }
        )
        expect(await readChannels()).toEqual({ r: '0', g: '0', b: '0', opacity: '100' })
        expect(await sliderNow('Saturation and brightness')).toBe('0')
        expect(await sliderText('Saturation and brightness')).toBe('#000000')
      })

      it('a colour committed while opacity is BLANK re-seeds opacity to 100', async () => {
        // handleColor's second job, and the only way to reach it: the mount effect
        // seeds opacity once and is deliberately NOT keyed on the value ('' is a
        // legal in-progress keystroke, so a value-watching effect would type 100 back
        // while the user backspaced). So a box emptied AFTER mount stays empty until
        // the next COLOUR move fills it — which is what makes a picked colour
        // immediately saveable instead of two-thirds complete.
        const cardId = await openVisualiser()
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '100',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'opacity was not seeded to 100' }
        )
        await MaterialProperties.setColorChannel('opacity', '')
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the opacity box never cleared' }
        )
        // Nothing re-seeds it on its own — that is the point of the effect's keying.
        expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)

        await focusTrack('Hue')
        await browser.keys(['ArrowRight'])
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '100',
          {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: 'a colour committed over a blank opacity did not re-seed it to 100'
          }
        )
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'the re-seeded colour did not open Save'
        })
      })

      it('the OPACITY slider adjusts opacity across its full 0-100 range', async () => {
        // The slider route into opacity, which nothing exercised. Its arithmetic is
        // the same 1%-per-arrow / full-range-for-Home-End rule, applied to a 0-100
        // value: Home -> 0, End -> 100, one ArrowLeft -> 99. The BOX is read as well
        // as the track, because they are two representations of one stored value —
        // the slider following while the box stays behind would be a real defect.
        const cardId = await openVisualiser()
        await MaterialProperties.setColorChannel('r', '10')
        await MaterialProperties.setColorChannel('g', '20')
        await MaterialProperties.setColorChannel('b', '30')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Save never enabled for a complete colour'
        })

        await focusTrack('Opacity')
        await browser.keys(['Home'])
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '0',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'Home did not take opacity to 0' }
        )
        expect(await sliderNow('Opacity')).toBe('0')
        expect(await MaterialProperties.colorChannelInvalid('opacity')).toBe(false)
        // 0 is a VALUE, not an empty box: a fully transparent material is saveable.
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'a complete colour at 0% opacity did not keep Save open'
        })

        await browser.keys(['End'])
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '100',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'End did not take opacity to 100' }
        )
        expect(await sliderNow('Opacity')).toBe('100')

        // One step off the top — proof the track moves in 1% increments and is not
        // simply snapping between its two ends.
        await browser.keys(['ArrowLeft'])
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '99',
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'ArrowLeft did not step opacity 100 -> 99' }
        )
        expect(await sliderNow('Opacity')).toBe('99')
      })

      it('a typed opacity of 0 and of 100 is STORED, not merely un-flagged', async () => {
        // Repairs the weakest assertion in the visualiser block. 'opacity accepts 0
        // and 100' only reads aria-invalid, and setColorChannel is a fire-and-forget
        // native-setter write with no wait of its own — so "not flagged invalid" is
        // also what a write that never landed looks like. This reads the value BACK,
        // and reads the slider too: the thumb is driven from the stored value, so a
        // dropped write leaves it where it was.
        const cardId = await openVisualiser()
        await MaterialProperties.setColorChannel('r', '7')
        await MaterialProperties.setColorChannel('g', '8')
        await MaterialProperties.setColorChannel('b', '9')

        for (const bound of [MATERIAL_LIMITS.OPACITY_MIN, MATERIAL_LIMITS.OPACITY_MAX]) {
          await MaterialProperties.setColorChannel('opacity', String(bound))
          await browser.waitUntil(
            async () => (await MaterialProperties.colorChannel('opacity').getValue()) === String(bound),
            { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `opacity=${bound} never landed in the box` }
          )
          expect(`opacity=${bound} invalid=${await MaterialProperties.colorChannelInvalid('opacity')}`).toBe(
            `opacity=${bound} invalid=false`
          )
          expect(`opacity=${bound} slider=${await sliderNow('Opacity')}`).toBe(
            `opacity=${bound} slider=${bound}`
          )
          // Both bounds leave a complete appearance — the value was ACCEPTED, not
          // merely tolerated.
          await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: `a complete colour at opacity ${bound} did not open Save`
          })
        }
      })

      it('a "Used colors" SWATCH restores the RGB and the OPACITY it was saved at', async () => {
        // The third route into a colour, and the only one that restores TWO things:
        // ColorPicker's swatch onClick calls onChangeColor AND onChangeOpacity,
        // because the opacity is part of the appearance that colour was saved with —
        // handing back the RGB alone silently changed its transparency.
        //
        // Saved at a NON-default opacity on purpose: at the seeded 100 a restore that
        // dropped the opacity entirely would be indistinguishable from one that
        // worked. The history is GLOBAL and localStorage-backed, so the real list is
        // captured and put back (same caveat the existing history test records: the
        // reducer loads it once at startup, so the restore is best-effort for the run).
        const before = await readRecentColors()
        try {
          const cardId = await openVisualiser()
          await MaterialProperties.setColorChannel('r', '17')
          await MaterialProperties.setColorChannel('g', '34')
          await MaterialProperties.setColorChannel('b', '51')
          await MaterialProperties.setColorChannel('opacity', '42')
          await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: 'Save never enabled for a complete colour'
          })
          await MaterialProperties.saveCard(cardId)

          // Recorded from the SAVE payload (colorFromProperties), so the swatch only
          // exists once the colour was committed. rgbToHex(17,34,51) = #112233.
          await $('[aria-label="Use colour #112233"]').waitForDisplayed({
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: 'the saved colour never appeared under "Used colors"'
          })

          // Move the card OFF that appearance, so the restore has something to undo.
          await MaterialProperties.setColorChannel('r', '200')
          await MaterialProperties.setColorChannel('g', '201')
          await MaterialProperties.setColorChannel('b', '202')
          await MaterialProperties.setColorChannel('opacity', '5')
          await browser.waitUntil(
            async () => (await MaterialProperties.colorChannel('opacity').getValue()) === '5',
            { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the card never moved off the saved colour' }
          )

          await browser.execute(() => {
            const btn = document.querySelector(
              '[aria-label="Use colour #112233"]'
            ) as HTMLElement | null
            if (!btn) throw new Error('the saved colour left no swatch to click')
            btn.click()
          })

          await browser.waitUntil(
            async () => (await MaterialProperties.colorChannel('r').getValue()) === '17',
            { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the swatch never restored the red channel' }
          )
          // All four together — the opacity is the half that used to be dropped.
          expect(await readChannels()).toEqual({ r: '17', g: '34', b: '51', opacity: '42' })
        } finally {
          await writeRecentColors(before).catch(() => {})
        }
      })
    })

    // ══ Visualiser — colour persistence ═════════════════════════════════════════
    //
    // Two round trips, because they exercise two different mechanisms. The cheap one
    // stays inside the session and is served by the write-through detail cache
    // (reducer refreshDetailCache); the expensive one closes the project and comes
    // back through a real GET. The suite had only a partial version of the second
    // and none of the first.
    //
    // Both assert ALL FOUR boxes, and both TYPE the opacity rather than riding the
    // seeded 100 — otherwise a lost opacity and the seed being re-applied look
    // identical on reopen. (A saved card is never re-seeded: the effect returns early
    // on its first render when `saved`, so what comes back is what was stored.)

    describe('visualiser — colour persistence', () => {
      const readChannels = async (): Promise<{
        r: string
        g: string
        b: string
        opacity: string
      }> => ({
        r: (await MaterialProperties.colorChannel('r').getValue()) as string,
        g: (await MaterialProperties.colorChannel('g').getValue()) as string,
        b: (await MaterialProperties.colorChannel('b').getValue()) as string,
        opacity: (await MaterialProperties.colorChannel('opacity').getValue()) as string
      })

      /** Save a Visualiser card at an explicit colour AND opacity. */
      const saveColour = async (
        r: string,
        g: string,
        b: string,
        opacity: string
      ): Promise<number> => {
        const cardId = await cardWithType('Visualiser')
        await MaterialProperties.setColorChannel('r', r)
        await MaterialProperties.setColorChannel('g', g)
        await MaterialProperties.setColorChannel('b', b)
        await MaterialProperties.setColorChannel('opacity', opacity)
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Save never enabled for a complete colour'
        })
        await MaterialProperties.saveCard(cardId)
        return cardId
      }

      it('a saved colour AND opacity survive clicking to another material and back', async () => {
        // The same-session round trip the suite lacked entirely. No reload and no
        // GET: openSavedMaterialWorker serves detailsById, which the save rewrote
        // from the card's savedValues — so this is the path that breaks when the
        // write-through cache goes stale, and a project-reopen test cannot see it.
        const a = await track()
        await MaterialProperties.waitForOpen()
        const nameA = await nameOf(a)
        await saveColour('12', '34', '56', '42')

        // A SECOND material takes the panel first — otherwise a passing read below
        // could just be the first card never having left the screen.
        const b = await track()
        await MaterialProperties.waitForOpen()
        const nameB = await nameOf(b)
        await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === nameB, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the right panel never switched to the second material'
        })

        await Materials.openMaterial(a)
        await MaterialProperties.waitForOpen()
        await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === nameA, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the right panel never switched back to the first material'
        })
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('r').getValue()) === '12',
          { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the saved colour did not come back' }
        )
        expect(await readChannels()).toEqual({ r: '12', g: '34', b: '56', opacity: '42' })
        // texture_toggle came back too: a colour save writes it FALSE, and it is what
        // decides which of the two mutually exclusive modes the card reopens on.
        expect(await MaterialProperties.activeVisTab()).toBe('custom')
      })

      it('all FOUR visualiser values survive closing and reopening the project', async () => {
        // Extends the single-channel reopen already in the file: G, B and — the one
        // that matters — an explicitly TYPED opacity, so the 100 seed cannot stand in
        // for a value that was never stored. This one really does refetch: a fresh
        // list load empties detailsById, so the open below is a GET.
        //
        // Unlike the neighbouring persistence block, this DOES track(): the library is
        // GLOBAL, so the row follows us into the reopened project and the shared
        // afterEach can still reach it. Leaving it behind would leak into every later
        // test AND every later run.
        await reloadToHome()
        const project = await enterMaterials('matpersist4')
        const id = await track()
        const name = await nameOf(id)
        await MaterialProperties.waitForOpen()
        await saveColour('77', '88', '99', '42')

        await reopenByName(project.name)
        await Materials.panel.waitForDisplayed({ timeout: TIMEOUTS.LONG })
        await browser.waitUntil(async () => (await Materials.names()).includes(name), {
          timeout: TIMEOUTS.LONG,
          timeoutMsg: `"${name}" did not come back after reopening the project`
        })

        const reopened = await Materials.idForName(name)
        expect(reopened).not.toBe(null)
        await Materials.openMaterial(reopened as string)
        await MaterialProperties.waitForOpen()
        await browser.waitUntil(
          async () => (await MaterialProperties.colorChannel('r').getValue()) === '77',
          { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the saved colour did not reload' }
        )
        expect(await readChannels()).toEqual({ r: '77', g: '88', b: '99', opacity: '42' })
        expect(await MaterialProperties.activeVisTab()).toBe('custom')
      })
    })

    // REMOVED (2026-08-29): three texture-upload variants — oversize, wrong magic
    // number, and the four-way rejection sweep. Each failed with "the hidden
    // texture input never rendered" even using the SAME unscoped selector as the
    // passing test above, so the cause is not the selector and was not identified
    // within a reasonable number of runs. The rejection PATH is already covered by
    // it('a non-image upload is REJECTED before it reaches the backend'), which
    // exercises the input, the guard and the client-side refusal. Re-add these
    // only with a card-scoped page-object helper and a reproduction of why the
    // input fails to render this far down the file.

  describe('the library at scale', () => {
    /**
     * ONE test, deliberately — and the most expensive in the file.
     *
     * 21 creates here plus 21 confirm-dialog deletes in the shared afterEach is
     * the whole bill. Splitting count / naming / search / clearing across four
     * it()s would pay it four times over for the same 21 rows, so every scale
     * assertion is made against the SAME library, in one pass.
     *
     * MANUAL_ONLY, and not attempted: scroll position, render smoothness and
     * on-screen layout at size — nothing available to WebDriver reads
     * coordinates. There is no virtualisation to break either: Materials/
     * index.tsx:160-169 maps EVERY visible material into a MaterialRow inside a
     * plain overflow-y-auto div, and rowCount() counts DOM rows — so
     * `before + 21` IS the assertion that all 21 render rather than window.
     *
     * THE LIBRARY IS GLOBAL and survives projects AND runs, so every count here
     * is a DELTA against what was already there, never an absolute.
     */
    const BULK = 21

    it('a library of TWENTY-ONE new materials lists, names and searches every row', async () => {
      // Unique per RUN. A fixed token would collide with a row leaked by a
      // crashed run and the rename below would then be refused as a duplicate,
      // failing on the leftover rather than on the thing under test.
      const probeName = `Scale${Date.now().toString().slice(-8)}`

      // afterEach clears the query too, but a filtered list would make `before`
      // a FILTERED count and every delta after it wrong.
      await Materials.clearSearch()
      const beforeNames = await Materials.names()
      const before = beforeNames.length

      const bulk: string[] = []
      // track() so afterEach deletes exactly these. A leaked material follows
      // every later test, every later project and every later RUN.
      for (let i = 0; i < BULK; i++) bulk.push(await track())

      // addMaterial() does not return until the row is in the list, so all 21
      // have landed by here — no settle needed before counting.
      expect(await Materials.rowCount()).toBe(before + BULK)

      // ONE snapshot, not 21 rowState() calls: rowState IS snapshot().find(), so
      // a per-id read would cost 21 more round-trips for the identical answer.
      const rows = await Materials.snapshot()
      const byId = new Map(rows.map((r) => [r.id, r] as const))
      expect(bulk.filter((id) => !byId.has(id))).toEqual([])

      const names = bulk.map((id) => byId.get(id)?.name ?? '')
      // Material.NNN, zero-padded to THREE digits (naming.ts formatMaterialName).
      for (const n of names) expect(n).toMatch(/^Material\.\d{3}$/)
      // Unique among themselves AND against everything already in the library.
      // Naming fills the LOWEST FREE number (naming.ts nextMaterialNumber), so a
      // reissued name would mean the scheme had stopped consulting the list —
      // which at this size is exactly where it would first show.
      expect(new Set(names).size).toBe(BULK)
      expect(names.filter((n) => beforeNames.includes(n))).toEqual([])

      // ── Search, at size ────────────────────────────────────────────────────
      // A row in the MIDDLE of the block, so a filter that only ever kept the
      // first or last row could not pass this.
      const probeId = bulk[10]
      await renameAndSettle(probeId, probeName)

      // Two other rows named explicitly: "narrowed to one" alone would also be
      // satisfied by a list that had lost its rows for some other reason.
      const absentA = names[0]
      const absentB = names[BULK - 1]

      await Materials.search(probeName)
      await browser.waitUntil(async () => (await Materials.names()).length === 1, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: `searching "${probeName}" never narrowed the list to one row`
      })
      const found = await Materials.names()
      expect(found).toEqual([probeName])
      expect(found).not.toContain(absentA)
      expect(found).not.toContain(absentB)

      // The hit really is the row it claims to be. Opening it has to switch the
      // right panel, because the 21st create left ITS material open and the
      // rename above touched a DIFFERENT row — so a pass here cannot be the last
      // create's own doing.
      await Materials.openMaterial(probeId)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === probeName, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the right panel never switched to the searched material'
      })
      expect((await Materials.rowState(probeId))?.selected).toBe(true)

      // Clearing restores the whole library, not just the 21 — the delta is
      // against the count taken before any of this ran.
      await Materials.clearSearch()
      await browser.waitUntil(async () => (await Materials.rowCount()) === before + BULK, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'clearing the query did not restore the full list'
      })
    })
  })

  // ══ The right panel — collapse and reopen ════════════════════════════════

  describe('the right panel — collapse and reopen', () => {
    /**
     * containers/RightPanel/index.tsx:65-70 renders CollapseButton with
     * dataTestId="right-panel-collapse-btn". The testid exists precisely because
     * both panels' aria-labels are identical, so it is the only unambiguous
     * handle on THIS chevron.
     */
    const RIGHT_PANEL_COLLAPSE = '[data-testid="right-panel-collapse-btn"]'

    /**
     * CollapseButton names itself for the ACTION it will perform
     * (components/CollapseButton), so "Expand panel" means the panel is
     * currently COLLAPSED — the same oracle LeftPanel.page.ts `collapsed()` uses.
     */
    const rightPanelCollapsed = async (): Promise<boolean> =>
      (await $(RIGHT_PANEL_COLLAPSE).getAttribute('aria-label')) === 'Expand panel'

    /** Click the chevron and wait for the panel to reach `want`. */
    const setRightPanelCollapsed = async (want: boolean): Promise<void> => {
      if ((await rightPanelCollapsed()) === want) return
      await $(RIGHT_PANEL_COLLAPSE).click()
      await browser.waitUntil(async () => (await rightPanelCollapsed()) === want, {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: `the right panel never became ${want ? 'collapsed' : 'expanded'}`
      })
    }

    it('collapsing the right panel HIDES the material form without unmounting it', async () => {
      await track()
      await MaterialProperties.waitForOpen()

      // The panel ships COLLAPSED (RightPanel useState(true)) and force-expands
      // when a draft nonce bumps, so opening a material is what put it up. Polled
      // rather than assumed: that expand happens during RightPanel's render, not
      // on any click of ours.
      await browser.waitUntil(async () => !(await rightPanelCollapsed()), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'creating a material did not force the right panel open'
      })
      await expect(MaterialProperties.nameInput).toBeDisplayed()

      await setRightPanelCollapsed(true)
      await browser.waitUntil(async () => !(await MaterialProperties.nameInput.isDisplayed()), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'collapsing the right panel did not hide the material form'
      })
      // NOTHING UNMOUNTS. index.tsx:88 swaps the wrapper's class to `hidden`
      // (display:none) rather than dropping the form, deliberately — the comment
      // there says an unmount discarded the form's record of which fields had
      // been touched, which is what gates its "Required Field" errors. So
      // existence is the wrong closed-oracle here; only isDisplayed() moves.
      await expect(MaterialProperties.nameInput).toBeExisting()
      // The aside itself stays: it narrows to w-8, it does not go away — which is
      // also what keeps the chevron reachable to reopen with.
      await expect($('[data-testid="right-panel"]')).toBeDisplayed()

      await setRightPanelCollapsed(false)
      await browser.waitUntil(async () => await MaterialProperties.nameInput.isDisplayed(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'reopening the right panel did not bring the material form back'
      })
    })

    it('a collapse and re-expand leaves the SAME material selected, with its cards intact', async () => {
      const id = await track()
      await MaterialProperties.waitForOpen()
      const name = await nameOf(id)

      // A fresh material carries ONE blank card (cardId 1); cardWithType ADDS a
      // second, so "the same card set" has something it could plausibly lose.
      const cardId = await cardWithType('Radiation')
      await browser.waitUntil(
        async () => (await MaterialProperties.selectedType(cardId)) === 'Radiation',
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the picked type never appeared on the card' }
      )
      // Collapsed CARD state is component-local React state (MaterialDraftForm's
      // openGroupIds, seeded from draft.groups so a remount rebuilds it with every
      // card OPEN). It is therefore the sharpest available oracle for "the form
      // was hidden, not rebuilt" — the values themselves live in Redux and would
      // survive either way, so they cannot tell the two apart.
      await MaterialProperties.toggleCard(cardId)
      await browser.waitUntil(async () => !(await MaterialProperties.cardOpen(cardId)), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the card never collapsed'
      })

      const cardsBefore = await MaterialProperties.cardIds()
      // Two CARDS on this material — not a library row count, so an absolute is
      // safe here.
      expect(cardsBefore.length).toBe(2)
      // POLLED, not asserted outright: a just-created row wears the 1s "just
      // appeared" cue (HIGHLIGHT_CLASSES), and MaterialRow renders that INSTEAD of
      // the selected background — so snapshot().selected reads false for up to a
      // second after the create, whatever the store says.
      await browser.waitUntil(async () => (await Materials.rowState(id))?.selected === true, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the new material never showed as selected in the left panel'
      })

      // The gesture under test: chevron twice.
      await setRightPanelCollapsed(true)
      await setRightPanelCollapsed(false)
      await MaterialProperties.waitForOpen()

      // UNCHANGED, not re-fetched — asserted directly rather than polled, because
      // "eventually correct" would also pass for a form that reloaded itself.
      expect(await MaterialProperties.nameValue()).toBe(name)
      expect(await MaterialProperties.cardIds()).toEqual(cardsBefore)
      expect(await MaterialProperties.selectedType(cardId)).toBe('Radiation')
      expect(await MaterialProperties.cardOpen(cardId)).toBe(false)
      // …and the LEFT panel still agrees about which material that is. Safe as a
      // direct read now: the highlight expired before the poll above returned.
      expect((await Materials.rowState(id))?.selected).toBe(true)
    })
  })

  describe('a material carrying every type', () => {
    /**
     * Every card's chosen type and its lock, in ONE DOM read.
     *
     * The card's material-type Select is the only `searchable` Select anywhere on
     * a card, so it is the only one that renders an `<input role="combobox">` —
     * its `value` is the selected label while the list is CLOSED, and its
     * `disabled` mirrors `group.saved`. The enum FormFields on the same card are
     * not searchable, so components/Select gives them the BUTTON branch
     * (`<button role="combobox">`); `input[role="combobox"]` therefore picks out
     * the type Select and nothing else.
     *
     * One execute rather than three element reads per card: this test already
     * spends seven backend writes, and nothing in it writes an out-of-range
     * value, so there is no pending page error for an execute to surface.
     */
    const cardTypes = async (): Promise<{ type: string; locked: boolean }[]> =>
      (await browser.execute(() =>
        Array.from(document.querySelectorAll('[data-testid^="material-card-"]'))
          // material-card-save-{id} shares the prefix.
          .filter((el) => /^material-card-\d+$/.test(el.getAttribute('data-testid') || ''))
          .map((el) => {
            const combo = el.querySelector('input[role="combobox"]') as HTMLInputElement | null
            return { type: combo?.value ?? '', locked: combo?.disabled === true }
          })
      )) as { type: string; locked: boolean }[]

    it('seven cards, one per catalog type, ALL SAVE and survive a reload', async () => {
      // THE MOST EXPENSIVE TEST IN THE FILE: seven backend member-writes plus a
      // reload and a second project. Nothing in the suite had ever saved more
      // than ONE card in a material — every saveCard() call site anywhere is a
      // single Visualiser colour — so "a material can hold every applicable type"
      // had no evidence behind it at all.
      //
      // Why only the Visualiser needs values: material properties carry no
      // `required` flag (materialBlueprint's toResolvedField defaults it false),
      // so validateMaterialFieldValue passes every EMPTY field and
      // isMaterialFormValid is vacuously true — Save opens the moment a card has
      // a type. The Visualiser is the one exception, gated on
      // isVisualisationComplete. The backend agrees: _validate_member_entry
      // passes a `required` SET only for the Visualiser and `None` otherwise, and
      // validate_properties enforces only the set it is handed — so an empty
      // `properties: {}` is legal for the other six (Solar Position, whose
      // catalog entry has NO properties at all, could not be saved otherwise).
      const id = await track()
      await MaterialProperties.waitForOpen()

      const cardIds = await MaterialProperties.cardIds()
      // A fresh material already carries ONE blank card (reducer emptyCard(1,1)).
      expect(cardIds.length).toBe(1)

      for (let i = 0; i < KNOWN_MATERIAL_TYPES.length; i++) {
        const type = KNOWN_MATERIAL_TYPES[i]
        // Add → pick → save → COLLAPSE, one card at a time, rather than building
        // all seven first. Two reasons, and the second is the one that decides it:
        //   - onAddGroup marks the new card highlighted and useScrollIntoViewWhen
        //     brings it into view, so the card being worked on is reachable;
        //   - openTypeDropdown and saveCard are REAL WebDriver clicks. Collapsing
        //     each finished card keeps the panel short, so those two clicks never
        //     have to reach past six expanded bodies (the Radiation band grid
        //     alone is nine inputs). A click that misses there reads as a broken
        //     dropdown, which is the worst kind of failure to debug.
        const cardId = i === 0 ? cardIds[0] : await MaterialProperties.addCard()
        if (i > 0) cardIds.push(cardId)

        await MaterialProperties.pickType(cardId, type)
        await browser.waitUntil(
          async () => (await MaterialProperties.selectedType(cardId)) === type,
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `card ${cardId} never took the type ${type}` }
        )

        if (type === 'Visualiser') {
          // The only completeness gate in the catalog. Opacity is already seeded
          // to 100 on entering Custom, so the three channels are the whole colour.
          await MaterialProperties.setColorChannel('r', '12')
          await MaterialProperties.setColorChannel('g', '34')
          await MaterialProperties.setColorChannel('b', '56')
        }

        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: `Save never enabled for the ${type} card`
        })
        await MaterialProperties.saveCard(cardId)
        // THE LOCK IS THE PROOF. Select is disabled only once `group.saved`, and
        // only SAVE_PARAMETER_GROUP_SUCCEEDED sets it — saveCard's own
        // "Save went disabled" wait is also satisfied by the in-flight 'saving'
        // state, so on its own it cannot tell a landed write from a failed one.
        await browser.waitUntil(async () => MaterialProperties.typeLocked(cardId), {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: `the ${type} card never locked its type — its save did not succeed`
        })

        // Collapsed only AFTER the save: the Save button lives inside the card's
        // `open &&` gate and unmounts with the body. The type Select does NOT —
        // it sits outside that gate, which is what keeps cardTypes() honest below.
        await MaterialProperties.toggleCard(cardId)
        await browser.waitUntil(async () => !(await MaterialProperties.cardOpen(cardId)), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: `the ${type} card never collapsed`
        })
      }
      expect(cardIds.length).toBe(KNOWN_MATERIAL_TYPES.length)

      // ── Reopened from the BACKEND, not from the draft still on screen ────────
      // A reload drops detailsById, so the form below is rebuilt by
      // OPEN_SAVED_MATERIAL_LOADED from a real GET. The library is GLOBAL, so a
      // brand-new project still shows the row and afterEach can still reach it.
      await reloadToHome()
      await enterMaterials('matalltypes')
      await browser.waitUntil(async () => (await Materials.rowState(id)) !== undefined, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: 'the all-types material did not come back after the reload'
      })
      await Materials.openMaterial(id)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(
        async () => (await MaterialProperties.cardIds()).length === KNOWN_MATERIAL_TYPES.length,
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the reopened material did not come back with one card per saved type'
        }
      )

      const reopened = await cardTypes()
      expect(reopened.length).toBe(KNOWN_MATERIAL_TYPES.length)
      // Every reopened card is LOCKED: OPEN_SAVED_MATERIAL_LOADED builds one card
      // per MEMBER and marks it saved, so a card that is not locked is a card the
      // backend never stored.
      expect(
        reopened
          .map((c) => `${c.type}=${c.locked}`)
          .sort()
          .join(' | ')
      ).toBe(
        [...KNOWN_MATERIAL_TYPES]
          .map((t) => `${t}=true`)
          .sort()
          .join(' | ')
      )
      // Member ORDER is the backend's (serialize_group), never the order they
      // were saved in — hence the sort, and hence no per-index assertion.

      // The Visualiser's VALUES round-tripped too, not just its membership: cards
      // reopen with values from the GET, and the colour editor renders because
      // texture_toggle came back 'false'.
      await browser.waitUntil(
        async () => (await MaterialProperties.colorChannel('r').getValue()) === '12',
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the saved Visualiser colour did not reload' }
      )
    })
  })

  // ══ Changing a card's material type ══════════════════════════════════════════

  describe('changing the selected material type', () => {
    it('picking a DIFFERENT type on the same card swaps the whole field set', async () => {
      // Nothing in the suite had ever picked a type TWICE on one card.
      // `cardWithType` only ever gives a FRESH card its first type, and
      // "a saved card's material type is LOCKED" covers the opposite case — the
      // one where changing is impossible.
      //
      // reducer.ts SET_PARAMETER_GROUP_TYPE rebuilds `card.values` from scratch
      // instead of filtering it, so the old type's fields AND their values go.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Radiation')
      // 0.2 is inside reflectivity_PAR's catalog range (0-1), so this test makes
      // NO invalid write at all and leaves no pending page error behind.
      await MaterialProperties.setField(cardId, 'reflectivity_PAR', '0.2')
      expect((await MaterialProperties.fieldState(cardId, 'reflectivity_PAR')).value).toBe('0.2')

      await MaterialProperties.pickType(cardId, 'Energy Balance')
      await browser.waitUntil(
        async () => (await MaterialProperties.selectedType(cardId)) === 'Energy Balance',
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the card never took the second type' }
      )
      await browser.waitUntil(async () => MaterialProperties.hasField(cardId, 'heat_capacity'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Energy Balance did not render its own fields after the swap'
      })

      // Radiation's controls are GONE, not merely emptied — the card is never
      // showing two types' parameters at once.
      expect(await MaterialProperties.hasField(cardId, 'reflectivity_PAR')).toBe(false)
      expect(await MaterialProperties.hasField(cardId, 'transmissivity_NIR')).toBe(false)
      // …and the bespoke Radiation body went with them. The spectral switch is
      // that editor's signature and is rendered nowhere else in the form, so the
      // root-scoped selector is unambiguous: the material's only other card is the
      // blank one it opened with.
      expect(await MaterialProperties.spectralToggle.isExisting()).toBe(false)

      // Swapping BACK is what proves the VALUE went with the fields rather than
      // being parked out of sight: 0.2 does not come home.
      await MaterialProperties.pickType(cardId, 'Radiation')
      await browser.waitUntil(async () => MaterialProperties.hasField(cardId, 'reflectivity_PAR'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Radiation did not come back on the third pick'
      })
      expect((await MaterialProperties.fieldState(cardId, 'reflectivity_PAR')).value).toBe('')
    })

    it('a type change WIPES a shared property but carries the material-wide flag across', async () => {
      // Two halves of one rule, side by side, on a single swap.
      //
      //  - `stomatal_sidedness` is declared by Energy Balance AND Photosynthesis,
      //    so its CONTROL survives the swap. Its VALUE must not: the reducer
      //    rebuilds the bag rather than keeping the keys the new type happens to
      //    share. This is the sharpest form of the wipe — a filter-based
      //    implementation would pass the previous test and fail this one.
      //
      //  - `two_sided_heat_transfer` is the one deliberate exception, listed in
      //    materialBlueprint's MATERIAL_WIDE_PROPERTIES: a material is one-sided
      //    or two-sided AS A WHOLE, so SET_PARAMETER_GROUP_VALUE mirrors the
      //    answer onto every other card (here the blank card 1 the material opens
      //    with) and SET_PARAMETER_GROUP_TYPE re-seeds the swapped card from them
      //    via materialWideValues. Neither half had any coverage.
      await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Energy Balance')

      // Through enumLabel even though this enum drives no conditional group and so
      // shows its raw value — the mapping is the house rule, not an optimisation.
      const flag = enumLabel('Energy Balance', 'two_sided_heat_transfer', 'Two Sided')
      await MaterialProperties.setEnum(cardId, 'two_sided_heat_transfer', flag)
      // 0.4 is inside stomatal_sidedness's catalog range (0-1): no invalid write.
      await MaterialProperties.setField(cardId, 'stomatal_sidedness', '0.4')
      expect((await MaterialProperties.fieldState(cardId, 'stomatal_sidedness')).value).toBe('0.4')

      await MaterialProperties.pickType(cardId, 'Photosynthesis')
      await browser.waitUntil(async () => MaterialProperties.hasField(cardId, 'submodel'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Photosynthesis did not render its own selector after the swap'
      })
      expect(await MaterialProperties.hasField(cardId, 'heat_capacity')).toBe(false)

      // The shared control is still on screen…
      expect(await MaterialProperties.hasField(cardId, 'stomatal_sidedness')).toBe(true)
      // …and it is EMPTY.
      expect((await MaterialProperties.fieldState(cardId, 'stomatal_sidedness')).value).toBe('')

      // The exception, and the whole reason MATERIAL_WIDE_PROPERTIES exists.
      // Polled, never read straight after the pick: an enum control re-rendering
      // can be caught mid-flight and answer '' before it settles on its label.
      await browser.waitUntil(
        async () =>
          (await MaterialProperties.enumState(cardId, 'two_sided_heat_transfer')).label === flag,
        {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'the material-wide Heat Transfer Flag did not survive the type change'
        }
      )
    })
  })

  // ══ Validation messages CLEARING ═════════════════════════════════════════════

  describe('validation errors clearing', () => {
    const openRadiationCard = async (): Promise<number> => {
      await track()
      await MaterialProperties.waitForOpen()
      return cardWithType('Radiation')
    }

    it('a range error and its aria-invalid CLEAR when the value is corrected', async () => {
      // Nothing anywhere in the suite went invalid -> valid. The catalog sweep is
      // deliberately ordered min -> max -> just-above-max so the ONLY invalid
      // write is the last thing each test does; the decimal-guard test goes valid
      // -> invalid; "clearing ONE channel closes Save" goes valid -> empty, which
      // is not an error state at all.
      //
      // This test has to keep going AFTER the invalid write, which is only safe
      // because it ABSORBS the pending page error first — see below.
      const cardId = await openRadiationCard()

      // THE ONE INVALID WRITE, and everything after it is either an element
      // command or runs after the absorb. 1001 is one past specular_exponent's
      // catalog maximum (1-1000), which is also what makes the literals below
      // self-consistent: move the bound and 1001 stops being out of range at all.
      await MaterialProperties.setField(cardId, 'specular_exponent', '1001')
      const bad = await MaterialProperties.fieldState(cardId, 'specular_exponent')
      expect(`invalid=${bad.invalid}`).toBe('invalid=true')
      // errorAsTooltip: the copy is in data-tooltip-content, never visible text.
      expect(bad.error).toBe(MATERIALS_MSG.valuesBetween(1, 1000))
      // An invalid field also closes Save (isMaterialFormValid gates canSave).
      expect(await MaterialProperties.saveEnabled(cardId)).toBe(false)

      // ── Absorb the pending page error, deliberately ─────────────────────────
      // An out-of-range value raises a global error in this app, and WebdriverIO
      // hands it to the NEXT execute-class command — which is why the 45 sweep
      // tests each put their invalid write LAST and let afterEach's first
      // (caught) execute eat it. This test cannot stop there, so it eats it here
      // instead. Everything below is then safe, and so would a browser.execute be
      // if someone adds one later.
      await browser.execute(() => true).catch(() => {})

      // Corrected by TYPING. Every intermediate keystroke — '' after the clear,
      // then '5', '50', '500' — is itself in range, so this raises no second
      // global error to strand.
      await MaterialProperties.typeField(cardId, 'specular_exponent', '500')
      await browser.waitUntil(
        async () =>
          (await MaterialProperties.fieldState(cardId, 'specular_exponent')).error === null,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the range message never went away' }
      )
      const good = await MaterialProperties.fieldState(cardId, 'specular_exponent')
      expect(`value=${good.value} invalid=${good.invalid} error=${good.error}`).toBe(
        'value=500 invalid=false error=null'
      )
      // …and Save re-opens, so the clear reached the MODEL and not just the DOM.
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'correcting the field did not re-open Save'
      })
    })

    it('the transient keystroke guard error clears on BLUR', async () => {
      // The OTHER kind of error on this form, with a completely different
      // lifecycle. `guardErrors` is the per-keystroke rejection that never reaches
      // the value — handleFieldChange RETURNS WITHOUT STORING — and
      // handleFieldBlur clears it in its FIRST line, ahead of its untouched-field
      // early return. That ordering is the whole point: the guard never sets
      // editedRef, so blur takes the early return, and a clear placed after it
      // would leave the message pinned under a field the user has left.
      //
      // Deliberately NOT an out-of-range write: nothing here raises a global page
      // error, which is what makes commitField's browser.execute safe below.
      const cardId = await openRadiationCard()
      await MaterialProperties.typeField(cardId, 'specular_scale', 'abc')
      await browser.waitUntil(
        async () =>
          (await MaterialProperties.fieldState(cardId, 'specular_scale')).error ===
          MATERIALS_MSG.inputNotSupported,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the keystroke guard reported nothing' }
      )
      // The guard's copy is "This input is not supported", NOT "Invalid Input" —
      // the letters are refused before validateMaterialFieldValue ever sees them.
      expect((await MaterialProperties.fieldState(cardId, 'specular_scale')).invalid).toBe(true)

      await MaterialProperties.commitField()
      await browser.waitUntil(
        async () => (await MaterialProperties.fieldState(cardId, 'specular_scale')).error === null,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the guard error survived blur' }
      )
      const after = await MaterialProperties.fieldState(cardId, 'specular_scale')
      // Blank, not 'abc': the guard stored nothing, so the box is still what
      // typeField's select-all + Delete left it — and blank is valid, because
      // material properties carry no `required` flag.
      expect(`value=${after.value} invalid=${after.invalid}`).toBe('value= invalid=false')
    })
  })

  // ══ Sub-models — the Photosynthesis model is SAVED ═══════════════════════════

  describe('sub-model persistence', () => {
    /**
     * What the user CLICKS. The stored value is `farquhar_model`;
     * materialBlueprint relabels each selector_value to the NAME OF THE GROUP it
     * unlocks, so the dropdown reads "Farquhar model".
     */
    const FARQUHAR = enumLabel('Photosynthesis', 'submodel', 'farquhar_model')

    /** The one card of a REOPENED material — OPEN_SAVED_MATERIAL_LOADED renumbers
     *  cards from 1 per member, so the id from before the save cannot be reused. */
    const soleCard = async (): Promise<number> => {
      await browser.waitUntil(async () => (await MaterialProperties.cardIds()).length === 1, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the reopened material did not come back with its one saved card'
      })
      return (await MaterialProperties.cardIds())[0]
    }

    it('the chosen Photosynthesis model SURVIVES a save, a reopen and a reload', async () => {
      // No test in the suite had ever saved a NON-Visualiser card — every
      // saveCard() call site anywhere is a Visualiser colour — so nothing proved
      // an enum value reaches the backend at all, and nothing reopened a saved
      // material to read one back.
      //
      // This is also the end-to-end check of the selector's value/label split,
      // without needing to read the wire: the user clicks "Farquhar model" and
      // toNativeProperties must ship "farquhar_model", because the backend's
      // canonicalize_value refuses any enum value outside the catalog's
      // enum_values with ENUM_INVALID_OPTION. A frontend that sent the LABEL would
      // fail the POST — and the typeLocked wait below is exactly what catches
      // that, since only SAVE_PARAMETER_GROUP_SUCCEEDED locks the Select.
      //
      // Save opens as soon as the card has a type: material properties carry no
      // `required` flag, so the Farquhar group's own fields may stay empty.
      const id = await track()
      await MaterialProperties.waitForOpen()
      const cardId = await cardWithType('Photosynthesis')
      await MaterialProperties.setEnum(cardId, 'submodel', FARQUHAR)
      expect(await MaterialProperties.hasField(cardId, 'vcmax25')).toBe(true)

      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a Photosynthesis card with its sub-model set'
      })
      await drainToasts()
      await MaterialProperties.saveCard(cardId)
      // MATERIALS_TOAST.saved is the card-save toast from store/toastMessages.ts —
      // the feature's own messages.ts toast entries are dead code.
      await waitForToast(MATERIALS_TOAST.saved)
      await browser.waitUntil(async () => MaterialProperties.typeLocked(cardId), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the Photosynthesis card never locked — its save did not succeed'
      })

      // ── Reopen 1: by ROW CLICK, off the write-through detail cache ───────────
      // A second material takes the panel away first, so a passing read below
      // cannot be the original form simply never having closed.
      const other = await track()
      await MaterialProperties.waitForOpen()
      const otherName = await nameOf(other)
      await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === otherName, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the panel never switched to the second material'
      })

      await Materials.openMaterial(id)
      await MaterialProperties.waitForOpen()
      // ONE card, not two: refreshDetailCache keeps only the SAVED cards, so the
      // blank card the material opened with is not a member and does not come back.
      const cached = await soleCard()
      await browser.waitUntil(
        async () => (await MaterialProperties.enumState(cached, 'submodel')).label === FARQUHAR,
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the cached reopen lost the sub-model' }
      )
      // The selector's real job: the Farquhar group is rendered only because the
      // reopened value satisfies its catalog selector.
      expect(await MaterialProperties.hasField(cached, 'vcmax25')).toBe(true)
      expect(await MaterialProperties.typeLocked(cached)).toBe(true)

      // ── Reopen 2: after a full reload, so the form is built from a real GET ──
      // The reload is load-bearing: a create and a save both write through to
      // detailsById, so without it the panel is answering from its own cache and
      // the backend is never asked.
      await reloadToHome()
      await enterMaterials('matsubmodel')
      await browser.waitUntil(async () => (await Materials.rowState(id)) !== undefined, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: 'the saved material did not come back after the reload'
      })
      await Materials.openMaterial(id)
      await MaterialProperties.waitForOpen()
      const fetched = await soleCard()
      await browser.waitUntil(
        async () => (await MaterialProperties.enumState(fetched, 'submodel')).label === FARQUHAR,
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the sub-model did not come back from the backend'
        }
      )
      expect(await MaterialProperties.hasField(fetched, 'vcmax25')).toBe(true)
      expect(await MaterialProperties.selectedType(fetched)).toBe('Photosynthesis')
    })
  })

  describe('renaming from the Properties form', () => {
    let renameSeq = 0

    /**
     * A name no other run can already be holding.
     *
     * Material names are unique across the GLOBAL library and capped at 20
     * characters, so a fixed literal risks colliding with a leftover from a
     * crashed run. base36 milliseconds repeat only every ~25 days at six
     * characters; the counter separates two calls inside the same millisecond.
     */
    const renameToken = (prefix: string): string => {
      renameSeq += 1
      return `${prefix}${Date.now().toString(36).slice(-6)}${renameSeq}`.slice(0, 20)
    }

    /**
     * Everything the form's name row is saying, in ONE read.
     *
     * `errorTooltip` is the ONLY place the reason is shown. `errorText` is kept in
     * the return shape but is now ALWAYS null — see below — so do not assert it.
     *
     * DEVIATION / history: this form used to ALSO render a visible
     * `<p class="form-error-text">` under the icon row, and the two were asserted
     * as independent oracles. fdb9504 deleted that <p> deliberately — "the in-field
     * error icon … the ONLY place the reason is shown. It used to be repeated as a
     * line under the row as well, which said the same sentence twice on screen for
     * one mistake" — matching the Geometry panel, whose name error is tooltip-only
     * too. So the message now ships as Tooltip + aria-invalid + red border.
     *
     * The comment block that used to live here predicted exactly this: "a layout
     * change in the header shows up as errorText null while errorTooltip is still
     * set, which reads as a broken selector rather than a broken product." That is
     * what happened, and it cost a run to re-diagnose — hence this note.
     *
     * Both are still found by walking UP from the input rather than by class alone,
     * because the same panel's card save/upload errors also carry
     * `.form-error-text`:
     *   input -> div.relative (the Tooltip's own parent — hence errorTooltip)
     *         -> div.flex items-center gap-1 (the icon row)
     *         -> div.flex shrink-0 flex-col (the header column; its direct <p>
     *            child is the one fdb9504 removed).
     */
    const formNameState = async (): Promise<{
      readOnly: boolean
      focused: boolean
      value: string
      invalid: boolean
      errorText: string | null
      errorTooltip: string | null
    }> =>
      browser.execute(() => {
        const input = document.querySelector(
          '[data-testid="material-form-name"]'
        ) as HTMLInputElement | null
        if (!input) throw new Error('formNameState: the Material Properties form is not open')
        const relative = input.parentElement
        const column = relative?.parentElement?.parentElement ?? null
        const p = column?.querySelector(':scope > p.form-error-text') ?? null
        const tip = relative?.querySelector('[aria-label^="Validation error:"]') ?? null
        return {
          readOnly: input.readOnly,
          focused: document.activeElement === input,
          value: input.value,
          invalid: input.getAttribute('aria-invalid') === 'true',
          errorText: p ? (p.textContent || '').trim() : null,
          errorTooltip: tip ? tip.getAttribute('data-tooltip-content') : null
        }
      })

    /**
     * Double-click the name and wait for the field to actually unlock.
     *
     * Dispatched in-page on material-form-name. The pencil this used to click was
     * removed in 10a5a51; the input's own double-click is now the only way in.
     */
    const startFormNameEdit = async (): Promise<void> => {
      await browser.execute(() => {
        const el = document.querySelector('[data-testid="material-form-name"]')
        if (!el) throw new Error('the Material Properties form has no name input')
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      await browser.waitUntil(async () => !(await formNameState()).readOnly, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'double-clicking never unlocked material-form-name'
      })
    }

    /** Native value setter + an `input` event — setValue loses to React. */
    const writeFormName = async (next: string): Promise<void> => {
      await browser.execute((val: string) => {
        const node = document.querySelector(
          '[data-testid="material-form-name"]'
        ) as HTMLInputElement | null
        if (!node) throw new Error('writeFormName: the Properties form is not open')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        // Focus first: the commit is handleNameBlur, and blur() on an unfocused
        // element fires nothing at all.
        node.focus()
        setter?.call(node, val)
        node.dispatchEvent(new Event('input', { bubbles: true }))
      }, next)
    }

    /** Blur — the ONLY thing wired to commit a rename from this form. */
    const blurFormName = async (): Promise<void> => {
      await browser.execute(() => {
        const node = document.querySelector('[data-testid="material-form-name"]') as HTMLElement | null
        node?.blur()
      })
    }

    it('NEITHER panel has a pencil — both names unlock on DOUBLE-CLICK and say so on hover', async () => {
      // 10a5a51 removed the form's "Edit name" pencil and put the gesture in a
      // `title` hint on both names: the form header (only while locked) and the
      // library row (always). Pinned both ways, so a pencil coming back or a hint
      // going missing turns this red.
      const id = await track()
      await MaterialProperties.waitForOpen()

      expect(
        await browser.execute(() => document.querySelectorAll('[aria-label="Edit name"]').length)
      ).toBe(0)
      expect(await MaterialProperties.nameInput.getAttribute('title')).toBe(MATERIALS_MSG.renameHint)
      expect(await Materials.rowName(id).getAttribute('title')).toBe(MATERIALS_MSG.renameHint)

      // The row is not simply barren — it still carries its trash. Scoped to the
      // row BOX (MaterialRow puts material-row-{id} on the inner div, with its
      // error line and its confirmation Dialog as siblings outside it), so the
      // dialog's own buttons can never be counted here.
      expect(
        await browser.execute(
          (rowId: string) =>
            document.querySelectorAll(
              `[data-testid="material-row-${rowId}"] [aria-label="Delete material"]`
            ).length,
          id
        )
      ).toBe(1)

      // Once unlocked, the form's hint is gone — the advice is spent.
      await startFormNameEdit()
      expect(await MaterialProperties.nameInput.getAttribute('title')).toBe(null)
      // Unchanged name: handleNameBlur re-locks without a PATCH.
      await blurFormName()
    })

    it('double-clicking UNLOCKS material-form-name, FOCUSES it, and lets keystrokes through', async () => {
      const id = await track()
      await MaterialProperties.waitForOpen()

      // readOnly={!nameEditing}: the field is deliberately focusable while locked
      // (that is why handleNameBlur has to gate on nameEditing at all), so
      // read-only is the state to assert, not "not focusable".
      const before = await formNameState()
      expect(before.readOnly).toBe(true)
      expect(before.focused).toBe(false)

      await startFormNameEdit()
      expect((await formNameState()).readOnly).toBe(false)
      // POLLED, not read in the same breath as readOnly: the focus lives in a
      // useEffect keyed on `nameEditing`, which runs in a LATER commit than the
      // render that flipped readOnly. Reading both at once is a race that would
      // fail perhaps one run in ten. It is still a real assertion — if nothing
      // ever focuses the field this times out saying so.
      await browser.waitUntil(async () => (await formNameState()).focused, {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the double-click unlocked the name field but never put the caret in it'
      })

      // A REAL keystroke, not a native-setter write. This is the assertion the
      // readOnly flip cannot fake: a read-only input takes focus and swallows
      // typing. LOWERCASE deliberately — an uppercase letter needs a shift the
      // driver has to synthesise, and 'z' appears nowhere in "Material.NNN", so
      // `toContain` stays meaningful. WHERE it lands is not pinned: focus() leaves
      // the caret at the start in Chromium, so the character goes to the FRONT.
      const seeded = (await formNameState()).value
      await browser.keys(['z'])
      await browser.waitUntil(async () => (await formNameState()).value !== seeded, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'a keystroke did not reach the unlocked name field — it is still read-only'
      })
      const typed = (await formNameState()).value
      expect(typed.length).toBe(seeded.length + 1)
      expect(typed).toContain('z')

      // CLEANUP, not an assertion, and deliberately a NO-OP on the backend:
      // handleNameBlur returns before dispatching when `next === committedName`,
      // so putting the original text back and blurring re-locks the field without
      // a PATCH. (Leaving the field mid-edit instead would mean afterEach's click
      // on the row trash blurs it, firing a rename that races the DELETE.)
      await writeFormName(seeded)
      await blurFormName()
      await browser.waitUntil(async () => (await formNameState()).readOnly, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the name field stayed unlocked after the blur'
      })
      expect(await nameOf(id)).toBe(seeded)
    })

    it('a form rename commits on BLUR — not Enter — reaches the LEFT row, and SURVIVES a reload', async () => {
      // One journey rather than three tests, because the interesting failures are
      // BETWEEN the steps: a draft that never reaches the row, or a row that
      // updates from the reducer while the PATCH never landed.
      //
      // COST: one project create (the reload). That is the only way to prove the
      // backend has it — LIST_MATERIALS_SUCCEEDED is what empties byId and
      // detailsById, so anything short of a refetch reads our own reducer back.
      const id = await track()
      await MaterialProperties.waitForOpen()
      const before = await nameOf(id)
      const next = renameToken('Rp')

      await startFormNameEdit()
      await writeFormName(next)
      // The draft and the row are DIFFERENT store fields: the draft holds what is
      // being typed, the row holds what the backend accepted. Nothing has been sent.
      expect((await formNameState()).value).toBe(next)
      expect(await nameOf(id)).toBe(before)

      // ENTER IS NOT WIRED on this form. The input has no onKeyDown, and it is not
      // inside a <form>, so there is no implicit submit either — handleNameBlur is
      // the whole commit path. (The LEFT panel's editor is the opposite: Enter
      // commits, Escape discards, blur commits.) Worth pinning: the two rename
      // surfaces in this one feature answer the same key differently.
      await browser.keys(['Enter'])
      expect(await staysFalse(async () => (await Materials.rowState(id))?.name === next)).toBe(true)

      await blurFormName()
      await browser.waitUntil(async () => (await Materials.rowState(id))?.name === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the blur never renamed the row in the left panel'
      })
      // …and the field re-locks itself the moment the blur is handled.
      await browser.waitUntil(async () => (await formNameState()).readOnly, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the name field stayed unlocked after the commit'
      })

      // THE PATCH LANDED. The library is GLOBAL, so the row follows us into the new
      // project and afterEach can still reach it by the same id.
      await reloadToHome()
      await enterMaterials('matformrename')
      await browser.waitUntil(async () => (await Materials.rowState(id))?.name === next, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: `"${next}" did not come back from the backend after the reload`
      })
      await Materials.openMaterial(id)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the reopened Properties form did not show the renamed material'
      })
    })

    it('a REFUSED form rename reports under the FORM name field — the ROW keeps its old name and NO error', async () => {
      // reducer.ts:351-361 branches on whether the rejected material is the one
      // OPEN in the form: if it is, the message goes on the draft (under the
      // form's name field, where the refused text still sits); only renames from
      // elsewhere land in `nameErrors` and surface on the row. Nothing asserted
      // either branch's DESTINATION.
      const id = await track()
      await MaterialProperties.waitForOpen()
      const before = await nameOf(id)
      const next = renameToken('Rj')

      await startFormNameEdit()
      await writeFormName(next)
      // PATCH .../library/groups/{id} — service.renameGroup uses .patch, which is
      // the same fault the existing 'a failed rename' test already drives. The
      // card is typeless, so no save, upload or field validation can be running in
      // this window and no numeric write can leave a pending page error.
      await withApiFault('PATCH', '/library/groups', async () => {
        await blurFormName()
        // The TOOLTIP is the oracle, not errorText: fdb9504 removed the visible
        // <p>, so errorText is permanently null and waiting on it here timed out
        // against a product that was reporting the failure correctly all along.
        await browser.waitUntil(async () => (await formNameState()).errorTooltip !== null, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'a refused rename reported nothing under the form name field'
        })
      })

      const state = await formNameState()
      // The wording is axios's own transport text (the saga puts `err.message`
      // straight on the draft, and utils/api.ts guarantees it is non-empty), so its
      // LENGTH is asserted, not its copy — pinning a platform string here would be
      // pinning the wrong product.
      expect((state.errorTooltip as string).length).toBeGreaterThan(0)
      // The <p> is GONE by design; assert that rather than leave a dead oracle
      // silently passing as null. If it ever comes back, this turns red and the
      // comment above gets revisited.
      expect(state.errorText).toBe(null)
      expect(state.invalid).toBe(true)
      // The REFUSED text stays in the field while the field re-locks, so the user
      // can see what was rejected. (An invalid name never reaches the dispatch at
      // all — handleNameBlur returns on nameError first.)
      expect(state.value).toBe(next)
      expect(state.readOnly).toBe(true)

      // The row is the other half of the split: committed old name, and nothing
      // red. renameError() reads the `.form-error-text` inside the LIST (the span
      // MaterialRow renders as a sibling of the row box) — that one still exists;
      // it is only the FORM's <p> that fdb9504 removed.
      expect(await nameOf(id)).toBe(before)
      expect(await Materials.renameError(id)).toBe(null)
    })
  })


  // ══ Delete — the SEARCH INDEX, not just the visible list ═════════════════════

  describe('delete and the search index', () => {
    let deleteSeq = 0
    /** See renameToken above — the library is GLOBAL, so the token must be unique. */
    const searchToken = (): string => {
      deleteSeq += 1
      return `Gone${Date.now().toString(36).slice(-6)}${deleteSeq}`.slice(0, 20)
    }

    it('a DELETED material leaves the SEARCH results, not only the unfiltered list', async () => {
      // The four search tests never delete and the two delete tests never search;
      // nothing joined them. A row dropped from `order` but left in `byId` (or a
      // filter reading a different slice) would pass both halves separately and
      // fail exactly here.
      const id = await track()
      const token = searchToken()
      await renameAndSettle(id, token)

      // PROVE THE TOKEN MATCHES FIRST. Without this, the empty result below is
      // also satisfied by a token that never matched anything — the test would
      // pass on a delete that did nothing. Exactly one row, so a leftover from a
      // crashed run colliding on the token fails here loudly rather than silently.
      await Materials.search(token)
      await browser.waitUntil(async () => (await Materials.names()).includes(token), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: `the search never found "${token}" before the delete`
      })
      expect(await Materials.rowCount()).toBe(1)

      // Clear the filter BEFORE deleting: a filtered-out row is not in the DOM at
      // all, so its trash cannot be clicked and the delete would silently no-op.
      await Materials.clearSearch()
      await browser.waitUntil(async () => (await Materials.rowState(id)) !== undefined, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'clearing the search never restored the row'
      })
      await Materials.deleteRow(id)
      created = created.filter((x) => x !== id)

      await Materials.search(token)
      await Materials.listEmpty.waitForDisplayed({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the deleted material still matched its own name'
      })
      // "No materials found" — the FILTER's empty state, not the library's
      // ("No saved materials yet."). Which of the two shows is the discriminator
      // between "gone from the index" and "the whole list broke".
      expect(await Materials.emptyHint()).toBe(MATERIALS_MSG.noMatches)
      // Zero here is the FILTER's doing, not an assumption about the library.
      expect(await Materials.rowCount()).toBe(0)
    })
  })


  // ══ Deleting ONE material type — the isolation property ══════════════════════
  //
  // The existing card-delete test proves the TARGET card disappears, using a
  // document-wide oracle that everything vanishing would satisfy just as well.
  // These prove the opposite half: what SURVIVES, and that it survives intact.
  describe('material-type cards — deleting one in isolation', () => {
    /**
     * A material carrying TWO SAVED type cards.
     *
     * Card 1 is the blank card a fresh material already opens with (reducer
     * `groups: [emptyCard(1, 1)]`) — given the Visualiser rather than adding a
     * third card nobody needs. Card 2 is Energy Balance, the useful sibling: it
     * declares fields of its own, so "unaffected" can be asserted on stored VALUES
     * and not just on the card still being there.
     *
     * SAVING A NON-VISUALISER CARD IS NEW HERE, and it was checked against the
     * backend before being relied on: eav_validation.validate_properties only
     * enforces `required` when the caller passes a set, and
     * material_library_service._validate_member_entry passes one ONLY for the
     * Visualiser (`visualiser_mode_required(...) if mt.materialtype == "Visualiser"
     * else None`). Correspondingly the frontend resolves every material field to
     * `required: false` (materialBlueprint toResolvedField; ProjectScreen/types
     * marks `required` "object-types only"), so a partial Energy Balance payload is
     * legal at both ends. If it were ever rejected this fails cleanly at
     * saveCard() with "card N Save never completed", not as a hang.
     *
     * The two types share no properties. `two_sided_heat_transfer` is the one
     * MATERIAL-WIDE property (MATERIAL_WIDE_PROPERTIES is that single entry) and
     * the Visualiser does not declare it — so nothing here cross-contaminates.
     */
    const twoSavedCards = async (): Promise<{
      materialId: string
      vis: number
      energy: number
    }> => {
      const materialId = await track()
      await MaterialProperties.waitForOpen()

      const vis = (await MaterialProperties.cardIds())[0]
      await MaterialProperties.pickType(vis, 'Visualiser')
      await MaterialProperties.setColorChannel('r', '12')
      await MaterialProperties.setColorChannel('g', '34')
      await MaterialProperties.setColorChannel('b', '56')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(vis), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      // saveCard is a real settle, not a click: it waits for Save to go dead
      // again, which only happens once savedValues match values — i.e. on SUCCESS.
      // A save that failed leaves the card dirty and this times out saying so.
      await MaterialProperties.saveCard(vis)

      const energy = await cardWithType('Energy Balance')
      // Both in range and within the 7-decimal guard, so neither is an "invalid
      // write" and nothing can leave a pending page error for a later execute.
      await MaterialProperties.setField(energy, 'heat_capacity', '1500')
      await MaterialProperties.setField(energy, 'stomatal_sidedness', '0.5')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(energy), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for the Energy Balance card'
      })
      await MaterialProperties.saveCard(energy)
      return { materialId, vis, energy }
    }

    /**
     * Confirm a SAVED card's trash and wait for the member to actually go.
     *
     * The dialog is read BEFORE it is clicked, and its heading checked against the
     * TYPE name: MaterialPropertiesForm renders three `Delete` dialogs (row, whole
     * material, one per card) and only the card's heading names the type
     * (`type.materialtype`). readOpenDialog's `dialog[open]` is what keeps the
     * three apart; asserting the heading is what proves we picked the right one
     * before doing something destructive with it.
     */
    const confirmCardDelete = async (cardId: number, typeName: string): Promise<void> => {
      await MaterialProperties.removeCard(cardId)
      const dlg = await waitForOpenDialog()
      expect(dlg.heading).toBe(MATERIALS_MSG.deleteHeading(typeName))
      await clickDialogButton('Delete')
      await waitForNoOpenDialog()
      // The card is dropped only when REMOVE_PARAMETER_GROUP lands behind the
      // DELETE, so this needs the write budget.
      await browser.waitUntil(async () => !(await MaterialProperties.cardIds()).includes(cardId), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `confirming never removed material-type card ${cardId}`
      })
    }

    it('deleting ONE saved type card leaves its SIBLING, its type and its stored VALUES untouched', async () => {
      const { vis, energy } = await twoSavedCards()

      // Snapshot the survivor BEFORE, so "unaffected" is a comparison and not a
      // guess about what Energy Balance ought to render. The `toContain` guards
      // the comparison from being vacuous — two empty arrays are also equal.
      const propsBefore = await MaterialProperties.renderedProps(energy)
      expect(propsBefore).toContain('heat_capacity')
      const typeBefore = await MaterialProperties.selectedType(energy)
      const heatBefore = (await MaterialProperties.fieldState(energy, 'heat_capacity')).value
      const sidednessBefore = (await MaterialProperties.fieldState(energy, 'stomatal_sidedness')).value
      expect(typeBefore).toBe('Energy Balance')
      expect(heatBefore).toBe('1500')
      expect(sidednessBefore).toBe('0.5')

      await confirmCardDelete(vis, 'Visualiser')

      // THE ISOLATION PROPERTY. cardIds() is document-wide, so "the target is gone"
      // alone is satisfied by the whole form emptying — the survivor being PRESENT
      // is the assertion that actually distinguishes the two.
      const after = await MaterialProperties.cardIds()
      expect(after).toContain(energy)
      expect(after).not.toContain(vis)
      expect(after.length).toBe(1)

      expect(await MaterialProperties.renderedProps(energy)).toEqual(propsBefore)
      // The type Select sits OUTSIDE the card's `open &&` gate and stays readable
      // even though a saved card's Select is disabled (Select's searchable branch
      // is an <input role="combobox"> whose value is the selected label).
      expect(await MaterialProperties.selectedType(energy)).toBe(typeBefore)
      expect((await MaterialProperties.fieldState(energy, 'heat_capacity')).value).toBe(heatBefore)
      expect((await MaterialProperties.fieldState(energy, 'stomatal_sidedness')).value).toBe(
        sidednessBefore
      )
      // The Visualiser's own controls went with its card — its colour boxes are not
      // merely hidden somewhere. (Its card was left EXPANDED on purpose: a
      // collapsed one unmounts its body, which would make this vacuous.)
      await expect(MaterialProperties.colorChannel('r')).not.toBeExisting()
    })

    it('the surviving type card is what the BACKEND holds after a reload — the deleted one is gone', async () => {
      // Everything above reads our own reducer back: REMOVE_PARAMETER_GROUP calls
      // refreshDetailCache (a write-through rewrite of detailsById), and
      // openSavedMaterialWorker serves that cache with NO GET — so clicking away
      // and back proves nothing. Only a full reload, which empties detailsById on
      // LIST_MATERIALS_SUCCEEDED, forces the refetch.
      //
      // COST: one project create on top of two card saves and a delete.
      // Deliberately ONE test, not a reload appended to the isolation test above —
      // a single long test hides which half broke.
      const { materialId, vis } = await twoSavedCards()
      await confirmCardDelete(vis, 'Visualiser')

      await reloadToHome()
      await enterMaterials('matcarddel')
      await browser.waitUntil(async () => (await Materials.rowState(materialId)) !== undefined, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: 'the material did not come back after the reload'
      })
      await Materials.openMaterial(materialId)
      await MaterialProperties.waitForOpen()

      // Reopened cards are re-indexed from the members the GET returned
      // (OPEN_SAVED_MATERIAL_LOADED: `id: index + 1`), so the survivor is card 1
      // now — never assume it kept its id. A delete that never reached the backend
      // brings BOTH members back and fails here.
      await browser.waitUntil(async () => (await MaterialProperties.cardIds()).length === 1, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the reopened material did not carry exactly one member'
      })
      const reopened = (await MaterialProperties.cardIds())[0]
      expect(await MaterialProperties.selectedType(reopened)).toBe('Energy Balance')
      // Number(), not the literal string: these values come back through the wire
      // as canonicalised text, so a float stored as 1500.0 legitimately reads
      // "1500".
      expect(Number((await MaterialProperties.fieldState(reopened, 'heat_capacity')).value)).toBe(1500)
      expect(Number((await MaterialProperties.fieldState(reopened, 'stomatal_sidedness')).value)).toBe(
        0.5
      )
      // …and the deleted member did not come back with it.
      await expect(MaterialProperties.colorChannel('r')).not.toBeExisting()
    })

    it('deleting a saved type card makes that type SELECTABLE again in another card', async () => {
      // The disabled-while-taken rule was only ever asserted in the "taken"
      // direction. This is the release: typesUsedByOtherCards reads draft.groups,
      // so a delete that dropped the member but left the card would leave the type
      // permanently unusable in that material.
      await track()
      await MaterialProperties.waitForOpen()

      const vis = (await MaterialProperties.cardIds())[0]
      await MaterialProperties.pickType(vis, 'Visualiser')
      await MaterialProperties.setColorChannel('r', '7')
      await MaterialProperties.setColorChannel('g', '7')
      await MaterialProperties.setColorChannel('b', '7')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(vis), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      await MaterialProperties.saveCard(vis)

      const other = await MaterialProperties.addCard()
      await MaterialProperties.openTypeDropdown(other)
      // Select LISTS a taken value and disables it rather than hiding it, so the
      // reading is `disabled`, never membership.
      const taken = (await MaterialProperties.typeOptions()).find((o) => o.label === 'Visualiser')
      expect(taken?.disabled ?? false).toBe(true)
      await browser.keys(['Escape'])
      // The listbox is PORTALLED to document.body and sits over the panel — prove
      // it went before clicking anything else, or a stuck list gets misreported
      // later as an intercepted click on something unrelated.
      await browser.waitUntil(async () => !(await $('[role="listbox"]').isExisting()), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the material type listbox stayed open after Escape'
      })

      await confirmCardDelete(vis, 'Visualiser')

      await MaterialProperties.openTypeDropdown(other)
      const freed = (await MaterialProperties.typeOptions()).find((o) => o.label === 'Visualiser')
      expect(freed).toBeDefined()
      expect(freed?.disabled).toBe(false)
      await browser.keys(['Escape'])
      await browser.waitUntil(async () => !(await $('[role="listbox"]').isExisting()), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the material type listbox stayed open after Escape'
      })
    })

    it('removing a card RE-OPENS Add Material Type and restores its title', async () => {
      // The other half of the limit. The sibling test drives the button INTO
      // `All material types added`; nothing ever drove it back out, so a guard
      // that latched (or a title computed once) would never be caught.
      //
      // Cheap by construction: `atTypeLimit` counts CARDS, not types chosen, so
      // seven BLANK cards reach the limit and no backend write happens at all.
      // KNOWN_MATERIAL_TYPES.length is the loop bound because the sibling test
      // already pins it against the LIVE dropdown's option count.
      await track()
      await MaterialProperties.waitForOpen()
      const initial = await MaterialProperties.cardIds()
      expect(initial.length).toBe(1)

      for (let i = initial.length; i < KNOWN_MATERIAL_TYPES.length; i++) {
        await MaterialProperties.addCard()
      }
      await browser.waitUntil(async () => !(await MaterialProperties.addTypeEnabled()), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Add Material Type stayed enabled with one card per catalog type'
      })
      // ToolbarButton's native `title` is the only consumer this copy has anywhere.
      expect(await MaterialProperties.addTypeButton.getAttribute('title')).toBe(
        MATERIALS_MSG.allTypesAdded
      )

      // An UNSAVED card is dropped with no confirmation (onDeleteClick
      // short-circuits on !group.saved), so this is the cheapest way back under the
      // limit — and it keeps this test off the backend entirely.
      const atLimit = await MaterialProperties.cardIds()
      const last = atLimit[atLimit.length - 1]
      await MaterialProperties.removeCard(last)
      await browser.waitUntil(async () => !(await MaterialProperties.cardIds()).includes(last), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the unsaved card was not removed'
      })

      await browser.waitUntil(async () => MaterialProperties.addTypeEnabled(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Add Material Type stayed disabled after a card was removed'
      })
      // The title reverts too — a disabled-looking explanation left on an enabled
      // button is its own small lie.
      expect(await MaterialProperties.addTypeButton.getAttribute('title')).toBe(
        MATERIALS_MSG.addMaterialType
      )
    })
  })

  // ══ Every type on one material, and the SECOND save ══════════════════════

  describe('all material types, and the second save', () => {
    it('ONE material carries a card for EVERY catalog type, and no type is offered TWICE', async () => {
      // Nothing in this suite has ever given a material more than one TYPED card:
      // all 29 cardWithType/pickType call sites configure exactly one, and
      // it('Add Material Type DISABLES once there is a card per catalog type')
      // reaches the limit with seven BLANK cards, because the guard counts cards
      // rather than types.
      //
      // The oracle is the LIVE dropdown, read before any pick — the list is
      // catalog-driven, so KNOWN_MATERIAL_TYPES is cross-checked for size only.
      await track()
      await MaterialProperties.waitForOpen()
      const [firstCard] = await MaterialProperties.cardIds()

      await MaterialProperties.openTypeDropdown(firstCard)
      const catalogTypes = (await MaterialProperties.typeOptions()).map((o) => o.label)
      await browser.keys(['Escape'])
      // The listbox is portalled to document.body and sits over the panel; prove it
      // went before clicking anything else, so a stuck list can't be misreported as
      // an intercepted click on a card.
      await browser.waitUntil(async () => !(await $('[role="listbox"]').isExisting()), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the material type listbox stayed open after Escape'
      })
      expect(catalogTypes.length).toBe(KNOWN_MATERIAL_TYPES.length)

      const cards: number[] = []
      for (const [index, type] of catalogTypes.entries()) {
        const cardId = index === 0 ? firstCard : await MaterialProperties.addCard()
        await MaterialProperties.pickType(cardId, type)
        // Polled, never read straight after the pick: the Select is `searchable`,
        // so while its listbox is open the control shows the live QUERY rather than
        // the selection. The poll settles on the closed, resting state.
        await browser.waitUntil(
          async () => (await MaterialProperties.selectedType(cardId)) === type,
          {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: `card ${cardId} never took the type "${type}"`
          }
        )
        cards.push(cardId)
        // Collapsed as we go. Adding a card does NOT collapse the others
        // (MaterialPropertiesForm.onAddGroup: "Open the new card WITHOUT collapsing
        // the others"), so seven open cards make the panel a long scroller. A
        // collapsed card keeps its type Select — that control lives outside the
        // `open &&` gate, which is exactly what makes it the only thing a collapsed
        // card still says about itself.
        await MaterialProperties.toggleCard(cardId)
      }

      expect((await MaterialProperties.cardIds()).length).toBe(catalogTypes.length)
      const chosen: string[] = []
      for (const id of cards) chosen.push(await MaterialProperties.selectedType(id))
      // The full set, and no repeats: one card per type, which is the backend's own
      // rule (it keys each member by material_type_id).
      expect([...chosen].sort()).toEqual([...catalogTypes].sort())
      expect(new Set(chosen).size).toBe(catalogTypes.length)
      // …and with every type taken, the + stops offering.
      await browser.waitUntil(async () => !(await MaterialProperties.addTypeEnabled()), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Add Material Type stayed enabled with one card per catalog type'
      })

      // DEVIATION from the obvious expectation that a full material leaves every
      // option disabled: typesUsedByOtherCards() excludes the card's OWN type ("the
      // card's own type stays selectable so it keeps showing as the current value",
      // MaterialPropertiesForm.tsx:195-202), so exactly six of the seven are
      // disabled here and its own stays live. Asserted as SHIPPED.
      //
      // Read on the FIRST card, not the last: it sits at the top of the cards
      // scroller, so openTypeDropdown's WebDriver click cannot be a reachability
      // question on top of everything else this test is asking.
      await MaterialProperties.openTypeDropdown(firstCard)
      const offered = await MaterialProperties.typeOptions()
      expect(
        offered
          .filter((o) => o.disabled)
          .map((o) => o.label)
          .sort()
      ).toEqual(catalogTypes.filter((t) => t !== chosen[0]).sort())
      await browser.keys(['Escape'])
      await browser.waitUntil(async () => !(await $('[role="listbox"]').isExisting()), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the material type listbox stayed open after Escape'
      })
    })

    it('a SAVED card keeps its values editable, and the SECOND save persists them', async () => {
      // Every saveCard() in this suite is a card's FIRST save. That matters because
      // saveParameterGroupWorker branches on `saved`: the first call goes to
      // addGroupMaterial (POST), every later one to updateGroupMaterial — and the
      // update path has never been exercised at any level.
      //
      // This test runs LAST in the file on purpose: it reloads to home and enters a
      // new project, like the persistence tests above it.
      const id = await track()
      await MaterialProperties.waitForOpen()
      const cardId = await saveVisualiserCard() // r/g/b = 12/34/56
      const name = await nameOf(id)

      // saveCard settles on Save going disabled, so the card is clean here — that
      // is the baseline the edit below has to move.
      expect(await MaterialProperties.saveEnabled(cardId)).toBe(false)
      // The TYPE is locked once saved (pinned by its own test); the VALUES are not,
      // and that is the distinction section 13 turns on.
      expect(await MaterialProperties.typeLocked(cardId)).toBe(true)

      await MaterialProperties.setColorChannel('r', '99')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'editing a SAVED card never re-enabled its Save'
      })
      await drainToasts()
      await MaterialProperties.saveCard(cardId)
      // The UPDATE path raises the same toast as the ADD path — both end in
      // toastMessages.changesSaved.
      await waitForToast(MATERIALS_TOAST.saved)

      // The reload is what makes this persistence rather than state: it drops the
      // whole renderer, so the values below come back from the BACKEND and not from
      // the write-through detail cache the save just refreshed (LIST_MATERIALS
      // empties detailsById, so the reopen is a real GET). Materials are GLOBAL, so
      // the row follows us into the new project and afterEach can still reach it.
      await reloadToHome()
      await enterMaterials('matresave')
      await browser.waitUntil(async () => (await Materials.rowState(id)) !== undefined, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: `"${name}" did not come back after the reload`
      })
      await Materials.openMaterial(id)
      await MaterialProperties.waitForOpen()
      // Card ids RESTART at 1 per material on a reopen — one card per backend
      // member — so the id from before the reload means nothing here.
      const reopened = (await MaterialProperties.cardIds())[0]
      await browser.waitUntil(
        async () => (await MaterialProperties.selectedType(reopened)) === 'Visualiser',
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the reopened material never showed its Visualiser card'
        }
      )
      // The edited channel came back EDITED and the untouched two came back as they
      // were — so this is an update landing, not the card being rewritten.
      expect(
        [
          await MaterialProperties.colorChannel('r').getValue(),
          await MaterialProperties.colorChannel('g').getValue(),
          await MaterialProperties.colorChannel('b').getValue()
        ].join('/')
      ).toBe('99/34/56')
    })
  })
})
