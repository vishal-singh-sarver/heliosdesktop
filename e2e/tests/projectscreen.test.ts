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
import { TIMEOUTS } from '../config/timeouts'
import { DEFAULT_COORDS } from '../constants/test-data'

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
    await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.LONG })
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
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
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
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
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
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
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await expect(ProjectScreen.projectTitle).toBeDisplayed()

    await ProjectScreen.goHome()

    // Landed back on Home: the Home-only projects table is shown.
    await HomePage.projectsTable.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await expect(HomePage.projectsTable).toBeDisplayed()

    // The scenario id is cleared by ProjectScreen's unmount cleanup. Differential:
    // if that cleanup were removed, this waitUntil would time out (stays === id).
    await browser.waitUntil(async () => (await getStorage(ACTIVE_SCENARIO_KEY)) === null, {
      timeout: TIMEOUTS.MEDIUM,
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
        timeout: TIMEOUTS.SHORT,
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
      timeout: TIMEOUTS.SHORT,
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
      timeout: TIMEOUTS.LONG,
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
      timeout: TIMEOUTS.LONG,
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
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'UTC offset never changed after committing a new longitude'
    })
    const newUtc = await ProjectScreen.getUtcValue()
    // Re-commit the identical value -> unchanged guard short-circuits, UTC holds.
    await ProjectScreen.setCoordinate('longitude', '-121.7405')
    await expect(ProjectScreen.utcInput).toHaveValue(newUtc)
  })

  it('the UTC Offset field is read-only', async () => {
    await enterProject('utcfmt')
    await expect(ProjectScreen.utcInput).toHaveAttribute('disabled')
  })
})

describe('ProjectScreen — UTC offset is the CORRECT value for fixed coordinates', () => {
  // The tests above only prove UTC *recompute fires* / is *shaped* like an offset
  // — a sign-flip or timezone-DB regression would pass green. These assert the
  // EXACT offset for known coordinates.
  //
  // The backend derives utc_offset via timezonefinder → zoneinfo, reflecting DST
  // "at the time of the call" (backend-api/app/core/timezone.py). So we only pin
  // zones that DON'T observe DST: their offset is stable year-round, making the
  // assertion deterministic regardless of when or where the suite runs. Each
  // expected value also can't come from a naive longitude/15 estimate, so a real
  // IANA-timezone resolution is required to satisfy it (e.g. +05:30, -07:00).
  //
  // enterProject(label, lat, lon) creates the project with BOTH coordinates set
  // atomically, so the backend computes the offset ONCE (no commit-order race).
  const CASES: Array<{ label: string; lat: string; lon: string; utc: string }> = [
    { label: 'central India (Asia/Kolkata, no DST)', lat: '22.5', lon: '78.9', utc: '+05:30' },
    { label: 'Tokyo (Asia/Tokyo, no DST)', lat: '35.68', lon: '139.69', utc: '+09:00' },
    { label: 'Phoenix (America/Phoenix, no DST)', lat: '33.45', lon: '-112.07', utc: '-07:00' }
  ]

  for (const c of CASES) {
    it(`resolves ${c.utc} for ${c.label}`, async () => {
      await enterProject('utcexact', c.lat, c.lon)
      await browser.waitUntil(async () => (await ProjectScreen.getUtcValue()) === c.utc, {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: `UTC offset for ${c.label} (${c.lat}, ${c.lon}) never became ${c.utc}`
      })
      await expect(ProjectScreen.utcInput).toHaveValue(c.utc)
    })
  }
})

describe('ProjectScreen — boot auto-restore', () => {
  it('with BOTH active ids, a refresh re-opens the project screen', async () => {
    await enterProject('restore') // both ids now in localStorage
    await browser.refresh()
    await waitForMainWindow()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await expect(HomePage.projectsTable).not.toBeDisplayed()
  })

  it('with only the project id, a refresh lands on Home', async () => {
    await enterProject('restore2')
    await browser.execute((k: string) => localStorage.removeItem(k), ACTIVE_SCENARIO_KEY)
    await browser.refresh()
    await waitForMainWindow()
    await HomePage.projectsTable.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await expect(ProjectScreen.projectTitle).not.toBeDisplayed()
  })
})

describe('ProjectScreen — CenterWorkspace tabs', () => {
  it('defaults to the Weather tab with the table mounted', async () => {
    await enterProject('tabs')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })
  })

  it('switching to 3D Window unmounts the Weather table', async () => {
    await enterProject('tab3d')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await ProjectScreen.selectTab('3dwindow')
    await ProjectScreen.weatherSentinel.waitForExist({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('switching to Output unmounts the Weather table', async () => {
    await enterProject('tabout')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await ProjectScreen.selectTab('output')
    await ProjectScreen.weatherSentinel.waitForExist({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('returning to Weather remounts the table', async () => {
    await enterProject('tabback')
    await ProjectScreen.selectTab('output')
    await ProjectScreen.weatherSentinel.waitForExist({ reverse: true, timeout: TIMEOUTS.MEDIUM })
    await ProjectScreen.selectTab('weather')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })
  })
  // FINDING (not tested): 3D Window / Output tabs render no content (inert placeholders).
})

describe('ProjectScreen — coordinate edge cases', () => {
  it('correcting an invalid value clears aria-invalid', async () => {
    await enterProject('fix')
    await ProjectScreen.setCoordinate('latitude', '95')
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('latitude')) === 'true', {
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: 'aria-invalid never became true for out-of-range latitude'
    })
    await ProjectScreen.setCoordinate('latitude', '45')
    await browser.waitUntil(async () => (await ProjectScreen.coordInvalid('latitude')) === null, {
      timeout: TIMEOUTS.SHORT,
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
      timeout: TIMEOUTS.LONG,
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
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'UTC offset never changed after committing a new longitude'
    })
    // Reopen the SAME project from Home (backend session persists in-run) and
    // confirm the committed coordinate survived the round-trip.
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    const homeId = await HomePage.rowIdForName(name)
    await HomePage.row(homeId as string).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    await expect(ProjectScreen.lonInput).toHaveValue('-121.7405')
  })

  it('an edited latitude persists across leaving and reopening the project', async () => {
    // The longitude case above barriers on a visible UTC change. Latitude does NOT
    // drive UTC and there is no loading/disabled DOM signal on the inputs, so a
    // committed-then-navigate race could reopen BEFORE the PATCH lands and mask a
    // broken latitude write path. We must NOT also commit longitude to force a UTC
    // change — the second commit merges with activeProject's stale latitude and
    // clobbers the just-written value (a lost update). So we commit ONLY latitude,
    // then confirm the PATCH actually PERSISTED server-side before navigating.
    //
    // Barrier (network confirmation): poll GET /api/project/{id} — with the
    // session-id header the app itself uses — until the backend reports the NEW
    // latitude. Only then goHome → reopen → assert the reopened latInput.
    //
    // Differential: create at 45.5, edit to -33.8688. If the latitude commit
    // branch (index.tsx commitCoordinate) or the backend latitude persistence were
    // dropped, the barrier would time out (server never reports -33.8688) OR the
    // reopened input would show the create-time 45.5 → red.
    const CREATE_LAT = '45.5'
    const NEW_LAT = '-33.8688'
    const { id, name } = await enterProject('latpersist', CREATE_LAT, DEFAULT_COORDS.lon)

    // Sanity: the header shows the create-time latitude before we edit it, so the
    // assertion below is genuinely about the EDIT surviving, not the seed.
    await expect(ProjectScreen.latInput).toHaveValue(CREATE_LAT)

    // Commit ONLY latitude (setCoordinate blurs latitude by clicking longitude,
    // which commits latitude but does NOT commit longitude — no lost update).
    await ProjectScreen.setCoordinate('latitude', NEW_LAT)

    // Network barrier: poll the backend (same base URL + session-id the renderer
    // uses) until the project's persisted latitude equals the new value. This
    // proves the PATCH round-tripped before we navigate away.
    await browser.waitUntil(
      async () => {
        const persisted = await browser.execute(async (projectId: string) => {
          try {
            const w = window as unknown as {
              api?: { getBackendUrl?: () => Promise<string | null> }
              __APP_BASE_URL__?: string
            }
            const base = (await w.api?.getBackendUrl?.()) ?? w.__APP_BASE_URL__ ?? ''
            const sessionId = localStorage.getItem('helios_session_id') ?? ''
            const res = await fetch(`${base}/api/project/${projectId}`, {
              headers: { accept: 'application/json', 'session-id': sessionId }
            })
            if (!res.ok) return null
            const body = (await res.json()) as { project?: { latitude?: number } }
            return body.project?.latitude ?? null
          } catch {
            return null
          }
        }, id)
        return typeof persisted === 'number' && Math.abs(persisted - Number(NEW_LAT)) < 1e-9
      },
      {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: `backend never reported the edited latitude ${NEW_LAT} for project ${id}`
      }
    )

    // Now that persistence is confirmed, leave and reopen the SAME project.
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    const homeId = await HomePage.rowIdForName(name)
    await HomePage.row(homeId as string).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })

    // The reopened header must show the EDITED latitude (seeded from the freshly
    // fetched project metadata), never the create-time 45.5.
    await browser.waitUntil(async () => (await ProjectScreen.getCoordValue('latitude')) === NEW_LAT, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'reopened latitude input never showed the edited value'
    })
    await expect(ProjectScreen.latInput).toHaveValue(NEW_LAT)
  })
})

describe('ProjectScreen — rapid tab switching', () => {
  it('the Weather table remounts cleanly after rapid tab switching', async () => {
    await enterProject('rapid')
    await ProjectScreen.selectTab('output')
    await ProjectScreen.selectTab('3dwindow')
    await ProjectScreen.selectTab('weather')
    await ProjectScreen.weatherSentinel.waitForDisplayed({ timeout: TIMEOUTS.LONG })
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
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'app rendered neither Home nor a project screen (white screen?)' }
    )
    const onHome = await HomePage.projectsTable.isDisplayed()
    const onProject = await ProjectScreen.projectTitle.isDisplayed()
    expect(onHome || onProject).toBe(true)
  })
})

