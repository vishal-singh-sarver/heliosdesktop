/**
 * Weather import — REAL provider weather files, full end-to-end.
 *
 * Files are VENDORED into e2e/fixtures/weather/ (portable; no machine-specific
 * path). Each test stubs the native dialog to the on-disk fixture (stubRealFile,
 * which leaves fs:readFile real) and drives the Import Wizard with an EXPLICIT
 * date/time mapping via the instrumented Date/Time step (Weather.importWithMapping).
 *
 * Per-file mapping (verified against the fixture contents):
 *   davis…csv  — `datetime` ISO column (auto-mappable)      → datetime / YYYY-MM-DDTHH:MM:SS
 *   AMW.csv    — `valid` "YYYY-MM-DD HH:MM" datetime string  → datetime / YYYY-MM-DD HH:MM
 *   AMW.tsv    — same, tab-delimited (delimiter auto-detect) → datetime / YYYY-MM-DD HH:MM
 *   NLR1/2/3   — Year/Month/Day/Hour/Minute parts, 2 metadata→ parts + parts, headerSkip 2
 *   CIMIS.xml  — <date val hour> pivoted; date+compact hour  → string MM/DD/YYYY + compact
 *
 * Documented FINDINGS (left red / limitation, per the agreed no-app-change policy):
 *   CIMIS.csv  — parser rejects the trailing whitespace-only CRLF line (row 194):
 *                "1 fields, expected 26". A robust parser should skip trailing
 *                blank lines (Weather/parsers.ts). This test asserts the CORRECT
 *                behavior (clean parse) and therefore FAILS until fixed.
 *   USW.csv    — DATE is year-less "MM-DDTHH:MM:SS" (NOAA hourly normals). NONE of
 *                the wizard's DATE/DATETIME formats represent a year-less datetime,
 *                so no mapping yields a valid row. Surfaced as a finding: the wizard
 *                needs a year-less datetime format (or a default-year option).
 */
import { join } from 'node:path'
import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather from '../pages/Weather.page'
import type { ImportMapping } from '../pages/Weather.page'
import {
  enterProject,
  reloadToHome,
  stubRealFile,
  uniqueName,
  waitForMainWindow
} from '../support/harness'

const FIX = join(process.cwd(), 'e2e', 'fixtures', 'weather')
const fixture = (name: string): string => join(FIX, name)

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

async function enterWeather(label = 'rf'): Promise<{ id: string; name: string }> {
  const project = await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
  return project
}

/** Read a numeric cell value as a finite number (throws with context otherwise). */
async function numericCell(rowId: string, colId: string): Promise<number> {
  const raw = await Weather.cellInput(rowId, colId).getValue()
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new Error(`cell[${rowId}/${colId}] = "${raw}" is not numeric`)
  return n
}

describe('Weather import — davis (auto datetime column)', () => {
  it('imports the ISO datetime CSV and the first temp matches the file (~64.6)', async () => {
    await enterWeather('davis')
    await stubRealFile(fixture('davis, ca yesterday.csv'))
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SS' }
    })
    expect(ok).toBe(true)
    const tempCol = await Weather.waitForColumn('temp')
    await Weather.waitForColumn('humidity')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 20000,
      timeoutMsg: 'no rows after importing davis'
    })
    // Records sort ascending → row 0 is 2026-05-12T00:00:00, temp 64.6 (stored
    // float32 → ~64.5999985, assert with tolerance).
    const [firstRow] = await Weather.visibleRowIds()
    const temp = await numericCell(firstRow, tempCol)
    if (Math.abs(temp - 64.6) > 0.01) throw new Error(`temp[row0] = ${temp}, expected ~64.6`)
  })
})

describe('Weather import — AMW (datetime-string, manual map)', () => {
  it('imports AMW.csv mapping the `valid` column as a datetime string', async () => {
    await enterWeather('amwcsv')
    await stubRealFile(fixture('AMW.csv'))
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'valid', format: 'YYYY-MM-DD HH:MM' }
    })
    expect(ok).toBe(true)
    const latCol = await Weather.waitForColumn('lat')
    await Weather.waitForColumn('tmpc')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 20000,
      timeoutMsg: 'no rows after importing AMW.csv'
    })
    // lat is constant for the station (41.9904) → deterministic regardless of sort.
    const [firstRow] = await Weather.visibleRowIds()
    const lat = await numericCell(firstRow, latCol)
    if (Math.abs(lat - 41.9904) > 0.001) throw new Error(`lat[row0] = ${lat}, expected ~41.9904`)
  })

  it('imports AMW.tsv (tab-delimited) including the tsv-only `sknt` column', async () => {
    await enterWeather('amwtsv')
    await stubRealFile(fixture('AMW.tsv'))
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'valid', format: 'YYYY-MM-DD HH:MM' }
    })
    expect(ok).toBe(true)
    await Weather.waitForColumn('sknt') // present only in the .tsv
    await Weather.waitForColumn('tmpc')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 20000,
      timeoutMsg: 'no rows after importing AMW.tsv'
    })
  })
})

describe('Weather import — NSRDB (date-parts + time-parts, metadata rows)', () => {
  const partsMapping: ImportMapping = {
    headerSkip: 2,
    date: { mode: 'parts', year: 'Year', month: 'Month', day: 'Day' },
    time: { mode: 'parts', hour: 'Hour', minute: 'Minute' }
  }

  it('imports NLR1.csv and the first Temperature matches the file (8.3)', async () => {
    await enterWeather('nlr1')
    await stubRealFile(fixture('NLR1.csv'))
    const ok = await Weather.importWithMapping(partsMapping, 25000)
    expect(ok).toBe(true)
    const tempCol = await Weather.waitForColumn('Temperature')
    await Weather.waitForColumn('Pressure')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 30000,
      timeoutMsg: 'no rows after importing NLR1'
    })
    // Row 0 = 2024-01-01 00:00 → Temperature 8.3.
    const [firstRow] = await Weather.visibleRowIds()
    const temp = await numericCell(firstRow, tempCol)
    if (Math.abs(temp - 8.3) > 0.01) throw new Error(`Temperature[row0] = ${temp}, expected 8.3`)
  })

  it('imports NLR2.csv (different location) — Temperature column + rows present', async () => {
    await enterWeather('nlr2')
    await stubRealFile(fixture('NLR2.csv'))
    const ok = await Weather.importWithMapping(partsMapping, 25000)
    expect(ok).toBe(true)
    await Weather.waitForColumn('Temperature')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 30000,
      timeoutMsg: 'no rows after importing NLR2'
    })
  })

  it('imports NLR3.csv (30-minute cadence) — columns + rows present', async () => {
    await enterWeather('nlr3')
    await stubRealFile(fixture('NLR3.csv'))
    const ok = await Weather.importWithMapping(partsMapping, 30000)
    expect(ok).toBe(true)
    await Weather.waitForColumn('Temperature')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 40000,
      timeoutMsg: 'no rows after importing NLR3'
    })
  })
})

describe('Weather import — CIMIS.xml (date string + compact hour)', () => {
  it('parses the pivoted XML and imports with a discovered date/hour mapping', async () => {
    await enterWeather('cimisxml')
    await stubRealFile(fixture('CIMIS.xml'))
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    await Weather.waitForWizardNext() // step 0: parsed OK
    await Weather.wizardNext.click()
    await Weather.waitForWizardNext() // step 1: data preview
    await Weather.wizardNext.click()
    // step 2: discover the date + hour columns from the parsed headers (the XML
    // parser's column names for <date val hour> are resolved at runtime).
    const cols = await Weather.columnOptions('date')
    const dateCol = cols.find((c) => /date|val/i.test(c))
    const hourCol = cols.find((c) => /hour/i.test(c))
    if (!dateCol || !hourCol) {
      throw new Error(`CIMIS.xml: could not find date/hour columns in [${cols.join(', ')}]`)
    }
    await Weather.selectDateMode('string')
    await Weather.mapColumn('date', dateCol)
    await Weather.setDateFormat('MM/DD/YYYY')
    await Weather.selectTimeMode('compact')
    await Weather.mapColumn('time-compact', hourCol)
    await Weather.waitForWizardNext() // ≥1 valid row
    await Weather.wizardNext.click()
    await Weather.wizardImport.waitForClickable({ timeout: 10000 })
    await Weather.wizardImport.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 60000 })
    // A measurement column (air_temp) and rows landed.
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) > 1, {
      timeout: 20000,
      timeoutMsg: 'CIMIS.xml import added no data columns'
    })
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 20000,
      timeoutMsg: 'CIMIS.xml import added no rows'
    })
  })
})

describe('Weather import — cell-edit persistence on a real import', () => {
  it('edits an imported davis cell and the value survives a project reopen', async () => {
    const { name } = await enterWeather('persistreal')
    await stubRealFile(fixture('davis, ca yesterday.csv'))
    await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SS' }
    })
    const humidityCol = await Weather.waitForColumn('humidity')
    const [row] = await Weather.visibleRowIds()
    await Weather.editCell(row, humidityCol, '55')
    await browser.waitUntil(
      async () => (await Weather.cellInput(row, humidityCol).getValue()) === '55',
      { timeout: 15000, timeoutMsg: 'edited cell did not show the committed value' }
    )
    // Reopen the same project from Home (backend session persists in-run).
    await ProjectScreen.goHome()
    await HomePage.projectsTable.waitForDisplayed({ timeout: 15000 })
    const homeId = await HomePage.rowIdForName(name)
    await HomePage.row(homeId as string).doubleClick()
    await ProjectScreen.projectTitle.waitForDisplayed({ timeout: 15000 })
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    const col2 = await Weather.waitForColumn('humidity')
    const [row2] = await Weather.visibleRowIds()
    await expect(Weather.cellInput(row2, col2)).toHaveValue('55')
  })
})

describe('Weather import — FINDINGS (fail/limitation until addressed; no app change)', () => {
  // CIMIS.csv ends with a trailing whitespace-only CRLF line; the parser rejects
  // it ("Row 194: 1 fields, expected 26") so the wizard never leaves step 0.
  // Asserts the CORRECT behavior (a clean parse enables Next) → RED until fixed.
  it('imports CIMIS.csv (parser must skip the trailing blank line)', async () => {
    await enterWeather('cimiscsv')
    await stubRealFile(fixture('CIMIS.csv'))
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    await browser.waitUntil(async () => Weather.wizardNext.isEnabled().catch(() => false), {
      timeout: 12000,
      timeoutMsg:
        'CIMIS.csv NOT parsed. BUG: parser rejects the trailing whitespace-only line ' +
        '(row 194, CRLF) as "1 fields, expected 26". Fix: skip trailing blank lines in ' +
        'Weather/parsers.ts.'
    })
  })

  // USW.csv DATE is year-less "MM-DDTHH:MM:SS" (NOAA hourly normals). No wizard
  // DATE/DATETIME format represents a year-less datetime, so no mapping produces
  // a valid row and Next never enables on the Date/Time step. Asserts the file
  // SHOULD be importable → RED until the wizard gains a year-less format.
  it('imports USW.csv (wizard needs a year-less datetime format)', async () => {
    await enterWeather('usw')
    await stubRealFile(fixture('USW.csv'))
    const ok = await Weather.importWithMapping(
      { date: { mode: 'datetime', datetime: 'DATE', format: 'YYYY-MM-DDTHH:MM:SS' } },
      12000
    )
    if (!ok) {
      throw new Error(
        'USW.csv NOT importable: DATE is year-less "MM-DDTHH:MM:SS"; no wizard DATE/' +
          'DATETIME format matches, so 0 rows are valid. FINDING: add a year-less datetime ' +
          'format (or default-year option) to the Import Wizard.'
      )
    }
  })
})

// uniqueName is imported for parity with other specs that self-provision named
// projects; referenced here to keep the import meaningful if future cases need it.
void uniqueName
