/**
 * Page Object for the Helios ProjectScreen (the screen you land on after opening
 * a project). Covers the header (project title, lat/lon/UTC, go-home) and the
 * CenterWorkspace tab switching that the FUNCTIONAL suite drives.
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

import { selectAll } from '../support/harness'

type El = ReturnType<typeof $>
type Field = 'latitude' | 'longitude'
type TabKey = '3dwindow' | 'weather' | 'output'

class ProjectScreenPage {
  // ----- Screen discriminator + header -----
  /** ProjectScreen-only: the project name in the header. Use to confirm mount. */
  get projectTitle(): El {
    return $('[data-testid="project-title"]')
  }
  get goHomeButton(): El {
    return $('[aria-label="Go to home"]')
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

  // ----- CenterWorkspace tabs -----
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

  /** Replace a controlled input's value (click -> select-all -> Delete -> type). */
  private async replaceValue(el: El, value: string): Promise<void> {
    await el.click()
    await selectAll()
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

  // ----- Tabs -----
  async selectTab(key: TabKey): Promise<void> {
    await this.tab(key).click()
  }
}

export default new ProjectScreenPage()
