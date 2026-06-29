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
import Weather, { type ImportMapping } from '../pages/Weather.page'
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

describe('Weather import — mapping modes (synthetic)', () => {
  /** Map a small in-memory CSV with an explicit mapping, then assert column + 2 rows. */
  async function importAndAssert(
    label: string,
    content: string,
    mapping: ImportMapping
  ): Promise<void> {
    await enterWeather(label)
    await stubFileImport(content)
    const ok = await Weather.importWithMapping(mapping)
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: 20000,
      timeoutMsg: `[${label}] expected 2 imported rows`
    })
  }

  it('date-parts + time-parts maps to two rows', async () => {
    await importAndAssert(
      'parts',
      'Year,Month,Day,Hour,Minute,temp\n2026,1,1,0,0,5\n2026,1,1,1,0,6',
      {
        date: { mode: 'parts', year: 'Year', month: 'Month', day: 'Day' },
        time: { mode: 'parts', hour: 'Hour', minute: 'Minute' }
      }
    )
  })

  it('julian date + time-parts maps to two rows', async () => {
    await importAndAssert('julian', 'year,doy,hour,temp\n2026,1,0,5\n2026,2,0,6', {
      date: { mode: 'julian', julianYear: 'year', julianDay: 'doy' },
      time: { mode: 'parts', hour: 'hour' }
    })
  })

  it('date-string + compact time maps to two rows', async () => {
    await importAndAssert('compact', 'date,hhmm,temp\n01/02/2026,0100,5\n01/02/2026,0200,6', {
      date: { mode: 'string', date: 'date', format: 'MM/DD/YYYY' },
      time: { mode: 'compact', time: 'hhmm' }
    })
  })

  it('date-string + hh:mm time maps to two rows', async () => {
    await importAndAssert('hhmm', 'date,time,temp\n2026-01-02,01:00,5\n2026-01-02,02:00,6', {
      date: { mode: 'string', date: 'date', format: 'YYYY-MM-DD' },
      time: { mode: 'string', time: 'time' }
    })
  })
})

describe('Weather import — wizard mechanics', () => {
  it('header-skip drops the metadata line and imports the data', async () => {
    await enterWeather('hskip')
    await stubFileImport('# meta line\ndate,temp\n2026-01-02,5\n2026-01-03,6')
    const ok = await Weather.importWithMapping({
      headerSkip: 1,
      date: { mode: 'string', date: 'date', format: 'YYYY-MM-DD' },
      time: { mode: 'none' }
    })
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: 20000,
      timeoutMsg: 'header-skip import did not yield 2 rows'
    })
  })

  it('a column excluded on Review is not imported', async () => {
    await enterWeather('exclude')
    await stubFileImport(
      'datetime,temp,drop\n2026-01-01T00:00:00Z,5,9\n2026-01-01T01:00:00Z,6,8'
    )
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' },
      excludeColumns: ['drop']
    })
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    expect(await Weather.colIdForName('drop')).toBe(null)
  })

  it('a ragged row keeps Next disabled (parse error)', async () => {
    await enterWeather('ragged')
    await stubFileImport('a,b\n1,2,3')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    // Next must STAY disabled: waitUntil that expects isEnabled() to stay false
    // resolves false (timeout) when the gate is correctly never satisfied.
    const becameEnabled = await browser
      .waitUntil(async () => Weather.wizardNext.isEnabled().catch(() => false), { timeout: 4000 })
      .then(() => true)
      .catch(() => false)
    expect(becameEnabled).toBe(false)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('an empty file keeps Next disabled on step 0', async () => {
    await enterWeather('empty')
    await stubFileImport('')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    const becameEnabled = await browser
      .waitUntil(async () => Weather.wizardNext.isEnabled().catch(() => false), { timeout: 4000 })
      .then(() => true)
      .catch(() => false)
    expect(becameEnabled).toBe(false)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('Date/Time gating: a never-valid mapping returns false', async () => {
    await enterWeather('nogate')
    await stubFileImport('date,temp\nNOTADATE,5')
    let ok = true
    try {
      ok = await Weather.importWithMapping({
        date: { mode: 'string', date: 'date', format: 'YYYY-MM-DD' },
        time: { mode: 'none' }
      })
      expect(ok).toBe(false)
    } finally {
      // Wizard stays open when Next never un-gates — close it so beforeEach is clean.
      if (!ok && (await Weather.importWizard.isDisplayed().catch(() => false))) {
        await Weather.wizardCancel.click().catch(() => undefined)
      }
    }
  })
})
