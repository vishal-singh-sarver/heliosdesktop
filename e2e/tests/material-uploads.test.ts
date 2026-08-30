/**
 * Material file uploads, driven with REAL files from disk.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * Until the fixtures in e2e/fixtures/materials landed, `e2e/fixtures` held
 * weather CSVs and nothing else — no image, and no valid spectral library. So
 * every upload test in materials.test.ts had to build its file inline as a
 * string, and could only ever build INVALID ones. The result: the spectral
 * toggle and all four of its rejection paths were covered, a non-image
 * rejection was covered, and the two happy paths were not covered at all.
 * Nothing in the suite had ever uploaded a file the app accepts.
 *
 * That gap mattered more than a missing negative would. A rejection is decided
 * entirely client-side, so those tests never reach the backend; the accept path
 * is the only one that POSTs, stores a file on disk, and reads it back.
 *
 * ── Its own spec file ─────────────────────────────────────────────────────
 *
 * Not appended to materials.test.ts: that file is 6,460 lines and carries a
 * recorded pre-existing flake (245/245/244/245/245/244 across six runs, a
 * different victim each time), so adding to it puts new work behind an existing
 * intermittent failure. These four tests also share two fixture helpers that
 * belong together. Same precedent as material-assignment.test.ts being split
 * out of materials.test.ts.
 *
 * ── What is NOT asserted ──────────────────────────────────────────────────
 *
 * That the ground is visibly painted with the texture. WebGL pixels are
 * unreadable to WebDriver — toDataURL() returns blank because the app never
 * sets preserveDrawingBuffer — so the furthest this can go is that the texture
 * reached the geometry's material data and the mesh was refetched. The visual
 * result stays manual, exactly as it does for the Visualiser's colour.
 */

import { readFileSync } from 'node:fs'
import Geometry from '../pages/Geometry.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import { GEOMETRY_TOAST } from '../constants/geometry'
import {
  MATERIAL_FIXTURE_FILES,
  VINEYARD_SPECTRUM_LABELS,
  materialFixture
} from '../config/fixtures'
import { TIMEOUTS } from '../config/timeouts'
import {
  enterGeometry,
  staysFalse,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { dragMaterialOnto } from '../support/dnd'
import { recordMeshFetches, waitForMeshFetch } from '../support/viewport3d'
import { clearApiFaults } from '../support/faults'
import { drainToasts, waitForToast } from '../support/toasts'

/**
 * Spectral-upload copy, mirrored from containers/Materials/messages.ts:113
 * rather than imported: e2e/constants/materials.ts stops at the TEXTURE file
 * errors and carries no spectral entries. Same approach materials.test.ts takes
 * for the same reason.
 */
const SPECTRAL_ROOT_ERROR = 'Not a Helios spectral file — its tags must be wrapped in <helios>'

describe('Material uploads — real files', () => {
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

  const materialNameOf = async (id: string): Promise<string> =>
    (await Materials.rowState(id))?.name ?? ''

  const groundNameOf = async (id: string): Promise<string> =>
    (await Geometry.rowState(id))?.name ?? ''

  /** Add a card and give it a type, returning the cardId. */
  const cardWithType = async (type: string): Promise<number> => {
    const cardId = await MaterialProperties.addCard()
    await MaterialProperties.pickType(cardId, type)
    return cardId
  }

  /**
   * A new material with a Radiation card whose "Apply spectral data" is ON.
   *
   * The toggle is what renders the file input at all — with it off there is no
   * upload control, and the two spectrum dropdowns are gated behind the same
   * flag (`selector: use_radiation_bands = 'false'` in the live catalog).
   */
  const openSpectralRadiation = async (): Promise<number> => {
    await trackMaterial()
    await MaterialProperties.waitForOpen()
    const cardId = await cardWithType('Radiation')
    await MaterialProperties.spectralToggle.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await MaterialProperties.spectralToggle.click()
    await browser.waitUntil(async () => MaterialProperties.spectralApplied(), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the spectral toggle never turned on'
    })
    return cardId
  }

  /** Read a fixture as text and hand it to the card's file input. */
  const uploadXml = async (cardId: number, file: string): Promise<void> => {
    await MaterialProperties.pickTextFile(cardId, file, readFileSync(materialFixture(file), 'utf-8'))
  }

  /** Read a fixture as bytes and hand it to the card's file input. */
  const uploadImage = async (cardId: number, file: string): Promise<void> => {
    await MaterialProperties.pickBinaryFile(
      cardId,
      file,
      readFileSync(materialFixture(file)).toString('base64')
    )
  }

  /**
   * A new material carrying a SAVED Visualiser texture, from a real PNG.
   *
   * Shared by the upload test and the assignment test so the assignment test's
   * setup is the thing the upload test already proved, rather than a second
   * copy of it.
   */
  const materialWithTexture = async (): Promise<{ id: string; name: string; cardId: number }> => {
    const id = await trackMaterial()
    await MaterialProperties.waitForOpen()
    const cardId = await cardWithType('Visualiser')

    await MaterialProperties.visTab('texture').click()
    // Conditionally RENDERED, not disabled — a recorded deviation from the story.
    await MaterialProperties.subTab('upload').waitForExist({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Upload File sub-tab never appeared'
    })
    await MaterialProperties.subTab('upload').click()
    // The input is `hidden`, so waitForExist — never waitForDisplayed.
    await MaterialProperties.textureFileInput.waitForExist({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the hidden texture file input never rendered'
    })

    await uploadImage(cardId, MATERIAL_FIXTURE_FILES.TEXTURE_PNG)
    return { id, name: await materialNameOf(id), cardId }
  }

  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
    // enterGeometry gates on the object-type catalog and the tree; the material
    // library is fetched by the left panel's <Materials/>, so wait that out too.
    await enterGeometry('matupload')
    await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: '+ Add Materials never became enabled (the material catalog never loaded)'
    })
  })

  afterEach(async () => {
    // Best-effort steps whose errors are COLLECTED, then a hard check that both
    // tracked sets are gone. A leak here is expensive twice over: this file
    // shares one project across every test AND writes into the GLOBAL material
    // library, which outlives the project and the run.
    //
    // A leaked material is worse in this file than in any other, because a
    // material that carries an uploaded file also owns a real file on the
    // backend's disk. Deleting the material is what drops the reference.
    const failures: string[] = []
    const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn()
      } catch (err) {
        failures.push(`${label} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Dialogs first: components/Dialog uses native showModal(), so one left open
    // sits in the top layer and makes every later click fail against whatever it
    // happens to cover.
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    // Then AnchoredPopup's `fixed inset-0 z-40` overlay, which does the same to
    // everything under the right panel.
    await step('sweepPopups', () =>
      browser.execute(() => {
        document
          .querySelectorAll('[data-testid="anchored-popup-overlay"]')
          .forEach((el) => (el as HTMLElement).click())
      })
    )
    // Filters BEFORE deleting: a filtered-out row is not in the DOM, so its
    // trash cannot be clicked and cleanup would silently leak it.
    await step('Geometry.clearSearch', () => Geometry.clearSearch())
    await step('Materials.clearSearch', () => Materials.clearSearch())

    // GROUNDS FIRST — deleting a material that is still assigned drags the eager
    // backend reconcile in with it.
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
        'Cleanup left rows behind in the shared project.\n' +
          (leakedGrounds.length ? `  geometry: ${leakedGrounds.join(', ')}\n` : '') +
          (leakedMaterials.length
            ? `  materials (GLOBAL library, and any uploaded files they own): ${leakedMaterials.join(', ')}\n`
            : '') +
          (failures.length
            ? `  cleanup errors:\n    ${failures.join('\n    ')}`
            : '  No cleanup step reported an error, so the delete silently no-opped.')
      )
    }
  })

  // ══ Spectral data ════════════════════════════════════════════════════════

  describe('spectral data — a real Helios library', () => {
    it('a VALID Helios spectral file uploads, and the BACKEND reports its spectra', async () => {
      // The happy path the suite has never had. Everything before this only ever
      // proved the client REFUSES bad files.
      const cardId = await openSpectralRadiation()
      await uploadXml(cardId, MATERIAL_FIXTURE_FILES.VINEYARD_SPECTRA)

      // The Remove button is the oracle, not the absence of an error: the file
      // row REPLACES the upload button and renders only once spectralPath is
      // set, so its presence means the POST came back with a stored path. "No
      // error yet" would also be true one frame before the upload finished.
      await browser.waitUntil(async () => MaterialProperties.spectralStored(cardId), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'a valid spectral file never produced a stored-file row'
      })
      expect(await MaterialProperties.cardError(cardId)).toBe(null)
      expect(await MaterialProperties.spectralFileName(cardId)).toContain('vineyard_spectra')

      // THE ASSERTION THIS TEST EXISTS FOR. These labels are not read from the
      // file on this machine — they come back from
      // GET /library/groups/{id}/spectral/labels, which the backend answers by
      // parsing the file it STORED. So this is proof of a real server round
      // trip: upload accepted, written to disk, re-read, and parsed.
      //
      // Compared as a SET: nothing documents that the endpoint preserves the
      // file's document order, and pinning it would assert an incidental
      // behaviour of the server rather than the contents of the fixture.
      await browser.waitUntil(
        async () => {
          await MaterialProperties.openEnum(cardId, 'reflectivity_spectrum').catch(() => {})
          const opts = await MaterialProperties.enumOptions(cardId, 'reflectivity_spectrum')
          return opts.length === VINEYARD_SPECTRUM_LABELS.length
        },
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the backend never reported the spectra inside the uploaded file'
        }
      )
      const labels = (await MaterialProperties.enumOptions(cardId, 'reflectivity_spectrum')).map(
        (o) => o.label
      )
      expect([...labels].sort()).toEqual([...VINEYARD_SPECTRUM_LABELS].sort())
      await MaterialProperties.closeEnum()

      // A STORED FILE IS NOT ENOUGH, and that is deliberate. spectralSetupIncomplete
      // keeps Save shut until BOTH spectrum choices are made, because an unmade
      // choice is not a harmless blank: spectral mode DROPS the per-band values on
      // save, so a material saved here would carry no reflectivity or
      // transmissivity at all, and a label the engine cannot resolve falls back to
      // a reflectivity of 0 — a black surface for the whole run, with no error.
      //
      // Worth pinning as its own step rather than folding into the wait below: it
      // is the difference between "the upload worked" and "the material is usable",
      // and only the second is what the user needs.
      expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)

      // Pick from the file's OWN labels — the options exist only because the
      // backend parsed the upload, so this could not be faked by a stale form.
      await MaterialProperties.setEnum(cardId, 'reflectivity_spectrum', 'grape_leaf')
      await MaterialProperties.setEnum(
        cardId,
        'transmissivity_spectrum',
        'grape_leaf_transmissivity'
      )

      // Only now. Together with the existing 'turning Apply spectral data ON with
      // NO file keeps Save SHUT', both arms of the gate are pinned.
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'a stored spectral file with both spectra chosen did not unlock Save'
      })
      await MaterialProperties.saveCard(cardId)
    })

    it('a real-world non-Helios XML (ANSI N42) is rejected at the ROOT check', async () => {
      // Reinforcement rather than new ground: materials.test.ts already pins the
      // root error with a hand-built string. What this adds is a GENUINE
      // third-party file — an ANSI/IEEE N42.42 radiation measurement export,
      // which is well-formed XML, is named .xml, and so clears every file-level
      // gate (size, extension, parse) before failing on structure. A file built
      // to fail can accidentally fail earlier than intended; this one cannot.
      const cardId = await openSpectralRadiation()
      await uploadXml(cardId, MATERIAL_FIXTURE_FILES.N42_SPECTRUM)

      await browser.waitUntil(
        async () => (await MaterialProperties.cardError(cardId)) === SPECTRAL_ROOT_ERROR,
        {
          timeout: TIMEOUTS.MEDIUM,
          timeoutMsg: `the N42 file did not report the root error (got: ${await MaterialProperties.cardError(cardId)})`
        }
      )
      // Client-side only — nothing was stored, so there is no file row and
      // nothing to save.
      expect(await MaterialProperties.spectralStored(cardId)).toBe(false)
      expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
    })
  })

  // ══ Texture ══════════════════════════════════════════════════════════════

  describe('texture — a real image', () => {
    it('a real PNG uploads, previews, and unlocks Save', async () => {
      // The library tab cannot be tested at all in this build: the texture
      // library ships EMPTY because scripts/build_binary.ps1 carries no
      // --add-data for helios-desktop-backend/assets, so
      // GET /api/textures/defaults answers {"textures": []}. Upload is the only
      // reachable path to a texture, which is what makes this test the whole of
      // that surface rather than half of it.
      const { cardId } = await materialWithTexture()

      expect(await MaterialProperties.cardError(cardId)).toBe(null)
      await browser.waitUntil(
        async () => {
          const src = await MaterialProperties.texturePreviewSrc(cardId)
          return src !== null && src.length > 0
        },
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'an accepted PNG never rendered a preview'
        }
      )

      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'an uploaded texture did not unlock Save'
      })
      await MaterialProperties.saveCard(cardId)
      // Survives the save rather than the preview being a purely local artefact
      // of the picked File: after saving, the src is derived from the STORED
      // texture, not the object URL of the file that was picked.
      expect(await MaterialProperties.texturePreviewSrc(cardId)).not.toBe(null)
    })

    it('an uploaded texture reaches a ground through assignment', async () => {
      // The chain the suite has never joined up: material-assignment.test.ts has
      // 23 tests and not one mentions a texture, so "upload an image and apply
      // it to a surface" — the actual user story — was covered nowhere.
      const { id: materialId, name: materialName, cardId } = await materialWithTexture()
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'an uploaded texture did not unlock Save'
      })
      await MaterialProperties.saveCard(cardId)

      const groundId = await trackGround()
      const groundName = await groundNameOf(groundId)
      await ObjectProperties.waitForOpen()

      // Drain first so an earlier toast cannot satisfy the wait below, and re-arm
      // the recorder after draining so its log holds only what the assign caused.
      await drainToasts()
      await recordMeshFetches()

      await dragMaterialOnto({ groupId: materialId, name: materialName }, groundId)

      await waitForToast(GEOMETRY_TOAST.materialAssigned(materialName, groundName))
      await browser.waitUntil(
        async () => (await ObjectProperties.assignedNames()).includes(materialName),
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: `"${materialName}" never appeared on ${groundName} after the drop`
        }
      )

      // The half that matters for the 3D window: an assignment that never
      // refetched would leave the ground drawn exactly as it was.
      await waitForMeshFetch(groundId)

      // And the nearest DOM-readable proof that the TEXTURE specifically — not
      // just the material — reached the geometry's data: buildMaterialSections
      // turns a member's texture_file into a row carrying an image, so the
      // read-only detail popup renders it.
      await ObjectProperties.openMaterialDetail(materialName)
      const images = await ObjectProperties.detailImages(materialName)
      expect(images.length).toBeGreaterThan(0)
      // MANDATORY: the popup's overlay is `fixed inset-0 z-40` and would
      // intercept every later click, including afterEach's cleanup.
      await ObjectProperties.closeMaterialDetail(materialName)
      await browser.waitUntil(
        async () => !(await ObjectProperties.materialDetail(materialName).isExisting()),
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the material properties popup never closed' }
      )
    })
  })
})
