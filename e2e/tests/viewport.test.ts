/**
 * The 3D viewport — scene contents, the scene selector, and the two live
 * keyboard shortcuts.
 *
 * Before this file the whole suite contained THREE assertions touching 3D, all
 * the same shape: record fetch traffic and confirm a binary mesh was
 * downloaded. The helper's own header concedes the limit — "It is NOT proof
 * that the mesh was painted." So creating, hiding and deleting geometry were
 * asserted only against the tree row, and a viewport that kept a deleted object
 * on screen passed the suite.
 *
 * ── The oracle, and the trap inside it ────────────────────────────────────
 *
 * The statistics overlay this file used to read is hidden (Viewport3D.tsx
 * SHOW_STATS_UI = false, d9b9d39 — pinned as a DEVIATION below). What the
 * scene holds is read from the scene selector, which lists every visible
 * object (Viewport3D.sceneObjectNames), and how big each object is from the
 * mesh the viewport downloaded (support/viewport3d.ts waitForMeshSummary).
 *
 * ── Two DEVIATIONS worth knowing before editing this file ─────────────────
 *
 *  - "Loading geometry…" is UNREACHABLE. It is driven by objectLoading, set
 *    only by LOAD_OBJECT_GEOMETRY_REQUESTED — an action defined, reduced and
 *    watched by a saga but never dispatched anywhere in src/. Not tested.
 *  - The toolbar tooltip reads "Reset view (F)", but F focuses the SELECTED
 *    object and reset-to-default is Ctrl+0 — and the two reset paths differ.
 *    A test written from the tooltip would pin the wrong behaviour.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────
 *
 * Camera motion (orbit / pan / zoom / reset — 13 of the 15 shortcuts) has no
 * DOM-observable result, so it is recorded as a known gap rather than covered
 * by tests that cannot fail. Ctrl+0 / Ctrl+= / Ctrl+- are additionally unsafe
 * to send: they collide with Electron's viewMenu accelerators and, if focus is
 * anywhere but the canvas, silently change the renderer zoom level and
 * invalidate every coordinate for the rest of the run.
 *
 * Click-to-select and hover highlight are unimplemented features, not gaps.
 */
import Geometry from '../pages/Geometry.page'
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import Viewport from '../pages/Viewport3D.page'
import {
  deleteProjectViaBackend,
  enterGeometry,
  reloadToHome,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import {
  isMeshUrlFor,
  meshFetches,
  recordMeshFetches,
  textureFiles,
  waitForMeshFetch,
  waitForMeshSummary
} from '../support/viewport3d'
import { dragMaterialOnto } from '../support/dnd'
import { clickDialogButton, waitForNoOpenDialog, waitForOpenDialog } from '../support/dialogs'
import { TIMEOUTS } from '../config/timeouts'
import { GEOMETRY_MATERIAL_MSG } from '../constants/geometry'
import { DEFAULT_GROUND_STATS, SCENE_SELECTOR } from '../constants/viewport'

let projectId: string | null = null

before(async () => {
  await waitForMainWindow()
  await waitForBackendReady()
})

beforeEach(async () => {
  await reloadToHome()
  const project = await enterGeometry('vp')
  projectId = project.id
  await recordMeshFetches()
})

afterEach(async () => {
  // The stats overlay paints over the left toolbar, and it is component-local
  // state that survives a tab switch — close it so it cannot intercept a later
  // test's clicks.
  await Viewport.closeStats().catch(() => {})
  if (projectId) {
    const id = projectId
    projectId = null
    await reloadToHome().catch(() => {})
    await deleteProjectViaBackend(id).catch(() => {})
  }
})

/** Create a ground and wait until its mesh has actually landed in the cache. */
async function addGroundWithMesh(): Promise<string> {
  const id = await Geometry.addGround()
  await waitForMeshFetch(id)
  await Viewport.waitForIdle()
  return id
}

describe('3D viewport — what the scene holds', () => {
  const nameOf = async (id: string): Promise<string> =>
    (await Geometry.rowName(id).getText()).trim()

  it('the statistics toggle and overlay are NOT shipped', async () => {
    // DEVIATION: d9b9d39 hid the statistics button and its overlay
    // (SHOW_STATS_UI = false). Turning the flag back on fails this — restore the
    // overlay tests then.
    await addGroundWithMesh()
    expect(await Viewport.statsToggle.isExisting()).toBe(false)
    expect(await Viewport.statsOverlay.isExisting()).toBe(false)
  })

  it('an empty scene holds no objects', async () => {
    expect(await Viewport.sceneObjectNames()).toEqual([])
  })

  it('a new ground APPEARS in the scene, not just in the tree', async () => {
    const id = await addGroundWithMesh()
    expect(await Viewport.sceneObjectNames()).toEqual([await nameOf(id)])
    const mesh = await waitForMeshSummary(id)
    expect(mesh.primitiveCount).toBe(DEFAULT_GROUND_STATS.primitives)
    expect(mesh.totalTris).toBe(DEFAULT_GROUND_STATS.triangles)
    expect(mesh.totalVerts).toBe(DEFAULT_GROUND_STATS.vertices)
  })

  it('a second ground ADDS to the scene', async () => {
    const first = await addGroundWithMesh()
    const second = await addGroundWithMesh()
    const objects = await Viewport.sceneObjectNames()
    expect(objects).toHaveLength(2)
    expect(objects).toContain(await nameOf(first))
    expect(objects).toContain(await nameOf(second))
  })

  it('HIDING a ground removes it from the scene', async () => {
    const first = await addGroundWithMesh()
    const second = await addGroundWithMesh()
    const secondName = await nameOf(second)
    expect(await Viewport.sceneObjectNames()).toHaveLength(2)

    await Geometry.clickEye(first)

    await browser.waitUntil(
      async () => {
        const objects = await Viewport.sceneObjectNames()
        return objects.length === 1 && objects[0] === secondName
      },
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'hiding a ground did not remove it from the scene' }
    )
  })

  it('UN-HIDING a ground restores it to the scene', async () => {
    const id = await addGroundWithMesh()
    const name = await nameOf(id)
    await Geometry.clickEye(id)
    await browser.waitUntil(async () => (await Viewport.sceneObjectNames()).length === 0, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'the ground never left the scene'
    })

    await recordMeshFetches()
    await Geometry.clickEye(id)
    await waitForMeshFetch(id)
    await Viewport.waitForIdle()

    await browser.waitUntil(async () => (await Viewport.sceneObjectNames()).includes(name), {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'un-hiding the ground did not bring it back into the scene'
    })
    const mesh = await waitForMeshSummary(id)
    expect(mesh.primitiveCount).toBe(DEFAULT_GROUND_STATS.primitives)
    expect(mesh.totalTris).toBe(DEFAULT_GROUND_STATS.triangles)
  })

  it('DELETING a ground removes it from the scene', async () => {
    const first = await addGroundWithMesh()
    const second = await addGroundWithMesh()
    const secondName = await nameOf(second)
    expect(await Viewport.sceneObjectNames()).toHaveLength(2)

    await Geometry.deleteRow(first)

    await browser.waitUntil(
      async () => {
        const objects = await Viewport.sceneObjectNames()
        return objects.length === 1 && objects[0] === secondName
      },
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'deleting a ground did not remove it from the scene' }
    )
  })
})

describe('3D viewport — the scene selector', () => {
  it('lists All plus every visible object', async () => {
    await addGroundWithMesh()
    await addGroundWithMesh()
    const names = await Geometry.names()

    await Viewport.openSelector()
    const options = await Viewport.selectorOptions()

    expect(options[0]).toBe(SCENE_SELECTOR.allOption)
    for (const name of names) expect(options).toContain(name)
    expect(options).toHaveLength(names.length + 1)
  })

  it('a HIDDEN object does not appear in the selector', async () => {
    const first = await addGroundWithMesh()
    await addGroundWithMesh()
    const hiddenName = await Geometry.rowName(first).getText()

    await Geometry.clickEye(first)
    await Viewport.waitForIdle()

    await Viewport.openSelector()
    expect(await Viewport.selectorOptions()).not.toContain(hiddenName.trim())
  })

  it('picking an object ISOLATES it, and All restores the scene', async () => {
    const first = await addGroundWithMesh()
    await addGroundWithMesh()
    const name = (await Geometry.rowName(first).getText()).trim()

    await Viewport.selectSceneObject(first)
    await Viewport.waitForIdle()
    await browser.waitUntil(async () => (await Viewport.selectorLabel()) === name, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'the selector label never showed the isolated object'
    })

    await Viewport.selectSceneObject('all')
    await Viewport.waitForIdle()
    await browser.waitUntil(
      async () => (await Viewport.selectorLabel()) === SCENE_SELECTOR.allOption,
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'the selector never returned to All' }
    )
    expect(await Viewport.sceneObjectNames()).toHaveLength(2)
  })
})

describe('3D viewport — the two shortcuts with an observable result', () => {
  it('Escape clears the selection', async () => {
    const id = await addGroundWithMesh()
    const name = (await Geometry.rowName(id).getText()).trim()

    await Viewport.selectSceneObject(id)
    await Viewport.waitForIdle()
    expect(await Viewport.selectorLabel()).toBe(name)

    // Focus is on <body> here — picking an option unmounted the button it was
    // on — and every shortcut is gated on the canvas holding focus.
    await Viewport.focusCanvas()
    await browser.keys(['Escape'])

    // Esc also sets meshReady=false, which raises the loader for about a frame
    // and unmounts the selector with it. Wait for it back rather than assume it
    // stayed mounted.
    await Viewport.waitForIdle()
    await browser.waitUntil(
      async () => (await Viewport.selectorLabel()) === SCENE_SELECTOR.allOption,
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'Escape did not clear the scene selection' }
    )
  })

  it('A clears the selection', async () => {
    const id = await addGroundWithMesh()
    await Viewport.selectSceneObject(id)
    await Viewport.waitForIdle()

    await Viewport.focusCanvas()
    await browser.keys(['a'])

    await Viewport.waitForIdle()
    await browser.waitUntil(
      async () => (await Viewport.selectorLabel()) === SCENE_SELECTOR.allOption,
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'A did not clear the scene selection' }
    )
  })

  it('a shortcut does NOT fire while a text input is focused', async () => {
    // The one test that proves the guard rather than the binding.
    const id = await addGroundWithMesh()
    const name = (await Geometry.rowName(id).getText()).trim()
    await Viewport.selectSceneObject(id)
    await Viewport.waitForIdle()

    // Put focus in the geometry search box, then press Escape.
    await Geometry.searchBox.click()
    expect(await Viewport.canvasFocused()).toBe(false)
    await browser.keys(['Escape'])

    // The selection must be untouched — isInputFocused() short-circuits first.
    expect(await Viewport.selectorLabel()).toBe(name)
  })
})

// ══ The cross-feature chain the audit called broken ═══════════════════════

describe('3D viewport — a material change restyles the objects using it', () => {
  it('deleting an assigned material refetches ONLY the objects that used it', async () => {
    // refetchObjectsUsingGroup drives four separate handlers (material saved,
    // type deleted, material deleted, unassigned) and had no coverage at all.
    // Deleting an assigned material is the most reliable of the four to drive,
    // and it is the one with the clearest user-visible stake: the ground was
    // painted in that material and must stop being.
    //
    // The SELECTIVITY is the real assertion. A naive implementation that
    // refetched the whole scene would satisfy "the assigned ground refetched"
    // while quietly costing a round trip per object, so the second ground being
    // left alone is what makes this test worth having.
    const assigned = await addGroundWithMesh()
    const untouched = await addGroundWithMesh()

    const materialId = await Materials.addMaterial()
    const materialName = (await Materials.rowName(materialId).getText()).trim()

    await Geometry.selectRow(assigned)
    await ObjectProperties.waitForOpen()

    await recordMeshFetches()
    await dragMaterialOnto({ groupId: materialId, name: materialName }, assigned)
    // Every new ground is born wearing its default Mtl. material, so the drop
    // asks to REPLACE it first (TreeRow's own Replace dialog).
    const dialog = await waitForOpenDialog()
    expect(dialog.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
    await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
    await waitForNoOpenDialog()
    await browser.waitUntil(
      async () => (await ObjectProperties.assignedNames()).includes(materialName),
      { timeout: TIMEOUTS.MUTATION, timeoutMsg: `"${materialName}" never replaced the default` }
    )
    // The replace's own refetch: the blank material has no Visualiser, so the
    // ground is rebuilt WITHOUT the default's texture. Wait for exactly that
    // before re-arming, so it cannot satisfy the assertion below.
    await waitForMeshSummary(assigned, (s) => textureFiles(s).length === 0)
    await Viewport.waitForIdle()

    await recordMeshFetches()
    await Materials.deleteRow(materialId)

    await waitForMeshFetch(assigned)
    const urls = (await meshFetches()).map((c) => c.url)
    expect(urls.some((u) => isMeshUrlFor(u, untouched))).toBe(false)
  })
})
