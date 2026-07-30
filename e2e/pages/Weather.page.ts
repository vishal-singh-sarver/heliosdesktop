/**
 * Page Object for the Weather container (CenterWorkspace default tab): the
 * toolbar, the virtualized table (headers / rows / cells / selection), and the
 * Add-Column / Add-Rows / Delete dialogs.
 *
 * Verified selector facts (see design doc):
 *  - Toolbar buttons render their label as text -> select by EXACT text ("Add
 *    Columns" and "Add Rows" both contain "Add", so exact match matters).
 *  - Delete Data button: aria-label="Delete uploaded weather file".
 *  - THREE dialogs share aria-label="Delete" -> use the per-dialog data-testids
 *    we added: delete-column-dialog / delete-row-dialog / delete-import-dialog.
 *  - Row checkbox aria-label="Select {rowId}"; editable cell aria-label="{rowId}
 *    {colId}"; delete-row aria-label="Delete row {rowId}"; managed column name
 *    input aria-label="Column {colId} name"; delete-column aria-label="Delete
 *    column {colId}". Reserved/date-time cells are read-only spans -> use the
 *    weather-cell-{rowId}-{colId} testid we added.
 *  - colId for managed columns is the dynamic backend header id (resolve at runtime).
 *  - Add dialog fields use FormField input-{name}/error-{name} where {name} is the
 *    formik field name (parameterName/dataTypeId/unitId/defaultValue ; numberOfRows/
 *    startDate/startTime/deltaHours).
 */

import { selectAll } from '../support/harness'

type El = ReturnType<typeof $>
type ElArray = ReturnType<typeof $$>

/**
 * Declarative date/time mapping for {@link WeatherPage.importWithMapping}.
 * Column fields are SOURCE HEADER NAMES (the wizard's <select> option `value`
 * is the header verbatim, so we drive them with selectByAttribute('value', …)).
 * Format fields are the wizard's format KEYS (DATE_FORMATS / DATETIME_FORMATS
 * `value`, e.g. 'YYYY-MM-DD HH:MM').
 */
export interface ImportMapping {
  /** Header lines to skip — files with metadata rows above the real header (NLR*). */
  headerSkip?: number
  /** Delimiter character to force on the Data-Preview step (e.g. '\t'). */
  delimiter?: string
  /** Date side: the mode + the source column header(s) + format where needed. */
  date:
    | { mode: 'datetime'; datetime: string; format: string }
    | { mode: 'string'; date: string; format: string }
    | { mode: 'parts'; year: string; month: string; day: string }
    | { mode: 'julian'; julianYear: string; julianDay: string }
  /** Time side; omit / 'none' when the date already carries the time (datetime mode). */
  time?:
    | { mode: 'none' }
    | { mode: 'parts'; hour: string; minute?: string }
    | { mode: 'string'; time: string }
    | { mode: 'compact'; time: string }
  /** Column headers to UNCHECK on the Review step before importing. */
  excludeColumns?: string[]
}

/**
 * Minimal catalog shapes returned by GET /api/data-types/ (see
 * ProjectScreen/types.ts DataUnitDef/DataTypeDef). Only the fields the
 * Add-Column tests read are typed here.
 */
export interface WeatherCatalogUnit {
  id: number
  unit: string
  alias: string
  min: number | null
  max: number | null
  is_base: boolean
  // Affine map back to the type's base unit: base = value*factor + offset.
  // Used by tests that predict a concrete converted value (unit round-trip).
  to_base_factor: number
  to_base_offset: number
}
export interface WeatherCatalogType {
  id: number
  data_type: string
  units: WeatherCatalogUnit[]
}

class WeatherPage {
  // ----- Toolbar -----
  get filterButton(): El {
    return $('button=Filter')
  }
  get addColumnsButton(): El {
    return $('button=Add Columns')
  }
  get addRowsButton(): El {
    return $('button=Add Rows')
  }
  get uploadFileButton(): El {
    return $('button=Upload File')
  }
  get deleteDataButton(): El {
    return $('[aria-label="Delete uploaded weather file"]')
  }

  // ----- Table header -----
  get selectAllCheckbox(): El {
    return $('[aria-label="Select all rows"]')
  }
  get actionHeader(): El {
    return $('[data-testid="weather-header-action"]')
  }
  get dateTimeHeaderTrigger(): El {
    return $('[data-testid="datetime-header-trigger"]')
  }
  columnHeader(colId: string): El {
    return $(`[data-testid="weather-header-${colId}"]`)
  }
  /** All data-column header <th> (excludes the action header). */
  get dataColumnHeaders(): ElArray {
    return $$('[data-testid^="weather-header-"]:not([data-testid="weather-header-action"])')
  }

  // ----- Table body (virtualized) -----
  get rows(): ElArray {
    return $$('[data-testid^="weather-row-"]')
  }
  row(rowId: string): El {
    return $(`[data-testid="weather-row-${rowId}"]`)
  }
  cell(rowId: string, colId: string): El {
    return $(`[data-testid="weather-cell-${rowId}-${colId}"]`)
  }
  cellInput(rowId: string, colId: string): El {
    return $(`[aria-label="${rowId} ${colId}"]`)
  }
  rowCheckbox(rowId: string): El {
    return $(`[aria-label="Select ${rowId}"]`)
  }
  deleteRowButton(rowId: string): El {
    return $(`[aria-label="Delete row ${rowId}"]`)
  }
  /** Managed-column header name input (commits on blur). */
  columnNameInput(colId: string): El {
    return $(`[aria-label="Column ${colId} name"]`)
  }
  deleteColumnButton(colId: string): El {
    return $(`[aria-label="Delete column ${colId}"]`)
  }
  /**
   * Inline error <p> shown under a managed column's header name input
   * (HeaderEditor renders it for client-side required/30-char errors AND for a
   * backend rejection such as a duplicate-name 409). Scoped to THIS column's
   * editor via the name input's parent so a sibling column's error can't match.
   */
  columnNameError(colId: string): El {
    return this.columnNameInput(colId).parentElement().$('p.text-red-500')
  }

  // ----- Dialogs (disambiguated by the test-ids we added) -----
  get addColumnDialog(): El {
    return $('[data-testid="add-column-dialog"]')
  }
  get addRowsDialog(): El {
    return $('[data-testid="add-rows-dialog"]')
  }
  get deleteImportDialog(): El {
    return $('[data-testid="delete-import-dialog"]')
  }
  get deleteColumnDialog(): El {
    return $('[data-testid="delete-column-dialog"]')
  }
  get deleteRowDialog(): El {
    return $('[data-testid="delete-row-dialog"]')
  }
  dialogCloseButton(dialog: El): El {
    return dialog.$('[data-testid="dialog-close"]')
  }

  // ----- Add Column dialog fields -----
  get acName(): El {
    return this.addColumnDialog.$('[data-testid="input-parameterName"]')
  }
  get acDataType(): El {
    return this.addColumnDialog.$('[data-testid="input-dataTypeId"]')
  }
  get acUnit(): El {
    return this.addColumnDialog.$('[data-testid="input-unitId"]')
  }
  get acDefault(): El {
    return this.addColumnDialog.$('[data-testid="input-defaultValue"]')
  }
  get acNameError(): El {
    return this.addColumnDialog.$('[data-testid="error-parameterName"]')
  }
  get acDefaultError(): El {
    return this.addColumnDialog.$('[data-testid="error-defaultValue"]')
  }
  /** Server banner — role=alert WITHOUT a data-testid (field errors carry one). */
  get acServerError(): El {
    return this.addColumnDialog.$('p.form-error-text[role="alert"]:not([data-testid])')
  }
  get acSubmit(): El {
    return this.addColumnDialog.$('button=Add')
  }
  get acCancel(): El {
    return this.addColumnDialog.$('button=Cancel')
  }

  // ----- Add Rows dialog fields -----
  get arNumberOfRows(): El {
    return this.addRowsDialog.$('[data-testid="input-numberOfRows"]')
  }
  get arStartDate(): El {
    return this.addRowsDialog.$('[data-testid="input-startDate"]')
  }
  get arStartTime(): El {
    return this.addRowsDialog.$('[data-testid="input-startTime"]')
  }
  get arDeltaHours(): El {
    return this.addRowsDialog.$('[data-testid="input-deltaHours"]')
  }
  arError(field: 'numberOfRows' | 'startDate' | 'startTime' | 'deltaHours'): El {
    return this.addRowsDialog.$(`[data-testid="error-${field}"]`)
  }
  get arSubmit(): El {
    return this.addRowsDialog.$('button=Add')
  }
  get arCancel(): El {
    return this.addRowsDialog.$('button=Cancel')
  }

  // ----- Import wizard (custom role=dialog overlay, NOT a native <dialog>) -----
  get importWizard(): El {
    return $('[role="dialog"][aria-label="Import Weather Data"]')
  }
  get wizardClose(): El {
    return this.importWizard.$('[aria-label="Close"]')
  }
  get wizardBrowse(): El {
    return this.importWizard.$('button=Browse')
  }
  get wizardNext(): El {
    return this.importWizard.$('button=Next')
  }
  get wizardImport(): El {
    return this.importWizard.$('button=Import')
  }
  get wizardCancel(): El {
    return this.importWizard.$('button=Cancel')
  }

  // ----- "Replace existing weather data?" confirm. Importing over a scenario that
  // already has data (a prior file OR manually added rows) pops this NATIVE
  // <dialog> (Weather/index.tsx). It shares the wizard's aria-label, so we select
  // it by element type (`dialog`, not the wizard's `div[role=dialog]`). A first
  // import into an empty scenario does NOT prompt. -----
  get importConfirmDialog(): El {
    return $('dialog[aria-label="Import Weather Data"]')
  }
  get importConfirmYes(): El {
    return this.importConfirmDialog.$('button=Yes')
  }
  get importConfirmNo(): El {
    return this.importConfirmDialog.$('button=No')
  }
  /** Success/precision toast sentinel (its dismiss button — toast has no testid). */
  get importToastDismiss(): El {
    return $('[aria-label="Dismiss import notification"]')
  }

  // ===========================================================================
  // Intent methods
  // ===========================================================================

  /**
   * Set a controlled (React/Formik) input's value reliably — including native
   * <input type=date>, which per-segment typing can't drive. Queries the node by
   * CSS selector inside the page (passing an element ref into execute is what
   * triggered "Illegal invocation"), sets the value via the prototype setter, and
   * dispatches input+change so React's onChange fires. `selector` must resolve to
   * exactly one input (the add-dialog FormField test-ids are unique while open).
   */
  async setReactInput(selector: string, value: string): Promise<void> {
    await browser.execute(
      (sel: string, val: string) => {
        const node = document.querySelector(sel) as HTMLInputElement | null
        if (!node) throw new Error(`setReactInput: no element for ${sel}`)
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
          ?.set
        setter?.call(node, val)
        node.dispatchEvent(new Event('input', { bubbles: true }))
        node.dispatchEvent(new Event('change', { bubbles: true }))
      },
      selector,
      value
    )
  }

  async openAddColumns(): Promise<void> {
    await this.addColumnsButton.click()
    await this.addColumnDialog.waitForDisplayed({ timeout: 10000 })
  }
  async openAddRows(): Promise<void> {
    await this.addRowsButton.click()
    await this.addRowsDialog.waitForDisplayed({ timeout: 10000 })
  }

  /**
   * Provision rows. On a fresh (empty) scenario Start Date/Time are empty and
   * required, so we always set them. Waits for the dialog to close (toolbar
   * closes it on the loading->idle success edge) and for a row to appear.
   */
  async addRows(
    count: number,
    opts: { startDate?: string; startTime?: string; deltaHours?: string } = {}
  ): Promise<void> {
    const { startDate = '2026-01-01', startTime = '00:00', deltaHours = '1' } = opts
    await this.openAddRows()
    await this.setReactInput('[data-testid="input-numberOfRows"]', String(count))
    await this.setReactInput('[data-testid="input-startDate"]', startDate)
    await this.setReactInput('[data-testid="input-startTime"]', startTime)
    await this.setReactInput('[data-testid="input-deltaHours"]', deltaHours)
    await this.arSubmit.click()
    await this.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
    await browser.waitUntil(async () => (await this.rowCount()) > 0, {
      timeout: 20000,
      timeoutMsg: 'no rows appeared after Add Rows'
    })
  }

  /**
   * Open the Add-Rows dialog and return its auto-seeded field values. The dialog
   * derives Start Date/Time + Delta from the last existing row on open
   * (AddRowsDialog.tsx inferDeltaHours/seededStart). Leaves the dialog OPEN — the
   * caller asserts the values then closes it (arCancel).
   */
  async addRowsSeededValues(): Promise<{ startDate: string; startTime: string; deltaHours: string }> {
    await this.openAddRows()
    // The dialog seeds its fields in a React effect (resetForm on open) that
    // flushes AFTER the dialog element is displayed — poll until the seed has
    // propagated so a fast run can't read the inputs while still empty. (Callers
    // use this only when data exists, so a seeded start date is always non-empty.)
    await browser.waitUntil(async () => (await this.arStartDate.getValue()) !== '', {
      timeout: 5000,
      timeoutMsg: 'Add-Rows dialog did not seed its start date'
    })
    return {
      startDate: await this.arStartDate.getValue(),
      startTime: await this.arStartTime.getValue(),
      deltaHours: await this.arDeltaHours.getValue()
    }
  }

  /** Number of body rows currently rendered (virtualized window). */
  async rowCount(): Promise<number> {
    return (await this.visibleRowIds()).length
  }

  /** Number of data-column headers (excludes the Action header). */
  async dataColumnCount(): Promise<number> {
    return this.dataColumnHeaders.length
  }

  /**
   * Add a column. dataType/unit are optional (select by visible label text).
   * Returns the new column's backend colId, resolved from the header name input.
   */
  async addColumn(
    name: string,
    opts: { dataType?: string; unit?: string; defaultValue?: string } = {}
  ): Promise<void> {
    await this.openAddColumns()
    await this.setReactInput('[data-testid="input-parameterName"]', name)
    if (opts.dataType) await this.acDataType.selectByVisibleText(opts.dataType)
    if (opts.unit) await this.acUnit.selectByVisibleText(opts.unit)
    if (opts.defaultValue != null)
      await this.setReactInput('[data-testid="input-defaultValue"]', opts.defaultValue)
    await this.acSubmit.click()
    await this.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
  }

  /** Replace an editable cell's value and commit it (blur via the no-op Filter button). */
  async editCell(rowId: string, colId: string, value: string): Promise<void> {
    const input = this.cellInput(rowId, colId)
    await input.click()
    await selectAll()
    await browser.keys(['Delete'])
    if (value.length) await input.addValue(value)
    await this.filterButton.click() // blur -> commit
  }

  /** Rename a managed column via its header input and commit on blur. */
  async renameColumn(colId: string, newName: string): Promise<void> {
    const input = this.columnNameInput(colId)
    await input.click()
    await selectAll()
    await browser.keys(['Delete'])
    if (newName.length) await input.addValue(newName)
    await this.filterButton.click() // blur -> commit
  }

  /** Confirm-delete a column via its trash icon + the delete-column dialog. */
  async deleteColumn(colId: string): Promise<void> {
    // At scale the table scrolls horizontally and a mid-table column's trash icon
    // can sit past the window edge. The header strip is `overflow-x: clip`, so
    // scrollIntoView can't bring it into a clickable position and a coordinate
    // click gets intercepted. Fire the React handler directly via the DOM.
    await this.deleteColumnButton(colId).waitForExist({ timeout: 10000 })
    await browser.execute((label: string) => {
      const el = document.querySelector(`[aria-label="${label}"]`) as HTMLElement | null
      el?.click()
    }, `Delete column ${colId}`)
    await this.deleteColumnDialog.waitForDisplayed({ timeout: 10000 })
    await this.deleteColumnDialog.$('button=Delete').click()
    await this.deleteColumnDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
  }

  /** Confirm-delete a row via its trash icon + the delete-row dialog. */
  async deleteRow(rowId: string): Promise<void> {
    await this.deleteRowButton(rowId).click()
    await this.deleteRowDialog.waitForDisplayed({ timeout: 10000 })
    await this.deleteRowDialog.$('button=Delete').click()
    await this.deleteRowDialog.waitForDisplayed({ reverse: true, timeout: 15000 })
  }

  /**
   * Delete every row one by one until the table is empty. Always removes the
   * FIRST visible row: the top of the list is always inside the virtual window,
   * so (unlike deleting the last row) no scroll shifts the window mid-operation.
   * Waits for each row to unmount before the next. A safety cap guards against an
   * infinite loop if a delete ever silently no-ops.
   */
  async deleteAllRows(): Promise<void> {
    for (let guard = 0; (await this.rowCount()) > 0; guard++) {
      if (guard > 5000) throw new Error('deleteAllRows: exceeded 5000 iterations')
      const [first] = await this.visibleRowIds()
      await this.deleteRow(first)
      await this.row(first).waitForExist({
        reverse: true,
        timeout: 15000,
        timeoutMsg: `row "${first}" did not disappear after delete`
      })
    }
  }

  /**
   * colIds of every MANAGED column (the reserved Date-Time column has no name
   * input). Single-shot DOM read — see visibleRowIds for why.
   */
  async managedColumnIds(): Promise<string[]> {
    return browser.execute(() =>
      Array.from(document.querySelectorAll('[aria-label^="Column "][aria-label$=" name"]'))
        .map((el) =>
          (el.getAttribute('aria-label') || '').replace(/^Column /, '').replace(/ name$/, '')
        )
        .filter(Boolean)
    )
  }

  /**
   * Delete every managed column one by one, waiting for each column's name input
   * to unmount before the next. The reserved Date-Time column has no delete
   * control, so it survives; the loop stops when no managed columns remain.
   */
  async deleteAllManagedColumns(): Promise<void> {
    for (let guard = 0; ; guard++) {
      if (guard > 1000) throw new Error('deleteAllManagedColumns: exceeded 1000 iterations')
      const ids = await this.managedColumnIds()
      if (ids.length === 0) return
      const [colId] = ids
      await this.deleteColumn(colId)
      await this.columnNameInput(colId).waitForExist({ reverse: true, timeout: 15000 })
    }
  }

  /**
   * Resolve the colId of a managed column by its current name (header input).
   *
   * Single-shot DOM read for the same reason as visibleRowIds: this is polled
   * while columns are being added/renamed/deleted, so a getValue()/getAttribute()
   * pair per header raced the re-render and produced stale-element warnings.
   */
  async colIdForName(name: string): Promise<string | null> {
    return browser.execute((needle: string) => {
      const inputs = Array.from(
        document.querySelectorAll('[aria-label^="Column "][aria-label$=" name"]')
      ) as HTMLInputElement[]
      for (const input of inputs) {
        if (input.value === needle) {
          const label = input.getAttribute('aria-label') || '' // "Column {id} name"
          return label.replace(/^Column /, '').replace(/ name$/, '') || null
        }
      }
      return null
    }, name)
  }

  async openImportWizard(): Promise<void> {
    await this.uploadFileButton.click()
    await this.importWizard.waitForDisplayed({ timeout: 10000 })
  }

  /**
   * Click the wizard's Import and finish. Importing over a scenario that already
   * has data pops a "Replace existing weather data?" confirm that must be accepted
   * before the import runs; a first import into an empty scenario has no prompt.
   * We race confirm-appears vs wizard-closes so the no-prompt case pays no fixed
   * wait, click Yes if prompted, then wait for the wizard to close.
   */
  /**
   * Click the wizard's Import and wait until EITHER the "Replace existing weather
   * data?" confirm appears OR the wizard closes (no confirm → import ran). Returns
   * whether the confirm appeared, WITHOUT accepting/dismissing it — the caller
   * decides (importConfirmYes / importConfirmNo). Racing avoids a fixed wait on
   * the common no-confirm path.
   */
  async clickImportAndDetectConfirm(closeTimeout = 120000): Promise<boolean> {
    await this.wizardImport.click()
    await browser.waitUntil(
      async () => {
        const confirmShown = await this.importConfirmYes.isDisplayed().catch(() => false)
        const wizardGone = await this.importWizard
          .isDisplayed()
          .then((d) => !d)
          .catch(() => true)
        return confirmShown || wizardGone
      },
      { timeout: closeTimeout, timeoutMsg: 'import: no replace-confirm and wizard never closed' }
    )
    return this.importConfirmYes.isDisplayed().catch(() => false)
  }

  /**
   * Click Import and finish the happy path: accept the replace-confirm if it
   * appears (importing over existing data), then wait for the wizard to close.
   */
  private async clickImportAndFinish(closeTimeout = 120000): Promise<void> {
    if (await this.clickImportAndDetectConfirm(closeTimeout)) {
      await this.importConfirmYes.click()
    }
    await this.importWizard.waitForDisplayed({ reverse: true, timeout: closeTimeout })
  }

  /**
   * Full happy-path import: open the wizard, Browse (the file-dialog stub must be
   * installed first), step through (File -> Data -> Date/Time -> Review) and
   * Import. Waits for the wizard to close. Assumes a fixture the wizard can
   * auto-map (e.g. a `datetime`-named column).
   */
  async runImport(): Promise<void> {
    await this.openImportWizard()
    await this.wizardBrowse.click()
    for (let step = 0; step < 3; step++) {
      await browser.waitUntil(async () => this.wizardNext.isEnabled().catch(() => false), {
        timeout: 15000,
        timeoutMsg: `wizard Next never enabled at step ${step}`
      })
      await this.wizardNext.click()
    }
    await this.wizardImport.waitForClickable({ timeout: 10000 })
    await this.clickImportAndFinish(30000)
  }

  /** Wait for a managed column with `name` to exist and return its backend colId. */
  async waitForColumn(name: string): Promise<string> {
    let colId: string | null = null
    await browser.waitUntil(
      async () => {
        colId = await this.colIdForName(name)
        return colId != null
      },
      { timeout: 15000, timeoutMsg: `column "${name}" never appeared` }
    )
    return colId as unknown as string
  }

  /**
   * Resolve the rowIds currently rendered (virtualized window only).
   *
   * ONE browser.execute rather than a getAttribute round-trip per row. The
   * table is virtualized and this is polled inside waitUntil loops, so rows
   * unmount between round-trips — each unmount logged a "Request encountered a
   * stale element" warning, and a single spec could emit a hundred of them.
   * A synchronous snapshot cannot go stale mid-read.
   */
  async visibleRowIds(): Promise<string[]> {
    return browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid^="weather-row-"]'))
        .map((el) => (el.getAttribute('data-testid') || '').replace(/^weather-row-/, ''))
        .filter(Boolean)
    )
  }

  // ===========================================================================
  // Import Wizard — Date/Time mapping step (instrumented test hooks)
  //   Date modes:  dt-datemode-{parts|string|julian|datetime}
  //   Time modes:  dt-timemode-{parts|string|compact}
  //   Selects:     dt-{day|month|year|julianYear|julianDay|date|datetime|
  //                hour|minute|time-string|time-compact|date-format|datetime-format}
  //   Data step:   dt-delimiter (select) · dt-header-skip (number input)
  //   Review step: dt-select-all · dt-col-<header> (checkboxes)
  // ===========================================================================

  dateModeRadio(mode: 'parts' | 'string' | 'julian' | 'datetime'): El {
    return $(`[data-testid="dt-datemode-${mode}"]`)
  }
  timeModeRadio(mode: 'parts' | 'string' | 'compact'): El {
    return $(`[data-testid="dt-timemode-${mode}"]`)
  }
  dtSelect(field: string): El {
    return $(`[data-testid="dt-${field}"]`)
  }

  // Which select(s) a date/time mode mounts — used to confirm the mode switch
  // re-rendered before we try to map a column into it.
  private static readonly DATE_MODE_SELECTS: Record<string, string> = {
    parts: 'year',
    string: 'date',
    julian: 'julianYear',
    datetime: 'datetime'
  }
  private static readonly TIME_MODE_SELECTS: Record<string, string> = {
    parts: 'hour',
    string: 'time-string',
    compact: 'time-compact'
  }

  async selectDateMode(mode: 'parts' | 'string' | 'julian' | 'datetime'): Promise<void> {
    await this.dateModeRadio(mode).click()
    await this.dtSelect(WeatherPage.DATE_MODE_SELECTS[mode]).waitForExist({ timeout: 15000 })
  }
  async selectTimeMode(mode: 'parts' | 'string' | 'compact'): Promise<void> {
    await this.timeModeRadio(mode).click()
    await this.dtSelect(WeatherPage.TIME_MODE_SELECTS[mode]).waitForExist({ timeout: 15000 })
  }
  /** Map a date/time component select to a source column by its header name. */
  async mapColumn(field: string, header: string): Promise<void> {
    // The date/time selects re-render after a header-skip re-parse and after a
    // mode switch mounts the part-selects. Heavy files (8784-row NSRDB) parse +
    // render slowly, so wait for the option to actually exist before selecting —
    // otherwise selectByAttribute races the render and throws "value=… not found".
    await browser.waitUntil(async () => (await this.columnOptions(field)).includes(header), {
      timeout: 30000,
      timeoutMsg: `option "${header}" never appeared in dt-${field}`
    })
    await this.dtSelect(field).selectByAttribute('value', header)
  }
  async setDateFormat(key: string): Promise<void> {
    await this.dtSelect('date-format').selectByAttribute('value', key)
  }
  async setDateTimeFormat(key: string): Promise<void> {
    await this.dtSelect('datetime-format').selectByAttribute('value', key)
  }
  async setDelimiter(delimiterChar: string): Promise<void> {
    await this.dtSelect('delimiter').selectByAttribute('value', delimiterChar)
  }
  async setHeaderSkip(n: number): Promise<void> {
    await this.setReactInput('[data-testid="dt-header-skip"]', String(n))
  }
  /** Header names available as options in a date/time component select. */
  async columnOptions(field: string): Promise<string[]> {
    const opts = await this.dtSelect(field).$$('option')
    const out: string[] = []
    for (const o of opts) {
      const v = await o.getAttribute('value')
      if (v) out.push(v)
    }
    return out
  }

  // ----- Review-step column include/exclude -----
  reviewColumnCheckbox(header: string): El {
    return $(`[data-testid="dt-col-${header}"]`)
  }
  async excludeReviewColumn(header: string): Promise<void> {
    const cb = this.reviewColumnCheckbox(header)
    if (await cb.isSelected()) await cb.click()
  }
  async reviewSelectAll(checked: boolean): Promise<void> {
    const cb = $('[data-testid="dt-select-all"]')
    if ((await cb.isSelected()) !== checked) await cb.click()
  }

  /** Wait until the wizard's primary Next button is enabled (step gate satisfied). */
  async waitForWizardNext(timeout = 20000): Promise<void> {
    await browser.waitUntil(async () => this.wizardNext.isEnabled().catch(() => false), {
      timeout,
      timeoutMsg: 'wizard Next never became enabled'
    })
  }
  /** True at the Date/Time step once the mapping yields ≥1 valid row (Next gates on it). */
  async dateTimeReady(): Promise<boolean> {
    return this.wizardNext.isEnabled().catch(() => false)
  }

  /** Apply a date/time mapping on the (already-open) Date/Time step. */
  async applyDateTimeMapping(mapping: ImportMapping): Promise<void> {
    const d = mapping.date
    await this.selectDateMode(d.mode)
    if (d.mode === 'datetime') {
      await this.mapColumn('datetime', d.datetime)
      await this.setDateTimeFormat(d.format)
    } else if (d.mode === 'string') {
      await this.mapColumn('date', d.date)
      await this.setDateFormat(d.format)
    } else if (d.mode === 'parts') {
      await this.mapColumn('year', d.year)
      await this.mapColumn('month', d.month)
      await this.mapColumn('day', d.day)
    } else {
      await this.mapColumn('julianYear', d.julianYear)
      await this.mapColumn('julianDay', d.julianDay)
    }
    // datetime mode forces time off (the component sets timeMode='none').
    const t = mapping.time ?? { mode: 'none' as const }
    if (d.mode !== 'datetime' && t.mode !== 'none') {
      await this.selectTimeMode(t.mode)
      if (t.mode === 'parts') {
        await this.mapColumn('hour', t.hour)
        if (t.minute) await this.mapColumn('minute', t.minute)
      } else if (t.mode === 'string') {
        await this.mapColumn('time-string', t.time)
      } else {
        await this.mapColumn('time-compact', t.time)
      }
    }
  }

  /**
   * Full import with an EXPLICIT mapping (for files the wizard can't auto-map).
   * Assumes the file-dialog stub is already installed (stubRealFile/stubFileImport).
   * Returns true if the import completed; false if the Date/Time step never
   * reached ≥1 valid row within `dtTimeout` (caller decides finding vs. failure).
   */
  async importWithMapping(mapping: ImportMapping, dtTimeout = 15000): Promise<boolean> {
    if (!(await this.stepToReview(mapping, dtTimeout))) return false
    await this.clickImportAndFinish(120000)
    return true
  }

  /**
   * Like importWithMapping, but clicks Import and RETURNS whether the "Replace
   * existing weather data?" confirm appeared — leaving it OPEN for the caller to
   * accept (importConfirmYes) or dismiss (importConfirmNo). For tests of the
   * confirm's presence/absence and the No path. Returns null if the Date/Time
   * gate never opened (mapping produced no valid rows).
   */
  async importDetectConfirm(mapping: ImportMapping, dtTimeout = 15000): Promise<boolean | null> {
    if (!(await this.stepToReview(mapping, dtTimeout))) return null
    return this.clickImportAndDetectConfirm(120000)
  }

  /**
   * Step the wizard from open through Review, leaving the Import button clickable
   * (does NOT click it). Returns false if the Date/Time step never reached ≥1
   * valid row within dtTimeout. Shared by importWithMapping and importDetectConfirm.
   */
  private async stepToReview(mapping: ImportMapping, dtTimeout = 15000): Promise<boolean> {
    await this.openImportWizard()
    await this.wizardBrowse.click()
    await this.waitForWizardNext() // step 0 File Preview
    await this.wizardNext.click()
    // step 1 Data Preview — header-skip change re-parses the whole file (slow on
    // big files), so give the Next gate extra room.
    if (mapping.delimiter) await this.setDelimiter(mapping.delimiter)
    if (mapping.headerSkip != null) await this.setHeaderSkip(mapping.headerSkip)
    await this.waitForWizardNext(40000)
    await this.wizardNext.click()
    // step 2 Date/Time
    await this.applyDateTimeMapping(mapping)
    const ready = await browser
      .waitUntil(async () => this.dateTimeReady(), { timeout: dtTimeout })
      .then(() => true)
      .catch(() => false)
    if (!ready) return false
    await this.wizardNext.click()
    // step 3 Review — building the import records maps every row; backend upload of
    // thousands of rows + columns also takes time. Both need generous timeouts.
    for (const h of mapping.excludeColumns ?? []) await this.excludeReviewColumn(h)
    await this.wizardImport.waitForClickable({ timeout: 30000 })
    return true
  }

  // ===========================================================================
  // Catalog access (GET /api/data-types/) — units carry min/max ranges and the
  // is_base flag the Add-Column dialog auto-selects on data-type change. Fetched
  // in-page via the SAME backend the app talks to (window.api.getBackendUrl()).
  // Any failure resolves to null so callers can self-skip rather than falsely
  // fail. Shape mirrors DataTypeDef/DataUnitDef in ProjectScreen/types.ts.
  // ===========================================================================

  async fetchCatalog(): Promise<WeatherCatalogType[] | null> {
    const catalog = await browser.execute(async () => {
      try {
        const api = (window as unknown as { api?: { getBackendUrl?: () => Promise<string | null> } })
          .api
        const base = (await api?.getBackendUrl?.()) ?? ''
        const res = await fetch(`${base}/api/data-types/`)
        return res.ok ? await res.json() : null
      } catch {
        return null
      }
    })
    return (catalog as { data_types?: WeatherCatalogType[] } | null)?.data_types ?? null
  }

  /**
   * The label the Add-Column dialog's unit <select> renders for a unit:
   * "unit (alias)" when an alias exists, else the bare unit. Mirrors
   * AddColumnDialog.tsx unitOptions (~143-150).
   */
  unitSelectLabel(u: WeatherCatalogUnit): string {
    return u.alias ? `${u.unit} (${u.alias})` : u.unit
  }

  // ===========================================================================
  // Header data-type / unit picker (drives unit CONVERSION on unit change)
  //   Trigger:  [aria-label="Column {colId} data type and unit"]
  //   Popover:  role="listbox"; options are role="option" buttons
  // ===========================================================================

  headerPickerButton(colId: string): El {
    return $(`[aria-label="Column ${colId} data type and unit"]`)
  }
  get pickerListbox(): El {
    return $('[role="listbox"]')
  }
  async headerPickerLabel(colId: string): Promise<string> {
    return (await this.headerPickerButton(colId).getText()).trim()
  }
  async openHeaderPicker(colId: string): Promise<void> {
    // The header strip is `overflow-x: clip`, so once many columns exist a
    // column's picker button can sit under the collapsed right panel — a
    // coordinate click is then intercepted or never becomes interactable. Fire
    // the React handler via the DOM (same technique as deleteColumn).
    await this.headerPickerButton(colId).waitForExist({ timeout: 10000 })
    await browser.execute((label: string) => {
      const el = document.querySelector(`[aria-label="${label}"]`) as HTMLElement | null
      el?.click()
    }, `Column ${colId} data type and unit`)
    await this.pickerListbox.waitForDisplayed({ timeout: 10000 })
  }
  /** Option labels (data types in type-view, units in unit-view) currently shown. */
  async pickerOptions(): Promise<string[]> {
    const opts = await this.pickerListbox.$$('[role="option"]')
    const out: string[] = []
    for (const o of opts) out.push((await o.getText()).trim())
    return out
  }
  /** Click an option whose label exactly equals OR starts with `text` (units render "unit (alias)"). */
  async pickerPick(text: string): Promise<void> {
    await this.pickerListbox.waitForExist({ timeout: 10000 })
    // getText()/click() return '' / fail for options whose popover renders
    // off-screen (a far-right column at scale — the header strip is overflow-x:
    // clip). Read textContent and click by index IN-PAGE, both position-agnostic.
    const labels = (await browser.execute(() =>
      Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).map((el) =>
        (el.textContent ?? '').trim()
      )
    )) as string[]
    const idx = labels.findIndex(
      (label) => label === text || label.startsWith(`${text} (`) || label.startsWith(`${text}(`)
    )
    if (idx === -1) {
      throw new Error(`picker option not found: "${text}" (options: ${labels.join(' | ')})`)
    }
    await browser.execute((i: number) => {
      const els = document.querySelectorAll('[role="listbox"] [role="option"]')
      ;(els[i] as HTMLElement | undefined)?.click()
    }, idx)
  }
  async pickerBack(): Promise<void> {
    await this.pickerListbox.$('button*=Back to Assign Type').click()
  }

  /** Assign data type + unit to a fresh managed column (atomic two-step pick). */
  async assignDataTypeUnit(colId: string, dataType: string, unit: string): Promise<void> {
    await this.openHeaderPicker(colId)
    await this.pickerPick(dataType) // → advances to unit view
    // Existence, not visibility: at scale the popover can render off-screen, where
    // waitForDisplayed never resolves even though the options are in the DOM.
    await this.pickerListbox.$('[role="option"]').waitForExist({ timeout: 10000 })
    await this.pickerPick(unit) // → commits {dataTypeId, unitId}, closes popover
    await this.pickerListbox.waitForExist({ reverse: true, timeout: 10000 })
  }
  /** Change ONLY the unit (data type already assigned → opens straight into unit view). */
  async changeUnit(colId: string, unit: string): Promise<void> {
    await this.openHeaderPicker(colId)
    await this.pickerPick(unit)
    await this.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })
  }

  // ===========================================================================
  // Cell validation reads (CellInput exposes aria-invalid + a tooltip aria-label)
  // ===========================================================================

  /** 'true' when the cell shows a validation error; null when valid. */
  async cellInvalid(rowId: string, colId: string): Promise<string | null> {
    return this.cellInput(rowId, colId).getAttribute('aria-invalid')
  }
  /**
   * The cell's validation message (from the info-icon tooltip), or null if none.
   *
   * Reads the DOM in ONE browser.execute rather than isExisting() followed by
   * getAttribute(). CellInput mounts the tooltip conditionally on `displayError`,
   * so it is a sibling that unmounts and remounts as the value changes. Split
   * across two round-trips, the element could exist for the isExisting() check
   * and be gone by the getAttribute() call, which threw
   *   "Can't call getElementAttribute ... because element wasn't found"
   * and aborted the enclosing waitUntil instead of just returning a
   * not-yet-matching value. That surfaced as the air_humidity flake: it is the
   * only type whose base->alt switch (0-1 -> 0-100) leaves the probe value
   * out-of-range for BOTH units, so the tooltip re-renders with new text while
   * the poll is reading it. A single synchronous read cannot tear.
   */
  async cellError(rowId: string, colId: string): Promise<string | null> {
    return browser.execute((cellLabel: string) => {
      const input = document.querySelector(`[aria-label="${cellLabel}"]`)
      const tip = input?.parentElement?.querySelector('[aria-label^="Validation error:"]')
      const label = tip?.getAttribute('aria-label')
      return label ? label.replace(/^Validation error:\s*/, '') : null
    }, `${rowId} ${colId}`)
  }

  // ===========================================================================
  // Date-Time format picker (DateTimeHeader): the trigger opens a role=listbox
  // whose role=option text === the catalog format pattern (u.unit). Picking one
  // PATCHes the date-time column's unitId and re-renders every date-time cell
  // via formatDateTime (WeatherTable.tsx). These helpers are NEW — they don't
  // touch the existing header data-type/unit picker (headerPicker* above).
  // ===========================================================================

  /** Open the Date-Time format dropdown and wait for its listbox. */
  async openDateTimeFormatPicker(): Promise<void> {
    await this.dateTimeHeaderTrigger.click()
    await this.pickerListbox.waitForDisplayed({ timeout: 10000 })
  }

  /** The format options currently shown: their text (pattern) + selected flag. */
  async dateTimeFormatOptions(): Promise<{ text: string; selected: boolean }[]> {
    const opts = await this.pickerListbox.$$('[role="option"]')
    const out: { text: string; selected: boolean }[] = []
    for (const o of opts) {
      const text = (await o.getText()).trim()
      const selected = (await o.getAttribute('aria-selected')) === 'true'
      out.push({ text, selected })
    }
    return out
  }

  /** Click the format option whose text exactly equals `text` (closes the listbox). */
  async pickDateTimeFormat(text: string): Promise<void> {
    const opts = await this.pickerListbox.$$('[role="option"]')
    for (const o of opts) {
      if ((await o.getText()).trim() === text) {
        await o.click()
        await this.pickerListbox.waitForDisplayed({ reverse: true, timeout: 10000 })
        return
      }
    }
    throw new Error(`date-time format option not found: "${text}"`)
  }

  /**
   * Resolve the merged Date-Time column's colId. On a fresh scenario the only
   * data column is the merged date-time column, so its header testid
   * ("weather-header-<colId>") yields the colId. Reads the FIRST data-column
   * header — call after addRows on an otherwise-empty scenario.
   */
  async dateTimeColId(): Promise<string> {
    const first = this.dataColumnHeaders[0]
    if (!(await first.isExisting())) throw new Error('no data-column headers found')
    const testId = await first.getAttribute('data-testid') // "weather-header-<colId>"
    if (!testId) throw new Error('first data-column header has no data-testid')
    return testId.replace(/^weather-header-/, '')
  }

  /** Rendered text of a date-time cell (read-only <span> inside the cell <td>). */
  async dateTimeCellText(rowId: string, colId: string): Promise<string> {
    return (await this.cell(rowId, colId).getText()).trim()
  }
}

export default new WeatherPage()
