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
 * The viewport renders its scene contents as plain DOM text behind the stats
 * toggle, which makes them readable without touching WebGL. But the overlay is
 * NOT self-refreshing: hide and delete evict synchronously (so the memo
 * recomputes), while create and un-hide re-fetch asynchronously and land via a
 * reducer that never touches any memo dependency. Read naively, the overlay
 * reports Primitives: 0 for a ground that is visible and rendered.
 *
 * Viewport3D.readStats() therefore closes and reopens the overlay on every
 * read, which forces a recompute against the live cache. Every assertion here
 * depends on that; see the header of e2e/pages/Viewport3D.page.ts.
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
import { meshFetches, recordMeshFetches, waitForMeshFetch } from '../support/viewport3d'
import { dragMaterialOnto } from '../support/dnd'
import { TIMEOUTS } from '../config/timeouts'
import { DEFAULT_GROUND_STATS, SCENE_SELECTOR, expectedStatsForGrounds } from '../constants/viewport'

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

describe('3D viewport — the scene statistics oracle', () => {
  it('the overlay toggles open and closed', async () => {
    expect(await Viewport.statsOpen()).toBe(false)

    await Viewport.openStats()
    expect(await Viewport.statsOpen()).toBe(true)

    await Viewport.closeStats()
    expect(await Viewport.statsOpen()).toBe(false)
  })

  it('an empty scene reports all zeros, and NO Quads row', async () => {
    // The overlay is not gated on objects.length, unlike the selector and the
    // left toolbar — it renders with zeros. Quads is the one conditional row
    // (rendered only when > 0), so its absence here is the assertion.
    const stats = await Viewport.readStats()
    expect(stats.objects).toBe(0)
    expect(stats.primitives).toBe(0)
    expect(stats.triangles).toBe(0)
    expect(stats.vertices).toBe(0)
    expect(stats.quads).toBe(null)
  })

  it('a new ground APPEARS in the scene, not just in the tree', async () => {
    await addGroundWithMesh()

    const stats = await Viewport.readStats()
    const expected = expectedStatsForGrounds(1)
    expect(stats.objects).toBe(expected.objects)
    expect(stats.primitives).toBe(expected.primitives)
    expect(stats.triangles).toBe(expected.triangles)
    expect(stats.vertices).toBe(expected.vertices)
    expect(stats.quads).toBe(expected.quads)
  })

  it('a second ground ADDS to the scene', async () => {
    await addGroundWithMesh()
    await addGroundWithMesh()

    const stats = await Viewport.readStats()
    const expected = expectedStatsForGrounds(2)
    expect(stats.objects).toBe(expected.objects)
    expect(stats.primitives).toBe(expected.primitives)
    expect(stats.triangles).toBe(expected.triangles)
  })

  it('HIDING a ground removes it from the scene', async () => {
    // The assertion the suite has never had: hiding was previously verified
    // only against the tree row's icon, so a viewport that kept the mesh on
    // screen passed.
    const first = await addGroundWithMesh()
    await addGroundWithMesh()
    expect((await Viewport.readStats()).objects).toBe(2)

    await Geometry.clickEye(first)

    await browser.waitUntil(async () => (await Viewport.readStats()).objects === 1, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'hiding a ground did not remove it from the scene'
    })
    const stats = await Viewport.readStats()
    expect(stats.primitives).toBe(DEFAULT_GROUND_STATS.primitives)
    expect(stats.triangles).toBe(DEFAULT_GROUND_STATS.triangles)
  })

  it('UN-HIDING a ground restores it to the scene', async () => {
    // The test that would silently fail without the re-toggle protocol: the
    // re-fetch lands asynchronously through a reducer that touches no memo
    // dependency, so a naive read reports Primitives: 0 forever.
    const id = await addGroundWithMesh()
    await Geometry.clickEye(id)
    await browser.waitUntil(async () => (await Viewport.readStats()).objects === 0, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'the ground never left the scene'
    })

    await recordMeshFetches()
    await Geometry.clickEye(id)
    await waitForMeshFetch(id)
    await Viewport.waitForIdle()

    const stats = await Viewport.readStats()
    expect(stats.objects).toBe(1)
    expect(stats.primitives).toBe(DEFAULT_GROUND_STATS.primitives)
    expect(stats.triangles).toBe(DEFAULT_GROUND_STATS.triangles)
  })

  it('DELETING a ground removes it from the scene', async () => {
    const first = await addGroundWithMesh()
    await addGroundWithMesh()
    expect((await Viewport.readStats()).objects).toBe(2)

    await Geometry.deleteRow(first)

    await browser.waitUntil(async () => (await Viewport.readStats()).objects === 1, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'deleting a ground did not remove it from the scene'
    })
    expect((await Viewport.readStats()).primitives).toBe(DEFAULT_GROUND_STATS.primitives)
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
    expect((await Viewport.readStats()).objects).toBe(2)
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
    await dragMaterialOnto({ groupId: materialId, name: materialName }, assigned)
    // The assignment itself refetches; wait it out before re-arming so its
    // fetch cannot satisfy the assertion below.
    await waitForMeshFetch(assigned)
    await Viewport.waitForIdle()

    await recordMeshFetches()
    await Materials.deleteRow(materialId)

    await waitForMeshFetch(assigned)
    const urls = (await meshFetches()).map((c) => c.url)
    expect(urls.some((u) => u.includes(`/objects/${untouched}/geometry/binary`))).toBe(false)
  })
})
