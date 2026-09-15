/**
 * Geometry left panel (Saved Geometries tree) + its create toolbar.
 *
 * Scope + state model:
 *  - The panel is ALWAYS mounted on ProjectScreen, as a sibling of
 *    CenterWorkspace — it does not live behind a workspace tab, so no
 *    selectTab() is needed to reach it (unlike Weather).
 *  - Collapsing the panel or an accordion hides with `display:none`; nothing
 *    unmounts. Assert isDisplayed(), NEVER isExisting().
 *  - The tree has four mutually-exclusive states, each with its own testid:
 *    geometry-tree-loading / -error / -empty / geometry-tree (loaded).
 *    "Empty" and "loaded" are different elements, so a wait for the loaded
 *    tree hangs forever on a fresh project. waitForTree() handles both.
 *  - Row action icons (eye / render / trash) deliberately carry no testid:
 *    their aria-label flips with state ("Hide from viewport" <-> "Show in
 *    viewport"), so a derived testid would be unstable. They are addressed by
 *    aria-label scoped INSIDE the row, and aria-pressed is the state oracle —
 *    INVERTED: aria-pressed="true" means HIDDEN.
 */

import { TIMEOUTS } from '../config/timeouts'

type El = ReturnType<typeof $>
type ElArray = ReturnType<typeof $$>

/**
 * The delete confirmation's aria-label (Geometry/messages.ts deleteTitle). Both
 * TreeRow's and ObjectPropertiesForm's confirmations carry it; nothing else in
 * the geometry surface does.
 */
const DELETE_DIALOG_LABEL = 'Delete'

export interface GeoRow {
  id: string
  name: string
  selected: boolean
  /** aria-pressed on the eye button. INVERTED: true = hidden from viewport. */
  viewportHidden: boolean
  /** aria-pressed on the render button. INVERTED: true = hidden from render. */
  renderHidden: boolean
  /**
   * A group, not a leaf. Detected by the expand chevron, which only groups
   * render — the source carries no kind attribute to read.
   */
  isGroup: boolean
  /** Groups only: null for leaves. From the chevron's aria-label. */
  expanded: boolean | null
  /**
   * Indent level. TreeRow sets `paddingLeft: 10 + depth * 24` inline, so this
   * is how a group's MEMBERS are told apart from root rows — depth 1 vs 0.
   * Groups never nest, so depth is only ever 0 or 1.
   */
  depth: number
}

class GeometryPage {
  // ----- Panel + toolbar -----
  get panel(): El {
    return $('[data-testid="geometry-panel"]')
  }
  get addCropButton(): El {
    return $('[data-testid="toolbar-crop"]')
  }
  get addGroundButton(): El {
    return $('[data-testid="toolbar-ground"]')
  }
  get importFileButton(): El {
    return $('[data-testid="toolbar-import-from-file"]')
  }
  /** SearchBar has a shared, non-unique testid; aria-label is the discriminator. */
  get searchBox(): El {
    return $('[aria-label="Search saved geometries"]')
  }

  // ----- Tree container states -----
  get tree(): El {
    return $('[data-testid="geometry-tree"]')
  }
  get treeLoading(): El {
    return $('[data-testid="geometry-tree-loading"]')
  }
  get treeError(): El {
    return $('[data-testid="geometry-tree-error"]')
  }
  get treeRetry(): El {
    return $('[data-testid="geometry-tree-retry"]')
  }
  get treeEmpty(): El {
    return $('[data-testid="geometry-tree-empty"]')
  }

  // ----- Rows -----
  /**
   * `geo-row-{id}` and `geo-row-name-{id}` share a prefix, so a bare
   * ^= query matches both. role="button" narrows it to the row itself —
   * and TreeRow's testid also separates these from Materials' MaterialRow,
   * which shares role="button".
   */
  get rows(): ElArray {
    return $$('[data-testid^="geo-row-"][role="button"]')
  }
  row(id: string): El {
    return $(`[data-testid="geo-row-${id}"]`)
  }
  rowName(id: string): El {
    return $(`[data-testid="geo-row-name-${id}"]`)
  }

  // ===== Reads =====

  /**
   * Every row's identity + state from ONE synchronous DOM read.
   * Never split into per-row round-trips: the just-created highlight clears
   * itself after 1000ms and any drag re-renders the subtree, so a multi-call
   * walk can observe two different trees. Same reasoning as
   * Weather.cellValidation.
   */
  async snapshot(): Promise<GeoRow[]> {
    return browser.execute(() => {
      const rows = document.querySelectorAll<HTMLElement>(
        '[data-testid^="geo-row-"][role="button"]'
      )
      return Array.from(rows).map((el) => {
        const id = (el.getAttribute('data-testid') || '').replace(/^geo-row-/, '')
        const pressed = (labels: string[]): boolean =>
          labels.some(
            (l) => el.querySelector(`[aria-label="${l}"]`)?.getAttribute('aria-pressed') === 'true'
          )
        const nameEl = el.querySelector(`[data-testid="geo-row-name-${id}"]`)
        const input = el.querySelector('input')
        // Only groups render an expand chevron, so its presence IS the kind,
        // and its label is the expanded state.
        const chevron = el.querySelector(
          '[aria-label="Expand group"], [aria-label="Collapse group"]'
        )
        const pad = parseFloat((el as HTMLElement).style.paddingLeft || '10')
        return {
          id,
          name: (nameEl?.textContent ?? (input as HTMLInputElement | null)?.value ?? '').trim(),
          // Selected is class-driven; TreeRow gives the selected row this bg.
          selected: el.className.includes('bg-[#2a2a2a]'),
          viewportHidden: pressed(['Hide from viewport', 'Show in viewport']),
          renderHidden: pressed(['Hide from render', 'Show in render']),
          isGroup: chevron !== null,
          expanded: chevron ? chevron.getAttribute('aria-label') === 'Collapse group' : null,
          // paddingLeft = ROW_PADDING_LEFT(10) + depth * INDENT_PER_DEPTH(24)
          depth: Math.max(0, Math.round((pad - 10) / 24))
        }
      })
    })
  }

  /** Every group row currently in the tree. */
  async groups(): Promise<GeoRow[]> {
    return (await this.snapshot()).filter((r) => r.isGroup)
  }

  /**
   * Rows indented under `groupId`.
   *
   * Membership is read from the INDENT, not a parent attribute: rows are a flat
   * list in DOM order, so a group's members are the depth-1 rows that follow it
   * up to the next depth-0 row. Groups never nest, so this is unambiguous.
   * Returns [] when the group is collapsed — its members are not rendered.
   */
  async childrenOf(groupId: string): Promise<GeoRow[]> {
    const rows = await this.snapshot()
    const start = rows.findIndex((r) => r.id === groupId)
    if (start === -1) return []
    const out: GeoRow[] = []
    for (let i = start + 1; i < rows.length; i++) {
      if (rows[i].depth === 0) break
      out.push(rows[i])
    }
    return out
  }

  /** Expand or collapse a group via its chevron. */
  async toggleGroup(groupId: string): Promise<void> {
    const before = (await this.rowState(groupId))?.expanded
    await this.clickInRow(groupId, before ? 'Collapse group' : 'Expand group')
    await browser.waitUntil(async () => (await this.rowState(groupId))?.expanded !== before, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `group ${groupId} never changed expanded state`
    })
  }

  async names(): Promise<string[]> {
    return (await this.snapshot()).map((r) => r.name)
  }

  async idForName(name: string): Promise<string | null> {
    const match = (await this.snapshot()).find((r) => r.name === name)
    return match ? match.id : null
  }

  async rowCount(): Promise<number> {
    return (await this.snapshot()).length
  }

  // ===== Intents =====

  /** Settle on ANY terminal tree state — loaded, empty or error. */
  async waitForTree(timeout = TIMEOUTS.LONG): Promise<void> {
    await browser.waitUntil(
      async () =>
        (await this.tree.isDisplayed().catch(() => false)) ||
        (await this.treeEmpty.isDisplayed().catch(() => false)) ||
        (await this.treeError.isDisplayed().catch(() => false)),
      { timeout, timeoutMsg: 'the geometry tree never reached a terminal state' }
    )
  }

  /**
   * Create a ground and return its new row id.
   *
   * Diffs the row ids rather than assuming a name, because Ground.NNN is
   * GAP-FILLING (naming.ts nextAvailableNumber) — after a delete the next
   * create reuses the hole, so a hardcoded "Ground.002" is wrong.
   */
  async addGround(): Promise<string> {
    const before = new Set((await this.snapshot()).map((r) => r.id))
    // takeLeading + a disabled button guard concurrent creates; wait the button
    // out rather than racing it.
    await this.addGroundButton.waitForEnabled({
      timeout: TIMEOUTS.LONG,
      timeoutMsg: '+ Ground never became enabled (a previous write is still in flight)'
    })
    await this.addGroundButton.click()
    let created = ''
    await browser.waitUntil(
      async () => {
        const fresh = (await this.snapshot()).filter((r) => !before.has(r.id))
        if (fresh.length === 0) return false
        created = fresh[0].id
        return true
      },
      {
        // A real POST + tree refetch; MUTATION per the CI-freeze post-mortem.
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: '+ Ground did not add a row (the create POST never landed)'
      }
    )
    return created
  }

  async selectRow(id: string): Promise<void> {
    await this.row(id).click()
    await browser.waitUntil(async () => (await this.rowState(id))?.selected === true, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `row ${id} never became selected`
    })
  }

  async rowState(id: string): Promise<GeoRow | undefined> {
    return (await this.snapshot()).find((r) => r.id === id)
  }

  /**
   * Click a control inside a row, in-page.
   *
   * The action cluster is `opacity-0` until the row is hovered, focused or
   * selected. Chromedriver's displayedness check considers opacity, so a
   * WebDriver .click() on a bare row's icon is a coin flip. The hover is purely
   * cosmetic — there is nothing to reveal functionally — so dispatch the click
   * directly, the same doctrine Weather.clickToolbarButton already uses for
   * elements this build cannot scroll to.
   */
  private async clickInRow(id: string, ariaLabel: string): Promise<void> {
    await this.row(id).waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await browser.execute(
      (rowId: string, label: string) => {
        const row = document.querySelector(`[data-testid="geo-row-${rowId}"]`)
        if (!row) throw new Error(`clickInRow: no row ${rowId}`)
        const btn = row.querySelector(`[aria-label="${label}"]`) as HTMLElement | null
        if (!btn) throw new Error(`clickInRow: row ${rowId} has no control "${label}"`)
        btn.click()
      },
      id,
      ariaLabel
    )
  }

  /** Toggle viewport visibility (the eye). Returns the new hidden state. */
  async toggleViewport(id: string): Promise<boolean> {
    const before = (await this.rowState(id))?.viewportHidden
    // The label names the action, so it flips with the state.
    await this.clickInRow(id, before ? 'Show in viewport' : 'Hide from viewport')
    await browser.waitUntil(async () => (await this.rowState(id))?.viewportHidden !== before, {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: `row ${id} viewport visibility never flipped (the PATCH may have reverted it)`
    })
    return !before
  }

  /**
   * Click the eye WITHOUT waiting for the state to settle.
   *
   * toggleViewport() waits for the flip to stick, which is exactly wrong when
   * the PATCH is expected to fail: the optimistic update flips it, then the
   * failure reverts it, so a settle-wait would time out on a correctly
   * behaving app. Failure tests drive the click and assert the revert instead.
   */
  async clickEye(id: string): Promise<void> {
    const hidden = (await this.rowState(id))?.viewportHidden
    await this.clickInRow(id, hidden ? 'Show in viewport' : 'Hide from viewport')
  }

  /** Toggle the all-models render master switch. Returns the new hidden state. */
  async toggleRender(id: string): Promise<boolean> {
    const before = (await this.rowState(id))?.renderHidden
    await this.clickInRow(id, before ? 'Show in render' : 'Hide from render')
    await browser.waitUntil(async () => (await this.rowState(id))?.renderHidden !== before, {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: `row ${id} render visibility never flipped`
    })
    return !before
  }

  // ----- Rename -----

  /** The inline editor. Leaves use "Geometry name"; groups use "Group name". */
  get nameEditor(): El {
    return $('[aria-label="Geometry name"], [aria-label="Group name"]')
  }

  /** Double-click the name to open the inline editor (there is no pencil here). */
  async openRename(id: string): Promise<void> {
    await browser.execute((rowId: string) => {
      const el = document.querySelector(`[data-testid="geo-row-name-${rowId}"]`)
      if (!el) throw new Error(`openRename: no name span for ${rowId}`)
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    }, id)
    await this.nameEditor.waitForDisplayed({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the rename editor never opened for row ${id}`
    })
  }

  /**
   * Rename a row. `commit` picks how the edit is ended, which MATTERS:
   * Enter commits, Escape discards, and blur commits only when valid —
   * an invalid value on blur is discarded, keeping the original name.
   */
  async renameRow(id: string, next: string, commit: 'enter' | 'escape' | 'blur'): Promise<void> {
    await this.openRename(id)
    // Drive the native value setter + input event rather than setValue().
    // NameEditor is a controlled React input, and setValue is click -> clear ->
    // keys: three round-trips that React re-renders between, so the value
    // arrives partially or not at all ("element not interactable" once the
    // editor re-renders under it). Same technique as Weather.setReactInput and
    // ProjectScreen.replaceValue, which exist for exactly this.
    //
    // An EMPTY value still has to be delivered this way — clearValue() leaves
    // React's state untouched, so the commit would see the original name.
    await browser.execute((val: string) => {
      const node = document.querySelector(
        '[aria-label="Geometry name"], [aria-label="Group name"]'
      ) as HTMLInputElement | null
      if (!node) throw new Error('renameRow: the inline name editor is not open')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(node, val)
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.focus()
    }, next)

    // Enter/Escape must be REAL key events — NameEditor decides commit vs
    // discard in onKeyDown, so a synthetic value change alone commits nothing.
    if (commit === 'enter') await browser.keys(['Enter'])
    else if (commit === 'escape') await browser.keys(['Escape'])
    else await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
  }

  /** Validation message rendered below the row while renaming. */
  async renameError(id: string, timeout = TIMEOUTS.SHORT): Promise<string | null> {
    // The span is a SIBLING of the row box — TreeRow renders it outside so a
    // long message cannot stretch the row — hence the parentElement hop.
    const read = async (): Promise<string | null> =>
      browser.execute((rowId: string) => {
        // Prefer the row-scoped hop; fall back to a tree-wide lookup, which is
        // unambiguous because only ONE row can be in edit mode at a time and
        // the tree renders no other .form-error-text.
        const row = document.querySelector(`[data-testid="geo-row-${rowId}"]`)
        const scoped = row?.parentElement?.querySelector('.form-error-text')
        const err =
          scoped ?? document.querySelector('[data-testid="geometry-tree"] .form-error-text')
        return err ? (err.textContent || '').trim() : null
      }, id) as Promise<string | null>

    // Poll: the message appears only once React has processed the change, so a
    // single read straight after the keypress races it.
    try {
      await browser.waitUntil(async () => (await read()) !== null, { timeout })
    } catch {
      // Swallow: returning null lets a caller assert the ABSENCE of an error
      // instead of this throwing an unrelated timeout.
    }
    return read()
  }

  // ----- Delete -----

  /**
   * The OPEN delete confirmation.
   *
   * `[open]` is load-bearing. components/Dialog always renders its <dialog>;
   * isOpen only decides whether showModal() is called. TreeRow renders one per
   * row AND ObjectPropertiesForm renders another, so a bare
   * dialog[aria-label="Delete"] matches a CLOSED dialog belonging to some other
   * row — every wait then times out against an element that was never going to
   * appear. Same rule HomePage.page.ts documents: assert open/closed with
   * displayed-ness, never with existence.
   */
  get deleteDialog(): El {
    return $(`dialog[aria-label="${DELETE_DIALOG_LABEL}"][open]`)
  }

  /**
   * Open a row's delete confirmation and LEAVE IT OPEN.
   *
   * deleteRow/cancelDelete both drive the dialog straight to completion, so
   * until this existed nothing could observe the confirmation while it was up —
   * which is why none of its copy has ever been asserted. Callers must let
   * afterEach sweep, or close it themselves; see e2e/support/dialogs.ts.
   */
  async openDeleteConfirm(id: string): Promise<void> {
    await this.clickInRow(id, 'Delete')
    await this.deleteDialog.waitForDisplayed({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the delete confirmation never opened for row ${id}`
    })
  }

  /**
   * Click a row's trash `times` times in ONE in-page pass, with no waiting.
   *
   * For the "repeated taps do not stack dialogs" case. It must be one execute:
   * separate round-trips give React time to commit between them, which is the
   * opposite of the rapid-tap condition under test. Clicks are dispatched on
   * the node directly because after the first one the dialog is modal and sits
   * in the top layer, so a WebDriver click would be intercepted.
   */
  async clickRowDeleteRapidly(id: string, times = 3): Promise<void> {
    await this.row(id).waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await browser.execute(
      (rowId: string, n: number) => {
        const row = document.querySelector(`[data-testid="geo-row-${rowId}"]`)
        if (!row) throw new Error(`clickRowDeleteRapidly: no row ${rowId}`)
        const btn = row.querySelector('[aria-label="Delete"]') as HTMLElement | null
        if (!btn) throw new Error(`clickRowDeleteRapidly: row ${rowId} has no trash`)
        for (let i = 0; i < n; i++) btn.click()
      },
      id,
      times
    )
  }

  /**
   * Whether a row's trash is ENABLED, or null when the row (or its trash) is not
   * rendered.
   *
   * The trash is the in-flight oracle for a delete: RowActions renders it
   * `disabled={deleting}`, the reducer marks the id on DELETE_NODE_REQUESTED and
   * releases it on DELETE_NODE_FAILED. So a failed delete that never released
   * the mark leaves a row nobody can retry deleting — this is how that is seen.
   */
  async deleteEnabled(id: string): Promise<boolean | null> {
    return browser.execute((rowId: string) => {
      const row = document.querySelector(`[data-testid="geo-row-${rowId}"]`)
      const btn = row?.querySelector('[aria-label="Delete"]') as HTMLButtonElement | null
      return btn ? !btn.disabled : null
    }, id) as Promise<boolean | null>
  }

  /**
   * Delete a row through its confirmation dialog.
   *
   * Delete is PESSIMISTIC — the row stays until the server confirms — so the
   * wait is on the row leaving, at MUTATION budget, not on the dialog closing.
   */
  async deleteRow(id: string): Promise<void> {
    // Self-cleaning on failure. A half-finished delete that leaves the modal
    // open makes EVERY later click in the file fail with "element click
    // intercepted" against whatever it touched — an error that names the wrong
    // element entirely. Failing loudly here, with the page usable, is worth far
    // more than the original stack trace.
    try {
      // The row trash and the dialog's confirm are both labelled "Delete";
      // clickInRow scopes to the row, the confirm is scoped to the dialog.
      await this.clickInRow(id, 'Delete')
      await this.deleteDialog.waitForDisplayed({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: `the delete confirmation never opened for row ${id}`
      })
      await this.deleteDialog.$('button=Delete').click()
      await browser.waitUntil(async () => (await this.rowState(id)) === undefined, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `row ${id} was still present after confirming delete`
      })
    } catch (err) {
      throw await this.cleanUpDeleteConfirm(err)
    }
  }

  async cancelDelete(id: string): Promise<void> {
    try {
      await this.clickInRow(id, 'Delete')
      await this.deleteDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      await this.deleteDialog.$('button=Cancel').click()
      await this.deleteDialog.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
    } catch (err) {
      throw await this.cleanUpDeleteConfirm(err)
    }
  }

  /**
   * deleteRow/cancelDelete's failure cleanup: close the DELETE confirmation this
   * helper may have left open, and nothing else. Returns the error to rethrow.
   *
   * It used to call closeAnyOpenDialog, and that HID failures. When a delete
   * goes wrong the dialog most worth seeing is often NOT the confirmation: a
   * wrong group-delete url 404s, utils/scopeError raises the blocking
   * "Project unavailable" dialog, the row stays, and the old cleanup quietly
   * shut that dialog — so a test polling for it afterwards reported "no scope
   * dialog" about an app that had just thrown the user out of their project.
   *
   * Any OTHER open dialog is now left exactly where it is and named in the
   * rethrown error, so the failure says what the user was looking at. The
   * spec's afterEach still sweeps with closeAnyOpenDialog, AFTER the test has
   * had its chance to observe it.
   */
  private async cleanUpDeleteConfirm(err: unknown): Promise<unknown> {
    const leftOpen = await this.closeOpenDialogs(DELETE_DIALOG_LABEL).catch(() => [] as string[])
    if (!leftOpen.length) return err
    const message = err instanceof Error ? err.message : String(err)
    return new Error(
      `${message}\n  another dialog was open and was LEFT open for the test to see: ` +
        leftOpen.map((l) => `"${l}"`).join(', ')
    )
  }

  /** Text of the empty-state hint — distinguishes "no rows" from "no matches". */
  async emptyHint(): Promise<string> {
    return (await this.treeEmpty.getText()).trim()
  }

  /**
   * Force every open <dialog> shut.
   *
   * components/Dialog uses the native showModal(), so an open dialog sits in
   * the browser's TOP LAYER and swallows clicks anywhere on the page — a
   * confirmation left open by a failed step makes every later test in the file
   * fail with "element click intercepted", pointing at whatever they clicked
   * rather than at the real culprit.
   *
   * Sending a real Escape KEYPRESS is not reliable here (it depends on focus,
   * and Dialog manages its own key handling), so this dispatches the `cancel`
   * event that Escape would have produced and then closes the node — see the
   * body of closeOpenDialogs for why the event is required and not just the
   * close().
   *
   * Cleanup only — never use this to dismiss a dialog a test is asserting on.
   */
  async closeAnyOpenDialog(): Promise<void> {
    await this.closeOpenDialogs(null)
  }

  /**
   * Close open dialogs — every one when `onlyLabel` is null, otherwise only
   * those whose aria-label (components/Dialog's `title`) is exactly `onlyLabel`.
   * Returns the aria-labels of the open dialogs it deliberately LEFT open.
   *
   * One implementation for both, so the cancel-then-close sequence below cannot
   * drift between the broad teardown sweep and the narrow helper cleanup.
   */
  private async closeOpenDialogs(onlyLabel: string | null): Promise<string[]> {
    return browser.execute((only: string | null) => {
      const leftOpen: string[] = []
      document.querySelectorAll('dialog[open]').forEach((d) => {
        const dlg = d as HTMLDialogElement
        const label = dlg.getAttribute('aria-label') ?? ''
        if (only !== null && label !== only) {
          leftOpen.push(label || '<dialog with no aria-label>')
          return
        }
        // Fire `cancel` BEFORE close(), because close() alone desynchronises the
        // component from its owner.
        //
        // components/Dialog opens in an effect keyed on `isOpen`
        // (`if (isOpen && !dialog.open) showModal()`) and wires only `onCancel`
        // to `onClose`. The native `close` event is not wired. So a bare
        // `dialog.close()` shuts the DOM node while the owner's state still says
        // open — and the next click on the same trigger sets that state to the
        // value it already holds, which is not a state change, so the effect
        // never re-runs and THE DIALOG CAN NEVER REOPEN. In practice that meant
        // any test leaving a confirmation open made its row permanently
        // undeletable, and teardown leaked it silently.
        //
        // `cancel` is what Escape produces and is the one path that clears the
        // owner's state. It does not bubble, so React attaches it directly to
        // the node rather than delegating — dispatching it here reaches onCancel.
        try {
          dlg.dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true }))
        } catch {
          /* not a dialog we own — fall through to the hard close below */
        }
        try {
          dlg.close()
        } catch {
          dlg.removeAttribute('open')
        }
      })
      return leftOpen
    }, onlyLabel) as Promise<string[]>
  }

  /**
   * Type into the filter box. Drives the native value setter + input/change so
   * React's onChange sees exactly one value — the same technique
   * Weather.setReactInput and ProjectScreen.replaceValue already rely on for
   * controlled inputs.
   */
  async clearSearch(): Promise<void> {
    await this.search('')
  }

  async search(text: string): Promise<void> {
    // No WebDriver click first: the box sits inside the Geometry section body,
    // and when that section is collapsed (display:none) the click retried
    // "element not interactable" for the whole 10s waitforTimeout, once per
    // teardown. But the click had a side effect the teardowns DEPEND on: moving
    // focus BLURS an open inline rename editor, which closes it — and a row with
    // its editor open has no Delete control (measured 15 Sep 2026: dropping the
    // click broke afterEach right after the "opens an editor" test). focus()
    // in-page keeps that blur without the displayedness wait.
    await browser.execute(
      (val: string) => {
        const node = document.querySelector(
          '[aria-label="Search saved geometries"]'
        ) as HTMLInputElement | null
        if (!node) throw new Error('geometry search box not found')
        node.focus()
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set
        setter?.call(node, val)
        node.dispatchEvent(new Event('input', { bubbles: true }))
        node.dispatchEvent(new Event('change', { bubbles: true }))
      },
      text
    )
  }
}

export default new GeometryPage()
