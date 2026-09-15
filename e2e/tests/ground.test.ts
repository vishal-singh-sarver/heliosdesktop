/**
 * Ground container — the behaviours nothing else tests.
 *
 * WHY THIS FILE EXISTS, AND WHAT IS DELIBERATELY *NOT* IN IT
 * An audit of the 239 cases in docs/test-cases-ground-container.md against every
 * layer — e2e, the 1579-line Geometry/tests/ObjectPropertiesForm.test.tsx unit
 * suite, RightPanel/tests/index.test.tsx, and the backend pytest suite — found
 * 24 behaviours with no test anywhere. Five of those are API-only and live in
 * helios-desktop-backend/tests/test_m2_scene_objects.py; one is a documentation
 * finding. The other 18 are here.
 *
 * Everything else about the ground form is ALREADY covered and must not be
 * duplicated here:
 *  - field range/required validation, the keystroke guards, save gating, the
 *    texture-repeat divisor rule (steppers, notes, open-time correction) —
 *    Geometry/tests/ObjectPropertiesForm.test.tsx and textureRepeat.test.ts
 *  - errors surviving a right-panel collapse — RightPanel/tests/index.test.tsx
 *  - creation, auto-naming, visibility, tree rename, search, delete, grouping,
 *    persistence — e2e/tests/geometry.test.ts
 *
 * The through-line of what was missing: the right panel's NAME field. Nothing at
 * any layer had ever driven the name field, so handleNameBlur — the only path to a
 * rename from this form, and the only place NO_NAME_CONFLICTS makes the form
 * behave differently from the tree — was unreached code.
 *
 * ── State model ───────────────────────────────────────────────────────────
 * Shared provisioning, matching geometry.test.ts: ONE project for the file.
 * Each test creates its rows via track(); afterEach deletes exactly those and
 * THROWS if any leaked, because Ground.NNN is gap-filling and a stray row
 * shifts a later test's naming.
 *
 * The last describe provisions its OWN project because it navigates away.
 *
 * ── Deviations ────────────────────────────────────────────────────────────
 * Two assertions here contradict the manual spec and follow the shipped code.
 * Both are marked DEVIATION inline.
 */

import Geometry from '../pages/Geometry.page'
import LeftPanel from '../pages/LeftPanel.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import RightPanel from '../pages/RightPanel.page'
import { GEOMETRY_LIMITS, GEOMETRY_MSG, GEOMETRY_TOAST, GROUND_BOUNDS } from '../constants/geometry'
import { TIMEOUTS } from '../config/timeouts'
import {
  enterGeometry,
  reloadToHome,
  reopenByName,
  staysFalse,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { dragRowOnto } from '../support/dnd'
import { clearApiFaults, installApiFault } from '../support/faults'
import { drainToasts, toastMessages, waitForToast } from '../support/toasts'

describe('Ground container', () => {
  /** Rows created by the running test, oldest first. afterEach removes them. */
  let created: string[] = []

  const track = async (): Promise<string> => {
    const id = await Geometry.addGround()
    created.push(id)
    return id
  }

  const nameOf = async (id: string): Promise<string> =>
    ((await Geometry.rowState(id))?.name ?? '') as string

  /** Rename via the TREE and wait for it to land (the commit is a round-trip). */
  const renameAndSettle = async (id: string, next: string): Promise<void> => {
    await Geometry.renameRow(id, next, 'enter')
    await browser.waitUntil(async () => (await Geometry.rowState(id))?.name === next, {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: `rename to "${next}" never landed`
    })
  }

  /** Open a specific ground's form. +Ground opens the NEW one, so a test that
   *  edits an EARLIER ground has to select it first. */
  const openForm = async (id: string): Promise<void> => {
    await Geometry.selectRow(id)
    await ObjectProperties.waitForOpen()
    await browser.waitUntil(async () => (await ObjectProperties.nameState()).value === (await nameOf(id)), {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: `the Properties form never switched to row ${id}`
    })
  }

  before(async () => {
    await waitForMainWindow()
    // The catalog fetches gate +Ground; do not pay their cold start inside a
    // timed assertion.
    await waitForBackendReady()
    await enterGeometry('ground')
  })

  afterEach(async () => {
    // Same contract as geometry.test.ts: steps are best-effort but their errors
    // are COLLECTED, and the teardown ends by checking the thing that matters —
    // are the tracked rows actually gone? A leaked row corrupts a LATER test's
    // naming and surfaces as a failure nowhere near its cause.
    const failures: string[] = []
    const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn()
      } catch (err) {
        failures.push(`${label} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // A rejected rename makes the app throw asynchronously, and WebdriverIO
    // re-raises that on the NEXT execute/sync — which would be one of the
    // cleanup steps below, killing teardown with the app's own copy
    // ("Geometry name already exists") against a command that never touched a
    // name. Burn it FIRST, before anything else runs.
    await step('drainPageError', () => ObjectProperties.drainPageError())
    // The panel must be expanded before anything tries to click inside it, and
    // an open modal <dialog> sits in the top layer and makes EVERY later click
    // fail with "element click intercepted", naming the wrong element.
    await step('expandRightPanel', () => RightPanel.expand())
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    // Reset the panel BEFORE clearSearch: the search box sits inside the
    // Geometry section body, and a WebDriver click on a collapsed one retries
    // "element not interactable" for the full 10s waitforTimeout.
    await step('resetToDefault', () => LeftPanel.resetToDefault())
    await step('clearSearch', () => Geometry.clearSearch())
    await step('clearApiFaults', () => clearApiFaults())
    // The skip reads the tree once; while it is reloading only the loading marker
    // renders, so a live row would look gone. Settle first (best-effort step) —
    // and before the expand, since a reload rebuilds every group collapsed.
    await step('treeSettled', () =>
      browser.waitUntil(
        async () => browser.execute(() => !document.querySelector('[data-testid="geometry-tree-loading"]')),
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the geometry tree was still loading' }
      )
    )
    // Members of a COLLAPSED group are not in the DOM; expand before the skip below.
    await step('expandCollapsedGroups', async () => {
      for (let i = 0; i < 10; i++) {
        const collapsed = (await Geometry.groups()).filter((g) => g.expanded === false)
        if (!collapsed.length) return
        for (const g of collapsed) await Geometry.toggleGroup(g.id)
      }
    })

    const tracked = [...created].reverse()
    for (const id of tracked) {
      // A row already gone (dissolved, or deleted with its group) would make
      // deleteRow's waitForExist burn the full 10s. If the read throws, try anyway.
      if (!(await Geometry.rowState(id).then((r) => r !== undefined, () => true))) continue
      await step(`deleteRow(${id})`, () => Geometry.deleteRow(id))
      await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    }
    created = []
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    await step('resetToDefault', () => LeftPanel.resetToDefault())

    const leaked: string[] = []
    for (const id of tracked) {
      if (await Geometry.row(id).isExisting().catch(() => false)) leaked.push(id)
    }
    if (leaked.length) {
      throw new Error(
        `Cleanup left ${leaked.length} geometry row(s) in the shared project: ${leaked.join(', ')}.\n` +
          (failures.length
            ? `  cleanup errors:\n    ${failures.join('\n    ')}`
            : '  No cleanup step reported an error, so the delete silently no-opped.')
      )
    }
  })

  // ══ The right panel's name field ═════════════════════════════════════════
  //
  // Nothing at any layer had driven this before. The name unlocks on
  // double-click — the pencil was removed in 10a5a51 — and ObjectProperties
  // scopes every read to object-properties-form.

  describe('rename from the Properties form', () => {
    it('the name is read-only until DOUBLE-CLICKED, and then takes focus', async () => {
      await track()
      await ObjectProperties.waitForOpen()

      // Read-only is the SHIPPED lock, not merely a styling choice.
      expect((await ObjectProperties.nameState()).readOnly).toBe(true)

      await ObjectProperties.editName()
      expect((await ObjectProperties.nameState()).readOnly).toBe(false)
      // Polled: the focus lives in an effect keyed on nameEditing, which commits
      // after the render that flipped readOnly.
      await browser.waitUntil(async () => ObjectProperties.nameInput.isFocused(), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the unlocked name field never took focus'
      })
    })

    it('the locked name says how to rename it, and there is no pencil any more', async () => {
      // 10a5a51 removed the "Edit name" pencil and put the gesture in a hover
      // hint. The hint is there only while the field is locked.
      await track()
      await ObjectProperties.waitForOpen()
      expect(await ObjectProperties.nameHint()).toBe(GEOMETRY_MSG.renameHint)
      expect(await ObjectProperties.editNameButton.isExisting()).toBe(false)

      await ObjectProperties.editName()
      expect(await ObjectProperties.nameHint()).toBe(null)
      // The blur commits the unchanged name, which handleNameBlur ignores.
      await ObjectProperties.commitName()
    })

    it('BLUR commits the rename, and the left-panel row follows', async () => {
      const id = await track()
      await ObjectProperties.waitForOpen()
      const before = await nameOf(id)
      const next = 'Blur Commit'

      await ObjectProperties.editName()
      await ObjectProperties.setName(next)
      // Still uncommitted: the tree has not moved yet.
      expect(await nameOf(id)).toBe(before)

      await ObjectProperties.commitName()
      await browser.waitUntil(async () => (await nameOf(id)) === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the blur never reached the tree row'
      })
    })

    it('ENTER alone does NOT commit — the rename waits for the field to lose focus', async () => {
      const id = await track()
      await ObjectProperties.waitForOpen()
      const before = await nameOf(id)

      await ObjectProperties.editName()
      await ObjectProperties.setName('Enter Should Not')
      await browser.keys(['Enter'])

      // handleNameBlur is the ONLY path to renameRequested; there is no
      // onKeyDown on this input (unlike the tree's NameEditor, where Enter
      // commits). Prove it stays put rather than merely reading it once.
      expect(await staysFalse(async () => (await nameOf(id)) !== before)).toBe(true)

      // Put the field back so the blur that ends this test commits nothing.
      await ObjectProperties.setName(before)
      await ObjectProperties.commitName()
    })

    it('deleting the ground under an open name edit CLOSES the form outright', async () => {
      // DEVIATION (spec GRD-RNR-12 expects "the name field is disabled and the
      // deleted notice appears"): it never appears from this route. The reducer
      // nulls createDraft on DELETE_NODE_SUCCEEDED whenever the removed object
      // is the one on screen — its own comment says "close it rather than leave
      // it in the read-only 'deleted' state the user then has to dismiss by
      // hand" (reducer.ts:465-470).
      //
      // FINDING: GEOMETRY_MSG.objectDeletedNotice is therefore UNREACHABLE from
      // the GUI's own delete, on either the tree trash or the form's. `objectDeleted`
      // needs the node to vanish from nodesById while the draft SURVIVES — a
      // LIST_NODES refetch that no longer carries it, i.e. a delete performed
      // elsewhere. That is why the string has never had a consumer in any test.
      const id = await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.editName()

      // Delete from the TREE while the form sits open on that object.
      await Geometry.deleteRow(id)
      created = created.filter((c) => c !== id)

      await ObjectProperties.form.waitForDisplayed({
        reverse: true,
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the Properties form stayed open after its object was deleted'
      })
    })
  })

  // ══ Duplicate names: the form fails LATER than the tree ══════════════════

  describe('duplicate name — the Properties-form path', () => {
    /** Two grounds; the second is left open in the form. Returns [taken, editing]. */
    const twoGrounds = async (): Promise<{ taken: string; editing: string; id: string }> => {
      const first = await track()
      const taken = 'Taken Name'
      await renameAndSettle(first, taken)
      const id = await track()
      await ObjectProperties.waitForOpen()
      return { taken, editing: await nameOf(id), id }
    }

    it('the form has NO client-side duplicate check — it sends the PATCH and surfaces the 409', async () => {
      // THE ASYMMETRY THIS FILE EXISTS FOR. The tree's NameEditor validates
      // against selectLeafNamesLower and blocks the commit before any request.
      // The form passes NO_NAME_CONFLICTS (an EMPTY set), so validateGroupName
      // can never report a duplicate here and the rename goes to the backend,
      // which answers 409 GEOMETRY_NAME_EXISTS.
      const { taken, editing, id } = await twoGrounds()

      await ObjectProperties.editName()
      await ObjectProperties.setName(taken)
      // No error yet — unlike the tree, nothing is checked while typing.
      expect((await ObjectProperties.nameState()).error).toBe(null)

      await ObjectProperties.commitName()
      expect(await ObjectProperties.nameError(TIMEOUTS.MUTATION)).toBe(GEOMETRY_MSG.nameExists)

      // The rename is PESSIMISTIC: the tree never showed the rejected name.
      expect(await nameOf(id)).toBe(editing)
    })

    it('the rejected duplicate error SURVIVES collapsing and reopening the right panel', async () => {
      const { taken } = await twoGrounds()
      await ObjectProperties.editName()
      await ObjectProperties.setName(taken)
      await ObjectProperties.commitName()
      expect(await ObjectProperties.nameError(TIMEOUTS.MUTATION)).toBe(GEOMETRY_MSG.nameExists)

      await RightPanel.cycle()

      // Collapsing is CSS only — the form is hidden, never unmounted — so the
      // draft's nameError is still there to explain the still-rejected name.
      await expect(ObjectProperties.form).toBeDisplayed()
      expect((await ObjectProperties.nameState()).error).toBe(GEOMETRY_MSG.nameExists)
    })

    it('a ground may take a GROUP name — the two are separate namespaces', async () => {
      // selectLeafNamesLower / selectGroupNamesLower are built from DIFFERENT
      // node kinds on purpose, and nothing had tested that the split holds.
      const a = await track()
      const b = await track()
      const before = new Set((await Geometry.groups()).map((g) => g.id))
      await dragRowOnto([a], b, 'into')

      let groupId = ''
      await browser.waitUntil(
        async () => {
          const fresh = (await Geometry.groups()).filter((g) => !before.has(g.id))
          if (!fresh.length) return false
          groupId = fresh[0].id
          return true
        },
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the drag did not create a group' }
      )
      // Register the group FIRST so it is deleted before its members.
      created.unshift(groupId)

      const shared = 'Shared Name'
      await renameAndSettle(groupId, shared)

      // A LEAF may now take the very same name.
      const leaf = await track()
      await renameAndSettle(leaf, shared)
      expect(await nameOf(leaf)).toBe(shared)
      expect(await nameOf(groupId)).toBe(shared)
    })
  })

  // ══ Save gating: the name is not a field ═════════════════════════════════

  describe('save gating — a name change alone', () => {
    it('changing ONLY the name leaves Save disabled', async () => {
      // `dirty` is valuesDirty || materialDirty — it never consults the name,
      // because the name commits on its own blur path. The existing e2e test
      // ("an empty name does NOT disable Save") dirties `length` FIRST, so it
      // asserts the converse and cannot catch a regression here.
      const id = await track()
      await ObjectProperties.waitForOpen()
      expect(await ObjectProperties.saveEnabled()).toBe(false)

      await ObjectProperties.editName()
      await ObjectProperties.setName('Name Only Change')

      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)

      // Let the rename land so teardown is not racing an in-flight PATCH.
      await ObjectProperties.commitName()
      await browser.waitUntil(async () => (await nameOf(id)) === 'Name Only Change', {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the name never committed'
      })
      // Committing the name still must not light Save up.
      expect(await ObjectProperties.saveEnabled()).toBe(false)
    })
  })

  // ══ The incomplete exponent — the ONE reachable route to "Invalid Input" ══

  describe('an incomplete exponent', () => {
    /**
     * `1e` is admitted by the keystroke guard (isPartialNumericInput allows a
     * trailing exponent so a user can type "1e3" without an error flashing on
     * the 'e'), is NOT expandable by expandForDisplay, and so survives the blur
     * as a value Number() reads as NaN — which validateFieldValue reports as
     * "Invalid Input".
     *
     * That makes it the only route to GEOMETRY_MSG.invalidInput on this form.
     * Every other candidate — a letter, or a '.' offered to an integer field —
     * is refused by handleFieldChange BEFORE validateFieldValue sees it, and
     * reports "This input is not supported" instead.
     */
    it('shows NO error while the exponent is still being typed', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.typeField('length', '1e')

      // typingExponent suppresses the message for exactly this run, so the
      // error does not flash on the 'e' and clear on the next keystroke.
      expect((await ObjectProperties.fieldState('length')).error).toBe(null)
    })

    it('reports "Invalid Input" once the typing run ENDS on a blur', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.typeField('length', '1e')
      await ObjectProperties.commitField()

      expect(await ObjectProperties.errorFor('length')).toBe(GEOMETRY_MSG.invalidInput)
      expect((await ObjectProperties.fieldState('length')).value).toBe('1e')
    })

    it('reaches the same message on an INTEGER field — the guard refuses "." but not "e"', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.typeField('resolution_x', '1e')
      await ObjectProperties.commitField()

      expect(await ObjectProperties.errorFor('resolution_x')).toBe(GEOMETRY_MSG.invalidInput)
    })

    it('blocks Save while it stands, and releases it once the number is finished', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.typeField('length', '1e')
      await ObjectProperties.commitField()

      // Dirty (the value changed) but invalid, so Save must stay down.
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)

      await ObjectProperties.typeField('length', '12')
      await ObjectProperties.commitField()
      await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never recovered after the exponent was completed'
      })
    })
  })

  // ══ A ground at every maximum ════════════════════════════════════════════

  describe('a ground at its catalog maxima', () => {
    it('SAVES with length, breadth, position and rotation all at their maximum', async () => {
      /**
       * No ground had ever been PERSISTED with more than one field at its
       * maximum. Two habits hid it, and neither is a real constraint:
       *
       *  1. The e2e safety ceiling (GEOMETRY_LIMITS.MAX_SAVEABLE_RESOLUTION_CELLS)
       *     is justified entirely by mesh size — resolution_x * resolution_y —
       *     but was written as "boundary cases assert VALIDATION state only and
       *     never press Save", over EVERY field. Extent costs nothing: a
       *     1,000,000 x 1,000,000 ground at resolution 2x2 is four triangles.
       *     Only the resolution boundary ever needed that rule.
       *  2. The backend bounds test moves ONE field at a time, which is right for
       *     proving each range and useless for proving a combination — and
       *     because it does POST at length=1,000,000 and get a 201, it reads
       *     like max-value coverage.
       *
       * So this is the first thing anywhere to put the whole envelope on one
       * object. Resolution stays at 2x2 (4 cells, far under the 100-cell
       * ceiling); texture goes to 2, which is its real maximum here — texture
       * has no catalog bound, only the cross-field texture <= resolution rule.
       */
      const id = await track()
      await ObjectProperties.waitForOpen()

      // Resolution FIRST: raising it is what lets texture reach 2, and the
      // repeat is reconciled against the resolution on blur.
      await ObjectProperties.setField('resolution_x', '2')
      await ObjectProperties.commitField()
      await ObjectProperties.setField('resolution_y', '2')
      await ObjectProperties.commitField()

      const maxima: [Parameters<typeof ObjectProperties.fieldState>[0], string][] = [
        ['length', String(GROUND_BOUNDS.length.max)],
        ['breadth', String(GROUND_BOUNDS.breadth.max)],
        ['position_x', String(GROUND_BOUNDS.position_x.max)],
        ['position_y', String(GROUND_BOUNDS.position_y.max)],
        ['position_z', String(GROUND_BOUNDS.position_z.max)],
        ['rotation_z', String(GROUND_BOUNDS.rotation_z.max)],
        ['texture_x', '2'],
        ['texture_y', '2']
      ]
      for (const [prop, value] of maxima) {
        await ObjectProperties.setField(prop, value)
        await ObjectProperties.commitField()
      }

      // Every one of them is accepted TOGETHER, not just one at a time.
      for (const [prop, value] of maxima) {
        const state = await ObjectProperties.fieldState(prop)
        expect(`${prop}=${state.value} invalid=${state.invalid}`).toBe(
          `${prop}=${value} invalid=false`
        )
      }

      await ObjectProperties.save()
      await waitForToast(GEOMETRY_TOAST.saved)

      // Save disables itself on a clean baseline, so the PATCH was accepted —
      // an extreme ground is not silently rejected by the engine.
      expect(await ObjectProperties.saveEnabled()).toBe(false)
      expect(await nameOf(id)).toBeTruthy()
    })

    it('the saved maxima survive switching away and back', async () => {
      const id = await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('resolution_x', '2')
      await ObjectProperties.commitField()
      await ObjectProperties.setField('length', String(GROUND_BOUNDS.length.max))
      await ObjectProperties.commitField()
      await ObjectProperties.setField('rotation_z', String(GROUND_BOUNDS.rotation_z.max))
      await ObjectProperties.commitField()
      await ObjectProperties.save()

      const other = await track()
      await openForm(other)
      await openForm(id)

      expect((await ObjectProperties.fieldState('length')).value).toBe(
        String(GROUND_BOUNDS.length.max)
      )
      expect((await ObjectProperties.fieldState('rotation_z')).value).toBe(
        String(GROUND_BOUNDS.rotation_z.max)
      )
      expect(await ObjectProperties.saveEnabled()).toBe(false)
    })
  })

  // ══ Save gating across several invalid fields ════════════════════════════

  describe('save gating — partial recovery', () => {
    it('fixing ONE of two invalid fields leaves Save disabled until BOTH are valid', async () => {
      // The existing coverage reverts a single valid edit. Nothing had checked
      // that isObjectFormValid keeps Save down while a SECOND field is still
      // failing — the case that catches an `||` written where `&&` was meant.
      await track()
      await ObjectProperties.waitForOpen()

      await ObjectProperties.setField('length', '0.001') // below min
      await ObjectProperties.setField('rotation_z', '400') // above max
      expect((await ObjectProperties.fieldState('length')).invalid).toBe(true)
      expect((await ObjectProperties.fieldState('rotation_z')).invalid).toBe(true)
      expect(await ObjectProperties.saveEnabled()).toBe(false)

      // Fix ONLY the first.
      await ObjectProperties.setField('length', '12')
      expect((await ObjectProperties.fieldState('length')).invalid).toBe(false)
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)

      // Now the second.
      await ObjectProperties.setField('rotation_z', '45')
      await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled once every field was valid'
      })
    })
  })

  // ══ The name tooltip under a deleted object ══════════════════════════════

  describe('the name validation tooltip', () => {
    it('an empty name reports "Name is required" WITHOUT sending a rename', async () => {
      // The instant rules win over the backend one: validateGroupName runs on
      // every render, so an empty name is flagged locally and handleNameBlur's
      // guard refuses to dispatch. Nothing about this is covered by the existing
      // "an empty name does NOT disable Save" test, which never reads the error.
      const id = await track()
      await ObjectProperties.waitForOpen()
      const before = await nameOf(id)

      await ObjectProperties.editName()
      await ObjectProperties.setName('')
      expect(await ObjectProperties.nameError()).toBe(GEOMETRY_MSG.nameRequired)

      await ObjectProperties.commitName()
      // No PATCH went out, so the row keeps its name.
      expect(await staysFalse(async () => (await nameOf(id)) !== before)).toBe(true)
      expect(await ObjectProperties.nameError()).toBe(GEOMETRY_MSG.nameRequired)

      // Restore so teardown is not editing a form in an error state.
      await ObjectProperties.setName(before)
      await ObjectProperties.commitName()
    })

    it('goes with the form when the object is deleted — nothing is left nagging', async () => {
      // DEVIATION (spec GRD-TIP-15 expects the tooltip suppressed while the
      // deleted notice shows). The tooltip IS gated on `nameError &&
      // !objectDeleted`, but that second half is unreachable from here: the
      // whole form unmounts first (see the RNR-12 note above). The user-visible
      // outcome the spec wanted — no stale complaint about a name that no longer
      // exists — holds, by a different mechanism.
      const id = await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.editName()
      await ObjectProperties.setName('')
      expect(await ObjectProperties.nameError()).toBe(GEOMETRY_MSG.nameRequired)

      await Geometry.deleteRow(id)
      created = created.filter((c) => c !== id)

      await ObjectProperties.form.waitForDisplayed({
        reverse: true,
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the form outlived the object whose name it was complaining about'
      })
    })
  })

  // ══ The tree editor's blur path ══════════════════════════════════════════

  describe('inline rename — leaving the editor by blur', () => {
    it('blurring out of an INVALID name discards it and restores the original', async () => {
      // Geometry.page.ts has implemented commit:'blur' since it was written and
      // NO test had ever passed it — NameEditor's onBlur is
      // `error ? onClose() : commit()`, so the discard branch was unexercised.
      const id = await track()
      const before = await nameOf(id)

      await Geometry.renameRow(id, GEOMETRY_LIMITS.nameTooLong, 'blur')

      await expect(Geometry.nameEditor).not.toBeDisplayed()
      expect(await nameOf(id)).toBe(before)
    })

    it('blurring out of a VALID name commits it — the same gesture, the other branch', async () => {
      const id = await track()
      const next = 'Blurred Valid'
      await Geometry.renameRow(id, next, 'blur')
      await browser.waitUntil(async () => (await nameOf(id)) === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'a valid blur did not commit the rename'
      })
    })
  })

  // ══ Loading a ground ═════════════════════════════════════════════════════

  describe('loading a ground into the form', () => {
    it('an UNSAVED edit is discarded when another ground is selected', async () => {
      const a = await track()
      const b = await track()

      await openForm(a)
      await ObjectProperties.setField('length', '77')
      expect((await ObjectProperties.fieldState('length')).value).toBe('77')

      // Leave without saving.
      await openForm(b)
      // Come back: the draft is rebuilt from the cached detail, not from the
      // abandoned edit.
      await openForm(a)
      expect((await ObjectProperties.fieldState('length')).value).toBe(
        GEOMETRY_LIMITS.DEFAULT_SIZE
      )
      expect(await ObjectProperties.saveEnabled()).toBe(false)
    })
  })

  // ══ A failed per-object load — provisions its own project, so it runs LAST ══

  describe('a failed per-object load', () => {
    /**
     * This one navigates away from the file's shared project, so it does NOT
     * use track() (the shared afterEach could not reach its rows anyway) and it
     * runs last so it cannot leave an earlier test looking at the wrong project.
     *
     * It also has to REOPEN the project first. loadObjectWorker short-circuits
     * on a cached detail (saga.ts:267), and a ground created this session is
     * already cached by its own create response — so a click would never touch
     * the network. Reopening rebuilds the store with an empty detail cache,
     * which is the only state where the GET actually happens.
     */
    it('fails SILENTLY — no toast, no error, and the form never opens', async () => {
      // DEVIATION: the manual spec says "the failure is reported". It is not.
      // loadObjectFailed is dispatched (saga.ts:274) and has NO reducer case, no
      // toast and no listener anywhere in src/ — grep LOAD_OBJECT_FAILED: the
      // action exists, is created, and is handled by nothing. So clicking a
      // ground whose GET fails does nothing observable at all.
      //
      // PRODUCT FINDING, not a test bug: the user gets no feedback and the panel
      // simply stays as it was. Worth a look before Geometry sign-off.
      await reloadToHome()
      const project = await enterGeometry('groundfail')
      const id = await Geometry.addGround()
      await ObjectProperties.waitForOpen()

      // Reopen so the detail cache is empty and the click must hit the network.
      await reloadToHome()
      await reopenByName(project.name)
      await Geometry.waitForTree()

      await drainToasts()
      await installApiFault('GET', `/objects/${id}`)
      await Geometry.selectRow(id)

      // Nothing opens...
      expect(
        await staysFalse(async () => ObjectProperties.form.isDisplayed())
      ).toBe(true)
      // ...and nothing is said.
      expect(await toastMessages()).toEqual([])

      await clearApiFaults()
    })
  })
})
