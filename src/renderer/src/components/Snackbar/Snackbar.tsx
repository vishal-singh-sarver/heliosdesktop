import {
  AlertTriangleIcon,
  CheckCircleOutlineIcon,
  CloseGlyphIcon,
  InfoIcon
} from '@renderer/components/ImportWizard/Icons'
import type { SnackbarVariant } from '@renderer/store/snackbarReducer'
import React from 'react'

// Presentational toast banner — the app's single reusable snackbar. Colour and
// icon switch on `variant`; the caller owns visibility and dismissal (so the
// same component backs a redux-driven global toast or any local one).
//
// The success styling matches the Weather import banner (green #effcf4 /
// #0f6e3e), so toasts read the same wherever they appear; `error` mirrors it in
// the red the forms use for invalid fields (#D92D20). `info` mirrors both in
// amber: #B54708 for everything that carries the message (text, icon, dismiss),
// over the matching light tint. The amber is the design's; the tint and border
// around it are provisional until the designer specifies them.

const VARIANT_STYLES: Record<
  SnackbarVariant,
  { container: string; icon: React.JSX.Element; dismiss: string }
> = {
  success: {
    container: 'border-[#8dd3a8] bg-[#effcf4] text-[#067647]',
    // Outlined, and strokes with currentColor — so the tick is the same green as
    // the message beside it, rather than the filled blue of the shared asset.
    icon: <CheckCircleOutlineIcon className="h-4 w-4 shrink-0" />,
    dismiss: 'text-[#067647]'
  },
  error: {
    container: 'border-[#f3b4ac] bg-[#fef3f2] text-[#b42318]',
    icon: <AlertTriangleIcon className="h-4 w-4 shrink-0" />,
    dismiss: 'text-[#b42318]'
  },
  info: {
    // The icon strokes with currentColor, so the text colour carries it too.
    container: 'border-[#f9dbaf] bg-[#fffaeb] text-[#B54708]',
    icon: <InfoIcon className="h-4 w-4 shrink-0" />,
    dismiss: 'text-[#B54708]'
  }
}

export interface SnackbarProps {
  message: string
  variant?: SnackbarVariant
  onDismiss: () => void
}

export default function Snackbar({
  message,
  variant = 'success',
  onDismiss
}: SnackbarProps): React.JSX.Element {
  const styles = VARIANT_STYLES[variant]
  return (
    // Just the card. Where it sits is SnackbarHost's business — several of these
    // share one stack, so a card that positioned itself would land on top of its
    // siblings. It hugs its message (per the design) rather than taking a fixed
    // width, and caps so a long one wraps instead of running off the left edge.
    <div
      role="status"
      aria-live="polite"
      // h-11 is the design's 44px exactly — the border sits inside it
      // (border-box), where the old vertical padding pushed the box to 46px.
      // Content stays centred, so a shorter or taller glyph doesn't move it.
      className={`pointer-events-auto inline-flex h-11 max-w-[520px] items-center gap-2 rounded border px-4 text-sm shadow-lg ${styles.container}`}
    >
      {styles.icon}
      <div className="min-w-0">{message}</div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className={`shrink-0 opacity-80 transition hover:opacity-100 ${styles.dismiss}`}
      >
        <CloseGlyphIcon className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}
