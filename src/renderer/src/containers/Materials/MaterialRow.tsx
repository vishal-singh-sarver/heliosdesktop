import deleteIcon from '@renderer/assets/delete.svg'
import dragHandleIcon from '@renderer/assets/DragHandleIco.svg'
import eyeIcon from '@renderer/assets/EyeIcon.svg'
import eyeOffIcon from '@renderer/assets/EyeOffIcon.svg'
import React from 'react'
import { useDispatch } from 'react-redux'
import { removeMaterial, selectMaterial, toggleMaterialVisibility } from './actions'
import MaterialNameEditor from './MaterialNameEditor'
import type { Material } from './types'

interface IconButtonProps {
  label: string
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
}

// Small square icon button matching the Geometry row affordances.
function IconButton({ label, children, active = false, onClick }: IconButtonProps): React.JSX.Element {
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
  projectId: string | null
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
  projectId,
  existingNames,
  nameError
}: MaterialRowProps): React.JSX.Element {
  const dispatch = useDispatch()
  const [editing, setEditing] = React.useState(false)
  // Live rename validation error, lifted from MaterialNameEditor so the error
  // can render below (outside) the row box.
  const [editError, setEditError] = React.useState<string | null>(null)

  const onSelect = (): void => {
    dispatch(selectMaterial(material.id))
  }
  const onToggleVisibility = (): void => {
    dispatch(toggleMaterialVisibility(material.id))
  }
  const onDelete = (): void => {
    dispatch(removeMaterial(material.id))
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
        role="button"
        tabIndex={0}
        onClick={onSelect}
        className={`group flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[14px] font-normal text-neutral-200 ${
          hasError
            ? 'border-[#D92D20] bg-[#2a2a2a]'
            : editing
              ? 'border-[#245AC5] bg-[#2a2a2a]'
              : selected
                ? 'border-app-border bg-[#2a2a2a]'
                : 'border-transparent hover:bg-neutral-700/40'
        }`}
      >
        {editing ? (
          <MaterialNameEditor
            id={material.id}
            initialName={material.name}
            projectId={projectId}
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
            <IconButton label="Delete material" onClick={onDelete}>
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
    </div>
  )
}
