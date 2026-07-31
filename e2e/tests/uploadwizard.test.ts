/**
 * Upload / Import Wizard E2E — the "Upload File" flow end to end: wizard
 * open/close, stubbed file pick, delimiter / header-skip parsing, the
 * Date/Time mapping step (all modes), validation gating, Review, step
 * navigation, and REAL provider-file imports. The native file dialog is
 * stubbed in the main process (no OS picker under WDIO). Two intentional RED
 * findings live in the real-file block (CIMIS.csv, USW.csv).
 */

import HomePage from '../pages/HomePage.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import Weather, { type ImportMapping } from '../pages/Weather.page'
import {
  enterWeather,
  reloadToHome,
  staysFalse,
  stubFileCancel,
  stubFileImport,
  stubRealFile,
  uniqueName,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { fixture, FIXTURE_FILES, SAMPLE_CSV } from '../config/fixtures'
import { TIMEOUTS } from '../config/timeouts'
import { IMPORT_MSG } from '../constants/messages'

before(async () => {
  await waitForMainWindow()
  // Heavy real-file imports are timing-sensitive; make sure the backend is up
  // before the first import so we don't pay cold-start inside a timed test.
  await waitForBackendReady()
})

beforeEach(async () => {
  await reloadToHome()
})

/** The wizard's read-only "Weather Data File" field (StepFilePreview input). */
function fileField(): ReturnType<typeof $> {
  return Weather.importWizard.$('input[readonly][placeholder="No file selected"]')
}

/** Open the wizard, Browse, and advance to the (already-open) Date/Time step. */
async function advanceToDateTime(): Promise<void> {
  await Weather.openImportWizard()
  await Weather.wizardBrowse.click()
  await Weather.waitForWizardNext() // step 0 File Preview
  await Weather.wizardNext.click()
  await Weather.waitForWizardNext() // step 1 Data Preview
  await Weather.wizardNext.click()
}

/** Count managed-column header name inputs whose committed value equals `name`. */
async function columnCount(name: string): Promise<number> {
  const inputs = await $$('[aria-label^="Column "][aria-label$=" name"]')
  let n = 0
  for (const input of inputs) {
    if ((await input.getValue()) === name) n++
  }
  return n
}

// ───────────────────────────────────────────────────────────────────────────

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

/** Read a numeric cell value as a finite number (throws with context otherwise). */
async function numericCell(rowId: string, colId: string): Promise<number> {
  const raw = await Weather.cellInput(rowId, colId).getValue()
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new Error(`cell[${rowId}/${colId}] = "${raw}" is not numeric`)
  return n
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
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('the × button closes the wizard', async () => {
    await enterWeather('xclose')
    await Weather.openImportWizard()
    await Weather.wizardClose.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('Escape closes the wizard', async () => {
    await enterWeather('esc')
    await Weather.openImportWizard()
    await browser.keys(['Escape'])
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

describe('Weather import — file pick (stubbed dialog)', () => {
  it('Browse loads the fixture and enables Next', async () => {
    await enterWeather('browse')
    await stubFileImport(SAMPLE_CSV)
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
    await stubFileImport(SAMPLE_CSV)
    await Weather.runImport()
    // The imported user column appears as a managed column.
    await Weather.waitForColumn('temperature')
    // Both data rows imported.
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'imported rows did not appear'
    })
  })

  it('surfaces the truncation toast AND stores the value truncated to 7 decimals', async () => {
    await enterWeather('toast')
    // 1.123456789 has 9 decimals -> truncateToMaxDecimals writes 1.1234567 (7).
    // The toast (wouldTruncateAny) and the value-writer (truncateToMaxDecimals)
    // are SEPARATE functions, so assert BOTH: the warning fires AND the stored
    // cell actually carries the truncated value. A writer regression that skipped
    // truncation (or truncated to the wrong length) would still fire the toast —
    // this assertion is what makes the test differential on the write path.
    await stubFileImport(
      ['datetime,temperature', '2026-01-01T00:00:00Z,1.123456789'].join('\n')
    )
    await Weather.runImport()
    await Weather.importToastDismiss.waitForDisplayed({ timeout: 15000 })
    // Exactly one row imported.
    const colId = await Weather.waitForColumn('temperature')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 1, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'truncation import did not yield exactly 1 row'
    })
    const [rowId] = await Weather.visibleRowIds()
    // The imported cell holds the value truncated to 7 decimals — not the raw
    // 9-decimal source, and not a rounded value.
    await browser.waitUntil(
      async () => (await Weather.cellInput(rowId, colId).getValue()) === '1.1234567',
      {
        timeout: 15000,
        timeoutMsg: 'imported temperature cell did not read the 7-decimal truncated value'
      }
    )
    expect(await Weather.cellInput(rowId, colId).getValue()).toBe('1.1234567')
  })
})

describe('Weather import — Delete Data', () => {
  it('clears the table after confirming', async () => {
    await enterWeather('cleardata')
    await Weather.addRows(2)
    await expect(await Weather.rowCount()).toBe(2)
    await Weather.deleteDataButton.click()
    await Weather.deleteImportDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.deleteImportDialog.$('button=Delete').click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
    await browser.waitUntil(async () => (await Weather.rowCount()) === 0, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'table did not clear after Delete Data'
    })
  })

  it('cancel keeps the data', async () => {
    await enterWeather('clearcancel')
    await Weather.addRows(1)
    await Weather.deleteDataButton.click()
    await Weather.deleteImportDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.deleteImportDialog.$('button=Cancel').click()
    await Weather.deleteImportDialog.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
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
      timeout: TIMEOUTS.LONG,
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

// The tests above assert only that N rows imported. These assert the RESULTING
// INSTANT — the actual normalized date/time in the cell — so a parse that yields
// a valid-but-WRONG date/time (rollover, offset shift, day/month transposition,
// day-of-year, compact time) is caught instead of passing on row count alone.
describe('Weather import — date/time normalization (asserts the resulting instant)', () => {
  // Pin the Date-Time column's DISPLAY format to 'YYYY-MM-DD HH:MM' so the
  // rendered cell text is deterministic regardless of the import format, then
  // return that column's colId.
  async function pinIsoDisplay(): Promise<string> {
    const dtColId = await Weather.dateTimeColId()
    await Weather.openDateTimeFormatPicker()
    const target = (await Weather.dateTimeFormatOptions()).find((o) => o.text === 'YYYY-MM-DD HH:MM')
    if (target && !target.selected) {
      await Weather.pickDateTimeFormat('YYYY-MM-DD HH:MM')
    } else {
      // Already selected, or (unexpectedly) absent — close the listbox and rely on
      // the current format; the exact-string asserts below will flag a mismatch.
      await Weather.dateTimeHeaderTrigger.click()
      await Weather.pickerListbox.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM }).catch(() => {})
    }
    return dtColId
  }

  /** Rendered Date-Time cell text for every visible row, in row order. */
  async function cellTexts(dtColId: string): Promise<string[]> {
    const rows = await Weather.visibleRowIds()
    const out: string[] = []
    for (const r of rows) out.push(await Weather.dateTimeCellText(r, dtColId))
    return out
  }

  async function importRows(content: string, mapping: ImportMapping, rows: number): Promise<void> {
    await stubFileImport(content)
    const ok = await Weather.importWithMapping(mapping)
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) === rows, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: `expected ${rows} imported row(s)`
    })
  }

  it('a 24:00 time rolls the date over to 00:00 of the next day', async () => {
    await enterWeather('roll24')
    // 24:00 is VALID (rolls to next-day 00:00) — unlike 25:00, which is rejected.
    await importRows(
      'date,time,temp\n2026-01-02,23:00,5\n2026-01-02,24:00,6',
      { date: { mode: 'string', date: 'date', format: 'YYYY-MM-DD' }, time: { mode: 'string', time: 'time' } },
      2
    )
    const cells = await cellTexts(await pinIsoDisplay())
    expect(cells.some((c) => c.startsWith('2026-01-02 23:00'))).toBe(true)
    expect(cells.some((c) => c.startsWith('2026-01-03 00:00'))).toBe(true) // rolled
    expect(cells.every((c) => !c.includes('24:00'))).toBe(true) // never renders un-rolled
  })

  it('compact time 0100 / 0130 parses to 01:00 / 01:30 (value, not just row count)', async () => {
    await enterWeather('compactval')
    await importRows(
      'date,hhmm,temp\n2026-01-02,0100,5\n2026-01-02,0130,6',
      { date: { mode: 'string', date: 'date', format: 'YYYY-MM-DD' }, time: { mode: 'compact', time: 'hhmm' } },
      2
    )
    const cells = await cellTexts(await pinIsoDisplay())
    expect(cells).toContain('2026-01-02 01:00')
    expect(cells).toContain('2026-01-02 01:30')
  })

  it('DD/MM/YYYY parses 02/01/2026 to 2 Jan (not 1 Feb — day/month transposition)', async () => {
    await enterWeather('ddmmyyyy')
    await importRows(
      'date,temp\n02/01/2026,5',
      { date: { mode: 'string', date: 'date', format: 'DD/MM/YYYY' }, time: { mode: 'none' } },
      1
    )
    const [cell] = await cellTexts(await pinIsoDisplay())
    expect(cell).toBe('2026-01-02 00:00')
  })

  it('YYYY/MM/DD parses 2026/01/02 to the SAME instant as the DD/MM/YYYY form', async () => {
    await enterWeather('yyyymmdd')
    await importRows(
      'date,temp\n2026/01/02,5',
      { date: { mode: 'string', date: 'date', format: 'YYYY/MM/DD' }, time: { mode: 'none' } },
      1
    )
    const [cell] = await cellTexts(await pinIsoDisplay())
    expect(cell).toBe('2026-01-02 00:00') // identical instant regardless of source format
  })

  it('an ISO datetime with a -08:00 offset keeps the wall-clock time verbatim (no shift)', async () => {
    await enterWeather('tzoffset')
    await importRows(
      'dt,temp\n2026-01-02T10:00:00-08:00,5',
      { date: { mode: 'datetime', datetime: 'dt', format: 'YYYY-MM-DDTHH:MM:SS-HH:MM' }, time: { mode: 'none' } },
      1
    )
    const [cell] = await cellTexts(await pinIsoDisplay())
    // 10:00 kept verbatim on 2026-01-02 — NOT shifted to 18:00 UTC by the offset.
    expect(cell).toBe('2026-01-02 10:00')
  })

  it('a "YYYY DOY" day-of-year string imports to the correct calendar date', async () => {
    await enterWeather('doystr')
    await importRows(
      'date,temp\n2026 002,5',
      { date: { mode: 'string', date: 'date', format: 'YYYY DOY' }, time: { mode: 'none' } },
      1
    )
    const [cell] = await cellTexts(await pinIsoDisplay())
    expect(cell).toBe('2026-01-02 00:00') // DOY 002 of 2026 = 2 Jan
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
      timeout: TIMEOUTS.LONG,
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
    // Next must STAY disabled: the gate is correctly never satisfied.
    expect(await staysFalse(() => Weather.wizardNext.isEnabled(), 4000)).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('an empty file keeps Next disabled on step 0', async () => {
    await enterWeather('empty')
    await stubFileImport('')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    expect(await staysFalse(() => Weather.wizardNext.isEnabled(), 4000)).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
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

describe('Weather upload — cancelled file dialog', () => {
  it('Browse with a cancelled dialog attaches no file and keeps Next disabled', async () => {
    await enterWeather('wu5')
    await stubFileCancel()
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()

    // The saga dispatches importPickFileFailed('') on a null path: no file is
    // loaded, the read-only field stays empty, and Next must stay disabled.
    // Give the (no-op) pick a beat, then assert the gate never opened.
    expect(await staysFalse(() => Weather.wizardNext.isEnabled(), 4000)).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    expect(await fileField().getValue()).toBe('')

    // Empty error string keeps the "Could not open file." / "Invalid file."
    // banner hidden — StepFilePreview renders it only when the error is truthy.
    const banner = Weather.importWizard.$(`strong=${IMPORT_MSG.couldNotOpen}`)
    expect(await banner.isExisting()).toBe(false)

    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

describe('Weather upload — selected filename display', () => {
  it('shows the picked file name in the read-only file field after Browse', async () => {
    await enterWeather('wu10')
    await stubFileImport(SAMPLE_CSV, 'denver-2026.csv')
    await Weather.openImportWizard()

    // Before Browse the field is empty (placeholder only).
    expect(await fileField().getValue()).toBe('')

    await Weather.wizardBrowse.click()
    // The wizard parses the picked file and writes its filename into the field;
    // Next enabling is the observable signal the file landed.
    await browser.waitUntil(async () => Weather.wizardNext.isEnabled().catch(() => false), {
      timeout: 15000,
      timeoutMsg: 'Next never enabled after Browse (file did not parse)'
    })
    await browser.waitUntil(async () => (await fileField().getValue()) === 'denver-2026.csv', {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'file field never showed the selected filename'
    })

    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

describe('Weather upload — large file', () => {
  it('imports a large synthetic CSV through the wizard without crashing', async () => {
    await enterWeather('wu34')
    // Generate a large in-memory CSV with a `datetime` ISO column. Drop the
    // millis so the YYYY-MM-DDTHH:MM:SSZ format maps cleanly.
    const ROWS = 600
    const base = Date.UTC(2026, 0, 1, 0, 0, 0)
    const lines: string[] = ['datetime,temperature']
    for (let i = 0; i < ROWS; i++) {
      const iso = new Date(base + i * 3600_000).toISOString().replace('.000Z', 'Z')
      lines.push(`${iso},${(i % 40).toFixed(1)}`)
    }
    await stubFileImport(lines.join('\n'), 'large.csv')

    // Explicit datetime mapping with a generous gate: auto-map's fixed 15s/step
    // timeout can be too tight for a large file's Date/Time parse.
    const ok = await Weather.importWithMapping(
      { date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' } },
      30000
    )
    expect(ok).toBe(true)
    // The imported user column appears as a managed column.
    await Weather.waitForColumn('temperature')
    // Rows render: the table is virtualized so the rendered window is a subset of
    // the imported rows — assert it loaded (>0) without crashing the renderer.
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 30000,
      timeoutMsg: 'large import produced no rendered rows'
    })
    const rendered = await Weather.rowCount()
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(ROWS)
  })
})

describe('Weather upload — invalid time gating', () => {
  it('an out-of-range time (25:00) on every row keeps Next disabled', async () => {
    await enterWeather('wu28')
    // Valid dates, but every row's time is out of range (25:00). The Date/Time
    // step parses each row as invalid_time -> 0 valid rows -> Next stays gated.
    await stubFileImport('date,time,temp\n2026-01-02,25:00,5\n2026-01-03,25:00,6')

    const mapping: ImportMapping = {
      date: { mode: 'string', date: 'date', format: 'YYYY-MM-DD' },
      time: { mode: 'string', time: 'time' }
    }

    // Drive the wizard up to the Date/Time step, apply the mapping, and assert
    // the gate never opens (importWithMapping returns false when no row parses).
    let ok = true
    try {
      ok = await Weather.importWithMapping(mapping)
      expect(ok).toBe(false)
      // The step must still be the open Date/Time step (Import never ran).
      expect(await Weather.importWizard.isDisplayed()).toBe(true)
      // The preview header reports zero valid rows for this all-invalid file.
      const zeroValid = Weather.importWizard.$('div*=0 of 2 rows valid')
      await zeroValid.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      expect(await Weather.wizardNext.isEnabled()).toBe(false)
    } finally {
      if (!ok && (await Weather.importWizard.isDisplayed().catch(() => false))) {
        await Weather.wizardCancel.click().catch(() => undefined)
        await Weather.importWizard
          .waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
          .catch(() => undefined)
      }
    }
  })
})

describe('Weather import — supported date separators', () => {
  /**
   * tryParseDate splits the date string on DATE_SEP_RE = /[/\-.\s,]+/ and the
   * format key only fixes the part ORDER (Y/M/D), so a YYYY-MM-DD mapping parses
   * any of "/", "-", ".", space and "," separated YYYY M D triples. Only "/" and
   * "-" are exercised by the existing suite; here we cover ".", space and ",".
   */
  async function importDateString(
    label: string,
    dateValue: string,
    delimiter?: string
  ): Promise<void> {
    await enterWeather(label)
    // Isolate the DATE separator: pair every date with a fixed valid time column
    // (a date-string mapping with no time never reaches a valid row), mirroring
    // how  isolates the time separator. For a comma-IN-the-date value the file
    // must NOT use the comma delimiter or the value splits across cells — use a
    // semicolon-delimited file so the date stays in one cell.
    const sep = delimiter ?? ','
    const content = [
      ['date', 'time', 'temp'].join(sep),
      [dateValue, '01:00', '5'].join(sep),
      [dateValue, '02:00', '6'].join(sep)
    ].join('\n')
    await stubFileImport(content)
    const mapping: ImportMapping = {
      date: { mode: 'string', date: 'date', format: 'YYYY-MM-DD' },
      time: { mode: 'string', time: 'time' }
    }
    if (delimiter) mapping.delimiter = delimiter
    const ok = await Weather.importWithMapping(mapping)
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: `[${label}] expected 2 rows for separator "${dateValue}"`
    })
  }

  it('dot-separated date "2026.01.02" parses', async () => {
    await importDateString('sepdot', '2026.01.02')
  })

  it('space-separated date "2026 01 02" parses', async () => {
    await importDateString('sepspace', '2026 01 02')
  })

  it('comma-separated date "2026,01,02" parses (semicolon-delimited file)', async () => {
    await importDateString('sepcomma', '2026,01,02', ';')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — supported time separators', () => {
  /**
   * tryParseTime supports ":"-separated, whitespace-separated and compact-digit
   * times (it does NOT implement ".", "+" or "-" time separators — the manual
   * list overstates app support, so those are intentionally not tested here).
   * The existing suite covers ":" and compact HHMM; we add the space-separated
   * "01 30" form and the 6-digit compact "013000" form.
   */
  it('space-separated time "01 30" parses (string time)', async () => {
    await enterWeather('timespace')
    await stubFileImport('date,time,temp\n2026-01-02,01 30,5\n2026-01-02,02 30,6')
    const ok = await Weather.importWithMapping({
      date: { mode: 'string', date: 'date', format: 'YYYY-MM-DD' },
      time: { mode: 'string', time: 'time' }
    })
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'space-separated time did not yield 2 rows'
    })
  })

  it('6-digit compact time "013000" parses (compact time)', async () => {
    await enterWeather('timecompact6')
    await stubFileImport('date,time,temp\n2026-01-02,013000,5\n2026-01-02,023000,6')
    const ok = await Weather.importWithMapping({
      date: { mode: 'string', date: 'date', format: 'YYYY-MM-DD' },
      time: { mode: 'compact', time: 'time' }
    })
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: '6-digit compact time did not yield 2 rows'
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — supported delimiters', () => {
  /**
   * DELIMITERS lists comma, semicolon, tab, pipe and space; the existing suite
   * exercises only comma and tab. Here we force semicolon, pipe and space on the
   * Data-Preview step (mapping.delimiter) and confirm a clean 2-row import.
   */
  async function importWithDelimiter(label: string, delimiter: string): Promise<void> {
    await enterWeather(label)
    const content = ['datetime', 'temp'].join(delimiter) +
      '\n' + ['2026-01-01T00:00:00Z', '5'].join(delimiter) +
      '\n' + ['2026-01-01T01:00:00Z', '6'].join(delimiter)
    await stubFileImport(content)
    const ok = await Weather.importWithMapping({
      delimiter,
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' }
    })
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: `[${label}] delimiter import did not yield 2 rows`
    })
  }

  it('semicolon-delimited content imports', async () => {
    await importWithDelimiter('delsemi', ';')
  })

  it('pipe-delimited content imports', async () => {
    await importWithDelimiter('delpipe', '|')
  })

  it('space-delimited content imports', async () => {
    await importWithDelimiter('delspace', ' ')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — character columns disabled on Review', () => {
  /**
   * isUnsupportedCharacterValue() flags any non-empty, non-numeric cell; the
   * wizard collects those column indices into disabledColumnIndices, renders the
   * blue banner "Character-based columns are disabled as this input is
   * unsupported", and disables (and excludes) that column's Review checkbox.
   * The DT (datetime) column is always kept; we assert against a SECOND column.
   */
  async function reachReviewWithColumn(label: string, badColumnValue: string): Promise<void> {
    await enterWeather(label)
    await stubFileImport(
      `datetime,note,temp\n2026-01-01T00:00:00Z,${badColumnValue},5\n2026-01-01T01:00:00Z,${badColumnValue},6`
    )
    await advanceToDateTime()
    await Weather.applyDateTimeMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' }
    })
    await Weather.waitForWizardNext() // ≥1 valid row
    await Weather.wizardNext.click() // → Review
  }

  it('alphabetic-valued column shows the disabled banner and an unchecked, disabled checkbox', async () => {
    await reachReviewWithColumn('charalpha', 'abc')
    const banner = $(`div*=${IMPORT_MSG.charColumnsDisabled}`)
    await banner.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    const cb = Weather.reviewColumnCheckbox('note')
    await cb.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    expect(await cb.isEnabled()).toBe(false)
    expect(await cb.isSelected()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('special-character-valued column is disabled on Review', async () => {
    await reachReviewWithColumn('charspecial', '#@!')
    await $(`div*=${IMPORT_MSG.charColumnsDisabled}`).waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    const cb = Weather.reviewColumnCheckbox('note')
    await cb.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    expect(await cb.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('mixed numeric/text column is treated as character and disabled on Review', async () => {
    // Row 1 numeric, row 2 text → at least one non-numeric value flags the column.
    await enterWeather('charmixed')
    await stubFileImport(
      'datetime,note,temp\n2026-01-01T00:00:00Z,12,5\n2026-01-01T01:00:00Z,n/a,6'
    )
    await advanceToDateTime()
    await Weather.applyDateTimeMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' }
    })
    await Weather.waitForWizardNext()
    await Weather.wizardNext.click()
    await $(`div*=${IMPORT_MSG.charColumnsDisabled}`).waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    const cb = Weather.reviewColumnCheckbox('note')
    await cb.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    expect(await cb.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('the disabled column is excluded from the imported table', async () => {
    await enterWeather('charexcluded')
    await stubFileImport(
      'datetime,note,temp\n2026-01-01T00:00:00Z,abc,5\n2026-01-01T01:00:00Z,abc,6'
    )
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' }
    })
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    // The character column never imports as a managed column.
    expect(await Weather.colIdForName('note')).toBe(null)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — ragged / fewer-column rows', () => {
  /**
   * parseDelimited throws when any data row's field count differs from the
   * header row's → parseError, parsed=null, Next stays disabled on step 0.
   * (A header with FEWER columns than its data — is NOT covered here:
   * detectHeaderLinesToSkip auto-skips a single mismatched first line, so the
   * parser realigns and Next enables; that case is reported as skipped.)
   */
  it('a data row with fewer columns than the header keeps Next disabled', async () => {
    await enterWeather('fewercols')
    // 3-field header, a 2-field data row → "2 fields, expected 3".
    await stubFileImport('date,temp,humidity\n2026-01-02,5')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    expect(await staysFalse(() => Weather.wizardNext.isEnabled())).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — invalid date / time labels', () => {
  /**
   * The Date/Time step preview echoes each row's parse result in its "Parsed"
   * column: an unparseable date renders "Invalid", an unparseable time renders
   * "Invalid time format". Both block Next (dtStats counts them invalid → 0
   * valid rows → canProceedDateTime false).
   */
  it('an unparseable date shows "Invalid" in the preview and gates Next', async () => {
    await enterWeather('invdate')
    await stubFileImport('date,temp\nNOTADATE,5\nALSO-BAD,6')
    await advanceToDateTime()
    await Weather.selectDateMode('string')
    await Weather.mapColumn('date', 'date')
    await Weather.setDateFormat('YYYY-MM-DD')
    // Preview "Parsed" cell renders the literal "Invalid" for the bad date.
    await Weather.importWizard.$('td*=Invalid').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    // Next stays gated — no row parsed to a usable Date.
    expect(await staysFalse(() => Weather.wizardNext.isEnabled())).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('an unparseable time shows "Invalid time format" and gates Next', async () => {
    await enterWeather('invtime')
    // Valid date, but the time value is non-numeric junk → invalid_time.
    await stubFileImport('date,time,temp\n2026-01-02,nope,5\n2026-01-03,nope,6')
    await advanceToDateTime()
    await Weather.selectDateMode('string')
    await Weather.mapColumn('date', 'date')
    await Weather.setDateFormat('YYYY-MM-DD')
    await Weather.selectTimeMode('string')
    await Weather.mapColumn('time-string', 'time')
    await Weather.importWizard
      .$('td*=Invalid time format')
      .waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    // invalid_time rows are counted invalid → Next stays gated.
    expect(await staysFalse(() => Weather.wizardNext.isEnabled())).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — mixed validity (unparseable-date rows are excluded)', () => {
  /**
   * canProceedDateTime gates on validCount > 0 (index.tsx:329), NOT on
   * "all rows valid" — so a file with SOME valid + SOME unparseable-date rows
   * clears the Date/Time gate and IMPORTS (unlike an all-invalid file, which
   * gates Next forever). The upload saga (finalizeImportWorker, containers/
   * Weather/saga.ts ~243-248) builds the backend upload from rowKeys filtered by
   * `dtIso !== null`, so a row whose date could not be parsed is EXCLUDED from the
   * import. This is the intended contract: the valid rows import (sorted ascending
   * by Date-Time) and the unparseable-date row is ruled out.
   */
  it('imports only the valid-date rows; the unparseable-date row is excluded', async () => {
    await enterWeather('mixedvalid')
    // Two valid ISO datetimes (deliberately out of order to prove the sort) plus
    // one unparseable-date row carrying temp 9 — which must NOT survive.
    await stubFileImport(
      [
        'datetime,temp',
        '2026-01-01T02:00:00Z,7', // valid, later
        'NOT-A-DATE,9', // unparseable date -> excluded (temp 9 must not appear)
        '2026-01-01T00:00:00Z,5' // valid, earlier
      ].join('\n')
    )
    // Mixed validity clears the Date/Time gate (validCount = 2 > 0), so the
    // import runs to completion rather than gating Next.
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' }
    })
    expect(ok).toBe(true)
    const tempCol = await Weather.waitForColumn('temp')

    // Exactly the TWO valid rows land — the unparseable-date row is excluded.
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'mixed-validity import did not settle to exactly 2 valid rows'
    })
    const rowIds = await Weather.visibleRowIds()
    expect(rowIds.length).toBe(2)

    // Both surviving rows have a real Date-Time (none reads "Invalid"), in
    // ascending order — the earlier 00:00 row precedes the 02:00 row even though
    // the source listed 02:00 first (both render "MM/DD/YYYY HH:MM").
    const dtColId = await Weather.dateTimeColId()
    const dtTexts: string[] = []
    for (const rid of rowIds) dtTexts.push(await Weather.dateTimeCellText(rid, dtColId))
    expect(dtTexts.some((t) => t === 'Invalid')).toBe(false)
    expect(dtTexts[0] < dtTexts[1]).toBe(true)

    // Differential: the surviving temps are the VALID rows' (5 then 7, matching
    // ascending Date-Time order); the excluded row's temp 9 is absent. Keeping the
    // invalid row (a 3rd row / a 9) OR dropping a valid row would fail this.
    const temps: number[] = []
    for (const rid of rowIds) temps.push(Number(await Weather.cellInput(rid, tempCol).getValue()))
    expect(temps).toEqual([5, 7])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — null / empty cells handled', () => {
  /**
   * isUnsupportedCharacterValue treats an empty/whitespace cell as supported
   * (returns false), so a column with explicit blank cells is NOT disabled and
   * still imports. Every row's datetime is valid, so all rows land.
   */
  it('a column with explicit empty cells still imports without disabling', async () => {
    await enterWeather('nullcells')
    await stubFileImport(
      'datetime,temp\n2026-01-01T00:00:00Z,\n2026-01-01T01:00:00Z,6\n2026-01-01T02:00:00Z,'
    )
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' }
    })
    expect(ok).toBe(true)
    await Weather.waitForColumn('temp')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 3, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'rows with empty cells did not all import'
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — wrong delimiter', () => {
  /**
   * Forcing a delimiter that doesn't fit re-parses via parseDelimited, which
   * throws on the column-count mismatch. The wizard catches it, keeps the prior
   * `parsed`, sets parseError → the amber "Parse error:" banner shows on the
   * Data-Preview step and Next gates (canGoNext on step 1 = parseError === null).
   */
  it('choosing a mismatching delimiter shows the "Parse error" banner and gates Next', async () => {
    await enterWeather('wrongdelim')
    // Under comma every line is a clean 2-field row (the "a;b" cell is ONE comma
    // field). Forcing ';' re-parses: header "datetime;temp"→1 field, but the
    // "…,a;b" row splits to 2 fields → field-count mismatch → parseError banner.
    await stubFileImport('datetime,temp\n2026-01-01T00:00:00Z,5\n2026-01-01T01:00:00Z,a;b')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    await Weather.waitForWizardNext() // comma parse OK (uniform 2-field rows)
    await Weather.wizardNext.click() // → Data Preview
    await Weather.setDelimiter(';') // re-parse under ';' → header 1 field, a data row 2 fields
    const banner = Weather.importWizard.$(`div*=${IMPORT_MSG.parseError}`)
    await banner.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    expect(await staysFalse(() => Weather.wizardNext.isEnabled())).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — "Invalid file." banner', () => {
  /**
   * Extends the existing "ragged row keeps Next disabled" case: a parse error on
   * the initial file surfaces the StepFilePreview banner whose bold prefix is
   * exactly "Invalid file." (fileError is null, so it is NOT "Could not open
   * file."). The full banner also includes the parser's mismatch message.
   */
  it('a ragged file shows the "Invalid file." banner on step 0', async () => {
    await enterWeather('invalidbanner')
    await stubFileImport('a,b\n1,2,3')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    const banner = Weather.importWizard.$(`strong*=${IMPORT_MSG.invalidFile}`)
    await banner.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    // The banner also carries the parser's field-mismatch detail.
    await Weather.importWizard.$('div*=expected 2').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — Next gated without a file', () => {
  /**
   * canGoNext returns false while parsed === null, which is the state on a fresh
   * wizard before any Browse. Next must be disabled before a file is picked.
   */
  it('Next is disabled when the wizard opens with no file selected', async () => {
    await enterWeather('nofile')
    await Weather.openImportWizard()
    // Next is gated while no file has been picked (parsed === null).
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — rapid Import clicks import once', () => {
  /**
   * The Import button is disabled while `importing`, guarding double-submit.
   * Firing several clicks in immediate succession must still import exactly one
   * managed column and exactly two rows (no duplication).
   */
  it('clicking Import rapidly imports the column + rows once', async () => {
    await enterWeather('rapid')
    await stubFileImport(
      'datetime,temp\n2026-01-01T00:00:00Z,5\n2026-01-01T01:00:00Z,6'
    )
    await advanceToDateTime()
    await Weather.applyDateTimeMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' }
    })
    await Weather.waitForWizardNext()
    await Weather.wizardNext.click() // → Review
    await Weather.wizardImport.waitForClickable({ timeout: TIMEOUTS.MEDIUM })
    // Fire the click handler several times back-to-back before the wizard unmounts.
    await browser.execute(() => {
      const wizard = document.querySelector('[aria-label="Import Weather Data"]')
      const buttons = Array.from(wizard?.querySelectorAll('button') ?? []) as HTMLButtonElement[]
      const importBtn = buttons.find((b) => (b.textContent ?? '').trim() === 'Import')
      for (let i = 0; i < 5; i++) importBtn?.click()
    })
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 60000 })
    await Weather.waitForColumn('temp')
    // Exactly one "temp" column and exactly two rows — no duplicate import.
    await browser.waitUntil(async () => (await columnCount('temp')) === 1, {
      timeout: 15000,
      timeoutMsg: 'temp column count was not exactly 1 after rapid Import'
    })
    expect(await columnCount('temp')).toBe(1)
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'rapid Import did not yield exactly 2 rows'
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — reload mid-wizard resets cleanly', () => {
  /**
   * The wizard is mounted via `{wizardOpen && <ImportWizard/>}` with wizardOpen
   * in Redux. A renderer reload (reloadToHome — the in-run relaunch equivalent)
   * resets the store, so the wizard is gone and we land back on Home with no
   * orphaned modal. No data was imported.
   */
  it('reloading with the wizard open closes it and returns to Home', async () => {
    await enterWeather('reloadwiz')
    await stubFileImport(
      'datetime,temp\n2026-01-01T00:00:00Z,5\n2026-01-01T01:00:00Z,6'
    )
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    await Weather.waitForWizardNext() // wizard is open mid-flow with a parsed file
    await expect(Weather.importWizard).toBeDisplayed()
    // Relaunch-equivalent: clear active ids + refresh → store resets, wizard unmounts.
    await reloadToHome()
    // Back on Home, no wizard overlay survives the reload.
    await expect(Weather.importWizard).not.toBeDisplayed()
  })
})

describe('Import Wizard — stepper + File Preview (step 0)', () => {
  it('File Preview shows an empty file field before any pick', async () => {
    await enterWeather('filestep')
    await Weather.openImportWizard()
    // The readonly filename field is empty before any pick.
    const fileInput = Weather.importWizard.$('input[readonly]')
    expect(await fileInput.getValue()).toBe('')
  })

  it('displays the picked file name in the readonly field after Browse', async () => {
    await enterWeather('fname')
    await stubFileImport(SAMPLE_CSV, 'mydata.csv')
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
  it('parses the file into preview headers and rows on the first Next', async () => {
    await enterWeather('datastep')
    await openAndBrowse(SAMPLE_CSV)
    await Weather.wizardNext.click() // step 0 → step 1
    // Preview table renders the parsed headers in <th>.
    await Weather.importWizard.$('table thead th').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    const headerCells = await Weather.importWizard
      .$$('table thead th')
      .map((th) => th.getText())
    expect(headerCells).toEqual(['datetime', 'temperature'])
    // Two data rows → two <tbody> rows.
    const bodyRows = await Weather.importWizard.$$('table tbody tr')
    expect(bodyRows.length).toBe(2)
  })

  it('the preview chips reflect the parsed headers', async () => {
    await enterWeather('chips')
    await openAndBrowse(SAMPLE_CSV)
    await Weather.wizardNext.click()
    // The chip labels echo the parsed header names.
    await expect(Weather.importWizard.$('span=datetime')).toBeDisplayed()
    await expect(Weather.importWizard.$('span=temperature')).toBeDisplayed()
  })

  it('overriding the delimiter re-parses the preview headers', async () => {
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
      { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'delimiter override did not re-split the preview headers' }
    )
    const after = await Weather.importWizard.$$('table thead th').map((th) => th.getText())
    expect(after).toEqual(['a;b;c', 'd'])
  })

  it('overriding header-lines-to-skip refreshes the preview headers', async () => {
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
      { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'header-skip override did not refresh the preview headers' }
    )
    const after = await Weather.importWizard.$$('table thead th').map((th) => th.getText())
    expect(after).toEqual(['date', 'temp'])
  })
})

describe('Import Wizard — Date/Time (step 2)', () => {
  it('shows the parsed datetime in the preview for a valid mapping', async () => {
    await enterWeather('dtpreview')
    await openAndBrowse(SAMPLE_CSV)
    await advance() // → Data Preview
    await advance() // → Date/Time (datetime column auto-maps)
    // Auto-mapped ISO datetime → the mapping is valid so Next un-gates.
    await browser.waitUntil(async () => Weather.wizardNext.isEnabled().catch(() => false), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Date/Time step never reached a valid mapping'
    })
    // Every preview row parses; none shows "Invalid".
    const parsedCells = await Weather.importWizard
      .$$('table tbody tr td:last-child')
      .map((td) => td.getText())
    expect(parsedCells.length).toBeGreaterThan(0)
    expect(parsedCells.some((t) => t.includes('Invalid'))).toBe(false)
    // The first raw cell echoes the file value.
    const firstRaw = await Weather.importWizard.$('table tbody tr td').getText()
    expect(firstRaw).toContain('2026-01-01T00:00:00Z')
  })

  it('marks unparsed values "Invalid" in the Date/Time preview', async () => {
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
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'unparsed value never rendered the "Invalid" marker'
    })
    await expect(parsedCol).toHaveText('Invalid')
  })

  it('the date-format dropdown enumerates all supported DATE_FORMATS', async () => {
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

  it('the datetime-format dropdown enumerates all supported DATETIME_FORMATS', async () => {
    await enterWeather('dtfmt')
    await openAndBrowse(SAMPLE_CSV)
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
      'YYYY-MM-DDTHH:MM',
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
  it('shows example values echoing the parsed cell data on Review', async () => {
    await enterWeather('review')
    await openAndBrowse('datetime,temp,humidity\n2026-01-01T00:00:00Z,5,40\n2026-01-01T01:00:00Z,6,41')
    await advance() // → Data Preview
    await advance() // → Date/Time (datetime auto-maps)
    await advance() // → Review & Import
    // Example values = first-3-row cell values joined by ", ".
    await expect(Weather.importWizard.$('td*=5, 6')).toBeDisplayed()
    await expect(Weather.importWizard.$('td*=40, 41')).toBeDisplayed()
  })
})

describe('Import Wizard — Back navigation', () => {
  it('Back from Data Preview returns to File Preview', async () => {
    await enterWeather('back1')
    await openAndBrowse(SAMPLE_CSV)
    await Weather.wizardNext.click() // → Data Preview
    await Weather.dtSelect('delimiter').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.importWizard.$('button=Back').click()
    await Weather.importWizard.$('label=Weather Data File').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await expect(Weather.importWizard.$('label=Weather Data File')).toBeDisplayed()
    // No Back button on step 0.
    expect(await Weather.importWizard.$('button=Back').isExisting()).toBe(false)
  })

  it('Back from Date/Time returns to Data Preview', async () => {
    await enterWeather('back2')
    await openAndBrowse(SAMPLE_CSV)
    await advance() // → Data Preview
    await advance() // → Date/Time
    await Weather.importWizard.$('div*=Date/Time Preview').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.importWizard.$('button=Back').click()
    await Weather.dtSelect('delimiter').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await expect(Weather.dtSelect('delimiter')).toBeDisplayed()
  })

  it('Back from Review & Import returns to Date/Time', async () => {
    await enterWeather('back3')
    await openAndBrowse(SAMPLE_CSV)
    await advance() // → Data Preview
    await advance() // → Date/Time
    await advance() // → Review & Import
    await Weather.importWizard.$('div*=Review columns to import').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.importWizard.$('button=Back').click()
    await Weather.importWizard.$('div*=Date/Time Preview').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await expect(Weather.importWizard.$('div*=Date/Time Preview')).toBeDisplayed()
  })
})

describe('Import Wizard — Cancel from later steps', () => {
  it('Cancel from Data Preview closes the wizard', async () => {
    await enterWeather('cxl1')
    await openAndBrowse(SAMPLE_CSV)
    await Weather.wizardNext.click() // → Data Preview
    await Weather.dtSelect('delimiter').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('Cancel from Review & Import closes the wizard', async () => {
    await enterWeather('cxl2')
    await openAndBrowse(SAMPLE_CSV)
    await advance() // → Data Preview
    await advance() // → Date/Time
    await advance() // → Review & Import
    await Weather.importWizard.$('div*=Review columns to import').waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

describe('Import Wizard — auto-sort on import', () => {
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
      timeout: TIMEOUTS.LONG,
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

describe('Weather import — davis (auto datetime column)', () => {
  it('imports the ISO datetime CSV and the first temp matches the file (~64.6)', async () => {
    await enterWeather('davis')
    await stubRealFile(fixture(FIXTURE_FILES.DAVIS))
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SS' }
    })
    expect(ok).toBe(true)
    const tempCol = await Weather.waitForColumn('temp')
    await Weather.waitForColumn('humidity')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: TIMEOUTS.LONG,
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
  it('rejects AMW.csv: duplicate date-time entries are not supported', async () => {
    // AMW.csv contains duplicate timestamps (e.g. "2026-05-01 01:53" appears
    // twice). The backend intentionally rejects duplicate (date,time) data points
    // with a 400 (_DUPLICATE_DATETIME_MSG, weather_service.py) — duplicates are
    // unsupported BY DESIGN. So the import fails with the "Import failed" banner
    // and the wizard stays open. We assert that rejection, not a successful import.
    await enterWeather('amwcsv')
    await stubRealFile(fixture(FIXTURE_FILES.AMW_CSV))
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    await Weather.waitForWizardNext() // step 0 File Preview
    await Weather.wizardNext.click()
    await Weather.waitForWizardNext() // step 1 Data Preview
    await Weather.wizardNext.click()
    // step 2 Date/Time — map the combined `valid` datetime column
    await Weather.applyDateTimeMapping({
      date: { mode: 'datetime', datetime: 'valid', format: 'YYYY-MM-DD HH:MM' }
    })
    await Weather.waitForWizardNext() // ≥1 valid row
    await Weather.wizardNext.click()
    // step 3 Review — Import is rejected for duplicate timestamps.
    await Weather.wizardImport.waitForClickable({ timeout: 30000 })
    await Weather.wizardImport.click()
    // The import must FAIL (wizard stays open, "Import failed" banner shown) — not
    // succeed. Poll the wizard text so we don't depend on exact banner markup.
    let txt = ''
    const failed = await browser
      .waitUntil(
        async () => {
          txt = await Weather.importWizard.getText().catch(() => '')
          return new RegExp(IMPORT_MSG.importFailed, 'i').test(txt)
        },
        { timeout: 40000 }
      )
      .then(() => true)
      .catch(() => false)
    if (!failed) {
      throw new Error(`AMW.csv import did not show a failure banner. Wizard text: ${txt.slice(0, 400)}`)
    }
    // …and the reason is the duplicate-timestamp rejection.
    await expect(txt).toContain(IMPORT_MSG.duplicate)
  })

  it('detects the tsv-only `sknt` column but disables it (it contains `M` markers)', async () => {
    // AMW.tsv has a tab-delimited `sknt` column the .csv lacks. Tab parsing must
    // pick it up — but `sknt` contains `M` (missing-data) tokens, so the wizard
    // disables it as a character column BY DESIGN (StepReview shows "Character-based
    // columns are disabled as this input is unsupported"). So we assert `sknt` is
    // DETECTED-but-DISABLED on Review (proving the tsv parse) and that a fully
    // numeric column (`tmpc`) still imports.
    await enterWeather('amwtsv')
    await stubRealFile(fixture(FIXTURE_FILES.AMW_TSV))
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    await Weather.waitForWizardNext() // step 0 File Preview
    await Weather.wizardNext.click()
    await Weather.waitForWizardNext() // step 1 Data Preview (tab auto-detected)
    await Weather.wizardNext.click()
    // step 2 Date/Time — map the combined `valid` datetime column
    await Weather.applyDateTimeMapping({
      date: { mode: 'datetime', datetime: 'valid', format: 'YYYY-MM-DD HH:MM' }
    })
    await Weather.waitForWizardNext() // ≥1 valid row
    await Weather.wizardNext.click()
    // step 3 Review — `sknt` is detected (tsv-only) but disabled; `tmpc` is enabled.
    await Weather.reviewColumnCheckbox('sknt').waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await expect(await Weather.reviewColumnCheckbox('sknt').isEnabled()).toBe(false)
    await expect(await Weather.reviewColumnCheckbox('tmpc').isEnabled()).toBe(true)
    await Weather.wizardImport.waitForClickable({ timeout: 30000 })
    await Weather.wizardImport.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 120000 })
    // The numeric column imported; the disabled `sknt` did not.
    await Weather.waitForColumn('tmpc')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: TIMEOUTS.LONG,
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
    await stubRealFile(fixture(FIXTURE_FILES.NLR1))
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
    await stubRealFile(fixture(FIXTURE_FILES.NLR2))
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
    await stubRealFile(fixture(FIXTURE_FILES.NLR3))
    const ok = await Weather.importWithMapping(partsMapping, 30000)
    expect(ok).toBe(true)
    await Weather.waitForColumn('Temperature')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 40000,
      timeoutMsg: 'no rows after importing NLR3'
    })
  })
})

describe('Weather import — re-import replaces existing data', () => {
  it('a second import clears the first (old columns gone, new file present)', async () => {
    await enterWeather('reimport')

    // First import: davis (ISO datetime) → lowercase `temp` + `humidity` columns.
    await stubRealFile(fixture(FIXTURE_FILES.DAVIS))
    const first = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SS' }
    })
    expect(first).toBe(true)
    await Weather.waitForColumn('temp')
    await Weather.waitForColumn('humidity')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 30000,
      timeoutMsg: 'davis import produced no rows'
    })

    // Second import: NLR1 (date/time parts) over the existing data. The import
    // saga clears the scenario before writing (saga.ts finalizeImportWorker), so
    // the davis columns must be GONE and only NLR1's columns remain.
    await stubRealFile(fixture(FIXTURE_FILES.NLR1))
    const second = await Weather.importWithMapping(
      {
        headerSkip: 2,
        date: { mode: 'parts', year: 'Year', month: 'Month', day: 'Day' },
        time: { mode: 'parts', hour: 'Hour', minute: 'Minute' }
      },
      25000
    )
    expect(second).toBe(true)
    const tempCol = await Weather.waitForColumn('Temperature')
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: 30000,
      timeoutMsg: 'NLR1 import produced no rows'
    })

    // The davis-only columns were wiped by the re-import — differential: a merge
    // (rather than replace) would leave them resolvable by name.
    expect(await Weather.colIdForName('temp')).toBe(null)
    expect(await Weather.colIdForName('humidity')).toBe(null)

    // …and the NLR1 content is correct: row 0 Temperature = 8.3 (matches the file).
    const [firstRow] = await Weather.visibleRowIds()
    const temp = await numericCell(firstRow, tempCol)
    if (Math.abs(temp - 8.3) > 0.01) throw new Error(`Temperature[row0] = ${temp}, expected 8.3`)
  })
})

describe('Weather import — replace-confirm gating', () => {
  // The "Replace existing weather data?" confirm keys off ROWS/dataset, not
  // columns (Weather/index.tsx: a fresh scenario always carries a default
  // date/time column, so a column check would false-positive). Adding a column
  // leaves the scenario at 0 rows, so importing must NOT prompt.
  it('no confirm when the scenario has a column but no rows', async () => {
    await enterWeather('confcol')
    await Weather.addColumn('Extra') // header only — scenario stays at 0 rows
    expect(await Weather.rowCount()).toBe(0)

    await stubRealFile(fixture(FIXTURE_FILES.DAVIS))
    const confirmShown = await Weather.importDetectConfirm({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SS' }
    })
    expect(confirmShown).toBe(false) // columns alone don't trigger the confirm
    await Weather.waitForColumn('temp') // import proceeded straight through
  })

  it('clicking No cancels the replace and keeps the existing data', async () => {
    await enterWeather('confno')
    // First import establishes existing data (davis → temp/humidity columns).
    await stubRealFile(fixture(FIXTURE_FILES.DAVIS))
    expect(
      await Weather.importWithMapping({
        date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SS' }
      })
    ).toBe(true)
    await Weather.waitForColumn('temp')
    const rowsBefore = await Weather.rowCount()

    // Second import over existing data → confirm appears → click No.
    await stubRealFile(fixture(FIXTURE_FILES.NLR1))
    const shown = await Weather.importDetectConfirm(
      {
        headerSkip: 2,
        date: { mode: 'parts', year: 'Year', month: 'Month', day: 'Day' },
        time: { mode: 'parts', hour: 'Hour', minute: 'Minute' }
      },
      25000
    )
    expect(shown).toBe(true) // importing over existing data DOES prompt
    await Weather.importConfirmNo.click()
    await Weather.importConfirmDialog.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
    // No closes only the confirm; the wizard stays open — cancel it to clean up.
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })

    // Nothing was replaced: davis data intact, NLR1 not imported.
    expect(await Weather.colIdForName('temp')).not.toBe(null)
    expect(await Weather.rowCount()).toBe(rowsBefore)
    expect(await Weather.colIdForName('Temperature')).toBe(null)
  })
})

describe('Weather import — CIMIS.xml (date string + time string)', () => {
  it('parses the pivoted XML and imports with a discovered date/time mapping', async () => {
    await enterWeather('cimisxml')
    await stubRealFile(fixture(FIXTURE_FILES.CIMIS_XML))
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    await Weather.waitForWizardNext() // step 0: parsed OK
    await Weather.wizardNext.click()
    await Weather.waitForWizardNext() // step 1: data preview
    await Weather.wizardNext.click()
    // step 2: discover the date + time columns from the parsed headers. The XML
    // parses to columns `date` ("M/D/YYYY") and `time` ("HH:MM"), resolved at runtime.
    const cols = await Weather.columnOptions('date')
    const dateCol = cols.find((c) => /^date$/i.test(c)) ?? cols.find((c) => /date/i.test(c))
    const timeCol = cols.find((c) => /^time$/i.test(c)) ?? cols.find((c) => /time/i.test(c))
    if (!dateCol || !timeCol) {
      throw new Error(`CIMIS.xml: could not find date/time columns in [${cols.join(', ')}]`)
    }
    await Weather.selectDateMode('string')
    await Weather.mapColumn('date', dateCol)
    await Weather.setDateFormat('MM/DD/YYYY')
    await Weather.selectTimeMode('string')
    await Weather.mapColumn('time-string', timeCol)
    await Weather.waitForWizardNext() // ≥1 valid row
    await Weather.wizardNext.click()
    await Weather.wizardImport.waitForClickable({ timeout: TIMEOUTS.MEDIUM })
    await Weather.wizardImport.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 60000 })
    // A measurement column (air_temp) and rows landed.
    await browser.waitUntil(async () => (await Weather.dataColumnCount()) > 1, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'CIMIS.xml import added no data columns'
    })
    await browser.waitUntil(async () => (await Weather.rowCount()) > 0, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'CIMIS.xml import added no rows'
    })
  })
})

describe('Weather import — cell-edit persistence on a real import', () => {
  it('edits an imported davis cell and the value survives a project reopen', async () => {
    const { name } = await enterWeather('persistreal')
    await stubRealFile(fixture(FIXTURE_FILES.DAVIS))
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
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: TIMEOUTS.LONG })
    const col2 = await Weather.waitForColumn('humidity')
    const [row2] = await Weather.visibleRowIds()
    await expect(Weather.cellInput(row2, col2)).toHaveValue('55')
  })
})

describe('Weather import — DT-keyword source headers are auto-excluded', () => {
  /**
   * (D-fix) handleImport (ImportWizard/index.tsx) drops a source header from the
   * managed columns when EITHER half of `!dtSet.has(h) && !isDtName(h)` fails:
   *  - dtSet    = the headers actually mapped as the date/time column;
   *  - isDtName = any header whose NAME is a DT keyword (date / time / datetime /
   *    timestamp / year / month / day / hour / minute / date_time).
   * One import of `datetime,time,temperature` exercises BOTH halves:
   *  - `datetime` is mapped → excluded by dtSet.
   *  - `time` is NUMERIC (5,6 — it WOULD import on its own) and is NOT mapped
   *    (datetime mode forces the time side off), so ONLY isDtName excludes it.
   *  - `temperature` is an ordinary measurement → it DOES import (proves the run).
   *
   * Differential for isDtName specifically: delete the `!isDtName(h)` clause and
   * the numeric `time` column imports as a managed column → colIdForName('time')
   * resolves and a "time" header appears → this test goes red. (The earlier
   * version mapped `datetime`, which dtSet alone already excludes, so it could not
   * detect a broken isDtName net.)
   */
  it('a mapped datetime header AND a numeric DT-keyword-named column are both excluded', async () => {
    await enterWeather('dtexclude')
    const csv =
      'datetime,time,temperature\n' +
      '2026-01-01T00:00:00Z,5,10\n' +
      '2026-01-01T01:00:00Z,6,11\n'
    await stubFileImport(csv)
    const ok = await Weather.importWithMapping({
      date: { mode: 'datetime', datetime: 'datetime', format: 'YYYY-MM-DDTHH:MM:SSZ' }
    })
    expect(ok).toBe(true)
    // The ordinary measurement column DID import (proves the import actually ran).
    await Weather.waitForColumn('temperature')
    await browser.waitUntil(async () => (await Weather.rowCount()) === 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'datetime-mapped import did not yield 2 rows'
    })
    // `datetime` is excluded by dtSet (it was the mapped DT column).
    expect(await Weather.colIdForName('datetime')).toBe(null)
    // `time` is excluded ONLY by isDtName — it is numeric and unmapped, so it
    // would import if not for the keyword net. This is the isDtName differential leg.
    expect(await Weather.colIdForName('time')).toBe(null)
    // Neither raw header appears among the rendered data-column headers (the merged
    // column renders the literal "Date-Time", never the raw source names).
    const headerTexts = await Weather.dataColumnHeaders.map((th) => th.getText())
    const trimmed = headerTexts.map((t) => t.trim())
    expect(trimmed).not.toContain('datetime')
    expect(trimmed).not.toContain('time')
  })
})

describe('Weather import — malformed / empty XML is rejected', () => {
  /**
   * (D-gap) parseFile routes any *.xml file (or content starting with "<") to
   * parseXml, which throws on a DOMParser `parsererror` ("Invalid XML format.")
   * or on a document with no records / no root children ("XML is empty or has
   * no records."). The wizard catches the throw, sets parseError, leaves
   * `parsed` null → Next stays gated on the File step and StepFilePreview shows
   * the red "Invalid file." banner carrying the parser message. We mirror the
   * CIMIS.csv / USW.csv rejection assertions (staysFalse + Next disabled),
   * adding the StepFilePreview banner check.
   *
   * Differential: a regression that swallowed the XML parse error (or fell
   * through to the delimited parser) would set `parsed` and enable Next → both
   * the staysFalse gate AND the "Invalid file." banner assertion go red.
   *
   * NOTE (not automated here, by design): calendar-validity checks (Feb 30,
   * month 13) and the Julian day-of-year range check are short-circuited by the
   * Date/Time step's token-count guard before those parser branches are
   * reachable from the UI, so no UI mapping can drive them — they are covered
   * by parsers unit tests, not by unreachable e2e cases.
   */
  it('a malformed .xml is rejected on the File step (Next never enables, "Invalid file." banner)', async () => {
    await enterWeather('badxml')
    // Unclosed/garbage tag → DOMParser parsererror → parseXml throws
    // "Invalid XML format.".
    await stubFileImport('<not valid xml', 'bad.xml')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    // The XML never parses → Next must stay gated on step 0.
    expect(await staysFalse(() => Weather.wizardNext.isEnabled())).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    // The StepFilePreview banner shows with the "Invalid file." prefix (fileError
    // is null, so it is NOT "Could not open file.").
    const banner = Weather.importWizard.$(`strong*=${IMPORT_MSG.invalidFile}`)
    await banner.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('an empty .xml is rejected on the File step (Next never enables)', async () => {
    await enterWeather('emptyxml')
    // Empty content with an .xml name → parseFile → parseXml → DOMParser yields
    // an empty/parsererror document → throw → parseError, Next gated.
    await stubFileImport('', 'empty.xml')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    expect(await staysFalse(() => Weather.wizardNext.isEnabled())).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    // The "Invalid file." banner surfaces the parser rejection.
    const banner = Weather.importWizard.$(`strong*=${IMPORT_MSG.invalidFile}`)
    await banner.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })
})

describe('Weather import — unsupported files are correctly rejected', () => {
  // CIMIS.csv ends with a trailing whitespace-only CRLF line; the parser
  // (correctly, per product) rejects it ("Row 194: 1 fields, expected 26"), so
  // the wizard never leaves the File step. Confirmed-correct app behaviour.
  it('CIMIS.csv is rejected on the File step (Next never enables)', async () => {
    await enterWeather('cimiscsv')
    await stubRealFile(fixture(FIXTURE_FILES.CIMIS_CSV))
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    // The malformed file does not parse -> Next must stay gated.
    expect(await staysFalse(() => Weather.wizardNext.isEnabled(), 6000)).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  // USW.csv DATE is a year-less "MM-DDTHH:MM:SS" (NOAA hourly normals). No wizard
  // datetime format represents a year-less datetime, so no mapping yields a valid
  // row and the Date/Time step never un-gates. Confirmed-correct app behaviour.
  it('USW.csv is rejected: no mapping yields a valid row', async () => {
    await enterWeather('usw')
    await stubRealFile(fixture(FIXTURE_FILES.USW))
    let ok = true
    try {
      ok = await Weather.importWithMapping(
        { date: { mode: 'datetime', datetime: 'DATE', format: 'YYYY-MM-DDTHH:MM:SS' } },
        12000
      )
      expect(ok).toBe(false)
    } finally {
      // The wizard stays open when Next never un-gates — close it so beforeEach is clean.
      if (!ok && (await Weather.importWizard.isDisplayed().catch(() => false))) {
        await Weather.wizardCancel.click().catch(() => undefined)
        await Weather.importWizard
          .waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
          .catch(() => undefined)
      }
    }
  })
})

// uniqueName is imported for parity with other specs that self-provision named
// projects; referenced here to keep the import meaningful if future cases need it.
void uniqueName
