import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

// The smallest gap a centred dialog keeps from the top of the window. Only a
// dialog too tall to centre reaches it; that one scrolls inside itself (max-h
// below) rather than running off the top, where its header and × would be out of
// reach entirely.
const MIN_TOP_PX = 24

interface DialogProps {
  isOpen: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
  // What Enter triggers. Defaults to clicking the last enabled action button in
  // the dialog body (the primary/success button, by our Cancel-then-Primary
  // layout convention). Pass this to run a specific handler instead.
  onConfirm?: () => void
  'data-testid'?: string
}

function Dialog({
  isOpen,
  title,
  onClose,
  children,
  className = 'w-[420px] rounded border border-app-border bg-[#1f2126]',
  // min-h: the bar's height used to be an accident of its tallest child — the
  // close button's 36px line box — so tightening that button's hit area shrank
  // the white header with it. 52px is what those two padded together came to;
  // stated here, the bar keeps its height whatever the button does. Still min-,
  // not fixed, so a title that wraps can grow it.
  headerClassName = 'min-h-[52px] bg-neutral-200 px-4 py-2',
  bodyClassName = 'space-y-3 p-4',
  onConfirm,
  'data-testid': dataTestId
}: DialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // The enabled action buttons in the dialog body (excludes the header × close),
  // in DOM order. The last one is the primary/success action.
  const bodyButtons = (): HTMLButtonElement[] => {
    const body = bodyRef.current
    if (!body) return []
    return Array.from(body.querySelectorAll<HTMLButtonElement>('button')).filter((b) => !b.disabled)
  }

  // Centre the dialog vertically ONCE, by measurement, and then leave it there.
  //
  // CSS centring (`inset-0 m-auto`) does this continuously — which is the whole
  // problem: it makes the dialog's y position a function of its own height, and
  // dialog bodies change height while the user is mid-click. A field's inline
  // error <p> appears on blur, and clicking a button blurs the focused field
  // BEFORE mouseup — so pressing the New Project ×, with the auto-focused empty
  // name field blurring under it, grew the body a line, re-centred the dialog,
  // and moved the button ~10px out from under the pointer between mousedown and
  // mouseup. The browser fires `click` only when both land on the same element,
  // so the close silently did nothing and the dialog stayed open. The same shift
  // (downward, by half the delta) hit Cancel/Create at the bottom.
  //
  // Measuring once gives the identical position CSS centring would have picked,
  // and then holds it: later growth extends downward only and no control moves.
  // A fixed offset can't do both — a `top-[25vh]` that suits a ~320px form
  // dialog leaves a ~150px delete confirmation sitting well above centre.
  const centre = useCallback((): void => {
    const dialog = dialogRef.current
    if (!dialog?.open) return
    const top = (window.innerHeight - dialog.offsetHeight) / 2
    dialog.style.top = `${Math.max(MIN_TOP_PX, Math.round(top))}px`
  }, [])

  // Layout, not passive: the measurement has to land before the browser paints,
  // or the dialog shows for a frame at the CSS fallback and then jumps.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) {
      dialog.showModal()
      // Only meaningful once showModal has run — a closed dialog is display:none
      // and measures 0.
      centre()
      // Focus the first field if the dialog has one; otherwise focus the primary
      // action button so Enter triggers the success action right away.
      //
      // Real form controls are searched FIRST, and only then anything else
      // focusable. One combined selector would return whichever matched earliest
      // in DOM order — and a field's help tooltip is a focusable <span> inside
      // the LABEL, which sits above the input. So opening the New Project dialog
      // focused the "?" icon rather than the Project Name box, and react-tooltip
      // (whose default open events include focus) popped the help text open with
      // nobody having hovered it.
      const body = bodyRef.current
      const field =
        body?.querySelector<HTMLElement>('input, select, textarea') ??
        body?.querySelector<HTMLElement>('[tabindex]:not([tabindex="-1"])')
      if (field) {
        field.focus()
      } else {
        const buttons = bodyButtons()
        ;(buttons[buttons.length - 1] ?? dialog.querySelector<HTMLElement>('button'))?.focus()
      }
    } else if (!isOpen && dialog.open) {
      dialog.close()
    }
  }, [isOpen, centre])

  // Re-centre when the WINDOW changes size — maximising with a dialog open would
  // otherwise strand it wherever it was measured. Safe to re-measure here in a way
  // it isn't for content growth: a resize is not something that happens between
  // someone's mousedown and mouseup.
  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('resize', centre)
    return () => window.removeEventListener('resize', centre)
  }, [isOpen, centre])

  const triggerPrimary = (): void => {
    if (onConfirm) {
      onConfirm()
      return
    }
    const buttons = bodyButtons()
    buttons[buttons.length - 1]?.click()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>): void => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    const target = e.target as HTMLElement
    const tag = target.tagName
    // A textarea keeps newlines; a focused button handles its own Enter; a select
    // opens its menu; a field inside a <form> lets the form's onSubmit run.
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT') return
    if (target.closest('form')) return
    e.preventDefault()
    triggerPrimary()
  }

  return (
    <dialog
      ref={dialogRef}
      data-testid={dataTestId}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={handleKeyDown}
      // Positioning lives HERE, not in the overridable `className`, so every
      // dialog gets it — one caller passes its own className with no positioning
      // at all and used to fall back to the UA's centring, which has the same
      // mid-click flaw described on `centre` above.
      //
      // Horizontal centring stays in CSS: a dialog's WIDTH doesn't change while
      // someone is clicking it. Only `top` is measured, and the layout effect sets
      // it as an inline style before the first paint; `top-1/2` is just the
      // fallback for the frame that never renders.
      //
      // app-no-drag: the app is frameless with a 45px `-webkit-app-region: drag`
      // title bar, and a drag region swallows pointer events from anything
      // overlapping it that doesn't opt out — so in a short window (the main
      // window sets no minHeight) the header × was genuinely dead, and pressing
      // it dragged the window instead.
      //
      // max-h/overflow: the UA's `dialog:modal` max-height is measured from its
      // own inset-block-start of 0, which the measured top no longer matches. A
      // dialog taller than the window scrolls inside itself, clamped to MIN_TOP_PX
      // rather than centred off the top of the screen.
      className={`app-no-drag fixed top-1/2 bottom-auto left-1/2 right-auto m-0 max-h-[calc(100vh-48px)] -translate-x-1/2 overflow-auto ${className} p-0 backdrop:bg-black/50`}
    >
      <header className={`flex items-center justify-between ${headerClassName}`}>
        <h2 className="text-md font-medium text-black">{title}</h2>
        <button
          // Buttons default to type="submit". Nothing here sits in a <form>, so
          // it was inert — but a dialog body that grows one later would make this
          // one submit it.
          type="button"
          data-testid="dialog-close"
          aria-label="Close dialog"
          onClick={onClose}
          // A tight 24px square around the glyph. `px-2 py-1` on a text-xl line
          // box (28px tall) made this ~26×36 around a ~10px ×, so the hand cursor
          // appeared well clear of the mark — you aimed at empty header, the
          // pointer said "clickable", and the click landed nowhere near what you
          // thought you were pressing. leading-none drops the line box to the
          // glyph so the square is the target. 24px is the floor here, not a
          // number to shrink further: it is the minimum pointer target size.
          //
          // The hover/active tint makes that target VISIBLE. An invisible hit area
          // is what made the mismatch confusing in the first place — now the
          // square lights up under the pointer, so where it responds is where it
          // looks like it responds.
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded p-0 text-xl font-light leading-none text-[#101828] hover:bg-black/10 active:bg-black/20"
        >
          ×
        </button>
      </header>

      <div ref={bodyRef} className={bodyClassName}>
        {children}
      </div>
    </dialog>
  )
}

export default Dialog
