import React from 'react'
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  InfoIcon
} from '@renderer/components/ImportWizard/Icons'
import type { SnackbarVariant } from '@renderer/store/snackbarReducer'

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
    container: 'border-[#8dd3a8] bg-[#effcf4] text-[#0f6e3e]',
    icon: <CheckCircleIcon className="h-4 w-4 shrink-0" />,
    dismiss: 'text-[#0f6e3e]'
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
    <div className="pointer-events-none fixed left-1/2 top-2 z-[100] w-full max-w-[520px] -translate-x-1/2 px-4">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex items-center gap-2 rounded border px-4 py-3 text-sm shadow-lg ${styles.container}`}
      >
        {styles.icon}
        <div className="min-w-0 flex-1">{message}</div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className={`shrink-0 opacity-80 transition hover:opacity-100 ${styles.dismiss}`}
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
