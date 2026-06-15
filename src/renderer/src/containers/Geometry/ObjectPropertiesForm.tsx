import FormField from '@renderer/components/FormField'
import {
  selectActiveProjectId,
  selectActiveScenarioId,
  selectAllMaterialTypes,
  selectAllObjectTypes
} from 'containers/ProjectScreen/selectors'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import {
  exceedsMaxDecimals,
  isPartialNumericInput,
  VALIDATION_MESSAGES
} from 'utils/decimalValidation'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import {
  closeCreateForm,
  deleteNodeRequested,
  setDraftMaterial,
  setDraftName,
  setDraftValue,
  updateObjectRequested
} from './actions'
import { isObjectFormValid, resolveObjectFormByType, validateFieldValue } from './propertyBlueprint'
import reducer from './reducer'
import saga from './saga'
import { selectCreateDraft, selectCreateDraftNonce, selectNodesById } from './selectors'
import type { CreateDraft } from './types'
import { validateGroupName } from './validation'

// Name uniqueness is enforced by the backend on Save, so we don't scan every
// geometry per keystroke. The empty set makes validateGroupName's uniqueness
// branch a no-op, leaving the cheap instant rules: non-empty + ≤20 characters.
const NO_NAME_CONFLICTS = new Set<string>()

// The right-panel Properties form for editing an object: +Ground creates the
// object and opens this form populated from the persisted values, and clicking a
// ground opens it populated from a GET. Save PATCHes properties (and renames if
// the name changed); Cancel DELETEs a brand-new object or just closes an existing
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

  // The form's object was removed from the tree (deleted via the left panel)
  // while this form was open. It no longer exists on the backend, so editing /
  // saving it would 404 — lock the form down to a read-only "deleted" state and
  // let the user only dismiss it.
  const objectDeleted = !nodesById[draft.objectId]

  // Track which fields have been touched, plus whether Save was attempted, so
  // "Required" errors only appear after interaction rather than on first open.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = React.useState(false)
  // Transient keystroke-guard errors (non-numeric / >7 decimals), keyed by
  // property. The offending keystroke is rejected before it reaches the draft,
  // so this lives in local state — not the Redux value — and clears on blur.
  // Mirrors Weather's CellInput guard, reusing the same decimalValidation util.
  const [guardErrors, setGuardErrors] = React.useState<Record<string, string | null>>({})

  const objectType = objectTypes.find((o) => o.id === draft.objectTypeId)
  const { groups } = resolveObjectFormByType(objectType)
  const fieldsValid = isObjectFormValid(groups, draft.values)
  // Instant name rules (non-empty, ≤20 chars); uniqueness is left to the backend.
  const nameError = validateGroupName(draft.name, NO_NAME_CONFLICTS)
  const valid = fieldsValid && nameError == null

  // Block the keystroke when the in-progress value isn't numeric, or would add
  // an 8th decimal place — surfacing the matching message instead of storing it.
  const handleFieldChange = (property: string, next: string): void => {
    // Editing dismisses the post-Save "Fix the highlighted fields…" summary so
    // it only ever appears in direct response to a Save click, not on every
    // subsequent keystroke that happens to be invalid.
    if (submitted) setSubmitted(false)
    if (!isPartialNumericInput(next)) {
      setGuardErrors((g) => ({ ...g, [property]: VALIDATION_MESSAGES.NUMERIC_ONLY }))
      return
    }
    if (exceedsMaxDecimals(next)) {
      setGuardErrors((g) => ({ ...g, [property]: VALIDATION_MESSAGES.MANUAL_INPUT }))
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

  const onSave = (): void => {
    setSubmitted(true)
    if (!valid || objectDeleted || !projectId || !scenarioId) return
    dispatch(updateObjectRequested(projectId, scenarioId))
  }

  // A freshly-created object (isNew) is discarded with a DELETE (reuses the
  // delete flow); an existing object opened by clicking a ground just closes.
  // If the object was already deleted from the tree, there's nothing to remove —
  // just dismiss the form.
  const onCancel = (): void => {
    if (draft.isNew && !objectDeleted && projectId && scenarioId) {
      dispatch(deleteNodeRequested(projectId, scenarioId, draft.objectId))
    }
    dispatch(closeCreateForm())
  }

  return (
    // Hug content with a 10px vertical rhythm (Figma: Height Hug, Gap 10px) so
    // the form never needs an inner scrollbar — even with every field showing an
    // error. Overflow on very short windows is absorbed by the RightPanel wrapper.
    <div className="flex flex-col gap-2.5">
      {/* Header: editable object name (persisted via the rename endpoint on Save) */}
      <div>
        <input
          aria-label="Object name"
          aria-invalid={nameError != null}
          value={draft.name}
          disabled={objectDeleted}
          onChange={(e) => dispatch(setDraftName(e.target.value))}
          className={`w-full rounded border bg-transparent px-1 text-sm font-medium text-neutral-100 outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            nameError
              ? 'border-red-500'
              : 'border-transparent hover:border-app-border focus:border-neutral-500'
          }`}
        />
        {nameError && !objectDeleted && <p className="form-error-text mt-1">{nameError}</p>}
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
              <p className="mb-1.5 text-[12px] text-[#D3D3D3]">{group.heading}</p>
            )}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${group.columns}, minmax(0, 1fr))` }}
            >
              {group.fields.map((field) => {
                const value = draft.values[field.property] ?? ''
                // Match the app-wide trigger (see AddColumnDialog / HomePage):
                // an error surfaces as soon as the field has any value (so it
                // fires on the first keystroke, e.g. typing "-"), once it has
                // been touched, or after a Save attempt (catches empty required).
                const showError = submitted || touched[field.property] === true || value !== ''
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
                      disabled: objectDeleted,
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
          <p className="mb-1.5 text-[12px] text-[#D3D3D3]">Select Material</p>
          <FormField
            labelProps={{ label: 'Select Material', hideLabel: true, optional: true }}
            inputProps={{
              name: 'material',
              value: draft.materialId == null ? '' : String(draft.materialId),
              placeholder: 'Select',
              disabled: objectDeleted,
              options: materialTypes.map((m) => ({ value: String(m.id), label: m.materialtype })),
              onChange: (e) =>
                dispatch(setDraftMaterial(e.target.value === '' ? null : Number(e.target.value))),
              onBlur: () => {}
            }}
          />
        </div>

        {submitted && !valid && !objectDeleted && (
          <p className="form-error-text">Fix the highlighted fields before saving.</p>
        )}
        {draft.saveError && !objectDeleted && <p className="form-error-text">{draft.saveError}</p>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={draft.saving}
          className="h-9 rounded border border-app-border px-4 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          {draft.isNew && !objectDeleted ? 'Cancel' : 'Close'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={draft.saving || objectDeleted}
          className="h-9 flex-1 rounded bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {draft.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default ObjectPropertiesForm
