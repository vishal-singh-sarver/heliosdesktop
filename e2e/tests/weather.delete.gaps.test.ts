/**
 * Weather "Delete Data" E2E — coverage gaps for the toolbar Delete Data button
 * (Weather.deleteDataButton, aria-label "Delete uploaded weather file") and its
 * confirm dialog (Weather.deleteImportDialog, data-testid="delete-import-dialog").
 *
 * Ground truth (verified against WeatherToolbar.tsx + messages.ts + Dialog/index.tsx):
 *  - The dialog is a native <dialog> opened via showModal(): the backdrop is inert
 *    (modal) and ESC fires onCancel (preventDefault + onClose) so it closes WITHOUT
 *    deleting. On open the first focusable element (the × Close button,
 *    data-testid="dialog-close") receives focus.
 *  - messages.deleteImport = { dialogTitle: 'Delete', heading: 'Delete Data',
 *    body: 'Are you sure you want to delete this? This action cannot be undone.',
 *    confirmButton: 'Delete', cancelButton: 'Cancel' }. The <dialog aria-label>
 *    and <h2> show the dialogTitle ('Delete'); the body <h3> shows the heading.
 *  - Delete Data is DISABLED on an empty scenario (canDelete = hasData && !clearing).
 *  - isDeleteDialogOpen is a boolean, so repeated clicks never mount a second
 *    dialog instance.
 *
 * Mirrors the sibling weather specs: same preamble (before/beforeEach), the local
 * enterWeather() helper, and the reopen-via-Home pattern from weather.crud.test.ts.
 */
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import { enterProject, reloadToHome, waitForMainWindow } from '../support/harness'

/**
 * Verbatim copy of messages.deleteImport (src/renderer/src/containers/Weather/
 * messages.ts). Inlined — not imported — because the e2e tsconfig only includes
 * tests/pages/persist, matching the sibling specs that assert string literals
 * directly. Keep in sync with the source if the copy changes.
 */
const deleteImport = {
  dialogTitle: 'Delete',
  heading: 'Delete Data',
  body: 'Are you sure you want to delete this? This action cannot be undone.',
  confirmButton: 'Delete',
  cancelButton: 'Cancel'
} as const

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

/** Enter a project and wait for the Weather table to be mounted + seeded. */
async function enterWeather(label = 'del'): Promise<{ id: string; name: string }> {
  const project = await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
  return project
}

/** Open the delete-import dialog from the toolbar (data must already exist). */
async function openDeleteDialog(): Promise<void> {
  await Weather.deleteDataButton.click()
  await Weather.deleteImportDialog.waitForDisplayed({ timeout: 10000 })
}

describe('Weather Delete Data — dialog copy', () => {
  it('shows the exact heading and body strings from messages.deleteImport', async () => {
    await enterWeather('copy')
    await Weather.addRows(1)
    await openDeleteDialog()
    // The dialog title ('Delete') is the <h2>; the confirmation heading is the <h3>.
    await expect(Weather.deleteImportDialog.$('h3')).toHaveText(deleteImport.heading)
    await expect(Weather.deleteImportDialog.$('p')).toHaveText(deleteImport.body)
  })

  it('labels the buttons Cancel and Delete (not Yes/No)', async () => {
    await enterWeather('btns')
    await Weather.addRows(1)
    await openDeleteDialog()
    await expect(Weather.deleteImportDialog.$(`button=${deleteImport.cancelButton}`)).toBeDisplayed()
    await expect(Weather.deleteImportDialog.$(`button=${deleteImport.confirmButton}`)).toBeDisplayed()
  })

  it('uses the dialogTitle string in the dialog header and aria-label', async () => {
    await enterWeather('title')
    await Weather.addRows(1)
    await openDeleteDialog()
    await expect(Weather.deleteImportDialog).toHaveAttribute(
      'aria-label',
      deleteImport.dialogTitle
    )
    await expect(Weather.deleteImportDialog.$('h2')).toHaveText(deleteImport.dialogTitle)
  })
})

describe('Weather Delete Data — Escape cancels', () => {
  it('Escape closes the dialog and keeps the data', async () => {
    await enterWeather('esc')
    await Weather.addRows(2)
    await expect(await Weather.rowCount()).toBe(2)
    await openDeleteDialog()
    await browser.keys(['Escape'])
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(await Weather.rowCount()).toBe(2)
    // Delete Data is still available because the rows survived.
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(true)
  })
})

describe('Weather Delete Data — modal focus & inertness', () => {
  it('focuses an element inside the dialog when it opens', async () => {
    await enterWeather('focus')
    await Weather.addRows(1)
    await openDeleteDialog()
    // showModal() focuses the first focusable (the × Close button) and the active
    // element must live inside the open <dialog>.
    const focusInside = await browser.execute(() => {
      const dialog = document.querySelector('[data-testid="delete-import-dialog"]')
      const active = document.activeElement
      return dialog != null && active != null && dialog.contains(active)
    })
    expect(focusInside).toBe(true)
  })

  it('opens as a modal <dialog> (background made inert via showModal)', async () => {
    await enterWeather('modal')
    await Weather.addRows(1)
    await openDeleteDialog()
    // A modal native dialog reports matches(':modal'); this is what makes the
    // backdrop inert and the rest of the page non-interactive.
    const isModal = await browser.execute(() => {
      const dialog = document.querySelector<HTMLDialogElement>(
        '[data-testid="delete-import-dialog"]'
      )
      return dialog != null && dialog.open && dialog.matches(':modal')
    })
    expect(isModal).toBe(true)
  })
})

describe('Weather Delete Data — single dialog instance', () => {
  it('rapid clicks on Delete Data open exactly one dialog', async () => {
    await enterWeather('rapid')
    await Weather.addRows(2)
    // Fire three clicks in immediate succession. A real WebDriver click on the
    // 2nd/3rd is intercepted by the modal the 1st opens (that interception IS the
    // dedup we want, but it throws), so dispatch all three in-page, then assert
    // only ONE dialog opened.
    await browser.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        '[aria-label="Delete uploaded weather file"]'
      )
      btn?.click()
      btn?.click()
      btn?.click()
    })
    await Weather.deleteImportDialog.waitForDisplayed({ timeout: 10000 })
    // Exactly one delete-import-dialog node exists and it is shown once.
    const dialogs = await $$('[data-testid="delete-import-dialog"]')
    expect(dialogs.length).toBe(1)
    await expect(Weather.deleteImportDialog).toBeDisplayed()
    // No crash: the data is untouched and Cancel still closes the single dialog.
    await Weather.deleteImportDialog.$(`button=${deleteImport.cancelButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(await Weather.rowCount()).toBe(2)
  })
})

describe('Weather Delete Data — a11y tab order', () => {
  it('Tab moves focus to the Cancel and Delete buttons', async () => {
    await enterWeather('tab')
    await Weather.addRows(1)
    await openDeleteDialog()
    // Walk forward with Tab and collect the focused button labels; the native
    // <dialog> focus scope must reach both action buttons.
    const seen = new Set<string>()
    const cancel = deleteImport.cancelButton
    const confirm = deleteImport.confirmButton
    for (let i = 0; i < 6; i++) {
      const label = await browser.execute(() => {
        const el = document.activeElement as HTMLElement | null
        return el && el.tagName === 'BUTTON' ? (el.textContent ?? '').trim() : null
      })
      if (label === cancel) seen.add(cancel)
      if (label === confirm) seen.add(confirm)
      if (seen.has(cancel) && seen.has(confirm)) break
      await browser.keys(['Tab'])
    }
    expect(seen.has(cancel)).toBe(true)
    expect(seen.has(confirm)).toBe(true)
  })
})

describe('Weather Delete Data — confirm clears the table', () => {
  it('confirming a large dataset clears every row and re-disables Delete Data', async () => {
    await enterWeather('large')
    await Weather.addRows(500)
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 20000,
      timeoutMsg: 'large dataset never rendered'
    })
    await openDeleteDialog()
    await Weather.deleteImportDialog.$(`button=${deleteImport.confirmButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: 30000,
      timeoutMsg: 'large dataset did not clear after Delete Data'
    })
    // Blank state: with no data, Delete Data disables again.
    await browser.waitUntil(async () => !(await Weather.deleteDataButton.isEnabled()), {
      timeout: 15000,
      timeoutMsg: 'Delete Data stayed enabled after clearing all data'
    })
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(false)
  })

  it('after delete the table returns to a single Date-Time column', async () => {
    await enterWeather('blank')
    await Weather.addColumn('temperature')
    await Weather.waitForColumn('temperature')
    await Weather.addRows(2)
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) === 2, {
      timeout: 15000,
      timeoutMsg: 'expected Date-Time + temperature columns before delete'
    })
    await openDeleteDialog()
    await Weather.deleteImportDialog.$(`button=${deleteImport.confirmButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: 20000,
      timeoutMsg: 'rows did not clear after Delete Data'
    })
    // Managed columns are removed too — only the Date-Time column remains.
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) === 1, {
      timeout: 20000,
      timeoutMsg: 'managed columns were not removed after Delete Data'
    })
    await expect(await Weather.colIdForName('temperature')).toBe(null)
  })
})

describe('Weather Delete Data — cancel keeps everything', () => {
  it('Cancel keeps the rows, columns and an enabled Delete Data button', async () => {
    await enterWeather('keep')
    await Weather.addColumn('pressure')
    const colId = await Weather.waitForColumn('pressure')
    await Weather.addRows(2)
    const beforeCols = await Weather.dataColumnCount()
    await openDeleteDialog()
    await Weather.deleteImportDialog.$(`button=${deleteImport.cancelButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(await Weather.rowCount()).toBe(2)
    await expect(await Weather.dataColumnCount()).toBe(beforeCols)
    await expect(Weather.columnNameInput(colId)).toBeDisplayed()
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(true)
  })
})

describe('Weather Delete Data — persistence across reopen', () => {
  it('the deletion survives reopening the same project', async () => {
    const { name } = await enterWeather('persist')
    await Weather.addRows(3)
    await expect(await Weather.rowCount()).toBe(3)
    await openDeleteDialog()
    await Weather.deleteImportDialog.$(`button=${deleteImport.confirmButton}`).click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: 20000,
      timeoutMsg: 'rows did not clear after Delete Data'
    })

    // Reopen the SAME project from Home (backend session persists within the run).
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const homeId = await HomePage.rowIdForName(name)
    if (homeId === null) throw new Error(`could not find Home row for ${name}`)
    await HomePage.row(homeId).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })

    // Data stays deleted, and Delete Data is disabled again (no data).
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: 20000,
      timeoutMsg: 'deleted rows reappeared after reopening the project'
    })
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(false)
  })
})
