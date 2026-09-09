/**
 * Sub-model parameters, read back off the GROUND that wears them.
 *
 * This file is a JOIN, and it exists because neither of its parents could make
 * the claim the feature is actually about:
 *
 *  - materials.test.ts drives the sub-models INSIDE THE FORM — that picking
 *    `Farquhar model` reveals its 14 fields, that each stomatal sub-model hides
 *    the other three, that switching blanks the coefficients you abandoned, and
 *    that a saved card comes back on the sub-model it was saved on. Every one of
 *    those assertions is read from the same form the value was typed into.
 *  - material-assignment.test.ts drives ASSIGNMENT — the picker, the draft pick,
 *    Save's Replace confirmation, the conditional unassign, the drop path. It
 *    asserts WHICH material a ground carries, and (in one journey) that a
 *    Visualiser colour and a top-level `gamma_co2` reach the ground's read-only
 *    popup.
 *
 * Nothing joined them. A sub-model's coefficients — the deepest, most
 * conditional data this app stores — had never been carried from the form, over
 * an assignment, to the ground's read-only view and compared value by value.
 * That is this file's whole subject: FILL a sub-model, ASSIGN the material,
 * READ EVERY VALUE BACK off the ground.
 *
 * Out of scope, deliberately — do not re-cover it here:
 *  - form-only sub-model behaviour (reveal / hide / switch-blanks / survives a
 *    reload). materials.test.ts owns all four, sees them faster, and re-covering
 *    them here would double the runtime for nothing.
 *    ONE EXCEPTION, and it is stated so the rule above is not quietly broken:
 *    the first test below reads the Farquhar card's rendered property set as an
 *    EXACT SET, before and after the selector. materials.test.ts pins the
 *    top-level set ('a Photosynthesis card renders EXACTLY its catalog
 *    controls') and pins the reveal by probing two fields ('the Farquhar fields
 *    appear ONLY once the submodel selector is set'), but nothing anywhere pins
 *    the GROUP's whole membership — so a 15th coefficient added by a migration
 *    would render, save and reach a ground with the entire suite green. That
 *    claim has to live where the group is the subject, which is here.
 *  - the picker's own chrome, the Replace/Unassign dialogs' copy, and the sync
 *    dot. material-assignment.test.ts owns those.
 *  - the numeric CATALOG SWEEP (both bounds accepted, just-above-max rejected,
 *    one test per property). materials.test.ts already runs it over all 41
 *    numeric properties. The two range tests here are the ones the sweep does
 *    NOT make: `topt_*`'s MINIMUM (which a user story disputes) and the two
 *    widest bounds in the catalog, each SAVED and read back off a ground.
 *
 * ── The DEVIATIONs this file pins ─────────────────────────────────────────
 * 1. THE TWO SURFACES DISAGREE ABOUT A SELECTOR ENUM. The editable form shows
 *    the NAME OF THE GROUP a value unlocks (`Farquhar model`,
 *    `Ball-woodrow-berry` — materialBlueprint's enumLabels, whose own comment
 *    says "so the driving dropdown reads 'Ball-woodrow-berry' not 'BWB'"), while
 *    the ground's read-only popup shows the HUMANIZED STORED CODE
 *    (`Farquhar Model`, `BWB` — buildMaterialSections, whose own comment says
 *    "the popup reports what the material actually holds"). Both are deliberate,
 *    and together they mean a user picks one string and reads back another.
 *    Recorded as a product finding, asserted as shipped, and predicted by
 *    `readOnlyEnumValue()` so a change on either side turns this red.
 * 2. The story calls the popup's per-type sections TABS. They are collapsible
 *    sections, expanded by default; there is no role="tab" in the popup.
 * 3. Story 10 states `topt_tpu` is 272-373. The live catalog says 273-373, and
 *    272.9 is REJECTED — see 'the three Topt_ fields'.
 *
 * ── State model ───────────────────────────────────────────────────────────
 * Shared provisioning, exactly material-assignment.test.ts's: ONE project for
 * the whole file, entered through enterGeometry, with the Materials toolbar
 * waited out as well because every test here needs both sides.
 *
 * Each test creates its own rows via trackGround() / trackMaterial(), and
 * afterEach deletes exactly those — GROUNDS FIRST, materials second, so a
 * material is never deleted while a ground still carries it. THE MATERIAL
 * LIBRARY IS GLOBAL: a leaked material follows you into every later test, every
 * later project and every later run, so the teardown ends by proving both
 * tracked sets are gone rather than hoping.
 *
 * Rules this file depends on:
 *  - +Ground opens THAT ground's form, and +Add Materials swaps the panel to the
 *    MATERIAL form. So every test creates its materials FIRST and its ground
 *    LAST, and re-selects the row it means before reading anything.
 *  - NEVER assert an absolute material-library row count — it is global and
 *    carries other runs' leftovers.
 *  - Nothing here touches a resolution field, so every ground stays at the 1x1
 *    blueprint default, well under MAX_SAVEABLE_RESOLUTION_CELLS.
 *  - An open <dialog> or a leaked AnchoredPopup poisons every later click in the
 *    file, so the detail popup is CLOSED before anything else is clicked and
 *    afterEach sweeps both.
 */

import Geometry from '../pages/Geometry.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import Materials from '../pages/Materials.page'
import ObjectProperties, { type DetailRow } from '../pages/ObjectProperties.page'
import { GEOMETRY_MATERIAL_MSG, GEOMETRY_TOAST } from '../constants/geometry'
import {
  MATERIALS_MSG,
  SUBMODELS,
  enumLabel,
  isSelectorEnum,
  justAboveMax,
  justBelowMin,
  materialLabel,
  midRangeValue,
  propDef,
  readOnlyEnumValue,
  topLevelProps
} from '../constants/materials'
import { TIMEOUTS } from '../config/timeouts'
import {
  enterGeometry,
  reopenByName,
  staysFalse,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { clickDialogButton, waitForNoOpenDialog, waitForOpenDialog } from '../support/dialogs'
import { dragMaterialOnto } from '../support/dnd'
import { clearApiFaults, withApiFault } from '../support/faults'
import { drainToasts, waitForToast } from '../support/toasts'

describe('Material sub-models on a ground', () => {
  /** The file's shared project — one test navigates away and must come back. */
  let project: { id: string; name: string }

  /** Grounds created by the running test, oldest first. */
  let grounds: string[] = []
  /** Materials created by the running test, oldest first. */
  let materials: string[] = []

  const PHOTO = 'Photosynthesis'
  const STOMATAL = 'Stomatal Conductance'
  const ENERGY = 'Energy Balance'

  /** The selector property that gates each type's conditional groups. */
  const SELECTOR: Record<string, string> = {
    [PHOTO]: SUBMODELS.Photosynthesis.selector,
    [STOMATAL]: SUBMODELS['Stomatal Conductance'].selector
  }

  const FARQUHAR = 'farquhar_model'
  /** The 14 fields the Farquhar selector unlocks, in catalog order. */
  const FARQUHAR_PROPS = SUBMODELS.Photosynthesis.groups.farquhar_model.props as readonly string[]
  /** What the FORM's dropdown reads for that value — the GROUP name, not the code. */
  const FARQUHAR_FORM_LABEL = enumLabel(PHOTO, 'submodel', FARQUHAR)

  /**
   * The four stomatal sub-models, as [stored code, {label, props}].
   *
   * Cast to a plain shape on purpose: SUBMODELS is `as const`, so Object.entries
   * yields a UNION of four readonly tuple types and `.map` over that union does
   * not typecheck. The cast keeps the catalog as the single source of the loop
   * below while letting the generated tests be written once.
   */
  const STOMATAL_SUBMODELS = Object.entries(SUBMODELS['Stomatal Conductance'].groups) as [
    string,
    { label: string; props: readonly string[] }
  ][]

  // ── Tracking + provisioning ───────────────────────────────────────────────

  const trackGround = async (): Promise<string> => {
    const id = await Geometry.addGround()
    grounds.push(id)
    return id
  }

  const trackMaterial = async (): Promise<string> => {
    const id = await Materials.addMaterial()
    materials.push(id)
    return id
  }

  const groundNameOf = async (id: string): Promise<string> =>
    (await Geometry.rowState(id))?.name ?? ''

  const materialNameOf = async (id: string): Promise<string> =>
    (await Materials.rowState(id))?.name ?? ''

  // ── The Materials form ────────────────────────────────────────────────────

  /**
   * Give the blank card a fresh material opens with a type, and wait for its
   * fields.
   *
   * A new material already carries ONE blank card (reducer.ts seeds
   * `groups: [emptyCard(1, 1)]` — "open it with one blank card, ready to pick a
   * material type"), so this uses that card rather than adding a second. Adding
   * one would leave a permanently blank, never-saved card on the material; it is
   * inert (refreshDetailCache filters on `g.saved && g.typeId != null`) but it is
   * also noise in a file whose subject is what a material actually holds.
   *
   * The wait at the end is load-bearing: pickType returns as soon as the option
   * is clicked, and setEnum's own querySelector would throw against a card that
   * has not yet re-rendered with the new type's controls.
   */
  const cardWithType = async (type: string): Promise<number> => {
    await MaterialProperties.waitForOpen()
    let cardId = -1
    await browser.waitUntil(
      async () => {
        const ids = await MaterialProperties.cardIds()
        if (!ids.length) return false
        cardId = ids[0]
        return true
      },
      {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the new material never rendered its blank material-type card'
      }
    )
    await MaterialProperties.pickType(cardId, type)
    const firstField = topLevelProps(type)[0].property
    await browser.waitUntil(async () => MaterialProperties.hasField(cardId, firstField), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the card never rendered the ${type} fields after picking that type`
    })
    return cardId
  }

  /** Create a material, give its card a type, and hand back both ids. */
  const newMaterialWithCard = async (
    type: string
  ): Promise<{ materialId: string; cardId: number; name: string }> => {
    const materialId = await trackMaterial()
    const cardId = await cardWithType(type)
    return { materialId, cardId, name: await materialNameOf(materialId) }
  }

  /**
   * Choose a sub-model by the label the FORM shows for it.
   *
   * ALWAYS through enumLabel: the option a user clicks is the name of the GROUP
   * the value unlocks (`Ball-woodrow-berry`), never the stored code (`BWB`).
   * Passing the code straight to setEnum finds no option and throws — the trap
   * that broke 31 tests in one run.
   */
  const pickSubmodel = async (cardId: number, type: string, stored: string): Promise<void> => {
    const property = SELECTOR[type]
    await browser.waitUntil(async () => MaterialProperties.hasField(cardId, property), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the ${type} card never rendered its ${property} dropdown`
    })
    await MaterialProperties.setEnum(cardId, property, enumLabel(type, property, stored))
  }

  /**
   * Distinct, INTERIOR values for a set of properties on one type.
   *
   * `midRangeValue(def, frac)` with frac spread as (i+1)/(n+1). Two properties
   * of the loop:
   *  - every value is strictly inside its own range, so nothing here collides
   *    with a bound (frac 0 would put the first field exactly on its minimum,
   *    which is a different test and is already covered by the catalog sweep);
   *  - no two properties get the same fraction, so no two get the same value
   *    even where their ranges are identical (dHa_Vcmax, dHa_Jmax, dHd_Jmax,
   *    dHa_TPU and dHd_TPU are all 0-500). That is what makes "did Jmax_25's
   *    value land in Vcmax_25's row?" answerable from the diff alone.
   */
  const spreadValues = (type: string, props: readonly string[]): Record<string, string> => {
    const out: Record<string, string> = {}
    props.forEach((property, i) => {
      out[property] = midRangeValue(propDef(type, property), (i + 1) / (props.length + 1))
    })
    return out
  }

  /**
   * Write a bag of values into a card, then BLUR.
   *
   * The blur is not tidiness. handleFieldBlur is what expands scientific
   * notation and rewrites the field text, and it is also where an incomplete
   * value would report itself — so committing explicitly means the card is saved
   * from settled text rather than from whatever the last keystroke left.
   */
  const fillFields = async (cardId: number, values: Record<string, string>): Promise<void> => {
    for (const [property, value] of Object.entries(values)) {
      await MaterialProperties.setField(cardId, property, value)
    }
    await MaterialProperties.commitField()
  }

  /**
   * Bring a card's Save into the panel's scroll viewport before a REAL click.
   *
   * Plain DOM scrollIntoView, never the wdio command (Browser.getWindowForTarget
   * is unimplemented in this Electron build). A Photosynthesis card carrying all
   * 14 Farquhar fields is far taller than the panel, so without this the click
   * lands on nothing.
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
   * Save a card and wait for the write to actually LAND.
   *
   * NOT MaterialProperties.saveCard, and not `typeLocked` either — both are
   * unsound as a settle here, in opposite ways:
   *  - saveCard() settles on the button going DISABLED, which is true both while
   *    the write is in flight (`canSave` includes `!saving`) and once it has
   *    landed. It can therefore return a millisecond after the click, before
   *    anything left the renderer.
   *  - `typeLocked` flips false→true on a card's FIRST save only. Every re-save
   *    in this file (the edit-after-assignment tests) finds it ALREADY true, so
   *    it settles instantly and proves nothing.
   *
   * The LABEL is the discriminator, exactly as on the ground form: the button
   * reads "Saving…" for precisely the in-flight window, so "back to Save, and no
   * longer offered" is the one state that cannot be reached early. And it is the
   * right oracle for what follows: SAVE_PARAMETER_GROUP_SUCCEEDED is a single
   * reducer case that clears `saving`, snapshots `savedValues` AND rewrites the
   * detail cache — which is what every read-only popup in this file is fed from.
   *
   * A FAILED save never reaches this state (the card stays dirty and offers a
   * retry), which is why the fault test below drives the click itself.
   */
  const saveCard = async (cardId: number): Promise<void> => {
    await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `Save never enabled for card ${cardId} — the card never became dirty`
    })
    await revealSave(cardId)
    await MaterialProperties.cardSave(cardId).click()
    await browser.waitUntil(
      async () => {
        const label = (await MaterialProperties.cardSave(cardId).getText()).trim()
        return label === 'Save' && !(await MaterialProperties.saveEnabled(cardId))
      },
      {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `card ${cardId}'s save never landed (its Save never went quiet again)`
      }
    )
    // Belt and braces on the FIRST save: the type Select locks only once the
    // member exists on the backend.
    expect(await MaterialProperties.typeLocked(cardId)).toBe(true)
  }

  /**
   * Resolve a REOPENED material's card by the type it carries.
   *
   * Card ids RESTART at 1 per material on a reopen — one card per backend
   * member, in member order — so an id captured before the reopen means nothing.
   * selectedType() resolves the card title first and then a combobox by that
   * label, so mid-remount it can throw rather than return '': swallowed here so
   * the poll keeps polling instead of failing on a race.
   */
  const awaitCardForType = async (type: string): Promise<number> => {
    let cardId = -1
    await browser.waitUntil(
      async () => {
        for (const id of await MaterialProperties.cardIds()) {
          if ((await MaterialProperties.selectedType(id).catch(() => '')) === type) {
            cardId = id
            return true
          }
        }
        return false
      },
      {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: `the reopened material never showed its ${type} card`
      }
    )
    return cardId
  }

  // ── The ground form ───────────────────────────────────────────────────────

  /**
   * Open the picker AND wait for its contents.
   *
   * aria-expanded flips on the click, but AnchoredPopup renders its children
   * only after a measurement pass, so the heading — the first thing BOTH shapes
   * paint — is the settle, not the button.
   */
  const openPicker = async (): Promise<void> => {
    await ObjectProperties.openMaterialPicker()
    await browser.waitUntil(async () => (await ObjectProperties.pickerState()).heading !== null, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Select Materials popup opened but never rendered its contents'
    })
  }

  /** Pick a material by name. EVERY pick closes the popup, so that is the settle. */
  const pick = async (name: string): Promise<void> => {
    await openPicker()
    await browser.waitUntil(
      async () => (await ObjectProperties.pickerState()).rows.some((r) => r.name === name),
      { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the picker never listed "${name}"` }
    )
    await ObjectProperties.pickMaterial(name)
    await browser.waitUntil(async () => !(await ObjectProperties.pickerOpen()), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `picking "${name}" never closed the picker`
    })
  }

  /**
   * Wait for the Materials section to list exactly `names`.
   *
   * The message is deliberately static: an `await` inside the options object
   * would be evaluated BEFORE waitUntil ran and would report the state at the
   * start of the wait rather than at the timeout.
   */
  const waitForAssigned = async (
    names: string[],
    // Annotated `number`, not inferred: TIMEOUTS is `as const`, so a bare default
    // would narrow this parameter to the literal 10000 and reject MUTATION.
    timeout: number = TIMEOUTS.MEDIUM
  ): Promise<void> => {
    await browser.waitUntil(
      async () => {
        const got = await ObjectProperties.assignedNames()
        return got.length === names.length && names.every((n) => got.includes(n))
      },
      { timeout, timeoutMsg: `the Materials section never listed exactly [${names.join(', ')}]` }
    )
  }

  /**
   * Press Save, having first proved it is actually available.
   *
   * Without the gate a disabled Save clicks nothing and every downstream "the
   * save landed" oracle is satisfied by the button that was disabled all along.
   */
  const clickSave = async (): Promise<void> => {
    await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Save never enabled — the form did not become dirty'
    })
    await ObjectProperties.saveButton.click()
  }

  /**
   * Wait for the ground's save to LAND.
   *
   * `disabled` alone is not a settle — the button is disabled both while the
   * PATCH is in flight (`draft.saving`) and once it has landed and cleared
   * `dirty`. The LABEL is the discriminator: it reads "Saving…" for exactly the
   * in-flight window, so the settle is "back to Save, and no longer offered".
   */
  const waitForSaveSettled = async (): Promise<void> => {
    await browser.waitUntil(
      async () => {
        const label = (await ObjectProperties.saveButton.getText()).trim()
        return label === 'Save' && !(await ObjectProperties.saveEnabled())
      },
      { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the save never landed (Save never went quiet)' }
    )
  }

  /** Create a ground, pick `name` for it and SAVE. Returns the new row id. */
  const groundWearing = async (name: string): Promise<string> => {
    const groundId = await trackGround()
    await ObjectProperties.waitForOpen()
    await pick(name)
    await clickSave()
    await waitForSaveSettled()
    await waitForAssigned([name], TIMEOUTS.MUTATION)
    return groundId
  }

  // ── The read-only popup ───────────────────────────────────────────────────

  /**
   * Open an assigned material's read-only popup and return EVERY row.
   *
   * The wait on `section` is required, not defensive: openDetailPopup dispatches
   * loadMaterialDetailRequested whenever the material's properties are not
   * cached (a freshly picked group, or anything after a reload), so the popup
   * can be on screen a beat before it has anything to show.
   */
  const readDetail = async (name: string, section: string): Promise<DetailRow[]> => {
    await ObjectProperties.openMaterialDetail(name)
    await browser.waitUntil(
      async () => (await ObjectProperties.detailSections(name)).includes(section),
      {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `the properties popup for "${name}" never listed its ${section} section`
      }
    )
    return ObjectProperties.detailRows(name)
  }

  /**
   * Close the detail popup and prove it is gone.
   *
   * Load-bearing, never tidying: an open AnchoredPopup lays a `fixed inset-0
   * z-40` overlay over the whole panel, so the next WebDriver click — on a tree
   * row, a material row, Save — is intercepted and blames the wrong element.
   * The popup is portalled and returns null when closed, so non-existence is a
   * valid oracle here (unlike every accordion in this app, which hides with
   * display:none).
   */
  const closeDetail = async (name: string): Promise<void> => {
    await ObjectProperties.closeMaterialDetail(name)
    await browser.waitUntil(async () => !(await ObjectProperties.materialDetail(name).isExisting()), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the properties popup for "${name}" never closed, so its overlay would eat the next click`
    })
  }

  /**
   * The NAME the popup RENDERS in its own header.
   *
   * Not the aria-label, and the distinction is the whole reason this exists:
   * `ObjectProperties.materialDetail(name)` SELECTS on
   * `[aria-label="{name} properties"]`, and `openMaterialDetail` already waits
   * for that node to exist — so reading the aria-label back and comparing it to
   * the same name is circular and cannot fail. The header <p> is a different
   * node, populated from the `name` prop rather than from the selector, so it is
   * the only DOM evidence of WHICH material the popup is reporting.
   *
   * Found via the close button because the popup holds several <p> elements (the
   * empty-state line, and a caption per named parameter group); the header is
   * the one that is the close button's sibling.
   */
  const detailHeading = async (name: string): Promise<string> =>
    browser.execute((want: string) => {
      const popup = document.querySelector(`[role="dialog"][aria-label="${want} properties"]`)
      const close = popup?.querySelector('[aria-label="Close material properties"]')
      const heading = close?.parentElement?.querySelector('p')
      return heading ? (heading.textContent || '').trim() : ''
    }, name) as Promise<string>

  /** Section headings + their expanded state, in DOM order. */
  const detailSectionState = async (
    name: string
  ): Promise<{ section: string; expanded: boolean }[]> =>
    browser.execute((want: string) => {
      const popup = document.querySelector(`[role="dialog"][aria-label="${want} properties"]`)
      return Array.from(popup?.querySelectorAll('[aria-expanded]') ?? []).map((b) => ({
        section: (b.textContent || '').trim(),
        expanded: b.getAttribute('aria-expanded') === 'true'
      }))
    }, name) as Promise<{ section: string; expanded: boolean }[]>

  /** Click one section's header inside the open popup. In-page: it is portalled. */
  const toggleDetailSection = async (name: string, section: string): Promise<void> => {
    await browser.execute(
      (want: string, sec: string) => {
        const popup = document.querySelector(`[role="dialog"][aria-label="${want} properties"]`)
        const btn = Array.from(popup?.querySelectorAll('[aria-expanded]') ?? []).find(
          (b) => (b.textContent || '').trim() === sec
        ) as HTMLElement | undefined
        if (!btn) throw new Error(`toggleDetailSection: no "${sec}" header in the "${want}" popup`)
        btn.click()
      },
      name,
      section
    )
  }

  /** Labels present under one section, sorted — the popup's SHAPE for that type. */
  const sectionLabels = (rows: DetailRow[], section: string): string[] =>
    rows
      .filter((r) => r.section === section)
      .map((r) => r.label)
      .sort()

  /**
   * `label=value` per property, so a failed comparison names the field.
   *
   * Composed rather than compared as a bare object because the diff is the whole
   * point: `Topt_Jmax=339.6667` next to `Topt_Jmax=` says which row lost its
   * value, where a mismatched pair of 14-element arrays says nothing.
   */
  const readBack = (rows: DetailRow[], section: string, props: readonly string[]): string[] =>
    props.map((p) => `${materialLabel(p)}=${ObjectProperties.valueIn(rows, section, materialLabel(p))}`)

  const expectedBack = (values: Record<string, string>, props: readonly string[]): string[] =>
    props.map((p) => `${materialLabel(p)}=${values[p]}`)

  /**
   * Burn a pending page error so it cannot fail an unrelated later command.
   *
   * REQUIRED after every out-of-range write in this file, and the reason is
   * subtle enough that materials.test.ts's catalog sweep works around it by
   * ordering instead: an invalid value makes the app throw asynchronously, out
   * of its own handler, and WebdriverIO holds that and re-raises it on the NEXT
   * execute/sync command. setField IS an execute — so a second write after an
   * invalid one fails the COMMAND, carrying the app's own validation copy
   * ("Values should be between 273-373") as a WebDriverError instead of the
   * assertion it belongs to, and names the wrong cause.
   *
   * The sweep can put its only invalid write last and let the test end. The
   * tests here cannot: they probe both bounds AND go on to save the field and
   * read it off a ground, so the error has to be consumed deliberately at the
   * point it was produced. Reads in between are safe either way — fieldState
   * goes through ELEMENT commands, which are unaffected.
   *
   * Delegates to ObjectProperties.drainPageError, which is exactly this and
   * carries no form-specific state: one browser.execute inside a try/catch.
   *
   * FINDING, recorded rather than asserted: an out-of-range field produces an
   * uncaught error in the app. It does not break the UI — the field flags
   * correctly and the form stays usable — but it would reach an error boundary
   * or any window.onerror reporting in production.
   */
  const drainPageError = (): Promise<void> => ObjectProperties.drainPageError()

  /**
   * Force every open AnchoredPopup shut.
   *
   * The overlay's own onClick IS the popup's onClose, so clicking it in-page
   * closes whichever popup is up without the caller knowing which. Dispatched on
   * the node directly because an open modal <dialog> sits in the top layer above
   * it. Cleanup only — never to dismiss a popup a test is asserting on.
   */
  const sweepPopups = async (): Promise<void> => {
    await browser.execute(() => {
      document
        .querySelectorAll('[data-testid="anchored-popup-overlay"]')
        .forEach((el) => (el as HTMLElement).click())
    })
  }

  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
    // enterGeometry gates on the object-type catalog and the tree. Every test
    // here also builds a material, so the material-type catalog must be in as
    // well — +Add Materials becoming enabled is that gate.
    project = await enterGeometry('submodels')
    await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: '+ Add Materials never became enabled (the material catalog never loaded)'
    })
  })

  afterEach(async () => {
    // Steps stay best-effort, but their errors are COLLECTED rather than
    // discarded, and the teardown ends by checking both tracked sets are gone.
    // This file shares one project AND writes into the global material library,
    // so a leak corrupts later tests in two slices at once — far from its cause.
    const failures: string[] = []
    const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn()
      } catch (err) {
        failures.push(`${label} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Dialogs first: components/Dialog uses the native showModal(), so one left
    // open sits in the TOP LAYER and makes every later click in the file fail
    // with "element click intercepted", naming the wrong element.
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    // Then popups (the picker and the detail view), whose `fixed inset-0 z-40`
    // overlay does the same to everything under the right panel…
    await step('sweepPopups', () => sweepPopups())
    // …and then any portalled Select listbox. This file opens more of them than
    // any other spec (every sub-model pick is one), and a leaked listbox
    // intercepts clicks exactly like a leaked popup.
    await step('closeEnum', () => MaterialProperties.closeEnum())
    // Filters BEFORE deleting: a row filtered out of a list is not in the DOM,
    // so its trash cannot be clicked and cleanup would silently leak it.
    await step('Geometry.clearSearch', () => Geometry.clearSearch())
    await step('Materials.clearSearch', () => Materials.clearSearch())

    // GROUNDS FIRST. Deleting a material still assigned to one drags the eager
    // backend reconcile and the geometry slice's REMOVE_MATERIAL purge in with
    // it; removing the ground first makes cleanup a plain pair of deletes.
    const trackedGrounds = [...grounds].reverse()
    const trackedMaterials = [...materials].reverse()
    for (const id of trackedGrounds) {
      await step(`Geometry.deleteRow(${id})`, () => Geometry.deleteRow(id))
      await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    }
    for (const id of trackedMaterials) {
      await step(`Materials.deleteRow(${id})`, () => Materials.deleteRow(id))
      await step('closeAnyOpenDialog', () => Materials.closeAnyOpenDialog())
    }
    grounds = []
    materials = []
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    await step('clearApiFaults', () => clearApiFaults())

    const leakedGrounds: string[] = []
    for (const id of trackedGrounds) {
      if (await Geometry.row(id).isExisting().catch(() => false)) leakedGrounds.push(id)
    }
    const leakedMaterials: string[] = []
    for (const id of trackedMaterials) {
      if (await Materials.row(id).isExisting().catch(() => false)) leakedMaterials.push(id)
    }
    if (leakedGrounds.length || leakedMaterials.length) {
      throw new Error(
        'Cleanup left rows behind in the shared project.\n' +
          (leakedGrounds.length ? `  geometry: ${leakedGrounds.join(', ')}\n` : '') +
          (leakedMaterials.length
            ? `  materials (GLOBAL library): ${leakedMaterials.join(', ')}\n`
            : '') +
          (failures.length
            ? `  cleanup errors:\n    ${failures.join('\n    ')}`
            : '  No cleanup step reported an error, so the delete silently no-opped.')
      )
    }
  })

  // ══ 1. Photosynthesis — the Farquhar sub-model on a ground ═══════════════

  describe('Photosynthesis — the Farquhar sub-model on a ground', () => {
    it('the Farquhar sub-model renders ALL 14 of its fields and NOTHING else', async () => {
      // The precondition for every other test in this describe, and stated as an
      // EXACT SET rather than a handful of hasField() probes: the catalog is the
      // oracle for which controls a card renders, so a property added to (or
      // dropped from) the Farquhar group turns this red rather than passing
      // quietly because the two fields somebody happened to check are still
      // there.
      //
      // materials.test.ts already covers the reveal itself ('the Farquhar fields
      // appear ONLY once the submodel selector is set'). What it does not do is
      // pin the WHOLE set, which is what the read-back test below then walks.
      // DEVIATION: there is no longer an UNSET state to observe.
      //
      // This used to open by asserting the card rendered ONLY the top-level
      // properties, and that picking "Farquhar model" is what revealed the group.
      // `submodel` is the catalog's ONLY sub-model value, and materialBlueprint
      // pre-selects a selector that has exactly one enum value (and drops the
      // "Select" clear row with it), so the group is revealed the moment the card
      // mounts. Asserting the vanished "before" state is what made this stale —
      // the EXACT-SET check below is the part that was always carrying the value.
      await trackMaterial()
      const cardId = await cardWithType(PHOTO)

      const expected = [
        ...topLevelProps(PHOTO).map((p) => p.property),
        ...FARQUHAR_PROPS
      ].sort()

      // Revealed with NO interaction at all — the pre-selected selector shows it.
      expect([...(await MaterialProperties.renderedProps(cardId))].sort()).toEqual(expected)

      // Re-picking it is a no-op today, and deliberately kept: the moment a SECOND
      // sub-model is added, `submodel` stops being auto-selected and this is the
      // line that still proves picking Farquhar reveals exactly its own fields.
      await pickSubmodel(cardId, PHOTO, FARQUHAR)
      await browser.waitUntil(async () => MaterialProperties.hasField(cardId, 'vcmax25'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'choosing the Farquhar sub-model never revealed its fields'
      })

      expect([...(await MaterialProperties.renderedProps(cardId))].sort()).toEqual(expected)
      expect(FARQUHAR_PROPS.length).toBe(14)
    })

    it('ALL 14 Farquhar coefficients reach the GROUND and read back one for one', async () => {
      // ── THE SPINE OF THIS FILE ──────────────────────────────────────────────
      // Everything else here is a variation on this one journey: fill a sub-model
      // completely in the Materials form, put the material on a ground, and read
      // EVERY value back off the ground's read-only view.
      //
      // Why it has to be all 14 and not a representative two: the popup builds
      // its rows from the catalog's group definition and reads each value out of
      // the member's property bag by name (buildMaterialSections). A mapping that
      // shifted by one — a row taking its neighbour's value — is invisible to any
      // test that checks a single field, and is exactly the failure this shape
      // catches. The values are spread so no two are equal, so a shifted mapping
      // cannot coincidentally agree.
      //
      // It also crosses every seam the feature has: the form's field handlers →
      // toNativeProperties → the card POST → the write-through detail cache →
      // membersFor → buildMaterialSections → the popup's <dl>. No per-feature
      // test can see that chain end to end.
      const { cardId, name } = await newMaterialWithCard(PHOTO)
      await pickSubmodel(cardId, PHOTO, FARQUHAR)
      const values = spreadValues(PHOTO, FARQUHAR_PROPS)
      await fillFields(cardId, values)
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, PHOTO)
      expect(readBack(rows, PHOTO, FARQUHAR_PROPS)).toEqual(expectedBack(values, FARQUHAR_PROPS))
      await closeDetail(name)
    })

    it('the selector reads "Farquhar Model" on the GROUND and "Farquhar model" in the FORM', async () => {
      // DEVIATION, and a genuine product finding rather than a test detail: the
      // two surfaces disagree about the same stored value.
      //   • the editable form shows the NAME OF THE GROUP the value unlocks,
      //     because materialBlueprint maps selector_value → group name ("so the
      //     driving dropdown reads 'Ball-woodrow-berry' not 'BWB'");
      //   • the read-only popup shows the HUMANIZED STORED CODE, because
      //     buildMaterialSections "reports what the material actually holds".
      // So a user picks `Farquhar model` and reads back `Farquhar Model`. Both
      // halves are asserted here, in one test, so the disagreement is explicit
      // and a change on either side surfaces rather than passing silently.
      const { cardId, name } = await newMaterialWithCard(PHOTO)
      await pickSubmodel(cardId, PHOTO, FARQUHAR)
      // Captured from the FORM before the panel changes hands.
      const formLabel = (await MaterialProperties.enumState(cardId, 'submodel')).label
      await MaterialProperties.setField(cardId, 'vcmax25', '75')
      await MaterialProperties.commitField()
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, PHOTO)
      const onGround = ObjectProperties.valueIn(rows, PHOTO, materialLabel('submodel'))
      expect(formLabel).toBe(FARQUHAR_FORM_LABEL)
      expect(onGround).toBe(readOnlyEnumValue(PHOTO, 'submodel', FARQUHAR))
      expect(onGround).toBe('Farquhar Model')
      // The point of the test, stated as an inequality so it cannot be satisfied
      // by both surfaces quietly converging on one string.
      expect(onGround).not.toBe(formLabel)
      await closeDetail(name)
    })

    it('the three Topt_ fields accept 273 and REJECT 272.9 — the story is one degree out', async () => {
      // DEVIATION: Story 10 states topt_tpu is 272-373. The live catalog says
      // 273-373 for all three Topt_ fields, and 272.9 is refused — so the story
      // is one degree out, and it is the MINIMUM that disagrees.
      //
      // SCOPED TO THE MINIMUM, and that is the whole reason this test exists
      // here. materials.test.ts's catalog sweep already generates
      //   "Photosynthesis.topt_vcmax accepts 273 and 373, rejects 373.1"
      // (and the same for topt_jmax and topt_tpu), so probing the maximum again
      // would be a verbatim re-run of three tests that already ship. What the
      // sweep does NOT do is go BELOW the minimum of these three — its below-min
      // block takes one representative property per type, which for
      // Photosynthesis is `stomatal_sidedness` — and the minimum is the only
      // bound the story disputes.
      //
      // The maximum is still pinned, by the MESSAGE rather than by a second
      // probe: the rejection copy is composed from BOTH catalog bounds, so a max
      // that moved would change the expected string and turn this red anyway.
      await trackMaterial()
      const cardId = await cardWithType(PHOTO)
      await pickSubmodel(cardId, PHOTO, FARQUHAR)

      for (const property of ['topt_vcmax', 'topt_jmax', 'topt_tpu']) {
        const def = propDef(PHOTO, property)
        const range = MATERIALS_MSG.valuesBetween(def.min, def.max)
        const min = String(def.min)

        // INCLUSIVE: 273 itself is accepted. Load-bearing for the claim below —
        // "272.9 is rejected" on its own is equally satisfied by a minimum of
        // 300, so only the pair says where the bound actually sits.
        await MaterialProperties.setField(cardId, property, min)
        const ok = await MaterialProperties.fieldState(cardId, property)
        expect(`${property}@${min} -> ${ok.value} / ${ok.error}`).toBe(
          `${property}@${min} -> ${min} / null`
        )

        // …and a tenth below it is refused, with the CATALOG's own copy. Note the
        // Materials phrasing has no parentheses and no spaces —
        // "Values should be between 273-373" — where the identical rule on the
        // ground form reads "(273 - 373)". A real product inconsistency; the
        // constants file carries both so they cannot be mixed up.
        const below = justBelowMin(def)
        await MaterialProperties.setField(cardId, property, below)
        const bad = await MaterialProperties.fieldState(cardId, property)
        expect(`${property}@${below} -> ${bad.error} / invalid=${bad.invalid}`).toBe(
          `${property}@${below} -> ${range} / invalid=true`
        )
        // The next statement is another setField, i.e. another execute — see
        // drainPageError. Without this the following write fails as a
        // WebDriverError carrying this very message.
        await drainPageError()

        // Leave the field valid so the next property's probe starts from a card
        // that is not already carrying an error.
        await MaterialProperties.setField(cardId, property, min)
      }
      expect(MATERIALS_MSG.valuesBetween(273, 373)).toBe('Values should be between 273-373')
    })

    it("the TOP-LEVEL fields are listed on the ground ALONGSIDE the sub-model's group", async () => {
      // The popup renders the type's ungrouped bucket AND every conditional group
      // whose selector currently matches. A build that showed only the group
      // (the conditional data is the interesting part, so it is the easy mistake)
      // would hide the Heat Transfer Flag and Stomatal Sidedness entirely — two
      // values the user set and can no longer see — and every assertion in the
      // spine test above would still pass. So this reads one row of EACH kind
      // from the same popup.
      const { cardId, name } = await newMaterialWithCard(PHOTO)
      await MaterialProperties.setEnum(cardId, 'two_sided_heat_transfer', 'Two Sided')
      await MaterialProperties.setField(cardId, 'stomatal_sidedness', '0.6')
      await MaterialProperties.commitField()
      await pickSubmodel(cardId, PHOTO, FARQUHAR)
      await MaterialProperties.setField(cardId, 'vcmax25', '512.5')
      await MaterialProperties.commitField()
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, PHOTO)
      expect([
        ObjectProperties.valueIn(rows, PHOTO, materialLabel('two_sided_heat_transfer')),
        ObjectProperties.valueIn(rows, PHOTO, materialLabel('stomatal_sidedness')),
        ObjectProperties.valueIn(rows, PHOTO, materialLabel('submodel')),
        ObjectProperties.valueIn(rows, PHOTO, materialLabel('vcmax25'))
      ]).toEqual(['Two Sided', '0.6', 'Farquhar Model', '512.5'])
      await closeDetail(name)
    })

    it('an ORDINARY enum reads back RAW while the SELECTOR enum is humanized', async () => {
      // The rule buildMaterialSections actually implements is narrower than "enums
      // are humanized": it humanizes ONLY the enums that carry enumLabels, i.e.
      // the ones driving a conditional group. Everything else passes through
      // untouched. Both kinds live on the same Photosynthesis card, so one popup
      // proves the split — and asserting them together is what makes this a rule
      // rather than two unrelated observations.
      const { cardId, name } = await newMaterialWithCard(PHOTO)
      await MaterialProperties.setEnum(cardId, 'two_sided_heat_transfer', 'One Sided')
      await pickSubmodel(cardId, PHOTO, FARQUHAR)
      await MaterialProperties.setField(cardId, 'alpha', '2.5')
      await MaterialProperties.commitField()
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, PHOTO)
      // The catalog says which is which, so this stays true if a migration turns
      // the flag into a group-driving selector.
      expect(isSelectorEnum(PHOTO, 'two_sided_heat_transfer')).toBe(false)
      expect(isSelectorEnum(PHOTO, 'submodel')).toBe(true)
      expect([
        ObjectProperties.valueIn(rows, PHOTO, materialLabel('two_sided_heat_transfer')),
        ObjectProperties.valueIn(rows, PHOTO, materialLabel('submodel'))
      ]).toEqual([
        // Raw: the stored value IS 'One Sided', spaces and all.
        readOnlyEnumValue(PHOTO, 'two_sided_heat_transfer', 'One Sided'),
        // Humanized from the stored code, NOT the group name the user clicked.
        readOnlyEnumValue(PHOTO, 'submodel', FARQUHAR)
      ])
      expect(ObjectProperties.valueIn(rows, PHOTO, materialLabel('two_sided_heat_transfer'))).toBe(
        'One Sided'
      )
      await closeDetail(name)
    })

    it('the coefficients survive RESELECTING the ground', async () => {
      // Differential, and not the trivial round trip it looks like: selecting away
      // and back re-enters ObjectPropertiesForm through the geometry DETAIL CACHE
      // (a re-click is served without a GET), so the draft, its material baseline
      // and the popup's members are all rebuilt from cached state. A rebuild that
      // dropped the assigned group's members — or kept the row but lost its
      // properties — would leave the popup showing the type's shape with every
      // value blank, which is precisely what a user reports as "my settings
      // disappeared".
      const { cardId, name } = await newMaterialWithCard(PHOTO)
      await pickSubmodel(cardId, PHOTO, FARQUHAR)
      const values = spreadValues(PHOTO, FARQUHAR_PROPS)
      await fillFields(cardId, values)
      await saveCard(cardId)

      const target = await groundWearing(name)
      const other = await trackGround()
      await ObjectProperties.waitForOpen()
      // The second +Ground opened ITS form, so this is a genuine move away.
      await waitForAssigned([])

      await Geometry.selectRow(target)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name], TIMEOUTS.MUTATION)
      const rows = await readDetail(name, PHOTO)
      expect(readBack(rows, PHOTO, FARQUHAR_PROPS)).toEqual(expectedBack(values, FARQUHAR_PROPS))
      await closeDetail(name)
      // Named so the differential is on the record: `other` exists to make the
      // reselect real, and it must still be carrying nothing.
      await Geometry.selectRow(other)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([])
    })

    it('EDITING a Farquhar coefficient after assignment updates the GROUND, with no reload', async () => {
      // The write-through seam. ObjectPropertiesForm.membersFor PREFERS the
      // Materials detail cache over the object GET's baseline precisely so an
      // edit made in the Materials editor shows on the ground immediately — and
      // the baseline, frozen at assign time, still holds the OLD numbers. So if
      // the preference were the other way round this test reads the pre-edit
      // values and fails, while every other test in this file still passes.
      //
      // The ground IS re-selected, because RightPanel renders one form at a time
      // and opening the material unmounts the ground's — but nothing is reloaded
      // and no object is refetched, so the new values can only have come from
      // that cache.
      const { materialId, cardId, name } = await newMaterialWithCard(PHOTO)
      await pickSubmodel(cardId, PHOTO, FARQUHAR)
      await fillFields(cardId, { vcmax25: '100', topt_jmax: '300', dhd_tpu: '250' })
      await saveCard(cardId)

      const groundId = await groundWearing(name)
      const before = await readDetail(name, PHOTO)
      expect(readBack(before, PHOTO, ['vcmax25', 'topt_jmax', 'dhd_tpu'])).toEqual([
        'Vcmax_25=100',
        'Topt_Jmax=300',
        'dHd_TPU=250'
      ])
      await closeDetail(name)

      await Materials.openMaterial(materialId)
      await MaterialProperties.waitForOpen()
      // Card ids restart at 1 on a reopen, so the id captured above is worthless.
      const reopened = await awaitCardForType(PHOTO)
      // Editing a SAVED card: the TYPE is locked, its VALUES are not.
      expect(await MaterialProperties.typeLocked(reopened)).toBe(true)
      await fillFields(reopened, { vcmax25: '900', topt_jmax: '350' })
      await saveCard(reopened)

      await Geometry.selectRow(groundId)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name], TIMEOUTS.MUTATION)
      const after = await readDetail(name, PHOTO)
      expect(readBack(after, PHOTO, ['vcmax25', 'topt_jmax', 'dhd_tpu'])).toEqual([
        'Vcmax_25=900',
        'Topt_Jmax=350',
        // Untouched — so the two above are an EDIT arriving, not the popup being
        // rebuilt wholesale from somewhere else.
        'dHd_TPU=250'
      ])
      await closeDetail(name)
    })
  })

  // ══ 2. Stomatal Conductance — all four sub-models on a ground ════════════

  describe('Stomatal Conductance — all four sub-models on a ground', () => {
    /**
     * gamma_co2 is set to the same value in every generated test below.
     *
     * It is the type's one TOP-LEVEL numeric field, so it must appear under
     * whichever sub-model is chosen — and giving it a value makes each generated
     * test assert that, rather than only proving the row exists.
     */
    const GAMMA = '42'

    // Generated from the catalog, not copy-pasted four times: SUBMODELS is built
    // from the same table the app reads, so a fifth sub-model added by a
    // migration produces two more tests here with no edit.
    for (const [stored, group] of STOMATAL_SUBMODELS) {
      it(`${group.label} — its own parameters, and ONLY its own, land on the ground`, async () => {
        // Two claims, and the second is why this asserts an EXACT label set
        // instead of probing for the fields it expects:
        //  1. every coefficient of the chosen sub-model reaches the ground with
        //     the value that was typed;
        //  2. NONE of the other three sub-models' coefficients come with it.
        //
        // (2) cannot be written as "the popup does not contain 'gs, o'": three of
        // the four sub-models label a field exactly that, and two share 'a1'. The
        // catalog reuses labels because the groups are mutually exclusive, so the
        // only sound discriminator is the WHOLE set of labels under the section —
        // {gs,o; a1}, {gs,o; a1; Do}, {gs,o; g1} and {Em; io; k; b} are pairwise
        // different, and a leaked group changes it.
        const { cardId, name } = await newMaterialWithCard(STOMATAL)
        await pickSubmodel(cardId, STOMATAL, stored)
        const values = { ...spreadValues(STOMATAL, group.props), gamma_co2: GAMMA }
        await fillFields(cardId, values)
        await saveCard(cardId)

        await groundWearing(name)

        const rows = await readDetail(name, STOMATAL)
        // 1 — the values, per property, named in the diff.
        expect(readBack(rows, STOMATAL, [...group.props, 'gamma_co2'])).toEqual(
          expectedBack(values, [...group.props, 'gamma_co2'])
        )
        // 2 — the shape: the type's top-level fields plus THIS group's, nothing
        // more. Derived from the catalog so it moves with a migration.
        expect(sectionLabels(rows, STOMATAL)).toEqual(
          [...topLevelProps(STOMATAL).map((p) => p.property), ...group.props]
            .map(materialLabel)
            .sort()
        )
        await closeDetail(name)
      })

      it(`${group.label} reads back on the ground as the stored code "${stored}"`, async () => {
        // The DEVIATION from describe 1, generated across all four so it is a
        // rule and not a Farquhar quirk: the user clicks "${group.label}" and the
        // ground reports "${stored}". humanizeProperty only touches the first
        // letter of an acronym and splits on underscores, so BWB / BBL / BMF come
        // back unchanged while `farquhar_model` becomes `Farquhar Model` — which
        // is why this asserts through readOnlyEnumValue rather than a literal.
        const { cardId, name } = await newMaterialWithCard(STOMATAL)
        await pickSubmodel(cardId, STOMATAL, stored)
        const formLabel = (await MaterialProperties.enumState(cardId, SELECTOR[STOMATAL])).label
        await fillFields(cardId, spreadValues(STOMATAL, group.props))
        await saveCard(cardId)

        await groundWearing(name)

        const rows = await readDetail(name, STOMATAL)
        const onGround = ObjectProperties.valueIn(rows, STOMATAL, materialLabel('stomatal_model'))
        expect(formLabel).toBe(group.label)
        expect(onGround).toBe(readOnlyEnumValue(STOMATAL, 'stomatal_model', stored))
        expect(onGround).toBe(stored)
        expect(onGround).not.toBe(group.label)
        await closeDetail(name)
      })
    }

    it('Gamma_CO2 is TOP-LEVEL — it travels with the material, the other sub-models do not', async () => {
      // The generated tests above show the Gamma_CO2 ROW under all four
      // sub-models. This one shows the other half of the top-level/conditional
      // split inside a single popup: the top-level value is there, and the two
      // labels unique to the sub-models NOT chosen ('Do' is BBL's alone, 'g1' is
      // Medlyn's) are absent as rows entirely — not blank, absent. A popup that
      // rendered every group the catalog lists would show three sub-models the
      // user never picked, each with empty values, implying settings the material
      // does not have. That is the bug buildMaterialSections' selector filter
      // exists to prevent.
      const { cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'BMF')
      await fillFields(cardId, { gamma_co2: '750.25', bmf_em: '1000', bmf_i0: '20' })
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, STOMATAL)
      expect(ObjectProperties.valueIn(rows, STOMATAL, materialLabel('gamma_co2'))).toBe('750.25')
      const labels = sectionLabels(rows, STOMATAL)
      expect(labels).toContain(materialLabel('bmf_k'))
      expect(labels).not.toContain(materialLabel('bbl_d0'))
      expect(labels).not.toContain(materialLabel('medlyn_g1'))
      await closeDetail(name)
    })

    it('bbl_d0 accepts its 5000000 maximum, refuses 5000000.1, and SAVES onto a ground', async () => {
      // The widest bound but one in the whole catalog, and the pair matters: on
      // its own "5000000 is accepted" is also satisfied by a field with no upper
      // bound at all. The rejection just past it is what pins the number.
      //
      // Then it is SAVED and read off a ground, which the catalog sweep never
      // does — a boundary that validates but is mangled on the way to storage
      // (rounded, or re-rendered in exponential form) would pass every test in
      // materials.test.ts.
      const def = propDef(STOMATAL, 'bbl_d0')
      const { cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'BBL')

      await MaterialProperties.setField(cardId, 'bbl_d0', justAboveMax(def))
      const rejected = await MaterialProperties.fieldState(cardId, 'bbl_d0')
      expect(rejected.error).toBe(MATERIALS_MSG.valuesBetween(def.min, def.max))
      expect(rejected.invalid).toBe(true)
      // Everything below this line is an execute — the correcting write, the
      // save, the ground, the popup. See drainPageError.
      await drainPageError()

      await MaterialProperties.setField(cardId, 'bbl_d0', String(def.max))
      await MaterialProperties.commitField()
      const accepted = await MaterialProperties.fieldState(cardId, 'bbl_d0')
      expect(`${accepted.value} / ${accepted.error}`).toBe('5000000 / null')
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, STOMATAL)
      // String(5000000), not '5e+6': the popup formats nothing, and JS only
      // switches to exponential notation at 1e21.
      expect(ObjectProperties.valueIn(rows, STOMATAL, materialLabel('bbl_d0'))).toBe('5000000')
      await closeDetail(name)
    })

    it('bmf_k accepts its 10000000 maximum, refuses 10000000.1, and SAVES onto a ground', async () => {
      // The widest bound in the catalog. Same shape as bbl_d0 above and
      // deliberately a separate test: they are different properties in different
      // groups behind different selector values, and folding them together would
      // let one cover for the other.
      const def = propDef(STOMATAL, 'bmf_k')
      const { cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'BMF')

      await MaterialProperties.setField(cardId, 'bmf_k', justAboveMax(def))
      const rejected = await MaterialProperties.fieldState(cardId, 'bmf_k')
      expect(rejected.error).toBe(MATERIALS_MSG.valuesBetween(def.min, def.max))
      expect(rejected.invalid).toBe(true)
      await drainPageError()

      await MaterialProperties.setField(cardId, 'bmf_k', String(def.max))
      await MaterialProperties.commitField()
      const accepted = await MaterialProperties.fieldState(cardId, 'bmf_k')
      expect(`${accepted.value} / ${accepted.error}`).toBe('10000000 / null')
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, STOMATAL)
      expect(ObjectProperties.valueIn(rows, STOMATAL, materialLabel('bmf_k'))).toBe('10000000')
      await closeDetail(name)
    })

    it('SWITCHING the sub-model after assignment swaps what the ground shows', async () => {
      // The full lifecycle, and the only test in the file where a ground's
      // read-only view has to LOSE rows. Three things have to line up:
      //  - the form's selector-hygiene effect blanks the abandoned coefficients;
      //  - the card's second save is a PUT (full replace), so the backend nulls
      //    what the payload omits;
      //  - buildMaterialSections filters groups on the member's CURRENT selector,
      //    so the abandoned group stops being rendered at all.
      // A break in any one of them leaves a ground advertising a sub-model it no
      // longer has, with stale numbers under it.
      const { materialId, cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'BBL')
      await fillFields(cardId, { gamma_co2: '10', bbl_gs0: '0.4', bbl_a1: '9', bbl_d0: '1500' })
      await saveCard(cardId)

      const groundId = await groundWearing(name)
      const before = await readDetail(name, STOMATAL)
      expect(ObjectProperties.valueIn(before, STOMATAL, materialLabel('stomatal_model'))).toBe('BBL')
      expect(ObjectProperties.valueIn(before, STOMATAL, materialLabel('bbl_d0'))).toBe('1500')
      await closeDetail(name)

      await Materials.openMaterial(materialId)
      await MaterialProperties.waitForOpen()
      const reopened = await awaitCardForType(STOMATAL)
      await pickSubmodel(reopened, STOMATAL, 'Medlyn')
      await fillFields(reopened, { medlyn_gs0: '0.2', medlyn_g1: '6' })
      await saveCard(reopened)

      await Geometry.selectRow(groundId)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name], TIMEOUTS.MUTATION)
      const after = await readDetail(name, STOMATAL)
      expect(ObjectProperties.valueIn(after, STOMATAL, materialLabel('stomatal_model'))).toBe(
        'Medlyn'
      )
      expect(readBack(after, STOMATAL, ['medlyn_gs0', 'medlyn_g1'])).toEqual([
        'gs, o=0.2',
        'g1=6'
      ])
      // GONE, not blank: valueIn returns its self-describing miss for a row that
      // is not rendered, which is exactly what distinguishes "the group went" from
      // "the group is still here with nothing in it".
      expect(sectionLabels(after, STOMATAL)).not.toContain(materialLabel('bbl_d0'))
      expect(ObjectProperties.valueIn(after, STOMATAL, materialLabel('bbl_d0'))).toBe(
        `<no "${materialLabel('bbl_d0')}" row in ${STOMATAL}>`
      )
      // The top-level value rides through the switch untouched.
      expect(ObjectProperties.valueIn(after, STOMATAL, materialLabel('gamma_co2'))).toBe('10')
      await closeDetail(name)
    })
  })

  // ══ 3. read-only fidelity ════════════════════════════════════════════════

  describe('read-only fidelity', () => {
    it('numbers are NOT reformatted — they read back character for character', async () => {
      // `asDisplay` is `String(v)` and nothing else: no rounding, no thousands
      // separator, no unit, no fixed decimal places. Worth pinning because a
      // read-only view is exactly where "let's make the numbers pretty" lands,
      // and this popup is a scientific instrument's reported state — 0.0001
      // rounded to two places is 0, and 1,234.5678 is not a number the user can
      // copy back into the form.
      //
      // The two values are chosen to break the two likeliest treatments: one is
      // small enough to vanish under rounding, the other large enough to attract
      // a separator.
      const { cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'BBL')
      await fillFields(cardId, { bbl_gs0: '0.0001', bbl_d0: '1234.5678' })
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, STOMATAL)
      expect(readBack(rows, STOMATAL, ['bbl_gs0', 'bbl_d0'])).toEqual([
        'gs, o=0.0001',
        'Do=1234.5678'
      ])
      await closeDetail(name)
    })

    it('a value typed as "1e3" is stored EXPANDED and reads back as 1000', async () => {
      // The expansion belongs to the FORM, not to the popup — handleFieldBlur
      // rewrites the field text through expandForDisplay — so this test asserts
      // both ends and would fail differently depending on which end broke:
      // a form that stopped expanding leaves the field reading '1e3' (first
      // assertion), while a popup that started reformatting would turn '1000'
      // back into something else (second).
      //
      // materials.test.ts already owns the FORM half ('"1e3" blur-EXPANDS to
      // 1000 and is accepted — the field TEXT is rewritten'). What has never been
      // asked is which of the two strings ends up STORED, and therefore what the
      // ground reports: the popup formats nothing, so if the form ever stopped
      // expanding, a ground would start showing its user 'Values: 1e3'.
      //
      // Not an idle case: the exponent is the one route the keystroke guard has
      // to admit — it must, or the 'e' of a valid '1e3' would flash an error on
      // its way in — and an INCOMPLETE one ('1e') is the only reachable path to
      // "Invalid Input" anywhere in this app.
      const { cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'BMF')
      await MaterialProperties.setField(cardId, 'bmf_k', '1e3')
      await MaterialProperties.commitField()
      await browser.waitUntil(
        async () => (await MaterialProperties.fieldState(cardId, 'bmf_k')).value === '1000',
        {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'blur never expanded "1e3" in the form — the popup half cannot be trusted'
        }
      )
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, STOMATAL)
      const onGround = ObjectProperties.valueIn(rows, STOMATAL, materialLabel('bmf_k'))
      expect(onGround).toBe('1000')
      expect(onGround).not.toBe('1e3')
      await closeDetail(name)
    })

    it('a field the material never set still gets a ROW, with an EMPTY value', async () => {
      // The popup lists every property of an active group, set or not, so the
      // reader sees the type's full shape and which of it is still blank. That is
      // why ObjectProperties.valueIn returns a self-describing miss instead of ''
      // for a row that is absent: the two cases mean opposite things — "the
      // material has no answer for this" versus "this view is not showing the
      // field at all" — and must never look alike in a diff.
      //
      // Both halves are asserted from one popup: the set field carries its value,
      // the unset one is present and blank.
      const { cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'BBL')
      // bbl_d0 and gamma_co2 deliberately left alone. toNativeProperties skips a
      // blank field entirely, and refreshDetailCache filters '' out again, so
      // neither reaches the member's property bag.
      await fillFields(cardId, { bbl_gs0: '0.7', bbl_a1: '12' })
      await saveCard(cardId)

      await groundWearing(name)

      const rows = await readDetail(name, STOMATAL)
      expect(readBack(rows, STOMATAL, ['bbl_gs0', 'bbl_a1'])).toEqual(['gs, o=0.7', 'a1=12'])
      // Listed…
      expect(sectionLabels(rows, STOMATAL)).toContain(materialLabel('bbl_d0'))
      expect(sectionLabels(rows, STOMATAL)).toContain(materialLabel('gamma_co2'))
      // …and empty, which is NOT the same string a missing row would produce.
      expect(readBack(rows, STOMATAL, ['bbl_d0', 'gamma_co2'])).toEqual(['Do=', 'Gamma_CO2='])
      await closeDetail(name)
    })

    it('TWO material types render TWO sections, and a shared label is read per SECTION', async () => {
      // One material, two type cards, and the same label carrying DIFFERENT values
      // in each — which is the only shape that can catch a section-blind reader.
      //
      // Photosynthesis and Energy Balance are the pair, not the Photosynthesis +
      // Stomatal Conductance one might reach for first: those two share no label
      // at all, so a test built on them could not make this point. These two share
      // BOTH 'Heat Transfer Flag' and 'Stomatal Sidedness'. The flag is
      // MATERIAL-WIDE (materialBlueprint.MATERIAL_WIDE_PROPERTIES — a material is
      // one- or two-sided as a whole, so setting it on one card sets it on all),
      // but `stomatal_sidedness` is an ordinary per-type property and can differ,
      // which is what makes the two rows genuinely distinguishable.
      const { cardId, name } = await newMaterialWithCard(PHOTO)
      await MaterialProperties.setField(cardId, 'stomatal_sidedness', '0.25')
      await MaterialProperties.commitField()
      await pickSubmodel(cardId, PHOTO, FARQUHAR)
      await MaterialProperties.setField(cardId, 'vcmax25', '333')
      await MaterialProperties.commitField()
      await saveCard(cardId)
      // Collapse the saved card: an open Photosynthesis card is 17 fields tall and
      // the NEXT card's Save has to be reached by a real WebDriver click inside
      // the panel's scroller. The card keeps its type Select either way — that
      // sits outside the `open &&` gate.
      await MaterialProperties.toggleCard(cardId)

      const energyCard = await MaterialProperties.addCard()
      await MaterialProperties.pickType(energyCard, ENERGY)
      await browser.waitUntil(
        async () => MaterialProperties.hasField(energyCard, 'stomatal_sidedness'),
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the Energy Balance card never rendered its fields' }
      )
      await fillFields(energyCard, { stomatal_sidedness: '0.75', heat_capacity: '4200' })
      await saveCard(energyCard)

      await groundWearing(name)

      await ObjectProperties.openMaterialDetail(name)
      await browser.waitUntil(
        async () => (await ObjectProperties.detailSections(name)).length === 2,
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: "the popup never listed both of the material's type sections"
        }
      )
      expect([...(await ObjectProperties.detailSections(name))].sort()).toEqual(
        [ENERGY, PHOTO].sort()
      )
      const rows = await ObjectProperties.detailRows(name)
      // THE POINT: one label, two sections, two answers. A reader that matched on
      // the label alone would return the same value twice.
      expect([
        ObjectProperties.valueIn(rows, PHOTO, materialLabel('stomatal_sidedness')),
        ObjectProperties.valueIn(rows, ENERGY, materialLabel('stomatal_sidedness'))
      ]).toEqual(['0.25', '0.75'])
      // …and each section keeps its own type's parameters.
      expect([
        ObjectProperties.valueIn(rows, PHOTO, materialLabel('vcmax25')),
        ObjectProperties.valueIn(rows, ENERGY, materialLabel('heat_capacity'))
      ]).toEqual(['333', '4200'])
      await closeDetail(name)
    })

    it('sections are COLLAPSIBLE and open by default — collapsing one leaves the other alone', async () => {
      // DEVIATION: the user story calls these TABS. They are collapsible cards —
      // there is no role="tab" in the popup, and more than one can be open at
      // once, which is the behaviour a tab strip specifically cannot have.
      //
      // The differential is the OTHER section: a collapse implemented by hiding
      // the popup body, or by keying every card off one flag, would take both
      // sections' rows with it and still satisfy "the collapsed section's rows
      // are gone".
      const { cardId, name } = await newMaterialWithCard(PHOTO)
      await pickSubmodel(cardId, PHOTO, FARQUHAR)
      await MaterialProperties.setField(cardId, 'vcmax25', '333')
      await MaterialProperties.commitField()
      await saveCard(cardId)
      await MaterialProperties.toggleCard(cardId)

      const energyCard = await MaterialProperties.addCard()
      await MaterialProperties.pickType(energyCard, ENERGY)
      await browser.waitUntil(async () => MaterialProperties.hasField(energyCard, 'heat_capacity'), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the Energy Balance card never rendered its fields'
      })
      await fillFields(energyCard, { heat_capacity: '4200' })
      await saveCard(energyCard)

      await groundWearing(name)

      await ObjectProperties.openMaterialDetail(name)
      await browser.waitUntil(
        async () => (await ObjectProperties.detailSections(name)).length === 2,
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the popup never listed both type sections' }
      )
      // Open by DEFAULT — the popup tracks the COLLAPSED set, so an empty set is
      // every section expanded even for sections that arrive after it mounts.
      expect((await detailSectionState(name)).map((s) => s.expanded)).toEqual([true, true])

      await toggleDetailSection(name, PHOTO)
      await browser.waitUntil(
        async () =>
          (await detailSectionState(name)).find((s) => s.section === PHOTO)?.expanded === false,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the Photosynthesis section never collapsed' }
      )
      const collapsed = await ObjectProperties.detailRows(name)
      expect(collapsed.filter((r) => r.section === PHOTO)).toEqual([])
      // The other one is untouched, values and all.
      expect(ObjectProperties.valueIn(collapsed, ENERGY, materialLabel('heat_capacity'))).toBe(
        '4200'
      )

      await toggleDetailSection(name, PHOTO)
      await browser.waitUntil(
        async () =>
          (await ObjectProperties.detailRows(name)).some((r) => r.section === PHOTO),
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the Photosynthesis section never re-expanded' }
      )
      expect(
        ObjectProperties.valueIn(await ObjectProperties.detailRows(name), PHOTO, materialLabel('vcmax25'))
      ).toBe('333')
      await closeDetail(name)
    })

    it('the popup names AND carries the material the ground is wearing, not another', async () => {
      // The popup's only identity. Nothing else on the ground form says which
      // material you are reading — the sections are named after material TYPES,
      // which several materials in the library will share.
      //
      // WHAT THIS TEST MUST NOT BE, and was: a read of the aria-label.
      // `ObjectProperties.materialDetail(name)` SELECTS on
      // `[aria-label="{name} properties"]` and `openMaterialDetail` waits for that
      // node — so "the popup exists" and "its aria-label is {name} properties" are
      // the same statement made twice, and neither can fail once the open
      // returned. A popup rendering a DIFFERENT material's sections and values
      // under the right aria-label satisfied every line of it.
      //
      // So the differential is made three ways, none of them the selector:
      //  1. the popup's RENDERED header, a different node from the one the
      //     selector matched, carries the assigned material's name;
      //  2. its rows carry THIS material's coefficients — the bystander has no
      //     type card at all, so a popup fed from the wrong material could not
      //     produce them;
      //  3. the bystander, sitting unassigned in the library, is not addressable.
      const assigned = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(assigned.cardId, STOMATAL, 'BWB')
      await fillFields(assigned.cardId, { bwb_gs0: '0.3', bwb_a1: '11' })
      await saveCard(assigned.cardId)
      const bystanderId = await trackMaterial()
      const bystander = await materialNameOf(bystanderId)

      await groundWearing(assigned.name)

      const rows = await readDetail(assigned.name, STOMATAL)
      // 1 — the name the popup PRINTS, read off the header rather than the
      // attribute the element was found by.
      expect(await detailHeading(assigned.name)).toBe(assigned.name)
      // 2 — and the values under it are this material's.
      expect(readBack(rows, STOMATAL, ['bwb_gs0', 'bwb_a1'])).toEqual(['gs, o=0.3', 'a1=11'])
      // The composed copy is still worth pinning — the constant and the DOM are
      // checked against each other rather than a literal being repeated in two
      // places — but it is the weakest of the three claims, not the test.
      const label = await ObjectProperties.materialDetail(assigned.name).getAttribute('aria-label')
      expect(label).toBe(GEOMETRY_MATERIAL_MSG.detailTitle(assigned.name))
      // 3 — the unassigned material owns no popup.
      await expect(ObjectProperties.materialDetail(bystander)).not.toBeExisting()
      await closeDetail(assigned.name)
    })
  })

  // ══ 4. a sub-model material through the DROP path ════════════════════════

  describe('a sub-model material through the DROP path', () => {
    it('a DROP assigns immediately — its toast, no Save, and the coefficients on the ground', async () => {
      // The other way to put a material on a ground, and it behaves differently in
      // the way that matters: the picker's pick is a DRAFT that Save commits,
      // while a drop COMMITS on the spot — assignMaterialWorker POSTs and
      // ASSIGN_MATERIAL_SUCCEEDED folds the group into materialBaseline as well as
      // into draft.materials, so the form comes back CLEAN with nothing to save.
      //
      // The toast is the drop path's own: only TreeRow dispatches
      // assignMaterialWorker, so GEOMETRY_TOAST.materialAssigned is unreachable
      // from the right-panel Save, whose only toast is changesSaved.
      const { materialId, cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'Medlyn')
      const props = SUBMODELS['Stomatal Conductance'].groups.Medlyn.props
      const values = spreadValues(STOMATAL, props)
      await fillFields(cardId, values)
      await saveCard(cardId)

      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      const groundName = await groundNameOf(groundId)

      // Drain first so the create toasts cannot satisfy the wait, and let
      // waitForToast be the very next statement after the drop — toasts live
      // ~2.66s and anything costing a round-trip in between misses the window.
      await drainToasts()
      // The row id IS the library group id, which is what makes this payload the
      // same shape MaterialRow.handleDragStart writes and TreeRow.readMaterialDrop
      // parses — {groupId, name}, not the bare id array a geometry drag carries.
      await dragMaterialOnto({ groupId: materialId, name }, groundId)
      await waitForToast(GEOMETRY_TOAST.materialAssigned(name, groundName))

      await waitForAssigned([name], TIMEOUTS.MUTATION)
      // Committed, not staged.
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)

      const rows = await readDetail(name, STOMATAL)
      expect(readBack(rows, STOMATAL, props)).toEqual(expectedBack(values, props))
      await closeDetail(name)
    })

    it('a REPLACING drop swaps the sub-model the ground reports', async () => {
      // Two materials with DIFFERENT sub-models make the popup's contents
      // load-bearing in a way "which material is listed" cannot: reading the
      // displaced material's cache, or the ground's baseline from before the
      // replace, would still show BWB's coefficients under a ground that now
      // carries a Buckley-mott-farquhar material.
      //
      // The confirmation itself belongs to material-assignment.test.ts; it is
      // answered here only because a drop onto an occupied ground cannot proceed
      // without it.
      const first = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(first.cardId, STOMATAL, 'BWB')
      await fillFields(first.cardId, { bwb_gs0: '0.15', bwb_a1: '7' })
      await saveCard(first.cardId)

      const second = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(second.cardId, STOMATAL, 'BMF')
      await fillFields(second.cardId, { bmf_em: '2500', bmf_i0: '30', bmf_k: '900', bmf_b: '4' })
      await saveCard(second.cardId)

      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()

      await dragMaterialOnto({ groupId: first.materialId, name: first.name }, groundId)
      await waitForAssigned([first.name], TIMEOUTS.MUTATION)
      const before = await readDetail(first.name, STOMATAL)
      expect(ObjectProperties.valueIn(before, STOMATAL, materialLabel('bwb_a1'))).toBe('7')
      await closeDetail(first.name)

      await dragMaterialOnto({ groupId: second.materialId, name: second.name }, groundId)
      const dlg = await waitForOpenDialog()
      expect(dlg.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
      await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
      await waitForNoOpenDialog()

      await waitForAssigned([second.name], TIMEOUTS.MUTATION)
      const after = await readDetail(second.name, STOMATAL)
      expect(ObjectProperties.valueIn(after, STOMATAL, materialLabel('stomatal_model'))).toBe('BMF')
      expect(readBack(after, STOMATAL, ['bmf_em', 'bmf_i0', 'bmf_k', 'bmf_b'])).toEqual([
        'Em=2500',
        'io=30',
        'k=900',
        'b=4'
      ])
      // The displaced sub-model's group is not merely blank on the ground — its
      // rows belong to a material this ground no longer wears, so they are gone.
      expect(sectionLabels(after, STOMATAL)).not.toContain(materialLabel('bwb_a1'))
      await closeDetail(second.name)
    })

    it('a FAILED card save leaves the ground showing the PREVIOUS values', async () => {
      // The negative of 'EDITING a Farquhar coefficient after assignment updates
      // the GROUND'. refreshDetailCache runs only on
      // SAVE_PARAMETER_GROUP_SUCCEEDED, so a save that never lands must not move
      // the ground — an optimistic cache write would tell the user their ground
      // is wearing numbers the backend has never seen, and the lie would survive
      // until the next reload.
      //
      // The fault is on PUT specifically: the card's FIRST save is a POST (add the
      // material type) and every later one a PUT (replace its properties), so this
      // fails the edit without touching the setup.
      const { materialId, cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'BWB')
      await fillFields(cardId, { bwb_gs0: '0.25', bwb_a1: '8' })
      await saveCard(cardId)

      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      await dragMaterialOnto({ groupId: materialId, name }, groundId)
      await waitForAssigned([name], TIMEOUTS.MUTATION)

      await Materials.openMaterial(materialId)
      await MaterialProperties.waitForOpen()
      const reopened = await awaitCardForType(STOMATAL)
      await fillFields(reopened, { bwb_a1: '44' })

      await withApiFault('PUT', '/library/groups/', async () => {
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(reopened), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'editing a saved card never re-opened its Save'
        })
        await revealSave(reopened)
        // NOT MaterialProperties.saveCard: it settles on Save going disabled,
        // which a FAILED save never does (the card stays dirty and offers a
        // retry), so it would burn the whole MUTATION budget before failing for
        // the wrong reason. The rendered card error is the deterministic oracle.
        await MaterialProperties.cardSave(reopened).click()
        await browser.waitUntil(async () => (await MaterialProperties.cardError(reopened)) !== null, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'a failed card save reported nothing on the card'
        })
      })

      await Geometry.selectRow(groundId)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name], TIMEOUTS.MUTATION)
      const rows = await readDetail(name, STOMATAL)
      expect(readBack(rows, STOMATAL, ['bwb_gs0', 'bwb_a1'])).toEqual(['gs, o=0.25', 'a1=8'])
      expect(ObjectProperties.valueIn(rows, STOMATAL, materialLabel('bwb_a1'))).not.toBe('44')
      await closeDetail(name)
    })

    it('the assigned coefficients survive REOPENING the project', async () => {
      // Every other read in this file can be served from a renderer cache — the
      // Materials detail cache the popup prefers, or the geometry detail cache a
      // reselect is served from. This one cannot: reopening the project refreshes
      // the renderer, so the cache is empty and the popup is fed by real backend
      // responses. It is the only test here that proves the sub-model's values
      // were PERSISTED against the ground's material rather than merely displayed.
      //
      // Runs LAST in the file deliberately: it navigates away from the shared
      // project and comes back to it, and the row ids survive (they are backend
      // ids), so the shared afterEach can still reach everything it tracked.
      const { materialId, cardId, name } = await newMaterialWithCard(STOMATAL)
      await pickSubmodel(cardId, STOMATAL, 'BMF')
      const props = SUBMODELS['Stomatal Conductance'].groups.BMF.props
      const values = { ...spreadValues(STOMATAL, props), gamma_co2: '365' }
      await fillFields(cardId, values)
      await saveCard(cardId)

      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      const groundName = await groundNameOf(groundId)
      await dragMaterialOnto({ groupId: materialId, name }, groundId)
      await waitForAssigned([name], TIMEOUTS.MUTATION)

      await reopenByName(project.name)
      await Geometry.waitForTree()
      // Re-derived by NAME rather than trusting the captured id across a refresh —
      // the same discipline the sync-dot test in material-assignment.test.ts uses.
      // POLLED, because waitForTree settles on any terminal state and the listNodes
      // GET can land a beat later; a bare read would return null and the failure
      // would read as "the ground is gone" rather than "the tree is still loading".
      await browser.waitUntil(async () => (await Geometry.idForName(groundName)) !== null, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: `"${groundName}" never came back after reopening the project`
      })
      const reopenedId = await Geometry.idForName(groundName)
      // They DO match: geo-row-{id} carries the backend object id, not a
      // render-time key, so a reopen cannot renumber it — which is also what lets
      // the shared afterEach still delete this row by its original id.
      expect(reopenedId).toBe(groundId)
      await Geometry.selectRow(reopenedId as string)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name], TIMEOUTS.MUTATION)

      const rows = await readDetail(name, STOMATAL)
      expect(readBack(rows, STOMATAL, [...props, 'gamma_co2'])).toEqual(
        expectedBack(values, [...props, 'gamma_co2'])
      )
      // …and the sub-model itself came back, still as the stored code.
      expect(ObjectProperties.valueIn(rows, STOMATAL, materialLabel('stomatal_model'))).toBe('BMF')
      await closeDetail(name)
    })
  })
})
