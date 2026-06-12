import React from 'react'
import { useDispatch } from 'react-redux'
import { renameRequested } from './actions'
import { validateGroupName } from './validation'

interface NameEditorProps {
  id: string
  initialName: string
  projectId: string | null
  scenarioId: string | null
  // Lowercased names of OTHER nodes of the same kind (this one excluded), for
  // the unique-name check (geometry and group names are separate namespaces).
  existingNames: Set<string>
  // a11y label — "Group name" or "Geometry name".
  ariaLabel: string
  onClose: () => void
}

// Inline editor shown when a row's name is double-clicked — used for both groups
// and leaf geometries. Validates live (≤20 chars, non-empty, unique
// case-insensitive within its kind) and blocks commit while invalid; commits a
// changed, valid name via renameRequested (the saga routes it to the group or
// object rename endpoint based on the node's kind).
export default function NameEditor({
  id,
  initialName,
  projectId,
  scenarioId,
  existingNames,
  ariaLabel,
  onClose
}: NameEditorProps): React.JSX.Element {
  const dispatch = useDispatch()
  const [value, setValue] = React.useState(initialName)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const error = validateGroupName(value, existingNames)

  const commit = (): void => {
    const trimmed = value.trim()
    if (error) return // stay open, keep showing the error
    if (trimmed !== initialName && projectId && scenarioId) {
      dispatch(renameRequested(projectId, scenarioId, id, trimmed))
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
        aria-label={ariaLabel}
        aria-invalid={Boolean(error)}
        className={`h-6 w-full rounded border bg-app-bg px-1.5 text-[13px] text-neutral-100 outline-none ${
          error ? 'border-[#D92D20]' : 'border-neutral-500'
        }`}
      />
      {error && <span className="form-error-text mt-0.5">{error}</span>}
    </span>
  )
}
