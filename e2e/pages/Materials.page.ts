/**
 * Materials left panel — the Saved Materials list and its create button.
 *
 * State model:
 *  - The library is GLOBAL, not scenario-scoped. A material created in one
 *    project is visible in every other one. This is the opposite of geometry
 *    and it changes how tests must clean up: a leaked material follows you.
 *  - `+ Add Materials` creates on the backend IMMEDIATELY (one POST) and opens
 *    the right panel. There is no local draft and no "save the material" step —
 *    only its type CARDS are saved individually.
 *  - Row action icons are `opacity-0` until hover/focus/selection but always in
 *    the DOM, so they are clicked in-page rather than via WebDriver.
 */

import { TIMEOUTS } from '../config/timeouts'

type El = ReturnType<typeof $>

export interface MaterialRow {
  id: string
  name: string
  selected: boolean
}

class MaterialsPage {
  get panel(): El {
    return $('[data-testid="materials-panel"]')
  }
  /** ToolbarButton derives its testid from the label: "Add Materials". */
  get addButton(): El {
    return $('[data-testid="toolbar-add-materials"]')
  }
  /** SearchBar's testid is shared four ways; aria-label is the discriminator. */
  get searchBox(): El {
    return $('[aria-label="Search saved materials"]')
  }
  get list(): El {
    return $('[data-testid="materials-list"]')
  }
  get listEmpty(): El {
    return $('[data-testid="materials-list-empty"]')
  }
  row(id: string): El {
    return $(`[data-testid="material-row-${id}"]`)
  }
  rowName(id: string): El {
    return $(`[data-testid="material-row-name-${id}"]`)
  }

  // ===== Reads =====

  /**
   * Every row from ONE DOM read. `material-row-{id}` and
   * `material-row-name-{id}` share a prefix, so role="button" narrows it to the
   * row — which also separates these from Geometry's TreeRow, which uses the
   * same role.
   */
  async snapshot(): Promise<MaterialRow[]> {
    return browser.execute(() => {
      const rows = document.querySelectorAll<HTMLElement>(
        '[data-testid^="material-row-"][role="button"]'
      )
      return Array.from(rows).map((el) => {
        const id = (el.getAttribute('data-testid') || '').replace(/^material-row-/, '')
        const nameEl = el.querySelector(`[data-testid="material-row-name-${id}"]`)
        const input = el.querySelector('input')
        return {
          id,
          name: (nameEl?.textContent ?? (input as HTMLInputElement | null)?.value ?? '').trim(),
          selected: el.className.includes('bg-[#2a2a2a]')
        }
      })
    })
  }

  async names(): Promise<string[]> {
    return (await this.snapshot()).map((r) => r.name)
  }
  async rowState(id: string): Promise<MaterialRow | undefined> {
    return (await this.snapshot()).find((r) => r.id === id)
  }
  async idForName(name: string): Promise<string | null> {
    const m = (await this.snapshot()).find((r) => r.name === name)
    return m ? m.id : null
  }
  async rowCount(): Promise<number> {
    return (await this.snapshot()).length
  }
  async emptyHint(): Promise<string> {
    return (await this.listEmpty.getText()).trim()
  }

  // ===== Intents =====

  private async clickInRow(id: string, ariaLabel: string): Promise<void> {
    await this.row(id).waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await browser.execute(
      (rowId: string, label: string) => {
        const row = document.querySelector(`[data-testid="material-row-${rowId}"]`)
        if (!row) throw new Error(`clickInRow: no material row ${rowId}`)
        const btn = row.querySelector(`[aria-label="${label}"]`) as HTMLElement | null
        if (!btn) throw new Error(`clickInRow: row ${rowId} has no control "${label}"`)
        btn.click()
      },
      id,
      ariaLabel
    )
  }

  /**
   * Create a material and return its new row id.
   *
   * Diffs the ids rather than assuming a name: Material.NNN is GAP-FILLING, so
   * after a delete the next create reuses the hole.
   */
  async addMaterial(): Promise<string> {
    const before = new Set((await this.snapshot()).map((r) => r.id))
    await this.addButton.waitForEnabled({ timeout: TIMEOUTS.LONG })
    await this.addButton.click()
    let created = ''
    await browser.waitUntil(
      async () => {
        const fresh = (await this.snapshot()).filter((r) => !before.has(r.id))
        if (!fresh.length) return false
        created = fresh[0].id
        return true
      },
      {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: '+ Add Materials did not add a row (the create POST never landed)'
      }
    )
    return created
  }

  async openMaterial(id: string): Promise<void> {
    await this.row(id).click()
    await browser.waitUntil(async () => (await this.rowState(id))?.selected === true, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `material ${id} never became selected`
    })
  }

  // ----- Rename (double-click the name; there is no pencil in the list) -----

  get nameEditor(): El {
    return $('[data-testid="materials-panel"] [aria-label="Material name"]')
  }

  async openRename(id: string): Promise<void> {
    await browser.execute((rowId: string) => {
      const el = document.querySelector(`[data-testid="material-row-name-${rowId}"]`)
      if (!el) throw new Error(`openRename: no name span for ${rowId}`)
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    }, id)
    await this.nameEditor.waitForDisplayed({
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the rename editor never opened for material ${id}`
    })
  }

  /**
   * Rename via the native value setter — MaterialNameEditor is a controlled
   * input, so setValue's click/clear/type sequence loses to React re-renders.
   * Enter/Escape must be real key events: the editor decides commit vs discard
   * in onKeyDown.
   */
  async renameRow(id: string, next: string, commit: 'enter' | 'escape' | 'blur'): Promise<void> {
    await this.openRename(id)
    await browser.execute((val: string) => {
      const node = document.querySelector(
        '[data-testid="materials-panel"] [aria-label="Material name"]'
      ) as HTMLInputElement | null
      if (!node) throw new Error('renameRow: the inline editor is not open')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(node, val)
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.focus()
    }, next)
    if (commit === 'enter') await browser.keys(['Enter'])
    else if (commit === 'escape') await browser.keys(['Escape'])
    else await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
  }

  /** Validation message rendered below the row while renaming. */
  async renameError(id: string, timeout = TIMEOUTS.SHORT): Promise<string | null> {
    const read = async (): Promise<string | null> =>
      browser.execute((rowId: string) => {
        const row = document.querySelector(`[data-testid="material-row-${rowId}"]`)
        const scoped = row?.parentElement?.querySelector('.form-error-text')
        const err =
          scoped ?? document.querySelector('[data-testid="materials-list"] .form-error-text')
        return err ? (err.textContent || '').trim() : null
      }, id) as Promise<string | null>
    try {
      await browser.waitUntil(async () => (await read()) !== null, { timeout })
    } catch {
      // null lets a caller assert the ABSENCE of an error.
    }
    return read()
  }

  // ----- Delete -----

  /**
   * `[open]` is load-bearing: components/Dialog always renders its <dialog>,
   * and there is one per row plus one in the form, so a bare selector matches a
   * CLOSED dialog belonging to something else.
   */
  get deleteDialog(): El {
    return $('dialog[aria-label="Delete"][open]')
  }

  async deleteRow(id: string): Promise<void> {
    try {
      // The row trash carries aria-pressed; the form-header one does not — but
      // scoping to the row makes that distinction unnecessary.
      await this.clickInRow(id, 'Delete material')
      await this.deleteDialog.waitForDisplayed({
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: `the delete confirmation never opened for material ${id}`
      })
      await this.deleteDialog.$('button=Delete').click()
      await browser.waitUntil(async () => (await this.rowState(id)) === undefined, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `material ${id} was still present after confirming delete`
      })
    } catch (err) {
      // Self-clean: a modal left open sits in the top layer and makes every
      // later click in the file fail against the wrong element.
      await this.closeAnyOpenDialog().catch(() => {})
      throw err
    }
  }

  async cancelDelete(id: string): Promise<void> {
    try {
      await this.clickInRow(id, 'Delete material')
      await this.deleteDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      await this.deleteDialog.$('button=Cancel').click()
      await this.deleteDialog.waitForDisplayed({ reverse: true, timeout: TIMEOUTS.MEDIUM })
    } catch (err) {
      await this.closeAnyOpenDialog().catch(() => {})
      throw err
    }
  }

  /**
   * Force every open <dialog> shut. Mirrors Geometry.closeAnyOpenDialog — see
   * the long note there for why the `cancel` event is dispatched rather than
   * calling close() alone: components/Dialog wires only onCancel to onClose, so
   * a bare close() leaves the owner's React state saying "open" and the dialog
   * can never be reopened for that row.
   *
   * Cleanup only — never use this to dismiss a dialog a test is asserting on.
   */
  async closeAnyOpenDialog(): Promise<void> {
    await browser.execute(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => {
        const dlg = d as HTMLDialogElement
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
    })
  }

  // ----- Search -----

  async search(text: string): Promise<void> {
    await this.searchBox.click()
    await browser.execute((val: string) => {
      const node = document.querySelector(
        '[aria-label="Search saved materials"]'
      ) as HTMLInputElement | null
      if (!node) throw new Error('materials search box not found')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(node, val)
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.dispatchEvent(new Event('change', { bubbles: true }))
    }, text)
  }

  async clearSearch(): Promise<void> {
    await this.search('')
  }
}

export default new MaterialsPage()
