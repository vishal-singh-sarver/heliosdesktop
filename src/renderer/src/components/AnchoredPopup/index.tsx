import React from 'react'
import { createPortal } from 'react-dom'
import {
  useAnchoredPosition,
  type AnchorRect,
  type Placement,
  type Size
} from 'utils/useAnchoredPosition'

/**
 * Whether the panel hosting a popup is currently showing its content.
 *
 * A popup portals to document.body, so it lives OUTSIDE the panel that owns it.
 * A panel that collapses by UNMOUNTING its content takes its popups with it; a
 * panel that collapses by HIDING its content with CSS does not — `display:none`
 * can't reach through a portal. The popup would keep floating over the app,
 * anchored to a trigger that no longer renders (and so measures zero), and its
 * invisible full-screen click-catcher would keep swallowing every click in the
 * app.
 *
 * So a panel that hides rather than unmounts has to say so, and its popups take
 * themselves down. Wrap the panel's content in <PanelVisibilityProvider> and
 * every popup beneath it is handled — including ones added later, which is the
 * point of putting the rule here rather than in each popup's owner.
 *
 * Defaults to `true`, so a popup outside any panel behaves exactly as before.
 */
const PanelVisibilityContext = React.createContext(true)

export function PanelVisibilityProvider({
  visible,
  children
}: {
  visible: boolean
  children: React.ReactNode
}): React.JSX.Element {
  // The value is a primitive, so there's nothing to memoise — its identity
  // changes only when the visibility actually changes.
  return (
    <PanelVisibilityContext.Provider value={visible}>{children}</PanelVisibilityContext.Provider>
  )
}

/** What the render prop gets, re-derived on every measure pass. */
export interface AnchoredPopupContext {
  /** The trigger's current viewport rect. */
  anchorRect: AnchorRect
  /**
   * The room the popup has in this placement. Apply it as a max-width/height so
   * a small window shrinks the popup instead of pushing it off-screen — this
   * component never sets the popup's size itself.
   */
  available: Size
}

interface AnchoredPopupProps {
  open: boolean
  /** Called on outside click and on Escape. */
  onClose: () => void
  /**
   * The trigger's viewport rect, or null when it isn't mounted. Keep it
   * referentially stable (useCallback) — a new identity restarts measurement.
   */
  getAnchorRect: () => AnchorRect | null
  placement?: Placement
  /** Distance from the anchor. Default 8. */
  gap?: number
  /** Minimum distance from the viewport edges. Default 8. */
  padding?: number
  children: React.ReactNode | ((ctx: AnchoredPopupContext) => React.ReactNode)
}

/**
 * A popup that stays attached to whatever triggered it.
 *
 * Owns the four things every anchored surface in this app needs: a portal (so
 * the panel's overflow can't clip it), an outside-click overlay, Escape to
 * close, and a position that keeps tracking the trigger — through window
 * resize, the right panel's collapse animation, and scrolling — rather than
 * freezing at wherever it was when it opened.
 *
 * It does NOT set the popup's width or height. The popup component owns those
 * and this measures the result, so there's one source of truth for the size.
 * Callers that need to size against the anchor use the render prop.
 */
export default function AnchoredPopup({
  open,
  onClose,
  getAnchorRect,
  placement = 'bottom-start',
  gap,
  padding,
  children
}: AnchoredPopupProps): React.JSX.Element | null {
  const panelVisible = React.useContext(PanelVisibilityContext)

  const { floatingRef, measurement } = useAnchoredPosition({
    open,
    getAnchorRect,
    placement,
    gap,
    padding
  })

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // The host panel has hidden its content, so this popup — which sits outside it
  // in a portal — takes itself down. CLOSING rather than merely not rendering is
  // what the panel's unmount used to do for us: the popup is gone for good,
  // instead of springing back the next time the panel is expanded, long after
  // the user has forgotten they opened it.
  React.useEffect(() => {
    if (open && !panelVisible) onClose()
  }, [open, panelVisible, onClose])

  // Bail out of the WHOLE portal, not just the popup body. The overlay below is
  // invisible and covers the viewport, so rendering it against a hidden panel
  // would silently swallow every click in the app — a worse failure than the
  // misplaced popup it was meant to prevent.
  if (!open || !panelVisible) return null

  const position = measurement?.position

  return createPortal(
    <>
      {/* Outside-click catcher, under the popup but over everything else. */}
      <div
        data-testid="anchored-popup-overlay"
        className="fixed inset-0 z-40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={floatingRef}
        className="fixed z-50"
        style={{
          top: position?.top,
          left: position?.left,
          // Measurement settles over two pre-paint passes (anchor, then the
          // popup it sized). Stay invisible until then so nothing flashes at
          // the top-left corner. Deliberately not `visibility: hidden`, which
          // would drop the popup out of the accessibility tree.
          opacity: position ? undefined : 0,
          pointerEvents: position ? undefined : 'none'
        }}
      >
        {/* The render prop needs a measured anchor, so children wait one pass. */}
        {typeof children === 'function'
          ? measurement &&
            children({ anchorRect: measurement.anchorRect, available: measurement.available })
          : children}
      </div>
    </>,
    document.body
  )
}
