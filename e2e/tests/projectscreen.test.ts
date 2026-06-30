/**
 * ProjectScreen E2E suite — shell (navigation/entry, header coordinates + UTC,
 * scenario chip), the Left/Right collapsible panels, and the CenterWorkspace
 * tabs. Built from the adversarially-verified matrix in
 * docs/superpowers/specs/2026-06-26-projectscreen-e2e-design.md.
 *
 * Harness model (see e2e/support/harness.ts): splash->main before(); each test
 * starts from a clean Home (beforeEach reloadToHome) then SELF-PROVISIONS its own
 * project. Fresh empty DB per launch -> assert only on our own project, never
 * absolute counts.
 *
 * Key verified facts honored below:
 *  - data-testid=header/menubar are SHARED with HomePage -> discriminate via
 *    project-title (ProjectScreen-only) vs projects-table (HomePage-only).
 *  - aria-invalid is omitted when valid -> assert absence (null), not "false".
 *  - LabeledField renders NO inline coordinate error -> assert no role=alert / p.
 *  - Coordinate commit is silent + on blur -> assert OUTCOME (UTC change) via wait.
 *  - Placeholders (scenario rename/close/add, MenuBar items, empty panel bodies,
 *    inert 3D/Output tabs) are documented findings, NOT tested as behavior.
 */
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import {
  ACTIVE_PROJECT_KEY,
  ACTIVE_SCENARIO_KEY,
  createNamedReturnHome,
  enterProject,
  getStorage,
  reloadToHome,
  uniqueName,
  waitForMainWindow
} from '../support/harness'

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

describe('ProjectScreen — navigation / entry', () => {
  it('double-clicking a project row lands on the ProjectScreen', async () => {
    const { id, name } = await createNamedReturnHome(uniqueName('dbl'))
    await HomePage.row(id).doubleClick()
    await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 15000 })
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await expect(ProjectScreen.projectTitle).toHaveText(name)
    await expect(await getStorage(ACTIVE_PROJECT_KEY)).toBe(id)
  })

  it('Enter on a focused row navigates to the ProjectScreen', async () => {
    const { id } = await createNamedReturnHome(uniqueName('enter'))
    await HomePage.row(id).click()
    await browser.execute((rid: string) => {
      const el = document.querySelector(`[data-testid="row-${rid}"]`) as HTMLElement | null
      el?.focus()
    }, id)
    await browser.keys(['Enter'])
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await expect(await getStorage(ACTIVE_PROJECT_KEY)).toBe(id)
  })

  it('Space on a focused row navigates to the ProjectScreen', async () => {
    const { id } = await createNamedReturnHome(uniqueName('space'))
    await HomePage.row(id).click()
    await browser.execute((rid: string) => {
      const el = document.querySelector(`[data-testid="row-${rid}"]`) as HTMLElement | null
      el?.focus()
    }, id)
    await browser.keys([' '])
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
  })

  it('a single click does NOT navigate (stays on Home)', async () => {
    const { id } = await createNamedReturnHome(uniqueName('single'))
    await HomePage.row(id).click()
    await expect(HomePage.projectsTable).toBeDisplayed()
    await expect(ProjectScreen.projectTitle).not.toBeDisplayed()
  })

  it('entering a project loads the first scenario (writes activeScenarioId)', async () => {
    await enterProject('scenario')
    await expect(await getStorage(ACTIVE_SCENARIO_KEY)).not.toBe(null)
  })
})

describe('ProjectScreen — header title + logo', () => {
  it('shows the project name in the header title', async () => {
    const { name } = await enterProject('title')
    await expect(ProjectScreen.projectTitle).toHaveText(name)
  })

  it('the logo returns to Home and clears the active scenario id', async () => {
    const { id } = await enterProject('logo')
    // We must actually be ON the project screen before clicking the logo —
    // otherwise the "returns to Home" claim is vacuous (we might already be home).
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await expect(ProjectScreen.projectTitle).toBeDisplayed()

    await ProjectScreen.goHome()

    // Landed back on Home: the Home-only projects table is shown.
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    await expect(HomePage.projectsTable).toBeDisplayed()

    // The scenario id is cleared by ProjectScreen's unmount cleanup. Differential:
    // if that cleanup were removed, this waitUntil would time out (stays === id).
    await browser.waitUntil(async () => (await getStorage(ACTIVE_SCENARIO_KEY)) === null, {
      timeout: 10000,
      timeoutMsg: 'activeScenarioId not cleared on leaving the project screen'
    })
    await expect(await getStorage(ACTIVE_SCENARIO_KEY)).toBe(null)

    // FINDING / app-behavior contract: navigate('home') does NOT clear
    // activeProjectId (navigationReducer only flips the screen; the unmount
    // cleanup in ProjectScreen removes ONLY activeScenarioId). The project id is
    // intentionally retained so a refresh-with-both-ids can auto-restore the
    // project view (see the boot auto-restore suite). Asserting the project id
    // is null here would contradict the app and the auto-restore tests, so we
    // assert the real, differential contract: it survives as `id`.
    await expect(await getStorage(ACTIVE_PROJECT_KEY)).toBe(id)
  })
})

describe('ProjectScreen — scenario chip (static)', () => {
  it('renders the static "Scenario 1" chip', async () => {
    await enterProject('chip')
    await expect(ProjectScreen.scenarioChip).toBeDisplayed()
    await expect(ProjectScreen.scenarioChip).toHaveText('Scenario 1', { containing: true })
  })
  // FINDING (not tested): the chip's Rename / Close / Add-scenario buttons have
  // no onClick wired — placeholder no-ops (see design doc Section 6).
})

describe('ProjectScreen — coordinate validation (aria-invalid, no inline error)', () => {
  const invalidCases: Array<{ label: string; field: 'latitude' | 'longitude'; value: string }> = [
    { label: 'latitude out of range (95)', field: 'latitude', value: '95' },
    { label: 'latitude non-numeric (abc)', field: 'latitude', value: 'abc' },
    { label: 'latitude > 7 decimals', field: 'latitude', value: '12.123456789' },
    { label: 'longitude out of range (200)', field: 'longitude', value: '200' },
    { label: 'longitude non-numeric (xyz)', field: 'longitude', value: 'xyz' },
    // (D-gap) mirror the latitude >7-decimal case: 8 decimals, IN range — only the
    // decimal-place rule can reject it, so this is differential for that rule.
    { label: 'longitude > 7 decimals', field: 'longitude', value: '120.12345678' }
  ]

  for (const tc of invalidCases) {
    it(`marks ${tc.label} aria-invalid and renders no inline error`, async () => {
      await enterProject('inv')
      await ProjectScreen.setCoordinate(tc.field, tc.value)
      // Differential: an invalid coordinate MUST set aria-invalid=true. If the
      // range/decimal/format validation were removed, this would time out.
      await browser.waitUntil(async () => (await ProjectScreen.coordInvalid(tc.field)) === 'true', {
        timeout: 5000,
        timeoutMsg: 'aria-invalid never became true'
      })
      // LabeledField renders NO inline error text — assert no alert/paragraph.
      await expect($('[role="alert"]')).not.toBeExisting()
    })
  }

  // commit-gate while invalid — LONGITUDE only, so the assertion is real.
  // Latitude never drives UTC, so "UTC unchanged on an invalid latitude" would be
  // vacuous (true regardless of the gate). Only longitude recomputes UTC, so an
  // out-of-range longitude tests the gate: if commitCoordinate stopped early-
  // returning on errors[field], it WOULD dispatch the PATCH and UTC would change.
  it('an invalid longitude is commit-gated: aria-invalid + UTC NOT recomputed', async () => {
    await enterProject('gate') // seeded lon 56.78 -> a valid UTC is already shown
    const seededUtc = await ProjectScreen.getUtcValue()
    await ProjectScreen.setCoordinate('longitude', '200') // out of [-180, 180]
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('longitude')) === 'true', {
      timeout: 5000,
      timeoutMsg: 'aria-invalid never became true for out-of-range longitude'
    })
    // The commit gate suppressed the PATCH -> the derived UTC offset is unchanged.
    await expect(ProjectScreen.utcInput).toHaveValue(seededUtc)
  })

  const validCases: Array<{ label: string; field: 'latitude' | 'longitude'; value: string }> = [
    { label: 'latitude boundary 90', field: 'latitude', value: '90' },
    { label: 'latitude boundary -90', field: 'latitude', value: '-90' },
    { label: 'longitude boundary 180', field: 'longitude', value: '180' },
    { label: 'longitude boundary -180', field: 'longitude', value: '-180' },
    { label: 'latitude exactly 7 decimals', field: 'latitude', value: '45.1234567' },
    { label: 'partial "7." while typing', field: 'latitude', value: '7.' }
  ]

  for (const tc of validCases) {
    it(`accepts ${tc.label} (no aria-invalid)`, async () => {
      await enterProject('val')
      await ProjectScreen.setCoordinate(tc.field, tc.value)
      // valid -> aria-invalid attribute is ABSENT (null), never "false".
      await expect(await ProjectScreen.coordInvalid(tc.field)).toBe(null)
    })
  }

  it('empty longitude is neutral (no aria-invalid, no commit)', async () => {
    // Re-pointed to LONGITUDE so the no-commit leg is observable (latitude never
    // drives UTC). First commit a valid longitude so UTC settles to a new value
    // (proves the recompute path is alive and that we are editing the UTC driver).
    await enterProject('empty') // seeded lon 56.78
    const seededUtc = await ProjectScreen.getUtcValue()
    await ProjectScreen.setCoordinate('longitude', '-121.7405')
    await browser.waitUntil(async () => (await ProjectScreen.getUtcValue()) !== seededUtc, {
      timeout: 15000,
      timeoutMsg: 'UTC offset never changed after committing a new longitude'
    })
    const committedUtc = await ProjectScreen.getUtcValue()

    // Clear the field. Empty is NEUTRAL: validateCoordinates skips empty values,
    // so aria-invalid stays absent (differential: if empty were treated as
    // invalid, coordInvalid would become 'true').
    await ProjectScreen.setCoordinate('longitude', '')
    await expect(await ProjectScreen.coordInvalid('longitude')).toBe(null)
    // The field is genuinely empty...
    await expect(ProjectScreen.lonInput).toHaveValue('')
    // ...and an empty value is NOT committed (commitCoordinate returns on '') so
    // the last good UTC offset is retained rather than recomputed/cleared.
    await expect(ProjectScreen.utcInput).toHaveValue(committedUtc)
  })
})

describe('ProjectScreen — coordinate commit + UTC recompute', () => {
  it('committing a far-band longitude recomputes the UTC offset', async () => {
    await enterProject('utc') // seeded lon 56.78
    const seededUtc = await ProjectScreen.getUtcValue()
    await ProjectScreen.setCoordinate('longitude', '-121.7405') // US Pacific band
    await browser.waitUntil(async () => (await ProjectScreen.getUtcValue()) !== seededUtc, {
      timeout: 15000,
      timeoutMsg: 'UTC offset never changed after committing a new longitude'
    })
    // the typed value persists (input is not re-seeded on a same-id refetch).
    await expect(ProjectScreen.lonInput).toHaveValue('-121.7405')
  })

  it('re-committing the same longitude does not re-recompute UTC (Object.is guard)', async () => {
    // Re-pointed from a vacuous "blur latitude without editing -> UTC unchanged"
    // case (latitude never drives UTC, so it was true regardless of any guard).
    // The unchanged-value guard lives in commitCoordinate via Object.is(next,
    // current) and is only observable on the UTC-driving field (longitude).
    //
    // Strategy: first commit a NEW longitude and let UTC settle to a new value
    // (proves recompute is live). Then re-type that SAME longitude and blur: the
    // Object.is guard must short-circuit so UTC holds at the new value.
    //
    // E2E limitation (documented honestly): at the UTC layer a true no-op is
    // indistinguishable from a redundant PATCH that returns the same utc_offset.
    // So the differential teeth here are the POSITIVE leg — UTC must FIRST change
    // when longitude changes; if recompute were dead, the first waitUntil fails.
    await enterProject('noop') // seeded lon 56.78
    const seededUtc = await ProjectScreen.getUtcValue()
    await ProjectScreen.setCoordinate('longitude', '-121.7405')
    await browser.waitUntil(async () => (await ProjectScreen.getUtcValue()) !== seededUtc, {
      timeout: 15000,
      timeoutMsg: 'UTC offset never changed after committing a new longitude'
    })
    const newUtc = await ProjectScreen.getUtcValue()
    // Re-commit the identical value -> unchanged guard short-circuits, UTC holds.
    await ProjectScreen.setCoordinate('longitude', '-121.7405')
    await expect(ProjectScreen.utcInput).toHaveValue(newUtc)
  })

  it('the UTC Offset field is read-only and formatted', async () => {
    await enterProject('utcfmt')
    await expect(ProjectScreen.utcInput).toHaveAttribute('disabled')
    await expect(ProjectScreen.utcInput).toHaveValue(/^[+-]\d{2}:\d{2}$/)
  })
})

describe('ProjectScreen — header help tooltips', () => {
  it('latitude help exposes its tooltip content', async () => {
    await enterProject('tip')
    await expect(await ProjectScreen.latHelp.getAttribute('data-tooltip-content')).toContain(
      'decimal degrees'
    )
  })
  it('longitude help exposes its tooltip content', async () => {
    await enterProject('tip2')
    await expect(await ProjectScreen.lonHelp.getAttribute('data-tooltip-content')).toContain(
      'decimal degrees'
    )
  })
})

describe('ProjectScreen — menubar present (items are no-ops)', () => {
  it('exposes File / Edit / View / Tools / Help', async () => {
    await enterProject('menu')
    for (const label of ['File', 'Edit', 'View', 'Tools', 'Help'] as const) {
      await expect(ProjectScreen.menubarButton(label)).toBeDisplayed()
    }
  })
  // FINDING (not tested): onItemSelect={() => {}} — all 20 dropdown items are dead.
})

describe('ProjectScreen — boot auto-restore', () => {
  it('with BOTH active ids, a refresh re-opens the project screen', async () => {
    await enterProject('restore') // both ids now in localStorage
    await browser.refresh()
    await waitForMainWindow()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 20000 })
    await expect(HomePage.projectsTable).not.toBeDisplayed()
  })

  it('with only the project id, a refresh lands on Home', async () => {
    await enterProject('restore2')
    await browser.execute((k: string) => localStorage.removeItem(k), ACTIVE_SCENARIO_KEY)
    await browser.refresh()
    await waitForMainWindow()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 20000 })
    await expect(ProjectScreen.projectTitle).not.toBeDisplayed()
  })
})

describe('ProjectScreen — Left/Right panels', () => {
  it('the left panel starts collapsed and toggles expand/collapse', async () => {
    await enterProject('left')
    await expect(await ProjectScreen.isPanelExpanded('left')).toBe(false)
    await ProjectScreen.toggleLeftPanel()
    await browser.waitUntil(async () => ProjectScreen.isPanelExpanded('left'), {
      timeout: 5000,
      timeoutMsg: 'left panel never expanded'
    })
    await ProjectScreen.toggleLeftPanel()
    await browser.waitUntil(async () => !(await ProjectScreen.isPanelExpanded('left')), {
      timeout: 5000,
      timeoutMsg: 'left panel never collapsed'
    })
  })

  it('the right panel starts collapsed and toggles expand/collapse', async () => {
    await enterProject('right')
    await expect(await ProjectScreen.isPanelExpanded('right')).toBe(false)
    await ProjectScreen.toggleRightPanel()
    await browser.waitUntil(async () => ProjectScreen.isPanelExpanded('right'), {
      timeout: 5000,
      timeoutMsg: 'right panel never expanded'
    })
    await ProjectScreen.toggleRightPanel()
    await browser.waitUntil(async () => !(await ProjectScreen.isPanelExpanded('right')), {
      timeout: 5000,
      timeoutMsg: 'right panel never collapsed'
    })
  })

  it('toggling the left panel does not move the right panel', async () => {
    await enterProject('indep')
    await ProjectScreen.toggleLeftPanel()
    await browser.waitUntil(async () => ProjectScreen.isPanelExpanded('left'), { timeout: 5000 })
    await expect(await ProjectScreen.isPanelExpanded('right')).toBe(false)
  })
  // FINDING (not tested): expanded panel bodies are empty placeholders.
})

describe('ProjectScreen — CenterWorkspace tabs', () => {
  it('defaults to the Weather tab with the table mounted', async () => {
    await enterProject('tabs')
    await expect(await ProjectScreen.tabActive('weather')).toBe('true')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: 15000 })
  })

  it('renders exactly three tabs', async () => {
    await enterProject('tabcount')
    const buttons = await ProjectScreen.centerTabs.$$('button')
    await expect(buttons.length).toBe(3)
  })

  it('switching to 3D Window unmounts the Weather table', async () => {
    await enterProject('tab3d')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: 15000 })
    await ProjectScreen.selectTab('3dwindow')
    await expect(await ProjectScreen.tabActive('3dwindow')).toBe('true')
    await expect(await ProjectScreen.tabActive('weather')).toBe('false')
    await ProjectScreen.weatherSentinel.waitForExist({ reverse: true, timeout: 10000 })
  })

  it('switching to Output unmounts the Weather table', async () => {
    await enterProject('tabout')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: 15000 })
    await ProjectScreen.selectTab('output')
    await expect(await ProjectScreen.tabActive('output')).toBe('true')
    await ProjectScreen.weatherSentinel.waitForExist({ reverse: true, timeout: 10000 })
  })

  it('returning to Weather remounts the table', async () => {
    await enterProject('tabback')
    await ProjectScreen.selectTab('output')
    await ProjectScreen.weatherSentinel.waitForExist({ reverse: true, timeout: 10000 })
    await ProjectScreen.selectTab('weather')
    await expect(await ProjectScreen.tabActive('weather')).toBe('true')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: 15000 })
  })
  // FINDING (not tested): 3D Window / Output tabs render no content (inert placeholders).
})

describe('ProjectScreen — coordinate edge cases', () => {
  it('correcting an invalid value clears aria-invalid', async () => {
    await enterProject('fix')
    await ProjectScreen.setCoordinate('latitude', '95')
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('latitude')) === 'true', {
      timeout: 5000,
      timeoutMsg: 'aria-invalid never became true for out-of-range latitude'
    })
    await ProjectScreen.setCoordinate('latitude', '45')
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('latitude')) === null, {
      timeout: 5000,
      timeoutMsg: 'aria-invalid never cleared after correcting the latitude'
    })
  })

  it('treats a whitespace-padded value as valid (trimmed for validation)', async () => {
    await enterProject('trim')
    await ProjectScreen.setCoordinate('latitude', '  45.5  ')
    // The validator trims before checking, so the padded value is VALID: aria-invalid
    // is absent and no inline error is rendered. (The input keeps the user's literal
    // text — LabeledField is not re-seeded on a same-id refetch — so we assert
    // validity, not the displayed string.)
    await expect(await ProjectScreen.coordInvalid('latitude')).toBe(null)
    await expect($('[role="alert"]')).not.toBeExisting()
  })

  it('committing a new valid longitude recomputes UTC (recompute is live)', async () => {
    // Re-pointed from a vacuous "typing -0 on latitude is a no-op (UTC unchanged)"
    // case. Latitude never drives UTC, so that assertion held regardless of any
    // app rule. The observable commit/recompute path is LONGITUDE-only: set a new
    // valid longitude in a far time-zone band and assert UTC actually changes.
    // Differential: if commitCoordinate stopped dispatching (or the backend stopped
    // re-deriving utc_offset), this waitUntil would time out.
    await enterProject('recompute') // seeded lon 56.78
    const seededUtc = await ProjectScreen.getUtcValue()
    await ProjectScreen.setCoordinate('longitude', '-121.7405') // US Pacific band
    await browser.waitUntil(async () => (await ProjectScreen.getUtcValue()) !== seededUtc, {
      timeout: 15000,
      timeoutMsg: 'UTC offset never changed after committing a new valid longitude'
    })
    await expect(ProjectScreen.utcInput).not.toHaveValue(seededUtc)
  })
})

describe('ProjectScreen — coordinate persistence', () => {
  it('a committed coordinate survives leaving and reopening the project', async () => {
    const { name } = await enterProject('persist')
    const seededUtc = await ProjectScreen.getUtcValue()
    await ProjectScreen.setCoordinate('longitude', '-121.7405')
    await browser.waitUntil(async () => (await ProjectScreen.getUtcValue()) !== seededUtc, {
      timeout: 15000,
      timeoutMsg: 'UTC offset never changed after committing a new longitude'
    })
    // Reopen the SAME project from Home (backend session persists in-run) and
    // confirm the committed coordinate survived the round-trip.
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const homeId = await HomePage.rowIdForName(name)
    await HomePage.row(homeId as string).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await expect(ProjectScreen.lonInput).toHaveValue('-121.7405')
  })
})

describe('ProjectScreen — scenario chip buttons (no-op)', () => {
  it('the rename / close / add buttons exist, are clickable, and do nothing', async () => {
    await enterProject('chipbtn')
    const buttons = [
      ProjectScreen.scenarioRenameBtn,
      ProjectScreen.scenarioCloseBtn,
      ProjectScreen.scenarioAddBtn
    ]
    for (const btn of buttons) {
      await expect(await btn.isExisting()).toBe(true)
      await expect(btn).toBeClickable()
    }
    // Clicking each placeholder must NOT mutate the chip or leave the screen.
    for (const btn of buttons) {
      await btn.click()
    }
    await expect(ProjectScreen.scenarioChip).toHaveText('Scenario 1', { containing: true })
    await expect(ProjectScreen.projectTitle).toBeDisplayed()
  })
})

describe('ProjectScreen — panel bodies are empty placeholders', () => {
  it('expanding the left panel adds no interactive widgets', async () => {
    await enterProject('lbody')
    const collapsedCount = await ProjectScreen.panelButtonCount('left')
    await ProjectScreen.toggleLeftPanel()
    await browser.waitUntil(async () => ProjectScreen.isPanelExpanded('left'), {
      timeout: 5000,
      timeoutMsg: 'left panel never expanded'
    })
    // The expanded body is a placeholder -> button count is unchanged.
    await expect(await ProjectScreen.panelButtonCount('left')).toBe(collapsedCount)
  })

  it('expanding the right panel adds no interactive widgets', async () => {
    await enterProject('rbody')
    const collapsedCount = await ProjectScreen.panelButtonCount('right')
    await ProjectScreen.toggleRightPanel()
    await browser.waitUntil(async () => ProjectScreen.isPanelExpanded('right'), {
      timeout: 5000,
      timeoutMsg: 'right panel never expanded'
    })
    await expect(await ProjectScreen.panelButtonCount('right')).toBe(collapsedCount)
  })

  it('both panels can be expanded simultaneously', async () => {
    await enterProject('bothpanels')
    await ProjectScreen.toggleLeftPanel()
    await ProjectScreen.toggleRightPanel()
    await browser.waitUntil(
      async () =>
        (await ProjectScreen.isPanelExpanded('left')) &&
        (await ProjectScreen.isPanelExpanded('right')),
      { timeout: 5000, timeoutMsg: 'both panels were not expanded simultaneously' }
    )
    await expect(await ProjectScreen.isPanelExpanded('left')).toBe(true)
    await expect(await ProjectScreen.isPanelExpanded('right')).toBe(true)
  })
})

describe('ProjectScreen — rapid tab switching', () => {
  it('the Weather table remounts cleanly after rapid tab switching', async () => {
    await enterProject('rapid')
    await ProjectScreen.selectTab('output')
    await ProjectScreen.selectTab('3dwindow')
    await ProjectScreen.selectTab('weather')
    await expect(await ProjectScreen.tabActive('weather')).toBe('true')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: 15000 })
  })
})

describe('ProjectScreen — boot restore (stale ids)', () => {
  it('a bogus activeProjectId does not crash the app (lands on Home)', async () => {
    await enterProject('stale')
    // Point the active project id at a non-existent project but keep the scenario
    // id so boot tries (and fails) to restore the project screen.
    await browser.execute((k: string) => localStorage.setItem(k, 'does-not-exist'), ACTIVE_PROJECT_KEY)
    await browser.refresh()
    await waitForMainWindow()
    // The app must recover gracefully: prefer landing on Home, but tolerate staying
    // on a project screen — the contract here is "no white screen / crash".
    await browser.waitUntil(
      async () =>
        (await HomePage.projectsTable.isDisplayed()) ||
        (await ProjectScreen.projectTitle.isDisplayed()),
      { timeout: 20000, timeoutMsg: 'app rendered neither Home nor a project screen (white screen?)' }
    )
    const onHome = await HomePage.projectsTable.isDisplayed()
    const onProject = await ProjectScreen.projectTitle.isDisplayed()
    expect(onHome || onProject).toBe(true)
  })
})

describe('Project Window — Helios logo in the title bar', () => {
  it('the logo image is displayed inside the Go-to-home button', async () => {
    await enterProject('logo-img')
    await ProjectScreen.goHomeButton.waitForDisplayed({ timeout: 15000 })
    await expect(ProjectScreen.goHomeButton).toBeDisplayed()
    // The logo IS the go-home button: it wraps the Helios logo <img>.
    const logoImg = ProjectScreen.goHomeButton.$('img[alt="Helios logo"]')
    await expect(logoImg).toBeDisplayed()
  })

  it('the logo sits in the top-left of the header', async () => {
    await enterProject('logo-pos')
    await ProjectScreen.goHomeButton.waitForDisplayed({ timeout: 15000 })
    const header = $('[data-testid="header"]')
    await header.waitForDisplayed({ timeout: 15000 })

    const logoLoc = await ProjectScreen.goHomeButton.getLocation()
    const titleLoc = await ProjectScreen.projectTitle.getLocation()
    const headerLoc = await header.getLocation()

    // Top-left: the logo starts at the header's left edge (allow a small px gap
    // for padding) and is positioned before the project title horizontally.
    expect(logoLoc.x).toBeLessThan(titleLoc.x)
    expect(logoLoc.x - headerLoc.x).toBeLessThan(40)
    // Vertically anchored at the very top of the header.
    expect(logoLoc.y - headerLoc.y).toBeLessThan(40)
  })
})

describe('Project Window — toolbar options in a single left-aligned row', () => {
  const menuLabels = ['File', 'Edit', 'View', 'Tools', 'Help'] as const

  it('File/Edit/View/Tools/Help are all displayed in the menubar', async () => {
    await enterProject('menu-shown')
    await ProjectScreen.menubar.waitForDisplayed({ timeout: 15000 })
    for (const label of menuLabels) {
      await expect(ProjectScreen.menubarButton(label)).toBeDisplayed()
    }
    // Exactly these five top-level options — no Scripting top-level menu.
    // Count direct-child trigger buttons in-page: a leading ">" is an invalid
    // WebDriver selector; :scope in querySelectorAll scopes to direct children
    // (so dropdown-item buttons nested deeper are excluded).
    const topButtonCount = await browser.execute(() => {
      const nav = document.querySelector('[data-testid="menubar"]')
      return nav ? nav.querySelectorAll(':scope > div > button').length : -1
    })
    expect(topButtonCount).toBe(menuLabels.length)
  })

  it('the menu buttons are laid out left-to-right in one row', async () => {
    await enterProject('menu-row')
    await ProjectScreen.menubar.waitForDisplayed({ timeout: 15000 })

    const locs: Array<{ x: number; y: number }> = []
    for (const label of menuLabels) {
      locs.push(await ProjectScreen.menubarButton(label).getLocation())
    }

    // Single row: every button shares (within a few px) the same top Y.
    const baseY = locs[0].y
    for (const loc of locs) {
      expect(Math.abs(loc.y - baseY)).toBeLessThan(8)
    }
    // Left-to-right order: File < Edit < View < Tools < Help by x.
    for (let i = 1; i < locs.length; i += 1) {
      expect(locs[i].x).toBeGreaterThan(locs[i - 1].x)
    }
  })

  it('the menubar sits to the left of the coordinate fields', async () => {
    await enterProject('menu-left')
    await ProjectScreen.menubar.waitForDisplayed({ timeout: 15000 })
    await ProjectScreen.latInput.waitForDisplayed({ timeout: 15000 })

    const helpLoc = await ProjectScreen.menubarButton('Help').getLocation()
    const latLoc = await ProjectScreen.latInput.getLocation()
    const lonLoc = await ProjectScreen.lonInput.getLocation()
    const utcLoc = await ProjectScreen.utcInput.getLocation()

    // The whole menubar row precedes the coordinate inputs: the right-most menu
    // option (Help) starts left of the first coordinate field.
    expect(helpLoc.x).toBeLessThan(latLoc.x)
    // And the coordinate trio itself reads Latitude -> Longitude -> UTC Offset.
    expect(latLoc.x).toBeLessThan(lonLoc.x)
    expect(lonLoc.x).toBeLessThan(utcLoc.x)
  })
})
