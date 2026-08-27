/**
 * HTML5 drag-and-drop for the geometry tree.
 *
 * ── Why this is hand-rolled ───────────────────────────────────────────────
 * WebdriverIO's dragAndDrop() and the Actions API issue POINTER events. HTML5
 * drag-and-drop is a separate browser subsystem: it needs dragstart/dragover/
 * drop carrying a DataTransfer, and Chromium will not synthesise those from
 * pointer input. TreeRow reads its payload out of
 * `e.dataTransfer.getData('application/x-geo')`, so pointer-driven drags are
 * simply invisible to it. Hence synthetic events with a real DataTransfer.
 *
 * ── The two details that decide whether this works at all ─────────────────
 * 1. DROP ZONE IS COMPUTED FROM clientY. handleDragOver measures
 *    `e.clientY - rect.top` against the row's own height and splits it
 *    30% / 40% / 30% into before / into / after (TreeRow.tsx:285-287). The
 *    coordinate is load-bearing: a drop meant to create a GROUP must land in
 *    the middle 40%, or it silently becomes a reorder.
 *    Because the fractions are measured against the row's OWN rect, they work
 *    wherever the row sits — no scrollIntoView needed (and none is possible;
 *    Browser.getWindowForTarget is unimplemented in this Electron build).
 *
 * 2. dragover AND drop MUST BE SEPARATE COMMANDS. handleDrop reads `dropZone`,
 *    which is React STATE written by handleDragOver. Dispatch both in one
 *    browser.execute and React has not re-rendered yet, so handleDrop still
 *    sees `null` and an edge drop silently degrades to a no-op. So: fire
 *    dragover, POLL until the row shows the cue React rendered for that zone,
 *    then fire drop.
 *
 * The 'into' cue is the ring class TreeRow applies at line 474; before/after
 * render an absolutely-positioned indicator span instead.
 */

import { TIMEOUTS } from '../config/timeouts'

export const GEO_MIME = 'application/x-geo'
export const MATERIAL_MIME = 'application/x-material'

export type DropZone = 'before' | 'into' | 'after'

const rowSel = (id: string): string => `[data-testid="geo-row-${id}"]`

/**
 * Fire dragenter+dragover at the coordinate for `zone`.
 *
 * The DataTransfer is rebuilt per call: it cannot be carried across separate
 * browser.execute round-trips, and the handlers only ever read getData/types,
 * so a fresh one per event is equivalent to a real drag as far as they can tell.
 */
async function fireDragOver(
  targetSelector: string,
  mime: string,
  payload: string,
  zone: DropZone
): Promise<void> {
  await browser.execute(
    (sel: string, m: string, p: string, z: string) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) throw new Error(`dnd: no drop target for ${sel}`)
      const r = el.getBoundingClientRect()
      const clientY =
        z === 'before'
          ? r.top + r.height * 0.15
          : z === 'after'
            ? r.top + r.height * 0.85
            : r.top + r.height * 0.5
      const dt = new DataTransfer()
      dt.setData(m, p)
      const opts = {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: r.left + r.width / 2,
        clientY
      }
      el.dispatchEvent(new DragEvent('dragenter', opts))
      el.dispatchEvent(new DragEvent('dragover', opts))
    },
    targetSelector,
    mime,
    payload,
    zone
  )
}

async function fireDrop(targetSelector: string, mime: string, payload: string): Promise<void> {
  await browser.execute(
    (sel: string, m: string, p: string) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) throw new Error(`dnd: no drop target for ${sel}`)
      const r = el.getBoundingClientRect()
      const dt = new DataTransfer()
      dt.setData(m, p)
      el.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2
        })
      )
    },
    targetSelector,
    mime,
    payload
  )
}

/** True once the target row is showing the 'into' highlight React rendered. */
async function isHighlighted(targetId: string): Promise<boolean> {
  return (await browser.execute((sel: string) => {
    const el = document.querySelector(sel)
    return el ? el.className.includes('ring-blue-500') : false
  }, rowSel(targetId))) as boolean
}

/**
 * Drag row(s) onto another row.
 *
 * `zone: 'into'` is what creates a group (or moves into an existing one);
 * before/after are the reorder bands.
 */
export async function dragRowOnto(
  sourceIds: string[],
  targetId: string,
  zone: DropZone = 'into'
): Promise<void> {
  const target = rowSel(targetId)
  const payload = JSON.stringify(sourceIds)

  await fireDragOver(target, GEO_MIME, payload, zone)

  if (zone === 'into') {
    // Poll the cue the handler itself rendered — deterministic, never a sleep,
    // and it proves React has flushed the state handleDrop is about to read.
    await browser.waitUntil(async () => isHighlighted(targetId), {
      timeout: TIMEOUTS.SHORT,
      timeoutMsg:
        `row ${targetId} never showed the drop highlight, so handleDrop would ` +
        'still read dropZone=null and the drop would be a no-op'
    })
  } else {
    // before/after render an indicator span rather than the ring; a second
    // dragover is enough to guarantee a render pass has happened between the
    // two commands.
    await fireDragOver(target, GEO_MIME, payload, zone)
  }

  await fireDrop(target, GEO_MIME, payload)
}

/**
 * Fire a REAL dragstart on a row and read back what handleDragStart wrote.
 *
 * The drop helpers above synthesise the payload themselves, so they never
 * exercise handleDragStart's own logic — the multi-select expansion and its
 * filtering of group rows. This is the only way to cover that.
 */
export async function readDragPayload(rowId: string): Promise<string[]> {
  const raw = (await browser.execute((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) throw new Error(`dnd: no row for ${sel}`)
    const dt = new DataTransfer()
    el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    return dt.getData('application/x-geo')
  }, rowSel(rowId))) as string
  return raw ? (JSON.parse(raw) as string[]) : []
}
