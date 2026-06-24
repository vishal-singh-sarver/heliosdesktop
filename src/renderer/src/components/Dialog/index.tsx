import React, { useEffect, useRef } from 'react'

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
}

function Dialog({
  isOpen,
  title,
  onClose,
  children,
  className = 'w-[420px] rounded border border-app-border bg-[#1f2126]',
  headerClassName = 'bg-neutral-200 px-4 py-2',
  bodyClassName = 'space-y-3 p-4',
  onConfirm
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

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) {
      dialog.showModal()
      // Focus the first field if the dialog has one; otherwise focus the primary
      // action button so Enter triggers the success action right away.
      const body = bodyRef.current
      const field = body?.querySelector<HTMLElement>(
        'input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (field) {
        field.focus()
      } else {
        const buttons = bodyButtons()
        ;(buttons[buttons.length - 1] ?? dialog.querySelector<HTMLElement>('button'))?.focus()
      }
    } else if (!isOpen && dialog.open) {
      dialog.close()
    }
  }, [isOpen])

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
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={handleKeyDown}
      className={`fixed inset-0 m-auto ${className} p-0 backdrop:bg-black/50`}
    >
      <header className={`flex items-center justify-between ${headerClassName}`}>
        <h2 className="text-md font-medium text-black">{title}</h2>
        <button
          aria-label="Close dialog"
          onClick={onClose}
          className="px-2 py-1 text-xl font-light text-[#101828] cursor-pointer rounded"
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
