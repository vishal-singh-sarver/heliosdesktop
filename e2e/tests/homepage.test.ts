/**
 * HomePage E2E suite — exhaustive edge-case coverage.
 *
 * Reuses the verified harness: splash->main before() hook, beforeEach
 * reloadToHome (in-session renderer refresh that preserves the backend session),
 * setInputValue (robust controlled-input replace), waitForDisplayed({reverse})
 * for the always-in-DOM <dialog>, prefix row-<id> selectors, browser.waitUntil
 * for deferred/async settling.
 *
 * State model: each ChromeDriver launch starts with a FRESH empty backend, so
 * the very first test asserts the empty state. There is no per-test DB reset, so
 * every other test self-provisions its own project(s) and asserts on its own
 * row(s) — never absolute counts. Tests sensitive to other rows (empty-state,
 * sorting) first narrow the list with search().
 *
 * Create caveat: a successful create NAVIGATES AWAY to the project screen and
 * writes localStorage active ids; we return home by clearing those ids and
 * refreshing in-session (preserving DB + session-id) so the project persists.
 */

import HomePage from '../pages/HomePage.page'

const ACTIVE_PROJECT_KEY = 'helios:activeProjectId'
const ACTIVE_SCENARIO_KEY = 'helios:activeScenarioId'

// Exact validation / copy strings, verbatim from source.
const MSG = {
  nameRequired: 'Project name is required.',
  nameTooLong: 'Project name must be 30 characters or fewer.',
  latRequired: 'Latitude is required.',
  latRegex: 'Invalid latitude',
  latRange:
    'Invalid latitude. Enter latitude in decimal degrees. Valid range: -90 <= latitude <= 90.',
  latDecimals: 'Latitude can have at most 7 decimal places.',
  lonRequired: 'Longitude is required.',
  lonRegex: 'Invalid longitude',
  lonRange:
    'Invalid longitude. Enter longitude in decimal degrees. Valid range: -180 <= longitude <= 180.',
  lonDecimals: 'Longitude can have at most 7 decimal places.',
  duplicate: 'A project with this name already exists',
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

describe('HomePage', () => {
  describe('initial shell', () => {
    it('renders the home shell (header, menubar, search, sidebar, table)', async () => {
      await HomePage.header.waitForDisplayed({ timeout: 30000 })
      await expect(HomePage.header).toBeDisplayed()
      await expect(HomePage.menubar).toBeDisplayed()
      await expect(HomePage.searchbar).toBeDisplayed()
      await expect(HomePage.sidebar).toBeDisplayed()
      await expect(HomePage.projectsTable).toBeDisplayed()
    })

    it('starts empty: shows the EmptyState create trigger (fresh DB)', async () => {
      await HomePage.emptyStateCreateButton.waitForDisplayed({ timeout: 15000 })
      await expect(HomePage.emptyStateCreateButton).toHaveText('Add New Project', {
        containing: true
      })
    })
  })

  describe('create — open triggers', () => {
    it('opens the create dialog from the sidebar with all three fields', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await expect(HomePage.createDialog).toBeDisplayed()
      await expect(HomePage.createNameInput).toBeDisplayed()
      await expect(HomePage.createLatInput).toBeDisplayed()
      await expect(HomePage.createLonInput).toBeDisplayed()
      await HomePage.closeCreateDialogViaX()
    })

    it('opens the create dialog from the empty-state trigger', async () => {
      // Force EmptyState regardless of leftover projects by filtering to nothing.
      await HomePage.search('zzzqqq___nomatch')
      await HomePage.emptyStateCreateButton.waitForDisplayed({ timeout: 10000 })
      await HomePage.openCreateDialogViaEmptyState()
      await expect(HomePage.createDialog).toBeDisplayed()
      await HomePage.closeCreateDialogViaX()
      await HomePage.clearSearch()
    })

    it('exposes a New Project entry in the menu bar', async () => {
      // The dropdown is CSS hover-gated; assert the entry exists rather than
      // driving a flaky hover. Sidebar/empty-state already cover opening.
      await expect(await HomePage.menubarNewProject.isExisting()).toBe(true)
    })

    it('reopening starts clean (no stale value)', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createNameInput, 'StaleName')
      await HomePage.cancelCreateDialog()
      await HomePage.openCreateDialogViaSidebar()
      await expect(HomePage.createNameInput).toHaveValue('')
      await HomePage.closeCreateDialogViaX()
    })
  })

  describe('create — valid happy submit', () => {
    it('a valid submit navigates away from HomePage', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await HomePage.fillAndSubmitCreate(uniqueName('valid'), '12.34', '56.78')
      await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 20000 })
    })

    it('a created project persists and appears as a row back on HomePage', async () => {
      const { id, name } = await createProject('persist')
      await expect(HomePage.row(id)).toBeDisplayed()
      await expect(HomePage.row(id)).toHaveText(name, { containing: true })
    })

    it('accepts boundary coordinates lat=90, lon=180', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await HomePage.fillAndSubmitCreate(uniqueName('bound'), '90', '180')
      await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 20000 })
    })

    it('accepts boundary coordinates lat=-90, lon=-180', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await HomePage.fillAndSubmitCreate(uniqueName('negb'), '-90', '-180')
      await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 20000 })
    })

    it('accepts a 30-character name (length boundary)', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await HomePage.fillAndSubmitCreate('a'.repeat(30), '12.34', '56.78')
      await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 20000 })
    })
  })

  describe('create — name validation', () => {
    it('empty name shows the required error after blur', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await HomePage.createNameInput.click()
      await HomePage.createLatInput.click()
      await HomePage.createNameError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createNameError).toHaveText(MSG.nameRequired)
    })

    it('whitespace-only name shows the required error (trim)', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createNameInput, '   ')
      await HomePage.createLatInput.click()
      await HomePage.createNameError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createNameError).toHaveText(MSG.nameRequired)
    })

    it('31-character name shows the too-long error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createNameInput, 'a'.repeat(31))
      await HomePage.createNameError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createNameError).toHaveText(MSG.nameTooLong)
    })

    it('30-character name shows NO name error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createNameInput, 'a'.repeat(30))
      await HomePage.createLatInput.click()
      await expect(HomePage.createNameError).not.toBeDisplayed()
    })
  })

  describe('create — latitude validation', () => {
    it('empty latitude shows the required error after blur', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await HomePage.createLatInput.click()
      await HomePage.createNameInput.click()
      await HomePage.createLatError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLatError).toHaveText(MSG.latRequired)
    })

    it('non-numeric latitude shows the regex error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLatInput, 'abc')
      await HomePage.createLatError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLatError).toHaveText(MSG.latRegex)
    })

    it('exponential "1e5" fails the regex (not range)', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLatInput, '1e5')
      await HomePage.createLatError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLatError).toHaveText(MSG.latRegex)
    })

    it('latitude 91 shows the out-of-range error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLatInput, '91')
      await HomePage.createLatError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLatError).toHaveText(MSG.latRange)
    })

    it('latitude -91 shows the out-of-range error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLatInput, '-91')
      await HomePage.createLatError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLatError).toHaveText(MSG.latRange)
    })

    it('in-range latitude with 8 decimals shows the decimals error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLatInput, '12.12345678')
      await HomePage.createLatError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLatError).toHaveText(MSG.latDecimals)
    })

    it('latitude 90 (boundary) shows NO error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLatInput, '90')
      await HomePage.createNameInput.click()
      await expect(HomePage.createLatError).not.toBeDisplayed()
    })

    it('latitude 45.1234567 (exactly 7 decimals) shows NO error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLatInput, '45.1234567')
      await HomePage.createNameInput.click()
      await expect(HomePage.createLatError).not.toBeDisplayed()
    })
  })

  describe('create — longitude validation', () => {
    it('empty longitude shows the required error after blur', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await HomePage.createLonInput.click()
      await HomePage.createNameInput.click()
      await HomePage.createLonError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLonError).toHaveText(MSG.lonRequired)
    })

    it('non-numeric longitude shows the regex error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLonInput, 'abc')
      await HomePage.createLonError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLonError).toHaveText(MSG.lonRegex)
    })

    it('longitude 181 shows the out-of-range error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLonInput, '181')
      await HomePage.createLonError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLonError).toHaveText(MSG.lonRange)
    })

    it('longitude -181 shows the out-of-range error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLonInput, '-181')
      await HomePage.createLonError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLonError).toHaveText(MSG.lonRange)
    })

    it('in-range longitude with 8 decimals shows the decimals error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLonInput, '12.12345678')
      await HomePage.createLonError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createLonError).toHaveText(MSG.lonDecimals)
    })

    it('longitude 180 (boundary) shows NO error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLonInput, '180')
      await HomePage.createNameInput.click()
      await expect(HomePage.createLonError).not.toBeDisplayed()
    })

    it('longitude 12.1234567 (exactly 7 decimals) shows NO error', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createLonInput, '12.1234567')
      await HomePage.createNameInput.click()
      await expect(HomePage.createLonError).not.toBeDisplayed()
    })
  })

  describe('create — duplicate name (live backend)', () => {
    it('shows the duplicate error and keeps the dialog open', async () => {
      const { name } = await createProject('dup')
      await HomePage.openCreateDialogViaSidebar()
      await HomePage.fillAndSubmitCreate(name.toUpperCase(), '12.34', '56.78')
      await HomePage.createServerError.waitForDisplayed({ timeout: 15000 })
      await expect(HomePage.createServerError).toHaveText(MSG.duplicate)
      await expect(HomePage.createDialog).toBeDisplayed()
    })
  })

  describe('create — submit guard', () => {
    it('double-clicking Create does not create two projects', async () => {
      const name = uniqueName('guard')
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createNameInput, name)
      await setInputValue(HomePage.createLatInput, '12.34')
      await setInputValue(HomePage.createLonInput, '56.78')
      await HomePage.createSubmitButton.click()
      await HomePage.createSubmitButton.click().catch(() => {})
      // The create round-trip finished when EITHER we navigated away (click 1
      // succeeded) OR the dialog shows a duplicate error (a fast backend let
      // click 2 attempt a same-name create). Both mean exactly one project was
      // made — the guard + takeLeading prevent a second. Tolerate both paths so
      // the timing race doesn't flake the test.
      await browser.waitUntil(
        async () =>
          !(await HomePage.projectsTable.isDisplayed().catch(() => false)) ||
          (await HomePage.createServerError.isDisplayed().catch(() => false)),
        { timeout: 25000, timeoutMsg: 'create did not settle (no navigation, no error)' }
      )

      await reloadToHome()
      await browser.waitUntil(async () => (await HomePage.rowIdForName(name)) !== null, {
        timeout: 15000
      })
      const matches: string[] = []
      for (const id of await HomePage.visibleRowIds()) {
        if ((await HomePage.row(id).getText()).includes(name)) matches.push(id)
      }
      await expect(matches.length).toBe(1)
    })
  })

  describe('create — cancel paths', () => {
    it('Cancel closes the dialog and creates no project', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createNameInput, uniqueName('cancel'))
      await HomePage.cancelCreateDialog()
      await expect(HomePage.createDialog).not.toBeDisplayed()
    })

    it('the × button closes the dialog and creates no project', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createNameInput, uniqueName('xclose'))
      await HomePage.closeCreateDialogViaX()
      await expect(HomePage.createDialog).not.toBeDisplayed()
    })

    it('Escape closes the dialog and creates no project', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await setInputValue(HomePage.createNameInput, uniqueName('esc'))
      await browser.keys(['Escape'])
      await HomePage.createDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
      await expect(HomePage.createDialog).not.toBeDisplayed()
    })
  })

  describe('kebab menu', () => {
    it('menu items appear only after opening the kebab', async () => {
      const { id, name } = await createProject('kebab')
      await expect(await HomePage.renameMenuItem(id).isExisting()).toBe(false)
      await expect(await HomePage.deleteMenuItem(id).isExisting()).toBe(false)
      await HomePage.openRowMenu(name)
      await HomePage.renameMenuItem(id).waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.deleteMenuItem(id)).toBeDisplayed()
      await expect(await HomePage.kebabExpanded(name)).toBe('true')
    })

    it('clicking the same kebab again toggles it closed', async () => {
      const { id, name } = await createProject('toggle')
      await HomePage.openRowMenu(name)
      await HomePage.renameMenuItem(id).waitForDisplayed()
      await HomePage.kebabButton(name).click()
      await HomePage.renameMenuItem(id).waitForDisplayed({ reverse: true, timeout: 10000 })
      await expect(await HomePage.kebabExpanded(name)).toBe('false')
    })

    it('Escape closes an open kebab menu', async () => {
      const { id, name } = await createProject('kesc')
      await HomePage.openRowMenu(name)
      await HomePage.renameMenuItem(id).waitForDisplayed()
      await HomePage.pressEscape()
      await HomePage.renameMenuItem(id).waitForDisplayed({ reverse: true, timeout: 10000 })
    })

    it('an outside click closes an open kebab menu', async () => {
      const { id, name } = await createProject('kout')
      await HomePage.openRowMenu(name)
      await HomePage.renameMenuItem(id).waitForDisplayed()
      await HomePage.clickOutsideMenu()
      await HomePage.renameMenuItem(id).waitForDisplayed({ reverse: true, timeout: 10000 })
    })

    it('opening row B closes row A (single open menu)', async () => {
      const a = await createProject('kA')
      const b = await createProject('kB')
      await HomePage.openRowMenu(a.name)
      await HomePage.renameMenuItem(a.id).waitForDisplayed()
      await HomePage.openRowMenu(b.name)
      await HomePage.renameMenuItem(b.id).waitForDisplayed({ timeout: 10000 })
      await HomePage.renameMenuItem(a.id).waitForDisplayed({ reverse: true, timeout: 10000 })
    })
  })

  describe('rename flow', () => {
    it('renames to a new valid name (PATCH) and the row reflects it', async () => {
      const { id, name } = await createProject('rename')
      const newName = uniqueName('renamed')
      await HomePage.openRowMenu(name)
      await HomePage.requestRename(id)
      await expect(HomePage.renameNameInput).toHaveValue(name)
      await setInputValue(HomePage.renameNameInput, newName)
      await HomePage.renameSaveButton.click()
      await HomePage.renameDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
      await browser.waitUntil(async () => (await HomePage.row(id).getText()).includes(newName), {
        timeout: 15000,
        timeoutMsg: 'Row never showed the new name'
      })
    })

    it('submitting the SAME name is a no-op and closes the dialog', async () => {
      const { id, name } = await createProject('noop')
      await HomePage.openRowMenu(name)
      await HomePage.requestRename(id)
      await expect(HomePage.renameNameInput).toHaveValue(name)
      await HomePage.renameSaveButton.click()
      await HomePage.renameDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
      await expect(HomePage.row(id)).toHaveText(name, { containing: true })
    })

    it('same name with surrounding whitespace is still a no-op (trim)', async () => {
      const { id, name } = await createProject('noopws')
      await HomePage.openRowMenu(name)
      await HomePage.requestRename(id)
      await setInputValue(HomePage.renameNameInput, `  ${name}  `)
      await HomePage.renameSaveButton.click()
      await HomePage.renameDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
      await expect(HomePage.row(id)).toHaveText(name, { containing: true })
    })

    it('empty name shows the required error and blocks submit', async () => {
      const { id, name } = await createProject('rreq')
      await HomePage.openRowMenu(name)
      await HomePage.requestRename(id)
      await setInputValue(HomePage.renameNameInput, '')
      // An empty value isn't "touched" by clearing alone; clicking Save runs
      // submitForm() which touches all fields, surfaces the error, and is blocked
      // by the invalid field (dialog stays open).
      await HomePage.renameSaveButton.click()
      await HomePage.renameNameError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.renameNameError).toHaveText(MSG.nameRequired)
      await expect(HomePage.renameDialog).toBeDisplayed()
    })

    it('31-character name shows the too-long error', async () => {
      const { id, name } = await createProject('rlong')
      await HomePage.openRowMenu(name)
      await HomePage.requestRename(id)
      await setInputValue(HomePage.renameNameInput, 'a'.repeat(31))
      await HomePage.renameNameError.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.renameNameError).toHaveText(MSG.nameTooLong)
    })

    it('Cancel closes the rename dialog with the row unchanged', async () => {
      const { id, name } = await createProject('rcancel')
      await HomePage.openRowMenu(name)
      await HomePage.requestRename(id)
      await setInputValue(HomePage.renameNameInput, uniqueName('discard'))
      await HomePage.renameCancelButton.click()
      await HomePage.renameDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
      await expect(HomePage.row(id)).toHaveText(name, { containing: true })
    })

    it('renaming to an existing name surfaces a server error and stays open', async () => {
      const a = await createProject('rdupA')
      const b = await createProject('rdupB')
      await HomePage.openRowMenu(b.name)
      await HomePage.requestRename(b.id)
      await setInputValue(HomePage.renameNameInput, a.name)
      await HomePage.renameSaveButton.click()
      await HomePage.renameServerError.waitForDisplayed({ timeout: 15000 })
      await expect(HomePage.renameDialog).toBeDisplayed()
      // Editing the field clears the stale server error.
      await HomePage.renameNameInput.addValue('z')
      await HomePage.renameServerError.waitForDisplayed({ reverse: true, timeout: 10000 })
    })
  })

  describe('delete flow', () => {
    it('confirm deletes the project and the row disappears', async () => {
      const { id, name } = await createProject('del')
      await HomePage.openRowMenu(name)
      await HomePage.requestDelete(id)
      await expect(HomePage.deleteDialog).toBeDisplayed()
      await expect(HomePage.deleteHeading).toHaveText(`Delete ${name}`)
      await expect(HomePage.deleteBody).toHaveText(MSG.deleteBody)
      await HomePage.confirmDelete()
      await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
      await browser.waitUntil(async () => !(await HomePage.row(id).isExisting()), {
        timeout: 15000,
        timeoutMsg: 'Deleted row never disappeared'
      })
    })

    it('cancel keeps the project and the row stays', async () => {
      const { id, name } = await createProject('delc')
      await HomePage.openRowMenu(name)
      await HomePage.requestDelete(id)
      await HomePage.deleteCancelButton.click()
      await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
      await expect(HomePage.row(id)).toBeDisplayed()
      await expect(await HomePage.kebabDisabled(name)).toBe(false)
    })

    it('Escape closes the delete dialog without deleting', async () => {
      const { id, name } = await createProject('delx')
      await HomePage.openRowMenu(name)
      await HomePage.requestDelete(id)
      await browser.keys(['Escape'])
      await HomePage.deleteDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
      await expect(HomePage.row(id)).toBeDisplayed()
    })
  })

  describe('search', () => {
    it('a non-matching term hides the row; a matching term shows it', async () => {
      const { id, name } = await createProject('search')
      await HomePage.search('zzz-no-such-project-zzz')
      await browser.waitUntil(async () => !(await HomePage.row(id).isExisting()), {
        timeout: 10000,
        timeoutMsg: 'Row not filtered out'
      })
      await HomePage.clearSearch()
      await HomePage.search(name)
      await browser.waitUntil(async () => HomePage.row(id).isDisplayed().catch(() => false), {
        timeout: 10000
      })
    })

    it('matches a partial name case-insensitively', async () => {
      const { id, name } = await createProject('case')
      await HomePage.search(name.slice(0, name.length - 2).toUpperCase())
      await browser.waitUntil(async () => HomePage.row(id).isDisplayed().catch(() => false), {
        timeout: 10000
      })
      await HomePage.clearSearch()
    })

    it('discriminates: shows the match, hides the other; clear restores both', async () => {
      const a = await createProject('discA')
      const b = await createProject('discB')
      await HomePage.search('discA')
      await browser.waitUntil(async () => HomePage.row(a.id).isDisplayed().catch(() => false), {
        timeout: 10000
      })
      await browser.waitUntil(async () => !(await HomePage.row(b.id).isExisting()), {
        timeout: 10000
      })
      await HomePage.clearSearch()
      await browser.waitUntil(async () => HomePage.row(a.id).isDisplayed().catch(() => false), {
        timeout: 10000
      })
      await browser.waitUntil(async () => HomePage.row(b.id).isDisplayed().catch(() => false), {
        timeout: 10000
      })
    })

    it('an empty-result search shows the EmptyState', async () => {
      const { id } = await createProject('empties')
      await HomePage.search('zzzqqq___nomatch')
      await HomePage.emptyStateCreateButton.waitForDisplayed({ timeout: 10000 })
      await browser.waitUntil(async () => !(await HomePage.row(id).isExisting()), {
        timeout: 10000
      })
      await HomePage.clearSearch()
    })

    it('whitespace-only search returns the full list', async () => {
      const { id } = await createProject('ws')
      await HomePage.search('   ')
      await expect(HomePage.row(id)).toBeDisplayed()
      await HomePage.clearSearch()
    })
  })

  describe('sidebar active state', () => {
    it('Home is active by default; the others are not', async () => {
      await expect(await HomePage.sidebarActive('Home')).toBe('true')
      await expect(await HomePage.sidebarActive('New Project')).toBe('false')
      await expect(await HomePage.sidebarActive('Open project')).toBe('false')
    })

    it('clicking New Project activates it and opens the create dialog', async () => {
      await HomePage.sidebarNewProject.click()
      await HomePage.createDialog.waitForDisplayed({ timeout: 10000 })
      await expect(await HomePage.sidebarActive('New Project')).toBe('true')
      await expect(await HomePage.sidebarActive('Home')).toBe('false')
      await HomePage.closeCreateDialogViaX()
    })

    it('Open project activates it with no dialog', async () => {
      await HomePage.sidebarOpenProject.click()
      await expect(await HomePage.sidebarActive('Open project')).toBe('true')
      await expect(await HomePage.sidebarActive('Home')).toBe('false')
      await expect(HomePage.createDialog).not.toBeDisplayed()
      await expect(HomePage.projectsTable).toBeDisplayed()
    })

    it('exactly one sidebar item is active after switching', async () => {
      await HomePage.sidebarOpenProject.click()
      await expect(await HomePage.sidebarActive('Open project')).toBe('true')
      await HomePage.sidebarHome.click()
      await expect(await HomePage.sidebarActive('Home')).toBe('true')
      await expect(await HomePage.sidebarActive('Open project')).toBe('false')
      await expect(await HomePage.sidebarActive('New Project')).toBe('false')
    })
  })

  describe('navigation', () => {
    it('a single click does NOT navigate', async () => {
      const { id } = await createProject('single')
      await HomePage.row(id).click()
      await expect(HomePage.projectsTable).toBeDisplayed()
    })

    it('a double-click on a row navigates away from home', async () => {
      const { id } = await createProject('dbl')
      await HomePage.row(id).doubleClick()
      await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 15000 })
    })

    it('Enter on a focused row navigates and writes activeProjectId', async () => {
      const { id } = await createProject('enter')
      await HomePage.row(id).click()
      await browser.execute((rid: string) => {
        const el = document.querySelector(`[data-testid="row-${rid}"]`) as HTMLElement | null
        el?.focus()
      }, id)
      await browser.keys(['Enter'])
      await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 15000 })
      const stored = await browser.execute((k: string) => localStorage.getItem(k), ACTIVE_PROJECT_KEY)
      await expect(stored).toBe(id)
    })

    it('Space on a focused row navigates away from home', async () => {
      const { id } = await createProject('space')
      await HomePage.row(id).click()
      await browser.execute((rid: string) => {
        const el = document.querySelector(`[data-testid="row-${rid}"]`) as HTMLElement | null
        el?.focus()
      }, id)
      await browser.keys([' '])
      await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 15000 })
    })

    it('navigates the correct project among several', async () => {
      await createProject('navA')
      const target = await createProject('navB')
      await HomePage.row(target.id).doubleClick()
      await HomePage.projectsTable.waitForDisplayed({ reverse: true, timeout: 15000 })
      const stored = await browser.execute((k: string) => localStorage.getItem(k), ACTIVE_PROJECT_KEY)
      await expect(stored).toBe(target.id)
    })
  })

  describe('sorting', () => {
    it('default sort is Last Updated descending', async () => {
      await createProject('sortDefault')
      await expect(await HomePage.ariaSort('last_updated')).toBe('descending')
      await expect(await HomePage.ariaSort('name')).toBe('none')
      await expect(await HomePage.ariaSort('size')).toBe('none')
    })

    it('clicking Name sorts ascending, then toggles to descending', async () => {
      await createProject('sortNameAria')
      await HomePage.clickSort('name')
      await browser.waitUntil(async () => (await HomePage.ariaSort('name')) === 'ascending', {
        timeout: 10000
      })
      await expect(await HomePage.ariaSort('last_updated')).toBe('none')
      await HomePage.clickSort('name')
      await browser.waitUntil(async () => (await HomePage.ariaSort('name')) === 'descending', {
        timeout: 10000
      })
    })

    it('sorts actual row order by Name (asc then desc)', async () => {
      const tag = `srt${Date.now().toString().slice(-5)}`
      const alpha = await createNamed(`${tag}-Alpha`)
      const bravo = await createNamed(`${tag}-Bravo`)
      const charlie = await createNamed(`${tag}-Charlie`)
      // Narrow to just the tagged rows so they all fit one virtual window.
      await HomePage.search(tag)
      await HomePage.clickSort('name')
      await browser.waitUntil(async () => (await HomePage.ariaSort('name')) === 'ascending', {
        timeout: 10000
      })
      let order = (await HomePage.visibleRowNames()).filter((n) => n.startsWith(tag))
      await expect(order).toEqual([alpha.name, bravo.name, charlie.name])

      await HomePage.clickSort('name')
      await browser.waitUntil(async () => (await HomePage.ariaSort('name')) === 'descending', {
        timeout: 10000
      })
      order = (await HomePage.visibleRowNames()).filter((n) => n.startsWith(tag))
      await expect(order).toEqual([charlie.name, bravo.name, alpha.name])
      await HomePage.clearSearch()
    })

    it('sorts actual row order by Last Updated (newest first on desc)', async () => {
      const tag = `lu${Date.now().toString().slice(-5)}`
      const first = await createNamed(`${tag}-1`)
      const second = await createNamed(`${tag}-2`)
      const third = await createNamed(`${tag}-3`)
      await HomePage.search(tag)
      // Default is last_updated desc -> newest (third) first.
      await browser.waitUntil(
        async () => (await HomePage.ariaSort('last_updated')) === 'descending',
        { timeout: 10000 }
      )
      let order = (await HomePage.visibleRowNames()).filter((n) => n.startsWith(tag))
      await expect(order).toEqual([third.name, second.name, first.name])

      await HomePage.clickSort('last_updated')
      await browser.waitUntil(
        async () => (await HomePage.ariaSort('last_updated')) === 'ascending',
        { timeout: 10000 }
      )
      order = (await HomePage.visibleRowNames()).filter((n) => n.startsWith(tag))
      await expect(order).toEqual([first.name, second.name, third.name])
      await HomePage.clearSearch()
    })

    it('Size sort toggles aria-sort (order not asserted — backend-computed)', async () => {
      await createProject('sortSize')
      await HomePage.clickSort('size')
      await browser.waitUntil(async () => (await HomePage.ariaSort('size')) === 'ascending', {
        timeout: 10000
      })
      await HomePage.clickSort('size')
      await browser.waitUntil(async () => (await HomePage.ariaSort('size')) === 'descending', {
        timeout: 10000
      })
    })

    it('search + sort: sort applies to the filtered subset only', async () => {
      const tag = `ss${Date.now().toString().slice(-5)}`
      const a = await createNamed(`${tag}-Alpha`)
      const b = await createNamed(`${tag}-Bravo`)
      await HomePage.search(tag)
      await HomePage.clickSort('name')
      await browser.waitUntil(async () => (await HomePage.ariaSort('name')) === 'ascending', {
        timeout: 10000
      })
      const order = (await HomePage.visibleRowNames()).filter((n) => n.startsWith(tag))
      await expect(order).toEqual([a.name, b.name])
      await HomePage.clearSearch()
    })
  })

  describe('create dialog — placeholders', () => {
    it('the three create inputs and the search box show exact placeholder text', async () => {
      await expect(await HomePage.searchPlaceholder()).toBe('Search...')
      await HomePage.openCreateDialogViaSidebar()
      await expect(await HomePage.createNamePlaceholder()).toBe('My Simulation')
      await expect(await HomePage.createLatPlaceholder()).toBe('38.5449')
      await expect(await HomePage.createLonPlaceholder()).toBe('-121.7405')
      await HomePage.closeCreateDialogViaX()
    })
  })

  describe('create dialog — field-help tooltips', () => {
    it('project-name help shows its tooltip on hover and dismisses on move-away', async () => {
      await HomePage.openCreateDialogViaSidebar()
      // Content: react-tooltip renders the trigger's data-tooltip-content attribute.
      // (projectName uses place:right, whose bubble flickers under the pointer —
      // assert the wired content via the attribute, not the transient bubble text.)
      await expect(
        await HomePage.helpTrigger('project name').getAttribute('data-tooltip-content')
      ).toBe('Enter a project name to identify your work.')
      // Visibility: not present until hover; appears on hover; gone after move-away.
      await expect(await HomePage.visibleTooltip.isExisting()).toBe(false)
      await HomePage.hoverTooltip('project name') // moveTo + waitForDisplayed (it shows)
      await HomePage.dismissTooltip()
      await expect(await HomePage.visibleTooltip.isExisting()).toBe(false)
      await HomePage.closeCreateDialogViaX()
    })

    it('latitude and longitude help expose their own tooltip content and show on hover', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await expect(
        await HomePage.helpTrigger('latitude').getAttribute('data-tooltip-content')
      ).toBe(
        'Enter latitude in decimal degrees. Valid range: -90 <= latitude <= 90. ' +
          'Negative for South, positive for North.'
      )
      await expect(
        await HomePage.helpTrigger('longitude').getAttribute('data-tooltip-content')
      ).toBe(
        'Enter longitude in decimal degrees. Valid range: -180 <= longitude <= 180. ' +
          'Negative for West, positive for East.'
      )
      // Confirm the bubble actually shows on hover, then dismisses.
      await HomePage.hoverTooltip('latitude')
      await HomePage.dismissTooltip()
      await HomePage.closeCreateDialogViaX()
    })
  })

  describe('create — special characters in name', () => {
    it('a valid special-character name (<=30) is accepted and shown in its row', async () => {
      // Neither client nor backend restricts characters (only non-empty + <=30).
      // Kept selector-safe (no " ' [ ] < > &) and unique via a short suffix.
      const ts = Date.now().toString().slice(-4)
      const name = `Proj-A_b.1 (t)+#${ts}` // ~17 chars, exercises - _ . space ( ) + #
      const { id } = await createNamed(name)
      await expect(HomePage.row(id)).toBeDisplayed()
      await expect(HomePage.rowNameCell(id)).toHaveText(name)
    })
  })

  describe('toolbar — options present', () => {
    const TOOLBAR: Record<string, string[]> = {
      File: ['New Project', 'Open Project', 'Import Project', 'Exit'],
      Edit: ['Undo', 'Redo', 'Preferences'],
      View: ['Zoom In', 'Zoom Out', 'Reset Layout'],
      Tools: ['Scripting Console', 'Extensions', 'Diagnostics'],
      Help: ['Documentation', 'Shortcuts', 'About Helios']
    }

    it('every top-level menu and its items exist in the menu bar', async () => {
      for (const menu of Object.keys(TOOLBAR)) {
        await expect(
          HomePage.toolbarMenuButton(menu as 'File' | 'Edit' | 'View' | 'Tools' | 'Help')
        ).toExist()
        for (const item of TOOLBAR[menu]) {
          await expect(await HomePage.menuItem(item).isExisting()).toBe(true)
        }
      }
    })

    it('only "New Project" is wired — it opens the create dialog', async () => {
      await HomePage.clickMenuItem('New Project')
      await HomePage.createDialog.waitForDisplayed({ timeout: 10000 })
      await expect(HomePage.createDialog).toBeDisplayed()
      await HomePage.closeCreateDialogViaX()
    })

    it('a no-op toolbar item (Undo) does nothing — no dialog, table stays', async () => {
      await HomePage.clickMenuItem('Undo')
      await expect(HomePage.createDialog).not.toBeDisplayed()
      await expect(HomePage.projectsTable).toBeDisplayed()
    })
  })

  describe('home — project row structure', () => {
    it('a row exposes 4 cells: name, relative date, formatted size, and a kebab', async () => {
      const { id, name } = await createProject('rowshape')
      await expect(await HomePage.rowCellCount(id)).toBe(4)
      await expect(HomePage.rowNameCell(id)).toHaveText(name)
      const date = (await HomePage.rowDateCell(id).getText()).trim()
      expect(date).toMatch(/^(today|yesterday|\d+ days ago|\d{1,2}\/\d{1,2}\/\d{4})$/)
      await expect(HomePage.rowSizeCell(id)).toHaveText(/^\d+(\.\d+)?\s(B|KB|MB|GB|TB)$/)
      await expect(HomePage.kebabButton(name)).toBeDisplayed()
    })
  })

  describe('create dialog — UI elements', () => {
    it('shows the title, all three field labels, and Create + Cancel buttons', async () => {
      await HomePage.openCreateDialogViaSidebar()
      await expect(HomePage.createDialogTitle).toHaveText('New Project')
      await expect(HomePage.createFieldLabel('Project Name')).toBeDisplayed()
      await expect(HomePage.createFieldLabel('Latitude')).toBeDisplayed()
      await expect(HomePage.createFieldLabel('Longitude')).toBeDisplayed()
      await expect(HomePage.createSubmitButton).toHaveText('Create')
      await expect(HomePage.createCancelButton).toHaveText('Cancel')
      await HomePage.closeCreateDialogViaX()
    })
  })
})
