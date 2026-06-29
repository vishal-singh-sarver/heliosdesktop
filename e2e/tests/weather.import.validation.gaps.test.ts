/**
 * Weather Import Wizard — validation / parsing / edge-case GAPS.
 *
 * Extends the coverage in weather.import.test.ts and weather.realfiles.test.ts
 * with the separator/delimiter variants, character-column disabling, missing /
 * ragged header handling, invalid date/time labelling, null-cell handling,
 * wrong-delimiter parse errors, the "Invalid file." banner, Next-gating with no
 * file, rapid-Import idempotency, and mid-wizard reload reset — asserting the
 * REAL parser/gating behaviour read from containers/Weather/parsers.ts and the
 * components/ImportWizard step sources.
 *
 * Native file dialog is stubbed (stubFileImport) — synthetic in-memory content
 * per variant, driven through the instrumented Date/Time step (Weather.page
 * importWithMapping / applyDateTimeMapping). beforeEach reloadToHome() like the
 * sibling specs; each test self-provisions its own project via enterProject and
 * asserts only on its OWN rows/columns.
 */
import Weather, { type ImportMapping } from '../pages/Weather.page'
import { enterProject, reloadToHome, stubFileImport, waitForMainWindow } from '../support/harness'

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

/** Enter a fresh project and land on the Weather table (mirrors the sibling specs). */
async function enterWeather(label = 'iwgap'): Promise<void> {
  await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
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

/** True if `enabled` stays false for `timeout` ms (a gate that is correctly never satisfied). */
async function staysDisabled(timeout = 3000): Promise<boolean> {
  const becameEnabled = await browser
    .waitUntil(async () => Weather.wizardNext.isEnabled().catch(() => false), { timeout })
    .then(() => true)
    .catch(() => false)
  return becameEnabled === false
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
describe('Weather import — supported date separators (IW47)', () => {
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
    // how IW48 isolates the time separator. For a comma-IN-the-date value the file
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
      timeout: 20000,
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
describe('Weather import — supported time separators (IW48)', () => {
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
      timeout: 20000,
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
      timeout: 20000,
      timeoutMsg: '6-digit compact time did not yield 2 rows'
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — supported delimiters (IW49)', () => {
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
      timeout: 20000,
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
describe('Weather import — character columns disabled on Review (IW45/IW46/IW68)', () => {
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
    const banner = $('div*=Character-based columns are disabled')
    await banner.waitForDisplayed({ timeout: 10000 })
    const cb = Weather.reviewColumnCheckbox('note')
    await cb.waitForDisplayed({ timeout: 10000 })
    expect(await cb.isEnabled()).toBe(false)
    expect(await cb.isSelected()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('special-character-valued column is disabled on Review', async () => {
    await reachReviewWithColumn('charspecial', '#@!')
    await $('div*=Character-based columns are disabled').waitForDisplayed({ timeout: 10000 })
    const cb = Weather.reviewColumnCheckbox('note')
    await cb.waitForDisplayed({ timeout: 10000 })
    expect(await cb.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
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
    await $('div*=Character-based columns are disabled').waitForDisplayed({ timeout: 10000 })
    const cb = Weather.reviewColumnCheckbox('note')
    await cb.waitForDisplayed({ timeout: 10000 })
    expect(await cb.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
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
describe('Weather import — ragged / fewer-column rows (IW56)', () => {
  /**
   * parseDelimited throws when any data row's field count differs from the
   * header row's → parseError, parsed=null, Next stays disabled on step 0.
   * (A header with FEWER columns than its data — IW54 — is NOT covered here:
   * detectHeaderLinesToSkip auto-skips a single mismatched first line, so the
   * parser realigns and Next enables; that case is reported as skipped.)
   */
  it('a data row with fewer columns than the header keeps Next disabled', async () => {
    await enterWeather('fewercols')
    // 3-field header, a 2-field data row → "2 fields, expected 3".
    await stubFileImport('date,temp,humidity\n2026-01-02,5')
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()
    expect(await staysDisabled()).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — invalid date / time labels (IW57/IW58)', () => {
  /**
   * The Date/Time step preview echoes each row's parse result in its "Parsed"
   * column: an unparseable date renders "Invalid", an unparseable time renders
   * "Invalid time format". Both block Next (dtStats counts them invalid → 0
   * valid rows → canProceedDateTime false).
   */
  it('an unparseable date shows "Invalid" in the preview and gates Next (IW57)', async () => {
    await enterWeather('invdate')
    await stubFileImport('date,temp\nNOTADATE,5\nALSO-BAD,6')
    await advanceToDateTime()
    await Weather.selectDateMode('string')
    await Weather.mapColumn('date', 'date')
    await Weather.setDateFormat('YYYY-MM-DD')
    // Preview "Parsed" cell renders the literal "Invalid" for the bad date.
    await Weather.importWizard.$('td*=Invalid').waitForDisplayed({ timeout: 10000 })
    // Next stays gated — no row parsed to a usable Date.
    expect(await staysDisabled()).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })

  it('an unparseable time shows "Invalid time format" and gates Next (IW58)', async () => {
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
      .waitForDisplayed({ timeout: 10000 })
    // invalid_time rows are counted invalid → Next stays gated.
    expect(await staysDisabled()).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — null / empty cells handled (IW67)', () => {
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
      timeout: 20000,
      timeoutMsg: 'rows with empty cells did not all import'
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — wrong delimiter (IW65)', () => {
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
    const banner = Weather.importWizard.$('div*=Parse error')
    await banner.waitForDisplayed({ timeout: 10000 })
    expect(await staysDisabled()).toBe(true)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — "Invalid file." banner (IW50)', () => {
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
    const banner = Weather.importWizard.$('strong*=Invalid file')
    await banner.waitForDisplayed({ timeout: 10000 })
    // The banner also carries the parser's field-mismatch detail.
    await Weather.importWizard.$('div*=expected 2').waitForDisplayed({ timeout: 10000 })
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — Next gated without a file (IW59)', () => {
  /**
   * canGoNext returns false while parsed === null, which is the state on a fresh
   * wizard before any Browse. Next must be disabled before a file is picked.
   */
  it('Next is disabled when the wizard opens with no file selected', async () => {
    await enterWeather('nofile')
    await Weather.openImportWizard()
    // The file input shows its empty-state placeholder and Next is gated.
    await expect(Weather.importWizard.$('input[placeholder="No file selected"]')).toBeDisplayed()
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — rapid Import clicks import once (IW69)', () => {
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
    await Weather.wizardImport.waitForClickable({ timeout: 10000 })
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
      timeout: 20000,
      timeoutMsg: 'rapid Import did not yield exactly 2 rows'
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Weather import — reload mid-wizard resets cleanly (IW64)', () => {
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
