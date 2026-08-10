import React from 'react'
import { createPortal } from 'react-dom'
import { getTruncatedHover, hideFullText, subscribeToTruncatedHover } from 'utils/truncationTooltip'
import { useAnchoredPosition, type AnchorRect } from 'utils/useAnchoredPosition'

// The app-global outlet for the truncated-label tooltip: mounted once (beside
// SnackbarHost), fed by every `truncate`d label through showFullTextOnHover.
//
// Nothing is rendered until a label is actually clipped AND hovered, so this
// costs a subscription and nothing else.

const GAP = 4
const PADDING = 8
// Far enough out that an unplaced tooltip is never seen, while staying in the
// DOM so it can be measured — the same trick the Select list uses.
const OFFSCREEN = -9999
// Wide enough for the names this exists for, still narrow enough to read.
const MAX_WIDTH = 320

export default function TruncationTooltip(): React.JSX.Element | null {
  const hover = React.useSyncExternalStore(subscribeToTruncatedHover, getTruncatedHover)
  const anchor = hover?.anchor ?? null

  // A label can be unmounted while its tooltip is up (picking an option takes
  // the whole list with it), so a stale anchor must not be measured.
  const getAnchorRect = React.useCallback((): AnchorRect | null => {
    if (!anchor?.isConnected) return null
    const { top, left, width, height } = anchor.getBoundingClientRect()
    return { top, left, width, height }
  }, [anchor])

  const { floatingRef, measurement } = useAnchoredPosition({
    open: anchor !== null,
    getAnchorRect,
    placement: 'bottom-start',
    gap: GAP,
    padding: PADDING
  })

  // The pointer leaving its label is handled at the source (see
  // showFullTextOnHover). These are the ways a tooltip can be left behind
  // WITHOUT that leave ever arriving: the label is clicked or typed away —
  // taking its dropdown with it — or the ground moves under it. `scroll` is
  // captured because scroll events don't bubble out of the panel they happen in.
  React.useEffect(() => {
    if (!anchor) return undefined
    document.addEventListener('mousedown', hideFullText, true)
    document.addEventListener('keydown', hideFullText, true)
    document.addEventListener('wheel', hideFullText, true)
    document.addEventListener('scroll', hideFullText, true)
    // Fires when the pointer leaves the window entirely, which sends no leave to
    // whatever it was over.
    document.documentElement.addEventListener('mouseleave', hideFullText)
    return () => {
      document.removeEventListener('mousedown', hideFullText, true)
      document.removeEventListener('keydown', hideFullText, true)
      document.removeEventListener('wheel', hideFullText, true)
      document.removeEventListener('scroll', hideFullText, true)
      document.documentElement.removeEventListener('mouseleave', hideFullText)
    }
  }, [anchor])

  if (!hover) return null

  return createPortal(
    // `pointer-events: none` so the tooltip can never sit between the pointer
    // and the row it describes — hovering it would otherwise read as leaving the
    // label, and a click would land on the tooltip instead of the option.
    //
    // Portalled into the anchor's <dialog> when it is inside one: showModal()
    // paints a dialog in the browser's TOP LAYER, above the whole normal
    // document, so a tooltip appended to <body> would be hidden behind it at any
    // z-index (see the same note in Select).
    <div
      ref={floatingRef}
      role="tooltip"
      // The clipped text is fully present in the accessibility tree already —
      // CSS truncation doesn't remove it — so announcing this copy too would
      // just repeat the label.
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: measurement?.position?.top ?? OFFSCREEN,
        left: measurement?.position?.left ?? OFFSCREEN,
        maxWidth: MAX_WIDTH,
        pointerEvents: 'none'
      }}
      className="z-50 break-words rounded border border-[#2a2d35] bg-[#2b2d33] px-2 py-1 text-[11px] leading-4 text-[#e5e5e5] shadow-lg"
    >
      {hover.text}
    </div>,
    anchor?.closest('dialog') ?? document.body
  )
}
