/**
 * Weather table E2E — toolbar, table render/structure, dialog open/close, and
 * row selection. Built from the verified matrix (design doc Section 5). Row/
 * column mutation lives in weather.crud.test.ts; CSV import in weather.import.test.ts.
 *
 * A fresh scenario is seeded by the backend with a date-time column + a check
 * column (the check column is the leftmost select-all checkbox, filtered out of
 * the visible column order), so an empty scenario shows exactly one data-column
 * header (Date-Time) + the Action header and zero body rows.
 */
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import { enterProject, reloadToHome, waitForMainWindow } from '../support/harness'

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

/** Enter a project and wait for the Weather table to be mounted + seeded. */
async function enterWeather(label = 'wx'): Promise<void> {
  await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
}

describe('Weather — toolbar', () => {
  it('renders Filter / Add Columns / Add Rows / Upload File / Delete Data', async () => {
    await enterWeather('tb')
    await expect(Weather.filterButton).toBeDisplayed()
    await expect(Weather.addColumnsButton).toBeDisplayed()
    await expect(Weather.addRowsButton).toBeDisplayed()
    await expect(Weather.uploadFileButton).toBeDisplayed()
    await expect(Weather.deleteDataButton).toBeDisplayed()
  })

  it('disables Delete Data on an empty scenario (no data)', async () => {
    await enterWeather('del')
    await expect(await Weather.deleteDataButton.isEnabled()).toBe(false)
  })
  // FINDING (not tested): the Filter button is wired to an undefined onFilter -> no-op.
})

describe('Weather — table structure (seeded empty scenario)', () => {
  it('shows the select-all checkbox, the Date-Time header, and the Action header', async () => {
    await enterWeather('struct')
    await expect(Weather.selectAllCheckbox).toBeDisplayed()
    await expect(Weather.dateTimeHeaderTrigger).toBeDisplayed()
    await expect(Weather.actionHeader).toBeDisplayed()
  })

  it('shows exactly one data column (Date-Time) before any column is added', async () => {
    await enterWeather('cols')
    await expect(await Weather.dataColumnCount()).toBe(1)
  })

  it('has an empty body (no rows) before any row is added', async () => {
    await enterWeather('empty')
    await expect(await Weather.rowCount()).toBe(0)
  })

  it('the select-all checkbox is enabled and starts unchecked', async () => {
    await enterWeather('sa')
    await expect(Weather.selectAllCheckbox).toBeEnabled()
    await expect(await Weather.selectAllCheckbox.isSelected()).toBe(false)
  })
})

describe('Weather — Add Columns dialog open/close', () => {
  it('opens from the toolbar', async () => {
    await enterWeather('ac')
    await Weather.openAddColumns()
    await expect(Weather.addColumnDialog).toBeDisplayed()
    await expect(Weather.acName).toBeDisplayed()
  })

  it('Cancel closes it', async () => {
    await enterWeather('acc')
    await Weather.openAddColumns()
    await Weather.acCancel.click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('the × button closes it', async () => {
    await enterWeather('acx')
    await Weather.openAddColumns()
    await Weather.dialogCloseButton(Weather.addColumnDialog).click()
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('Escape closes it', async () => {
    await enterWeather('ace')
    await Weather.openAddColumns()
    await browser.keys(['Escape'])
    await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather — Add Rows dialog open/close', () => {
  it('opens from the toolbar', async () => {
    await enterWeather('ar')
    await Weather.openAddRows()
    await expect(Weather.addRowsDialog).toBeDisplayed()
    await expect(Weather.arNumberOfRows).toBeDisplayed()
  })

  it('Cancel closes it', async () => {
    await enterWeather('arc')
    await Weather.openAddRows()
    await Weather.arCancel.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('Escape closes it', async () => {
    await enterWeather('are')
    await Weather.openAddRows()
    await browser.keys(['Escape'])
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather — row selection', () => {
  it('renders the rows that were added', async () => {
    await enterWeather('rows')
    await Weather.addRows(3)
    await expect(await Weather.rowCount()).toBe(3)
  })

  it('select-all flips every row checkbox (and back)', async () => {
    await enterWeather('selall')
    await Weather.addRows(3)
    const ids = await Weather.visibleRowIds()
    const initial = await Weather.rowCheckbox(ids[0]).isSelected()
    await Weather.selectAllCheckbox.click()
    for (const rowId of ids) {
      await browser.waitUntil(
        async () => (await Weather.rowCheckbox(rowId).isSelected()) === !initial,
        { timeout: 10000, timeoutMsg: `row ${rowId} did not flip after select-all` }
      )
    }
    await Weather.selectAllCheckbox.click()
    for (const rowId of ids) {
      await browser.waitUntil(
        async () => (await Weather.rowCheckbox(rowId).isSelected()) === initial,
        { timeout: 10000, timeoutMsg: `row ${rowId} did not flip back` }
      )
    }
  })

  it('an individual row checkbox toggles', async () => {
    await enterWeather('selrow')
    await Weather.addRows(2)
    const [first] = await Weather.visibleRowIds()
    const initial = await Weather.rowCheckbox(first).isSelected()
    await Weather.rowCheckbox(first).click()
    await browser.waitUntil(
      async () => (await Weather.rowCheckbox(first).isSelected()) === !initial,
      { timeout: 10000, timeoutMsg: 'row checkbox did not toggle' }
    )
    await Weather.rowCheckbox(first).click()
    await browser.waitUntil(
      async () => (await Weather.rowCheckbox(first).isSelected()) === initial,
      { timeout: 10000, timeoutMsg: 'row checkbox did not toggle back' }
    )
  })
})
