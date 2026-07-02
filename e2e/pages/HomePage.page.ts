/**
 * Page Object for the Helios HomePage screen.
 *
 * ALL HomePage selectors live here; specs express user intent and assertions.
 * Dynamic ids (row/rename/delete) are server UUIDs, so methods that target a
 * specific project take the id as a parameter.
 *
 * Conventions (see e2e/tests/app.test.ts):
 *  - `browser`, `$`, `$$` are globals (typed via @wdio/globals/types) — no imports.
 *  - Every WebdriverIO command returns a Promise; callers must await.
 *  - Shared test-ids (dialog-close, input-projectName, error-projectName) are
 *    scoped by chaining `$` off the owning dialog element.
 *  - Dialog action buttons have NO test-id; we select them by visible text,
 *    scoped inside the owning dialog.
 *  - The real <dialog> element is ALWAYS in the DOM (isOpen toggles showModal/
 *    close), so dialog open/closed is asserted via visibility (waitForDisplayed
 *    / { reverse: true }) — never waitForExist.
 */

type El = ReturnType<typeof $>
type ElArray = ReturnType<typeof $$>

class HomePagePage {
  // ----- Static shell test-ids -----
  get header(): El {
    return $('[data-testid="header"]')
  }
  get menubar(): El {
    return $('[data-testid="menubar"]')
  }
  get searchbar(): El {
    return $('[data-testid="searchbar"]')
  }
  get sidebar(): El {
    return $('[data-testid="sidebar"]')
  }
  get projectsTable(): El {
    return $('[data-testid="projects-table"]')
  }

  // ----- Create-dialog triggers -----
  /** Only present when the project list is empty (EmptyState). */
  get emptyStateCreateButton(): El {
    return $('[data-testid="table-create-new"]')
  }
  /** Sidebar "New Project" — always present while on HomePage. */
  get sidebarNewProject(): El {
    return $('[data-testid="sidebar-New Project"]')
  }

  // ----- Dialogs -----
  get createDialog(): El {
    return $('[data-testid="create-project-dialog"]')
  }
  get deleteDialog(): El {
    return $('[data-testid="delete-project-dialog"]')
  }
  get renameDialog(): El {
    return $('[data-testid="rename-project-dialog"]')
  }

  // ----- Create-dialog fields (scoped to the create dialog) -----
  get createNameInput(): El {
    return this.createDialog.$('[data-testid="input-projectName"]')
  }
  get createLatInput(): El {
    return this.createDialog.$('[data-testid="input-latitude"]')
  }
  get createLonInput(): El {
    return this.createDialog.$('[data-testid="input-longitude"]')
  }
  get createNameError(): El {
    return this.createDialog.$('[data-testid="error-projectName"]')
  }
  get createLatError(): El {
    return this.createDialog.$('[data-testid="error-latitude"]')
  }

  // ----- Rename-dialog field (rendered name is `projectName`, scoped to dialog) -----
  get renameNameInput(): El {
    return this.renameDialog.$('[data-testid="input-projectName"]')
  }

  // ----- Rows (virtualized; ids are server UUIDs — query by prefix) -----
  get rows(): ElArray {
    return $$('[data-testid^="row-"]')
  }
  row(id: string): El {
    return $(`[data-testid="row-${id}"]`)
  }
  /** Per-row kebab button — no test-id, identified by its aria-label. */
  kebabButton(name: string): El {
    return $(`[aria-label="Open actions for ${name}"]`)
  }
  renameMenuItem(id: string): El {
    return $(`[data-testid="rename-${id}"]`)
  }
  deleteMenuItem(id: string): El {
    return $(`[data-testid="delete-${id}"]`)
  }

  // ----- Dialog action buttons (no test-id → select by visible text, scoped) -----
  get createSubmitButton(): El {
    return this.createDialog.$('button=Create')
  }
  get renameSaveButton(): El {
    return this.renameDialog.$('button=Save')
  }
  get deleteConfirmButton(): El {
    return this.deleteDialog.$('button=Delete')
  }

  /** Scoped close (×) button for a given dialog element. */
  closeButton(dialog: El): El {
    return dialog.$('[data-testid="dialog-close"]')
  }

  // ----- Actions (user intent) -----

  async openCreateDialogViaEmptyState(): Promise<void> {
    await this.emptyStateCreateButton.waitForDisplayed()
    await this.emptyStateCreateButton.click()
    await this.createDialog.waitForDisplayed()
  }

  async openCreateDialogViaSidebar(): Promise<void> {
    await this.sidebarNewProject.waitForDisplayed()
    await this.sidebarNewProject.click()
    await this.createDialog.waitForDisplayed()
  }

  /**
   * Fill the three create fields and submit. Does NOT wait for the result —
   * success navigates away from HomePage, failure keeps the dialog open.
   *
   * Uses clear-then-type (not plain setValue): the lat/long fields pre-fill with
   * the UC Davis default (INITIAL_VALUES), and setValue does NOT reliably empty a
   * controlled (Formik/React) input first — React re-renders the old value back,
   * so the typed value would append to the default ("38.5412.34") and fail
   * validation, leaving the dialog open (create never navigates).
   */
  async fillAndSubmitCreate(name: string, lat: string, lon: string): Promise<void> {
    await this.replaceInput(this.createNameInput, name)
    await this.replaceInput(this.createLatInput, lat)
    await this.replaceInput(this.createLonInput, lon)
    await this.createSubmitButton.click()
  }

  /**
   * Robustly set a controlled (Formik/React) input: focus, select-all, delete,
   * then type. Plain setValue can leave the previous value because React
   * re-renders the input from state. Pass '' to just clear the field.
   */
  private async replaceInput(el: El, value: string): Promise<void> {
    await el.click()
    await browser.keys(['Control', 'a'])
    await browser.keys(['Delete'])
    if (value.length) await el.addValue(value)
  }

  /** Client-side instant search (no HTTP). Sets the searchbar value directly. */
  async search(text: string): Promise<void> {
    await this.searchbar.setValue(text)
  }

  /**
   * Clear the search box. setValue('') does NOT reliably empty a controlled
   * (React-state) input — it re-renders the old value back — so we focus,
   * select-all, and delete to genuinely reset the filter.
   */
  async clearSearch(): Promise<void> {
    await this.searchbar.click()
    await browser.keys(['Control', 'a'])
    await browser.keys(['Delete'])
  }

  /** Open a row's kebab action menu by project name. */
  async openRowMenu(name: string): Promise<void> {
    const kebab = await this.kebabButton(name)
    await kebab.waitForDisplayed()
    await kebab.click()
  }

  /** From an open row menu, click Rename → opens the rename dialog. */
  async requestRename(id: string): Promise<void> {
    const item = await this.renameMenuItem(id)
    await item.waitForDisplayed()
    await item.click()
    await this.renameDialog.waitForDisplayed()
  }

  /** From an open row menu, click Delete → opens the delete dialog. */
  async requestDelete(id: string): Promise<void> {
    const item = await this.deleteMenuItem(id)
    await item.waitForDisplayed()
    await item.click()
    await this.deleteDialog.waitForDisplayed()
  }

  /** Confirm deletion in the delete dialog. */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.waitForClickable()
    await this.deleteConfirmButton.click()
  }

  /**
   * Read back the concrete row-<uuid> testids currently rendered (virtualized
   * window only), returning the bare UUIDs. Lets a spec discover the id of a
   * project it just created without knowing the server UUID in advance.
   */
  async visibleRowIds(): Promise<string[]> {
    const els = await this.rows
    const ids: string[] = []
    for (const el of els) {
      const testid = await el.getAttribute('data-testid')
      if (testid) ids.push(testid.replace(/^row-/, ''))
    }
    return ids
  }

  /** Resolve the row id for a project by its (unique) name, or null if absent. */
  async rowIdForName(name: string): Promise<string | null> {
    const ids = await this.visibleRowIds()
    for (const id of ids) {
      const text = await this.row(id).getText()
      if (text.includes(name)) return id
    }
    return null
  }

  // ===========================================================================
  // Exhaustive-suite additions
  // ===========================================================================

  // ----- Extra create-dialog fields / buttons / errors -----
  get createLonError(): El {
    return this.createDialog.$('[data-testid="error-longitude"]')
  }
  get createCancelButton(): El {
    return this.createDialog.$('button=Cancel')
  }
  /** Create server/duplicate error: <p class="text-red-600" role="alert"> —
   *  distinct class from the field errors (form-error-text), scoped to the dialog. */
  get createServerError(): El {
    return this.createDialog.$('p.text-red-600[role="alert"]')
  }
  async cancelCreateDialog(): Promise<void> {
    await this.createCancelButton.click()
    await this.createDialog.waitForDisplayed({ reverse: true })
  }
  async closeCreateDialogViaX(): Promise<void> {
    await this.closeButton(this.createDialog).click()
    await this.createDialog.waitForDisplayed({ reverse: true })
  }

  // ----- Rename-dialog cancel / errors -----
  get renameCancelButton(): El {
    return this.renameDialog.$('button=Cancel')
  }
  get renameNameError(): El {
    return this.renameDialog.$('[data-testid="error-projectName"]')
  }
  /** Rename SERVER error <p class="form-error-text" role="alert"> — same class as
   *  the field error, but the field error carries data-testid="error-projectName"
   *  and the server one does NOT, so exclude testid'd nodes. */
  get renameServerError(): El {
    return this.renameDialog.$('p.form-error-text[role="alert"]:not([data-testid])')
  }

  // ----- Delete-dialog copy / buttons -----
  get deleteCancelButton(): El {
    return this.deleteDialog.$('button=Cancel')
  }
  get deleteHeading(): El {
    return this.deleteDialog.$('h3')
  }
  get deleteBody(): El {
    return this.deleteDialog.$('p')
  }

  // ----- Sidebar items + active state (data-active is a stringified boolean) -----
  get sidebarHome(): El {
    return $('[data-testid="sidebar-Home"]')
  }
  get sidebarOpenProject(): El {
    return $('[data-testid="sidebar-Open project"]')
  }
  async sidebarActive(label: 'Home' | 'New Project' | 'Open project'): Promise<string | null> {
    return $(`[data-testid="sidebar-${label}"]`).getAttribute('data-active')
  }

  // ----- Menubar New Project entry (only assert presence; hover-gated to click) -----
  get menubarNewProject(): El {
    return $('[data-testid="menu-New Project"]')
  }

  // ----- Kebab state reads -----
  async kebabExpanded(name: string): Promise<string | null> {
    return this.kebabButton(name).getAttribute('aria-expanded')
  }
  async kebabDisabled(name: string): Promise<boolean> {
    return !(await this.kebabButton(name).isEnabled())
  }

  // ----- Sort headers (data-testid="sort-<key>"); aria-sort lives on the <th> -----
  sortButton(key: 'name' | 'last_updated' | 'size'): El {
    return $(`[data-testid="sort-${key}"]`)
  }
  async clickSort(key: 'name' | 'last_updated' | 'size'): Promise<void> {
    const btn = this.sortButton(key)
    await btn.waitForClickable()
    await btn.click()
  }
  /** Read the aria-sort of a column's <th> ('none'|'ascending'|'descending'). */
  async ariaSort(key: 'name' | 'last_updated' | 'size'): Promise<string | null> {
    return browser.execute((k: string) => {
      const btn = document.querySelector(`[data-testid="sort-${k}"]`)
      const th = btn ? btn.closest('th') : null
      return th ? th.getAttribute('aria-sort') : null
    }, key)
  }
  /** Visible row name cells (first <td> text), top-to-bottom in DOM order. */
  async visibleRowNames(): Promise<string[]> {
    const els = await this.rows
    const names: string[] = []
    for (const el of els) {
      const cell = await el.$('td:first-child')
      names.push((await cell.getText()).trim())
    }
    return names
  }

  // ----- Misc interaction helpers -----
  async pressEscape(): Promise<void> {
    await browser.keys(['Escape'])
  }
  /** Close an open kebab menu by clicking the searchbar (outside the <tbody> menu root). */
  async clickOutsideMenu(): Promise<void> {
    await this.searchbar.click()
  }

  // ===========================================================================
  // Gap-coverage additions: placeholders, tooltips, toolbar, row cells, dialog copy
  // ===========================================================================

  // ----- Placeholder reads -----
  async searchPlaceholder(): Promise<string | null> {
    return this.searchbar.getAttribute('placeholder')
  }
  async createNamePlaceholder(): Promise<string | null> {
    return this.createNameInput.getAttribute('placeholder')
  }
  async createLatPlaceholder(): Promise<string | null> {
    return this.createLatInput.getAttribute('placeholder')
  }
  async createLonPlaceholder(): Promise<string | null> {
    return this.createLonInput.getAttribute('placeholder')
  }

  // ----- Field-help tooltips (react-tooltip 5.x; hover-gated, inline, no portal) -----
  // Trigger is a focusable <span aria-label="Show <field> help"> rendering "?".
  // The tooltip node is created ON hover, carries role="tooltip" + class
  // react-tooltip, and gets react-tooltip__show when fully open; it is REMOVED
  // from the DOM after the fade-out on mouseleave.
  helpTrigger(field: 'project name' | 'latitude' | 'longitude'): El {
    return $(`[aria-label="Show ${field} help"]`)
  }
  get visibleTooltip(): El {
    return $('.react-tooltip.react-tooltip__show')
  }
  /**
   * Hover a field-help "?" and wait for its tooltip to open. We assert the bubble
   * EXISTS with the `react-tooltip__show` class (added on open) rather than
   * waitForDisplayed — the projectName tooltip uses place:right and can render
   * clipped off-viewport, which WDIO reports as "not displayed" even though it
   * is open.
   */
  async hoverTooltip(field: 'project name' | 'latitude' | 'longitude'): Promise<El> {
    const trigger = this.helpTrigger(field)
    await trigger.waitForDisplayed({ timeout: 10000 })
    await trigger.moveTo()
    const tip = this.visibleTooltip
    await tip.waitForExist({ timeout: 3000 })
    return tip
  }
  /** Move off the trigger to dismiss, then wait for the open tooltip node to detach. */
  async dismissTooltip(): Promise<void> {
    await this.createDialogTitle.moveTo()
    await this.visibleTooltip.waitForExist({ reverse: true, timeout: 3000 })
  }

  // ----- Toolbar (MenuBar) -----
  toolbarMenuButton(label: 'File' | 'Edit' | 'View' | 'Tools' | 'Help'): El {
    return this.menubar.$(`button=${label}`)
  }
  menuItem(label: string): El {
    return $(`[data-testid="menu-${label}"]`)
  }
  /**
   * Click a menubar dropdown item. The items are CSS `visibility:hidden` until
   * the parent is hovered, so a real .click() is "not interactable" — dispatch
   * the click via JS, which still fires React's onClick handler.
   */
  async clickMenuItem(label: string): Promise<void> {
    await browser.execute((lbl: string) => {
      const node = document.querySelector(`[data-testid="menu-${lbl}"]`) as HTMLElement | null
      node?.click()
    }, label)
  }

  // ----- Project row cells (4 <td>: name / last_updated / size / actions) -----
  rowNameCell(id: string): El {
    return this.row(id).$('td:nth-child(1) span')
  }
  rowDateCell(id: string): El {
    return this.row(id).$('td:nth-child(2)')
  }
  rowSizeCell(id: string): El {
    return this.row(id).$('td:nth-child(3)')
  }
  async rowCellCount(id: string): Promise<number> {
    return (await this.row(id).$$('td')).length
  }

  // ----- Create-dialog copy (title + field labels) -----
  get createDialogTitle(): El {
    return this.createDialog.$('h2')
  }
  createFieldLabel(text: 'Project Name' | 'Latitude' | 'Longitude'): El {
    return this.createDialog.$(`label*=${text}`)
  }
}

export default new HomePagePage()
