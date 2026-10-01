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
 * Pixels of EMPTY tree between the last row and the bottom of the tree box —
 * the only place a user can drop to ungroup. Negative when the rows overflow.
 */
export async function treeBackgroundGap(): Promise<number> {
  return (await browser.execute(() => {
    const tree = document.querySelector('[data-testid="geometry-tree"]') as HTMLElement | null
    if (!tree) throw new Error('dnd: the geometry tree is not rendered')
    const rows = tree.querySelectorAll<HTMLElement>('[data-testid^="geo-row-"][role="button"]')
    const box = tree.getBoundingClientRect()
    const below = rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom : box.top
    return Math.round(box.bottom - below)
  })) as number
}

/**
 * Drag row(s) onto the EMPTY tree area below the last row — the UNGROUP gesture.
 *
 * GeometryTree.handleRootDrop moves the dragged ids back to the root; a drop on a
 * row never reaches it, because TreeRow.handleDrop stops propagation.
 *
 * The events go to whatever element really sits at that point, not to the tree
 * container by fiat. A tree with no free space below its rows would otherwise let
 * a synthetic drop "ungroup" through a gesture no user can make — so if the point
 * is not tree background, this throws instead. handleRootDrop reads no React
 * state, so unlike dragRowOnto the dragover and drop can share one command.
 */
export async function dragRowsToTreeBackground(sourceIds: string[]): Promise<void> {
  await browser.execute(
    (mime: string, payload: string) => {
      const tree = document.querySelector('[data-testid="geometry-tree"]') as HTMLElement | null
      if (!tree) throw new Error('dnd: the geometry tree is not rendered')
      const rows = tree.querySelectorAll<HTMLElement>('[data-testid^="geo-row-"][role="button"]')
      const box = tree.getBoundingClientRect()
      const below = rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom : box.top
      if (box.bottom - below < 8) {
        throw new Error(
          `dnd: no empty tree area below the last row (${Math.round(box.bottom - below)}px) — ` +
            'a user has nowhere to drop to ungroup'
        )
      }
      const x = box.left + box.width / 2
      const y = (below + box.bottom) / 2
      const hit = document.elementFromPoint(x, y) as HTMLElement | null
      if (!hit || !tree.contains(hit) || hit.closest('[data-testid^="geo-row-"]')) {
        throw new Error(
          `dnd: the point below the last row is not tree background (hit ${hit?.outerHTML.slice(0, 80) ?? 'nothing'})`
        )
      }
      for (const type of ['dragenter', 'dragover', 'drop']) {
        const dt = new DataTransfer()
        dt.setData(mime, payload)
        hit.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y })
        )
      }
    },
    GEO_MIME,
    JSON.stringify(sourceIds)
  )
}

/**
 * Drag a MATERIAL from the library onto a geometry or group row.
 *
 * MATERIAL_MIME has been exported since this file was written and never had a
 * caller — the material drag was anticipated and never wired up. This is that
 * caller, and it is deliberately thin: it reuses the same fireDragOver /
 * isHighlighted / fireDrop machinery as dragRowOnto, because the settle between
 * dragover and drop is the whole difficulty and must not be re-rolled per call
 * site (handleDrop reads React state that handleDragOver writes).
 *
 * TWO DIFFERENCES FROM A GEOMETRY DRAG, both in TreeRow.handleDragOver:
 *  - A material drag has NO edge bands. The whole row is a single 'into' target,
 *    however close to its top or bottom edge the pointer is — there is nothing
 *    to reorder, so the 30/40/30 split does not apply. Hence 'into', always.
 *  - Dropping on a COLLAPSED group spring-opens it after a dwell, and the drop
 *    then fans out over the group's non-group children.
 *
 * The payload is what MaterialRow.onDragStart writes: the material's groupId and
 * its name, NOT the bare id array a geometry drag carries.
 */
export async function dragMaterialOnto(
  material: { groupId: string; name: string },
  targetRowId: string
): Promise<void> {
  const target = rowSel(targetRowId)
  const payload = JSON.stringify(material)

  await fireDragOver(target, MATERIAL_MIME, payload, 'into')
  await browser.waitUntil(async () => isHighlighted(targetRowId), {
    timeout: TIMEOUTS.SHORT,
    timeoutMsg:
      `row ${targetRowId} never showed the drop highlight for a material drag, so ` +
      'handleDrop would read dropZone=null and the drop would be a no-op'
  })
  await fireDrop(target, MATERIAL_MIME, payload)
}

/**
 * Fire a REAL dragstart on a MATERIAL row and read back what it wrote.
 *
 * The counterpart to readDragPayload: dragMaterialOnto synthesises its own
 * payload, so this is the only thing that exercises MaterialRow's own
 * handleDragStart — and the only way to catch the payload SHAPE drifting away
 * from what TreeRow.handleDrop parses.
 */
export async function readMaterialDragPayload(
  materialRowId: string
): Promise<{ groupId: string; name: string } | null> {
  const raw = (await browser.execute((sel: string, mime: string) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) throw new Error(`dnd: no material row for ${sel}`)
    const dt = new DataTransfer()
    el.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })
    )
    return dt.getData(mime)
  }, `[data-testid="material-row-${materialRowId}"]`, MATERIAL_MIME)) as string
  return raw ? (JSON.parse(raw) as { groupId: string; name: string }) : null
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
