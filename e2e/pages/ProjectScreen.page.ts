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
  /** Whether a tab is the active one — TabButton carries the state as aria-pressed. */
  async tabActive(key: TabKey): Promise<boolean> {
    return (await this.tab(key).getAttribute('aria-pressed')) === 'true'
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

  /**
   * Wait until the header inputs have been seeded from the project record.
   *
   * ProjectScreen seeds lat/lon in an effect that fires when `activeProject`
   * lands and calls formik.resetForm (one-shot per project id, guarded by
   * seededProjectIdRef). Until it fires, both boxes are ''. Typing into that
   * window is silently clobbered, and — the failure mode this was written for —
   * a field CLEARED before the seed arrives is re-filled behind us, so the
   * subsequent addValue appends: "12.34" + "7." = "12.347.", which fails
   * DECIMAL_RE and surfaces as a baffling aria-invalid assertion rather than a
   * lost keystroke.
   *
   * The window is real but narrow, which is why this reads as flaky. M2 widened
   * it: ProjectScreen now fires four catalog loads on mount (data / object /
   * material / model types) alongside the project fetch, so the seed lands later
   * than it did on develop. Gate on it rather than race it.
   */
  async waitForCoordinatesSeeded(): Promise<void> {
    await browser.waitUntil(
      async () =>
        (await this.latInput.getValue()) !== '' && (await this.lonInput.getValue()) !== '',
      { timeout: 15000, timeoutMsg: 'coordinate fields were never seeded from the project record' }
    )
  }

  /**
   * Replace a controlled (Formik/React) input's value in ONE atomic step.
   *
   * The old click -> select-all -> Delete -> addValue sequence is four separate
   * round-trips against a controlled input, and it appends rather than replaces
   * if any of them is dropped: "12.34" + "7." = "12.347.", which fails
   * DECIMAL_RE and reads as a bogus aria-invalid failure. It survived on develop
   * but goes intermittent under M2's heavier ProjectScreen mount (four extra
   * catalog fetches), landing on a different coordinate test each run.
   *
   * Same technique as Weather.setReactInput, which this suite already relies on
   * for the equivalent add-column fields: drive the native value setter and
   * dispatch input+change, so React's onChange — and therefore formik's
   * validateOnChange — sees exactly one value and there is nothing to race.
   */
  private async replaceValue(el: El, value: string): Promise<void> {
    const label = await el.getAttribute('aria-label')
    await el.click()
    await browser.execute(
      (sel: string, val: string) => {
        const node = document.querySelector(sel) as HTMLInputElement | null
        if (!node) throw new Error(`replaceValue: no element for ${sel}`)
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set
        setter?.call(node, val)
        node.dispatchEvent(new Event('input', { bubbles: true }))
        node.dispatchEvent(new Event('change', { bubbles: true }))
      },
      `[aria-label="${label}"]`,
      value
    )
    await browser.waitUntil(async () => (await el.getValue()) === value, {
      timeout: 5000,
      timeoutMsg: `coordinate field "${label}" did not take the value "${value}"`
    })
  }

  /**
   * Type a coordinate and commit it by blurring (commit fires on blur, not a
   * button). Blur by clicking the OTHER coordinate input.
   */
  async setCoordinate(field: Field, value: string): Promise<void> {
    await this.waitForCoordinatesSeeded()
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
