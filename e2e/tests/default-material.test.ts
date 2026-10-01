/**
 * The default material every new ground is born with.
 *
 * Requirements (agreed 14 Sep 2026; spec
 * docs/superpowers/specs/2026-09-14-default-material-e2e-design.md, Part B):
 *  1, 4  `+ Ground` adds the ground, wearing exactly one material: its default
 *  2, 3  the default's name and what it is
 *  5     removing it (the ground turns green and can still be deleted);
 *        different materials on different grounds
 *  6     changing the default reaches the ground
 *  7     the library is shared across projects
 *  9     replacing the default
 *  10    renaming by double-click reaches every place the name shows
 *
 * Shipped rule: support/defaultMaterial.ts. Expected names are computed from
 * the library as it is just before the ground is created — never hard-coded,
 * because names are unique across the whole library and a clash takes `.N`.
 *
 * ── State model ───────────────────────────────────────────────────────────
 * One project for the file. Each test creates rows via trackGround /
 * trackMaterial; afterEach deletes them, GROUNDS FIRST, then materials — and a
 * ground's default is tracked as a material, because deleting the ground leaves
 * it in the library. The cross-project describe is LAST: it leaves this project.
 *
 * +Ground and +Add Materials each swap the right panel to the thing just
 * created, so every test creates its materials FIRST and its grounds after.
 */

import Geometry from '../pages/Geometry.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import { GEOMETRY_MATERIAL_MSG } from '../constants/geometry'
import { materialLabel } from '../constants/materials'
import { TIMEOUTS } from '../config/timeouts'
import {
  enterGeometry,
  reloadToHome,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { clickDialogButton, waitForNoOpenDialog, waitForOpenDialog } from '../support/dialogs'
import { clearApiFaults } from '../support/faults'
import {
  expectedDefaultMaterialName,
  libraryNames,
  unassignMaterial,
  waitForDefaultMaterial,
  waitForLibraryRow
} from '../support/defaultMaterial'
import {
  isBlue,
  isGreen,
  isRed,
  recordMeshFetches,
  solidColour,
  textureFiles,
  waitForMeshSummary
} from '../support/viewport3d'

describe('Default material', () => {
  /** Grounds created by the running test, oldest first. */
  let grounds: string[] = []
  /** Materials created by the running test — including grounds' defaults. */
  let materials: string[] = []

  type TrackedGround = { id: string; name: string; defaultName: string; defaultId: string }

  /** Create a ground; return it with its default material, both tracked. */
  const trackGround = async (): Promise<TrackedGround> => {
    const id = await Geometry.addGround()
    grounds.push(id)
    await ObjectProperties.waitForOpen()
    const name = (await Geometry.rowState(id))?.name ?? ''
    const defaultName = await waitForDefaultMaterial()
    const defaultId = await waitForLibraryRow(defaultName)
    materials.push(defaultId)
    return { id, name, defaultName, defaultId }
  }

  const trackMaterial = async (): Promise<string> => {
    const id = await Materials.addMaterial()
    materials.push(id)
    return id
  }

  const newMaterial = async (): Promise<string> =>
    (await Materials.rowState(await trackMaterial()))?.name ?? ''

  const openPicker = async (): Promise<void> => {
    await ObjectProperties.openMaterialPicker()
    await browser.waitUntil(async () => (await ObjectProperties.pickerState()).heading !== null, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Select Materials popup opened but never rendered its contents'
    })
  }

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

  const waitForAssigned = async (names: string[], timeout: number = TIMEOUTS.MEDIUM): Promise<void> => {
    await browser.waitUntil(
      async () => {
        const got = await ObjectProperties.assignedNames()
        return got.length === names.length && names.every((n) => got.includes(n))
      },
      { timeout, timeoutMsg: `the Materials section never listed exactly [${names.join(', ')}]` }
    )
  }

  const clickSave = async (): Promise<void> => {
    await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Save never enabled — the form did not become dirty'
    })
    await ObjectProperties.saveButton.click()
  }

  /** The label reads "Saving…" for exactly the in-flight window. */
  const waitForSaveSettled = async (): Promise<void> => {
    await browser.waitUntil(
      async () => {
        const label = (await ObjectProperties.saveButton.getText()).trim()
        return label === 'Save' && !(await ObjectProperties.saveEnabled())
      },
      { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the save never landed (Save never went quiet again)' }
    )
  }

  /** Select a ground and wait for the form to actually switch to it. */
  const openForm = async (id: string): Promise<void> => {
    await Geometry.selectRow(id)
    await ObjectProperties.waitForOpen()
    await browser.waitUntil(
      async () =>
        (await ObjectProperties.nameState()).value === ((await Geometry.rowState(id))?.name ?? ''),
      { timeout: TIMEOUTS.MUTATION, timeoutMsg: `the Properties form never switched to row ${id}` }
    )
  }

  const closeDetail = async (name: string): Promise<void> => {
    await ObjectProperties.closeMaterialDetail(name)
    await browser.waitUntil(async () => !(await ObjectProperties.materialDetail(name).isExisting()), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the properties popup for "${name}" never closed`
    })
  }

  const sweepPopups = async (): Promise<void> => {
    await browser.execute(() => {
      document
        .querySelectorAll('[data-testid="anchored-popup-overlay"]')
        .forEach((el) => (el as HTMLElement).click())
    })
  }

  /**
   * Create a material with ONE saved colour-mode Visualiser card; return its
   * name. A fresh material ships one blank card, so addCard() returns card 2 —
   * card 1 is never typed or saved and contributes nothing.
   */
  const colourMaterial = async (r: string, g: string, b: string): Promise<string> => {
    const id = await trackMaterial()
    await MaterialProperties.waitForOpen()
    const name = (await Materials.rowState(id))?.name ?? ''
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

  /** Pick `name` for the open ground and SAVE through the Replace confirmation. */
  const replaceDefaultWith = async (name: string): Promise<void> => {
    await pick(name)
    await clickSave()
    const dialog = await waitForOpenDialog()
    expect(dialog.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
    await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
    await waitForNoOpenDialog()
    await waitForSaveSettled()
    await waitForAssigned([name], TIMEOUTS.MUTATION)
  }

  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
    await enterGeometry('dmat')
    await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: '+ Add Materials never became enabled (the material catalog never loaded)'
    })
  })

  afterEach(async () => {
    const failures: string[] = []
    const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn()
      } catch (err) {
        failures.push(`${label} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Dialogs, then popups and listboxes: each intercepts every later click.
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    await step('sweepPopups', () => sweepPopups())
    await step('closeEnum', () => MaterialProperties.closeEnum())
    await step('Geometry.clearSearch', () => Geometry.clearSearch())
    await step('Materials.clearSearch', () => Materials.clearSearch())

    // GROUNDS FIRST, then materials (defaults included).
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
        'Cleanup left rows behind.\n' +
          (leakedGrounds.length ? `  geometry: ${leakedGrounds.join(', ')}\n` : '') +
          (leakedMaterials.length ? `  materials (shared library): ${leakedMaterials.join(', ')}\n` : '') +
          (failures.length
            ? `  cleanup errors:\n    ${failures.join('\n    ')}`
            : '  No cleanup step reported an error, so the delete silently no-opped.')
      )
    }
  })

  // ══ Items 1 and 4 — + Ground adds a ground wearing its default ══════════

  describe('a new ground and its default material', () => {
    it('+ Ground adds the row, and the ground wears exactly ONE material — Mtl.<its name>', async () => {
      const before = await libraryNames()
      const ground = await trackGround()
      expect(await Geometry.row(ground.id).isExisting()).toBe(true)
      expect(ground.defaultName).toBe(expectedDefaultMaterialName(ground.name, before))
      expect(await ObjectProperties.assignedNames()).toEqual([ground.defaultName])
    })

    it('the default also appears in the Materials library, without a reload', async () => {
      // Geometry/saga.ts createObjectWorker refetches the library after a create
      // for exactly this reason; trackGround already waited for the row.
      const ground = await trackGround()
      expect(await libraryNames()).toContain(ground.defaultName)
    })

    // ══ Item 2 — what the default is ═══════════════════════════════════════

    it('the default is a Visualiser showing dirt.jpg — in the popup and in the mesh', async () => {
      await recordMeshFetches()
      const ground = await trackGround()

      await ObjectProperties.openMaterialDetail(ground.defaultName)
      expect(await ObjectProperties.detailSections(ground.defaultName)).toEqual(['Visualiser'])
      expect((await ObjectProperties.detailImages(ground.defaultName)).length).toBeGreaterThan(0)
      await closeDetail(ground.defaultName)

      const mesh = await waitForMeshSummary(ground.id, (s) => textureFiles(s).length > 0)
      expect(textureFiles(mesh).every((path) => path.endsWith('dirt.jpg'))).toBe(true)
    })

    // ══ Item 3 — the name ═════════════════════════════════════════════════

    it('a second ground gets its OWN default, named after it', async () => {
      const first = await trackGround()
      const before = await libraryNames()
      const second = await trackGround()
      expect(second.defaultName).toBe(expectedDefaultMaterialName(second.name, before))
      expect(second.defaultName).not.toBe(first.defaultName)
    })

    it('re-creating a ground name takes the next free suffix, and the old default stays', async () => {
      const first = await trackGround()
      await Geometry.deleteRow(first.id)
      grounds = grounds.filter((g) => g !== first.id)
      // Deleting a ground leaves its default in the library — intended.
      expect(await libraryNames()).toContain(first.defaultName)

      const before = await libraryNames()
      const again = await trackGround()
      // Ground.NNN is gap-filling, so the new ground reuses the freed name…
      expect(again.name).toBe(first.name)
      // …and its default cannot, so it takes the backend's `.N` suffix.
      expect(again.defaultName).toBe(expectedDefaultMaterialName(again.name, before))
      expect(again.defaultName).toMatch(/\.\d+$/)
    })
  })

  // ══ Item 5 — removing the default ════════════════════════════════════════

  describe('removing the default material', () => {
    it('removing it empties the section, turns the ground GREEN, and leaves the material in the library', async () => {
      await recordMeshFetches()
      const ground = await trackGround()
      await waitForMeshSummary(ground.id, (s) => textureFiles(s).length > 0)

      await recordMeshFetches()
      await unassignMaterial(ground.defaultName)
      expect(await ObjectProperties.assignedNames()).toEqual([])

      // A ground with no material is a plain tile in the engine's own default
      // colour, green (0, 0.75, 0) — scene_object_service._winner_surface 'plain'.
      const mesh = await waitForMeshSummary(ground.id, (s) => isGreen(solidColour(s)))
      expect(textureFiles(mesh)).toEqual([])
      expect(await libraryNames()).toContain(ground.defaultName)
    })

    it('a ground without its default can still be deleted', async () => {
      const ground = await trackGround()
      await unassignMaterial(ground.defaultName)

      await Geometry.deleteRow(ground.id)
      grounds = grounds.filter((g) => g !== ground.id)
      await Geometry.row(ground.id).waitForExist({
        reverse: true,
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the ground without a material was not deleted'
      })
    })
  })

  // ══ Item 5 — different materials on different grounds ═══════════════════

  describe('different materials on different grounds', () => {
    it('two grounds wear two different materials — each only its own, one RED and one BLUE', async function () {
      this.timeout(180_000)
      const red = await colourMaterial('255', '0', '0')
      const blue = await colourMaterial('0', '0', '255')
      await recordMeshFetches()

      const one = await trackGround()
      await replaceDefaultWith(red)
      const two = await trackGround()
      await replaceDefaultWith(blue)

      await openForm(one.id)
      await waitForAssigned([red])
      await openForm(two.id)
      await waitForAssigned([blue])

      await waitForMeshSummary(one.id, (s) => isRed(solidColour(s)))
      await waitForMeshSummary(two.id, (s) => isBlue(solidColour(s)))
    })
  })

  // ══ Item 6 — changing the default ════════════════════════════════════════

  describe('changing the default material', () => {
    it('switching the default to solid RED updates the ground popup and the mesh — and it stays assigned', async function () {
      this.timeout(180_000)
      await recordMeshFetches()
      const ground = await trackGround()
      await waitForMeshSummary(ground.id, (s) => textureFiles(s).length > 0)

      // Edit the DEFAULT in the Materials panel: its one Visualiser card, from
      // texture to a solid colour.
      await Materials.openMaterial(ground.defaultId)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(
        async () => (await MaterialProperties.nameValue()) === ground.defaultName,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the form never switched to "${ground.defaultName}"` }
      )
      const [cardId] = await MaterialProperties.cardIds()
      await MaterialProperties.visTab('custom').click()
      await MaterialProperties.setColorChannel('r', '255')
      await MaterialProperties.setColorChannel('g', '0')
      await MaterialProperties.setColorChannel('b', '0')
      await MaterialProperties.setColorChannel('opacity', '100')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled after switching the default to a red colour'
      })
      await recordMeshFetches()
      await MaterialProperties.saveCard(cardId)

      // Back on the ground, with no reload.
      await openForm(ground.id)
      await waitForAssigned([ground.defaultName])
      await ObjectProperties.openMaterialDetail(ground.defaultName)
      await browser.waitUntil(
        async () =>
          ObjectProperties.valueIn(
            await ObjectProperties.detailRows(ground.defaultName),
            'Visualiser',
            materialLabel('color_r')
          ) === '255',
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the ground popup never showed R = 255' }
      )
      const rows = await ObjectProperties.detailRows(ground.defaultName)
      expect(ObjectProperties.valueIn(rows, 'Visualiser', materialLabel('color_g'))).toBe('0')
      expect(ObjectProperties.valueIn(rows, 'Visualiser', materialLabel('color_b'))).toBe('0')
      await closeDetail(ground.defaultName)

      await waitForMeshSummary(ground.id, (s) => isRed(solidColour(s)))
    })
  })

  // ══ Item 9 — replacing the default ═══════════════════════════════════════

  describe('replacing the default material', () => {
    it('Save raises Replace NAMING the ground; Cancel keeps the default on the saved ground', async () => {
      const other = await newMaterial()
      const first = await trackGround()

      await pick(other)
      await clickSave()
      const dialog = await waitForOpenDialog()
      expect(dialog.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
      expect(dialog.heading).toBe(GEOMETRY_MATERIAL_MSG.replaceHeading(first.name))
      await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceCancel)
      await waitForNoOpenDialog()

      // Cancel leaves the pick as an unsaved draft; switching rows discards it,
      // so the ground shows what is SAVED — its default.
      await trackGround()
      await openForm(first.id)
      await waitForAssigned([first.defaultName])
    })

    it('Replace leaves exactly the new material, and the default stays in the library', async () => {
      const other = await newMaterial()
      const first = await trackGround()

      await replaceDefaultWith(other)
      expect(await ObjectProperties.assignedNames()).toEqual([other])
      expect(await libraryNames()).toContain(first.defaultName)

      // Saved, not drafted: it survives switching away and back.
      await trackGround()
      await openForm(first.id)
      await waitForAssigned([other])
    })
  })

  // ══ Item 10 — renaming by double-click ═══════════════════════════════════

  describe('renaming the default material by double-click', () => {
    /** A name no earlier run can have taken: tag + 6 base-36 chars, ≤ 20 total. */
    const freshName = (tag: string): string => `${tag}${Date.now().toString(36).slice(-6)}`

    it('a LIBRARY-ROW rename relabels the ground, the picker and the popup — and survives a reselect', async () => {
      const ground = await trackGround()
      const next = freshName('DmRow')

      await Materials.renameRow(ground.defaultId, next, 'enter')
      await browser.waitUntil(async () => (await Materials.rowState(ground.defaultId))?.name === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `the library row never took "${next}"`
      })

      // The OPEN ground form relabels in place.
      await waitForAssigned([next], TIMEOUTS.MUTATION)

      // The picker offers the new name and not the old one.
      await openPicker()
      const offered = (await ObjectProperties.pickerState()).rows.map((r) => r.name)
      expect(offered).toContain(next)
      expect(offered).not.toContain(ground.defaultName)
      await ObjectProperties.closeMaterialPicker()

      // The popup is titled with the new name.
      await ObjectProperties.openMaterialDetail(next)
      await closeDetail(next)

      // A reselect reads it back from the store, not the open draft.
      await trackGround()
      await openForm(ground.id)
      await waitForAssigned([next])
    })

    it('a FORM rename (double-click the header) reaches the library row and the ground', async () => {
      const ground = await trackGround()
      const next = freshName('DmForm')

      await Materials.openMaterial(ground.defaultId)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(
        async () => (await MaterialProperties.nameValue()) === ground.defaultName,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the form never switched to "${ground.defaultName}"` }
      )
      // Unlock by double-click and WAIT for it: only a field a double-click
      // actually unlocked commits a rename on blur.
      await browser.execute(() => {
        const node = document.querySelector('[data-testid="material-form-name"]')
        if (!node) throw new Error('the material Properties form is not open')
        node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      await browser.waitUntil(
        async () => (await MaterialProperties.nameInput.getAttribute('readonly')) === null,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'double-clicking never unlocked material-form-name' }
      )
      await browser.execute((val: string) => {
        const node = document.querySelector('[data-testid="material-form-name"]') as HTMLInputElement | null
        if (!node) throw new Error('the material Properties form is not open')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        node.focus()
        setter?.call(node, val)
        node.dispatchEvent(new Event('input', { bubbles: true }))
      }, next)
      await browser.execute(() =>
        (document.querySelector('[data-testid="material-form-name"]') as HTMLElement | null)?.blur()
      )

      await browser.waitUntil(async () => (await Materials.rowState(ground.defaultId))?.name === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the form rename never reached the library row'
      })
      // The form header shows it too.
      expect(await MaterialProperties.nameValue()).toBe(next)
      await openForm(ground.id)
      await waitForAssigned([next])
    })

    it("renaming the GROUND leaves its default material's name alone", async () => {
      const ground = await trackGround()
      const groundName = freshName('Gr')

      await ObjectProperties.editName()
      await ObjectProperties.setName(groundName)
      await ObjectProperties.commitName()
      await browser.waitUntil(async () => (await Geometry.rowState(ground.id))?.name === groundName, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the ground rename never reached the tree'
      })

      expect(await ObjectProperties.assignedNames()).toEqual([ground.defaultName])
      expect(await libraryNames()).toContain(ground.defaultName)
    })
  })

  // ══ Item 7 — across projects (LAST: leaves this file's project) ══════════

  describe('across projects — the library is shared', () => {
    it("project A's default shows in project B's library and picker, and B's first ground takes the next suffix", async function () {
      this.timeout(240_000)
      const a = await trackGround()
      // Only the MATERIAL has to outlive project A; its ground can go now, while
      // it is still reachable in the tree.
      await Geometry.deleteRow(a.id)
      grounds = grounds.filter((g) => g !== a.id)

      await reloadToHome()
      await enterGeometry('dmatB')
      await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: '+ Add Materials never became enabled in project B'
      })

      expect(await libraryNames()).toContain(a.defaultName)

      const before = await libraryNames()
      const b = await trackGround()
      // Both projects' first ground is the gap-filled Ground.001…
      expect(b.name).toBe(a.name)
      // …so B's default cannot take A's name and gets the backend's `.N` suffix.
      expect(b.defaultName).toBe(expectedDefaultMaterialName(b.name, before))
      expect(b.defaultName).toMatch(/\.\d+$/)

      await openPicker()
      expect((await ObjectProperties.pickerState()).rows.map((r) => r.name)).toContain(a.defaultName)
      await ObjectProperties.closeMaterialPicker()
    })
  })
})
