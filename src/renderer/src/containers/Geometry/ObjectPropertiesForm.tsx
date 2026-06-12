import {
  selectActiveProjectId,
  selectActiveScenarioId,
  selectAllMaterialTypes,
  selectAllObjectTypes
} from 'containers/ProjectScreen/selectors'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import {
  closeCreateForm,
  createObjectRequested,
  setDraftMaterial,
  setDraftName,
  setDraftValue
} from './actions'
import {
  isObjectFormValid,
  resolveObjectFormByType,
  validateFieldValue,
  type ResolvedFormField
} from './propertyBlueprint'
import reducer from './reducer'
import saga from './saga'
import { selectCreateDraft } from './selectors'
import type { CreateDraft } from './types'

// One field cell: the catalog property's short label as the placeholder, the
// draft value as the input, and an inline error once the field is touched or a
// Save has been attempted. Numeric — the backend stores all object properties
// as numbers.
function FieldInput({
  field,
  value,
  showError,
  onChange,
  onBlur
}: {
  field: ResolvedFormField
  value: string
  showError: boolean
  onChange: (value: string) => void
  onBlur: () => void
}): React.JSX.Element {
  const error = showError ? validateFieldValue(field, value) : null
  const borderClass = error ? 'border-red-500' : 'border-app-border focus:border-neutral-500'
  return (
    <div className="min-w-0">
      <input
        aria-label={field.label}
        aria-invalid={!!error}
        title={field.description}
        value={value}
        inputMode="decimal"
        placeholder={field.label}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`h-9 w-full rounded border ${borderClass} bg-dark px-3 text-sm text-white outline-none`}
      />
      {error && <p className="form-error-text mt-1 text-[11px]">{error}</p>}
    </div>
  )
}

// The right-panel Properties form for creating an object (Plan B): +Ground opens
// an empty form here; Save POSTs. Renders nothing when there is no active draft.
// Injects the geometry slice so it works mounted in the RightPanel independently
// of the LeftPanel's <Geometry />. The actual form is a child keyed by draft
// identity so its touched/submitted state resets cleanly when a new draft opens.
export function ObjectPropertiesForm(): React.JSX.Element | null {
  useInjectReducer({ key: 'geometry', reducer: reducer as Reducer })
  useInjectSaga({ key: 'geometry', saga })

  const draft = useSelector(selectCreateDraft)
  if (!draft) return null
  return <DraftForm key={`${draft.objectTypeId}:${draft.name}`} draft={draft} />
}

function DraftForm({ draft }: { draft: CreateDraft }): React.JSX.Element {
  const dispatch = useDispatch()
  const projectId = useSelector(selectActiveProjectId)
  const scenarioId = useSelector(selectActiveScenarioId)
  const objectTypes = useSelector(selectAllObjectTypes)
  const materialTypes = useSelector(selectAllMaterialTypes)

  // Track which fields have been touched, plus whether Save was attempted, so
  // "Required" errors only appear after interaction rather than on first open.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = React.useState(false)

  const objectType = objectTypes.find((o) => o.id === draft.objectTypeId)
  const { groups } = resolveObjectFormByType(objectType)
  const valid = isObjectFormValid(groups, draft.values)

  const onSave = (): void => {
    setSubmitted(true)
    if (!valid || !projectId || !scenarioId) return
    dispatch(createObjectRequested(projectId, scenarioId))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: editable object name */}
      <div className="mb-3 shrink-0">
        <input
          aria-label="Object name"
          value={draft.name}
          onChange={(e) => dispatch(setDraftName(e.target.value))}
          className="w-full rounded border border-transparent bg-transparent px-1 text-sm font-medium text-neutral-100 outline-none hover:border-app-border focus:border-neutral-500"
        />
      </div>

      <div className="scrollbar-custom-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {groups.map((group, gi) => (
          <div key={group.heading ?? `group-${gi}`}>
            {group.heading && (
              <p className="mb-1.5 text-[12px] text-[#D3D3D3]">{group.heading}</p>
            )}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${group.columns}, minmax(0, 1fr))` }}
            >
              {group.fields.map((field) => (
                <FieldInput
                  key={field.property}
                  field={field}
                  value={draft.values[field.property] ?? ''}
                  showError={submitted || touched[field.property] === true}
                  onChange={(value) => dispatch(setDraftValue(field.property, value))}
                  onBlur={() => setTouched((t) => ({ ...t, [field.property]: true }))}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Material picker — populated from the material-types catalog. Selection
            is held in the draft but not yet sent (materials wiring is pending the
            materials-instance flow); the create payload sends an empty list. */}
        <div>
          <p className="mb-1.5 text-[12px] text-[#D3D3D3]">Select Material</p>
          <select
            aria-label="Select Material"
            value={draft.materialId ?? ''}
            onChange={(e) =>
              dispatch(setDraftMaterial(e.target.value === '' ? null : Number(e.target.value)))
            }
            className="h-9 w-full rounded border border-app-border bg-dark px-3 text-sm text-white outline-none focus:border-neutral-500"
          >
            <option value="" style={{ backgroundColor: '#181a1f', color: '#ffffff' }}>
              Select
            </option>
            {materialTypes.map((m) => (
              <option
                key={m.id}
                value={m.id}
                style={{ backgroundColor: '#181a1f', color: '#ffffff' }}
              >
                {m.materialtype}
              </option>
            ))}
          </select>
        </div>

        {submitted && !valid && (
          <p className="form-error-text">Fix the highlighted fields before saving.</p>
        )}
        {draft.saveError && <p className="form-error-text">{draft.saveError}</p>}
      </div>

      {/* Actions */}
      <div className="mt-3 flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => dispatch(closeCreateForm())}
          disabled={draft.saving}
          className="h-9 rounded border border-app-border px-4 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={draft.saving}
          className="h-9 flex-1 rounded bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {draft.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default ObjectPropertiesForm
