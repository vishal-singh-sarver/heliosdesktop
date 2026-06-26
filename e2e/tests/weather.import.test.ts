/**
 * Weather CSV import E2E — the Import Wizard (open/close/cancel, file pick via a
 * stubbed native dialog, a full happy-path import) and Delete Data. Built from
 * the verified matrix (design doc Section 5).
 *
 * Native file dialog: WDIO cannot drive the OS picker, so stubFileImport()
 * re-registers the main-process dialog:openFile + fs:readFile IPC handlers to
 * return a fixture path + contents (the saga calls openFile then readFile).
 *
 * The wizard auto-maps a `datetime`-named column (ImportWizard findHeaderByKeyword)
 * and auto-detects the ISO format, so a simple fixture steps straight through.
 */
import Weather from '../pages/Weather.page'
import { enterProject, reloadToHome, stubFileImport, waitForMainWindow } from '../support/harness'

const CSV = ['datetime,temperature', '2026-01-01T00:00:00Z,10', '2026-01-01T01:00:00Z,11'].join('\n')

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

async function enterWeather(label = 'imp'): Promise<void> {
  await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
}

describe('Weather import — wizard open/close', () => {
  it('Upload File opens the import wizard', async () => {
    await enterWeather('open')
    await Weather.openImportWizard()
    await expect(Weather.importWizard).toBeDisplayed()
  })

  it('Cancel closes the wizard', async () => {
    await enterWeather('cancel')
    await Weather.openImportWizard()
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('the × button closes the wizard', async () => {
    await enterWeather('xclose')
    await Weather.openImportWizard()
    await Weather.wizardClose.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('Escape closes the wizard', async () => {
    await enterWeather('esc')
    await Weather.openImportWizard()
    await browser.keys(['Escape'])
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather import — file pick (stubbed dialog)', () => {
  it('Browse loads the fixture and enables Next', async () => {
    await enterWeather('browse')
    await stubFileImport(CSV)
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    await browser.waitUntil(async () => Weather.wizardNext.isEnabled().catch(() => false), {
      timeout: 15000,
      timeoutMsg: 'Next never enabled after Browse (file did not parse)'
    })
  })
})

describe('Weather import — happy path', () => {
  it('imports the CSV: the column and rows appear in the table', async () => {
    await enterWeather('happy')
    await stubFileImport(CSV)
    await Weather.runImport()
    // The imported user column appears as a managed column.
    await Weather.waitForColumn('temperature')
    // Both data rows imported.
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: 20000,
      timeoutMsg: 'imported rows did not appear'
    })
  })

  it('surfaces the truncation toast when a value exceeds 7 decimals', async () => {
    await enterWeather('toast')
    await stubFileImport(
      ['datetime,temperature', '2026-01-01T00:00:00Z,1.123456789'].join('\n')
    )
    await Weather.runImport()
    await Weather.importToastDismiss.waitForDisplayed({ timeout: 15000 })
  })
})

describe('Weather import — Delete Data', () => {
  it('clears the table after confirming', async () => {
    await enterWeather('cleardata')
    await Weather.addRows(2)
    await expect(await Weather.rowCount()).toBe(2)
    await Weather.deleteDataButton.click()
    await Weather.deleteImportDialog.waitForDisplayed({ timeout: 10000 })
    await Weather.deleteImportDialog.$('button=Delete').click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: 20000,
      timeoutMsg: 'table did not clear after Delete Data'
    })
  })

  it('cancel keeps the data', async () => {
    await enterWeather('clearcancel')
    await Weather.addRows(1)
    await Weather.deleteDataButton.click()
    await Weather.deleteImportDialog.waitForDisplayed({ timeout: 10000 })
    await Weather.deleteImportDialog.$('button=Cancel').click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
    await expect(await Weather.rowCount()).toBe(1)
  })
})
