/**
 * Geometry — the left "Tools" panel shell and the Saved Geometries tree.
 *
 * Covers: panel/section chrome, the create toolbar, ground creation and
 * Ground.NNN auto-naming, viewport + render visibility, inline rename
 * validation, search filtering, delete, and the tree -> Properties-form wiring.
 *
 * Out of scope (own files, different mechanism): the Ground Properties form's
 * field validation, and drag-and-drop grouping (synthetic HTML5 dataTransfer).
 *
 * ── State model ───────────────────────────────────────────────────────────
 * Shared provisioning, the datatype-validation.test.ts pattern: ONE project
 * for the whole file. enterGeometry is a create POST plus four catalog
 * fetches, far too expensive to repeat per test. Each test creates the rows it
 * needs via track(), and afterEach deletes exactly those.
 *
 * Three rules this file depends on:
 *  - NEVER assert absolute row counts against the shared scenario; assert only
 *    on rows this test created.
 *  - NEVER hardcode the next name. Ground.NNN is GAP-FILLING (naming.ts picks
 *    the lowest unused number), so a leaked row shifts it. Derive the
 *    expectation from observed state.
 *  - NEVER save a ground above ~100 resolution cells. The 3D window is always
 *    mounted and fetches the built mesh with no timeout, so a large save wedges
 *    the runner. Nothing here saves the form; that lives in the properties spec.
 *
 * ── Deviations ────────────────────────────────────────────────────────────
 * Several assertions contradict the supplied manual test spec and are written
 * against SHIPPED behaviour. Each is marked DEVIATION inline.
 */

import Geometry from '../pages/Geometry.page'
import LeftPanel from '../pages/LeftPanel.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import {
  GEOMETRY_LIMITS,
  GEOMETRY_MSG,
  GEOMETRY_PANEL,
  GEOMETRY_TOAST,
  GROUND_BOUNDS
} from '../constants/geometry'
import { TIMEOUTS } from '../config/timeouts'
import {
  enterGeometry,
  enterProject,
  reloadToHome,
  reopenByName,
  staysFalse,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import {
  clickDialogClose,
  countOpenDialogs,
  waitForNoOpenDialog,
  waitForOpenDialog
} from '../support/dialogs'
import {
  dragRowOnto,
  dragRowsToTreeBackground,
  readDragPayload,
  treeBackgroundGap
} from '../support/dnd'
import {
  clearApiFaults,
  clearApiLatency,
  installApiFault,
  withApiFault,
  withApiLatency
} from '../support/faults'
import { drainToasts, waitForToast } from '../support/toasts'
import { recordMeshFetches, waitForMeshFetch } from '../support/viewport3d'

describe('Geometry', () => {
  /** Rows created by the running test, oldest first. afterEach removes them. */
  let created: string[] = []

  const track = async (): Promise<string> => {
    const id = await Geometry.addGround()
    created.push(id)
    return id
  }

  /** Rename and wait for it to land, since the commit is a backend round-trip. */
  const renameAndSettle = async (id: string, next: string): Promise<void> => {
    await Geometry.renameRow(id, next, 'enter')
    await browser.waitUntil(async () => (await Geometry.rowState(id))?.name === next, {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: `rename to "${next}" never landed`
    })
  }

  const nameOf = async (id: string): Promise<string> =>
    ((await Geometry.rowState(id))?.name ?? '') as string

  /**
   * PRODUCT BUG WORKAROUND — a group whose id equals a ground's id FREEZES the app.
   *
   * Backend groups (`object_group`) and grounds (`scenario_object`) are separate
   * tables with independent autoincrement ids, but the frontend keys both into
   * ONE `nodesById` map by that id. So in a fresh database Ground.001/.002 are
   * ids 1 and 2, the first group is ALSO id 1, GROUP_NODES_SUCCEEDED overwrites
   * a member with the group — a group containing itself — and the tree renders
   * it forever: the renderer stops answering within ~3s and aborts (exit 134)
   * about two minutes later. Measured 15 Sep 2026: grounds 1+2 → hang; grounds
   * 4+5 → Group.001 (id 1) with children [4, 5], renderer fine.
   *
   * A full file run never showed it because a hundred earlier tests had pushed
   * ground ids far past group ids; running the grouping tests on their own (a
   * grep, or a fresh spec session) always hit it. A test that pinned the bug
   * would kill the renderer and every later test with it, so instead ground ids
   * are pushed past any group id this file creates. Cheap when already there: one
   * create + delete.
   */
  const MIN_GROUND_ID = 50
  const pushGroundIdsPastGroupIds = async (): Promise<void> => {
    for (;;) {
      const id = await Geometry.addGround()
      await Geometry.deleteRow(id)
      if (Number(id) >= MIN_GROUND_ID) return
    }
  }

  before(async () => {
    await waitForMainWindow()
    // The catalog fetches gate + Ground; do not pay their cold start inside a
    // timed assertion.
    await waitForBackendReady()
    await enterGeometry('geo')
  })

  afterEach(async () => {
    // Individual steps stay best-effort, but their errors are now COLLECTED
    // rather than discarded, and the teardown ends by checking the thing that
    // actually matters: are the tracked rows gone?
    //
    // Why that distinction. A step failing is often benign — a dialog the test
    // already closed, a row the test deleted itself. A row still present is
    // not: this file shares ONE project, Ground.NNN naming is gap-filling, and
    // several tests assert against tree contents. A leaked row therefore
    // corrupts a LATER test and surfaces as a failure nowhere near its cause.
    // Failing here costs one confusing debug session instead of many.
    const failures: string[] = []
    const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn()
      } catch (err) {
        failures.push(`${label} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Order matters. A confirmation dialog left open by a failed step uses
    // native showModal(), so it sits in the top layer and makes EVERY later
    // click in the file fail with "element click intercepted" — pointing at the
    // wrong element entirely. Close dialogs before anything else tries to click.
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    // Panel/section state is component-local React state — no backend cost.
    // Reset it BEFORE clearSearch: the search box lives inside the Geometry
    // section body, and after a collapse test a WebDriver click on it retried
    // "element not interactable" for the full 10s waitforTimeout (~5 tests x
    // 11.8s per run, measured from allure hook durations).
    await step('resetToDefault', () => LeftPanel.resetToDefault())
    // Clear the filter BEFORE deleting: a row filtered out of the tree is not
    // in the DOM, so its trash cannot be clicked and cleanup would silently
    // leak rows into the next test's naming expectations.
    await step('clearSearch', () => Geometry.clearSearch())
    // The skip below reads the tree ONCE, and while a list reload is in flight the
    // tree renders only its loading marker — a live row would look gone. Let it
    // settle first (short, and a step, so a test that ended elsewhere costs 10s
    // at most rather than failing teardown). BEFORE the expand: a reload rebuilds
    // every group collapsed, so expanding a still-loading tree expands nothing.
    await step('treeSettled', () =>
      browser.waitUntil(
        async () => browser.execute(() => !document.querySelector('[data-testid="geometry-tree-loading"]')),
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the geometry tree was still loading' }
      )
    )
    // Members of a COLLAPSED group are not in the DOM, so expand every group
    // before the skip check below could mistake a live hidden member for gone.
    await step('expandCollapsedGroups', async () => {
      for (let i = 0; i < 10; i++) {
        const collapsed = (await Geometry.groups()).filter((g) => g.expanded === false)
        if (!collapsed.length) return
        for (const g of collapsed) await Geometry.toggleGroup(g.id)
      }
    })

    const tracked = [...created].reverse()
    for (const id of tracked) {
      // A member already dissolved, or deleted together with its group, has no
      // row: deleteRow's waitForExist would burn the full 10s on it (9 such
      // hooks per run cost 10-21s each). rowState reads the rendered tree in one
      // execute; if that read itself throws, try the delete anyway.
      if (!(await Geometry.rowState(id).then((r) => r !== undefined, () => true))) continue
      await step(`deleteRow(${id})`, () => Geometry.deleteRow(id))
      // deleteRow self-cleans on failure, but cancelDelete-style leftovers and
      // any dialog opened by the test itself still need sweeping between rows.
      await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    }
    created = []
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())

    const leaked: string[] = []
    for (const id of tracked) {
      if (await Geometry.row(id).isExisting().catch(() => false)) leaked.push(id)
    }
    // Panel state is checked HERE, alongside leaked rows, because it fails the
    // same way: both corrupt a LATER test rather than this one. resetToDefault()
    // runs as a best-effort `step`, so a click that missed was collected and
    // then DISCARDED whenever no row leaked — and the next test failed on a
    // collapsed panel with `expected false, received true`, pointing nowhere
    // near the cause. Measured 16 Sep 2026: that is exactly how
    // geometry.test.ts:388 failed on a loaded machine while passing in
    // isolation. The retry in LeftPanel.setCollapsed makes it rare; this makes
    // it LEGIBLE when it still happens.
    const panelDirty = await LeftPanel.defaultStateViolation().catch(
      (err) => `panel state unreadable — ${err instanceof Error ? err.message : String(err)}`
    )
    if (leaked.length || panelDirty) {
      const problems = [
        leaked.length
          ? `left ${leaked.length} geometry row(s) in the shared project: ${leaked.join(', ')}`
          : '',
        panelDirty ? `left the left panel dirty — ${panelDirty}` : ''
      ].filter(Boolean)
      throw new Error(
        `Cleanup ${problems.join('; and ')}.\n` +
          (failures.length
            ? `  cleanup errors:\n    ${failures.join('\n    ')}`
            : '  No cleanup step reported an error, so it silently no-opped.')
      )
    }
  })

  // ══ Panel shell ══════════════════════════════════════════════════════════

  describe('left panel — default state', () => {
    it('the panel and all three sections open EXPANDED on first mount', async () => {
      // DEVIATION: the manual spec assumes a collapsed default and builds ~8
      // cases on it. LeftPanel seeds collapsed=false and all three sections true.
      // Differential: flipping either initial useState turns this red.
      expect(await LeftPanel.collapsed()).toBe(false)
      expect(await LeftPanel.expandedMap()).toEqual({
        geometry: true,
        materials: true,
        models: true
      })
    })

    it('every section header is a real button carrying aria-expanded', async () => {
      // The chevron is one asset rotated by an inline transform and is
      // aria-hidden, so aria-expanded is the only sound state oracle.
      for (const key of ['geometry', 'materials', 'models'] as const) {
        await expect(LeftPanel.sectionToggle(key)).toBeDisplayed()
        expect(await LeftPanel.sectionExpanded(key)).toBe(true)
      }
    })

    it('the Models section opens with an EMPTY body', async () => {
      // DEVIATION: the manual spec expects testable Models content. The section
      // renders `{/* Models content — future step */}` — header only.
      await expect(LeftPanel.sectionBody('models')).toBeDisplayed()
      expect((await LeftPanel.sectionBody('models').getText()).trim()).toBe('')
    })

    it('the Geometry section shows its three create actions', async () => {
      await expect(Geometry.panel).toBeDisplayed()
      await expect(Geometry.addCropButton).toBeDisplayed()
      await expect(Geometry.addGroundButton).toBeDisplayed()
      await expect(Geometry.importFileButton).toBeDisplayed()
    })

    it('the panel is reachable without selecting a workspace tab', async () => {
      // Differential: proves the panel is a SIBLING of CenterWorkspace, unlike
      // Weather which mounts only while its tab is active. Moving it inside the
      // workspace would break this and every helper that skips selectTab().
      expect(await ProjectScreen.tabActive('3dwindow')).toBe(true)
      await expect(Geometry.panel).toBeDisplayed()
    })
  })

  describe('left panel — chrome copy and chevrons', () => {
    // Every other panel assertion in this file addresses a section through the
    // derived testid `accordion-{title.toLowerCase()}`, so all of them would
    // still pass if a title were renamed to "geometry" or "Geometry Tools".
    // These read what the user actually sees.

    it('the panel holds exactly THREE sections, named Geometry, Materials and Models', async () => {
      const titles = await LeftPanel.sectionTitles()
      expect(titles).toEqual(GEOMETRY_PANEL.sections)
    })

    it('the chevron points UP while a section is open and DOWN once it is closed', async () => {
      // DEVIATION: the manual spec says the DEFAULT state points down and flips
      // up on expand. The rotation mapping is exactly that — but all three
      // sections ship EXPANDED, so the default a user meets is the UP chevron
      // and the spec's stated default state is never seen on first mount.
      //
      // Read the style ATTRIBUTE. getCSSProperty('transform') resolves to a
      // matrix(...) and cannot be compared with the value the component writes.
      // The chevron is aria-hidden, so this is the only oracle for the direction.
      expect(await LeftPanel.sectionExpanded('geometry')).toBe(true)
      expect(await LeftPanel.chevronTransform('geometry')).toBe(GEOMETRY_PANEL.chevronOpen)

      await LeftPanel.toggleSection('geometry')
      expect(await LeftPanel.chevronTransform('geometry')).toBe(GEOMETRY_PANEL.chevronClosed)

      await LeftPanel.toggleSection('geometry')
      expect(await LeftPanel.chevronTransform('geometry')).toBe(GEOMETRY_PANEL.chevronOpen)
    })

    it('EVERY section header round-trips on single taps, not just Geometry', async () => {
      // Materials and Models are only ever clicked inside a swallowed
      // afterEach reset today, so a regression in either would be invisible.
      for (const key of ['geometry', 'materials', 'models'] as const) {
        expect(`${key} initial=${await LeftPanel.sectionExpanded(key)}`).toBe(`${key} initial=true`)
        await LeftPanel.toggleSection(key)
        expect(`${key} afterOneTap=${await LeftPanel.sectionExpanded(key)}`).toBe(
          `${key} afterOneTap=false`
        )
        await LeftPanel.toggleSection(key)
        expect(`${key} afterTwoTaps=${await LeftPanel.sectionExpanded(key)}`).toBe(
          `${key} afterTwoTaps=true`
        )
      }
    })

    it('the FIRST tap on Geometry HIDES the create actions; the second brings them back', async () => {
      // DEVIATION: the spec says selecting the Geometry tab expands it to reveal
      // the create options. Because the section ships open, the first tap does
      // the opposite. Asserted as SHIPPED, and deliberately as one sequence —
      // the existing tests prove the body hides and that aria-expanded
      // round-trips, but nothing joins those to the buttons themselves.
      await expect(Geometry.addGroundButton).toBeDisplayed()

      await LeftPanel.toggleSection('geometry')
      expect(await Geometry.addGroundButton.isDisplayed()).toBe(false)
      // Hidden, NOT unmounted — the section keeps its state and never re-runs
      // its data-loading effects on a toggle.
      expect(await Geometry.addGroundButton.isExisting()).toBe(true)

      await LeftPanel.toggleSection('geometry')
      await expect(Geometry.addGroundButton).toBeDisplayed()
    })

    it('the create actions read Crop, Ground and Import from File — with no "Add" prefix', async () => {
      // DEVIATION: the spec calls these "Add Crop" and "Add Ground". The plus is
      // an ICON on each ToolbarButton; the labels carry no prefix. An existing
      // test proves the three buttons are DISPLAYED; none reads their text.
      await expect(Geometry.addCropButton).toHaveText(GEOMETRY_PANEL.addCrop)
      await expect(Geometry.addGroundButton).toHaveText(GEOMETRY_PANEL.addGround)
      await expect(Geometry.importFileButton).toHaveText(GEOMETRY_PANEL.importFromFile)
    })
  })

  describe('left panel — section toggling', () => {
    it('collapsing Geometry hides its body but leaves Materials open', async () => {
      await LeftPanel.setSection('geometry', false)
      await expect(LeftPanel.sectionBody('geometry')).not.toBeDisplayed()
      expect(await LeftPanel.sectionExpanded('materials')).toBe(true)
      await expect(LeftPanel.sectionBody('materials')).toBeDisplayed()
    })

    it('a collapsed body is hidden but NOT unmounted', async () => {
      // Differential: if Accordion switched to conditional rendering, the body
      // would leave the DOM — and the tree would silently reset its load state
      // on every toggle.
      await LeftPanel.setSection('geometry', false)
      await expect(LeftPanel.sectionBody('geometry')).not.toBeDisplayed()
      await expect(LeftPanel.sectionBody('geometry')).toBeExisting()
    })

    it('re-expanding a section does NOT refetch the tree', async () => {
      await LeftPanel.setSection('geometry', false)
      await LeftPanel.setSection('geometry', true)
      expect(await staysFalse(async () => Geometry.treeLoading.isDisplayed())).toBe(true)
    })

    it('toggling a section twice returns it to open', async () => {
      await LeftPanel.toggleSection('geometry')
      expect(await LeftPanel.sectionExpanded('geometry')).toBe(false)
      await LeftPanel.toggleSection('geometry')
      expect(await LeftPanel.sectionExpanded('geometry')).toBe(true)
    })
  })

  describe('left panel — collapse', () => {
    it('collapsing the panel hides every section body', async () => {
      await LeftPanel.setCollapsed(true)
      for (const key of ['geometry', 'materials', 'models'] as const) {
        await expect(LeftPanel.sectionBody(key)).not.toBeDisplayed()
      }
    })

    it('the collapsed panel shows the three-icon rail', async () => {
      await LeftPanel.setCollapsed(true)
      for (const key of ['geometry', 'materials', 'models'] as const) {
        await expect(LeftPanel.rail(key)).toBeDisplayed()
      }
    })

    it('the rail is ABSENT while the panel is expanded', async () => {
      // The rail is genuinely conditionally rendered (unlike the bodies), so
      // absence — not merely hidden — is the correct assertion.
      expect(await LeftPanel.collapsed()).toBe(false)
      await expect(LeftPanel.rail('geometry')).not.toBeExisting()
    })

    it('the collapse button renames itself for the action it will perform', async () => {
      await expect(LeftPanel.collapseButton).toHaveAttribute('aria-label', 'Collapse panel')
      await LeftPanel.setCollapsed(true)
      await expect(LeftPanel.collapseButton).toHaveAttribute('aria-label', 'Expand panel')
    })

    it('a rail icon expands the panel and opens ONLY that section', async () => {
      // openSection() minimizes the siblings — the behaviour that makes the rail
      // more than a shortcut for "expand".
      await LeftPanel.setCollapsed(true)
      await LeftPanel.rail('materials').click()
      await browser.waitUntil(async () => !(await LeftPanel.collapsed()), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'clicking a rail icon never expanded the panel'
      })
      expect(await LeftPanel.expandedMap()).toEqual({
        geometry: false,
        materials: true,
        models: false
      })
    })

    it('Space on a focused section header toggles it', async () => {
      // Native <button> semantics — proves the header is a real button, not a
      // div with a click handler.
      await LeftPanel.sectionToggle('geometry').click()
      expect(await LeftPanel.sectionExpanded('geometry')).toBe(false)
      await browser.keys([' '])
      await browser.waitUntil(async () => LeftPanel.sectionExpanded('geometry'), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'Space on the focused header did not re-expand the section'
      })
    })
  })

  describe('left panel — inert create actions', () => {
    it('Crop creates NOTHING and opens no Properties panel', async () => {
      // DEVIATION: the manual spec expects a crop-creation workflow.
      // Geometry/index.tsx wires onAddCrop to `() => {}` — deferred. Written as
      // a negative gate so it fails loudly if the flow lands without the spec
      // being revisited.
      const before = await Geometry.rowCount()
      await Geometry.addCropButton.click()
      expect(await staysFalse(async () => (await Geometry.rowCount()) !== before)).toBe(true)
    })

    it('Import from File creates NOTHING and opens no dialog', async () => {
      // DEVIATION: onImportFromFile is also `() => {}`. No native dialog is
      // stubbed here on purpose — nothing should try to open one.
      const before = await Geometry.rowCount()
      await Geometry.importFileButton.click()
      expect(await staysFalse(async () => (await Geometry.rowCount()) !== before)).toBe(true)
      await expect($('dialog[open]')).not.toBeExisting()
    })
  })

  // ══ Tree ═════════════════════════════════════════════════════════════════

  describe('creation and auto-naming', () => {
    it('a fresh project starts with an EMPTY tree, not a loading or error state', async () => {
      // Differential: a backend missing the M2 /api/catalog + object routes
      // fails the listNodes GET and renders the error state instead. That is the
      // wrong-submodule-revision failure, caught here rather than 90 tests later.
      await expect(Geometry.treeEmpty).toBeDisplayed()
      await expect(Geometry.treeError).not.toBeDisplayed()
      expect(await Geometry.emptyHint()).toBe(GEOMETRY_MSG.emptyTree)
    })

    it('+ Ground round-trips to the backend and adds one row', async () => {
      const id = await track()
      const row = await Geometry.rowState(id)
      expect(row?.name).toMatch(/^Ground\.\d{3}$/)
      // Both toggles start OFF, i.e. NOT hidden. aria-pressed is INVERTED here.
      expect(row?.viewportHidden).toBe(false)
      expect(row?.renderHidden).toBe(false)
    })

    it('names are zero-padded to three digits', async () => {
      // Differential: dropping padStart in naming.ts would yield "Ground.1".
      const id = await track()
      expect(await nameOf(id)).toMatch(/^Ground\.\d{3}$/)
    })

    it('a second + Ground takes the next free number', async () => {
      const first = await track()
      const second = await track()
      const num = (n: string): number => Number(n.split('.')[1])
      expect(num(await nameOf(second))).toBe(num(await nameOf(first)) + 1)
    })

    it('deleting a middle row frees its number for the next create (GAP-FILLING)', async () => {
      // Differential: a max+1 scheme would yield the next number up, not reuse
      // the hole. Gap-filling is what naming.ts documents explicitly.
      await track()
      const b = await track()
      await track()
      const freed = await nameOf(b)

      await Geometry.deleteRow(b)
      created = created.filter((x) => x !== b)

      const next = await track()
      expect(await nameOf(next)).toBe(freed)
    })

    it('creating a ground opens its Properties form in the right panel', async () => {
      // Differential: RightPanel starts COLLAPSED and force-expands only when
      // createDraftNonce changes. If that wiring broke the form never appears.
      const id = await track()
      await $('[data-testid="object-properties-form"]').waitForDisplayed({
        timeout: TIMEOUTS.LONG,
        timeoutMsg: 'the Properties form never opened after + Ground'
      })
      await expect($('[data-testid="object-name"]')).toHaveValue(await nameOf(id))
      // Nothing edited yet, so Save is gated by the dirty check.
      await expect($('[data-testid="object-save"]')).toBeDisabled()
    })
  })

  describe('viewport visibility (the eye)', () => {
    it('the eye toggles the row hidden and back', async () => {
      const id = await track()
      expect((await Geometry.rowState(id))?.viewportHidden).toBe(false)
      expect(await Geometry.toggleViewport(id)).toBe(true)
      expect(await Geometry.toggleViewport(id)).toBe(false)
    })

    it('hiding one geometry leaves its siblings visible', async () => {
      const a = await track()
      const b = await track()
      await Geometry.toggleViewport(a)
      expect((await Geometry.rowState(a))?.viewportHidden).toBe(true)
      expect((await Geometry.rowState(b))?.viewportHidden).toBe(false)
    })

    it('a hidden geometry stays hidden after selecting another row', async () => {
      const a = await track()
      const b = await track()
      await Geometry.toggleViewport(a)
      await Geometry.selectRow(b)
      expect((await Geometry.rowState(a))?.viewportHidden).toBe(true)
    })

    it('a hidden geometry stays hidden across a rename', async () => {
      const id = await track()
      await Geometry.toggleViewport(id)
      await renameAndSettle(id, 'HiddenKeeper')
      expect((await Geometry.rowState(id))?.viewportHidden).toBe(true)
    })

    it('a hidden geometry is still findable by search', async () => {
      const id = await track()
      const name = await nameOf(id)
      await Geometry.toggleViewport(id)
      await Geometry.search(name)
      expect(await Geometry.names()).toContain(name)
    })
  })

  describe('render visibility (all models)', () => {
    it('the render icon toggles the row out of every model and back', async () => {
      const id = await track()
      expect((await Geometry.rowState(id))?.renderHidden).toBe(false)
      expect(await Geometry.toggleRender(id)).toBe(true)
      expect(await Geometry.toggleRender(id)).toBe(false)
    })

    it('render and viewport visibility are INDEPENDENT', async () => {
      // Differential: they are separate PATCH fields; collapsing them into one
      // flag would make the second assertion fail.
      const id = await track()
      await Geometry.toggleRender(id)
      expect((await Geometry.rowState(id))?.renderHidden).toBe(true)
      expect((await Geometry.rowState(id))?.viewportHidden).toBe(false)
    })
  })

  describe('inline rename', () => {
    it('double-clicking the name opens an editor seeded with the current name', async () => {
      const id = await track()
      const before = await nameOf(id)
      await Geometry.openRename(id)
      await expect(Geometry.nameEditor).toHaveValue(before)
    })

    it('Enter commits a valid rename', async () => {
      const id = await track()
      await renameAndSettle(id, 'Terrain_A')
      expect(await nameOf(id)).toBe('Terrain_A')
    })

    it('Escape discards the edit and keeps the original name', async () => {
      const id = await track()
      const before = await nameOf(id)
      await Geometry.renameRow(id, 'ThrownAway', 'escape')
      expect(await nameOf(id)).toBe(before)
    })

    it('a name at exactly 20 characters is accepted', async () => {
      const id = await track()
      await renameAndSettle(id, GEOMETRY_LIMITS.nameValid)
      expect(await nameOf(id)).toBe(GEOMETRY_LIMITS.nameValid)
    })

    it('a 21-character name is blocked with "Character limit exceeded"', async () => {
      const id = await track()
      const before = await nameOf(id)
      await Geometry.renameRow(id, GEOMETRY_LIMITS.nameTooLong, 'enter')
      expect(await Geometry.renameError(id)).toBe(GEOMETRY_MSG.nameTooLong)
      // The editor deliberately STAYS OPEN on an invalid commit, so the row
      // still shows the rejected text rather than the stored name. Escape out
      // before reading the name, or this asserts against the input's value.
      await browser.keys(['Escape'])
      expect(await nameOf(id)).toBe(before)
    })

    it('an empty name is blocked with "Name is required"', async () => {
      const id = await track()
      const before = await nameOf(id)
      await Geometry.renameRow(id, '', 'enter')
      expect(await Geometry.renameError(id)).toBe(GEOMETRY_MSG.nameRequired)
      await browser.keys(['Escape'])
      expect(await nameOf(id)).toBe(before)
    })

    it('a duplicate name is blocked CASE-INSENSITIVELY', async () => {
      // Differential: validateGroupName lowercases both sides before comparing.
      const a = await track()
      const b = await track()
      await renameAndSettle(a, 'Duplicated')
      await Geometry.renameRow(b, 'DUPLICATED', 'enter')
      expect(await Geometry.renameError(b)).toBe(GEOMETRY_MSG.nameExists)
    })

    it('renaming to the SAME name is a no-op that closes the editor', async () => {
      const id = await track()
      const before = await nameOf(id)
      await Geometry.renameRow(id, before, 'enter')
      expect(await nameOf(id)).toBe(before)
      await expect(Geometry.nameEditor).not.toBeDisplayed()
    })
  })

  describe('search', () => {
    it('a partial query filters the tree to matching rows ONLY', async () => {
      const a = await track()
      await renameAndSettle(a, 'AlphaField')
      const b = await track()
      await renameAndSettle(b, 'BetaField')

      await Geometry.search('Alpha')
      const names = await Geometry.names()
      expect(names).toContain('AlphaField')
      expect(names).not.toContain('BetaField')
    })

    it('the query is case-insensitive', async () => {
      const id = await track()
      await renameAndSettle(id, 'RoadBoundary')
      for (const q of ['roadboundary', 'ROADBOUNDARY', 'rOaDbOuNdArY']) {
        await Geometry.search(q)
        expect(await Geometry.names()).toContain('RoadBoundary')
      }
    })

    it('leading and trailing whitespace is trimmed before matching', async () => {
      const id = await track()
      await renameAndSettle(id, 'TrimTarget')
      await Geometry.search('   TrimTarget   ')
      expect(await Geometry.names()).toContain('TrimTarget')
    })

    it('a query matching nothing shows "No geometries found", NOT the empty-tree hint', async () => {
      // Differential: the hint is chosen by whether the query is blank.
      // Collapsing the two states hides a real distinction from the user.
      await track()
      await Geometry.search('zzzqqq___nomatch')
      await Geometry.treeEmpty.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      expect(await Geometry.emptyHint()).toBe(GEOMETRY_MSG.noMatches)
    })

    it('clearing the query restores every row', async () => {
      const id = await track()
      await Geometry.search('zzzqqq___nomatch')
      expect(await Geometry.rowCount()).toBe(0)
      await Geometry.clearSearch()
      await browser.waitUntil(async () => (await Geometry.rowState(id)) !== undefined, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'clearing the search never restored the tree'
      })
    })
  })

  describe('delete', () => {
    it('cancelling the confirmation keeps the row', async () => {
      // Differential: delete is PESSIMISTIC and gated by the dialog; an
      // optimistic removal would drop the row on Cancel.
      const id = await track()
      await Geometry.cancelDelete(id)
      expect(await Geometry.rowState(id)).toBeDefined()
    })

    it('confirming removes the row', async () => {
      const id = await track()
      await Geometry.deleteRow(id)
      created = created.filter((x) => x !== id)
      expect(await Geometry.rowState(id)).toBeUndefined()
    })

    it('the delete toast names the geometry', async () => {
      const id = await track()
      const name = await nameOf(id)
      await drainToasts()
      await Geometry.deleteRow(id)
      created = created.filter((x) => x !== id)
      await waitForToast(GEOMETRY_TOAST.deleted(name))
    })

    // ── The confirmation itself ────────────────────────────────────────────
    // Everything above drives the dialog straight to completion, so none of its
    // copy had ever been observed. These six read it while it is open.

    it('the confirmation names the geometry over the generic consequence line', async () => {
      // DEVIATION: the manual spec asks for "Are you sure you want to delete
      // this geometry? This will delete the existing data and progress." The
      // shipped body is generic and mentions neither the geometry nor its data;
      // only the heading names the row. Asserted as SHIPPED.
      const id = await track()
      const name = await nameOf(id)
      await Geometry.openDeleteConfirm(id)
      const dlg = await waitForOpenDialog()
      expect(dlg.ariaLabel).toBe(GEOMETRY_MSG.deleteTitle)
      expect(dlg.heading).toBe(GEOMETRY_MSG.deleteHeadingRow(name))
      expect(dlg.body).toBe(GEOMETRY_MSG.deleteBody)
    })

    it('the buttons are Cancel then Delete — there is NO "Yes"', async () => {
      // DEVIATION: the spec asks for "Yes" and "Cancel". Order is asserted too,
      // not just membership: Dialog treats the LAST enabled body button as the
      // primary action, so Cancel-then-Delete is what makes Enter destructive.
      const id = await track()
      await Geometry.openDeleteConfirm(id)
      const dlg = await waitForOpenDialog()
      expect(dlg.buttons).toEqual([GEOMETRY_MSG.deleteCancel, GEOMETRY_MSG.deleteConfirm])
      expect(dlg.buttons).not.toContain('Yes')
      // The header × is NOT one of the two — it lives outside the body, which is
      // why Dialog's own primary-button logic ignores it.
      expect(dlg.hasCloseButton).toBe(true)
    })

    it('focus lands on Delete, so Enter deletes without a second click', async () => {
      // A real hazard, pinned deliberately. The dialog has no input, so Dialog
      // focuses the last enabled body button — the destructive one — and Enter
      // triggers it. Differential: giving Cancel focus, or adding a field, turns
      // this red, which is exactly when someone should be told.
      const id = await track()
      await Geometry.openDeleteConfirm(id)
      expect((await waitForOpenDialog()).focused).toBe(GEOMETRY_MSG.deleteConfirm)

      await browser.keys(['Enter'])
      await browser.waitUntil(async () => (await Geometry.rowState(id)) === undefined, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'Enter on the focused Delete button did not delete the row'
      })
      created = created.filter((x) => x !== id)
    })

    it('Escape closes the confirmation and KEEPS the row', async () => {
      const id = await track()
      await Geometry.openDeleteConfirm(id)
      await browser.keys(['Escape'])
      await waitForNoOpenDialog()
      expect(await Geometry.rowState(id)).toBeDefined()
    })

    it('the header × closes the confirmation and KEEPS the row', async () => {
      // The × is a third way out of the dialog that neither Cancel nor Escape
      // covers, and it runs the same onClose. Nothing asserted it existed.
      const id = await track()
      await Geometry.openDeleteConfirm(id)
      await clickDialogClose()
      await waitForNoOpenDialog()
      expect(await Geometry.rowState(id)).toBeDefined()
    })

    it('three rapid taps on the trash open exactly ONE dialog', async () => {
      // Business rule: repeated taps must not stack dialogs. Shipped behaviour
      // satisfies it structurally — confirmOpen is one boolean per row — so this
      // guards the structure rather than a guard clause. One execute, three
      // clicks: separate round-trips would let React commit between them and
      // stop being a rapid tap at all.
      const id = await track()
      await Geometry.clickRowDeleteRapidly(id, 3)
      await waitForOpenDialog()
      expect(await countOpenDialogs()).toBe(1)
    })

    it('deleting the last row returns the tree to its empty state', async function () {
      const id = await track()
      // Leftovers from an earlier failure would make this assert the wrong
      // thing, so skip rather than pass vacuously — the same this.skip()
      // convention the weather specs use for environment-dependent cases.
      const others = (await Geometry.snapshot()).filter((r) => r.id !== id)
      if (others.length > 0) {
        this.skip()
        return
      }
      await Geometry.deleteRow(id)
      created = created.filter((x) => x !== id)
      await Geometry.treeEmpty.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      expect(await Geometry.emptyHint()).toBe(GEOMETRY_MSG.emptyTree)
    })
  })

  // ══ Ground Properties form — full regression ═════════════════════════════

  describe('ground properties — creation side effects', () => {
    it('the create toast names the new ground', async () => {
      await drainToasts()
      const id = await track()
      await waitForToast(GEOMETRY_TOAST.created(await nameOf(id)))
    })

    it('the 3D viewport fetches a non-empty mesh for the new ground', async () => {
      // THE 3D ASSERTION. WebDriver cannot see inside a WebGL canvas, but the
      // viewport downloads its geometry over `fetch` (everything else in the app
      // is axios/XHR), so a recorded 200 with a non-empty body is real evidence
      // that the backend built the tile and the 3D layer received it.
      // Differential: a stale libhelios.dll makes the create 500 with
      // BUILD_FAILED and no mesh is ever requested — the exact failure that cost
      // us a day.
      await recordMeshFetches()
      const id = await track()
      const call = await waitForMeshFetch(id)
      expect(call.status).toBe(200)
      expect(call.bytes).toBeGreaterThan(0)
    })

    it('the form opens at the blueprint defaults', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      const expected: [Parameters<typeof ObjectProperties.fieldState>[0], string][] = [
        ['length', GEOMETRY_LIMITS.DEFAULT_SIZE],
        ['breadth', GEOMETRY_LIMITS.DEFAULT_SIZE],
        ['resolution_x', GEOMETRY_LIMITS.DEFAULT_RESOLUTION],
        ['resolution_y', GEOMETRY_LIMITS.DEFAULT_RESOLUTION],
        ['position_x', GEOMETRY_LIMITS.DEFAULT_POSITION],
        ['position_y', GEOMETRY_LIMITS.DEFAULT_POSITION],
        ['position_z', GEOMETRY_LIMITS.DEFAULT_POSITION],
        ['rotation_z', GEOMETRY_LIMITS.DEFAULT_ROTATION],
        ['texture_x', GEOMETRY_LIMITS.DEFAULT_TEXTURE_REPEAT],
        ['texture_y', GEOMETRY_LIMITS.DEFAULT_TEXTURE_REPEAT]
      ]
      for (const [prop, value] of expected) {
        const state = await ObjectProperties.fieldState(prop)
        expect(`${prop}=${state.value}`).toBe(`${prop}=${value}`)
        expect(state.invalid).toBe(false)
      }
    })
  })

  describe('ground properties — range validation (negative)', () => {
    // Bounds come from the catalog at runtime, so the message is composed from
    // the same numbers the app was served rather than hardcoded.
    const belowMin: [Parameters<typeof ObjectProperties.fieldState>[0], string][] = [
      ['length', '0.001'],
      ['breadth', '0.001'],
      ['resolution_x', '0'],
      ['resolution_y', '0'],
      ['rotation_z', '-1'],
      ['texture_x', '0'],
      ['texture_y', '0']
    ]

    for (const [prop, value] of belowMin) {
      it(`${prop} below its minimum is flagged invalid`, async () => {
        await track()
        await ObjectProperties.waitForOpen()
        await ObjectProperties.setField(prop, value)
        const state = await ObjectProperties.fieldState(prop)
        expect(`${prop} invalid=${state.invalid}`).toBe(`${prop} invalid=true`)
        expect(await ObjectProperties.errorFor(prop)).not.toBe(null)
      })
    }

    const aboveMax: [Parameters<typeof ObjectProperties.fieldState>[0], string][] = [
      ['resolution_x', String(GROUND_BOUNDS.resolution_x.max + 1)],
      ['resolution_y', String(GROUND_BOUNDS.resolution_y.max + 1)],
      ['rotation_z', '361'],
      // The size fields had no upper-bound case at all: every existing above-max
      // row was a resolution or a rotation, so `length`/`breadth` were only ever
      // driven below their minimum. Validation only, never saved.
      ['length', String(GROUND_BOUNDS.length.max + 1)],
      ['breadth', String(GROUND_BOUNDS.breadth.max + 1)]
    ]

    for (const [prop, value] of aboveMax) {
      it(`${prop} above its maximum is flagged invalid`, async () => {
        await track()
        await ObjectProperties.waitForOpen()
        await ObjectProperties.setField(prop, value)
        expect((await ObjectProperties.fieldState(prop)).invalid).toBe(true)
      })
    }

    it('a required field left empty reports "Required Field"', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', '')
      // The error is gated on `touched || value !== ''`, so a pristine empty
      // field deliberately shows nothing. Blur to mark it touched.
      await ObjectProperties.commitField()
      expect(await ObjectProperties.errorFor('length')).toBe(GEOMETRY_MSG.required)
    })

    it('a non-numeric value is rejected as invalid', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', 'abc')
      expect((await ObjectProperties.fieldState('length')).invalid).toBe(true)
    })

    it('a decimal in an INTEGER field is invalid even when in range', async () => {
      // Differential: the range check runs BEFORE the datatype check, so an
      // in-range non-integer must still be rejected — by the datatype rule, not
      // the range rule.
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('resolution_x', '5.5')
      // Do NOT blur here: handleFieldBlur rewrites an integer field, which would
      // clear the exact state under test.
      const state = await ObjectProperties.fieldState('resolution_x')
      expect(`resolution_x invalid=${state.invalid}`).toBe('resolution_x invalid=true')
    })
  })

  describe('ground properties — boundary values (inclusive)', () => {
    // DEVIATION: the manual spec says size and tiles must be "strictly greater
    // than 1". Every catalog bound is INCLUSIVE, and none of them is 1.
    const accepted: [Parameters<typeof ObjectProperties.fieldState>[0], string][] = [
      ['length', String(GROUND_BOUNDS.length.min)], // 0.01
      ['breadth', String(GROUND_BOUNDS.breadth.min)],
      ['resolution_x', String(GROUND_BOUNDS.resolution_x.min)], // 1
      ['rotation_z', String(GROUND_BOUNDS.rotation_z.min)], // 0
      ['rotation_z', String(GROUND_BOUNDS.rotation_z.max)], // 360
      ['texture_x', String(GROUND_BOUNDS.texture_x.min)], // 1
      ['position_x', '-1000'], // negatives are legal here
      // position_* had no BOUNDARY case — only an interior negative. These are
      // the actual catalog limits, and they are inclusive at both ends.
      ['position_x', String(GROUND_BOUNDS.position_x.min)], // -1000000
      ['position_x', String(GROUND_BOUNDS.position_x.max)], // 1000000
      ['position_y', String(GROUND_BOUNDS.position_y.min)],
      ['position_z', String(GROUND_BOUNDS.position_z.max)]
    ]

    for (const [prop, value] of accepted) {
      it(`${prop} accepts its boundary value ${value}`, async () => {
        await track()
        await ObjectProperties.waitForOpen()
        await ObjectProperties.setField(prop, value)
        const state = await ObjectProperties.fieldState(prop)
        expect(`${prop}=${value} invalid=${state.invalid}`).toBe(`${prop}=${value} invalid=false`)
      })
    }

    it('the maximum resolution validates as IN-RANGE but is never saved', async () => {
      // SAFETY: 25000x25000 is a legal value, but saving it would make the
      // always-mounted 3D window fetch a multi-GB mesh with no timeout and wedge
      // the runner. Assert the validation state ONLY — never press Save here.
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('resolution_x', String(GROUND_BOUNDS.resolution_x.max))
      expect((await ObjectProperties.fieldState('resolution_x')).invalid).toBe(false)
    })
  })

  describe('ground properties — validation COPY (the message, not just the flag)', () => {
    // Everything above asserts the EFFECT of validation — aria-invalid, or that
    // some error exists. Nothing asserted the WORDING, which is why
    // GEOMETRY_MSG.valuesBetween, .invalidInput, .decimalLimit and
    // .inputNotSupported had no consumer despite being mirrored from the app.
    //
    // validateFieldValue's branch order is what these pin (propertyBlueprint.ts):
    //   empty + required -> "Required Field"
    //   not finite       -> "Invalid Input"
    //   out of range     -> the range message, built from the CATALOG bounds
    //   integer + non-integer -> "Invalid Input"
    // The range check running BEFORE the datatype check is the load-bearing
    // part: an out-of-range non-integer keeps the range copy, and only an
    // IN-range non-integer falls through to "Invalid Input".
    //
    // Bounds come from GROUND_BOUNDS, mirrored from the live catalog. A backend
    // migration that moves a bound moves the message with it and turns these
    // red — which is the point: the copy is generated from the numbers the app
    // was actually served.
    const ranged: [Parameters<typeof ObjectProperties.fieldState>[0], string, number, number][] = [
      ['length', '0.001', GROUND_BOUNDS.length.min, GROUND_BOUNDS.length.max],
      ['breadth', '0.001', GROUND_BOUNDS.breadth.min, GROUND_BOUNDS.breadth.max],
      ['resolution_x', '0', GROUND_BOUNDS.resolution_x.min, GROUND_BOUNDS.resolution_x.max],
      ['rotation_z', '-1', GROUND_BOUNDS.rotation_z.min, GROUND_BOUNDS.rotation_z.max],
      [
        'resolution_y',
        String(GROUND_BOUNDS.resolution_y.max + 1),
        GROUND_BOUNDS.resolution_y.min,
        GROUND_BOUNDS.resolution_y.max
      ],
      ['rotation_z', '361', GROUND_BOUNDS.rotation_z.min, GROUND_BOUNDS.rotation_z.max]
    ]

    for (const [prop, value, min, max] of ranged) {
      it(`${prop} = ${value} reports the catalog range, not a generic error`, async () => {
        await track()
        await ObjectProperties.waitForOpen()
        await ObjectProperties.setField(prop, value)
        expect(await ObjectProperties.errorFor(prop)).toBe(GEOMETRY_MSG.valuesBetween(min, max))
      })
    }

    // ── The guard PRE-EMPTS validateFieldValue ─────────────────────────────
    // These two started life asserting "Invalid Input" and were corrected by the
    // run. validateFieldValue does have an invalidInput branch for a non-finite
    // value and for a non-integer in an integer field — but neither is reachable
    // by putting such a value in the box, because handleFieldChange runs FIRST
    // and returns without storing it:
    //   !isPartialNumericInput('abc')                    -> inputNotSupported
    //   isInteger && adds a '.' the field does not have  -> inputNotSupported
    // A native-setter write does NOT skip this. setField dispatches an `input`
    // event, React's onChange is handleFieldChange, and the guard tests the whole
    // incoming value — what setField skips is per-CHARACTER delivery, not the
    // guard itself.
    //
    // GEOMETRY_MSG.invalidInput IS reachable — this comment used to say it might
    // be dead, and that was wrong. The route is an INCOMPLETE EXPONENT: "1e"
    // passes isPartialNumericInput (the guard must admit it, or an error would
    // flash on the 'e' of a perfectly good "1e3"), expandForDisplay leaves it
    // alone because it is not a complete number, and so it survives the blur as
    // a value Number() reads as NaN — which validateFieldValue reports as
    // "Invalid Input". It is the ONLY route: every other candidate is refused by
    // handleFieldChange first and reports inputNotSupported instead.
    // Covered in e2e/tests/ground.test.ts, describe('an incomplete exponent').

    it('a non-numeric value is refused by the GUARD, before validation sees it', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', 'abc')
      expect(await ObjectProperties.errorFor('length')).toBe(GEOMETRY_MSG.inputNotSupported)
      // The guard returns without storing, so the field keeps its previous value.
      expect((await ObjectProperties.fieldState('length')).value).not.toContain('a')
    })

    it('a decimal offered to an INTEGER field is refused by the GUARD', async () => {
      // 5.5 is inside 1–25000, so this is not a range rejection — it is the '.'
      // keystroke being refused outright, which is why "Invalid Input" (the
      // datatype branch) never appears. Do NOT blur: handleFieldBlur drops the
      // guard error and hands back to committed-value validation.
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('resolution_x', '5.5')
      expect(await ObjectProperties.errorFor('resolution_x')).toBe(GEOMETRY_MSG.inputNotSupported)
      expect((await ObjectProperties.fieldState('resolution_x')).invalid).toBe(true)
    })
  })

  describe('ground properties — keystroke guards (negative)', () => {
    it('letters typed into a numeric field are REJECTED, leaving the value intact', async () => {
      // Differential: the guard rejects the incoming value rather than accepting
      // and flagging it, so the field keeps its previous content. This must be
      // typed — a native-setter write bypasses the guard entirely.
      await track()
      await ObjectProperties.waitForOpen()
      const before = (await ObjectProperties.fieldState('length')).value
      await ObjectProperties.typeField('length', 'abc')
      const after = (await ObjectProperties.fieldState('length')).value
      expect(after).not.toContain('a')
      expect(after === '' || after === before).toBe(true)
    })

    it('a rejected letter surfaces "This input is not supported"', async () => {
      // The guard's own copy, which nothing asserted. Read WITHOUT blurring:
      // handleFieldBlur drops guardErrors and hands over to committed-value
      // validation, so a blur here would replace the message under test with
      // whatever the (unchanged, still valid) value validates to — i.e. null.
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.typeField('length', 'abc')
      expect(await ObjectProperties.errorFor('length')).toBe(GEOMETRY_MSG.inputNotSupported)
    })

    it('the 8th decimal surfaces "Only 7 Decimal places are supported"', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.typeField('length', GEOMETRY_LIMITS.decimals8)
      expect(await ObjectProperties.errorFor('length')).toBe(GEOMETRY_MSG.decimalLimit)
    })

    it('more than 7 decimal places is refused at the 8th character', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.typeField('length', GEOMETRY_LIMITS.decimals8)
      // The 8th decimal never lands, so the field holds the 7-decimal prefix.
      expect((await ObjectProperties.fieldState('length')).value).toBe(GEOMETRY_LIMITS.decimals7)
    })

    it('exactly 7 decimal places is accepted', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.typeField('length', GEOMETRY_LIMITS.decimals7)
      const state = await ObjectProperties.fieldState('length')
      expect(state.value).toBe(GEOMETRY_LIMITS.decimals7)
      expect(state.invalid).toBe(false)
    })
  })

  describe('ground properties — save gating', () => {
    it('Save is DISABLED on a freshly opened form (nothing is dirty)', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      expect(await ObjectProperties.saveEnabled()).toBe(false)
    })

    it('Save becomes enabled once a field changes', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', '12')
      await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled after an edit'
      })
    })

    it('Save stays DISABLED while any field is invalid', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', '-5')
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)
    })

    it('reverting an edit back to the baseline disables Save again', async () => {
      // Differential: `dirty` is a comparison against the loaded baseline, not a
      // one-way "was touched" flag.
      await track()
      await ObjectProperties.waitForOpen()
      const original = (await ObjectProperties.fieldState('length')).value
      await ObjectProperties.setField('length', '12')
      await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled after the first edit'
      })
      await ObjectProperties.setField('length', original)
      await browser.waitUntil(async () => !(await ObjectProperties.saveEnabled()), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save stayed enabled after reverting to the baseline'
      })
    })
  })

  describe('ground properties — save round-trip', () => {
    it('Save PATCHes the edit, confirms by toast, and rebuilds the 3D mesh', async () => {
      const id = await track()
      await ObjectProperties.waitForOpen()
      await recordMeshFetches()
      await drainToasts()

      await ObjectProperties.setField('length', '12')
      await ObjectProperties.setField('breadth', '14')
      await ObjectProperties.save()

      await waitForToast(GEOMETRY_TOAST.saved)
      // A resized ground is a different tile, so the viewport must fetch again.
      const call = await waitForMeshFetch(id)
      expect(call.bytes).toBeGreaterThan(0)
    })

    it('a saved edit survives reselecting the geometry', async () => {
      const id = await track()
      const other = await track()
      // + Ground opens the NEW ground's form, so the panel is showing `other`
      // right now. Select the one under test before editing, or the edit lands
      // on the wrong object and the reload assertion fails for the wrong reason.
      await Geometry.selectRow(id)
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', '17')
      await ObjectProperties.save()

      // Move away and back — this refetches the object rather than reading the
      // in-memory draft.
      await Geometry.selectRow(other)
      await Geometry.selectRow(id)
      await ObjectProperties.waitForOpen()
      await browser.waitUntil(
        async () => Number((await ObjectProperties.fieldState('length')).value) === 17,
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the saved length did not reload' }
      )
    })
  })

  describe('ground properties — texture repeat divisor rule', () => {
    it('a repeat that does not DIVIDE the resolution is snapped on commit', async () => {
      // The valid set for texture_x is the divisors of resolution_x, so with a
      // resolution of 4 a repeat of 3 is invalid and snaps down to 2.
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('resolution_x', '4')
      await ObjectProperties.commitField()
      await ObjectProperties.setField('texture_x', '3')
      // commitRepeat runs on blur / Enter only — never per keystroke.
      await ObjectProperties.commitField()
      await browser.waitUntil(
        async () => {
          const v = (await ObjectProperties.fieldState('texture_x')).value
          return v !== '3' && v !== ''
        },
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'the texture repeat was never snapped' }
      )
      const snapped = Number((await ObjectProperties.fieldState('texture_x')).value)
      expect(4 % snapped).toBe(0)
    })

    it('a repeat that exceeds the resolution is flagged and blocks Save', async () => {
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('resolution_x', '2')
      await ObjectProperties.setField('texture_x', '8')
      expect(await staysFalse(async () => ObjectProperties.saveEnabled())).toBe(true)
    })
  })

  describe('ground properties — name field (negative)', () => {
    it('an empty name does NOT disable Save', async () => {
      // DEVIATION: the manual spec says an empty name disables Save. It gates
      // the RENAME COMMIT only — canSave never consults nameError.
      await track()
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', '13')
      await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled after an edit'
      })
      await ObjectProperties.nameInput.click()
      await browser.execute(() => {
        const n = document.querySelector('[data-testid="object-name"]') as HTMLInputElement | null
        if (!n) return
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set
        setter?.call(n, '')
        n.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(await ObjectProperties.saveEnabled()).toBe(true)
    })
  })

  // ══ Grouping (drag and drop) ═════════════════════════════════════════════

  describe('grouping', () => {
    /**
     * Grouping is drag-ONLY: there is no button for it. A drop must land in the
     * middle 40% of the target row ('into'); the top and bottom 30% are reorder
     * bands. See e2e/support/dnd.ts for why the events are synthetic and why
     * dragover and drop are separate commands.
     *
     * Ungrouping — dragging a member onto the empty tree area — is covered by the
     * nested 'ungrouping' describe below, and its persistence at the end of the
     * file.
     */

    before(async () => {
      await pushGroundIdsPastGroupIds()
    })

    /**
     * Poll for a scope-loss ("go to Home") dialog. Returns its text if one
     * appears within `ms`, else null. Deliberately reports the TEXT so a
     * failure names what the user would have been shown.
     */
    const scopeDialogWithin = async (ms: number): Promise<string | null> => {
      // Pinned to the real copy (ProjectBoot/messages.ts scopeLost):
      //   title  'Project unavailable'   button 'Go to Home'
      //   body   'This {project|scenario} no longer exists. ...'
      // ScopeLostDialog renders <Dialog title={...}>, and Dialog puts the title
      // in aria-label — so the dialog is addressable directly rather than by
      // sniffing body text.
      const deadline = Date.now() + ms
      while (Date.now() < deadline) {
        const dlg = await $('dialog[aria-label="Project unavailable"][open]')
        if (await dlg.isExisting()) {
          const text = await dlg.getText().catch(() => '')
          return text.replace(/\s+/g, ' ').trim() || 'Project unavailable'
        }
        await browser.pause(250)
      }
      return null
    }

    /** Create a group from two fresh grounds and return [groupId, a, b]. */
    const makeGroup = async (): Promise<[string, string, string]> => {
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
        {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'dropping one ground onto another did not create a group'
        }
      )
      // The group itself is a backend row; register it for cleanup FIRST so it
      // is deleted before its members (deleting a member can dissolve it).
      created.unshift(groupId)
      return [groupId, a, b]
    }

    it('dropping one ground onto another creates a group containing both', async () => {
      const [groupId, a, b] = await makeGroup()
      const group = await Geometry.rowState(groupId)
      expect(group?.isGroup).toBe(true)
      expect(group?.name).toMatch(/^Group\.\d{3}$/)
      const childIds = (await Geometry.childrenOf(groupId)).map((c) => c.id)
      expect(childIds).toContain(a)
      expect(childIds).toContain(b)
    })

    it('a new group opens EXPANDED with its members indented', async () => {
      const [groupId] = await makeGroup()
      expect((await Geometry.rowState(groupId))?.expanded).toBe(true)
      const children = await Geometry.childrenOf(groupId)
      expect(children.length).toBe(2)
      expect(children.every((c) => c.depth === 1)).toBe(true)
    })

    it('the group chevron collapses and re-expands its members', async () => {
      const [groupId] = await makeGroup()
      await Geometry.toggleGroup(groupId)
      expect((await Geometry.rowState(groupId))?.expanded).toBe(false)
      // Collapsed members are not rendered at all — unlike the panel, the tree
      // really does drop them from the DOM.
      expect((await Geometry.childrenOf(groupId)).length).toBe(0)
      await Geometry.toggleGroup(groupId)
      expect((await Geometry.childrenOf(groupId)).length).toBe(2)
    })

    it('dropping a third ground onto the group adds it as a member', async () => {
      const [groupId] = await makeGroup()
      const third = await track()
      await dragRowOnto([third], groupId, 'into')
      await browser.waitUntil(
        async () => (await Geometry.childrenOf(groupId)).length === 3,
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the third ground never joined the group' }
      )
      expect((await Geometry.childrenOf(groupId)).map((c) => c.id)).toContain(third)
    })

    it('dropping onto a ground ALREADY in a group makes a sibling, not a nested group', async () => {
      // Differential: groups do not nest. A drop onto a member must resolve to
      // "join that member's group", never "create a group inside a group".
      const [groupId, a] = await makeGroup()
      const third = await track()
      await dragRowOnto([third], a, 'into')
      await browser.waitUntil(
        async () => (await Geometry.childrenOf(groupId)).length === 3,
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the drop did not join the existing group' }
      )
      expect((await Geometry.groups()).length).toBe(1)
      expect((await Geometry.childrenOf(groupId)).every((c) => c.depth === 1)).toBe(true)
    })

    it('a group name continues the Group.NNN sequence', async () => {
      const [firstGroup] = await makeGroup()
      const [secondGroup] = await makeGroup()
      const n = (s: string): number => Number(s.split('.')[1])
      const a = await nameOf(firstGroup)
      const b = await nameOf(secondGroup)
      expect(n(b)).toBeGreaterThan(n(a))
    })

    it('a group can be renamed, and duplicate group names are rejected', async () => {
      const [g1] = await makeGroup()
      const [g2] = await makeGroup()
      await renameAndSettle(g1, 'ZoneOne')
      await Geometry.renameRow(g2, 'ZONEONE', 'enter')
      // GROUP namespace -> groupNameExists, not the geometry string. Both exist
      // and differ by one word, so asserting the wrong one still "looks" right.
      expect(await Geometry.renameError(g2)).toBe(GEOMETRY_MSG.groupNameExists)
      await browser.keys(['Escape'])
    })

    it('a drag payload carries just the dragged row when nothing else is selected', async () => {
      // Covers handleDragStart itself, which the drop helpers bypass by
      // synthesising the payload.
      const id = await track()
      expect(await readDragPayload(id)).toEqual([id])
    })

    it('deleting a member and dissolving its group keeps you in the project', async () => {
      // Guards the scope-loss path. utils/scopeError.ts turns ANY 404 whose url
      // carries the active project and scenario ids into a blocking
      // "Project unavailable — Go to Home" dialog that discards the open draft.
      // Every geometry call is scoped by those ids, so a single wrong url in
      // this feature presents to the user as "your project is gone".
      // Differential: point deleteGroup or the dissolve cleanup at a route the
      // backend does not serve and this goes red.
      const [, a] = await makeGroup()
      await Geometry.deleteRow(a)
      created = created.filter((x) => x !== a)
      // cleanupDissolvedGroups runs AFTER the member delete succeeds, so give
      // the bad request time to come back and the dialog time to mount.
      // NEGATIVE_GATE, not LONG. This was widened to 20s while chasing a
      // suspected scope-loss bug that turned out not to exist. The delete has
      // already completed by the time we look, so a dialog raised by it would
      // be on screen within a second — two 20s waits were 40s of the run spent
      // watching nothing happen.
      const stray = await scopeDialogWithin(TIMEOUTS.NEGATIVE_GATE)
      expect(stray ?? 'no scope dialog').toBe('no scope dialog')
      await expect(Geometry.panel).toBeDisplayed()
    })

    it('deleting a whole group keeps you in the project', async () => {
      // Same guard for the direct path: TreeRow's trash on a GROUP row routes to
      // service.deleteGroup (saga.ts deleteNodeWorker branches on kind), which is
      // a different url from the leaf delete and therefore a separate risk.
      const [groupId, a, b] = await makeGroup()
      // NO .catch. It used to swallow every failure here, and it was a false pass
      // in the exact case this test exists for: a bad group url 404s, scopeError
      // raises "Project unavailable", the row stays, deleteRow times out — and its
      // old cleanup force-closed EVERY dialog, the scope-loss one included, before
      // the poll below could see it. Nothing checked the group was gone either, so
      // a delete that did nothing passed too.
      //
      // deleteRow now throws when the row never leaves, and its cleanup closes
      // only the Delete confirmation, naming any other open dialog in the error.
      await Geometry.deleteRow(groupId)
      // Read the scope dialog FIRST, before anything in this test or afterEach can
      // close dialogs.
      // NEGATIVE_GATE, not LONG. This was widened to 20s while chasing a
      // suspected scope-loss bug that turned out not to exist. The delete has
      // already completed by the time we look, so a dialog raised by it would
      // be on screen within a second — two 20s waits were 40s of the run spent
      // watching nothing happen.
      const stray = await scopeDialogWithin(TIMEOUTS.NEGATIVE_GATE)
      expect(stray ?? 'no scope dialog').toBe('no scope dialog')
      created = created.filter((x) => x !== groupId)
      // The group AND its members are gone. A group DELETE takes its members with
      // it: saga.ts deleteNodeWorker routes a group to service.deleteGroup, and
      // DELETE_NODE_SUCCEEDED removes `[id, ...childIds]`. The members stay in
      // `created`, so if either survived, afterEach still deletes it — and the
      // leak check there looks at them rather than past them.
      expect(await Geometry.rowState(groupId)).toBeUndefined()
      expect(await Geometry.rowState(a)).toBeUndefined()
      expect(await Geometry.rowState(b)).toBeUndefined()
      await expect(Geometry.panel).toBeDisplayed()
    })

    describe('ungrouping — drag a member onto the empty tree area', () => {
      /**
       * The persisted ungroup gesture: GeometryTree.handleRootDrop PATCHes the
       * dropped ground's group_id to null. A group left with fewer than two
       * members DISSOLVES (reducer dissolveUndersizedGroups, mirrored on the
       * backend by saga cleanupDissolvedGroups) and its lone leftover is ejected
       * to the top level. Group rows are not draggable (TreeRow
       * draggable={!isGroup}), so there is no "drag a whole group out" case.
       *
       * dragRowsToTreeBackground drops at the real point below the last row and
       * throws if that point is not tree background — it cannot ungroup through
       * a gesture no user could make.
       */

      /** A group of three: makeGroup's two plus a third dropped into it. */
      const makeGroupOfThree = async (): Promise<[string, string, string, string]> => {
        const [groupId, a, b] = await makeGroup()
        const c = await track()
        await dragRowOnto([c], groupId, 'into')
        await browser.waitUntil(async () => (await Geometry.childrenOf(groupId)).length === 3, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the third ground never joined the group'
        })
        return [groupId, a, b, c]
      }

      const waitForTopLevel = async (id: string): Promise<void> => {
        await browser.waitUntil(async () => (await Geometry.rowState(id))?.depth === 0, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: `ground ${id} never came back out to the top level`
        })
      }

      // The empty area is SMALL. With all three sections open, four rows already
      // fill the tree (measured 15 Sep 2026: 2px left at 4 rows, -32px at 5). So
      // these tests do what a user would — close Materials and Models to give the
      // tree room. The shared afterEach reopens them (LeftPanel.resetToDefault).
      beforeEach(async () => {
        await LeftPanel.setSection('materials', false)
        await LeftPanel.setSection('models', false)
      })

      it('the tree leaves EMPTY space below its rows — somewhere to drop to ungroup', async () => {
        // The precondition for the whole gesture. If the rows filled the tree
        // box, a user would have no background to drop on however the handler
        // is written.
        await makeGroup()
        expect(await treeBackgroundGap()).toBeGreaterThanOrEqual(8)
      })

      it('once the rows FILL the tree there is NO empty area left — the ungroup drop is unreachable', async () => {
        // PRODUCT FINDING (15 Sep 2026), and the likeliest reason ungrouping was
        // reported as "not working": the only ungroup target is the space BELOW
        // the last row, and the tree scrolls rather than growing. With every
        // section open a handful of grounds leaves none, so a user cannot drag a
        // member out of its group at all.
        await LeftPanel.setSection('materials', true)
        await LeftPanel.setSection('models', true)
        const [, a] = await makeGroup()
        // THIS TEST IS FRAGILE IN THE OPPOSITE DIRECTION TO ITS SIBLINGS. They
        // need the tree to have room; this one needs it FULL, so a taller window
        // breaks it — the loop runs out at 12 and the gap is still >= 8.
        //
        // That is now bounded rather than hoped for: wdio.config.ts pins
        // HELIOS_E2E_VIEWPORT, and at that size this fills after 3 of the 12
        // allowed rows (measured 16 Sep 2026, ending at a 0px gap). Nine rows of
        // slack. If this ever fails, the pin grew — do NOT just raise the 12.
        for (let i = 0; i < 12 && (await treeBackgroundGap()) >= 8; i++) await track()
        expect(await treeBackgroundGap()).toBeLessThan(8)
        await expect(dragRowsToTreeBackground([a])).rejects.toThrow(/no empty tree area/)
      })

      it('dropping a member of a THREE-ground group on the empty area takes it out; the group keeps the other two', async () => {
        const [groupId, a, b, c] = await makeGroupOfThree()
        await dragRowsToTreeBackground([a])
        await browser.waitUntil(async () => (await Geometry.childrenOf(groupId)).length === 2, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the dropped ground never left its group'
        })
        await waitForTopLevel(a)
        expect((await Geometry.rowState(groupId))?.isGroup).toBe(true)
        expect((await Geometry.childrenOf(groupId)).map((r) => r.id).sort()).toEqual([b, c].sort())
      })

      it('the ground taken out lands RIGHT AFTER its former group, not at the bottom of the tree', async () => {
        // Differential: a ground created afterwards sits below the group, so an
        // ungroup that merely appended to the root would land after IT instead.
        const [groupId, a] = await makeGroupOfThree()
        const tail = await track()
        await dragRowsToTreeBackground([a])
        await waitForTopLevel(a)
        const order = (await Geometry.snapshot()).map((r) => r.id)
        const members = (await Geometry.childrenOf(groupId)).map((r) => r.id)
        const lastMember = members[members.length - 1]
        expect(order.indexOf(a)).toBe(order.indexOf(lastMember) + 1)
        expect(order.indexOf(tail)).toBe(order.indexOf(a) + 1)
      })

      it('taking one ground out of a TWO-ground group DISSOLVES the group — both come back to the top level', async () => {
        const [groupId, a, b] = await makeGroup()
        await dragRowsToTreeBackground([a])
        await browser.waitUntil(async () => (await Geometry.rowState(groupId)) === undefined, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'a group left with one member was not dissolved'
        })
        created = created.filter((x) => x !== groupId)
        expect(await Geometry.groups()).toEqual([])
        expect((await Geometry.rowState(a))?.depth).toBe(0)
        expect((await Geometry.rowState(b))?.depth).toBe(0)
        // The dissolve issues a second PATCH and a group DELETE after the move;
        // a wrong url in either raises the scope-loss dialog.
        const stray = await scopeDialogWithin(TIMEOUTS.NEGATIVE_GATE)
        expect(stray ?? 'no scope dialog').toBe('no scope dialog')
      })

      it('dropping a ground that is NOT in a group on the empty area moves it to the BOTTOM — and makes no group', async () => {
        // Measured 15 Sep 2026. The drop still runs the ungroup path:
        // MOVE_NODES_SUCCEEDED detaches the row from the top level and, having
        // no former group to sit next to, appends it at the end. Order is
        // client-only, so the only lasting effect is a no-op group_id PATCH.
        const a = await track()
        const b = await track()
        const shape = async (): Promise<string[]> =>
          (await Geometry.snapshot()).map((r) => `${r.id}:${r.depth}:${r.isGroup}`)
        expect(await shape()).toEqual([`${a}:0:false`, `${b}:0:false`])
        await dragRowsToTreeBackground([a])
        await browser.waitUntil(async () => (await shape())[1] === `${a}:0:false`, {
          timeout: TIMEOUTS.MUTATION,
          timeoutMsg: 'the dropped ground never moved to the bottom of the tree'
        })
        expect(await shape()).toEqual([`${b}:0:false`, `${a}:0:false`])
        const stray = await scopeDialogWithin(TIMEOUTS.NEGATIVE_GATE)
        expect(stray ?? 'no scope dialog').toBe('no scope dialog')
      })

      it('an EDGE drop onto a top-level row also takes a member out of its group', async () => {
        // The second route out: TreeRow's before/after bands dispatch
        // REORDER_NODES, and a target at the top level reparents the dragged
        // member there. Client-only — see the persistence test for what the
        // backend keeps.
        const [groupId, a] = await makeGroupOfThree()
        const tail = await track()
        await dragRowOnto([a], tail, 'after')
        await waitForTopLevel(a)
        // Cleanup runs newest-first, so move `a` to the END to delete it FIRST.
        // The backend still has it in the group; deleted after its group
        // dissolved, it cannot be removed (measured: "row still present after
        // confirming delete") and the leak fails the shared afterEach.
        created = [...created.filter((x) => x !== a), a]
        expect((await Geometry.childrenOf(groupId)).map((r) => r.id)).not.toContain(a)
        const order = (await Geometry.snapshot()).map((r) => r.id)
        expect(order.indexOf(a)).toBe(order.indexOf(tail) + 1)
      })
    })
  })

  // ══ Failure paths ════════════════════════════════════════════════════════

  describe('backend failures', () => {
    /**
     * Faults are injected by rewriting the request URL to a dead port, which
     * yields a REAL connection failure (status 0) and drives the saga's real
     * error branch. See e2e/support/faults.ts — in particular why fetch is the
     * wrong hook here, and why status 0 is safe (only a 404 raises the
     * scope-loss dialog).
     */

    afterEach(async () => {
      await clearApiFaults()
      await clearApiLatency()
    })

    /**
     * Failure toasts, mirrored from store/toastMessages.ts (trap 18: never from
     * Geometry/messages.ts). GEOMETRY_TOAST carries only createFailed of these.
     *  - groundDeleteFailed — saga.ts deleteNodeWorker's catch, named from the
     *    node read BEFORE the call.
     *  - changesSaveFailed — updateObjectWorker's catch. The `Because` variant
     *    appends a reason only when the error carries a backend `code`; an
     *    injected fault is a status-0 connection failure with none, so the
     *    unqualified string is the one shown.
     */
    const GROUND_DELETE_FAILED = (name: string): string => `Ground "${name}" could not be deleted.`
    const CHANGES_SAVE_FAILED = 'Changes could not be saved'

    it('a failed create leaves NO row behind and raises the failure toast', async () => {
      const before = await Geometry.rowCount()
      await drainToasts()
      await withApiFault('POST', '/scenario/', async () => {
        await Geometry.addGroundButton.click()
        await waitForToast(GEOMETRY_TOAST.createFailed)
      })
      expect(await Geometry.rowCount()).toBe(before)
    })

    it('a failed delete KEEPS the row (delete is pessimistic)', async () => {
      // Differential: an optimistic delete would remove the row locally and only
      // put it back on failure — a flicker users notice and a state that can
      // desync. The row must never move until the server confirms.
      //
      // Driven step by step rather than through deleteRow, for two reasons.
      // deleteRow waits for the row to LEAVE, so here it always burned the full
      // 60s MUTATION budget and then threw — and the `.catch` that absorbed that
      // throw absorbed every other one too. A renamed trash ("no control
      // Delete") or a confirmation that never opened sent no DELETE at all, the
      // row was trivially still there, and the test passed. Each step below
      // throws on its own, so a missing trash or dialog now FAILS.
      const id = await track()
      const name = await nameOf(id)
      await drainToasts()
      await withApiFault('DELETE', '/objects/', async () => {
        await Geometry.openDeleteConfirm(id)
        await Geometry.deleteDialog.$('button=Delete').click()
        // TreeRow.confirmDelete dispatches and closes the confirmation in the
        // same handler — the dialog does not wait for the server.
        await waitForNoOpenDialog()
        // The failure is OBSERVED, not assumed: this toast is raised only in
        // deleteNodeWorker's catch, after DELETE_NODE_FAILED. It is the whole
        // report — the Geometry slice has no delete error field. Kept inside the
        // fault so the fault cannot be lifted before the DELETE has failed.
        await waitForToast(GROUND_DELETE_FAILED(name), TIMEOUTS.LONG)
      })
      // The failure has landed, so what follows is about the settled state, not
      // a race with an in-flight request.
      expect(await Geometry.rowState(id)).toBeDefined()
      expect(
        await staysFalse(async () => (await Geometry.rowState(id)) === undefined)
      ).toBe(true)
      // DELETE_NODE_FAILED releases the in-flight mark, so the trash (disabled
      // while `deleting`) comes back and the user can retry. A failure that left
      // the mark set would strand a row nobody can delete.
      await browser.waitUntil(async () => (await Geometry.deleteEnabled(id)) === true, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'the row trash stayed disabled after the DELETE failed — the in-flight mark was never released'
      })
      expect(await countOpenDialogs()).toBe(0)
    })

    it('a failed visibility PATCH REVERTS the eye to its previous state', async () => {
      // Differential: the toggle is applied optimistically for responsiveness,
      // so the revert is the only thing keeping the icon honest about what the
      // server actually stored.
      const id = await track()
      expect((await Geometry.rowState(id))?.viewportHidden).toBe(false)
      await withApiFault('PATCH', '/objects/', async () => {
        await Geometry.clickEye(id)
        await browser.waitUntil(
          async () => (await Geometry.rowState(id))?.viewportHidden === false,
          {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: 'the eye stayed flipped after the PATCH failed — the optimistic update never reverted'
          }
        )
      })
    })

    it('a failed rename does not change the displayed name', async () => {
      const id = await track()
      const before = await nameOf(id)
      await withApiFault('PATCH', '/rename', async () => {
        await Geometry.renameRow(id, 'NeverLands', 'enter')
        expect(
          await staysFalse(async () => (await Geometry.rowState(id))?.name === 'NeverLands')
        ).toBe(true)
      })
      await browser.keys(['Escape'])
      expect(await nameOf(id)).toBe(before)
    })

    it('a failed tree load shows the error state with a Retry control', async () => {
      // The tree only loads on scenario change, so the fault has to be armed
      // before entering a project.
      await reloadToHome()
      await installApiFault('GET', '/objects')
      await enterProject('loadfail')
      await Geometry.treeError.waitForDisplayed({
        timeout: TIMEOUTS.LONG,
        timeoutMsg: 'the tree never rendered its error state after a failed load'
      })
      await expect(Geometry.treeRetry).toBeDisplayed()
    })

    it('Retry recovers the tree once the backend is reachable again', async () => {
      await reloadToHome()
      await installApiFault('GET', '/objects')
      await enterProject('retryok')
      await Geometry.treeError.waitForDisplayed({ timeout: TIMEOUTS.LONG })
      await clearApiFaults()
      await Geometry.treeRetry.click()
      await Geometry.treeEmpty.waitForDisplayed({
        timeout: TIMEOUTS.LONG,
        timeoutMsg: 'Retry did not reload the tree after the fault was cleared'
      })
    })

    it('a failed save surfaces an error and leaves Save available to retry', async () => {
      // This used to assert NO error. Its only wait was "Save is enabled" — and
      // Save is ALREADY enabled once the edit is dirty and valid
      // (`disabled={draft.saving || !dirty || !valid}`), so the first poll could
      // pass before React committed `saving`, or when the click did nothing.
      const SAVE_LABEL = 'Save'
      const SAVING_LABEL = 'Saving…'
      // Element commands, not execute — trap 11, same reasoning as
      // large-ground.test.ts formError(). `.form-error-text` has two render sites
      // in this form and the other is gated on objectDeleted, so it is
      // unambiguous.
      const saveLabel = async (): Promise<string> =>
        ((await ObjectProperties.saveButton.getText()) as string).trim()
      const formError = async (): Promise<string | null> => {
        const el = $('[data-testid="object-properties-form"] .form-error-text')
        return (await el.isExisting()) ? ((await el.getText()) as string).trim() : null
      }
      // How long the PATCH is HELD before it is sent (and then fails). A refused
      // connection can come back in milliseconds, which leaves "Saving…" on
      // screen for less than one WebDriver poll. Holding the request is the only
      // way to observe the in-flight state at all — see faults.ts on latency; the
      // latency and fault patches compose. 2s is still far inside the budgets.
      const SAVE_HOLD_MS = 2_000

      const id = await track()
      await Geometry.selectRow(id)
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', '19')
      // Preconditions, so the observations below are about THIS save.
      expect(await ObjectProperties.saveEnabled()).toBe(true)
      expect(await formError()).toBe(null)
      await drainToasts()

      await withApiLatency('PATCH', '/objects/', SAVE_HOLD_MS, () =>
        withApiFault('PATCH', '/objects/', async () => {
          await ObjectProperties.saveButton.click()
          // 1. The save STARTED: label flips and the button locks. Proves the
          //    click dispatched a save rather than doing nothing.
          await browser.waitUntil(
            async () =>
              (await saveLabel()) === SAVING_LABEL && !(await ObjectProperties.saveEnabled()),
            {
              timeout: TIMEOUTS.MEDIUM,
              interval: 100,
              timeoutMsg: 'Save never showed "Saving…" — the click did not start a save'
            }
          )
          // 2. The save ENDED. UPDATE_OBJECT_FAILED clears `saving` and sets
          //    `saveError` in one reducer case.
          await browser.waitUntil(async () => (await saveLabel()) === SAVE_LABEL, {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: 'Save stayed "Saving…" — the failed PATCH never settled'
          })
          // The saga raises the toast straight after that put, so it is on
          // screen now and must be the NEXT read (it lives ~2.5s).
          await waitForToast(CHANGES_SAVE_FAILED)
        })
      )

      // 3. The error the user is shown on the form. updateObjectWorker passes
      //    `err.message` to updateObjectFailed; for a request with no response
      //    utils/api.ts toApiError keeps axios's message, and axios's XHR adapter
      //    names a connection failure 'Network Error' (lib/adapters/xhr.js).
      expect(await formError()).toBe('Network Error')
      // The edit is still dirty, so Save must come back enabled rather than
      // latching disabled and stranding the user's change.
      expect(await ObjectProperties.saveEnabled()).toBe(true)
      expect(await saveLabel()).toBe(SAVE_LABEL)
    })
  })

  // ══ Persistence and project isolation ════════════════════════════════════

  describe('persistence and project isolation', () => {
    /**
     * These tests provision their OWN projects and deliberately do NOT use
     * track(). They navigate away from the file's shared project, so the shared
     * afterEach could not reach their rows anyway — and because `created` stays
     * empty, that cleanup becomes a no-op rather than trying to delete ids that
     * do not exist in whichever project is currently open.
     *
     * Rows are simply left behind: every launch gets a throwaway profile with a
     * fresh backend DB, and projects are cheap. They run LAST in the file so
     * they cannot leave an earlier test looking at the wrong project.
     */

    // Ids are database-wide, so pushing them past the group ids here (still in
    // the shared project) covers the grouping tests in every fresh project below.
    before(async () => {
      await pushGroundIdsPastGroupIds()
    })

    /**
     * Create a project from a clean Home.
     *
     * enterProject drives the Home sidebar, so it can only run FROM Home. The
     * rest of this file never needs that (one shared project, provisioned in
     * `before`), which is exactly why these tests have to return to Home
     * themselves.
     */
    const freshProject = async (label: string): Promise<{ id: string; name: string }> => {
      await reloadToHome()
      return enterGeometry(label)
    }

    /** A distinctive, non-default set of values — one per field family. */
    const CUSTOM: [Parameters<typeof ObjectProperties.fieldState>[0], string][] = [
      ['length', '12.5'],
      ['breadth', '14'],
      // Kept tiny on purpose: resolution drives mesh size, and the 3D window
      // downloads whatever is built. 2x1 cells is nothing; 25000x25000 would
      // wedge the runner.
      ['resolution_x', '2'],
      ['position_x', '5'],
      ['position_z', '-3'],
      ['rotation_z', '45']
    ]

    const applyCustom = async (): Promise<void> => {
      await ObjectProperties.waitForOpen()
      for (const [prop, value] of CUSTOM) await ObjectProperties.setField(prop, value)
      await ObjectProperties.save()
    }

    const expectCustom = async (): Promise<void> => {
      await ObjectProperties.waitForOpen()
      for (const [prop, value] of CUSTOM) {
        await browser.waitUntil(
          async () => Number((await ObjectProperties.fieldState(prop)).value) === Number(value),
          {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: `${prop} did not come back as ${value} after reopening`
          }
        )
      }
    }

    it('a ground with CUSTOMISED properties survives closing and reopening the project', async () => {
      // Differential: the previous save test only reselected the row, which is a
      // refetch within one session. This closes the project entirely and comes
      // back through Home, so it proves the values reached the DATABASE rather
      // than a warm cache.
      const project = await freshProject('persist')
      const id = await Geometry.addGround()
      const name = await nameOf(id)
      await applyCustom()

      await reopenByName(project.name)
      await Geometry.waitForTree()

      const reopenedId = await Geometry.idForName(name)
      expect(reopenedId).not.toBe(null)
      await Geometry.selectRow(reopenedId as string)
      await expectCustom()
    })

    it('several grounds with DIFFERENT properties persist independently', async () => {
      // Differential: catches a backend or cache that keys values per scenario
      // rather than per object — every ground would come back with the last
      // one's numbers.
      const project = await freshProject('persmulti')

      const first = await Geometry.addGround()
      const firstName = await nameOf(first)
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', '11')
      await ObjectProperties.save()

      const second = await Geometry.addGround()
      const secondName = await nameOf(second)
      await ObjectProperties.waitForOpen()
      await ObjectProperties.setField('length', '22')
      await ObjectProperties.save()

      await reopenByName(project.name)
      await Geometry.waitForTree()

      for (const [name, expected] of [
        [firstName, 11],
        [secondName, 22]
      ] as [string, number][]) {
        const id = await Geometry.idForName(name)
        expect(`${name} present=${id !== null}`).toBe(`${name} present=true`)
        await Geometry.selectRow(id as string)
        await ObjectProperties.waitForOpen()
        await browser.waitUntil(
          async () => Number((await ObjectProperties.fieldState('length')).value) === expected,
          {
            timeout: TIMEOUTS.MUTATION,
            timeoutMsg: `${name} should have reloaded with length ${expected}`
          }
        )
      }
    })

    it('a NEW project starts with an empty tree — grounds do not leak across projects', async () => {
      // Differential: geometry is scoped by `${projectId}::${scenarioId}`. If
      // that key were ever dropped, or the backend query stopped filtering by
      // scenario, the second project would inherit the first one's grounds.
      await freshProject('isolA')
      await Geometry.addGround()
      await Geometry.addGround()
      expect(await Geometry.rowCount()).toBe(2)

      // A brand-new project, created from Home in the same session.
      await freshProject('isolB')
      await Geometry.waitForTree()
      expect(await Geometry.rowCount()).toBe(0)
      await expect(Geometry.treeEmpty).toBeDisplayed()
      expect(await Geometry.emptyHint()).toBe(GEOMETRY_MSG.emptyTree)
    })

    it('each project keeps its OWN grounds when switching back and forth', async () => {
      const projectA = await freshProject('swapA')
      const a1 = await Geometry.addGround()
      const aName = await nameOf(a1)

      const projectB = await freshProject('swapB')
      const b1 = await Geometry.addGround()
      const bName = await nameOf(b1)
      // Both projects independently name their first ground Ground.001 —
      // numbering is per scenario, not global.
      expect(await Geometry.rowCount()).toBe(1)

      await reopenByName(projectA.name)
      await Geometry.waitForTree()
      expect(await Geometry.names()).toEqual([aName])

      await reopenByName(projectB.name)
      await Geometry.waitForTree()
      expect(await Geometry.names()).toEqual([bName])
    })

    it('a hidden geometry stays hidden after the project is reopened', async () => {
      // Visibility is a backend PATCH, so it must survive a real round-trip —
      // the other visibility tests only prove it survives within one session.
      const project = await freshProject('persvis')
      const id = await Geometry.addGround()
      const name = await nameOf(id)
      await Geometry.toggleViewport(id)

      await reopenByName(project.name)
      await Geometry.waitForTree()

      const reopenedId = await Geometry.idForName(name)
      expect(reopenedId).not.toBe(null)
      expect((await Geometry.rowState(reopenedId as string))?.viewportHidden).toBe(true)
    })

    it('a renamed geometry keeps its name after the project is reopened', async () => {
      const project = await freshProject('persname')
      const id = await Geometry.addGround()
      await renameAndSettle(id, 'PersistedName')

      await reopenByName(project.name)
      await Geometry.waitForTree()

      expect(await Geometry.names()).toContain('PersistedName')
    })

    /** Group two top-level grounds by drag and return the new group's id. */
    const groupByDrag = async (a: string, b: string): Promise<string> => {
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
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'dropping one ground onto another did not create a group' }
      )
      return groupId
    }

    /** A group of three grounds, plus their names and the group's name. */
    const groupOfThree = async (): Promise<{ groupId: string; groupName: string; ids: string[]; names: string[] }> => {
      const ids = [await Geometry.addGround(), await Geometry.addGround(), await Geometry.addGround()]
      const names = await Promise.all(ids.map((id) => nameOf(id)))
      const groupId = await groupByDrag(ids[0], ids[1])
      await dragRowOnto([ids[2]], groupId, 'into')
      await browser.waitUntil(async () => (await Geometry.childrenOf(groupId)).length === 3, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the third ground never joined the group'
      })
      return { groupId, groupName: await nameOf(groupId), ids, names }
    }

    /** Member NAMES of the group called `groupName`, expanding it if it loaded collapsed. */
    const memberNames = async (groupName: string): Promise<string[] | null> => {
      const id = await Geometry.idForName(groupName)
      if (!id) return null
      if ((await Geometry.rowState(id))?.expanded === false) await Geometry.toggleGroup(id)
      return (await Geometry.childrenOf(id)).map((r) => r.name).sort()
    }

    const depthOfName = async (name: string): Promise<number | null> => {
      const id = await Geometry.idForName(name)
      return id ? ((await Geometry.rowState(id))?.depth ?? null) : null
    }

    it('a ground dragged OUT of its group stays out after the project is reopened', async () => {
      // Differential against the in-session ungroup tests: those read the tree
      // the reducer drew. This proves the group_id PATCH reached the database.
      const project = await freshProject('persungroup')
      const { groupId, groupName, ids, names } = await groupOfThree()
      // Four rows fill the tree with every section open — make room first.
      await LeftPanel.setSection('materials', false)
      await LeftPanel.setSection('models', false)
      await dragRowsToTreeBackground([ids[0]])
      await browser.waitUntil(async () => (await Geometry.childrenOf(groupId)).length === 2, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the dropped ground never left its group'
      })

      await reopenByName(project.name)
      await Geometry.waitForTree()

      expect(await memberNames(groupName)).toEqual([names[1], names[2]].sort())
      expect(await depthOfName(names[0])).toBe(0)
    })

    it('a DISSOLVED group stays dissolved after the project is reopened', async () => {
      // The dissolve is two follow-up calls the saga makes AFTER the move (ungroup
      // the leftover, DELETE the group). If either failed silently, the group
      // would come back on reload with its one remaining member.
      const project = await freshProject('persdissolve')
      const a = await Geometry.addGround()
      const b = await Geometry.addGround()
      const [aName, bName] = [await nameOf(a), await nameOf(b)]
      const groupId = await groupByDrag(a, b)
      const groupName = await nameOf(groupId)
      // Make room like the test above. Three rows are enough to fill the tree on
      // a short display: a 1536x816 work area measured -24px here (15 Sep 2026).
      await LeftPanel.setSection('materials', false)
      await LeftPanel.setSection('models', false)
      await dragRowsToTreeBackground([a])
      await browser.waitUntil(async () => (await Geometry.rowState(groupId)) === undefined, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'a group left with one member was not dissolved'
      })
      // The cleanup calls run after the row has already gone — let them land.
      await Geometry.addGroundButton.waitForEnabled({ timeout: TIMEOUTS.MUTATION })

      await reopenByName(project.name)
      await Geometry.waitForTree()

      expect(await Geometry.idForName(groupName)).toBe(null)
      expect(await Geometry.groups()).toEqual([])
      expect(await depthOfName(aName)).toBe(0)
      expect(await depthOfName(bName)).toBe(0)
    })

    it('an EDGE drop out of a group is NOT saved — after reopening, the ground is back in its group', async () => {
      // DEVIATION / product finding. REORDER_NODES is client-only (reducer.ts:
      // "order isn't persisted"), yet a top-level target also REPARENTS the
      // dragged member out of its group — with no PATCH. The tree shows it
      // ungrouped for the session and the database never hears of it.
      const project = await freshProject('persedge')
      const { groupId, groupName, ids, names } = await groupOfThree()
      const tail = await Geometry.addGround()
      await dragRowOnto([ids[0]], tail, 'after')
      await browser.waitUntil(async () => (await Geometry.rowState(ids[0]))?.depth === 0, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the edge drop did not take the ground out of its group'
      })
      expect((await Geometry.childrenOf(groupId)).length).toBe(2)

      await reopenByName(project.name)
      await Geometry.waitForTree()

      expect(await memberNames(groupName)).toEqual([...names].sort())
    })
  })
})
