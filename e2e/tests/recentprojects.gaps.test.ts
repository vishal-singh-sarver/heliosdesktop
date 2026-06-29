/**
 * Recent Projects — gap-coverage E2E (HomePage list / sort headers / delete).
 *
 * Preamble mirrors homepage.test.ts EXACTLY (waitForMainWindow before() hook,
 * reloadToHome beforeEach, createNamed/createProject self-provisioning, the
 * setInputValue controlled-input helper, prefix row-<id> selectors). Each test
 * self-provisions its own project(s) and asserts only on its OWN rows — never
 * absolute counts or another test's data. Tests sensitive to other rows narrow
 * the list with search() first.
 *
 * Real-behavior notes verified against source:
 *  - ProjectsTable renders an <h2>Recent Projects</h2> ABOVE the table (the only
 *    h2 directly inside <main>; the create dialog's "New Project" h2 lives inside
 *    its own <dialog>).
 *  - Column headers render COLUMN_LABELS text Name / Last Updated / Size inside
 *    [data-testid="sort-<key>"] buttons.
 *  - EmptyState body copy: 'No Projects Found. Please add a new Project.'
 *  - Delete dialog heading: `Delete <name>`. Confirm/Cancel buttons are disabled
 *    while pendingDeleteInFlight; handleConfirmDelete returns early when in-flight.
 *  - Search filters LITERALLY (lowercased substring includes on name|last_updated),
 *    so regex-meta / special chars are matched as plain text, never evaluated.
 */

import HomePage from '../pages/HomePage.page'

const ACTIVE_PROJECT_KEY = 'helios:activeProjectId'
const ACTIVE_SCENARIO_KEY = 'helios:activeScenarioId'

const MSG = {
  heading: 'Recent Projects',
  emptyTitle: 'No Projects Found',
  emptyBody: 'No Projects Found. Please add a new Project.',
  deleteBody: 'Are you sure you want to delete this? This action cannot be undone.'
} as const

async function waitForMainWindow(): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const handles = await browser.getWindowHandles()
        if (handles.length === 0) return false
        await browser.switchToWindow(handles[handles.length - 1])
        return await browser.execute(() => document.querySelector('#root') !== null)
      } catch {
        return false
      }
    },
    { timeout: 30000, timeoutMsg: 'Main window with #root never became available' }
  )
}

before(async () => {
  await waitForMainWindow()
})

let nameCounter = 0
/** Unique project name, <= 30 chars so it passes client-side validation. */
function uniqueName(label: string): string {
  nameCounter += 1
  const ts = Date.now().toString().slice(-6)
  return `e2e-${label}-${ts}-${nameCounter}`.slice(0, 30)
}

/**
 * Reliably replace a controlled (Formik/React) input's value. setValue alone can
 * leave the previous value because React re-renders the input from state.
 */
async function setInputValue(el: ReturnType<typeof $>, value: string): Promise<void> {
  await el.click()
  await browser.keys(['Control', 'a'])
  await browser.keys(['Delete'])
  if (value.length) await el.addValue(value)
}

/**
 * Return to HomePage in the SAME session: clear active-project ids (so
 * pickInitialScreen -> 'home') and refresh the renderer. Backend + session-id
 * survive, so projects created earlier still exist.
 */
async function reloadToHome(): Promise<void> {
  await browser.execute(
    (projectKey: string, scenarioKey: string) => {
      try {
        localStorage.removeItem(projectKey)
        localStorage.removeItem(scenarioKey)
      } catch {
        /* storage disabled */
      }
    },
    ACTIVE_PROJECT_KEY,
    ACTIVE_SCENARIO_KEY
  )
  await browser.refresh()
  await waitForMainWindow()
  await HomePage.header.waitForDisplayed({ timeout: 30000 })
}

beforeEach(async () => {
  await reloadToHome()
})

/** Create a project (explicit name) and return home with its row present. */
async function createNamed(name: string): Promise<{ id: string; name: string }> {
  if (name.length > 30) throw new Error(`name too long for create: ${name}`)
  await HomePage.openCreateDialogViaSidebar()
  await HomePage.fillAndSubmitCreate(name, '12.34', '56.78')
  await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 20000 })
  await reloadToHome()
  await browser.waitUntil(async () => (await HomePage.rowIdForName(name)) !== null, {
    timeout: 15000,
    timeoutMsg: `Row for "${name}" never appeared after create`
  })
  const id = await HomePage.rowIdForName(name)
  if (id === null) throw new Error(`Could not resolve row id for ${name}`)
  return { id, name }
}

/** Create a project with a generated unique name and return home with its row. */
async function createProject(label: string): Promise<{ id: string; name: string }> {
  return createNamed(uniqueName(label))
}

/** The "Recent Projects" heading — the only h2 directly inside <main>. */
function recentProjectsHeading(): ReturnType<typeof $> {
  return $('main > h2')
}

describe('Recent Projects', () => {
  describe('list & headings', () => {
    it('RP1 — renders the "Recent Projects" heading above the table, with rows below it', async () => {
      const { id, name } = await createProject('rp1')
      await recentProjectsHeading().waitForDisplayed({ timeout: 15000 })
      await expect(recentProjectsHeading()).toHaveText(MSG.heading)
      await expect(HomePage.projectsTable).toBeDisplayed()
      await expect(HomePage.row(id)).toBeDisplayed()
      await expect(HomePage.rowNameCell(id)).toHaveText(name)
    })

    it('RP2 — the three column headers render Name / Last Updated / Size', async () => {
      // Provision one row so the table (not the EmptyState) is what renders.
      await createProject('rp2')
      await HomePage.sortButton('name').waitForDisplayed({ timeout: 15000 })
      await expect(HomePage.sortButton('name')).toHaveText('Name', { containing: true })
      await expect(HomePage.sortButton('last_updated')).toHaveText('Last Updated', {
        containing: true
      })
      await expect(HomePage.sortButton('size')).toHaveText('Size', { containing: true })
    })

    it('RP15 — an empty result shows the EmptyState title and body copy', async () => {
      // Force the EmptyState regardless of leftover projects by filtering to nothing.
      await HomePage.search('zzzqqq___nomatch')
      await HomePage.emptyStateCreateButton.waitForDisplayed({ timeout: 15000 })
      const body = HomePage.projectsTable.$(`p*=${MSG.emptyBody}`)
      await body.waitForDisplayed({ timeout: 10000 })
      await expect(body).toHaveText(MSG.emptyBody)
      await expect(HomePage.emptyStateCreateButton).toHaveText('Add New Project', {
        containing: true
      })
      await HomePage.clearSearch()
    })
  })

  describe('search — special characters', () => {
    it('RP21 — regex-meta characters in the search box filter literally without crashing', async () => {
      const { id } = await createProject('rp21')
      // Feed every regex-meta char; a literal-substring filter yields no match and
      // never throws. The table must stay mounted and the EmptyState must appear.
      await HomePage.search('[ ]( )*+.\\^$?')
      await HomePage.emptyStateCreateButton.waitForDisplayed({ timeout: 10000 })
      await browser.waitUntil(async () => !(await HomePage.row(id).isExisting()), {
        timeout: 10000,
        timeoutMsg: 'Row was not filtered out by the special-character query'
      })
      await expect(HomePage.projectsTable).toBeDisplayed()
      // Clearing the filter restores the row — proves the input recovered cleanly.
      await HomePage.clearSearch()
      await browser.waitUntil(async () => HomePage.row(id).isDisplayed().catch(() => false), {
        timeout: 10000
      })
    })

    it('RP29 — a special-character substring filters to its matching project', async () => {
      // Selector-safe special chars (avoids " \' [ ] < > &); the unique tag keeps
      // the match exclusive to this test's row.
      const ts = Date.now().toString().slice(-4)
      const special = `+#(z)${ts}`
      const { id, name } = await createNamed(`rp29-${special}`)
      const other = await createProject('rp29other')
      await HomePage.search(special)
      await browser.waitUntil(async () => HomePage.row(id).isDisplayed().catch(() => false), {
        timeout: 10000,
        timeoutMsg: 'Special-character substring did not match its own row'
      })
      await browser.waitUntil(async () => !(await HomePage.row(other.id).isExisting()), {
        timeout: 10000,
        timeoutMsg: 'A non-matching row leaked through the special-character filter'
      })
      await expect(HomePage.rowNameCell(id)).toHaveText(name)
      await HomePage.clearSearch()
    })
  })

  describe('delete — multiple & permanence', () => {
    it('RP18 — several own projects delete sequentially, each row removed independently', async () => {
      const a = await createProject('rp18a')
      const b = await createProject('rp18b')
      const c = await createProject('rp18c')
      for (const target of [a, b, c]) {
        await HomePage.openRowMenu(target.name)
        await HomePage.requestDelete(target.id)
        await expect(HomePage.deleteHeading).toHaveText(`Delete ${target.name}`)
        await HomePage.confirmDelete()
        await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
        await browser.waitUntil(async () => !(await HomePage.row(target.id).isExisting()), {
          timeout: 15000,
          timeoutMsg: `Row for "${target.name}" never disappeared`
        })
      }
      // The earlier deletions stay gone after the last one (no resurrection).
      await expect(await HomePage.row(a.id).isExisting()).toBe(false)
      await expect(await HomePage.row(b.id).isExisting()).toBe(false)
      await expect(await HomePage.row(c.id).isExisting()).toBe(false)
    })

    it('RP10 — confirm permanently removes the project (row absent after a re-fetch)', async () => {
      const { id, name } = await createProject('rp10')
      await HomePage.openRowMenu(name)
      await HomePage.requestDelete(id)
      await HomePage.confirmDelete()
      await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
      await browser.waitUntil(async () => !(await HomePage.row(id).isExisting()), {
        timeout: 15000,
        timeoutMsg: 'Deleted row never disappeared in-session'
      })
      // reloadToHome refreshes the renderer and re-reads the backend list.
      await reloadToHome()
      await expect(await HomePage.rowIdForName(name)).toBe(null)
      await expect(await HomePage.row(id).isExisting()).toBe(false)
    })

    it('RP19 — a deleted project does not reappear after reloadToHome', async () => {
      const survivor = await createProject('rp19keep')
      const { id, name } = await createProject('rp19del')
      await HomePage.openRowMenu(name)
      await HomePage.requestDelete(id)
      await HomePage.confirmDelete()
      await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
      await browser.waitUntil(async () => !(await HomePage.row(id).isExisting()), {
        timeout: 15000
      })
      await reloadToHome()
      // The deleted one stays absent; the untouched sibling is still present.
      await expect(await HomePage.row(id).isExisting()).toBe(false)
      await browser.waitUntil(async () => (await HomePage.rowIdForName(survivor.name)) !== null, {
        timeout: 15000,
        timeoutMsg: 'Untouched sibling project went missing after reload'
      })
    })
  })

  describe('delete — concurrency guards', () => {
    it('RP26 — double-clicking the kebab Delete item opens exactly one delete dialog', async () => {
      const { id, name } = await createProject('rp26')
      await HomePage.openRowMenu(name)
      const item = HomePage.deleteMenuItem(id)
      await item.waitForDisplayed({ timeout: 10000 })
      // Second click can't re-open the same item (the menu closes on first click,
      // detaching the node); tolerate the no-op so the race doesn't flake.
      await item.click()
      await item.click().catch(() => {})
      await HomePage.deleteDialog.waitForDisplayed({ timeout: 10000 })
      const dialogCount = await browser.execute(
        () => document.querySelectorAll('[data-testid="delete-project-dialog"]').length
      )
      await expect(dialogCount).toBe(1)
      await expect(HomePage.deleteHeading).toHaveText(`Delete ${name}`)
      // Tidy up: cancel out without deleting.
      await HomePage.deleteCancelButton.click()
      await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    })

    it('RP27 — rapid double-confirm deletes the project exactly once', async () => {
      const { id, name } = await createProject('rp27')
      await HomePage.openRowMenu(name)
      await HomePage.requestDelete(id)
      await HomePage.deleteConfirmButton.waitForClickable()
      // Two quick clicks; the second is guarded (handleConfirmDelete returns early
      // while in-flight and the button disables), so only one delete fires.
      await HomePage.deleteConfirmButton.click()
      await HomePage.deleteConfirmButton.click().catch(() => {})
      await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
      await browser.waitUntil(async () => !(await HomePage.row(id).isExisting()), {
        timeout: 15000,
        timeoutMsg: 'Row never disappeared after confirm'
      })
      // Re-read the backend; the project is gone exactly once (no error state that
      // resurrects a row, no lingering duplicate).
      await reloadToHome()
      await expect(await HomePage.rowIdForName(name)).toBe(null)
    })

    it('RP31 — refreshing while the delete dialog is open performs no deletion', async () => {
      const { id, name } = await createProject('rp31')
      await HomePage.openRowMenu(name)
      await HomePage.requestDelete(id)
      await expect(HomePage.deleteDialog).toBeDisplayed()
      // Refresh BEFORE confirming — the in-session reload discards the open dialog
      // without dispatching a delete, so the project must survive.
      await reloadToHome()
      await browser.waitUntil(async () => (await HomePage.rowIdForName(name)) !== null, {
        timeout: 15000,
        timeoutMsg: 'Project was unexpectedly deleted by a mid-dialog refresh'
      })
      const resolved = await HomePage.rowIdForName(name)
      await expect(resolved).toBe(id)
    })
  })

  describe('scale', () => {
    it('RP28 — many own projects render and stay responsive (virtualized list)', async () => {
      const tag = `rp28-${Date.now().toString().slice(-5)}`
      const created: Array<{ id: string; name: string }> = []
      for (let i = 0; i < 12; i += 1) {
        created.push(await createNamed(`${tag}-${i}`))
      }
      // Narrow to just this test's rows; the list is virtualized so only the
      // visible window is in the DOM — search keeps the assertion deterministic.
      await HomePage.search(tag)
      await browser.waitUntil(
        async () => {
          const names = (await HomePage.visibleRowNames()).filter((n) => n.startsWith(tag))
          return names.length > 0
        },
        { timeout: 15000, timeoutMsg: 'No tagged rows rendered after provisioning many projects' }
      )
      // The search box stays interactive after the bulk insert.
      await expect(HomePage.searchbar).toBeEnabled()
      await expect(HomePage.projectsTable).toBeDisplayed()
      // Sorting the filtered subset still works under load (proves virtualization
      // + sort hold together for a large own-set).
      await HomePage.clickSort('name')
      await browser.waitUntil(async () => (await HomePage.ariaSort('name')) === 'ascending', {
        timeout: 10000
      })
      const sorted = (await HomePage.visibleRowNames()).filter((n) => n.startsWith(tag))
      const expectedFirst = created
        .map((c) => c.name)
        .sort((x, y) => x.localeCompare(y))
        .filter((n) => n.startsWith(tag))
      // The first visible sorted row is the alphabetically-first tagged name.
      await expect(sorted[0]).toBe(expectedFirst[0])
      await HomePage.clearSearch()
    })
  })
})
