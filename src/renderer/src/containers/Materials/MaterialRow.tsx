import deleteIcon from '@renderer/assets/delete.svg'
import dragHandleIcon from '@renderer/assets/DragHandleIco.svg'
import Dialog from '@renderer/components/Dialog'
import { selectActiveScenarioId } from 'containers/ProjectScreen/selectors'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { HIGHLIGHT_CLASSES, useScrollIntoViewWhen } from 'utils/useTransientHighlight'
import { deleteMaterialRequested, openSavedMaterialRequested, selectMaterial } from './actions'
import { MATERIAL_DND_MIME } from './constants'
import MaterialNameEditor from './MaterialNameEditor'
import messages from './messages'
import { selectDeletingIds, selectOpeningMaterialId } from './selectors'
import type { Material } from './types'

interface IconButtonProps {
  label: string
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}

// Small square icon button matching the Geometry row affordances.
function IconButton({
  label,
  children,
  active = false,
  disabled = false,
  onClick
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-600/50 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
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
  // This material's whole-material DELETE is in flight — the trash locks so a
  // second confirm can't fire a duplicate DELETE onto the already-gone material.
  const deleting = useSelector(selectDeletingIds).includes(material.id)
  // The material whose properties are currently being FETCHED (GET in flight).
  // Used to swallow repeat clicks on a slow-loading row so they don't each fire a
  // fresh GET (takeLatest cancels the stale saga, but the network request already
  // went out — so the network tab filled with a request per click).
  const openingId = useSelector(selectOpeningMaterialId)
  const [editing, setEditing] = React.useState(false)
  // Live rename validation error, lifted from MaterialNameEditor so the error
  // can render below (outside) the row box.
  const [editError, setEditError] = React.useState<string | null>(null)
  // Delete needs an explicit confirmation first (matches the Geometry tree row);
  // the icon opens the dialog, confirming dispatches the backend delete.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)

  const onSelect = (): void => {
    // Already fetching THIS material — don't fire the GET again. Impatient repeat
    // clicks on a slow row otherwise stacked one duplicate request per click.
    if (openingId === material.id) return
    dispatch(selectMaterial(material.id))
    // Every row is a persisted group — open its properties in the right panel.
    dispatch(openSavedMaterialRequested(material.id))
  }

  // The row is a role="button", so it must answer Enter and Space the way a real
  // <button> would — it took focus and announced itself as a button while doing
  // nothing on either key, which left opening a material mouse-only.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    // Keys pressed on the eye/trash inside the row bubble up to here; those
    // buttons act on their own, and the row must not also open the material.
    if (e.target !== e.currentTarget) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault() // Space would otherwise scroll the list
    onSelect()
  }
  const confirmDelete = (): void => {
    if (deleting) return
    dispatch(deleteMaterialRequested(material.id, scenarioId))
    setConfirmDeleteOpen(false)
  }

  // Drag this material onto a geometry object/group to assign it. Carries the
  // group id + name (for the outcome toast); the Geometry tree reads this mime
  // and ignores everything else. Disabled while renaming so a drag can't start
  // from the inline editor.
  const onDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    e.dataTransfer.setData(
      MATERIAL_DND_MIME,
      JSON.stringify({ groupId: material.id, name: material.name })
    )
    e.dataTransfer.effectAllowed = 'copy'
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
        draggable={!editing}
        onDragStart={onDragStart}
        onClick={onSelect}
        onKeyDown={onKeyDown}
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
              label="Delete material"
              disabled={deleting}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <img src={deleteIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
            </IconButton>
            <span
              className="flex h-5 w-5 cursor-grab items-center justify-center text-neutral-500"
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
