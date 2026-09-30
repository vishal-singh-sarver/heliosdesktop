/**
 * A LARGE ground — and why this file is deliberately on its own.
 *
 * ── The finding this file exists to record ────────────────────────────────
 * A default ground is NOT bare. The backend bakes the bundled soil texture
 * (`material_apply._DEFAULT_GROUND_TEXTURE`, i.e. dirt.jpg) into every ground
 * that carries no Visualiser material, and dirt.jpg is 512x512. The Helios
 * engine refuses a tile whose subdivision count reaches `repeat * texture_px`
 * (Context_object.cpp: `subdiv.x >= repeat.x * sz.x`), so a SOIL ground with
 * texture_x = 1 is HARD-CAPPED AT 511 SUBDIVISIONS PER AXIS.
 *
 * Assigning a COLOUR-MODE Visualiser material (texture_toggle false) makes the
 * tile UNTEXTURED — `_winner_surface` returns 'colour', `_build` takes the
 * `addTileObject(..., color=...)` branch — and an untextured tile has no
 * texture pixels to be capped against. THE MATERIAL IS WHAT UNLOCKS THE
 * RESOLUTION. That is the inverse of the obvious expectation ("a material is
 * decoration; resolution is geometry") and it is the point of this file.
 *
 * Measured on this machine on 2026-09-02, by driving the packaged backend
 * directly:
 *   - PATCH a soil ground to 1000x1000 -> HTTP 422, code RESOLUTION_TOO_HIGH,
 *     message exactly RESOLUTION_TOO_HIGH_MSG below.
 *   - the identical PATCH with a colour-mode Visualiser assigned -> HTTP 200.
 *   - building 1000x1000 = 10.9s; assigning another material to it = 16.1s;
 *     deleting it = 15.7s; and the binary mesh a VISIBLE row would download is
 *     70,000,004 bytes (66.8 MB).
 *
 * ── Why it is a SEPARATE SPEC FILE ────────────────────────────────────────
 * The costs above all fit inside wdio's per-test budget. The MEMORY does not
 * come back: the backend's RSS goes 0.11 GB -> 2.55 GB on the 1000x1000 build
 * and is still 2.56 GB AFTER THE GROUND HAS BEEN DELETED. ~2.45 GB is retained
 * for the life of the process. wdio gives each spec FILE its own session and
 * its own backend, so keeping this work here means the retention dies with this
 * file instead of following the other ~40 geometry/material tests around and
 * turning into "the suite gets slower the longer it runs".
 *
 * The afterEach below still deletes the big ground — a leaked row corrupts the
 * shared project the same way it would anywhere else — but that delete reclaims
 * NOTHING on the backend. Do not read a green teardown as "the memory went
 * back". It did not. That is the whole reason for the isolation.
 *
 * ── The rule every test here obeys: HIDE THE ROW BEFORE THE BIG SAVE ───────
 * 3DWindow's `onGeometryUpdated` and `onMaterialAssigned` both bail on
 * `!node.visibleInViewport`, and `selectSceneObjects` filters hidden nodes out
 * of the scene load — so a hidden ground is never fetched and never parsed.
 * There is NO timeout on the mesh fetch (utils/api.ts documents the removal as
 * deliberate: "saving a high-resolution geometry that carries a texture ran
 * past the old 30s cap"), so a VISIBLE big ground has nothing to stop it
 * dragging 66.8 MB through the renderer inside a 120s mocha budget.
 *
 * NEVER RE-OPEN THE EYE on a big ground. Unhiding triggers a fresh full fetch,
 * and nothing in the app or the harness will interrupt it.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────
 * This file is the ONLY sanctioned exception to
 * GEOMETRY_LIMITS.MAX_SAVEABLE_RESOLUTION_CELLS. Nothing else belongs here:
 * field validation, save gating and the texture-repeat rule are covered in
 * geometry.test.ts / ground.test.ts and at the unit layer, which see them
 * better and faster.
 */

import Geometry from '../pages/Geometry.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import { GEOMETRY_LIMITS, GEOMETRY_MATERIAL_MSG, GEOMETRY_TOAST } from '../constants/geometry'
import { TIMEOUTS } from '../config/timeouts'
import {
  enterGeometry,
  staysFalse,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { clickDialogButton, waitForNoOpenDialog, waitForOpenDialog } from '../support/dialogs'
import { isMeshUrlFor, meshFetches, recordMeshFetches, waitForMeshFetch } from '../support/viewport3d'
import { drainToasts, waitForToast } from '../support/toasts'
import {
  unassignMaterial,
  waitForDefaultMaterial,
  waitForLibraryRow
} from '../support/defaultMaterial'

/**
 * The BACKEND's 422 body for a subdivision count above the ground texture's
 * pixel resolution — `scene_object_service.py`, both raise sites (the in-place
 * `setTileObjectSubdivisionCount` path and the `_build` rebuild path deliberately
 * answer with the same code and copy).
 *
 * Kept LOCAL rather than added to e2e/constants/geometry.ts on purpose: that file
 * mirrors FRONTEND copy (Geometry/messages.ts and store/toastMessages.ts) and says
 * so. This string has a completely different provenance — it is Python, it travels
 * over the wire, and the frontend never had a chance to reword it. Filing it with
 * the frontend copy would invite someone to "fix" it against messages.ts, where it
 * does not exist.
 */
const RESOLUTION_TOO_HIGH_MSG =
  'Ground resolution is too high for the ground texture. Lower the resolution and try again.'

/** resolution_x and resolution_y for the big ground: 1000 x 1000 = 1e6 cells. */
const BIG_RESOLUTION = '1000'

/**
 * A safe resolution: 10 x 10 = 100 cells, exactly
 * GEOMETRY_LIMITS.MAX_SAVEABLE_RESOLUTION_CELLS, and well under the 511-per-axis
 * soil cap. Used by the control test, which changes EXTENT only.
 */
const SAFE_RESOLUTION = '10'

/** The extent the user asked for. 100 m, i.e. 10x the +Ground default of 10. */
const BIG_EXTENT = '100'

describe('A large ground', () => {
  /** Grounds created by the running test, oldest first. */
  let grounds: string[] = []
  /** Materials created by the running test, oldest first. THE LIBRARY IS GLOBAL. */
  let materials: string[] = []

  /**
   * Create a ground and return its row id.
   *
   * Every new ground is born wearing `Mtl.<name>`, a Visualiser on the 512 px
   * dirt.jpg (support/defaultMaterial.ts). That texture is what caps a ground at
   * 511 cells per axis, so the ONE test about the cap keeps it (`keepDefault`);
   * every other test starts from an empty ground — a plain tile with no cap
   * (scene_object_service._winner_surface 'plain'). Tracked for cleanup either way.
   */
  const trackGround = async ({
    keepDefault = false
  }: { keepDefault?: boolean } = {}): Promise<string> => {
    const id = await Geometry.addGround()
    grounds.push(id)
    await ObjectProperties.waitForOpen()
    const defaultName = await waitForDefaultMaterial()
    materials.push(await waitForLibraryRow(defaultName))
    if (!keepDefault) await unassignMaterial(defaultName)
    return id
  }

  const trackMaterial = async (): Promise<string> => {
    const id = await Materials.addMaterial()
    materials.push(id)
    return id
  }

  const groundNameOf = async (id: string): Promise<string> =>
    (await Geometry.rowState(id))?.name ?? ''

  /**
   * Open a specific ground's form and wait for it to actually SWITCH.
   *
   * `+ Ground` opens the NEW ground's form, so a test that edits an earlier one
   * must select it first; and `selectRow` returns as soon as the row is
   * highlighted, which is before the panel has re-rendered for it. Matching on
   * the name is what makes a read that follows this belong to `id`.
   */
  const openForm = async (id: string): Promise<void> => {
    await Geometry.selectRow(id)
    await ObjectProperties.waitForOpen()
    await browser.waitUntil(
      async () => (await ObjectProperties.nameState()).value === (await groundNameOf(id)),
      {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `the Properties form never switched to row ${id}`
      }
    )
  }

  /**
   * Press Save, having first proved it is actually available.
   *
   * Without the gate a disabled Save clicks nothing and every downstream oracle
   * ("the values came back", "no error appeared") is satisfied by the button that
   * was never pressed — a pass for the wrong reason. That matters more here than
   * anywhere: the expensive assertions in this file are all about what a PATCH
   * did, so a silently-skipped PATCH would make them vacuous AND fast, which is
   * exactly what a reader would fail to notice.
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
   * `disabled` alone is NOT a settle: the button is disabled both while the PATCH
   * is in flight (`draft.saving`) and once it has landed and cleared `dirty`, so a
   * poll can pass a millisecond after the click. The LABEL is the discriminator —
   * ObjectPropertiesForm renders `draft.saving ? 'Saving…' : 'Save'` — so the
   * settle is "back to Save, and no longer offered".
   *
   * MUTATION (60s) is the budget because a 1000x1000 build measured 10.9s here and
   * a CI runner freeze can add tens of seconds on top (see config/timeouts.ts).
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

  const saveForm = async (): Promise<void> => {
    await clickSave()
    await waitForSaveSettled()
  }

  /**
   * The form-level save error, or null.
   *
   * READ WITH ELEMENT COMMANDS, deliberately. `.form-error-text` has exactly two
   * render sites in this form and the other is gated on `objectDeleted`, so the
   * selector is unambiguous — but the reason for the element read is the trap
   * ObjectProperties.fieldState documents: this app can throw out of its own
   * handlers, and WebdriverIO re-raises a pending page error on the NEXT
   * execute/sync, turning a read into a driver failure carrying the app's copy.
   */
  const formError = async (): Promise<string | null> => {
    const el = $('[data-testid="object-properties-form"] .form-error-text')
    return (await el.isExisting()) ? (await el.getText()).trim() : null
  }

  const waitForFormError = async (timeout: number = TIMEOUTS.MUTATION): Promise<string> => {
    await $('[data-testid="object-properties-form"] .form-error-text').waitForDisplayed({
      timeout,
      timeoutMsg: 'the save reported nothing on the form'
    })
    return (await formError()) ?? ''
  }

  /**
   * Mesh downloads ATTEMPTED for ONE object, whatever came back.
   *
   * The 3D binary is the only `fetch` this app makes, so anything in here is the
   * viewport asking the backend for geometry. This is the counter for the
   * NEGATIVE assertion, where the thing being ruled out is the REQUEST — a
   * hidden row must not ask at all, and a 500 would be just as expensive to have
   * asked for as a 200.
   */
  const meshCallsFor = async (id: string): Promise<number> =>
    (await meshFetches()).filter((c) => isMeshUrlFor(c.url, id)).length

  /**
   * Mesh downloads that actually DELIVERED geometry — HTTP 200 with a body.
   *
   * The counter for the POSITIVE assertion, and the distinction is not
   * pedantry: `meshCallsFor` counts a 500 exactly like a 200, so "the viewport
   * fetched a mesh after the save" would still be satisfied by a backend
   * answering every mesh request with BUILD_FAILED — which is precisely the
   * failure this file's own header says the check exists to catch (a stale
   * libhelios). `bytes` is the recorded content-length; -1 means the header was
   * absent, which is not the same as an empty body, so only a literal 0 fails.
   */
  const builtMeshCallsFor = async (id: string): Promise<number> =>
    (await meshFetches()).filter(
      (c) => isMeshUrlFor(c.url, id) && c.status === 200 && c.bytes !== 0
    ).length

  /** Put a ground's resolution to `value` on BOTH axes and commit each field.
   *  texture_x/texture_y stay at their default of 1, which divides any
   *  resolution — so the repeat rule never fires and cannot mask a failure. */
  const setResolution = async (value: string): Promise<void> => {
    await ObjectProperties.setField('resolution_x', value)
    await ObjectProperties.commitField()
    await ObjectProperties.setField('resolution_y', value)
    await ObjectProperties.commitField()
  }

  /**
   * Create a material carrying ONE saved COLOUR-MODE Visualiser card, and return
   * its name.
   *
   * The colour mode is the whole point: `handleSaveColour` writes
   * `texture_toggle: false` unconditionally for a Visualiser, `_is_texture_mode`
   * reads that toggle, and `_winner_surface` therefore answers 'colour' — an
   * UNTEXTURED tile, which is what removes the 511-per-axis cap.
   *
   * A fresh material already ships ONE blank card, so `addCard()` returns card 2;
   * card 1 is never given a type and never saved, so it contributes no member and
   * cannot affect the winner. This is the same sequence material-assignment.test.ts
   * already runs green — reused rather than re-derived.
   */
  const colourMaterial = async (r: string, g: string, b: string): Promise<string> => {
    const id = await trackMaterial()
    await MaterialProperties.waitForOpen()

    // The panel must be showing THIS material before a single card is touched.
    // waitForOpen() only proves that A material form is mounted, and addCard()
    // works by DIFFING card ids — so on the second call within one test (test 4
    // makes exactly two) the previous material's cards can seed the baseline,
    // the new material's seeded card 1 is then not "fresh", and addCard times
    // out complaining that Add Material Type did nothing. The name is the one
    // discriminator the list row and the form both carry.
    const name = (await Materials.rowState(id))?.name ?? ''
    if (!name) throw new Error(`colourMaterial: material ${id} has no name in the library list`)
    await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === name, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the Material Properties form never switched to "${name}"`
    })

    const cardId = await MaterialProperties.addCard()
    await MaterialProperties.pickType(cardId, 'Visualiser')
    await MaterialProperties.setColorChannel('r', r)
    await MaterialProperties.setColorChannel('g', g)
    await MaterialProperties.setColorChannel('b', b)
    await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Save never enabled for a complete colour'
    })
    await MaterialProperties.saveCard(cardId)
    return name
  }

  /** Open the picker AND wait for its contents — `aria-expanded` flips on the
   *  click, but AnchoredPopup paints its children only after a measurement pass,
   *  so the heading (which BOTH picker shapes render) is the settle. */
  const openPicker = async (): Promise<void> => {
    await ObjectProperties.openMaterialPicker()
    await browser.waitUntil(async () => (await ObjectProperties.pickerState()).heading !== null, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Select Materials popup opened but never rendered its contents'
    })
  }

  /** Pick a material by name. Every pick closes the popup, so the close is the
   *  settle. Picking is a DRAFT change — Save is what commits it. */
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

  /** Wait for the Materials section to list exactly `names`. The message is
   *  static: an `await` inside the options object would be evaluated BEFORE
   *  waitUntil ran and would report the state at the START of the wait. */
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

  /** Force every open AnchoredPopup shut. The overlay's own onClick IS the
   *  popup's onClose. Cleanup only — never to dismiss a popup under assertion. */
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
    // enterGeometry gates on the object-type catalog and the tree. The material
    // picker additionally reads the material LIBRARY, which only the left panel's
    // <Materials/> fetches — so wait that side out too.
    await enterGeometry('largeground')
    await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: '+ Add Materials never became enabled (the material catalog never loaded)'
    })
    // Arm the fetch recorder once for the file. It is the ONLY way to see whether
    // the viewport went after a mesh, and in this file the interesting assertion
    // is usually that it did NOT.
    await recordMeshFetches()

    // The control test's whole argument is that its ground is CHEAP, and the one
    // number that decides that is the suite-wide ceiling. Tie the two together
    // rather than leaving SAFE_RESOLUTION as a magic 10 that quietly stops being
    // safe if the ceiling is ever lowered.
    const safeCells = Number(SAFE_RESOLUTION) ** 2
    if (safeCells > GEOMETRY_LIMITS.MAX_SAVEABLE_RESOLUTION_CELLS) {
      throw new Error(
        `SAFE_RESOLUTION ${SAFE_RESOLUTION} means ${safeCells} cells, above the suite ceiling ` +
          `of ${GEOMETRY_LIMITS.MAX_SAVEABLE_RESOLUTION_CELLS}. The control test would no ` +
          'longer be a control — lower SAFE_RESOLUTION.'
      )
    }
  })

  afterEach(async function () {
    // Deleting a 1e6-cell ground measured 15.7s. Give the hook room for that plus
    // a runner stall; the default 120s would be uncomfortably close on a test that
    // leaves two grounds behind.
    this.timeout(180_000)

    // Steps stay best-effort, but their errors are COLLECTED rather than
    // discarded, and the teardown ends by checking that both tracked sets are
    // actually gone. This file shares one project across every test AND writes
    // into the GLOBAL material library, so a leak corrupts two slices at once and
    // surfaces far from its cause.
    const failures: string[] = []
    const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn()
      } catch (err) {
        failures.push(`${label} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Dialogs first. components/Dialog uses the native showModal(), so one left
    // open sits in the TOP LAYER and makes every later click in the file fail with
    // "element click intercepted" — naming the wrong element.
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    // Then popups and any portalled listbox: an AnchoredPopup's `fixed inset-0
    // z-40` overlay does the same thing to everything under the right panel.
    await step('sweepPopups', () => sweepPopups())
    await step('closeEnum', () => MaterialProperties.closeEnum())
    // Filters BEFORE deleting: a row filtered out of a list is not in the DOM, so
    // its trash cannot be clicked and cleanup would silently leak it.
    await step('Geometry.clearSearch', () => Geometry.clearSearch())
    await step('Materials.clearSearch', () => Materials.clearSearch())

    // GROUNDS FIRST, materials second. Deleting a material that is still assigned
    // drags the backend's eager unassign-from-every-object in with it — and on a
    // ground above the soil cap that reconcile has to REBUILD, which is precisely
    // the operation the engine refuses. Removing the ground first makes cleanup a
    // plain pair of deletes.
    //
    // NOTE the delete reclaims the ROW, not the MEMORY: the backend's RSS stays at
    // ~2.56 GB after this. That is not a leak in the test — it is the measured
    // behaviour that justifies this file being separate.
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

  // ══ 1. The control: EXTENT is free ═══════════════════════════════════════

  it('a 100 x 100 m ground SAVES at a safe resolution — extent is not what costs', async () => {
    // THIS TEST EXISTS TO MAKE THE NEXT TWO READABLE. On its own it looks like a
    // duplicate of ground.test.ts's "a ground at its catalog maxima", and the
    // overlap is real — but that test runs against a different backend process and
    // proves a different claim (every field at its maximum, together). Here the
    // claim is narrower and local: in THIS file's backend, the numbers the user
    // asked for — a hundred metres on a side — are not themselves the problem. So
    // when the same form refuses 1000x1000 two tests below, the refusal can only
    // be attributed to the CELL COUNT.
    //
    // The mesh is subdivisions, not metres: 10 x 10 = 100 cells here
    // (= GEOMETRY_LIMITS.MAX_SAVEABLE_RESOLUTION_CELLS) whether the tile is 10 m
    // or 100 m across. That is why this row can be left VISIBLE while every other
    // test in the file hides its ground.
    const id = await trackGround()
    await ObjectProperties.waitForOpen()

    await setResolution(SAFE_RESOLUTION)
    await ObjectProperties.setField('length', BIG_EXTENT)
    await ObjectProperties.commitField()
    await ObjectProperties.setField('breadth', BIG_EXTENT)
    await ObjectProperties.commitField()

    // Nothing was rejected client-side, so the PATCH that follows is carrying the
    // values under test and not the blueprint defaults.
    for (const prop of ['length', 'breadth'] as const) {
      const state = await ObjectProperties.fieldState(prop)
      expect(`${prop}=${state.value} invalid=${state.invalid}`).toBe(
        `${prop}=${BIG_EXTENT} invalid=false`
      )
    }

    // Count DELIVERED mesh downloads BEFORE the save. The create already pulled
    // one (a 1x1 ground, 269 bytes), so "a mesh exists for this id" is not
    // evidence about the save — only an INCREASE is. Strict counter on both
    // sides: a 500 answered to the post-save fetch is a broken build, not a
    // delivered mesh, and must not be able to satisfy the assertion below.
    const before = await builtMeshCallsFor(id)

    await drainToasts()
    await clickSave()
    // waitForToast is the NEXT statement: toasts live ~2.66s, and a 100-cell save
    // is fast enough to land inside that window. The big saves later in this file
    // deliberately do NOT assert a toast — an 11s save outlives it.
    await waitForToast(GEOMETRY_TOAST.saved)
    await waitForSaveSettled()
    expect(await formError()).toBe(null)

    // The engine really built it and the viewport really received it. A save that
    // was accepted by the API but produced no geometry would still clear `dirty`
    // and still toast; only a delivered fetch distinguishes them.
    await browser.waitUntil(async () => (await builtMeshCallsFor(id)) > before, {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg:
        `the 3D viewport never received a NEW mesh (HTTP 200, non-empty) for the resized ` +
        `ground ${id}. A fetch that came back 500 does not count — that is BUILD_FAILED, ` +
        'usually a stale libhelios.'
    })

    // And it PERSISTED: bounce off another row so the form is rebuilt from the
    // detail cache the successful PATCH wrote, not from the draft still in memory.
    const other = await trackGround()
    await openForm(other)
    await openForm(id)
    expect((await ObjectProperties.fieldState('length')).value).toBe(BIG_EXTENT)
    expect((await ObjectProperties.fieldState('breadth')).value).toBe(BIG_EXTENT)
    expect((await ObjectProperties.fieldState('resolution_x')).value).toBe(SAFE_RESOLUTION)
  })

  // ══ 2. A ground wearing its default texture refuses 1e6 cells ═══════════════════════════════════

  it('a ground wearing its DEFAULT dirt texture REFUSES 1000 x 1000 — the engine message reaches the form, unattached to a field', async () => {
    // What the USER sees when the ground texture's pixel cap bites.
    //
    // TRACED, because "what does the frontend do with a 422 RESOLUTION_TOO_HIGH"
    // has a surprising answer: NOTHING SPECIFIC. `grep -rn RESOLUTION_TOO_HIGH
    // src/` is empty. utils/api.ts parses `detail.error` into ApiError.message
    // (and keeps `detail.code` on the error, where nothing reads it),
    // updateObjectWorker catches and dispatches `updateObjectFailed(err.message)`,
    // the reducer parks it on `createDraft.saveError`, and ObjectPropertiesForm
    // renders it as a `.form-error-text` banner. So the backend's own sentence DOES
    // reach the user — by the GENERIC save-failed route.
    //
    // DEVIATION / PRODUCT FINDING, and the reason the second half of this test
    // exists: because the route is generic, the failure is NOT attached to the
    // field that caused it. resolution_x and resolution_y are left `aria-invalid
    // false` with no tooltip, so the user gets a banner naming "the resolution"
    // and two resolution fields that both look fine. A code the client already has
    // in hand (`RESOLUTION_TOO_HIGH`) is exactly what would let it flag them.
    //
    // The texture whose pixel cap bites is the DEFAULT material's dirt.jpg: every
    // new ground is born wearing it. Without a material the ground is a plain tile
    // with no cap at all, which is why this — alone in the file — keeps it.
    const id = await trackGround({ keepDefault: true })
    await ObjectProperties.waitForOpen()

    // HIDE FIRST — and note this is not belt-and-braces here, it is the guard for
    // the failure mode this test is written to detect. If the cap were ever lifted
    // (a bigger bundled soil texture, a change to the engine check), this save
    // would SUCCEED and a visible row would immediately pull 66.8 MB with no
    // timeout to stop it. The test would then fail on its assertion, as it should,
    // instead of wedging the runner for the rest of the file.
    expect(await Geometry.toggleViewport(id)).toBe(true)

    expect(await formError()).toBe(null)
    await setResolution(BIG_RESOLUTION)

    // Client-side the value is perfectly legal — the catalog max is 25 000 — so
    // the refusal below can only be the backend's.
    for (const prop of ['resolution_x', 'resolution_y'] as const) {
      const state = await ObjectProperties.fieldState(prop)
      expect(`${prop}=${state.value} invalid=${state.invalid}`).toBe(
        `${prop}=${BIG_RESOLUTION} invalid=false`
      )
    }

    await drainToasts()
    await clickSave()
    // The ONLY place in the suite that reaches `changesSaveFailedBecause`. An
    // injected fault cannot: it is a status-0 connection failure with no `code`,
    // so serverReason returns null and the saga raises the unqualified string
    // instead (that one is covered by geometry.test.ts). Here the engine sends a
    // real 422 carrying RESOLUTION_TOO_HIGH, so its own sentence is appended.
    //
    // Safe as the next statement despite this file's rule about slow saves: the
    // engine refuses at its subdivision check BEFORE building anything, which is
    // exactly why the form error below comes back fast.
    await waitForToast(GEOMETRY_TOAST.saveFailedBecause(RESOLUTION_TOO_HIGH_MSG))
    // The same sentence also reaches the form's inline error line.
    expect(await waitForFormError()).toBe(RESOLUTION_TOO_HIGH_MSG)

    // The DEVIATION, pinned: the offending fields carry no error of their own.
    for (const prop of ['resolution_x', 'resolution_y'] as const) {
      const state = await ObjectProperties.fieldState(prop)
      expect(`${prop} invalid=${state.invalid} error=${state.error}`).toBe(
        `${prop} invalid=false error=null`
      )
    }

    // Save stays available so the user can lower the number and retry — the draft
    // is NOT thrown away, which is the difference between "try again" and "type it
    // all in again".
    expect(await ObjectProperties.saveEnabled()).toBe(true)
    expect((await ObjectProperties.fieldState('resolution_x')).value).toBe(BIG_RESOLUTION)
  })

  // ══ 3. The material is what unlocks the resolution ═══════════════════════

  it('with a COLOUR-mode Visualiser assigned, the SAME 1000 x 1000 save is ACCEPTED', async function () {
    // The 1000x1000 build alone measured 10.9s, on top of two creates, a material
    // card save and an assign PATCH. The 120s default would survive a healthy run
    // and not a stalled one, and a timeout HERE would abandon a half-built 1e6-cell
    // ground for afterEach to find.
    this.timeout(180_000)

    // THE HEADLINE. Same form, same field, same value as the test above; the only
    // difference is that this ground carries a colour-mode Visualiser, which makes
    // the backend build an UNTEXTURED tile with no texture pixels to be capped
    // against. A material — the thing that looks like decoration — is what changes
    // whether a geometry can exist.
    //
    // The differential lives ACROSS the two tests, and that is deliberate: the
    // absence of the 422 here is only meaningful because the identical input
    // produced it there. Change BIG_RESOLUTION and both move together.
    const material = await colourMaterial('12', '34', '56')

    // The ground LAST: `+ Add Materials` swaps the right panel to the material
    // form, so a ground created first would no longer be the thing on screen.
    const id = await trackGround()
    await ObjectProperties.waitForOpen()
    // Hidden before ANY of the expensive work — the assign rebuild and the big
    // save both consult `visibleInViewport` before fetching.
    expect(await Geometry.toggleViewport(id)).toBe(true)

    // Two saves, and they cannot be merged. update_object applies intrinsic
    // properties BEFORE the material list in the same PATCH, so a combined
    // "assign + 1000x1000" would hit the resolution change while the tile is still
    // soil and 422 exactly like test 2.
    await pick(material)
    await waitForAssigned([material])
    await saveForm()
    expect(await formError()).toBe(null)

    await setResolution(BIG_RESOLUTION)
    // THE RECORDER IS LIVE — proved, not assumed, and this is what stops the
    // negative below from being vacuous. "No mesh was fetched" is equally
    // satisfied by a recorder that never records anything: the fetch patch is
    // dropped by any browser.refresh(), and a renamed route would take the URL
    // match with it. Neither would fail a single assertion in this test. The
    // create's own fetch (this ground at 1x1, 269 bytes, before it was hidden)
    // is the anchor — it MUST already be in the log, with a 200 and a body.
    await waitForMeshFetch(id)
    // Baseline taken HERE, after the assign save: by now the create's mesh fetch
    // is long settled, so anything counted after this point belongs to the big
    // save. Compare against a snapshot rather than resetting the recorder — a
    // reset can race an in-flight fetch and read as evidence about the wrong write.
    //
    // The BROAD counter on this side: what must not happen is the REQUEST. A
    // 66.8 MB download that came back 500 would have cost the runner just as
    // much as one that came back 200.
    const meshesBefore = await meshCallsFor(id)

    await clickSave()
    // ~10.9s of real engine work measured on this machine. No toast assertion: the
    // snackbar's ~2.66s life is long gone by the time this returns.
    await waitForSaveSettled()
    expect(await formError()).toBe(null)

    // THE RUNNER PROTECTION, asserted rather than assumed. A visible row here would
    // have pulled 70,000,004 bytes through the renderer with no timeout to stop it.
    // staysFalse polls for a real window instead of taking one lucky reading.
    expect(await staysFalse(async () => (await meshCallsFor(id)) > meshesBefore)).toBe(true)

    // PERSISTED, not merely accepted: bounce off another row so the form is
    // rebuilt from the detail cache the successful PATCH wrote.
    const other = await trackGround()
    await openForm(other)
    await openForm(id)
    expect((await ObjectProperties.fieldState('resolution_x')).value).toBe(BIG_RESOLUTION)
    expect((await ObjectProperties.fieldState('resolution_y')).value).toBe(BIG_RESOLUTION)
    // The material came back with it — the reselect is served from the cache the
    // PATCH refreshed, so losing it here would mean the save had not really
    // recorded the assignment it was allowed to keep the resolution for.
    await waitForAssigned([material], TIMEOUTS.MUTATION)
  })

  // ══ 4. What that resolution costs you afterwards ═════════════════════════

  it('SWAPPING the material on a 1e6-cell ground now SUCCEEDS — a ground with no material has no texture cap', async function () {
    // The heaviest test in the file: two materials, the 10.9s build, and then the
    // replace. Same reasoning as the test above for the raised budget.
    this.timeout(180_000)

    // INVERTED 2026-09-14. This used to pin a one-way door: replacing a material
    // is delete-then-add (updateObjectWorker), and with the last material gone the
    // desired surface was 'soil' — a dirt.jpg rebuild at 1000x1000, which the
    // engine refuses. Since 6878eaf ("a new ground carries no texture and no
    // colour of ours") a ground with no material is a PLAIN tile with no texture
    // cap, so the intermediate state the replace passes through is buildable and
    // the swap succeeds. The CLAUDE.md §7 finding is closed.
    const first = await colourMaterial('12', '34', '56')
    const second = await colourMaterial('200', '100', '50')

    const id = await trackGround()
    await ObjectProperties.waitForOpen()
    expect(await Geometry.toggleViewport(id)).toBe(true)

    await pick(first)
    await saveForm()
    await setResolution(BIG_RESOLUTION)
    await clickSave()
    await waitForSaveSettled()
    // The precondition, proved rather than assumed — everything below is only
    // interesting because this ground really is at 1e6 cells with a material on it.
    expect(await formError()).toBe(null)
    await waitForAssigned([first])

    // Now the swap. Picking is still a pure draft change: no dialog, no request.
    await pick(second)
    await waitForAssigned([second])

    // SAVE is what raises Replace — not the picker — because Save is the point at
    // which the displaced material is actually DELETEd.
    await clickSave()
    const dlg = await waitForOpenDialog()
    expect(dlg.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
    await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
    await waitForNoOpenDialog()

    await waitForSaveSettled()
    expect(await formError()).toBe(null)
    await waitForAssigned([second], TIMEOUTS.MUTATION)
  })
})
