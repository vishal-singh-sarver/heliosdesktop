/**
 * Import Wizard — navigation / steps / preview coverage gaps (brief E_import_nav).
 *
 * The wizard is a custom role=dialog overlay (aria-label "Import Weather Data")
 * with a 4-step Stepper: File Preview → Data Preview → Date/Time → Review & Import.
 * Native file dialog can't be driven by WDIO, so each test installs stubFileImport
 * (synthetic content) BEFORE opening the wizard; the saga calls openFile then
 * readFile, and the wizard parses on pickedFile change.
 *
 * Mirrors the sibling weather.import.test.ts preamble: a local enterWeather()
 * helper, before() waits for the main window, beforeEach() reloadToHome().
 *
 * Selector ground truth (verified against src/renderer/src/components/ImportWizard):
 *   Stepper labels render with a literal "\n" (whitespace-pre-line):
 *     "File\nPreview" "Data\nPreview" "Date/\nTime" "Review &\nImport".
 *   StepFilePreview: label "Weather Data File", readonly input value = filename,
 *     button text "Browse".
 *   StepDataPreview: dt-delimiter <select>, dt-header-skip <input>, preview <table>
 *     (headers from parsed.headers, ≤12 rows), "Column Labels Preview" chips.
 *   StepDateTime: "Date/Time Preview" table with "Raw"/"Parsed" headers; parsed
 *     cell shows the formatted datetime, "Invalid", or "Invalid time format".
 *     dt-date-format / dt-datetime-format option lists come from DATE_FORMATS /
 *     DATETIME_FORMATS.
 *   StepReview: "Select All" + dt-select-all checkbox, one dt-col-<header>
 *     checkbox per non-DT column, example cell = first-3-row values joined ", ".
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

async function enterWeather(label = 'navgap'): Promise<void> {
  await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
}

/** Open the wizard, Browse, wait for the parse to enable Next (lands on step 0). */
async function openAndBrowse(content: string): Promise<void> {
  await stubFileImport(content)
  await Weather.openImportWizard()
  await Weather.wizardBrowse.click()
  await Weather.waitForWizardNext()
}

/** Advance from the current step to the next once Next is enabled. */
async function advance(): Promise<void> {
  await Weather.waitForWizardNext()
  await Weather.wizardNext.click()
}

describe('Import Wizard — stepper + File Preview (step 0)', () => {
  it('shows all four stepper labels: File Preview, Data Preview, Date/Time, Review & Import', async () => {
    await enterWeather('steps')
    await Weather.openImportWizard()
    // Labels carry a literal newline (whitespace-pre-line) — match against the
    // collapsed text so "File\nPreview" reads as "File Preview".
    const labels = await Weather.importWizard.$$('div.whitespace-pre-line').map(async (el) => {
      const t = await el.getText()
      return t.replace(/\s+/g, ' ').trim()
    })
    expect(labels).toContain('File Preview')
    expect(labels).toContain('Data Preview')
    expect(labels).toContain('Date/ Time')
    expect(labels).toContain('Review & Import')
  })

  it('File Preview shows the "Weather Data File" label and a Browse button on open (IW4/IW5)', async () => {
    await enterWeather('filestep')
    await Weather.openImportWizard()
    await expect(Weather.importWizard.$('label=Weather Data File')).toBeDisplayed()
    await expect(Weather.wizardBrowse).toBeDisplayed()
    // The readonly filename field is present and empty before any pick.
    const fileInput = Weather.importWizard.$('input[readonly]')
    await expect(fileInput).toBeDisplayed()
    expect(await fileInput.getValue()).toBe('')
  })

  it('displays the picked file name in the readonly field after Browse (IW8)', async () => {
    await enterWeather('fname')
    await stubFileImport(CSV, 'mydata.csv')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    const fileInput = Weather.importWizard.$('input[readonly]')
    await browser.waitUntil(async () => (await fileInput.getValue()) === 'mydata.csv', {
      timeout: 15000,
      timeoutMsg: 'filename never appeared in the File Preview field after Browse'
    })
  })
})

describe('Import Wizard — Data Preview (step 1)', () => {
  it('shows the delimiter + header-skip controls and a preview table on the first Next (IW10/IW11/IW12/IW14/IW17)', async () => {
    await enterWeather('datastep')
    await openAndBrowse(CSV)
    await Weather.wizardNext.click() // step 0 → step 1
    await Weather.dtSelect('delimiter').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.dtSelect('delimiter')).toBeDisplayed()
    await expect($('[data-testid="dt-header-skip"]')).toBeDisplayed()
    // Preview table renders the parsed headers in <th>.
    const headerCells = await Weather.importWizard
      .$$('table thead th')
      .map((th) => th.getText())
    expect(headerCells).toEqual(['datetime', 'temperature'])
    // Two data rows → two <tbody> rows.
    const bodyRows = await Weather.importWizard.$$('table tbody tr')
    expect(bodyRows.length).toBe(2)
  })

  it('renders the "Column Labels Preview" chips for every header (IW18)', async () => {
    await enterWeather('chips')
    await openAndBrowse(CSV)
    await Weather.wizardNext.click()
    await Weather.importWizard.$('div*=Column Labels Preview').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.importWizard.$('span=datetime')).toBeDisplayed()
    await expect(Weather.importWizard.$('span=temperature')).toBeDisplayed()
  })

  it('overriding the delimiter re-parses the preview headers (IW15)', async () => {
    await enterWeather('delim')
    // Auto-detect prefers the consistent delimiter with the higher count →
    // semicolon (2 per line) over comma (1 per line), so the file opens split
    // into THREE headers.
    await openAndBrowse('a;b;c,d\nw;x;y,z')
    await Weather.wizardNext.click()
    const before = await Weather.importWizard.$$('table thead th').map((th) => th.getText())
    expect(before).toEqual(['a', 'b', 'c,d'])
    // Forcing comma re-splits the same content into TWO headers.
    await Weather.setDelimiter(',')
    await browser.waitUntil(
      async () =>
        (await Weather.importWizard.$$('table thead th').map((th) => th.getText())).length === 2,
      { timeout: 10000, timeoutMsg: 'delimiter override did not re-split the preview headers' }
    )
    const after = await Weather.importWizard.$$('table thead th').map((th) => th.getText())
    expect(after).toEqual(['a;b;c', 'd'])
  })

  it('overriding header-lines-to-skip refreshes the preview headers (IW16)', async () => {
    await enterWeather('hskip')
    await openAndBrowse('meta one,meta two\ndate,temp\n2026-01-02,5')
    await Weather.wizardNext.click()
    // Skip 0 → the metadata line is treated as the header row.
    const before = await Weather.importWizard.$$('table thead th').map((th) => th.getText())
    expect(before).toEqual(['meta one', 'meta two'])
    await Weather.setHeaderSkip(1)
    await browser.waitUntil(
      async () => {
        const hs = await Weather.importWizard.$$('table thead th').map((th) => th.getText())
        return hs.length === 2 && hs[0] === 'date'
      },
      { timeout: 10000, timeoutMsg: 'header-skip override did not refresh the preview headers' }
    )
    const after = await Weather.importWizard.$$('table thead th').map((th) => th.getText())
    expect(after).toEqual(['date', 'temp'])
  })
})

describe('Import Wizard — Date/Time (step 2)', () => {
  it('shows the Raw/Parsed preview with the parsed datetime for a valid mapping (IW27)', async () => {
    await enterWeather('dtpreview')
    await openAndBrowse(CSV)
    await advance() // → Data Preview
    await advance() // → Date/Time (datetime column auto-maps)
    await Weather.importWizard.$('div*=Date/Time Preview').waitForDisplayed({ timeout: 10000 })
    const previewHeaders = await Weather.importWizard
      .$$('table thead th')
      .map((th) => th.getText())
    expect(previewHeaders).toEqual(['Raw', 'Parsed'])
    // Auto-mapped ISO datetime → every preview row parses; none shows "Invalid".
    await browser.waitUntil(async () => Weather.wizardNext.isEnabled().catch(() => false), {
      timeout: 10000,
      timeoutMsg: 'Date/Time step never reached a valid mapping'
    })
    const parsedCells = await Weather.importWizard
      .$$('table tbody tr td:last-child')
      .map((td) => td.getText())
    expect(parsedCells.length).toBeGreaterThan(0)
    expect(parsedCells.some((t) => t.includes('Invalid'))).toBe(false)
    // The first raw cell echoes the file value.
    const firstRaw = await Weather.importWizard.$('table tbody tr td').getText()
    expect(firstRaw).toContain('2026-01-01T00:00:00Z')
  })

  it('marks unparsed values "Invalid" in the Date/Time preview (IW28)', async () => {
    await enterWeather('invalid')
    // A date the chosen format can't parse → preview cell reads "Invalid".
    await openAndBrowse('date,temp\nNOTADATE,5\nALSOBAD,6')
    await advance() // → Data Preview
    await advance() // → Date/Time
    await Weather.selectDateMode('string')
    await Weather.mapColumn('date', 'date')
    await Weather.setDateFormat('YYYY-MM-DD')
    const parsedCol = Weather.importWizard.$('table tbody tr td:last-child')
    await browser.waitUntil(async () => (await parsedCol.getText()) === 'Invalid', {
      timeout: 10000,
      timeoutMsg: 'unparsed value never rendered the "Invalid" marker'
    })
    await expect(parsedCol).toHaveText('Invalid')
  })

  it('the date-format dropdown enumerates all supported DATE_FORMATS (IW26)', async () => {
    await enterWeather('dfmt')
    await openAndBrowse('date,temp\n2026-01-02,5')
    await advance() // → Data Preview
    await advance() // → Date/Time
    await Weather.selectDateMode('string')
    const opts = await Weather.dtSelect('date-format')
      .$$('option')
      .map((o) => o.getAttribute('value'))
    // Excludes the leading empty placeholder option.
    const formats = opts.filter((v) => v !== '')
    expect(formats).toEqual([
      'YYYYMMDD',
      'YYYY-MM-DD',
      'DD-MM-YYYY',
      'MM-DD-YYYY',
      'DD/MM/YYYY',
      'MM/DD/YYYY',
      'YYYY/MM/DD',
      'DD.MM.YYYY',
      'YYYY DOY',
      'DOY YYYY'
    ])
  })

  it('the datetime-format dropdown enumerates all supported DATETIME_FORMATS (IW26)', async () => {
    await enterWeather('dtfmt')
    await openAndBrowse(CSV)
    await advance() // → Data Preview
    await advance() // → Date/Time (datetime auto-mode)
    const opts = await Weather.dtSelect('datetime-format')
      .$$('option')
      .map((o) => o.getAttribute('value'))
    const formats = opts.filter((v) => v !== '')
    expect(formats).toEqual([
      'YYYY-MM-DDTHH:MM:SSZ',
      'YYYY-MM-DDTHH:MM:SS-HH:MM',
      'YYYY-MM-DDTHH:MM:SS',
      'YYYYMMDDHH',
      'YYYYMMDDHHMM',
      'YYYY-MM-DD HH:MM',
      'DD/MM/YYYY HH:MM',
      'MM/DD/YYYY HH:MM',
      'DD-MM-YYYY HH:MM',
      'MM-DD-YYYY HH:MM',
      'YYYY DOY HH:MM',
      'DOY YYYY HH:MM'
    ])
  })
})

describe('Import Wizard — Review & Import (step 3)', () => {
  it('shows the review heading, Select All, a checkbox per column, and example values (IW34/IW35/IW36)', async () => {
    await enterWeather('review')
    await openAndBrowse('datetime,temp,humidity\n2026-01-01T00:00:00Z,5,40\n2026-01-01T01:00:00Z,6,41')
    await advance() // → Data Preview
    await advance() // → Date/Time (datetime auto-maps)
    await advance() // → Review & Import
    // Review intro/heading text.
    await expect(Weather.importWizard.$('div*=Review columns to import')).toBeDisplayed()
    await expect($('[data-testid="dt-select-all"]')).toBeDisplayed()
    // Every non-date/time header has its own checkbox.
    await expect(Weather.reviewColumnCheckbox('temp')).toBeDisplayed()
    await expect(Weather.reviewColumnCheckbox('humidity')).toBeDisplayed()
    // The synthetic Date-Time row is present and always-on.
    await expect(Weather.importWizard.$('td*=Date-Time')).toBeDisplayed()
    // Example values = first-3-row cell values joined by ", ".
    await expect(Weather.importWizard.$('td*=5, 6')).toBeDisplayed()
    await expect(Weather.importWizard.$('td*=40, 41')).toBeDisplayed()
  })
})

describe('Import Wizard — Back navigation', () => {
  it('Back from Data Preview returns to File Preview (IW19)', async () => {
    await enterWeather('back1')
    await openAndBrowse(CSV)
    await Weather.wizardNext.click() // → Data Preview
    await Weather.dtSelect('delimiter').waitForDisplayed({ timeout: 10000 })
    await Weather.importWizard.$('button=Back').click()
    await Weather.importWizard.$('label=Weather Data File').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.importWizard.$('label=Weather Data File')).toBeDisplayed()
    // No Back button on step 0.
    expect(await Weather.importWizard.$('button=Back').isExisting()).toBe(false)
  })

  it('Back from Date/Time returns to Data Preview (IW31)', async () => {
    await enterWeather('back2')
    await openAndBrowse(CSV)
    await advance() // → Data Preview
    await advance() // → Date/Time
    await Weather.importWizard.$('div*=Date/Time Preview').waitForDisplayed({ timeout: 10000 })
    await Weather.importWizard.$('button=Back').click()
    await Weather.dtSelect('delimiter').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.dtSelect('delimiter')).toBeDisplayed()
  })

  it('Back from Review & Import returns to Date/Time (IW38)', async () => {
    await enterWeather('back3')
    await openAndBrowse(CSV)
    await advance() // → Data Preview
    await advance() // → Date/Time
    await advance() // → Review & Import
    await Weather.importWizard.$('div*=Review columns to import').waitForDisplayed({ timeout: 10000 })
    await Weather.importWizard.$('button=Back').click()
    await Weather.importWizard.$('div*=Date/Time Preview').waitForDisplayed({ timeout: 10000 })
    await expect(Weather.importWizard.$('div*=Date/Time Preview')).toBeDisplayed()
  })
})

describe('Import Wizard — Cancel from later steps', () => {
  it('Cancel from Data Preview closes the wizard (IW20)', async () => {
    await enterWeather('cxl1')
    await openAndBrowse(CSV)
    await Weather.wizardNext.click() // → Data Preview
    await Weather.dtSelect('delimiter').waitForDisplayed({ timeout: 10000 })
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('Cancel from Review & Import closes the wizard (IW39)', async () => {
    await enterWeather('cxl2')
    await openAndBrowse(CSV)
    await advance() // → Data Preview
    await advance() // → Date/Time
    await advance() // → Review & Import
    await Weather.importWizard.$('div*=Review columns to import').waitForDisplayed({ timeout: 10000 })
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Import Wizard — auto-sort on import (IW42)', () => {
  it('imports rows scrambled in the file sorted ascending by Date-Time', async () => {
    await enterWeather('sort')
    // temp increases with the timestamp; rows are supplied OUT of order so a
    // monotonically-increasing temp down the table proves the ascending sort.
    await stubFileImport(
      [
        'datetime,temp',
        '2026-01-01T02:00:00Z,30',
        '2026-01-01T00:00:00Z,10',
        '2026-01-01T03:00:00Z,40',
        '2026-01-01T01:00:00Z,20'
      ].join('\n')
    )
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' }
    })
    expect(ok).toBe(true)
    const tempCol = await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 4, {
      timeout: 20000,
      timeoutMsg: 'expected 4 imported rows'
    })
    const rowIds = await Weather.visibleRowIds()
    const temps: number[] = []
    for (const rid of rowIds) {
      temps.push(Number(await Weather.cellInput(rid, tempCol).getValue()))
    }
    // Ascending by datetime ⇒ temps 10,20,30,40 in DOM order.
    expect(temps).toEqual([10, 20, 30, 40])
  })
})
