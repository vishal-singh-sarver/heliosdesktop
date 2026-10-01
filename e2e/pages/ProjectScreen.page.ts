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
  async waitForCoordinatesSeeded(expectedLat?: string, expectedLon?: string): Promise<void> {
    // With the expected pair known (enterProject creates the project, so it knows
    // exactly what the header must end up showing), wait for THOSE values rather
    // than for any settled pair. This is the only form that closes the race
    // completely: "settled" can still be satisfied by the previous project's
    // coordinates if the re-seed has not started yet, whereas the real values can
    // only appear once the right activeProject has landed.
    //
    // Compared numerically with a tolerance because the backend stores float32 —
    // 12.34 can come back as 12.340000152587891, and an exact string match would
    // hang until the timeout on a project that is perfectly correct.
    if (expectedLat !== undefined && expectedLon !== undefined) {
      // `seen` is recorded INSIDE the condition and reported from the catch.
      // A timeoutMsg template is evaluated when waitUntil is CALLED, so it can
      // only ever print the values we were looking for — never the ones that
      // were actually on screen, which is the half that identifies the fault
      // (a blank field means the seed never landed; a different number means
      // the wrong project is open).
      let seen = '<never read>'
      await browser
        .waitUntil(
          async () => {
            const lat = await this.latInput.getValue()
            const lon = await this.lonInput.getValue()
            seen = `${lat || '<empty>'}, ${lon || '<empty>'}`
            if (lat === '' || lon === '') return false
            return (
              Math.abs(Number(lat) - Number(expectedLat)) < 0.01 &&
              Math.abs(Number(lon) - Number(expectedLon)) < 0.01
            )
          },
          { timeout: 15000, interval: 100 }
        )
        .catch(() => {
          throw new Error(
            `coordinate fields never showed the created project's ${expectedLat}, ${expectedLon} — last saw ${seen}`
          )
        })
      return
    }

    // Non-empty is NOT enough — it must also be SETTLED.
    //
    // ProjectScreen seeds the boxes from `activeProject` in an effect guarded by
    // `seededProjectIdRef.current === activeProject.id`, so it re-seeds whenever
    // the active project's ID changes — and it does that with `resetForm`, which
    // rewrites BOTH boxes. Entering a project can therefore satisfy "both fields
    // are non-empty" using the PREVIOUS project's coordinates, a moment before the
    // real one lands.
    //
    // Returning on that first sample is what made the coordinate specs flaky: the
    // test types its value into the stale render, the real activeProject arrives,
    // resetForm wipes it, and `replaceValue` fails its own guard with
    // `did not take the value "<x>"` — on a DIFFERENT loop case each run, since it
    // depends purely on which test straddles the re-seed. Measured over three
    // consecutive runs: exactly one failure each time, on lon-200, then
    // lon->7-decimals, then lat-95.
    //
    // So require two consecutive IDENTICAL non-empty samples: a pending re-seed
    // changes the pair and restarts the wait, and we only return once it settles.
    let previous = ''
    await browser.waitUntil(
      async () => {
        const lat = await this.latInput.getValue()
        const lon = await this.lonInput.getValue()
        if (lat === '' || lon === '') {
          previous = ''
          return false
        }
        const current = `${lat}|${lon}`
        const settled = current === previous
        previous = current
        return settled
      },
      {
        timeout: 15000,
        interval: 250,
        timeoutMsg: 'coordinate fields were never seeded from the project record'
      }
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
    let seen = '<never read>'
    await browser
      .waitUntil(
        async () => {
          seen = await el.getValue()
          return seen === value
        },
        { timeout: 5000 }
      )
      .catch(() => {
        throw new Error(
          `coordinate field "${label}" did not take the value "${value}" — it holds "${seen}"`
        )
      })
  }

  /**
   * Type a coordinate WITHOUT committing it — no blur, so nothing is sent and
   * nothing is reverted.
   *
   * Needed because blur is DESTRUCTIVE for an invalid value: commitCoordinate
   * early-returns through revertCoordinate, which puts the stored coordinate
   * back ("Blur restores the saved value, so what the header shows is always
   * what would be used"). That clears aria-invalid along with the text, so the
   * rejected state only exists while the field still holds the rejected text.
   *
   * Anything asserting the INVALID state must therefore type and look, without
   * blurring in between; use `blurCoordinate` afterwards to observe the revert.
   */
  async typeCoordinate(field: Field, value: string): Promise<void> {
    await this.waitForCoordinatesSeeded()
    await this.replaceValue(this.coordInput(field), value)
  }

  /**
   * Blur a coordinate field by clicking the OTHER one, which is what fires
   * commitCoordinate: a valid value is PATCHed, an invalid or empty one is
   * discarded and the stored coordinate restored.
   */
  async blurCoordinate(field: Field): Promise<void> {
    const sibling = field === 'latitude' ? this.lonInput : this.latInput
    await sibling.click()
  }

  /**
   * Type a coordinate and commit it by blurring (commit fires on blur, not a
   * button). Blur by clicking the OTHER coordinate input.
   */
  async setCoordinate(field: Field, value: string): Promise<void> {
    await this.typeCoordinate(field, value)
    await this.blurCoordinate(field)
  }

  /**
   * Commit a coordinate ENTIRELY IN-PAGE — no WebDriver click anywhere.
   *
   * WHY THIS EXISTS: `setCoordinate` cannot be used once a blocking modal is up.
   * It goes through `replaceValue`, whose first statement is `el.click()`, and
   * the scope-lost dialog is a modal <dialog> whose ::backdrop covers the whole
   * viewport — so the click is intercepted and the PATCH is never sent.
   *
   * That mattered: boot.test.ts provokes scope loss and then needs a
   * PROJECT-scoped request to classify as 'project' rather than 'scenario'
   * (utils/scopeError.ts checks the scenario id FIRST, so any URL carrying both
   * reports 'scenario'). A coordinate commit is the only such request reachable
   * from that screen, and it was racing the very dialog it had to out-run —
   * passing or failing depending on which landed first.
   *
   * The commit fires on React's onBlur, which listens for `focusout` (`blur`
   * does not bubble to React's root listener), so both are dispatched.
   */
  async commitCoordinateInPage(field: Field, value: string): Promise<void> {
    await this.waitForCoordinatesSeeded()
    const label = field === 'latitude' ? 'Latitude' : 'Longitude'
    await browser.execute(
      (sel: string, val: string) => {
        const node = document.querySelector(sel) as HTMLInputElement | null
        if (!node) throw new Error(`commitCoordinateInPage: no element for ${sel}`)
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set
        setter?.call(node, val)
        node.dispatchEvent(new Event('input', { bubbles: true }))
        node.dispatchEvent(new Event('change', { bubbles: true }))
        node.dispatchEvent(new FocusEvent('blur'))
        node.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      },
      `[aria-label="${label}"]`,
      value
    )
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
