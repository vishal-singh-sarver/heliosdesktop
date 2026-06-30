/**
 * Page Object for the Helios ProjectScreen (the screen you land on after opening
 * a project). Covers the header (project title, lat/lon/UTC, scenario chip,
 * menubar), the collapsible Left/Right panels, and the CenterWorkspace tabs.
 *
 * Conventions (see HomePage.page.ts):
 *  - `browser`, `$`, `$$` are globals; every command returns a Promise — await it.
 *  - data-testid=header / data-testid=menubar are SHARED with HomePage and prove
 *    NOTHING about which screen is mounted. Use projectTitle (ProjectScreen-only)
 *    to confirm we are on the project screen.
 *  - Coordinate inputs (LabeledField) expose aria-label = the label text and set
 *    aria-invalid only when invalid (ABSENT when valid). No inline error text is
 *    rendered for coordinates — assert aria-invalid + outcome, never an error str.
 */

type El = ReturnType<typeof $>
type Field = 'latitude' | 'longitude'
type TabKey = '3dwindow' | 'weather' | 'output'

class ProjectScreenPage {
  // ----- Screen discriminator + header -----
  /** ProjectScreen-only: the project name in the header. Use to confirm mount. */
  get projectTitle(): El {
    return $('[data-testid="project-title"]')
  }
  get scenarioChip(): El {
    return $('[data-testid="scenario-chip"]')
  }
  get goHomeButton(): El {
    return $('[aria-label="Go to home"]')
  }
  get menubar(): El {
    return $('[data-testid="menubar"]')
  }

  // ----- Coordinate fields (LabeledField inputs, keyed by aria-label) -----
  get latInput(): El {
    return $('[aria-label="Latitude"]')
  }
  get lonInput(): El {
    return $('[aria-label="Longitude"]')
  }
  get utcInput(): El {
    return $('[aria-label="UTC Offset"]')
  }
  coordInput(field: Field): El {
    return field === 'latitude' ? this.latInput : this.lonInput
  }
  /** Field-help "?" triggers (react-tooltip). */
  get latHelp(): El {
    return $('[aria-label="Show latitude help"]')
  }
  get lonHelp(): El {
    return $('[aria-label="Show longitude help"]')
  }

  // ----- Panels -----
  get leftPanel(): El {
    return $('[data-testid="left-panel"]')
  }
  get rightPanel(): El {
    return $('[data-testid="right-panel"]')
  }
  get leftCollapseBtn(): El {
    return $('[data-testid="left-panel-collapse-btn"]')
  }
  get rightCollapseBtn(): El {
    return $('[data-testid="right-panel-collapse-btn"]')
  }

  // ----- CenterWorkspace tabs -----
  get centerWorkspace(): El {
    return $('[data-testid="center-workspace"]')
  }
  get centerTabs(): El {
    return $('[data-testid="center-workspace-tabs"]')
  }
  tab(key: TabKey): El {
    return $(`[data-testid="tab-${key}"]`)
  }
  /** Data-independent sentinel that exists ONLY while the Weather tab is mounted
   *  (the table's select-all checkbox; renders even with zero rows). */
  get weatherSentinel(): El {
    return $('[aria-label="Select all rows"]')
  }

  // ===========================================================================
  // Intent methods
  // ===========================================================================

  async goHome(): Promise<void> {
    await this.goHomeButton.click()
  }

  /** Replace a controlled input's value (click -> Ctrl+A -> Delete -> type). */
  private async replaceValue(el: El, value: string): Promise<void> {
    await el.click()
    await browser.keys(['Control', 'a'])
    await browser.keys(['Delete'])
    if (value.length) await el.addValue(value)
  }

  /**
   * Type a coordinate and commit it by blurring (commit fires on blur, not a
   * button). Blur by clicking the OTHER coordinate input.
   */
  async setCoordinate(field: Field, value: string): Promise<void> {
    const target = this.coordInput(field)
    await this.replaceValue(target, value)
    const sibling = field === 'latitude' ? this.lonInput : this.latInput
    await sibling.click() // blur target -> commitCoordinate
  }

  async getCoordValue(field: Field): Promise<string> {
    return this.coordInput(field).getValue()
  }
  async getUtcValue(): Promise<string> {
    return this.utcInput.getValue()
  }
  /** 'true' when invalid; null when valid (aria-invalid is omitted when valid). */
  async coordInvalid(field: Field): Promise<string | null> {
    return this.coordInput(field).getAttribute('aria-invalid')
  }

  // ----- Panels -----
  /** True when the panel <aside> carries the expanded width token. */
  async isPanelExpanded(side: 'left' | 'right'): Promise<boolean> {
    const cls = await (side === 'left' ? this.leftPanel : this.rightPanel).getAttribute('class')
    return (cls ?? '').includes('w-[340px]')
  }
  // The panels animate their width (transition-[width] 150ms). A coordinate click
  // fired right after a prior toggle can land on the still-moving button and miss
  // (the right panel is most exposed — its justify-start button sweeps ~300px as
  // the panel grows leftward). A DOM .click() bypasses hit-testing and is
  // deterministic regardless of the in-flight transition.
  async toggleLeftPanel(): Promise<void> {
    await this.leftCollapseBtn.waitForClickable({ timeout: 10000 })
    await browser.execute((sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null
      el?.click()
    }, '[data-testid="left-panel-collapse-btn"]')
  }
  async toggleRightPanel(): Promise<void> {
    await this.rightCollapseBtn.waitForClickable({ timeout: 10000 })
    await browser.execute((sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null
      el?.click()
    }, '[data-testid="right-panel-collapse-btn"]')
  }

  // ----- Tabs -----
  async selectTab(key: TabKey): Promise<void> {
    await this.tab(key).click()
  }
  /** aria-pressed serializes to the string "true"/"false". */
  async tabActive(key: TabKey): Promise<string | null> {
    return this.tab(key).getAttribute('aria-pressed')
  }

  // ----- Menubar (shared component; scope buttons inside it) -----
  menubarButton(label: 'File' | 'Edit' | 'View' | 'Tools' | 'Help'): El {
    return this.menubar.$(`button=${label}`)
  }

  // ----- Scenario chip buttons (placeholder no-ops — assert exist + inert) -----
  get scenarioRenameBtn(): El {
    return $('[aria-label="Rename scenario"]')
  }
  get scenarioCloseBtn(): El {
    return $('[aria-label="Close scenario"]')
  }
  get scenarioAddBtn(): El {
    return $('[aria-label="Add scenario"]')
  }

  // ----- Panel body emptiness (an expanded panel is a placeholder: its only
  //       interactive child is the collapse toggle). Counting buttons lets a
  //       spec prove the body adds nothing when expanded vs collapsed. -----
  async panelButtonCount(side: 'left' | 'right'): Promise<number> {
    const panel = side === 'left' ? this.leftPanel : this.rightPanel
    return (await panel.$$('button')).length
  }

  // ----- Coordinate inputs as a pair (for mid-session project-switch re-seed) -----
  async coordPair(): Promise<{ lat: string; lon: string; utc: string }> {
    return {
      lat: await this.getCoordValue('latitude'),
      lon: await this.getCoordValue('longitude'),
      utc: await this.getUtcValue()
    }
  }
}

export default new ProjectScreenPage()
