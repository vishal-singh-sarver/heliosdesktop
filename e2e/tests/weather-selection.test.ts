/**
 * Weather — shift-click row highlight, the selection pill, and BULK DELETE.
 *
 * A complete shipped feature that had zero tests: no file in e2e/ sent a
 * shiftKey, and neither `selection-action-bar` nor `delete-selected-rows-dialog`
 * was referenced anywhere. Behind it sit a six-function pure module
 * (rowHighlight.ts), Escape layering that peels modals before selection, and a
 * pessimistic multi-row delete.
 *
 * ── Mechanics the assertions depend on ────────────────────────────────────
 *
 *  - Shift-click is a per-row TOGGLE, not a range select. handleRowClick calls
 *    toggleHighlight(current, rowId), so shift-clicking rows 1 and 5 highlights
 *    exactly those two. Do not write range expectations.
 *  - The pill UNMOUNTS at count 0 (SelectionActionBar returns null), so
 *    isExisting() is a valid oracle here — unusual in this app, where most UI
 *    hides with CSS and stays in the DOM.
 *  - Escape peels ONE layer: the handler bails while `dialog[open],
 *    [role="dialog"]` matches, so a modal takes the first press and the
 *    highlight the second.
 *  - Bulk delete is PESSIMISTIC, and the dialog closes on the loading -> idle
 *    edge for success AND failure alike (a toast cannot be seen behind a
 *    showModal dialog).
 *  - A successful delete plays a 480ms exit animation during which the table
 *    renders from a frozen snapshot, so the row count does NOT drop
 *    immediately. Every post-delete count assertion must be a waitUntil.
 *  - Row ids are positional (row_N) and are reassigned on reload, but are NOT
 *    renumbered by a delete — so row_0, row_1, row_3 is a legal state
 *    afterwards, and persistence is checked by COUNT plus surviving values.
 */
import Weather from '../pages/Weather.page'
import { clearApiFaults, clearApiLatency, installApiLatency, withApiFault } from '../support/faults'
import {
  deleteProjectViaBackend,
  enterWeather,
  reloadToHome,
  reopenByName,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { TIMEOUTS } from '../config/timeouts'
import { WEATHER_SELECTION } from '../constants/messages'

const SEEDED_ROWS = 6

let projectId: string | null = null
let projectName: string | null = null

before(async () => {
  await waitForMainWindow()
  await waitForBackendReady()
})

beforeEach(async () => {
  await reloadToHome()
  const project = await enterWeather('sel')
  projectId = project.id
  projectName = project.name
  await Weather.addRows(SEEDED_ROWS)
  await browser.waitUntil(async () => (await Weather.rowCount()) === SEEDED_ROWS, {
    timeout: TIMEOUTS.LONG,
    timeoutMsg: `the table never reached ${SEEDED_ROWS} seeded rows`
  })
})

afterEach(async () => {
  await clearApiFaults()
  await clearApiLatency()
  // Leave the project BEFORE deleting it. Deleting while the window still has
  // it open would 404 the next scoped call and raise the blocking scope dialog,
  // which would then intercept the following test's very first click.
  if (projectId) {
    const id = projectId
    projectId = null
    projectName = null
    await reloadToHome().catch(() => {})
    await deleteProjectViaBackend(id).catch(() => {})
  }
})

describe('Weather — shift-click highlight', () => {
  it('shift-clicking one row raises the pill with a SINGULAR count', async () => {
    const [first] = await Weather.visibleRowIds()
    await Weather.shiftClickRow(first)

    await Weather.selectionActionBar.waitForExist({ timeout: TIMEOUTS.MEDIUM })
    expect(await Weather.selectionCount()).toBe(1)
    expect(await Weather.selectionText()).toContain(WEATHER_SELECTION.summarySingular)
    expect(await Weather.isRowHighlighted(first)).toBe(true)
  })

  it('a second row TOGGLES IN and a repeat click toggles it back OUT', async () => {
    const ids = await Weather.visibleRowIds()

    await Weather.shiftClickRow(ids[0])
    await Weather.selectionActionBar.waitForExist({ timeout: TIMEOUTS.MEDIUM })
    expect(await Weather.selectionCount()).toBe(1)

    // Deliberately NOT an adjacent row: if this were a range select, picking
    // index 3 would report 4 selected rather than 2.
    await Weather.shiftClickRow(ids[3])
    await browser.waitUntil(async () => (await Weather.selectionCount()) === 2, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the second shift-click did not add a row to the highlight'
    })
    expect(await Weather.selectionText()).toContain(WEATHER_SELECTION.summaryPlural)

    await Weather.shiftClickRow(ids[3])
    await browser.waitUntil(async () => (await Weather.selectionCount()) === 1, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 're-clicking a highlighted row did not toggle it out'
    })
    expect(await Weather.isRowHighlighted(ids[3])).toBe(false)
    expect(await Weather.isRowHighlighted(ids[0])).toBe(true)
  })

  it('Escape clears the highlight and UNMOUNTS the pill', async () => {
    const [first] = await Weather.visibleRowIds()
    await Weather.shiftClickRow(first)
    await Weather.selectionActionBar.waitForExist({ timeout: TIMEOUTS.MEDIUM })

    await browser.keys(['Escape'])

    await Weather.selectionActionBar.waitForExist({
      reverse: true,
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Escape did not clear the row highlight'
    })
    expect(await Weather.isRowHighlighted(first)).toBe(false)
  })

  it('shift-clicking the checkbox or the trash does NOT highlight', async () => {
    const [first] = await Weather.visibleRowIds()

    // isHighlightExemptTarget uses closest('button, input[type="checkbox"]'),
    // so the trash's inner img is exempt via its wrapping button too.
    await Weather.shiftClickWithin(first, 'input[type="checkbox"]')
    expect(await Weather.selectionActionBar.isExisting()).toBe(false)

    await Weather.shiftClickWithin(first, `[aria-label="Delete row ${first}"]`)
    expect(await Weather.selectionActionBar.isExisting()).toBe(false)
  })
})

describe('Weather — bulk delete', () => {
  it('cancelling keeps every row AND the highlight', async () => {
    const ids = await Weather.visibleRowIds()
    await Weather.shiftClickRow(ids[0])
    await Weather.shiftClickRow(ids[1])
    await browser.waitUntil(async () => (await Weather.selectionCount()) === 2, {
      timeout: TIMEOUTS.MEDIUM
    })

    await Weather.selectionDeleteButton.click()
    await Weather.deleteSelectedRowsDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.deleteSelectedRowsDialog.$(`button=${WEATHER_SELECTION.cancelButton}`).click()
    await Weather.deleteSelectedRowsDialog.waitForDisplayed({
      reverse: true,
      timeout: TIMEOUTS.MEDIUM
    })

    expect(await Weather.rowCount()).toBe(SEEDED_ROWS)
    // The highlight survives a cancel — the pill is still there with its count.
    expect(await Weather.selectionCount()).toBe(2)
  })

  it('the bulk dialog is distinguishable from the single-row one', async () => {
    // Four dialogs in this app share aria-label="Delete"; only the heading and
    // the testid tell them apart.
    const [first] = await Weather.visibleRowIds()
    await Weather.shiftClickRow(first)
    await Weather.selectionDeleteButton.click()

    const dlg = Weather.deleteSelectedRowsDialog
    await dlg.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    expect(await dlg.getText()).toContain(WEATHER_SELECTION.heading)
    expect(await dlg.getText()).toContain(WEATHER_SELECTION.body)
    expect(await Weather.deleteRowDialog.isDisplayed().catch(() => false)).toBe(false)

    await dlg.$(`button=${WEATHER_SELECTION.cancelButton}`).click()
    await dlg.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
  })

  it('confirming deletes EXACTLY the highlighted rows, and it persists', async () => {
    const ids = await Weather.visibleRowIds()
    const dtCol = await Weather.dateTimeColId()
    const survivorText = await Weather.dateTimeCellText(ids[2], dtCol)

    await Weather.shiftClickRow(ids[0])
    await Weather.shiftClickRow(ids[1])
    await browser.waitUntil(async () => (await Weather.selectionCount()) === 2, {
      timeout: TIMEOUTS.MEDIUM
    })

    await Weather.selectionDeleteButton.click()
    await Weather.deleteSelectedRowsDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.deleteSelectedRowsDialog.$(`button=${WEATHER_SELECTION.confirmButton}`).click()

    // The 480ms exit animation renders from a frozen snapshot, so the count
    // drops only once it finishes — poll rather than read.
    await browser.waitUntil(async () => (await Weather.rowCount()) === SEEDED_ROWS - 2, {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: 'the row count never dropped by the two deleted rows'
    })
    expect(await Weather.selectionActionBar.isExisting()).toBe(false)

    // The survivor kept its data, not just its place.
    const afterIds = await Weather.visibleRowIds()
    const texts: string[] = []
    for (const r of afterIds) texts.push(await Weather.dateTimeCellText(r, dtCol))
    expect(texts).toContain(survivorText)

    // And the backend agrees — reopening refetches from the database.
    await reopenByName(projectName as string)
    await browser.waitUntil(async () => (await Weather.rowCount()) === SEEDED_ROWS - 2, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'the deletion did not survive reopening the project'
    })
  })

  it('Escape closes the DIALOG first and only then clears the highlight', async () => {
    const ids = await Weather.visibleRowIds()
    await Weather.shiftClickRow(ids[0])
    await Weather.shiftClickRow(ids[1])
    await browser.waitUntil(async () => (await Weather.selectionCount()) === 2, {
      timeout: TIMEOUTS.MEDIUM
    })

    await Weather.selectionDeleteButton.click()
    await Weather.deleteSelectedRowsDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })

    // First press: the modal goes, the highlight stays.
    await browser.keys(['Escape'])
    await Weather.deleteSelectedRowsDialog.waitForDisplayed({
      reverse: true,
      timeout: TIMEOUTS.MEDIUM
    })
    expect(await Weather.selectionCount()).toBe(2)

    // Second press: now the highlight goes.
    await browser.keys(['Escape'])
    await Weather.selectionActionBar.waitForExist({
      reverse: true,
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the second Escape did not clear the highlight'
    })
  })

  it('the confirm button reads Deleting… and Cancel disables in flight', async () => {
    const ids = await Weather.visibleRowIds()
    await Weather.shiftClickRow(ids[0])
    await browser.waitUntil(async () => (await Weather.selectionCount()) === 1, {
      timeout: TIMEOUTS.MEDIUM
    })

    await installApiLatency('POST', '/deleteRow', 3000)
    await Weather.selectionDeleteButton.click()
    await Weather.deleteSelectedRowsDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    await Weather.deleteSelectedRowsDialog.$(`button=${WEATHER_SELECTION.confirmButton}`).click()

    const disabled = await browser.waitUntil(
      async () => {
        const found = await browser.execute(() => {
          const dlg = document.querySelector('[data-testid="delete-selected-rows-dialog"]')
          if (!dlg) return null
          const busy = Array.from(dlg.querySelectorAll('button'))
            .filter((b) => (b as HTMLButtonElement).disabled)
            .map((b) => (b.textContent || '').trim())
          return busy.length ? busy : null
        })
        return found ?? false
      },
      {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: 'no dialog button ever became disabled while the delete was in flight'
      }
    )
    expect(disabled as string[]).toContain(WEATHER_SELECTION.cancelButton)
  })

  it('a FAILED bulk delete keeps every row', async () => {
    const ids = await Weather.visibleRowIds()
    await Weather.shiftClickRow(ids[0])
    await browser.waitUntil(async () => (await Weather.selectionCount()) === 1, {
      timeout: TIMEOUTS.MEDIUM
    })

    await withApiFault('POST', '/deleteRow', async () => {
      await Weather.selectionDeleteButton.click()
      await Weather.deleteSelectedRowsDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      await Weather.deleteSelectedRowsDialog.$(`button=${WEATHER_SELECTION.confirmButton}`).click()
      // The dialog closes on the loading -> idle edge whether the request
      // succeeded or failed.
      await Weather.deleteSelectedRowsDialog.waitForDisplayed({
        reverse: true,
        timeout: TIMEOUTS.MUTATION
      })
    })

    // Pessimistic: nothing was removed optimistically, so every row is intact.
    expect(await Weather.rowCount()).toBe(SEEDED_ROWS)
  })
})
