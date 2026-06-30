import deleteIcon from '@renderer/assets/delete.svg'
import infoIcon from '@renderer/assets/info.svg'
import pencilIcon from '@renderer/assets/pencil.svg'
import Dialog from '@renderer/components/Dialog'
import FormField from '@renderer/components/FormField'
import Tooltip from '@renderer/components/Tooltip'
import {
  selectActiveProjectId,
  selectActiveScenarioId,
  selectAllMaterialTypes,
  selectAllObjectTypes
} from 'containers/ProjectScreen/selectors'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { exceedsMaxDecimals, isPartialNumericInput } from 'utils/decimalValidation'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import {
  closeCreateForm,
  deleteNodeRequested,
  renameRequested,
  setDraftMaterial,
  setDraftName,
  setDraftValue,
  updateObjectRequested
} from './actions'
import messages from './messages'
import { isObjectFormValid, resolveObjectFormByType, validateFieldValue } from './propertyBlueprint'
import reducer from './reducer'
import saga from './saga'
import {
  selectCreateDraft,
  selectCreateDraftNonce,
  selectDetailsById,
  selectNodesById
} from './selectors'
import type { CreateDraft } from './types'
import { validateGroupName } from './validation'

// Name uniqueness is enforced by the backend on Save, so we don't scan every
// geometry per keystroke. The empty set makes validateGroupName's uniqueness
// branch a no-op, leaving the cheap instant rules: non-empty + ≤20 characters.
const NO_NAME_CONFLICTS = new Set<string>()

// Raw-string equality over the union of both maps' keys (a missing key reads as
// ''). Drives the Save button's dirty check: any field whose current value
// differs from the loaded/last-saved baseline makes the form dirty.
function sameValues(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if ((a[k] ?? '') !== (b[k] ?? '')) return false
  }
  return true
}

// The right-panel Properties form for editing an object: +Ground creates the
// object and opens this form populated from the persisted values, and clicking a
// ground opens it populated from a GET. Save PATCHes ONLY the property fields;
// the name has its own blur-to-rename path (so Save concerns the fields, not the
// name). The name-row trash discards a brand-new object or deletes an existing
// one. Renders nothing when there is no active draft. Injects the geometry slice
// so it works mounted in the RightPanel independently of the LeftPanel's
// <Geometry />. Keyed by the open-nonce so touched/submitted state resets when a
// different object opens.
export function ObjectPropertiesForm(): React.JSX.Element | null {
  useInjectReducer({ key: 'geometry', reducer: reducer as Reducer })
  useInjectSaga({ key: 'geometry', saga })

  const draft = useSelector(selectCreateDraft)
  const draftNonce = useSelector(selectCreateDraftNonce)
  if (!draft) return null
  return <DraftForm key={draftNonce} draft={draft} />
}

function DraftForm({ draft }: { draft: CreateDraft }): React.JSX.Element {
  const dispatch = useDispatch()
  const projectId = useSelector(selectActiveProjectId)
  const scenarioId = useSelector(selectActiveScenarioId)
  const objectTypes = useSelector(selectAllObjectTypes)
  const materialTypes = useSelector(selectAllMaterialTypes)
  const nodesById = useSelector(selectNodesById)
  const detailsById = useSelector(selectDetailsById)

  // The form's object was removed from the tree (deleted via the left panel)
  // while this form was open. It no longer exists on the backend, so editing /
  // saving it would 404 — lock the form down to a read-only "deleted" state and
  // let the user only dismiss it.
  const objectDeleted = !nodesById[draft.objectId]

  // Track which fields have been touched so "Required" errors only appear after
  // interaction rather than on first open.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  // Transient keystroke-guard errors (non-numeric / >7 decimals), keyed by
  // property. The offending keystroke is rejected before it reaches the draft,
  // so this lives in local state — not the Redux value — and clears on blur.
  // Mirrors Weather's CellInput guard, reusing the same decimalValidation util.
  const [guardErrors, setGuardErrors] = React.useState<Record<string, string | null>>({})
  // The name is read-only until the pencil is tapped (spec: "edit icon which
  // should be tapped only to edit the name"); the trash icon's confirmation lives
  // here too (saved objects confirm before delete; brand-new ones discard).
  const [nameEditing, setNameEditing] = React.useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  const nameInputRef = React.useRef<HTMLInputElement>(null)

  // Focus the name field the moment the pencil unlocks it (it's read-only until
  // then, so we can't focus in the same click handler before the re-render).
  React.useEffect(() => {
    if (nameEditing) nameInputRef.current?.focus()
  }, [nameEditing])

  const objectType = objectTypes.find((o) => o.id === draft.objectTypeId)
  const { groups } = resolveObjectFormByType(objectType)
  const fieldsValid = isObjectFormValid(groups, draft.values)
  // The name error shown below the name field: the instant rules (non-empty,
  // ≤20 chars) win, falling back to the backend rename rejection (e.g. a
  // duplicate) carried on the draft. Both stay scoped to this form — neither
  // leaks onto the left tree row. Uniqueness is left to the backend, which is
  // why a duplicate only surfaces after a rename round-trip.
  const nameError = validateGroupName(draft.name, NO_NAME_CONFLICTS) ?? draft.nameError
  // Save gates on the property fields only — the name persists on its own blur
  // path, so a name error never blocks saving field edits.
  const valid = fieldsValid

  // Save is enabled only once the form differs from its loaded/last-saved
  // baseline. The baseline is the cached object detail (values) + the node's
  // persisted name; material has no persisted baseline yet, so any selection
  // counts as a change. Editing back to the original values disables Save again.
  const original = detailsById[draft.objectId]
  const node = nodesById[draft.objectId]
  const valuesDirty = !original || !sameValues(draft.values, original.values)
  const materialDirty = draft.materialId != null
  // Name changes are excluded — Save is field-only; the name commits on blur.
  const dirty = valuesDirty || materialDirty

  // Block the keystroke when the in-progress value isn't numeric, or would add
  // an 8th decimal place — surfacing the matching message instead of storing it.
  const handleFieldChange = (property: string, next: string): void => {
    if (!isPartialNumericInput(next)) {
      setGuardErrors((g) => ({ ...g, [property]: messages.inputNotSupported }))
      return
    }
    if (exceedsMaxDecimals(next)) {
      setGuardErrors((g) => ({ ...g, [property]: messages.decimalLimit }))
      return
    }
    if (guardErrors[property]) setGuardErrors((g) => ({ ...g, [property]: null }))
    dispatch(setDraftValue(property, next))
  }

  const handleFieldBlur = (property: string): void => {
    // Drop the transient guard error; committed-value validation takes over.
    if (guardErrors[property]) setGuardErrors((g) => ({ ...g, [property]: null }))
    setTouched((t) => ({ ...t, [property]: true }))
  }

  const handleNameChange = (next: string): void => {
    // setDraftName also clears the draft's stale rename error in the reducer, so
    // a prior duplicate rejection doesn't linger as the user types a fresh name.
    dispatch(setDraftName(next))
  }

  const handleNameBlur = (): void => {
    setNameEditing(false)
    if (
      projectId &&
      scenarioId &&
      node &&
      draft.name !== node.name &&
      validateGroupName(draft.name, NO_NAME_CONFLICTS) == null
    ) {
      dispatch(renameRequested(projectId, scenarioId, draft.objectId, draft.name))
    }
  }

  const onSave = (): void => {
    // Save is disabled while the form is invalid; this guard is defensive.
    if (!valid || objectDeleted || !projectId || !scenarioId) return
    dispatch(updateObjectRequested(projectId, scenarioId))
  }

  // Trash icon. Always confirm first — for both brand-new (in-progress) and
  // already-saved grounds — so a stray tap can't silently wipe a geometry, and
  // the delete is always an explicit, visible action rather than an instant
  // close. Confirming runs performDelete (delete + close the panel).
  const onDeleteClick = (): void => {
    if (objectDeleted) return
    setConfirmDeleteOpen(true)
  }

  const performDelete = (): void => {
    if (!objectDeleted && projectId && scenarioId) {
      dispatch(deleteNodeRequested(projectId, scenarioId, draft.objectId))
    }
    setConfirmDeleteOpen(false)
    dispatch(closeCreateForm())
  }

  return (
    // Hug content with a 10px vertical rhythm (Figma: Height Hug, Gap 10px) so
    // the form never needs an inner scrollbar — even with every field showing an
    // error. Overflow on very short windows is absorbed by the RightPanel wrapper.
    <div className="flex flex-col gap-2.5">
      {/* Header: object name with a pencil (unlock to rename) and a trash
          (discard/delete). The name is read-only until the pencil is tapped. */}
      <div>
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <input
              ref={nameInputRef}
              aria-label="Object name"
              aria-invalid={nameError != null}
              value={draft.name}
              readOnly={!nameEditing}
              disabled={objectDeleted}
              onChange={(e) => handleNameChange(e.target.value)}
              onDoubleClick={() => {
                if (!objectDeleted) setNameEditing(true)
              }}
              onBlur={handleNameBlur}
              className={`w-full rounded border bg-transparent py-0.5 ${
                nameError && !objectDeleted ? 'pl-1 pr-7' : 'px-1'
              } text-sm font-medium text-neutral-100 outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                !nameEditing ? 'cursor-default ' : ''
              }${
                nameError
                  ? 'border-red-500'
                  : nameEditing
                    ? 'border-neutral-500'
                    : 'border-transparent hover:border-app-border'
              }`}
            />
            {nameError && !objectDeleted && (
              <Tooltip
                text={nameError}
                ariaLabel={`Validation error: ${nameError}`}
                place="top"
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              >
                <img src={infoIcon} alt="" className="h-4 w-4" />
              </Tooltip>
            )}
          </div>
          <button
            type="button"
            aria-label="Edit name"
            disabled={objectDeleted}
            onClick={() => setNameEditing(true)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <img src={pencilIcon} alt="" aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Delete geometry"
            disabled={objectDeleted}
            onClick={onDeleteClick}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <img src={deleteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* The object was deleted from the tree while this form was open. */}
      {objectDeleted && (
        <p className="form-error-text" role="alert">
          This geometry was deleted. Close the panel.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {groups.map((group, gi) => (
          <div key={group.heading ?? `group-${gi}`}>
            {group.heading && (
              <p className="mb-1.5 text-[14px] font-medium leading-[20px] tracking-normal text-[#D3D3D3]">{group.heading}</p>
            )}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${group.columns}, minmax(0, 1fr))` }}
            >
              {group.fields.map((field) => {
                const value = draft.values[field.property] ?? ''
                // An error surfaces as soon as the field has any value (so it
                // fires on the first keystroke, e.g. typing "-") or once it has
                // been touched. Save stays disabled while any field is invalid.
                const showError = touched[field.property] === true || value !== ''
                // A live keystroke-guard error wins over committed-value
                // validation (the rejected character never reached the value).
                const error = guardErrors[field.property] ?? (showError ? validateFieldValue(field, value) : null)
                return (
                  <FormField
                    key={field.property}
                    labelProps={{
                      label: field.label,
                      // The group heading is the visible label (Figma); the
                      // field name shows as the input placeholder. The label is
                      // kept sr-only so the input still has an accessible name.
                      hideLabel: true,
                      optional: !field.required
                    }}
                    inputProps={{
                      name: field.property,
                      value,
                      placeholder: field.label,
                      error: error ?? undefined,
                      // Surface validation as an in-cell info-icon tooltip
                      // (Weather's CellInput pattern) instead of a text line.
                      errorAsTooltip: true,
                      disabled: objectDeleted,
                      inputClassName: 'bg-[#121212]',
                      onChange: (e) => handleFieldChange(field.property, e.target.value),
                      onBlur: () => handleFieldBlur(field.property)
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {/* Material picker — populated from the material-types catalog. Selection
            is held in the draft but not yet sent (materials wiring is pending the
            materials-instance flow); the create payload sends an empty list.
            Heading + sr-only label match the group pattern above. */}
        <div>
          <p className="mb-1.5 text-[14px] font-medium leading-[20px] tracking-normal text-[#D3D3D3]">Select Material</p>
          <FormField
            labelProps={{ label: 'Select Material', hideLabel: true, optional: true }}
            inputProps={{
              name: 'material',
              value: draft.materialId == null ? '' : String(draft.materialId),
              placeholder: 'Select',
              disabled: objectDeleted,
              inputClassName: 'bg-[#121212]',
              options: materialTypes.map((m) => ({ value: String(m.id), label: m.materialtype })),
              onChange: (e) =>
                dispatch(setDraftMaterial(e.target.value === '' ? null : Number(e.target.value))),
              onBlur: () => {}
            }}
          />
        </div>

        {draft.saveError && !objectDeleted && <p className="form-error-text">{draft.saveError}</p>}
      </div>

      {/* Actions — a single full-width Save (Figma). Discard/delete lives in the
          name-row trash icon. When the object was deleted out from under the form
          there's nothing to save, so only a Close remains. */}
      {objectDeleted ? (
        <button
          type="button"
          onClick={() => dispatch(closeCreateForm())}
          className="h-9 w-full rounded border border-app-border text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Close
        </button>
      ) : (
        <button
          type="button"
          onClick={onSave}
          disabled={draft.saving || !dirty || !valid}
          className="h-9 w-full rounded bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {draft.saving ? 'Saving…' : 'Save'}
        </button>
      )}

      <Dialog
        isOpen={confirmDeleteOpen}
        title={messages.deleteTitle}
        onClose={() => setConfirmDeleteOpen(false)}
      >
        <h3 className="text-base font-medium text-white">
          {messages.deleteHeading(draft.name)}
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

export default ObjectPropertiesForm
