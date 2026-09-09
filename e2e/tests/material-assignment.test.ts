/**
 * Material assignment — putting a material from the GLOBAL library onto a ground.
 *
 * Covers: the "Select Materials" picker (both of its shapes, its search, and the
 * single-select radio rule), picking as a DRAFT change, the Replace confirmation
 * that SAVE — not the picker — raises, the CONDITIONAL unassign (silent for a
 * draft pick, confirmed for a saved one), the read-only material properties
 * popup, a failed save, and the amber `stale` sync dot.
 *
 * Out of scope, deliberately:
 *  - DRAG-AND-DROP assign (a Materials row onto a geometry or a GROUP row).
 *    e2e/support/dnd.ts exports MATERIAL_MIME but nothing can USE it: its only
 *    drag entry point, dragRowOnto(), hardcodes GEO_MIME, and fireDragOver /
 *    fireDrop are module-private. HTML5 drag needs dragover and drop as SEPARATE
 *    browser.execute calls with a polled settle between (handleDrop reads React
 *    state written by handleDragOver), so re-rolling that inline here would
 *    duplicate the one piece of machinery this suite has deliberately
 *    centralised. Nothing below needs it. The drop path is also the ONLY producer
 *    of GEOMETRY_TOAST.materialAssigned — see the note on Save's toast below.
 *  - The `drift` sync dot. It needs a FROZEN assignment (sync:false) and every
 *    client write hardcodes sync:true (saga.updateObjectWorker's `sync: true`,
 *    service.assignMaterialGroup), so GEOMETRY_MATERIAL_MSG.driftTitle is
 *    UNREACHABLE from the GUI. Not attempted.
 *
 * ── State model ───────────────────────────────────────────────────────────
 * Shared provisioning, the geometry.test.ts model: ONE project for the whole
 * file. This spec needs BOTH sides, so `before` enters through enterGeometry and
 * then waits the Materials toolbar out as well.
 *
 * Each test creates the rows it needs via trackGround() / trackMaterial(), and
 * afterEach deletes exactly those — GROUNDS FIRST, then materials, so a material
 * is never deleted while a ground still carries it. Cleanup matters more here
 * than in either parent spec: geometry is scenario-scoped but THE MATERIAL
 * LIBRARY IS GLOBAL, so a leaked material follows you into every later test,
 * every later project, and every later run.
 *
 * Rules this file depends on:
 *  - NEVER assert an absolute picker row count. The library is global and carries
 *    other runs' leftovers; assert only on rows this test created.
 *  - NEVER save a ground above ~100 resolution cells. Nothing here touches a
 *    resolution field, so every ground stays at the 1x1 blueprint default.
 *  - +Ground opens THAT ground's form. After a second create the panel shows the
 *    new one — select the row you mean before picking a material for it. The same
 *    goes for +Add Materials, which swaps this form for the MATERIAL form: every
 *    test below creates its materials FIRST and its ground last.
 *
 * ── Two surfaces that behave unlike anything else in this app ─────────────
 * 1. BOTH POPUPS ARE PORTALLED to document.body, and AnchoredPopup returns null
 *    when closed. So isExisting() IS a valid closed-oracle for a popup — the
 *    opposite of every accordion and panel body here, which hide with
 *    display:none and stay mounted.
 * 2. An open AnchoredPopup lays a `fixed inset-0 z-40` overlay across the panel,
 *    so a WebDriver click on anything beneath it is intercepted. That is why the
 *    page object clicks in-page, and why afterEach sweeps a leaked popup as well
 *    as a leaked dialog.
 *
 * THREE dialogs live on this one form — Delete (the name-row trash), Unassign (a
 * material's trash) and Replace (raised by Save) — plus one per tree row. All
 * dialog reads go through support/dialogs.ts, which scopes to `[open]` and
 * excludes the header ×.
 *
 * ── Deviations ────────────────────────────────────────────────────────────
 * Several assertions contradict the supplied user story and are written against
 * SHIPPED behaviour. Each is marked DEVIATION inline.
 */

import Geometry from '../pages/Geometry.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import Materials from '../pages/Materials.page'
import ObjectProperties, { type DetailRow } from '../pages/ObjectProperties.page'
import { GEOMETRY_MATERIAL_MSG, GEOMETRY_TOAST } from '../constants/geometry'
import { TIMEOUTS } from '../config/timeouts'
import {
  enterGeometry,
  reloadToHome,
  reopenByName,
  staysFalse,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import {
  clickDialogButton,
  countOpenDialogs,
  waitForNoOpenDialog,
  waitForOpenDialog
} from '../support/dialogs'
import { MATERIALS_MSG, MATERIALS_TOAST, materialLabel } from '../constants/materials'
import {
  MATERIAL_MIME,
  dragMaterialOnto,
  dragRowOnto,
  readMaterialDragPayload
} from '../support/dnd'
import { recordMeshFetches, waitForMeshFetch } from '../support/viewport3d'
import { clearApiFaults, withApiFault } from '../support/faults'
import { drainToasts, waitForToast } from '../support/toasts'

describe('Material assignment', () => {
  /** Grounds created by the running test, oldest first. */
  let grounds: string[] = []
  /** Materials created by the running test, oldest first. */
  let materials: string[] = []

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

  /** Create a material and return its auto-assigned Material.NNN name. */
  const newMaterial = async (): Promise<string> => materialNameOf(await trackMaterial())

  /**
   * Open the picker AND wait for its contents.
   *
   * aria-expanded on the Select button flips on the click, but AnchoredPopup
   * renders its children only after a measurement pass (`measurement &&
   * children(...)`) — so the button alone is not a settle. The heading is the
   * first thing BOTH shapes paint, which is why pickerState() keys on it rather
   * than on the radiogroup.
   */
  const openPicker = async (): Promise<void> => {
    await ObjectProperties.openMaterialPicker()
    await browser.waitUntil(async () => (await ObjectProperties.pickerState()).heading !== null, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Select Materials popup opened but never rendered its contents'
    })
  }

  /**
   * Pick a material by name.
   *
   * EVERY pick closes the popup — applyMaterialPick and the already-assigned
   * branch both call closeMaterialPopup — so the close is the settle for the
   * happy path and the info-toast path alike.
   */
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
   * start of the wait, not at the timeout.
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
      {
        timeout,
        timeoutMsg: `the Materials section never listed exactly [${names.join(', ')}]`
      }
    )
  }

  /**
   * Press Save, having first proved it is actually available.
   *
   * Without the gate a disabled Save clicks nothing, and every "the save landed"
   * oracle downstream is satisfied by the button that was disabled all along — a
   * pass for the wrong reason.
   */
  const clickSave = async (): Promise<void> => {
    await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Save never enabled — the form did not become dirty'
    })
    await ObjectProperties.saveButton.click()
  }

  /**
   * Wait for a save to actually LAND.
   *
   * `disabled` alone is NOT a settle, which is why ObjectProperties.save() is not
   * used here: the button is disabled both while the PATCH is in flight
   * (`draft.saving`) and once it has landed and cleared `dirty`, so a poll can
   * pass a millisecond after the click, before anything left the renderer. That
   * matters enormously on this form — stageReplace() depends on materialBaseline
   * having been rewritten by UPDATE_OBJECT_SUCCEEDED before the second pick, and
   * a premature return would leave the baseline empty and Save would never raise
   * the Replace dialog at all.
   *
   * The LABEL is the discriminator: it reads "Saving…" for exactly the in-flight
   * window (ObjectPropertiesForm renders `draft.saving ? 'Saving…' : 'Save'`), so
   * the settle is "back to Save, and no longer offered".
   */
  const waitForSaveSettled = async (): Promise<void> => {
    await browser.waitUntil(
      async () => {
        const label = (await ObjectProperties.saveButton.getText()).trim()
        return label === 'Save' && !(await ObjectProperties.saveEnabled())
      },
      {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the save never landed (Save never went quiet again)'
      }
    )
  }

  /** Press Save and wait for the write to land. Not for the Replace path. */
  const saveForm = async (): Promise<void> => {
    await clickSave()
    await waitForSaveSettled()
  }

  /**
   * Force every open AnchoredPopup shut.
   *
   * The overlay's own onClick IS the popup's onClose, so clicking it in-page
   * closes whichever popup is up without the caller knowing which. Dispatched on
   * the node directly: an open modal <dialog> sits in the top layer above it, so
   * a WebDriver click would be intercepted.
   *
   * NOTE `anchored-popup-overlay` is a real testid (components/AnchoredPopup) but
   * is NOT listed in CLAUDE.md section 4 — worth adding there.
   *
   * Cleanup only — never use this to dismiss a popup a test is asserting on.
   */
  const sweepPopups = async (): Promise<void> => {
    await browser.execute(() => {
      document
        .querySelectorAll('[data-testid="anchored-popup-overlay"]')
        .forEach((el) => (el as HTMLElement).click())
    })
  }

  /**
   * A ground carrying material `a` ON THE BACKEND with `b` picked over it in the
   * draft — the exact state, and the only one, in which Save raises Replace
   * (saveReplacesMaterial = a new pick AND a baseline group the draft dropped).
   */
  const stageReplace = async (): Promise<{ groundId: string; a: string; b: string }> => {
    const a = await newMaterial()
    const b = await newMaterial()
    const groundId = await trackGround()
    await ObjectProperties.waitForOpen()
    await pick(a)
    await saveForm()
    await pick(b)
    await waitForAssigned([b])
    return { groundId, a, b }
  }

  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
    // enterGeometry gates on the object-type catalog and the tree. The picker
    // additionally reads the material LIBRARY, which only the left panel's
    // <Materials/> fetches — so wait that side out too. (Every test that needs a
    // non-empty library also creates a material first, and Materials.addMaterial
    // does not return until the row is in the list, which is the real proof the
    // list has loaded.)
    await enterGeometry('matassign')
    await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: '+ Add Materials never became enabled (the material catalog never loaded)'
    })
  })

  afterEach(async () => {
    // Steps stay best-effort, but their errors are COLLECTED rather than
    // discarded, and the teardown ends by checking that both tracked sets are
    // actually gone. This file shares one project across every test AND writes
    // into the global material library, so a leak corrupts later tests in two
    // slices at once — and it surfaces far from its cause.
    const failures: string[] = []
    const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn()
      } catch (err) {
        failures.push(`${label} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Dialogs first. components/Dialog uses the native showModal(), so one left
    // open by a failed step sits in the TOP LAYER and makes every later click in
    // the file fail with "element click intercepted" — naming the wrong element.
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    // Then popups. A leaked AnchoredPopup's `fixed inset-0 z-40` overlay does the
    // same thing to everything under the right panel.
    await step('sweepPopups', () => sweepPopups())
    // Filters BEFORE deleting: a row filtered out of a list is not in the DOM, so
    // its trash cannot be clicked and cleanup would silently leak it.
    await step('Geometry.clearSearch', () => Geometry.clearSearch())
    await step('Materials.clearSearch', () => Materials.clearSearch())

    // GROUNDS FIRST. Deleting a material that is still assigned drags the eager
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
          (leakedMaterials.length ? `  materials (GLOBAL library): ${leakedMaterials.join(', ')}\n` : '') +
          (failures.length
            ? `  cleanup errors:\n    ${failures.join('\n    ')}`
            : '  No cleanup step reported an error, so the delete silently no-opped.')
      )
    }
  })

  // ══ The picker ═══════════════════════════════════════════════════════════

  describe('the Select Materials picker', () => {
    it('the Select button opens a picker PORTALLED to document.body, and closing UNMOUNTS it', async () => {
      // Differential, and the reason every selector in this file is unscoped:
      // AnchoredPopup renders into document.body, so a query scoped to the
      // Properties form finds nothing. It also returns null when closed — so
      // non-existence is a valid closed-oracle here, unlike the accordions and
      // panel bodies elsewhere in this app, which hide with display:none.
      await trackMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()

      expect(await ObjectProperties.pickerOpen()).toBe(false)
      await expect($('[role="radiogroup"][aria-label="Select Materials"]')).not.toBeExisting()

      await openPicker()
      expect((await ObjectProperties.pickerState()).heading).toBe(GEOMETRY_MATERIAL_MSG.pickerTitle)
      const portalled = await browser.execute(() => {
        const group = document.querySelector('[role="radiogroup"][aria-label="Select Materials"]')
        const form = document.querySelector('[data-testid="object-properties-form"]')
        return group !== null && form !== null && !form.contains(group)
      })
      expect(portalled).toBe(true)

      await ObjectProperties.closeMaterialPicker()
      await expect($('[role="radiogroup"][aria-label="Select Materials"]')).not.toBeExisting()
    })

    it('the picker lists the material ALREADY on the ground — that row is the one carrying aria-checked', async () => {
      // Differential: filtering the assigned material out (as an add-only
      // checkbox list would) is exactly what would leave the CURRENT selection
      // invisible. The whole library ships, and the tick is the state.
      const name = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()

      await openPicker()
      const rows = (await ObjectProperties.pickerState()).rows
      expect(rows.map((r) => r.name)).toContain(name)
      // The library is GLOBAL and carries other runs' leftovers, so assert the
      // SELECTED set, never the row count.
      expect(rows.filter((r) => r.selected).map((r) => r.name)).toEqual([name])
      await ObjectProperties.closeMaterialPicker()
    })

    it('the picker is a RADIOGROUP — a second pick REPLACES the first, it never adds to it', async () => {
      // DEVIATION: the user story promises MULTIPLE material selection on a
      // geometry. SelectMaterialsPopup ships role="radiogroup" of role="radio"
      // rows and the reducer's ADD_DRAFT_MATERIAL swaps the list rather than
      // appending ("a ground carries ONE material"). Asserted as SHIPPED.
      const a = await newMaterial()
      const b = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()

      await pick(a)
      await waitForAssigned([a])
      await pick(b)
      await waitForAssigned([b])

      await openPicker()
      expect(
        (await ObjectProperties.pickerState()).rows.filter((r) => r.selected).map((r) => r.name)
      ).toEqual([b])
      // The SHAPE is the rule: radios, never checkboxes.
      await expect(
        $('[role="radiogroup"][aria-label="Select Materials"] [role="checkbox"]')
      ).not.toBeExisting()
      await ObjectProperties.closeMaterialPicker()
    })

    it('a picker search matching NOTHING shows "No materials found" INSIDE the list', async () => {
      // Differential: the big empty state keys off the FULL library, the no-match
      // line off the FILTERED one. Collapsing the two would tell a user with a
      // full library to go and add a material.
      await trackMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await openPicker()

      await ObjectProperties.searchMaterials('zzzqqq___nomatch')
      await browser.waitUntil(async () => (await ObjectProperties.pickerState()).rows.length === 0, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the picker never filtered down to no rows'
      })
      const state = await ObjectProperties.pickerState()
      expect(state.noMatchText).toBe(GEOMETRY_MATERIAL_MSG.noMatches)
      expect(state.emptyLibrary).toBe(false)
      expect(state.heading).toBe(GEOMETRY_MATERIAL_MSG.pickerTitle)
      // The empty-library shape's call to action must NOT appear here.
      await expect(ObjectProperties.addNewMaterialButton).not.toBeExisting()
      await ObjectProperties.closeMaterialPicker()
    })

    it('the picker search filters the library by name, CASE-INSENSITIVELY', async () => {
      // Two materials, so this is a real filter and not a vacuous pass on a
      // library that happens to hold one row: the query is the first material's
      // name in lower case, and the second must be gone. Material.NNN is
      // 3-digit-padded, so one name is never a substring of another.
      const a = await newMaterial()
      const b = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await openPicker()

      await ObjectProperties.searchMaterials(a.toLowerCase())
      await browser.waitUntil(
        async () => {
          const names = (await ObjectProperties.pickerState()).rows.map((r) => r.name)
          return names.includes(a) && !names.includes(b)
        },
        {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: `the picker search never narrowed to "${a}" alone`
        }
      )
      await ObjectProperties.closeMaterialPicker()
    })

    it('an EMPTY library replaces the whole picker — there is no radiogroup at all', async function () {
      // THE PICKER HAS TWO SHAPES, and this is the one a test can almost never
      // see: the library is GLOBAL and survives projects AND runs, so on any
      // machine that has run this suite it is never empty. Self-skip rather than
      // assert the wrong thing — the same convention materials.test.ts:186 uses.
      // Written to start passing the day someone runs it on a clean database.
      if ((await Materials.rowCount()) > 0) {
        this.skip()
        return
      }
      await trackGround()
      await ObjectProperties.waitForOpen()
      await openPicker()

      const state = await ObjectProperties.pickerState()
      expect(state.emptyLibrary).toBe(true)
      expect(state.rows).toEqual([])
      // Not "an empty radiogroup" — no radiogroup is rendered at all, which is
      // why pickerState keys on the heading and why a test that waits for the
      // group would hang here forever.
      await expect($('[role="radiogroup"][aria-label="Select Materials"]')).not.toBeExisting()
      await expect(ObjectProperties.addNewMaterialButton).toBeDisplayed()
      await ObjectProperties.closeMaterialPicker()
    })
  })

  // ══ Picking is a DRAFT change ════════════════════════════════════════════

  describe('picking (client-side, until Save)', () => {
    it('picking a material lists it under the Materials row and ENABLES Save', async () => {
      const name = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      // A freshly created ground is at its blueprint values, so nothing is dirty
      // and the material is the only thing that can light Save up.
      expect(await ObjectProperties.saveEnabled()).toBe(false)

      await pick(name)
      await waitForAssigned([name])
      await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'picking a material did not make the form dirty'
      })
      // Client-side ONLY: nothing is posted and nothing is confirmed.
      expect(await countOpenDialogs()).toBe(0)
    })

    it('picking a REPLACEMENT raises NO dialog — the Replace confirmation belongs to SAVE', async () => {
      // The load-bearing distinction in this whole feature. saveReplacesMaterial
      // is computed in onSave, not in the picker's handler, because picking is
      // reversible and Save is the point at which the displaced material is
      // actually DELETEd on the backend. Abandoning the form must leave the
      // previously saved assignment untouched.
      const a = await newMaterial()
      const b = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(a)
      await saveForm()

      await pick(b)
      await waitForAssigned([b])
      expect(await staysFalse(async () => (await countOpenDialogs()) > 0)).toBe(true)
    })

    it('RE-PICKING the material already assigned raises an INFO toast and posts nothing', async () => {
      const name = await newMaterial()
      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()
      // Resolved BEFORE the re-pick: toasts live ~2.66s, so nothing that costs a
      // round-trip may sit between the click and waitForToast.
      const groundName = await groundNameOf(groundId)
      // The save's own toast would otherwise satisfy the wait below.
      await drainToasts()

      await pick(name)
      // The copy names the GROUND (draft.name), not the material — it answers
      // "what is on this ground", the same subject the Replace heading takes.
      await waitForToast(GEOMETRY_MATERIAL_MSG.alreadyAssigned(groundName))
      await waitForAssigned([name])
      // Nothing became dirty, so there is nothing to send — the click really did
      // vanish, and the toast is the only reason the user knows why.
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)
    })

    it('the trash removes a DRAFT-ONLY pick SILENTLY, with no confirmation', async () => {
      // UNASSIGN IS CONDITIONAL. handleDeleteMaterial branches on
      // draft.materialBaseline: a material picked this session has never been
      // posted, so there is no backend progress to warn about.
      const name = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await waitForAssigned([name])

      await ObjectProperties.removeAssigned(name)
      // The row leaving is what discriminates the two branches: the confirming
      // branch leaves it in place until the dialog is answered.
      await waitForAssigned([])
      expect(await countOpenDialogs()).toBe(0)
      // Back to the loaded baseline, so Save closes again.
      await browser.waitUntil(async () => !(await ObjectProperties.saveEnabled()), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'removing the only pick left the form dirty'
      })
    })
  })

  // ══ Save ═════════════════════════════════════════════════════════════════

  describe('save', () => {
    it('Save assigns the material and confirms with the CHANGES SAVED toast', async () => {
      // FINDING, pinned here rather than left in a doc. The ground form's Save
      // does NOT raise GEOMETRY_TOAST.materialAssigned: that belongs to
      // saga.assignMaterialWorker, i.e. the DRAG-AND-DROP path only. Save runs
      // through updateObjectWorker, whose sole toast is toastMessages.changesSaved.
      // And Geometry/messages.ts assignMaterialSuccess / assignMaterialFailure are
      // DEAD CODE — nothing in src/ references either, so a test written from the
      // feature's own messages.ts asserts a string the app never emits.
      const name = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)

      await drainToasts()
      // clickSave, NOT saveForm: the settle costs a poll interval, and the toast
      // lives ~2.66s. Waiting for the toast IS the settle here, and the
      // save-landed check follows it.
      //
      // The 10s default is the only budget available — waitForToast's own default
      // narrows its parameter to that literal, so MUTATION cannot be passed. That
      // is the same budget geometry.test.ts's save round-trip already runs green
      // on for a 1x1 ground.
      await clickSave()
      await waitForToast(GEOMETRY_TOAST.saved)
      await waitForSaveSettled()
      await waitForAssigned([name])
    })

    it('a saved assignment survives RESELECTING the geometry', async () => {
      // Differential: the reducer refreshes the detail cache with the materials
      // the PATCH actually carried, so a re-click serves them without a GET. If it
      // took the live draft instead, moving away and back would drop the
      // assignment from the panel — the reported bug this wiring exists to fix.
      const name = await newMaterial()
      const target = await trackGround()
      const other = await trackGround()
      // +Ground opens the NEW ground's form, so the panel is showing `other` right
      // now. Select the one under test or the pick lands on the wrong row.
      await Geometry.selectRow(target)
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()

      await Geometry.selectRow(other)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([])
      await Geometry.selectRow(target)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name])
    })

    it('a FAILED save KEEPS the picked material and leaves Save available to retry', async () => {
      // Differential: the pick is folded into materialBaseline only on
      // UPDATE_OBJECT_SUCCEEDED. A failure that cleared the draft instead would
      // silently discard the user's choice and leave them re-opening the picker
      // with no idea anything had gone.
      const name = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)

      await withApiFault('PATCH', '/objects/', async () => {
        await clickSave()
        // The rendered saveError is the deterministic oracle. Waiting for Save to
        // re-enable is not: it is enabled the instant before React commits
        // `saving: true`, so the first poll can pass before the write even left.
        // `.form-error-text` has exactly two render sites in this form and the
        // other is gated on objectDeleted, so it is unambiguous.
        await $('[data-testid="object-properties-form"] .form-error-text').waitForDisplayed({
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'a failed save reported nothing on the form'
        })
      })

      await waitForAssigned([name])
      expect(await ObjectProperties.saveEnabled()).toBe(true)
    })
  })

  // ══ Replace (raised by Save) ═════════════════════════════════════════════

  describe('the Replace confirmation', () => {
    it('the Replace dialog names the GROUND, offers Cancel then Replace, and FOCUSES Replace', async () => {
      const { groundId } = await stageReplace()
      await clickSave()

      const dlg = await waitForOpenDialog()
      expect(dlg.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
      // The heading names the GROUND, not either material. Note the inconsistency
      // with the Unassign dialog below, which names the MATERIAL — two
      // confirmations on the same form taking different subjects.
      expect(dlg.heading).toBe(GEOMETRY_MATERIAL_MSG.replaceHeading(await groundNameOf(groundId)))
      // Order, not just membership: components/Dialog treats the LAST enabled body
      // button as the primary action.
      expect(dlg.buttons).toEqual([
        GEOMETRY_MATERIAL_MSG.replaceCancel,
        GEOMETRY_MATERIAL_MSG.replaceConfirm
      ])
      // ...and focuses it, so Enter on this confirmation REPLACES outright — the
      // same hazard the delete confirmation carries, pinned deliberately.
      expect(dlg.focused).toBe(GEOMETRY_MATERIAL_MSG.replaceConfirm)
      // Unlike Delete and Unassign, this dialog is a single <p>: there is no
      // consequence line telling the user the old material's progress is about to
      // go. Recorded as a product finding by asserting the shipped shape.
      expect(dlg.lines.length).toBe(1)
    })

    it('CANCEL on Replace keeps the new pick and leaves Save available', async () => {
      const { b } = await stageReplace()
      await clickSave()
      await waitForOpenDialog()

      await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceCancel)
      await waitForNoOpenDialog()
      // Nothing was sent, so the draft still holds the new pick and Save is still
      // offered — Cancel returns to the form, it does not undo the pick.
      await waitForAssigned([b])
      expect(await ObjectProperties.saveEnabled()).toBe(true)
    })

    it('REPLACE completes the save and leaves exactly ONE material on the ground', async () => {
      const { a, b } = await stageReplace()
      await clickSave()
      await waitForOpenDialog()

      await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
      await waitForNoOpenDialog()
      // The displaced group is DELETEd by the same save, BEFORE the add-only
      // PATCH, so the ground is never momentarily carrying both.
      await waitForSaveSettled()
      await waitForAssigned([b], TIMEOUTS.MUTATION)
      expect(await ObjectProperties.assignedNames()).not.toContain(a)
    })
  })

  // ══ Unassign (a SAVED material's trash) ══════════════════════════════════

  describe('the Unassign confirmation', () => {
    /** A ground carrying `name` on the backend, with its trash already clicked. */
    const openUnassign = async (): Promise<string> => {
      const name = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()
      await ObjectProperties.removeAssigned(name)
      return name
    }

    it('the trash on a SAVED material opens a confirmation naming the MATERIAL', async () => {
      // The other half of the conditional: this one HAS backend progress behind
      // it, so the same icon that silently drops a draft pick now confirms.
      const name = await openUnassign()
      const dlg = await waitForOpenDialog()
      expect(dlg.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.unassignTitle)
      expect(dlg.heading).toBe(GEOMETRY_MATERIAL_MSG.unassignHeading(name))
      // Unlike Replace, this one DOES carry a consequence line.
      expect(dlg.body).toBe(GEOMETRY_MATERIAL_MSG.unassignBody)
      expect(dlg.buttons).toEqual([
        GEOMETRY_MATERIAL_MSG.unassignCancel,
        GEOMETRY_MATERIAL_MSG.unassignConfirm
      ])
      expect(dlg.focused).toBe(GEOMETRY_MATERIAL_MSG.unassignConfirm)
    })

    it('CANCEL keeps the material assigned', async () => {
      const name = await openUnassign()
      await waitForOpenDialog()
      await clickDialogButton(GEOMETRY_MATERIAL_MSG.unassignCancel)
      await waitForNoOpenDialog()
      await waitForAssigned([name])
      // Nothing was sent, so the form is still at its saved baseline.
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)
    })

    it('UNASSIGN removes the material from the ground', async () => {
      await openUnassign()
      await waitForOpenDialog()
      await clickDialogButton(GEOMETRY_MATERIAL_MSG.unassignConfirm)
      await waitForNoOpenDialog()
      // PESSIMISTIC: the row goes only once the DELETE comes back, so this is a
      // backend settle, not a UI one.
      await waitForAssigned([], TIMEOUTS.MUTATION)
    })
  })

  // ══ The read-only material properties popup ══════════════════════════════

  describe('the material properties popup', () => {
    it("an assigned material's NAME opens a read-only popup, and its close button dismisses it", async () => {
      const name = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await waitForAssigned([name])

      await ObjectProperties.openMaterialDetail(name)
      // role="dialog" with the material's own name — the heading says WHAT you are
      // looking at, which a generic "Material Properties" would not.
      await expect(ObjectProperties.materialDetail(name)).toBeDisplayed()

      await ObjectProperties.closeMaterialDetail(name)
      // Portalled like the picker, so non-existence is the closed-oracle again.
      await browser.waitUntil(
        async () => !(await ObjectProperties.materialDetail(name).isExisting()),
        {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'the close button never dismissed the material properties popup'
        }
      )
    })

    it('a FRESHLY PICKED material with no types shows the popup EMPTY LINE', async () => {
      // DEVIATION (see the next test for the shipped shape): the user story says
      // this popup shows a TAB for each material type, open by default. It does
      // not describe this state at all — a material with no saved type cards has
      // no members to show. The copy is deliberately "No Material type is assigned
      // to this Material", NOT "this material has no properties": claiming the
      // material is empty would be a lie the user cannot act on.
      const name = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await waitForAssigned([name])

      await ObjectProperties.openMaterialDetail(name)
      await expect(ObjectProperties.materialDetail(name)).toHaveText(
        GEOMETRY_MATERIAL_MSG.detailEmpty,
        { containing: true }
      )
      expect(await ObjectProperties.detailSections(name)).toEqual([])
    })

    it('a material WITH a type shows one COLLAPSIBLE SECTION per type, open by default — not tabs', async () => {
      // DEVIATION: the user story calls these TABS. MaterialPropertiesPopup renders
      // one collapsible card per material type, each headed by an aria-expanded
      // button — the story's "open by default" is right, its "tabs" is not. There
      // is no role="tab" anywhere in the popup.
      //
      // Differential: the members come from the Materials library DETAIL cache
      // (refreshDetailCache rewrites it write-through on every card save), not
      // from the object GET — which is what keeps an assigned material
      // live-linked. A freshly picked group has no GET baseline at all, so this
      // popup can only be populated from that cache.
      const materialId = await trackMaterial()
      await MaterialProperties.waitForOpen()
      // A fresh material already carries ONE blank card, so this is card 2.
      const cardId = await MaterialProperties.addCard()
      await MaterialProperties.pickType(cardId, 'Visualiser')
      await MaterialProperties.setColorChannel('r', '12')
      await MaterialProperties.setColorChannel('g', '34')
      await MaterialProperties.setColorChannel('b', '56')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      await MaterialProperties.saveCard(cardId)
      const name = await materialNameOf(materialId)

      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await waitForAssigned([name])

      await ObjectProperties.openMaterialDetail(name)
      // The section heading is the material TYPE's own name.
      await browser.waitUntil(
        async () => (await ObjectProperties.detailSections(name)).includes('Visualiser'),
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: "the popup never listed the material's Visualiser section"
        }
      )
      await expect(ObjectProperties.materialDetail(name).$('[role="tab"]')).not.toBeExisting()
      await expect(ObjectProperties.materialDetail(name).$('[aria-expanded="true"]')).toBeExisting()
    })
  })

  // ══ The amber sync dot ═══════════════════════════════════════════════════
    // ══ Dialog keyboard behaviour — the two dialogs SAVE and the trash raise ══

    describe('dialog keyboard behaviour', () => {
      it('ENTER on the Unassign confirmation UNASSIGNS the material', async () => {
        // Both confirmations on this form already assert that focus LANDS on the
        // destructive button. Neither ever pressed the key, so "Enter unassigns"
        // was an inference about components/Dialog rather than a demonstrated fact
        // about this dialog. (Dialog's own onKeyDown returns early on a BUTTON
        // target, so what fires is the focused button's native activation.)
        const name = await newMaterial()
        await trackGround()
        await ObjectProperties.waitForOpen()
        await pick(name)
        await saveForm()

        await ObjectProperties.removeAssigned(name)
        const dlg = await waitForOpenDialog()
        expect(dlg.focused).toBe(GEOMETRY_MATERIAL_MSG.unassignConfirm)

        await browser.keys(['Enter'])
        await waitForNoOpenDialog()
        // PESSIMISTIC: the row goes only once the DELETE comes back.
        await waitForAssigned([], TIMEOUTS.MUTATION)
      })

      it('ENTER on the Replace confirmation REPLACES outright', async () => {
        const { a, b } = await stageReplace()
        await clickSave()
        const dlg = await waitForOpenDialog()
        expect(dlg.focused).toBe(GEOMETRY_MATERIAL_MSG.replaceConfirm)

        await browser.keys(['Enter'])
        await waitForNoOpenDialog()
        await waitForSaveSettled()
        await waitForAssigned([b], TIMEOUTS.MUTATION)
        expect(await ObjectProperties.assignedNames()).not.toContain(a)
      })
    })

    // ══ A material TYPE deleted from the library, seen from the GROUND ═══════

    describe('a material type deleted from the library', () => {
      it("disappears from the ASSIGNED ground's read-only properties popup", async () => {
        // The cross-surface half of "deleting the type updates the material
        // configuration correctly". The popup is fed by the MATERIALS slice's
        // detail cache (ObjectPropertiesForm reads materialDetailsById), and
        // REMOVE_PARAMETER_GROUP rewrites that cache write-through
        // (refreshDetailCache, reducer.ts:130-154) — so this is the wiring that
        // keeps an assigned material live-linked to the library rather than frozen
        // at assign time.
        const materialId = await trackMaterial()
        await MaterialProperties.waitForOpen()
        // A fresh material already carries ONE blank card, so this is card 2. The
        // colour writes straight after pickType are the same sequence the popup
        // test above already runs green.
        const cardId = await MaterialProperties.addCard()
        await MaterialProperties.pickType(cardId, 'Visualiser')
        await MaterialProperties.setColorChannel('r', '12')
        await MaterialProperties.setColorChannel('g', '34')
        await MaterialProperties.setColorChannel('b', '56')
        await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'Save never enabled for a complete colour'
        })
        await MaterialProperties.saveCard(cardId)
        const name = await materialNameOf(materialId)

        const groundId = await trackGround()
        await ObjectProperties.waitForOpen()
        await pick(name)
        // SAVED, not just picked: this test selects away from the ground and back,
        // and a draft-only pick would not survive that.
        await saveForm()
        await waitForAssigned([name])

        await ObjectProperties.openMaterialDetail(name)
        await browser.waitUntil(
          async () => (await ObjectProperties.detailSections(name)).includes('Visualiser'),
          {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: "the popup never listed the material's Visualiser section"
          }
        )
        // Close it deliberately — an open AnchoredPopup lays a `fixed inset-0 z-40`
        // overlay over the panel, so the WebDriver click on the Materials row below
        // would be intercepted.
        await ObjectProperties.closeMaterialDetail(name)
        await browser.waitUntil(
          async () => !(await ObjectProperties.materialDetail(name).isExisting()),
          { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the material properties popup never closed' }
        )

        // Now remove the TYPE from the library side.
        await Materials.openMaterial(materialId)
        await MaterialProperties.waitForOpen()
        // Card ids restart at 1 per material on a reopen, so find it by TYPE.
        let visCard: number | null = null
        await browser.waitUntil(
          async () => {
            for (const c of await MaterialProperties.cardIds()) {
              if ((await MaterialProperties.selectedType(c)) === 'Visualiser') {
                visCard = c
                return true
              }
            }
            return false
          },
          {
            timeout: TIMEOUTS.MEDIUM,
            timeoutMsg: 'the reopened material never showed its saved Visualiser card'
          }
        )
        await MaterialProperties.removeCard(visCard as unknown as number)
        await waitForOpenDialog()
        await clickDialogButton('Delete')
        await browser.waitUntil(
          async () =>
            !(await MaterialProperties.cardIds()).includes(visCard as unknown as number),
          { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the saved Visualiser card was never removed' }
        )

        await Geometry.selectRow(groundId)
        await ObjectProperties.waitForOpen()
        // The GROUP is still assigned — only its member went — so the row stays.
        await waitForAssigned([name])
        await ObjectProperties.openMaterialDetail(name)
        await browser.waitUntil(
          async () => !(await ObjectProperties.detailSections(name)).includes('Visualiser'),
          {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: 'the removed material type is still shown on the assigned ground'
          }
        )
        await ObjectProperties.closeMaterialDetail(name)
      })
    })

  // ══ BLOCK 4 — opening the picker the way a USER does ═════════════════════════

  describe('the Select button itself', () => {
    it('a REAL click on the Select button opens the picker', async () => {
      // Every other picker test in this file opens the popup through
      // ObjectProperties.openMaterialPicker, which dispatches the click IN-PAGE —
      // necessary once a popup's `fixed inset-0 z-40` overlay is up, but it means
      // nothing had ever proved the button is reachable and clickable by a user. A
      // button behind an overlay, off-screen, or zero-sized would pass every one of
      // them and fail every human.
      await trackMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      expect(await ObjectProperties.pickerOpen()).toBe(false)

      // Bring it into the panel's scroll viewport first. Element.scrollIntoView is
      // plain DOM — NOT the wdio command, which cannot work in this Electron build
      // (Browser.getWindowForTarget is unimplemented).
      await browser.execute(() => {
        const form = document.querySelector('[data-testid="object-properties-form"]')
        const btn = Array.from(form?.querySelectorAll('button') ?? []).find(
          (b) => (b.textContent || '').trim() === 'Select'
        ) as HTMLElement | undefined
        if (!btn) throw new Error('no Select button on the ground form')
        btn.scrollIntoView({ block: 'center' })
      })
      // THE POINT OF THIS TEST: a genuine WebDriver click, not a dispatched one.
      await ObjectProperties.materialSelectButton.click()

      // aria-expanded flips on the click, but AnchoredPopup paints its children
      // only after a measurement pass — so the heading, not the button, is the
      // settle (the same reason openPicker() keys on it).
      await browser.waitUntil(async () => (await ObjectProperties.pickerState()).heading !== null, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'a real click on Select never opened the picker'
      })
      expect(await ObjectProperties.pickerOpen()).toBe(true)
      expect((await ObjectProperties.pickerState()).heading).toBe(GEOMETRY_MATERIAL_MSG.pickerTitle)
      await ObjectProperties.closeMaterialPicker()
    })

    it('the picker lists EVERY material in the library BEFORE a search narrows it', async () => {
      // The differential the existing search test cannot make: 'the picker search
      // filters the library by name, CASE-INSENSITIVELY' only ever reads the list
      // AFTER the query, so a library that had silently dropped the second material
      // would satisfy it just as well. Both rows are asserted present first, and
      // only then is the filter applied.
      const a = await newMaterial()
      const b = await newMaterial()
      await trackGround()
      await ObjectProperties.waitForOpen()
      await openPicker()

      const before = (await ObjectProperties.pickerState()).rows.map((r) => r.name)
      expect(before).toContain(a)
      expect(before).toContain(b)
      // Membership only — the library is GLOBAL and carries other runs' leftovers,
      // so its size is never an assertion.

      await ObjectProperties.searchMaterials(a.toLowerCase())
      await browser.waitUntil(
        async () => {
          const names = (await ObjectProperties.pickerState()).rows.map((r) => r.name)
          return names.includes(a) && !names.includes(b)
        },
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the picker search never narrowed to "${a}" alone` }
      )
      await ObjectProperties.closeMaterialPicker()
    })
  })

  // ══ BLOCK 5 — the OTHER way to apply a material: the drop ════════════════════

  describe('assigning by DRAG AND DROP', () => {
    it('DROPPING a second material on a ground raises Replace, and commits with NO Save step', async () => {
      // "Apply another material to a ground that already has one" has TWO user
      // paths and only the right-panel one was automated. This is the other, and it
      // behaves differently in the way that matters most: the picker's pick is a
      // DRAFT that Save commits, while a drop commits IMMEDIATELY — the
      // confirmation is raised by TreeRow, not by Save, and the assignment is
      // already on the backend by the time the dialog closes.
      const aId = await trackMaterial()
      const a = await materialNameOf(aId)
      const bId = await trackMaterial()
      const b = await materialNameOf(bId)
      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(a)
      await saveForm()
      const groundName = await groundNameOf(groundId)

      // The payload comes from MaterialRow's OWN handleDragStart, so this also pins
      // the shape TreeRow.readMaterialDrop parses — {groupId, name}, not the bare
      // id array a geometry drag carries.
      const payload = await readMaterialDragPayload(bId)
      expect(payload).toEqual({ groupId: bId, name: b })

      await drainToasts()
      // UPDATE_OBJECT_SUCCEEDED wrote materialGroupIds onto the node (reducer.ts),
      // so handleDrop's groupsOn() is non-empty and the REPLACE branch is taken
      // rather than a silent assign.
      await dragMaterialOnto({ groupId: bId, name: b }, groundId)

      // A FOURTH dialog on this surface — one per tree row, alongside the form's
      // three. Same copy as the form's Replace, and the same hazard: Dialog focuses
      // the last enabled body button, so Enter replaces outright.
      const dlg = await waitForOpenDialog()
      expect(dlg.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
      expect(dlg.heading).toBe(GEOMETRY_MATERIAL_MSG.replaceHeading(groundName))
      expect(dlg.buttons).toEqual([
        GEOMETRY_MATERIAL_MSG.replaceCancel,
        GEOMETRY_MATERIAL_MSG.replaceConfirm
      ])
      expect(dlg.focused).toBe(GEOMETRY_MATERIAL_MSG.replaceConfirm)

      await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
      await waitForNoOpenDialog()
      // THE DROP PATH IS THE ONLY PRODUCER of this toast: assignMaterialWorker
      // raises it, and only TreeRow dispatches that. The ground form's Save goes
      // through updateObjectWorker, whose only toast is changesSaved — which is why
      // 'Save assigns the material...' asserts a different string entirely.
      await waitForToast(GEOMETRY_TOAST.materialAssigned(b, groundName))

      await waitForAssigned([b], TIMEOUTS.MUTATION)
      expect(await ObjectProperties.assignedNames()).not.toContain(a)
      // Committed, not staged: ASSIGN_MATERIAL_SUCCEEDED folds the group into
      // materialBaseline as well, so there is nothing left to save.
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)
    })
  })

  // ══ BLOCK 6 — what a REPLACE leaves behind ═══════════════════════════════════

  describe('after a Replace', () => {
    /**
     * Bring a card's Save into the panel's scroll viewport before a REAL click.
     * Plain DOM scrollIntoView, never the wdio command. A configured Radiation card
     * is taller than the panel.
     */
    const revealSave = async (cardId: number): Promise<void> => {
      await browser.execute((id: number) => {
        const btn = document.querySelector(
          `[data-testid="material-card-save-${id}"]`
        ) as HTMLElement | null
        btn?.scrollIntoView({ block: 'center' })
      }, cardId)
    }

    it('REPLACE unassigns the old material but LEAVES IT IN THE LIBRARY, and the tick moves', async () => {
      // The half of "replacing behaves per intended logic" that the three existing
      // Replace tests cannot see: they read the ground's Materials section, which
      // says nothing about what happened to the displaced material itself. A
      // replace that DELETED it — or one that left the picker still ticking it —
      // would pass all three. The library is global, so a replace that consumed
      // materials would also destroy other projects' assignments.
      const { a, b } = await stageReplace()
      await clickSave()
      await waitForOpenDialog()
      await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
      await waitForNoOpenDialog()
      await waitForSaveSettled()
      await waitForAssigned([b], TIMEOUTS.MUTATION)

      // 1. The displaced material is still a material.
      await browser.waitUntil(async () => (await Materials.names()).includes(a), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: `the replaced material "${a}" disappeared from the library`
      })
      // 2. …and the picker still offers it, now UNTICKED, with the tick on the
      //    material that displaced it.
      await openPicker()
      const rows = (await ObjectProperties.pickerState()).rows
      expect(rows.map((r) => r.name)).toContain(a)
      expect(rows.map((r) => r.name)).toContain(b)
      expect(rows.filter((r) => r.selected).map((r) => r.name)).toEqual([b])
      await ObjectProperties.closeMaterialPicker()
    })

    it("the read-only popup follows the REPLACE — it shows the NEW material's type and values", async () => {
      // Asserted until now at the level of TYPE IDENTITY only ('...shows one
      // COLLAPSIBLE SECTION per type'), and never after a replace. Two materials
      // with DIFFERENT types make the popup's contents load-bearing: reading the
      // displaced material's cache, or the ground's stale GET baseline, would show
      // "Visualiser" where the ground now carries a Radiation material.
      const aId = await trackMaterial()
      await MaterialProperties.waitForOpen()
      // A fresh material already carries ONE blank card, so this is card 2.
      const aCard = await MaterialProperties.addCard()
      await MaterialProperties.pickType(aCard, 'Visualiser')
      await MaterialProperties.setColorChannel('r', '12')
      await MaterialProperties.setColorChannel('g', '34')
      await MaterialProperties.setColorChannel('b', '56')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(aCard), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      await revealSave(aCard)
      await MaterialProperties.saveCard(aCard)
      // typeLocked, not the disabled Save: only SAVE_PARAMETER_GROUP_SUCCEEDED sets
      // group.saved, and it is the same action that rewrites the detail cache this
      // popup reads.
      await browser.waitUntil(async () => MaterialProperties.typeLocked(aCard), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the Visualiser card never became saved'
      })
      const a = await materialNameOf(aId)

      const bId = await trackMaterial()
      await MaterialProperties.waitForOpen()
      const bCard = await MaterialProperties.addCard()
      await MaterialProperties.pickType(bCard, 'Radiation')
      await MaterialProperties.setField(bCard, 'reflectivity_PAR', '0.25')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(bCard), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a Radiation card'
      })
      await revealSave(bCard)
      await MaterialProperties.saveCard(bCard)
      await browser.waitUntil(async () => MaterialProperties.typeLocked(bCard), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the Radiation card never became saved'
      })
      const b = await materialNameOf(bId)

      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(a)
      await saveForm()
      await pick(b)
      await waitForAssigned([b])
      await clickSave()
      const dlg = await waitForOpenDialog()
      expect(dlg.heading).toBe(GEOMETRY_MATERIAL_MSG.replaceHeading(await groundNameOf(groundId)))
      await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
      await waitForNoOpenDialog()
      await waitForSaveSettled()
      await waitForAssigned([b], TIMEOUTS.MUTATION)

      await ObjectProperties.openMaterialDetail(b)
      await browser.waitUntil(async () => (await ObjectProperties.detailSections(b)).length > 0, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the popup never listed a material type section'
      })
      // EXACTLY the new material's type — the displaced one's must not be here.
      expect(await ObjectProperties.detailSections(b)).toEqual(['Radiation'])

      // …and a real VALUE, not just the heading. detailSections() returns only the
      // [aria-expanded] headings, so the <dl> rows are read inline: every value in
      // this popup is a <dd> by construction (read-only by design — there is no
      // input anywhere in it). 0.25 belongs to no other field on the card.
      const detailRows = await ObjectProperties.detailRows(b)
      expect(detailRows.length).toBeGreaterThan(0)
      expect(detailRows.map((r) => r.value)).toContain('0.25')

      await ObjectProperties.closeMaterialDetail(b)
    })
  })

  // ══ BLOCK 7 — the panel hand-off: ground → material → ground ═════════════════

  describe('the right panel changing hands', () => {
    it('opening a LIBRARY MATERIAL while a ground form is open HANDS THE PANEL OVER', async () => {
      // RightPanel renders ONE form at a time, chosen by whichever feature bumped
      // its open-nonce last (`activeForm === 'material' ? <MaterialPropertiesForm/>
      // : <ObjectPropertiesForm/>`) — so clicking a material row while a ground is
      // open does not add a panel, it REPLACES one. Nothing had exercised that:
      // every "reopen the material form" test lives in materials.test.ts, which
      // never touches geometry, so the ground form was never the thing displaced.
      const materialId = await trackMaterial()
      const name = await materialNameOf(materialId)
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()
      await waitForAssigned([name])

      await Materials.openMaterial(materialId)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === name, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the right panel never switched to the assigned material'
      })
      // The ground form did not merely lose focus — it is not rendered at all. The
      // one place in this feature where isExisting() is the correct oracle for a
      // panel, because RightPanel really does unmount the losing form.
      await expect(ObjectProperties.form).not.toBeExisting()
    })

    it('editing that material and COMING BACK leaves the ground form exactly as it was', async () => {
      // The round trip the suite could not make: 'a saved assignment survives
      // RESELECTING the geometry' goes ground → ground → ground, which never
      // unmounts the ground form. This one goes ground → MATERIAL FORM → ground,
      // which does — and the return has to rebuild the ground's own field values
      // AND its Materials section from the cache the save wrote.
      const materialId = await trackMaterial()
      const name = await materialNameOf(materialId)
      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      // A value of the ground's OWN, so the return trip proves more than the
      // blueprint defaults would. The 1x1 resolution is untouched — never save a
      // ground above ~100 resolution cells.
      await ObjectProperties.setField('rotation_z', '45')
      await pick(name)
      await saveForm()
      // Captured, not hardcoded: the assertion is that the round trip changes
      // NOTHING, so it compares against what the saved form actually shows rather
      // than against a literal the form is free to reformat on blur.
      const rotationBefore = (await ObjectProperties.fieldState('rotation_z')).value
      const lengthBefore = (await ObjectProperties.fieldState('length')).value
      expect(rotationBefore).toBe('45')

      await Materials.openMaterial(materialId)
      await MaterialProperties.waitForOpen()
      // A REAL edit over there — a saved card, not just an open panel.
      const cardId = (await MaterialProperties.cardIds())[0]
      await MaterialProperties.pickType(cardId, 'Visualiser')
      await MaterialProperties.setColorChannel('r', '9')
      await MaterialProperties.setColorChannel('g', '8')
      await MaterialProperties.setColorChannel('b', '7')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      await MaterialProperties.saveCard(cardId)
      await browser.waitUntil(async () => MaterialProperties.typeLocked(cardId), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the Visualiser card never became saved'
      })

      await Geometry.selectRow(groundId)
      await ObjectProperties.waitForOpen()
      expect((await ObjectProperties.fieldState('rotation_z')).value).toBe(rotationBefore)
      expect((await ObjectProperties.fieldState('length')).value).toBe(lengthBefore)
      await waitForAssigned([name])
      // Nothing was edited on the way back, so the form comes back CLEAN — a
      // rebuilt draft that read as dirty would offer a pointless PATCH.
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)
    })

    it('deleting an ASSIGNED material removes it from the LIST, the GROUND and the PICKER', async () => {
      // Removal from the library list is well covered; removal from everywhere ELSE
      // it was showing is not. Deleting from the SAME project is the case that has
      // to purge live: delete_group eagerly unassigns the group from this
      // scenario's objects, and the geometry slice's REMOVE_MATERIAL branch drops
      // it from the open draft (materials AND materialBaseline) and from every
      // cached detail. (Deleting from ANOTHER project is the opposite case — see
      // the stale sync-dot test.)
      const materialId = await trackMaterial()
      const name = await materialNameOf(materialId)
      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()
      await waitForAssigned([name])

      // MaterialRow's trash calls e.stopPropagation(), so this does NOT select the
      // row — the ground form stays up and can be read straight afterwards, without
      // a reselect that would re-fetch and hide the live purge this asserts.
      await Materials.deleteRow(materialId)
      materials = materials.filter((x) => x !== materialId)

      // 1. the library list
      expect(await Materials.rowState(materialId)).toBeUndefined()
      // 2. the ground's Materials section — purged without a reselect
      await waitForAssigned([], TIMEOUTS.MUTATION)
      // 3. the picker no longer offers it
      await openPicker()
      expect((await ObjectProperties.pickerState()).rows.map((r) => r.name)).not.toContain(name)
      await ObjectProperties.closeMaterialPicker()
    })
  })

  // ══ Renaming a material that is ON a ground ═══════════════════════════════
  //
  // PLACED BEFORE the sync-dot block deliberately. Everything from `the sync dot`
  // down navigates away from this file's shared project (reloadToHome +
  // enterGeometry('stalea'/'staleb'), then reopenByName), so a block appended
  // after it would run in a DIFFERENT project from the one `before` provisioned —
  // still workable, but for no reason, and it would put two navigations between
  // this block and the state it assumes. Everything here stays in `matassign`.

  describe('renaming a material that is ON a ground', () => {
    /**
     * A ground wearing a freshly created material, SAVED, with the ground form
     * open and the material's auto-assigned name in hand.
     *
     * Materials FIRST, ground LAST: +Add Materials swaps the right panel to the
     * MATERIAL form, so creating one after the ground would leave the panel
     * showing the wrong thing and every pick below would land nowhere.
     */
    const groundWearing = async (): Promise<{
      groundId: string
      materialId: string
      name: string
    }> => {
      const materialId = await trackMaterial()
      const name = await materialNameOf(materialId)
      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()
      await waitForAssigned([name])
      return { groundId, materialId, name }
    }

    /**
     * A rename target that is unique in the GLOBAL library and inside the
     * 20-character limit.
     *
     * NOT a literal like "Renamed". The library survives projects AND runs, so a
     * fixed string collides with a leftover from an earlier run and the rename is
     * refused for a reason that has nothing to do with the test — which would read
     * as this feature being broken. `R` + 8 digits + a counter is 11-12 chars.
     */
    let renameCounter = 0
    const freshName = (): string => {
      renameCounter += 1
      return `R${Date.now().toString().slice(-8)}-${renameCounter}`
    }

    /**
     * Rename from the LEFT list and wait for the row to actually take the name.
     *
     * The settle is the ROW, and it has to be: there is NO toast for a material
     * rename, in either direction. It is also the honest oracle — renameMaterialWorker
     * dispatches SUCCEEDED only after the PATCH resolves, so the list showing the
     * new name is proof the backend accepted it, not just that React re-rendered.
     */
    const renameInLibrary = async (materialId: string, next: string): Promise<void> => {
      await Materials.renameRow(materialId, next, 'enter')
      await browser.waitUntil(async () => (await materialNameOf(materialId)) === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `the library row never took the new name "${next}"`
      })
    }

    // ── The RIGHT-PANEL form's name row ────────────────────────────────────
    //
    // Local to this block on purpose. MaterialProperties.page.ts exposes the name
    // input and its value but nothing that UNLOCKS, WRITES or COMMITS it, because
    // until now nothing had ever renamed a material from the right panel — the one
    // path where NO_NAME_CONFLICTS makes the form behave differently from the list.
    // They belong in the page object the moment a second spec needs them; adding
    // them there for one describe would edit a file three other specs share.

    /** True while the field is still locked. React DROPS the attribute when it
     *  unlocks, so presence — not a truthy value — is the test. */
    const materialNameLocked = async (): Promise<boolean> =>
      (await MaterialProperties.nameInput.getAttribute('readonly')) !== null

    /**
     * Tap the pencil and wait for the field to actually unlock.
     *
     * The pencil is reached by walking OUT of the name input rather than by a bare
     * `button[aria-label="Edit name"]`: the GROUND form renders a pencil carrying
     * exactly the same label. RightPanel only ever mounts one form at a time, so
     * today the bare query would be unambiguous — but a selector that would
     * silently address the other panel is not worth keeping. The input sits inside
     * a `relative` wrapper, which sits in the header row beside the pencil, hence
     * the two hops.
     */
    const editMaterialName = async (): Promise<void> => {
      await browser.execute(() => {
        const input = document.querySelector('[data-testid="material-form-name"]')
        if (!input) throw new Error('editMaterialName: the material form is not open')
        const header = input.parentElement?.parentElement
        const btn = header?.querySelector('[aria-label="Edit name"]') as HTMLElement | null
        if (!btn) throw new Error('editMaterialName: the material form has no pencil')
        btn.click()
      })
      await browser.waitUntil(async () => !(await materialNameLocked()), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the pencil never unlocked the material name field'
      })
    }

    /** Write a name WITHOUT committing it — the native value setter plus `input`,
     *  because a plain setValue loses to React on a controlled field. */
    const setMaterialName = async (value: string): Promise<void> => {
      await browser.execute((val: string) => {
        const node = document.querySelector(
          '[data-testid="material-form-name"]'
        ) as HTMLInputElement | null
        if (!node) throw new Error('setMaterialName: the material form is not open')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
          ?.set
        node.focus()
        setter?.call(node, val)
        node.dispatchEvent(new Event('input', { bubbles: true }))
      }, value)
    }

    /** Blur the field — the ONLY thing that commits a rename here. */
    const commitMaterialName = async (): Promise<void> => {
      await browser.execute(() => {
        const node = document.querySelector(
          '[data-testid="material-form-name"]'
        ) as HTMLInputElement | null
        node?.blur()
      })
    }

    /**
     * The message under the form's name field, read from the TOOLTIP trigger.
     *
     * NOT from `.form-error-text`: every parameter card renders that class for its
     * own errors, so an unscoped read can return a card's message and a scoped one
     * would need a wrapper that carries no testid. The Tooltip is an immediate
     * SIBLING of the input (`{nameError && <Tooltip …/>}` inside the input's
     * `relative` wrapper), which addresses it exactly — the same adjacency
     * ObjectProperties.nameState relies on for the ground form's name.
     *
     * Returns null when no error appeared inside the window, so a caller can
     * assert the ABSENCE of one instead of this throwing an unrelated timeout.
     */
    const materialNameError = async (timeout: number = TIMEOUTS.SHORT): Promise<string | null> => {
      const tip = $('[data-testid="material-form-name"] + span[aria-label^="Validation error:"]')
      try {
        await browser.waitUntil(async () => tip.isExisting(), { timeout })
      } catch {
        /* absent is a legitimate answer — see above */
      }
      return (await tip.isExisting()) ? tip.getAttribute('data-tooltip-content') : null
    }

    it('a rename in the LIBRARY LIST relabels the OPEN ground form in place', async () => {
      // This is observable at all only because of HOW the rename is opened.
      // Materials.openRename dispatches a SYNTHETIC dblclick on the name span,
      // which reaches React's onDoubleClick but never fires the ROW's onClick — so
      // the material row is not selected, RightPanel's open-nonce does not move,
      // and the GROUND form stays mounted right through the rename. A real
      // double-click would select the row, swap the panel to the material form, and
      // there would be nothing left on screen to observe.
      const { name, materialId } = await groundWearing()
      const renamed = freshName()

      // Read BEFORE, so what follows is a CHANGE and not a coincidence — an app
      // that had shown `renamed` all along would satisfy the wait below on its own.
      expect(await ObjectProperties.assignedNames()).toEqual([name])

      await renameInLibrary(materialId, renamed)

      // THE POINT: nothing touched the ground, and it relabels anyway.
      // ObjectPropertiesForm resolves an assigned material's label through
      // nameFor(), which reads the LIVE materials slice — so the row follows
      // RENAME_MATERIAL_SUCCEEDED with no refetch and no reselect.
      await waitForAssigned([renamed])
      // …and the panel really is still the GROUND's. If the dblclick had selected
      // the row, RightPanel would have unmounted this form entirely (it renders one
      // form at a time), and `waitForAssigned` above would have been reading a
      // Materials section that no longer existed.
      await expect(ObjectProperties.form).toBeDisplayed()
      await expect(MaterialProperties.nameInput).not.toBeExisting()
    })

    it("the read-only popup follows the NEW name and keeps the material's values", async () => {
      // Two claims that only mean something together.
      //
      // RENAME_MATERIAL_SUCCEEDED patches the cached DETAIL's name in place
      // (`if (cached) cached.name = action.name`) rather than dropping the entry —
      // chosen so a rename costs no refetch. The risk that carries is the mirror
      // image of a stale label: the MEMBERS surviving is the whole point of
      // patching rather than invalidating, and the label moving is what must not
      // disturb them.
      //
      // The popup is also the one surface where a stale label makes it UNREACHABLE
      // rather than merely wrong: it is addressed by `{name} properties`, and the
      // trigger that opens it is found by its rendered name.
      const materialId = await trackMaterial()
      await MaterialProperties.waitForOpen()
      // A fresh material already carries ONE blank card, so this is card 2.
      const cardId = await MaterialProperties.addCard()
      await MaterialProperties.pickType(cardId, 'Visualiser')
      await MaterialProperties.setColorChannel('r', '12')
      await MaterialProperties.setColorChannel('g', '34')
      await MaterialProperties.setColorChannel('b', '56')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      await MaterialProperties.saveCard(cardId)
      const name = await materialNameOf(materialId)

      await trackGround()
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()
      await waitForAssigned([name])

      const renamed = freshName()
      await renameInLibrary(materialId, renamed)
      await waitForAssigned([renamed])

      await ObjectProperties.openMaterialDetail(renamed)
      await expect(ObjectProperties.materialDetail(renamed)).toBeDisplayed()
      // Asserted with a popup ACTUALLY OPEN, which is the only moment it says
      // anything: before the open, the old selector matches nothing either and the
      // check would pass on an app that never renamed at all.
      await expect(ObjectProperties.materialDetail(name)).not.toBeExisting()

      await browser.waitUntil(
        async () => (await ObjectProperties.detailSections(renamed)).includes('Visualiser'),
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the renamed material lost its Visualiser section on the ground'
        }
      )
      const rows = await ObjectProperties.detailRows(renamed)
      // materialLabel() resolves R/G/B the way the app does (the four Visualiser
      // channels have no catalog label; VISUALISATION_CHANNEL_LABELS supplies
      // them), rather than hardcoding three letters that mean nothing on their own.
      expect(
        [
          ObjectProperties.valueIn(rows, 'Visualiser', materialLabel('color_r')),
          ObjectProperties.valueIn(rows, 'Visualiser', materialLabel('color_g')),
          ObjectProperties.valueIn(rows, 'Visualiser', materialLabel('color_b'))
        ].join('/')
      ).toBe('12/34/56')

      await ObjectProperties.closeMaterialDetail(renamed)
      // Load-bearing, not tidying: an open AnchoredPopup lays a `fixed inset-0
      // z-40` overlay across the panel, and afterEach's first WebDriver click would
      // be intercepted by it — naming whatever it clicked, not this popup.
      await browser.waitUntil(
        async () => !(await ObjectProperties.materialDetail(renamed).isExisting()),
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the material properties popup never closed' }
      )
    })

    it('the Select picker offers the NEW name, drops the old one, and keeps the tick', async () => {
      // SelectMaterialsPopup lists the library slice directly, so it is a DIFFERENT
      // consumer from nameFor() — and the one that decides what a user can pick
      // next. Three assertions because each alone is satisfiable by a broken app:
      // the new name being listed holds if the popup kept BOTH; the old one being
      // gone holds if the rename had emptied the library; and the tick is what says
      // the picker still recognises this as the SAME material (it keys selection on
      // the group id, which a rename does not touch).
      const { name, materialId } = await groundWearing()
      const renamed = freshName()

      await renameInLibrary(materialId, renamed)
      await waitForAssigned([renamed])

      await openPicker()
      const state = await ObjectProperties.pickerState()
      const names = state.rows.map((r) => r.name)
      expect(names).toContain(renamed)
      expect(names).not.toContain(name)
      // Membership only — the library is GLOBAL and carries other runs' leftovers,
      // so its size is never an assertion.
      expect(state.rows.filter((r) => r.selected).map((r) => r.name)).toEqual([renamed])
      await ObjectProperties.closeMaterialPicker()
    })

    it('a RESELECT of the ground still shows the new name — the stale copy is never repaired', async () => {
      // THE STRONGEST ORACLE for nameFor() in this suite, because the reselect goes
      // deliberately through the one path that CANNOT have been fixed up:
      //
      //  - DraftMaterialGroup.name is a DENORMALIZED copy, taken when the material
      //    was picked. The geometry slice has no RENAME_MATERIAL_SUCCEEDED handler,
      //    so nothing ever rewrites it — unlike Materials' REMOVE_MATERIAL, which
      //    that same reducer does intercept and act on.
      //  - loadObjectWorker SHORT-CIRCUITS on the detail cache: a ground that has
      //    been loaded once is reselected with NO GET, so the rebuilt draft is
      //    seeded from exactly that stale copy.
      //
      // The name on screen is therefore correct ONLY because nameFor() masks it
      // with the live library. Take nameFor() away and this test fails while the
      // three above still pass — which is the whole reason it is written as a round
      // trip rather than as another live read.
      const materialId = await trackMaterial()
      const name = await materialNameOf(materialId)
      const target = await trackGround()
      const other = await trackGround()
      // +Ground opens the NEW ground's form, so the panel is showing `other`.
      // Select the one under test or the pick lands on the wrong row.
      await Geometry.selectRow(target)
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()
      await waitForAssigned([name])

      const renamed = freshName()
      await renameInLibrary(materialId, renamed)
      await waitForAssigned([renamed])

      // Away and back. `other` carries nothing, so the empty read in the middle
      // also proves the panel genuinely changed hands rather than simply not
      // re-rendering — without it, a form that never updated at all would pass.
      await Geometry.selectRow(other)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([])
      await Geometry.selectRow(target)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([renamed])
    })

    it('the RIGHT-PANEL name field ignores ENTER and commits only on BLUR', async () => {
      // MaterialPropertiesForm's name <input> carries onChange, onDoubleClick and
      // onBlur — and NO onKeyDown at all. So Enter is not "handled and rejected",
      // it is not handled, and that no-op half is the interesting one: a user who
      // types a name and presses Enter (the gesture the LEFT list row DOES honour)
      // gets no feedback whatsoever, and the rename fires later, whenever something
      // else happens to take focus.
      //
      // FINDING, pinned rather than left in a doc: the two rename surfaces for the
      // same material disagree about the commit key. The list commits on Enter and
      // discards on Escape; the form has neither, and only blur commits.
      const { groundId, materialId, name } = await groundWearing()
      const renamed = freshName()

      // A REAL click on the row here — this test wants the panel handed over.
      await Materials.openMaterial(materialId)
      await MaterialProperties.waitForOpen()
      await editMaterialName()
      await setMaterialName(renamed)

      await browser.keys(['Enter'])
      // The LIST is the oracle, not the field. handleNameChange writes every
      // keystroke into the draft, so the field holds the typed text whether or not
      // the PATCH fired — reading it back would pass either way.
      expect(await staysFalse(async () => (await materialNameOf(materialId)) === renamed)).toBe(
        true
      )
      // …and the edit is still OPEN: Enter did not even end it, which is what
      // separates "not handled" from "handled and refused" (handleNameBlur re-locks
      // the field on every commit attempt, valid or not).
      expect(await materialNameLocked()).toBe(false)

      // Now blur, which IS the commit path — handleNameBlur is the only caller of
      // renameMaterialRequested from this form.
      await commitMaterialName()
      await browser.waitUntil(async () => (await materialNameOf(materialId)) === renamed, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'blurring the form name field never committed the rename'
      })
      expect(await materialNameOf(materialId)).not.toBe(name)

      // The ground's form is not even mounted right now — RightPanel unmounted it
      // when the material took the panel — so this also proves the relabel is not a
      // live patch of a rendered row but a resolution done at render time.
      await Geometry.selectRow(groundId)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([renamed])
    })

    it('a duplicate name is refused CLIENT-side on the list row and by the BACKEND on the form', async () => {
      // ONE test, both surfaces, because the point is the CONTRAST — but the
      // contrast is the MECHANISM, not the wording:
      //   - the LEFT row hands validateMaterialName the names it already holds, so
      //     it refuses locally and never sends the PATCH at all
      //   - the RIGHT form hands it an EMPTY set (MaterialPropertiesForm's
      //     NO_NAME_CONFLICTS: "uniqueness is the backend's to enforce on the
      //     rename, so this form doesn't pre-empt it"), so the PATCH goes and the
      //     rejection only arrives as a 409
      // Both then render the SAME string (see the DEVIATION note below), so what
      // fails if the paths are ever collapsed is the round trip and the routing —
      // the row keeping its committed name while the form keeps the refused text.
      const keeperId = await trackMaterial()
      const keeperName = await materialNameOf(keeperId)
      const { materialId, name } = await groundWearing()

      // ── the LEFT list row: refused before anything is sent ────────────────
      await Materials.renameRow(materialId, keeperName, 'enter')
      expect(await Materials.renameError(materialId)).toBe(MATERIALS_MSG.nameExists)
      // Enter did NOT commit: MaterialNameEditor.commit returns early while the
      // editor is invalid, so it stays open with the refused text still in it.
      await browser.keys(['Escape'])
      await browser.waitUntil(async () => !(await Materials.nameEditor.isExisting()), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Escape never closed the inline rename editor'
      })
      // Read the row only AFTER the editor is gone. While it is open the row
      // renders an INPUT in place of the name span and Materials.snapshot falls
      // back to that input's value — so the row would "read" as the refused text
      // and this assertion would fail for entirely the wrong reason.
      expect(await materialNameOf(materialId)).toBe(name)
      // The ground never saw a thing, which is the other half of "never sent".
      await waitForAssigned([name])

      // ── the RIGHT panel form: refused by the 409 ──────────────────────────
      await Materials.openMaterial(materialId)
      await MaterialProperties.waitForOpen()
      await editMaterialName()
      await setMaterialName(keeperName)
      await commitMaterialName()

      // MUTATION: unlike the list's check this one is a round trip, so the message
      // cannot appear until the backend has answered.
      const shown = await materialNameError(TIMEOUTS.MUTATION)
      // DEVIATION: the two surfaces now read ALIKE, deliberately.
      //
      // This test used to assert MATERIALS_MSG.nameExistsBackend here and then
      // `.not.toBe(nameExists)`, because the row and the form once reported the
      // conflict in different words. They no longer do: the backend still sends
      // "Material group name already exists", but reducer.ts's
      // RENAME_MATERIAL_FAILED matches the backend CODE
      // (MATERIAL_GROUP_NAME_EXISTS) and re-words it to the panel's own string —
      // "Only the WORDING is ours … 'group' names an internal table". So the
      // wording contrast is gone and asserting it is what made this test stale.
      //
      // What still differs — and is what this test now pins — is the MECHANISM:
      // the row refuses locally and sends NOTHING, while the form has no client
      // check (NO_NAME_CONFLICTS) and only learns of the clash from a real 409.
      // The round trip above is that difference; the assertions below prove the
      // rejection was routed to the FORM rather than the row.
      expect(shown).toBe(MATERIALS_MSG.nameExists)
      // The rejection was ROUTED to the form, not to the row: RENAME_MATERIAL_FAILED
      // writes editDraft.nameError when the failing material is the one open in the
      // panel, deliberately, because "the left row shows the committed (still
      // valid) old name, so an error beneath it would point at the wrong name".
      //
      // Called with no timeout: renameError's default is inferred from TIMEOUTS,
      // which is `as const`, so the parameter is narrowed to the literal 5000 and a
      // shorter budget will not type-check. 5s of watching an error NOT appear is
      // the cost of that — the same narrowing ObjectProperties.nameError widens by
      // hand, and worth widening here too the next time this file is opened.
      expect(await Materials.renameError(materialId)).toBe(null)
      // Pessimistic: the list keeps the committed name…
      expect(await materialNameOf(materialId)).toBe(name)
      // …while the field keeps the refused text, so the user can see what was
      // rejected rather than watching it silently revert.
      expect(await MaterialProperties.nameValue()).toBe(keeperName)
    })
  })

  // ══ One material, SEVERAL grounds ═════════════════════════════════════════

  describe('one material on SEVERAL grounds', () => {
    /**
     * Two INDEPENDENT grounds (no group) both wearing the same material, SAVED,
     * with ground `a` left on screen.
     *
     * The file's only other multi-ground case is the collapsed-GROUP drag fan-out,
     * where the members share a parent and the assignment is made ONCE against the
     * group. That shape cannot express anything below: a per-object unassign has to
     * be able to leave a sibling alone, and through a group there is no sibling to
     * leave alone.
     *
     * Assigned through the FORM rather than by drag. The drop path commits with no
     * Save and folds itself into materialBaseline in the same action, which would
     * make "was this actually saved?" a second thing under test in every assertion
     * that follows — and the unassign test below depends on the material being a
     * BASELINE, since that is what decides whether the trash confirms or drops
     * silently.
     */
    const twoGroundsWearing = async (): Promise<{
      a: string
      b: string
      materialId: string
      name: string
    }> => {
      const materialId = await trackMaterial()
      const name = await materialNameOf(materialId)
      const a = await trackGround()
      const b = await trackGround()
      // +Ground opens the NEW ground's form, so the panel is on `b` right now.
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()
      await waitForAssigned([name])
      await Geometry.selectRow(a)
      await ObjectProperties.waitForOpen()
      await pick(name)
      await saveForm()
      await waitForAssigned([name])
      return { a, b, materialId, name }
    }

    it('the SAME material can be assigned to two independent grounds', async () => {
      // The single-material rule is PER GROUND, not per material — a material is a
      // library entry and nothing about assigning it consumes it. Worth pinning
      // because the picker's radio shape ("a ground carries ONE material") reads
      // very easily as the converse.
      const { a, b, name } = await twoGroundsWearing()

      // Read both back from the PERSISTED side rather than from whichever draft
      // happened to be on screen when each was saved: reselecting rebuilds the
      // draft from the detail cache the PATCH refreshed.
      await Geometry.selectRow(b)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name])
      await Geometry.selectRow(a)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name])

      // …and it is still ONE library row. A second assignment that had duplicated
      // the material instead of referencing it would show up here as a second row
      // with the same name — invisible from either ground.
      expect((await Materials.names()).filter((n) => n === name)).toEqual([name])
    })

    it('DELETING it from the library empties BOTH grounds AND both pickers', async () => {
      // Two different mechanisms, one delete:
      //  - the ground ON SCREEN loses its row with no reselect at all, because the
      //    geometry reducer intercepts Materials' REMOVE_MATERIAL and filters the
      //    group out of createDraft.materials AND createDraft.materialBaseline.
      //  - the OTHER ground was never open when the delete happened, so it can only
      //    be right if that same branch also walked byScope.detailsById — which it
      //    does, scope-wide, because REMOVE_MATERIAL carries no scenario id. And
      //    reselecting is served FROM that cache with no GET (loadObjectWorker
      //    short-circuits on it), so this really is reading the client-side purge
      //    and not a fresh backend answer that would have been empty regardless.
      //
      // The two PICKERS ride along on this setup rather than provisioning a second
      // one of their own. 'deleting an ASSIGNED material removes it from the LIST,
      // the GROUND and the PICKER' already pins the picker for one ground, and the
      // picker is fed by the LIBRARY slice — the same list whichever ground is
      // selected — so a separate two-ground test that only re-read it would have
      // been a duplicate wearing a second expensive setup.
      const { a, b, materialId, name } = await twoGroundsWearing()
      // twoGroundsWearing leaves `a` on screen, still wearing it.
      await waitForAssigned([name])

      await drainToasts()
      // MaterialRow's trash calls e.stopPropagation(), so this does NOT select the
      // material row: the GROUND form stays up and the live purge can be read
      // directly, without a reselect that would hide it behind a rebuild.
      await Materials.deleteRow(materialId)
      await waitForToast(MATERIALS_TOAST.deleted(name))
      // Untracked immediately — afterEach must not try to delete it a second time.
      materials = materials.filter((x) => x !== materialId)

      // 1. the ground that was open, with nothing touched in between
      await waitForAssigned([], TIMEOUTS.MUTATION)
      // 2. the one that was not
      await Geometry.selectRow(b)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([], TIMEOUTS.MUTATION)
      // 3. and it is GONE from the library, not merely detached from both grounds
      expect(await Materials.rowState(materialId)).toBeUndefined()

      // 4. neither ground can pick it again. The picker is a third consumer of the
      //    library slice — separate from the ground's Materials row and from the
      //    read-only popup — and the one that decides what a user can pick NEXT: a
      //    deleted material still listed here is an assignment that would fail on
      //    Save, offered from a row the user was invited to choose.
      //    `b` first — it is already selected, so its picker is read with nothing
      //    moved in between.
      for (const groundId of [b, a]) {
        await Geometry.selectRow(groundId)
        await ObjectProperties.waitForOpen()
        await openPicker()
        // Membership only, and only about THIS material: the library is global, so
        // whether it is now empty or still holds other runs' leftovers is not this
        // test's business — and openPicker() keys on the heading precisely so both
        // shapes are readable here.
        expect((await ObjectProperties.pickerState()).rows.map((r) => r.name)).not.toContain(name)
        // Closed before the next selectRow: an open AnchoredPopup lays a
        // `fixed inset-0 z-40` overlay across the panel and would eat that click.
        await ObjectProperties.closeMaterialPicker()
      }
    })

    it('UNASSIGNING it from one ground leaves the OTHER one wearing it', async () => {
      // THE DIFFERENTIAL that gives the delete test above its meaning. Both
      // gestures empty the Materials section of the ground in front of you, and a
      // test that only ever looked at that ground could not tell them apart.
      // UNASSIGN_MATERIAL_SUCCEEDED is keyed on {objectId, groupId} and touches
      // exactly that object's detail and node; REMOVE_MATERIAL walks every cached
      // scope. Without this test, an unassign that had been wired scope-wide would
      // pass the whole file.
      const { b, materialId, name } = await twoGroundsWearing()

      // `a` is on screen with the material SAVED, which is what makes the trash
      // CONFIRM rather than silently drop a draft pick — the conditional branch is
      // chosen on draft.materialBaseline.
      await ObjectProperties.removeAssigned(name)
      const dlg = await waitForOpenDialog()
      expect(dlg.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.unassignTitle)
      // The heading names the MATERIAL (the Replace dialog on the same form names
      // the GROUND), so this also confirms the dialog that opened is the unassign
      // one and not something else the click could have raised.
      expect(dlg.heading).toBe(GEOMETRY_MATERIAL_MSG.unassignHeading(name))
      await clickDialogButton(GEOMETRY_MATERIAL_MSG.unassignConfirm)
      await waitForNoOpenDialog()
      // PESSIMISTIC: the row goes only once the DELETE comes back.
      await waitForAssigned([], TIMEOUTS.MUTATION)

      // The other ground is untouched…
      await Geometry.selectRow(b)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name])
      // …and so is the library row. An unassign must never consume the material —
      // if it did, ground `b` would be left pointing at nothing and would come back
      // flagged `stale` on the next reopen.
      expect(await materialNameOf(materialId)).toBe(name)
    })
  })

  describe('the sync dot', () => {
    /**
     * This test provisions its OWN projects — it navigates away from the file's
     * shared project — so it runs LAST in the file. It DOES still track its rows:
     * it ends up back in the project that holds them, so the shared afterEach can
     * reach them, and the material library is global enough that leaking one is
     * worse than a cleanup call that no-ops.
     */
    it('a material deleted from the library in ANOTHER scenario comes back flagged STALE', async () => {
      // `stale` is the ONLY reachable sync state — see the file header for why
      // `drift` cannot be produced from the GUI at all.
      //
      // It needs the library row gone while the ASSIGNMENT row survives.
      // material_library_service.delete_group deletes the group and then
      // eager-reconciles ONLY the scenario whose id the client sends (always the
      // active one), and object_material_group holds a SOFT reference with no FK
      // cascade — so deleting the material from a DIFFERENT project leaves this
      // one's assignment dangling, and scene_object_service._group_assignment_payload
      // stamps `stale: True` when the group is gone. That is exactly the "deleted
      // in another session, which this client never saw removed" case
      // ObjectPropertiesForm's own comment describes.
      //
      // Deleting it from the SAME project would not do: the reducer's
      // REMOVE_MATERIAL branch purges the row from the draft and every cached
      // scope outright, so nothing would be left to flag.
      await reloadToHome()
      const projectA = await enterGeometry('stalea')
      await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: '+ Add Materials never became enabled in the first project'
      })

      const materialId = await trackMaterial()
      const materialName = await materialNameOf(materialId)
      const groundId = await trackGround()
      const groundName = await groundNameOf(groundId)
      await ObjectProperties.waitForOpen()
      await pick(materialName)
      await saveForm()

      // A second project is a second scenario. The library is GLOBAL, so the
      // material is listed here too — and deleting it here reconciles only THIS
      // scenario.
      await reloadToHome()
      await enterGeometry('staleb')
      await browser.waitUntil(async () => (await Materials.rowState(materialId)) !== undefined, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: 'the global library did not carry the material into the second project'
      })
      await Materials.deleteRow(materialId)

      await reopenByName(projectA.name)
      await Geometry.waitForTree()
      const reopenedId = await Geometry.idForName(groundName)
      expect(reopenedId).not.toBe(null)
      await Geometry.selectRow(reopenedId as string)
      await ObjectProperties.waitForOpen()

      await browser.waitUntil(async () => (await ObjectProperties.assignedMaterials()).length === 1, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the dangling assignment was not listed after reopening the project'
      })
      const [row] = await ObjectProperties.assignedMaterials()
      // The dot's `title` is the ONLY place either sync state is exposed — it is
      // aria-hidden and carries no text, so there is nothing else to read.
      expect(row.syncFlag).toBe(GEOMETRY_MATERIAL_MSG.staleTitle)

      // FINDING for the feature owner, recorded rather than asserted so this test
      // cannot fail for a second reason: the backend sends `name: null` for a
      // deleted group and nothing client-side remembers what it was called, so a
      // stale row renders NAMELESS beside its amber dot — the user is told
      // something is wrong but not which material it was.
    })
  })

  // ══ Drag and drop — the ONLY path that assigns without a Save ═════════════

  describe('drag-and-drop assignment', () => {
    /**
     * Groups created by the running test.
     *
     * A group is not created by trackGround() — the geometry DRAG makes it — so
     * the file's afterEach cannot see it, and a leaked group row follows every
     * later test in this project. Deleting the GROUP takes its members with it
     * (its own confirmation says so: `Delete "Group.001" and its 2 geometries?`),
     * which is why this hook must run FIRST: mocha unwinds afterEach hooks
     * innermost-suite-first, so the outer per-ground deletes then no-op through
     * their own .catch().
     */
    let createdGroups: string[] = []

    afterEach(async () => {
      for (const id of [...createdGroups].reverse()) {
        await Geometry.deleteRow(id).catch(() => {})
        await Geometry.closeAnyOpenDialog().catch(() => {})
      }
      createdGroups = []
    })

    it('a material ROW hands the drag {groupId, name} under application/x-material', async () => {
      // The only test of MaterialRow.onDragStart anywhere. dragMaterialOnto()
      // synthesises its own payload, so nothing else would notice the row writing
      // a shape TreeRow can no longer parse — readMaterialDrop() demands BOTH
      // keys as strings and returns null otherwise, which degrades every drop
      // into silence rather than into an error.
      const materialId = await trackMaterial()
      const name = await materialNameOf(materialId)

      // The row id IS the library group id (MaterialRow.tsx:120-124 keys its
      // payload on material.id, and material-row-{id} is derived from the same
      // field), which is what makes this an equality and not a shape check.
      expect(await readMaterialDragPayload(materialId)).toEqual({ groupId: materialId, name })
    })

    it('a DROP assigns the dragged material — its toast, the panel row, and a mesh REFETCH', async () => {
      // Four claims off one expensive setup, because the drop is the only
      // producer of any of them:
      //  1. GEOMETRY_TOAST.materialAssigned fires. The right-panel Save raises
      //     GEOMETRY_TOAST.saved instead (see the save test above), so nothing
      //     else in this suite can reach this string.
      //  2. the material listed is the one that was DRAGGED, not merely "a"
      //     material. Two are in the library and Material.NNN is 3-digit padded,
      //     so neither name is a substring of the other.
      //  3. it is listed with NO Save press. The drop COMMITS — the saga POSTs
      //     immediately and ASSIGN_MATERIAL_SUCCEEDED folds the group into
      //     materialBaseline as well as into draft.materials — so the form comes
      //     back CLEAN.
      //  4. the viewport re-requested this ground's binary (3DWindow
      //     onMaterialAssigned). A material's colour is baked into the mesh, so an
      //     assignment that never refetched would leave the ground painted exactly
      //     as it was.
      // The remaining half of "the ground reflects it" — that it is now actually
      // PAINTED in the material — stays manual: nothing available to WebDriver
      // reads pixels out of the WebGL canvas.
      const idleId = await trackMaterial()
      const idle = await materialNameOf(idleId)
      const draggedId = await trackMaterial()
      const dragged = await materialNameOf(draggedId)

      await recordMeshFetches()
      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      const groundName = await groundNameOf(groundId)
      // Wait the CREATE-time fetch out before re-arming, rather than assuming it
      // has landed. Without this a slow build could deliver it after the reset
      // below and satisfy the assignment's assertion for the wrong reason.
      await waitForMeshFetch(groundId)

      // Drain BEFORE the drop so the create toasts cannot satisfy waitForToast,
      // and re-arm AFTER draining so the recorder's log holds only what the
      // assignment caused (recordMeshFetches resets it, and is idempotent).
      await drainToasts()
      await recordMeshFetches()

      await dragMaterialOnto({ groupId: draggedId, name: dragged }, groundId)

      await waitForToast(GEOMETRY_TOAST.materialAssigned(dragged, groundName))
      await waitForAssigned([dragged], TIMEOUTS.MUTATION)
      expect(await ObjectProperties.assignedNames()).not.toContain(idle)
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)

      // The wait IS the oracle for WHICH object was refetched (it matches on
      // .../objects/{id}/geometry/binary and a 200); the bytes are what say the
      // backend actually rebuilt the tile.
      const mesh = await waitForMeshFetch(groundId)
      expect(mesh.bytes).toBeGreaterThan(0)
    })

    it('a SECOND drop CONFIRMS before replacing, and leaves exactly ONE material', async () => {
      // The single-material rule reaches the drop path through a confirmation of
      // its OWN: TreeRow.handleDrop calls setReplaceDrop when any target already
      // carries a different group, and TreeRow renders its own Replace dialog
      // (TreeRow.tsx:610-632) with copy identical to the ground form's. Both are
      // aria-label "Replace Material", which is why every read here goes through
      // support/dialogs.ts and its `[open]` scope.
      //
      // Worth stating plainly, because "a second drag replaces rather than adds"
      // is only half the shipped behaviour: it replaces AFTER asking, and the
      // dialog focuses Replace, so Enter on it replaces outright.
      const firstId = await trackMaterial()
      const first = await materialNameOf(firstId)
      const secondId = await trackMaterial()
      const second = await materialNameOf(secondId)
      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      const groundName = await groundNameOf(groundId)

      await dragMaterialOnto({ groupId: firstId, name: first }, groundId)
      await waitForAssigned([first], TIMEOUTS.MUTATION)

      await dragMaterialOnto({ groupId: secondId, name: second }, groundId)
      const dlg = await waitForOpenDialog()
      expect(dlg.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
      // The heading names the GROUND — TreeRow passes its own node.name — so it
      // reads identically to the form's, from a different component.
      expect(dlg.heading).toBe(GEOMETRY_MATERIAL_MSG.replaceHeading(groundName))
      expect(dlg.buttons).toEqual([
        GEOMETRY_MATERIAL_MSG.replaceCancel,
        GEOMETRY_MATERIAL_MSG.replaceConfirm
      ])
      expect(dlg.focused).toBe(GEOMETRY_MATERIAL_MSG.replaceConfirm)

      await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
      await waitForNoOpenDialog()
      // The displaced group is DELETEd by the same worker, before the POST, so
      // the ground is never momentarily carrying both.
      await waitForAssigned([second], TIMEOUTS.MUTATION)
      expect(await ObjectProperties.assignedNames()).not.toContain(first)
      expect(await countOpenDialogs()).toBe(0)
    })

    it('a drop on a COLLAPSED group spring-opens it and fans out to EVERY member', async () => {
      // A group carries no material of its own — handleDrop expands the drop over
      // its non-group children (TreeRow.tsx:319-321) — so the only proof of the
      // fan-out is each member carrying it afterwards.
      const materialId = await trackMaterial()
      const name = await materialNameOf(materialId)
      const first = await trackGround()
      const second = await trackGround()

      // Group them with the geometry drag. The new group's id is DIFFED, never
      // assumed: Group.NNN is gap-filling like every other name in this app.
      const before = new Set((await Geometry.groups()).map((g) => g.id))
      await dragRowOnto([second], first)
      await browser.waitUntil(async () => (await Geometry.groups()).some((g) => !before.has(g.id)), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'dragging one ground onto another never created a group'
      })
      const group = (await Geometry.groups()).find((g) => !before.has(g.id))
      if (!group) throw new Error('the new group vanished between the wait and the read')
      // Registered BEFORE any assertion below can throw — the nested afterEach is
      // the only thing that can reach it.
      createdGroups.push(group.id)

      if (group.expanded) await Geometry.toggleGroup(group.id)
      expect((await Geometry.rowState(group.id))?.expanded).toBe(false)

      // SPRING-OPEN, driven inline rather than through dnd.ts: its fireDragOver is
      // module-private, and dragMaterialOnto drops the moment the row lights up —
      // well inside TreeRow's 400ms dwell — so it can never observe this.
      // ONE dragover is the whole gesture: the timer is armed by the FIRST one and
      // deliberately never re-armed (that is what lets the dwell elapse under a
      // dragover repeating several times a second), and nothing here fires a
      // dragleave, which is the only thing that cancels it.
      await browser.execute(
        (sel: string, mime: string, payload: string) => {
          const el = document.querySelector(sel) as HTMLElement | null
          if (!el) throw new Error(`spring-open: no row for ${sel}`)
          const r = el.getBoundingClientRect()
          const dt = new DataTransfer()
          dt.setData(mime, payload)
          const opts = {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: r.left + r.width / 2,
            clientY: r.top + r.height / 2
          }
          el.dispatchEvent(new DragEvent('dragenter', opts))
          el.dispatchEvent(new DragEvent('dragover', opts))
        },
        `[data-testid="geo-row-${group.id}"]`,
        MATERIAL_MIME,
        JSON.stringify({ groupId: materialId, name })
      )
      // Polled, never slept on: the dwell is the app's timer, not ours.
      await browser.waitUntil(async () => (await Geometry.rowState(group.id))?.expanded === true, {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'holding a material over a collapsed group never sprang it open'
      })

      await drainToasts()
      await dragMaterialOnto({ groupId: materialId, name }, group.id)
      // The toast names the GROUP, not either member: TreeRow hands the worker its
      // own node.name as the target.
      await waitForToast(GEOMETRY_TOAST.materialAssigned(name, group.name))

      for (const memberId of [first, second]) {
        await Geometry.selectRow(memberId)
        await ObjectProperties.waitForOpen()
        await waitForAssigned([name], TIMEOUTS.MUTATION)
      }
    })
  })

  // ══ Editing a material that is already on a ground ════════════════════════

  describe('editing an applied material', () => {
    // detailRows / valueIn were local to this describe. They are now
    // ObjectProperties.detailRows / .valueIn, because material-submodels.test.ts
    // needs the same reader and a second hand-rolled copy of a <dl> walker is
    // how the two drift apart.
    const detailRows = (name: string): Promise<DetailRow[]> => ObjectProperties.detailRows(name)
    const valueIn = (rows: DetailRow[], section: string, label: string): string =>
      ObjectProperties.valueIn(rows, section, label)

    /**
     * The open card carrying `type`, or -1 while the form is still mounting.
     *
     * selectedType() resolves the card's TITLE first and then a combobox by that
     * aria-label, so mid-remount it can throw rather than return '' — swallowed
     * here so the poll below keeps polling instead of failing on a race.
     */
    const cardForType = async (type: string): Promise<number> => {
      for (const id of await MaterialProperties.cardIds()) {
        const got = await MaterialProperties.selectedType(id).catch(() => '')
        if (got === type) return id
      }
      return -1
    }

    const awaitCardForType = async (type: string): Promise<number> => {
      let cardId = -1
      await browser.waitUntil(
        async () => {
          cardId = await cardForType(type)
          return cardId > 0
        },
        {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: `the reopened material never showed its ${type} card`
        }
      )
      return cardId
    }

    it('a material EDITED after it was applied updates the ground READ-ONLY properties, and stays assigned', async () => {
      // ONE continuous journey, deliberately. Build a material with two type
      // cards, apply it to a ground by DRAG, change a value in each card, and read
      // the ground's own read-only view back — because the thing worth catching
      // lives only in the seams: the Materials write-through detail cache is what
      // the geometry panel reads for an assigned material's values
      // (ObjectPropertiesForm.membersFor prefers it over the object GET's baseline
      // precisely so an edit shows up without a reload), and no per-feature test
      // can observe that handover.
      //
      // Closes, in order: "the applied material can be identified through the
      // ground properties" (§12), "change one or more values of the applied
      // material" / "save the updated material" / "the ground's READ-ONLY
      // properties reflect the UPDATED values" / "all applicable updated values" /
      // "changing the material does not DETACH it" (§13), and §16's drag-apply,
      // modify and reflect steps.
      const materialId = await trackMaterial()
      await MaterialProperties.waitForOpen()

      // A fresh material already carries ONE blank card, so these are cards 2 and 3.
      const visCard = await MaterialProperties.addCard()
      await MaterialProperties.pickType(visCard, 'Visualiser')
      await MaterialProperties.setColorChannel('r', '12')
      await MaterialProperties.setColorChannel('g', '34')
      await MaterialProperties.setColorChannel('b', '56')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(visCard), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a complete colour'
      })
      await MaterialProperties.saveCard(visCard)
      // Collapsed once saved, and this is not tidiness: an open Visualiser card is
      // tall (the colour area plus three sliders), and the next card's Save is
      // clicked through WebDriver, which has to reach it inside the panel's own
      // scroller. Collapsing keeps every later control near the top. The card keeps
      // its type Select either way — that is outside the `open &&` gate.
      await MaterialProperties.toggleCard(visCard)

      const stomCard = await MaterialProperties.addCard()
      await MaterialProperties.pickType(stomCard, 'Stomatal Conductance')
      // gamma_co2 is this type's one TOP-LEVEL numeric field: it renders with no
      // sub-model chosen, and materials carry no `required` flag at all
      // (ProjectScreen/types.ts: `required` is object-types only, so
      // materialBlueprint's `def.required ?? false` is always false), so the card
      // is saveable with just this.
      await MaterialProperties.setField(stomCard, 'gamma_co2', '5')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(stomCard), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled for a Stomatal Conductance card with a valid gamma_co2'
      })
      await MaterialProperties.saveCard(stomCard)

      const name = await materialNameOf(materialId)
      const groundId = await trackGround()
      await ObjectProperties.waitForOpen()
      const groundName = await groundNameOf(groundId)

      await drainToasts()
      await dragMaterialOnto({ groupId: materialId, name }, groundId)
      await waitForToast(GEOMETRY_TOAST.materialAssigned(name, groundName))
      await waitForAssigned([name], TIMEOUTS.MUTATION)

      // IDENTIFYING it from the ground: the popup's aria-label IS the material's
      // name, and it holds one section per type the material actually carries.
      // Nothing else on this form says which material the ground is wearing.
      await ObjectProperties.openMaterialDetail(name)
      await expect(ObjectProperties.materialDetail(name)).toBeDisplayed()
      await browser.waitUntil(
        async () => (await ObjectProperties.detailSections(name)).length === 2,
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: "the popup never listed both of the material's type sections"
        }
      )
      expect([...(await ObjectProperties.detailSections(name))].sort()).toEqual([
        'Stomatal Conductance',
        'Visualiser'
      ])

      const before = await detailRows(name)
      // R/G/B are the popup's own labels for the colour channels
      // (materialBlueprint VISUALISATION_CHANNEL_LABELS), chosen to match the
      // editable form's ColorPicker rather than the catalog's unlabelled color_r.
      expect(
        [
          valueIn(before, 'Visualiser', 'R'),
          valueIn(before, 'Visualiser', 'G'),
          valueIn(before, 'Visualiser', 'B')
        ].join('/')
      ).toBe('12/34/56')
      // 'Gamma_CO2' is the CATALOG's label, set explicitly by migration 027 — not
      // the humanized property name.
      expect(valueIn(before, 'Stomatal Conductance', 'Gamma_CO2')).toBe('5')

      await ObjectProperties.closeMaterialDetail(name)
      // Load-bearing, not tidying: an open AnchoredPopup lays a `fixed inset-0
      // z-40` overlay over the panel, and the very next step is a WebDriver click
      // on a material row underneath it.
      await browser.waitUntil(
        async () => !(await ObjectProperties.materialDetail(name).isExisting()),
        {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: 'the properties popup never closed, so its overlay would eat the next click'
        }
      )

      // Back to the Materials form — the journey's own step, and the way a user
      // gets there: clicking the left-panel row swaps the RIGHT panel from the
      // ground form to this material's (RightPanel picks whichever open-nonce
      // moved last).
      await Materials.openMaterial(materialId)
      await MaterialProperties.waitForOpen()
      // Card ids RESTART at 1 on a reopen — one card per backend member, in member
      // order — so the ids captured above mean nothing here. Find each card by the
      // type it carries.
      const visAgain = await awaitCardForType('Visualiser')
      // The TYPE is locked on a saved card…
      expect(await MaterialProperties.typeLocked(visAgain)).toBe(true)
      // …and its VALUES are not. That distinction is the whole of "change one or
      // more values of the applied material": every other saveCard() in this suite
      // is a card's FIRST save, so this is the first time anything has re-dirtied a
      // saved one.
      await MaterialProperties.setColorChannel('r', '99')
      await MaterialProperties.setColorChannel('g', '88')
      await MaterialProperties.setColorChannel('b', '77')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(visAgain), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'editing a SAVED card never re-opened its Save'
      })
      await drainToasts()
      await MaterialProperties.saveCard(visAgain)
      await waitForToast(MATERIALS_TOAST.saved)
      await MaterialProperties.toggleCard(visAgain)

      const stomAgain = await awaitCardForType('Stomatal Conductance')
      await MaterialProperties.setField(stomAgain, 'gamma_co2', '7')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(stomAgain), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'editing a saved Stomatal Conductance card never re-opened its Save'
      })
      await MaterialProperties.saveCard(stomAgain)

      // Back to the ground. Re-selecting it reloads the object, so what is listed
      // below is the persisted assignment and not the draft the drop left behind.
      await Geometry.selectRow(groundId)
      await ObjectProperties.waitForOpen()
      await waitForAssigned([name], TIMEOUTS.MUTATION)
      // An edit must not detach the material, and must not flag it either: `stale`
      // means the library lost the group, which an edit plainly did not.
      expect((await ObjectProperties.assignedMaterials())[0].syncFlag).toBe(null)

      await ObjectProperties.openMaterialDetail(name)
      await browser.waitUntil(
        async () => (await ObjectProperties.detailSections(name)).length === 2,
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the reopened popup never listed both type sections'
        }
      )
      const after = await detailRows(name)
      // Asserted WITHOUT reopening the project: "immediately, via the write-through
      // cache" (reducer.refreshDetailCache) is the claim under test.
      expect(
        [
          valueIn(after, 'Visualiser', 'R'),
          valueIn(after, 'Visualiser', 'G'),
          valueIn(after, 'Visualiser', 'B')
        ].join('/')
      ).toBe('99/88/77')
      expect(valueIn(after, 'Stomatal Conductance', 'Gamma_CO2')).toBe('7')
      // A row nobody touched keeps its value — so the two assertions above are an
      // EDIT arriving, not the popup being rebuilt from somewhere else. Opacity is
      // seeded to 100 on entering Custom mode and saved with the colour.
      expect(valueIn(after, 'Visualiser', 'Opacity (%)')).toBe('100')
    })
  })
})
