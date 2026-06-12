import React from 'react'
import { useDispatch } from 'react-redux'
import { renameRequested } from './actions'
import { validateGroupName } from './validation'

interface GroupNameEditorProps {
  id: string
  initialName: string
  projectId: string | null
  scenarioId: string | null
  // Lowercased names of all OTHER groups (this one excluded), for the unique
  // check.
  otherGroupNames: Set<string>
  onClose: () => void
}

// Inline editor shown when a group name is double-clicked. Validates live
// (≤20 chars, non-empty, unique case-insensitive) and blocks commit while
// invalid; commits a changed, valid name via renameRequested.
export default function GroupNameEditor({
  id,
  initialName,
  projectId,
  scenarioId,
  otherGroupNames,
  onClose
}: GroupNameEditorProps): React.JSX.Element {
  const dispatch = useDispatch()
  const [value, setValue] = React.useState(initialName)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const error = validateGroupName(value, otherGroupNames)

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
        aria-label="Group name"
        aria-invalid={Boolean(error)}
        className={`h-6 w-full rounded border bg-app-bg px-1.5 text-[13px] text-neutral-100 outline-none ${
          error ? 'border-[#D92D20]' : 'border-neutral-500'
        }`}
      />
      {error && <span className="form-error-text mt-0.5">{error}</span>}
    </span>
  )
}
