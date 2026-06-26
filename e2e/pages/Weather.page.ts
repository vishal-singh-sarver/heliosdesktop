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

type El = ReturnType<typeof $>
type ElArray = ReturnType<typeof $$>

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
    return $('[aria-label="Import Weather Data"]')
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
    await browser.keys(['Control', 'a'])
    await browser.keys(['Delete'])
    if (value.length) await input.addValue(value)
    await this.filterButton.click() // blur -> commit
  }

  /** Rename a managed column via its header input and commit on blur. */
  async renameColumn(colId: string, newName: string): Promise<void> {
    const input = this.columnNameInput(colId)
    await input.click()
    await browser.keys(['Control', 'a'])
    await browser.keys(['Delete'])
    if (newName.length) await input.addValue(newName)
    await this.filterButton.click() // blur -> commit
  }

  /** Confirm-delete a column via its trash icon + the delete-column dialog. */
  async deleteColumn(colId: string): Promise<void> {
    await this.deleteColumnButton(colId).click()
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

  /** Resolve the colId of a managed column by its current name (header input). */
  async colIdForName(name: string): Promise<string | null> {
    const inputs = await $$('[aria-label^="Column "][aria-label$=" name"]')
    for (const input of inputs) {
      if ((await input.getValue()) === name) {
        const label = await input.getAttribute('aria-label') // "Column {id} name"
        return label ? label.replace(/^Column /, '').replace(/ name$/, '') : null
      }
    }
    return null
  }

  async openImportWizard(): Promise<void> {
    await this.uploadFileButton.click()
    await this.importWizard.waitForDisplayed({ timeout: 10000 })
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
    await this.wizardImport.click()
    await this.importWizard.waitForDisplayed({ reverse: true, timeout: 30000 })
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

  /** Resolve the rowIds currently rendered (virtualized window only). */
  async visibleRowIds(): Promise<string[]> {
    const els = await this.rows
    const ids: string[] = []
    for (const el of els) {
      const t = await el.getAttribute('data-testid')
      if (t) ids.push(t.replace(/^weather-row-/, ''))
    }
    return ids
  }
}

export default new WeatherPage()
