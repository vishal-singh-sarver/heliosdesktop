/**
 * Project Window (ProjectScreen shell) — coverage-gap specs.
 *
 * Closes two audited gaps the main projectscreen.test.ts suite exercises only
 * functionally, never structurally:
 *  - PW2: the Helios logo is the goHomeButton (aria-label="Go to home") and is
 *    only ever clicked. No test asserts the logo IMAGE is displayed in the
 *    title bar nor that it sits top-left. Verified against components/Header:
 *    the button wraps <img alt="Helios logo" class="h-5 w-auto"> and is the
 *    first interactive element of the 45px title-bar row.
 *  - PW5: the MenuBar (data-testid=menubar, a flex row) renders File/Edit/View/
 *    Tools/Help left of the coordinate fields, but no test asserts that layout.
 *    Verified against ProjectScreen/index.tsx: <MenuBar/> is the first child of
 *    the 50px toolbar row, the Lat/Lon/UTC LabeledFields follow it.
 *
 * Harness model mirrors projectscreen.test.ts: splash->main before(); each test
 * reloadToHome() then self-provisions its own project via enterProject().
 */
import ProjectScreen from '../pages/ProjectScreen.page'
import { enterProject, reloadToHome, waitForMainWindow } from '../support/harness'

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

describe('Project Window — Helios logo in the title bar', () => {
  it('PW2 — the logo image is displayed inside the Go-to-home button', async () => {
    await enterProject('logo-img')
    await ProjectScreen.goHomeButton.waitForDisplayed({ timeout: 15000 })
    await expect(ProjectScreen.goHomeButton).toBeDisplayed()
    // The logo IS the go-home button: it wraps the Helios logo <img>.
    const logoImg = ProjectScreen.goHomeButton.$('img[alt="Helios logo"]')
    await expect(logoImg).toBeDisplayed()
  })

  it('PW2 — the logo sits in the top-left of the header', async () => {
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

  it('PW5 — File/Edit/View/Tools/Help are all displayed in the menubar', async () => {
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

  it('PW5 — the menu buttons are laid out left-to-right in one row', async () => {
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

  it('PW5 — the menubar sits to the left of the coordinate fields', async () => {
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
