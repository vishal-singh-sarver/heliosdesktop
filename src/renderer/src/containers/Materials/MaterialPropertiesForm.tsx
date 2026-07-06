import addIcon from '@renderer/assets/add.svg'
import chevronDown from '@renderer/assets/ChevronDownIcon.svg'
import deleteIcon from '@renderer/assets/delete.svg'
import pencilIcon from '@renderer/assets/pencil.svg'
import Dialog from '@renderer/components/Dialog'
import FormField from '@renderer/components/FormField'
import { selectActiveProjectId, selectAllMaterialTypes } from 'containers/ProjectScreen/selectors'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import {
  addMaterialType,
  clearMaterialTypes,
  closeMaterialDraft,
  removeMaterial,
  removeMaterialType,
  renameMaterialRequested,
  setMaterialDraftName,
  setMaterialDraftPendingType,
  setMaterialDraftValue
} from './actions'
import { resolveParameterGroups } from './materialBlueprint'
import messages from './messages'
import reducer from './reducer'
import saga from './saga'
import { selectMaterialDraft, selectMaterialDraftNonce } from './selectors'
import type { MaterialDraft } from './types'

// The right-panel Properties form for a material: +Add Materials opens this
// populated with an empty Parameter Groups section, a "+ Add Material Type"
// button and a (disabled) "Save Material" button — the mockup's initial state.
// The Parameter Groups Select lists every material type from the catalog
// (/api/catalog/material-types); picking one stages it, and "+ Add Material Type"
// commits it, rendering that type's parameters (grouped by their `group` tag)
// below. Everything is client-side for now (Save is disabled until the
// create-form persist flow lands). Injects the materials slice so it works
// mounted in the RightPanel independently of the LeftPanel's <Materials />.
// Renders nothing when there is no active material draft. Keyed by the open-nonce
// so local state resets when a different material opens. Mirrors Geometry's
// ObjectPropertiesForm.
export function MaterialPropertiesForm(): React.JSX.Element | null {
  useInjectReducer({ key: 'materials', reducer: reducer as Reducer })
  useInjectSaga({ key: 'materials', saga })

  const draft = useSelector(selectMaterialDraft)
  const draftNonce = useSelector(selectMaterialDraftNonce)
  if (!draft) return null
  return <MaterialDraftForm key={draftNonce} draft={draft} />
}

function MaterialDraftForm({ draft }: { draft: MaterialDraft }): React.JSX.Element {
  const dispatch = useDispatch()
  const projectId = useSelector(selectActiveProjectId)
  const materialTypes = useSelector(selectAllMaterialTypes)

  // The name is read-only until the pencil is tapped (matches the Geometry
  // object form); the delete confirmation lives here too.
  const [nameEditing, setNameEditing] = React.useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  const [groupsOpen, setGroupsOpen] = React.useState(true)
  const nameInputRef = React.useRef<HTMLInputElement>(null)

  // Focus the name field the moment the pencil unlocks it.
  React.useEffect(() => {
    if (nameEditing) nameInputRef.current?.focus()
  }, [nameEditing])

  // Every catalog material type, by name — the Parameter Groups Select's options.
  const typeOptions = materialTypes.map((t) => ({ value: String(t.id), label: t.materialtype }))

  // The material types already added, resolved to catalog defs (dropping any id
  // no longer in the catalog) — each renders as a parameter-group block.
  const addedTypes = draft.addedTypeIds
    .map((id) => materialTypes.find((t) => t.id === id))
    .filter((t): t is (typeof materialTypes)[number] => t != null)

  // "+ Add Material Type" commits the staged pick; disabled when nothing is
  // staged or the staged type is already added.
  const canAddType =
    draft.pendingTypeId != null && !draft.addedTypeIds.includes(draft.pendingTypeId)

  const handleNameChange = (next: string): void => {
    dispatch(setMaterialDraftName(next))
  }

  const handleNameBlur = (): void => {
    setNameEditing(false)
    const next = draft.name.trim()
    // Local rows rename client-side (the saga short-circuits `local-*` ids). Only
    // commit a non-empty, actually-changed name.
    if (projectId && next !== '' && next !== draft.materialId.replace(/^local-/, '')) {
      dispatch(renameMaterialRequested(projectId, draft.materialId, draft.name))
    }
  }

  const onAddType = (): void => {
    if (draft.pendingTypeId != null) dispatch(addMaterialType(draft.pendingTypeId))
  }

  const performDelete = (): void => {
    dispatch(removeMaterial(draft.materialId))
    setConfirmDeleteOpen(false)
    dispatch(closeMaterialDraft())
  }

  return (
    // Hug content with a 10px vertical rhythm, matching the Geometry object form.
    <div className="flex flex-col gap-2.5">
      {/* Header: material name with a pencil (unlock to rename) and a trash
          (delete). The name is read-only until the pencil is tapped. */}
      <div className="flex items-center gap-1">
        <input
          ref={nameInputRef}
          aria-label="Material name"
          value={draft.name}
          readOnly={!nameEditing}
          onChange={(e) => handleNameChange(e.target.value)}
          onDoubleClick={() => setNameEditing(true)}
          onBlur={handleNameBlur}
          className={`min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-sm font-medium text-neutral-100 outline-none ${
            !nameEditing ? 'cursor-default ' : ''
          }${nameEditing ? 'border-neutral-500' : 'border-transparent hover:border-app-border'}`}
        />
        <button
          type="button"
          aria-label="Edit name"
          onClick={() => setNameEditing(true)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50"
        >
          <img src={pencilIcon} alt="" aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Delete material"
          onClick={() => setConfirmDeleteOpen(true)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50"
        >
          <img src={deleteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {/* Parameter Groups — a collapsible section (title + trash + chevron) whose
          Select lists every catalog material type by name. Figma: 320×82, 1px
          border, 5px radius — 82px is the resting height (header + Select),
          applied as a min-height so the card still grows when added types'
          parameters render inside it. */}
      <div className={`rounded-[5px] border border-app-border ${groupsOpen ? 'min-h-[82px]' : ''}`}>
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <span className="flex items-center gap-2 text-[13px] font-normal leading-[15px] text-neutral-200">
            {messages.parameterGroups}
            <button
              type="button"
              aria-label="Remove material types"
              onClick={() => dispatch(clearMaterialTypes())}
              className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-100"
            >
              <img src={deleteIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </span>
          <button
            type="button"
            aria-expanded={groupsOpen}
            aria-label="Toggle parameter groups"
            onClick={() => setGroupsOpen((prev) => !prev)}
            className="mr-1 flex h-5 w-5 items-center justify-center"
          >
            <img
              src={chevronDown}
              alt=""
              aria-hidden="true"
              className="h-1.5 w-auto transition-transform duration-150"
              style={{ transform: groupsOpen ? 'rotate(180deg)' : 'none' }}
            />
          </button>
        </div>

        {groupsOpen && (
          <div className="flex flex-col gap-2.5 px-3 pb-2 pt-0">
            <FormField
              labelProps={{ label: messages.parameterGroups, hideLabel: true, optional: true }}
              inputProps={{
                name: 'material-type',
                value: draft.pendingTypeId == null ? '' : String(draft.pendingTypeId),
                placeholder: messages.selectPlaceholder,
                inputClassName: 'bg-[#121212]',
                options: typeOptions,
                onChange: (e) =>
                  dispatch(
                    setMaterialDraftPendingType(e.target.value === '' ? null : Number(e.target.value))
                  ),
                onBlur: () => {}
              }}
            />

            {/* Each added material type renders as a labeled block of its
                parameters, grouped by their catalog `group` tag. */}
            {addedTypes.map((type) => (
              <div
                key={type.id}
                className="flex flex-col gap-2 rounded border border-app-border p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-neutral-200">
                    {type.materialtype}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${type.materialtype}`}
                    onClick={() => dispatch(removeMaterialType(type.id))}
                    className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-100"
                  >
                    <img src={deleteIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>

                {resolveParameterGroups([type]).map((group) => (
                  <div key={group.group} className="flex flex-col gap-2">
                    <p className="text-[13px] font-medium leading-[20px] text-[#D3D3D3]">
                      {group.label}
                    </p>
                    {group.fields.map((field) => (
                      <FormField
                        key={field.property}
                        labelProps={{
                          label: field.label,
                          optional: true,
                          helpText: field.description
                        }}
                        inputProps={{
                          name: `${type.id}-${field.property}`,
                          value: draft.values[field.property] ?? '',
                          placeholder: field.label,
                          inputClassName: 'bg-[#121212]',
                          options:
                            field.datatype === 'enum' && field.enumValues
                              ? field.enumValues.map((v) => ({ value: v, label: v }))
                              : undefined,
                          onChange: (e) =>
                            dispatch(setMaterialDraftValue(field.property, e.target.value)),
                          onBlur: () => {}
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* + Add Material Type — commits the staged Select pick. Full-width white
          button, matching the mockup. */}
      <button
        type="button"
        onClick={onAddType}
        disabled={!canAddType}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded border border-app-border bg-white text-sm font-medium text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <img src={addIcon} alt="" aria-hidden="true" className="h-4 w-4 [filter:brightness(0)]" />
        {messages.addMaterialType}
      </button>

      {/* Save Material — disabled until the persist flow lands (mockup shows it
          greyed out). Same construction as the Geometry object form's Save. */}
      <button
        type="button"
        disabled
        className="h-9 w-full rounded bg-blue-600 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {messages.saveMaterial}
      </button>

      {/* Delete confirmation. */}
      <Dialog
        isOpen={confirmDeleteOpen}
        title={messages.deleteTitle}
        onClose={() => setConfirmDeleteOpen(false)}
      >
        <h3 className="text-base font-medium text-white">{messages.deleteHeading(draft.name)}</h3>
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
            onClick={performDelete}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
          >
            {messages.deleteConfirm}
          </button>
        </div>
      </Dialog>
    </div>
  )
}

export default MaterialPropertiesForm
