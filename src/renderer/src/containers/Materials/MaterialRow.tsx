import deleteIcon from '@renderer/assets/delete.svg'
import dragHandleIcon from '@renderer/assets/DragHandleIco.svg'
import eyeIcon from '@renderer/assets/EyeIcon.svg'
import eyeOffIcon from '@renderer/assets/EyeOffIcon.svg'
import Dialog from '@renderer/components/Dialog'
import { selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { HIGHLIGHT_CLASSES, useScrollIntoViewWhen } from 'utils/useTransientHighlight'
import {
  deleteMaterialRequested,
  openSavedMaterialRequested,
  selectMaterial,
  toggleMaterialVisibility
} from './actions'
import MaterialNameEditor from './MaterialNameEditor'
import messages from './messages'
import type { Material } from './types'

interface IconButtonProps {
  label: string
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
}

// Small square icon button matching the Geometry row affordances.
function IconButton({
  label,
  children,
  active = false,
  onClick
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-600/50 hover:text-neutral-100"
    >
      {children}
    </button>
  )
}

interface MaterialRowProps {
  material: Material
  selected: boolean
  // Just created by +Add Materials — flash it and bring it into view.
  highlighted?: boolean
  // Lowercased names of all materials (this row excludes its own) for the
  // rename uniqueness check.
  existingNames: Set<string>
  // Backend rename-failure message for this material (or undefined).
  nameError?: string
}

// One row of the Saved Materials list: the material label on the left, and the
// eye / delete / drag cluster pinned to the right (revealed on hover/selection).
// Double-clicking the name opens an inline rename editor.
export default function MaterialRow({
  material,
  selected,
  highlighted = false,
  existingNames,
  nameError
}: MaterialRowProps): React.JSX.Element {
  const dispatch = useDispatch()
  const rowRef = useScrollIntoViewWhen<HTMLDivElement>(highlighted)
  const scenarioId = useSelector(selectActiveScenarioId)
  const [editing, setEditing] = React.useState(false)
  // Live rename validation error, lifted from MaterialNameEditor so the error
  // can render below (outside) the row box.
  const [editError, setEditError] = React.useState<string | null>(null)
  // Delete needs an explicit confirmation first (matches the Geometry tree row);
  // the icon opens the dialog, confirming dispatches the backend delete.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)

  const onSelect = (): void => {
    dispatch(selectMaterial(material.id))
    // Every row is a persisted group — open its properties in the right panel.
    dispatch(openSavedMaterialRequested(material.id))
  }
  const onToggleVisibility = (): void => {
    dispatch(toggleMaterialVisibility(material.id))
  }
  const confirmDelete = (): void => {
    dispatch(deleteMaterialRequested(material.id, scenarioId))
    setConfirmDeleteOpen(false)
  }

  // Names to check a rename against, minus this row's own (so an unchanged name
  // is allowed).
  const otherNames = React.useMemo(() => {
    const names = new Set(existingNames)
    names.delete(material.name.toLowerCase())
    return names
  }, [existingNames, material.name])

  // Reveal the cluster on hover/focus (Tailwind group-* off the row) or while
  // selected, matching the Geometry tree rows.
  const clusterVisibility = selected
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

  // Any error on the row (live rename validation while editing, or a backend
  // rename failure) turns the box border red — the same #D92D20 the right-panel
  // form uses for invalid fields.
  const hasError = editing ? Boolean(editError) : Boolean(nameError)

  return (
    <div className="mb-1">
      <div
        ref={rowRef}
        role="button"
        tabIndex={0}
        onClick={onSelect}
        // The "just created" cue sits under the error/editing states (both of
        // which are about the name being wrong right now, and must win) but over
        // selection — a new row is selected too, and the flash is what's new.
        className={`group flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[13px] font-normal text-neutral-200 transition-colors duration-500 ${
          hasError
            ? 'border-[#D92D20] bg-[#2a2a2a]'
            : editing
              ? 'border-[#245AC5] bg-[#2a2a2a]'
              : highlighted
                ? HIGHLIGHT_CLASSES
                : selected
                  ? 'border-app-border bg-[#2a2a2a]'
                  : 'border-transparent hover:bg-neutral-700/40'
        }`}
      >
        {editing ? (
          <MaterialNameEditor
            id={material.id}
            initialName={material.name}
            scenarioId={scenarioId}
            existingNames={otherNames}
            onErrorChange={setEditError}
            onClose={() => {
              setEditing(false)
              setEditError(null)
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate" onDoubleClick={() => setEditing(true)}>
            {material.name}
          </span>
        )}

        {!editing && (
          <div
            className={`ml-auto flex shrink-0 items-center gap-0.5 transition-opacity ${clusterVisibility}`}
          >
            <IconButton
              label={material.visible ? 'Hide material' : 'Show material'}
              active={!material.visible}
              onClick={onToggleVisibility}
            >
              <img
                src={material.visible ? eyeIcon : eyeOffIcon}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5"
              />
            </IconButton>
            <IconButton label="Delete material" onClick={() => setConfirmDeleteOpen(true)}>
              <img src={deleteIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
            </IconButton>
            <span
              className="flex h-5 w-4 cursor-grab items-center justify-center text-neutral-500"
              aria-hidden="true"
            >
              <img src={dragHandleIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
      {/* Error text lives OUTSIDE the row box (below it): the live rename
          validation error while editing, or the backend rename-failure message. */}
      {(editing ? editError : nameError) && (
        <span className="form-error-text mt-0.5 block px-2" style={{ color: '#D92D20' }}>
          {editing ? editError : nameError}
        </span>
      )}

      {/* Delete confirmation — matches the Geometry tree row / right-panel form. */}
      <Dialog
        isOpen={confirmDeleteOpen}
        title={messages.deleteTitle}
        onClose={() => setConfirmDeleteOpen(false)}
      >
        <h3 className="text-base font-medium text-white">
          {messages.deleteHeading(material.name)}
        </h3>
        <p className="text-sm text-neutral-400">{messages.deleteBody}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(false)}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
          >
            {messages.deleteCancel}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
          >
            {messages.deleteConfirm}
          </button>
        </div>
      </Dialog>
    </div>
  )
}
