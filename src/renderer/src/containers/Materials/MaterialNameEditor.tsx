import React from 'react'
import { useDispatch } from 'react-redux'
import { renameMaterialRequested } from './actions'
import { validateMaterialName } from './validation'

interface MaterialNameEditorProps {
  id: string
  initialName: string
  projectId: string | null
  // Lowercased names of OTHER materials (this one excluded) for the unique check.
  existingNames: Set<string>
  // Reports the current validation error (or null) so the row box can colour
  // itself and render the error below — this editor is borderless.
  onErrorChange?: (error: string | null) => void
  onClose: () => void
}

// Inline editor shown when a material row's name is double-clicked. Validates
// live (≤20 chars, non-empty, unique case-insensitive) and blocks commit while
// invalid; commits a changed, valid name via renameMaterialRequested (the saga
// PATCHes §7.5, or renames a local row in-place).
export default function MaterialNameEditor({
  id,
  initialName,
  projectId,
  existingNames,
  onErrorChange,
  onClose
}: MaterialNameEditorProps): React.JSX.Element {
  const dispatch = useDispatch()
  const [value, setValue] = React.useState(initialName)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const error = validateMaterialName(value, existingNames)

  // Push the current validity to the parent (drives the row box colour), and
  // clear it when the editor unmounts.
  React.useEffect(() => {
    onErrorChange?.(error)
  }, [error, onErrorChange])
  React.useEffect(() => () => onErrorChange?.(null), [onErrorChange])

  const commit = (): void => {
    const trimmed = value.trim()
    if (error) return // stay open, keep showing the error
    // Local rows have no backend id but still rename in-place (projectId unused
    // by the saga for them); persisted rows need the active project.
    if (trimmed !== initialName && (projectId || id.startsWith('local-'))) {
      dispatch(renameMaterialRequested(projectId ?? '', id, trimmed))
    }
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose() // discard
    }
  }

  return (
    <span className="flex min-w-0 flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => (error ? onClose() : commit())}
        aria-label="Material name"
        aria-invalid={Boolean(error)}
        className="h-5 w-full bg-transparent px-1.5 text-[13px] font-normal text-neutral-100"
        // Borderless: the row is the single box (it turns blue while editing).
        // Suppress the global :focus-visible outline so nothing is bordered
        // inside the row box.
        style={{ outline: 'none' }}
      />
      {/* The validation error is rendered by MaterialRow *below* the row box
          (not here, inside it) — it's lifted to the parent via onErrorChange. */}
    </span>
  )
}
