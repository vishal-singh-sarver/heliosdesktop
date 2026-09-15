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
 * intermittent failure. These six tests also share the fixture helpers, which
 * belong together. Same precedent as material-assignment.test.ts being split
 * out of materials.test.ts.
 *
 * ── The fixtures are load-bearing, not interchangeable ────────────────────
 *
 * TEXTURE_PNG is EXACTLY MAX_TEXTURE_BYTES and TEXTURE_OVERSIZE_PNG is one
 * megabyte past it, so between them they pin `>` rather than `>=` on the size
 * rule. Swapping either for "some other image of about the right size" quietly
 * removes the boundary while every assertion stays green, which is why the
 * accept test asserts the byte count itself.
 *
 * Nothing here relies on a MIS-LABELLED file on disk: the format-mismatch case
 * overrides the name at the File constructor instead. A fixture that lies about
 * its own format is indistinguishable from a mistake once it is committed — one
 * did land here (a JPEG named .png) and read as exactly that.
 *
 * ── What is NOT asserted ──────────────────────────────────────────────────
 *
 * That the ground is visibly painted with the texture. WebGL pixels are
 * unreadable to WebDriver — toDataURL() returns blank because the app never
 * sets preserveDrawingBuffer — so the furthest this can go is that the texture
 * reached the geometry's material data and the mesh was refetched. The visual
 * result stays manual, exactly as it does for the Visualiser's colour.
 */

import { readFileSync, statSync } from 'node:fs'
import Geometry from '../pages/Geometry.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import { GEOMETRY_TOAST } from '../constants/geometry'
import { MATERIALS_MSG, MATERIAL_LIMITS } from '../constants/materials'
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
import {
  unassignMaterial,
  waitForDefaultMaterial,
  waitForLibraryRow
} from '../support/defaultMaterial'

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

  /**
   * Create a ground and return its row id, WITHOUT its default material.
   *
   * Every new ground is born wearing `Mtl.<name>` (support/defaultMaterial.ts);
   * the texture test drops an uploaded texture onto an empty ground, so the
   * default is unassigned here and tracked for cleanup (option A, agreed
   * 14 Sep 2026).
   */
  const trackGround = async (): Promise<string> => {
    const id = await Geometry.addGround()
    grounds.push(id)
    await ObjectProperties.waitForOpen()
    const defaultName = await waitForDefaultMaterial()
    materials.push(await waitForLibraryRow(defaultName))
    await unassignMaterial(defaultName)
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

  /**
   * Read a fixture as bytes and hand it to the card's file input.
   *
   * `asName` / `mime` override the labels the page sees WITHOUT touching the
   * file on disk. That is the only clean way to reach validateTextureFile's
   * format-mismatch branch, which compares the extension against the real
   * signature: the alternative is committing a deliberately mis-labelled copy
   * of an image, which puts a lie in the repo to express something the File
   * constructor expresses for free — and which the last such fixture
   * (`test_image.png`, a JPEG named .png) proved is indistinguishable from an
   * honest mistake once it is sitting on disk.
   */
  const uploadImage = async (
    cardId: number,
    file: string,
    asName = file,
    mime = 'image/png'
  ): Promise<void> => {
    await MaterialProperties.pickBinaryFile(
      cardId,
      asName,
      readFileSync(materialFixture(file)).toString('base64'),
      mime
    )
  }

  /**
   * A new material with a Visualiser card parked on the texture Upload File
   * sub-tab, its hidden file input rendered, and NOTHING uploaded.
   *
   * Split out of materialWithTexture so the rejection tests below start from a
   * precondition identical to the accept test's. A rejection observed on a card
   * built a different way proves less than it looks like it does — the error
   * could be coming from the setup rather than from the file.
   */
  const openTextureUpload = async (): Promise<{ id: string; cardId: number }> => {
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
    return { id, cardId }
  }

  /**
   * A new material carrying a SAVED Visualiser texture, from a real PNG.
   *
   * Shared by the upload test and the assignment test so the assignment test's
   * setup is the thing the upload test already proved, rather than a second
   * copy of it.
   */
  const materialWithTexture = async (): Promise<{ id: string; name: string; cardId: number }> => {
    const { id, cardId } = await openTextureUpload()
    await uploadImage(cardId, MATERIAL_FIXTURE_FILES.TEXTURE_PNG)
    return { id, name: await materialNameOf(id), cardId }
  }

  /**
   * Wait for the card's error line to read exactly `expected`; on a timeout,
   * fail with what the line ACTUALLY said when the wait gave up.
   *
   * The observed value is captured inside the poll and reported from the catch.
   * It used to be `${await MaterialProperties.cardError(cardId)}` inside
   * `timeoutMsg`, which is evaluated when the options object is built —
   * straight after the file pick, before the first poll, while the card still
   * showed no error. So a COPY MISMATCH (a different message rendered) was
   * reported as `got: null`, pointing at "nothing rendered" instead.
   * material-assignment.test.ts's waitForAssigned carries the same warning.
   *
   * The last value is kept as a DESCRIPTION string rather than
   * `string | null`: a `let` assigned only inside the callback is narrowed by
   * TypeScript to its initializer at the catch, and "no error" and "never read"
   * must not look alike in the message.
   */
  const waitForCardError = async (
    cardId: number,
    expected: string,
    // Annotated `number`: TIMEOUTS is `as const`, and a literal type would
    // reject passing MEDIUM at one site and MUTATION at the other.
    timeout: number,
    failure: string
  ): Promise<void> => {
    let got = 'no poll completed'
    try {
      await browser.waitUntil(
        async () => {
          const error = await MaterialProperties.cardError(cardId)
          got = error === null ? 'no error rendered' : `"${error}"`
          return error === expected
        },
        { timeout }
      )
    } catch (err) {
      // waitUntil's own reason goes along too. A throwing poll does not abort the
      // wait, but if the FINAL poll threw, the rejection carries that error rather
      // than a timeout, and it must not read as a plain mismatch.
      throw new Error(
        `${failure}: expected "${expected}", got ${got} ` +
          `(${err instanceof Error ? err.message : String(err)})`
      )
    }
  }

  /**
   * Assert a picked file was refused CLIENT-SIDE, with the given message.
   *
   * Three assertions rather than one, because "an error appeared" is the
   * weakest of the three: an error can appear while the file is nonetheless
   * stored, and a texture that reached the card would still be there to save.
   * The preview being absent and Save staying shut are what say the refusal was
   * total.
   */
  const expectRefused = async (cardId: number, message: string): Promise<void> => {
    await waitForCardError(
      cardId,
      message,
      TIMEOUTS.MUTATION,
      'the picked file was not refused with the expected card error'
    )
    expect(await MaterialProperties.texturePreviewSrc(cardId)).toBe(null)
    expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
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

      await waitForCardError(
        cardId,
        SPECTRAL_ROOT_ERROR,
        TIMEOUTS.MEDIUM,
        'the N42 file did not report the root error'
      )
      // Client-side only — nothing was stored, so there is no file row and
      // nothing to save.
      expect(await MaterialProperties.spectralStored(cardId)).toBe(false)
      expect(await staysFalse(async () => MaterialProperties.saveEnabled(cardId))).toBe(true)
    })
  })

  // ══ Texture ══════════════════════════════════════════════════════════════

  describe('texture — a real image', () => {
    it('a real PNG AT the 10 MB cap uploads, previews, and unlocks Save', async () => {
      // The library tab cannot be tested at all in this build: the texture
      // library ships EMPTY because scripts/build_binary.ps1 carries no
      // --add-data for helios-desktop-backend/assets, so
      // GET /api/textures/defaults answers {"textures": []}. Upload is the only
      // reachable path to a texture, which is what makes this test the whole of
      // that surface rather than half of it.
      //
      // TEXTURE_PNG is EXACTLY MAX_TEXTURE_BYTES, so this doubles as the
      // inclusive upper boundary of the size rule — validation.ts:114 rejects on
      // a strict `>`, and a fixture one byte either side would be testing a
      // different thing. That property lives in the file's byte count, where
      // nothing enforces it, so assert it here: re-encoding the fixture (or
      // swapping it for another image) would otherwise turn the boundary case
      // into an ordinary one with every assertion still green.
      expect(statSync(materialFixture(MATERIAL_FIXTURE_FILES.TEXTURE_PNG)).size).toBe(
        MATERIAL_LIMITS.TEXTURE_MAX_BYTES
      )

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

    it('an image ONE MEGABYTE past the cap is refused before the backend sees it', async () => {
      // The other half of the boundary, and the pair is the point: on its own,
      // "10 MB is accepted" is also satisfied by an app with no size rule at
      // all. Only the two together pin `>` rather than `>=` — the difference
      // between a cap that admits its own limit and one that rejects it.
      //
      // A genuine PNG in every other respect (same image, re-encoded larger),
      // so it clears the extension, MIME, signature and format checks and can
      // only fail on size. A file built to be oversize by being junk would pass
      // this test for the wrong reason.
      expect(
        statSync(materialFixture(MATERIAL_FIXTURE_FILES.TEXTURE_OVERSIZE_PNG)).size
      ).toBeGreaterThan(MATERIAL_LIMITS.TEXTURE_MAX_BYTES)

      const { cardId } = await openTextureUpload()
      await uploadImage(cardId, MATERIAL_FIXTURE_FILES.TEXTURE_OVERSIZE_PNG)

      await expectRefused(cardId, MATERIALS_MSG.textureFileSizeError)
    })

    it('a real PNG named .jpeg is refused as a format MISMATCH, not as a bad image', async () => {
      // The branch that had never been reached from the UI. It matters because
      // it is the one rejection where NOTHING is wrong with the picture: the
      // bytes decode, the size is fine, and validation.ts:141 is explicit that a
      // vague "invalid image" here "would send the user hunting for a problem
      // with a picture that is perfectly fine". So the assertion is the specific
      // message, never merely that an error appeared.
      //
      // Sent under an overridden NAME rather than from a mis-labelled fixture —
      // see uploadImage. The MIME is the one an OS would report for a .jpeg, so
      // the only thing left disagreeing is the extension against the signature,
      // which is exactly the branch under test.
      const { cardId } = await openTextureUpload()
      await uploadImage(
        cardId,
        MATERIAL_FIXTURE_FILES.TEXTURE_SMALL_PNG,
        'texture.jpeg',
        'image/jpeg'
      )

      await expectRefused(cardId, MATERIALS_MSG.textureFileFormatMismatch('PNG', 'texture.jpeg'))
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
