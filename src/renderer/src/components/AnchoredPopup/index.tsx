import React from 'react'
import { createPortal } from 'react-dom'
import {
  useAnchoredPosition,
  type AnchorRect,
  type Placement,
  type Size
} from 'utils/useAnchoredPosition'

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

  if (!open) return null

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
