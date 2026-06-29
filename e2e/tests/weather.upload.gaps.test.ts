/**
 * Weather Upload — coverage-gap E2E for the Import Wizard (the real "Upload File"
 * flow, NOT a simple upload field). Extends weather.import.test.ts with cases the
 * existing suite doesn't cover:
 *   WU5  — a cancelled file dialog attaches no file, keeps the banner hidden and
 *          Next disabled.
 *   WU10 — after Browse the wizard's read-only file field shows the picked
 *          filename (StepFilePreview value=filename).
 *   WU34 — a large synthetic CSV imports through the wizard parser without a crash
 *          (column + rows appear; table is virtualized so the rendered window is a
 *          subset).
 *   WU28 — an out-of-range TIME (25:00) on every row marks the Date/Time step
 *          "0 of N rows valid" and keeps Next disabled (extends the invalid-DATE
 *          gating test with an invalid-TIME case).
 *
 * Mirrors the sibling spec: file picks go through the stubbed main-process dialog
 * (stubFileImport / stubFileCancel — there is no real OS picker under WDIO), and a
 * local enterWeather() lands on a seeded scenario before each case.
 */
import Weather, { type ImportMapping } from '../pages/Weather.page'
import {
  enterProject,
  reloadToHome,
  stubFileCancel,
  stubFileImport,
  waitForMainWindow
} from '../support/harness'

/** Auto-mappable fixture: a `datetime`-named ISO column steps straight through. */
const CSV = ['datetime,temperature', '2026-01-01T00:00:00Z,10', '2026-01-01T01:00:00Z,11'].join('\n')

before(async () => {
  await waitForMainWindow()
})

beforeEach(async () => {
  await reloadToHome()
})

async function enterWeather(label = 'wu'): Promise<void> {
  await enterProject(label)
  await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
  await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
}

/** The wizard's read-only "Weather Data File" field (StepFilePreview input). */
function fileField(): ReturnType<typeof $> {
  return Weather.importWizard.$('input[readonly][placeholder="No file selected"]')
}

describe('Weather upload — cancelled file dialog (WU5)', () => {
  it('Browse with a cancelled dialog attaches no file and keeps Next disabled', async () => {
    await enterWeather('wu5')
    await stubFileCancel()
    await Weather.openImportWizard()
    await Weather.wizardBrowse.click()

    // The saga dispatches importPickFileFailed('') on a null path: no file is
    // loaded, the read-only field stays empty, and Next must stay disabled.
    // Give the (no-op) pick a beat, then assert the gate never opened.
    const becameEnabled = await browser
      .waitUntil(async () => Weather.wizardNext.isEnabled().catch(() => false), { timeout: 4000 })
      .then(() => true)
      .catch(() => false)
    expect(becameEnabled).toBe(false)
    expect(await Weather.wizardNext.isEnabled()).toBe(false)
    expect(await fileField().getValue()).toBe('')

    // Empty error string keeps the "Could not open file." / "Invalid file."
    // banner hidden — StepFilePreview renders it only when the error is truthy.
    const banner = Weather.importWizard.$('strong=Could not open file.')
    expect(await banner.isExisting()).toBe(false)

    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather upload — selected filename display (WU10)', () => {
  it('shows the picked file name in the read-only file field after Browse', async () => {
    await enterWeather('wu10')
    await stubFileImport(CSV, 'denver-2026.csv')
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
      timeout: 10000,
      timeoutMsg: 'file field never showed the selected filename'
    })

    await Weather.wizardCancel.click()
    await Weather.importWizard.waitForDisplayed({ reverse: true, timeout: 10000 })
  })
})

describe('Weather upload — large file (WU34)', () => {
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

describe('Weather upload — invalid time gating (WU28)', () => {
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
      await zeroValid.waitForDisplayed({ timeout: 10000 })
      expect(await Weather.wizardNext.isEnabled()).toBe(false)
    } finally {
      if (!ok && (await Weather.importWizard.isDisplayed().catch(() => false))) {
        await Weather.wizardCancel.click().catch(() => undefined)
        await Weather.importWizard
          .waitForDisplayed({ reverse: true, timeout: 10000 })
          .catch(() => undefined)
      }
    }
  })
})
