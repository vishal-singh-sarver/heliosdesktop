import deleteIcon from '@renderer/assets/delete.svg'
import pencilIcon from '@renderer/assets/pencil.svg'
import Dialog from '@renderer/components/Dialog'
import FormField from '@renderer/components/FormField'
import { loadMaterialDetailRequested } from 'containers/Materials/actions'
import { resolveParameterGroups } from 'containers/Materials/materialBlueprint'
import materialsReducer from 'containers/Materials/reducer'
import materialsSaga from 'containers/Materials/saga'
import { selectAllMaterials, selectMaterialDetailsById } from 'containers/Materials/selectors'
import {
  selectActiveProjectId,
  selectActiveScenarioId,
  selectAllMaterialTypes,
  selectAllObjectTypes
} from 'containers/ProjectScreen/selectors'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import React from 'react'
import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { exceedsMaxDecimals, isPartialNumericInput } from 'utils/decimalValidation'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import {
  closeCreateForm,
  deleteNodeRequested,
  renameRequested,
  setDraftName,
  setDraftValue,
  updateObjectRequested,
  addDraftMaterial
} from './actions'
import MaterialPropertiesPopup, { type MaterialDetailSection } from './MaterialPropertiesPopup'
import messages from './messages'
import {
  humanizeProperty,
  isObjectFormValid,
  resolveObjectFormByType,
  validateFieldValue
} from './propertyBlueprint'
import reducer from './reducer'
import saga from './saga'
import SelectMaterialsPopup from './SelectMaterialsPopup'
import {
  selectCreateDraft,
  selectCreateDraftNonce,
  selectDetailsById,
  selectNodesById
} from './selectors'
import type { CreateDraft, DraftMaterialGroup } from './types'
import { validateGroupName } from './validation'

// Name uniqueness is enforced by the backend on Save, so we don't scan every
// geometry per keystroke. The empty set makes validateGroupName's uniqueness
// branch a no-op, leaving the cheap instant rules: non-empty + ≤20 characters.
const NO_NAME_CONFLICTS = new Set<string>()

// The read-only material properties popup's footprint, used to place it. The
// height is the Figma CAP, not a fixed height — the popup itself shrinks to the
// viewport on a short window, so anything positioning it must clamp against
// whichever is smaller (see openDetailPopup).
const DETAIL_POPUP_WIDTH = 370
const DETAIL_POPUP_MAX_HEIGHT = 866
// The breathing room every popup on this panel keeps from the panel and the
// viewport edges.
const POPUP_GAP = 8

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

// Texture Repeat tiles across the ground surface, so each repeat count can't
// exceed the matching Ground Resolution the user entered: R (texture_x) ≤ Width
// (resolution_x) and C (texture_y) ≤ Height (resolution_y). Purely frontend — it
// reads the resolution from the form's current values (no backend call). Returns
// property → "Invalid Input" for any texture field that exceeds its cap. The
// check is skipped when either value is blank or non-numeric (per-field
// validation surfaces those).
const TEXTURE_RESOLUTION_CAP: Record<string, string> = {
  texture_x: 'resolution_x',
  texture_y: 'resolution_y'
}

function textureDepErrors(values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [texProp, resProp] of Object.entries(TEXTURE_RESOLUTION_CAP)) {
    const texRaw = (values[texProp] ?? '').trim()
    const resRaw = (values[resProp] ?? '').trim()
    if (texRaw === '' || resRaw === '') continue
    const tex = Number(texRaw)
    const res = Number(resRaw)
    if (Number.isFinite(tex) && Number.isFinite(res) && tex > res) {
      errors[texProp] = messages.textureExceedsResolution(res)
    }
  }
  return errors
}

const asDisplay = (v: number | string | boolean | null | undefined): string =>
  v == null ? '' : String(v)

// One material within a group, as the popup needs it — from the object GET's
// baseline (carries `materialTypeName`) OR the Materials library detail cache
// (name absent, resolved from the catalog).
export interface PopupMaterialMember {
  materialTypeId: number
  materialTypeName?: string
  properties: Record<string, number | string | boolean | null>
}

// Build the read-only material popup's sections from a group's members and the
// material-type catalog. Each member → one section; its property values are
// grouped/labelled via the shared material blueprint (same grouping the editable
// Material form uses). Tolerant: a member whose type isn't in the catalog still
// lists its raw property values under one "General" group so nothing is hidden.
// [] members → [], which the popup renders as its empty state.
export function buildMaterialSections(
  members: PopupMaterialMember[],
  materialTypes: MaterialTypeDef[]
): MaterialDetailSection[] {
  return members.map((member) => {
    const type = materialTypes.find((t) => t.id === member.materialTypeId)
    const typeName = member.materialTypeName ?? type?.materialtype ?? String(member.materialTypeId)
    if (type) {
      const groups = resolveParameterGroups([type]).map((pg) => ({
        group: pg.group,
        label: pg.label,
        rows: pg.fields.map((f) => ({
          property: f.property,
          label: f.label,
          value: asDisplay(member.properties[f.property])
        }))
      }))
      return { typeId: member.materialTypeId, typeName, groups }
    }
    const rows = Object.entries(member.properties).map(([property, value]) => ({
      property,
      label: humanizeProperty(property),
      value: asDisplay(value)
    }))
    return {
      typeId: member.materialTypeId,
      typeName,
      groups: rows.length ? [{ group: 'general', label: 'General', rows }] : []
    }
  })
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
  // The Materials slice + saga back the read-only material properties popup (the
  // library detail cache + its on-demand GET), so the form resolves a picked
  // material's properties even when the left panel's <Materials/> isn't mounted.
  // Injection dedupes by key, so this is a no-op when <Materials/> is present.
  useInjectReducer({ key: 'materials', reducer: materialsReducer as Reducer })
  useInjectSaga({ key: 'materials', saga: materialsSaga })

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
  const nodesById = useSelector(selectNodesById)
  const detailsById = useSelector(selectDetailsById)
  // Saved-library materials (already loaded by the left panel's <Materials/>).
  const libraryMaterials = useSelector(selectAllMaterials)
  // Material-type catalog — resolves an assigned material's property labels for
  // the read-only popup.
  const materialTypes = useSelector(selectAllMaterialTypes)
  // Material-library group details (members + property values), cached by the
  // Materials container. Reused so a picked material's properties resolve even
  // before the ground is saved.
  const materialDetailsById = useSelector(selectMaterialDetailsById)

  // Picking a material appends its GROUP to the draft (deduped in the reducer),
  // so Save can PATCH it and the selection survives re-renders and a re-open.
  const handleSelectMaterial = (m: { id: string; name: string }): void => {
    dispatch(addDraftMaterial(m.id, m.name))
  }

  // Resolve a group's members for the read-only popup: the object GET's baseline
  // (already carries per-type properties) wins; else the Materials library detail
  // cache; else undefined = not loaded yet (openDetailPopup fetches it).
  const membersFor = (group: DraftMaterialGroup): PopupMaterialMember[] | undefined => {
    if (group.materials) return group.materials
    const detail = materialDetailsById[group.groupId]
    if (detail) {
      return detail.members.map((m) => ({
        materialTypeId: m.materialTypeId,
        properties: m.properties
      }))
    }
    return undefined
  }

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

  // "Select Materials" popup — anchored just outside the right panel's left edge,
  // vertically following the Select button, clamped to stay on-screen. Popup size
  // is hardcoded: 240 wide × 343 tall. popupCoords null = closed.
  const selectBtnRef = React.useRef<HTMLButtonElement>(null)
  const [popupCoords, setPopupCoords] = React.useState<{ top: number; left: number } | null>(null)
  const materialPopupOpen = popupCoords !== null
  const openMaterialPopup = (): void => {
    const btn = selectBtnRef.current
    if (!btn) return
    closeDetailPopup()
    const panel = btn.closest('aside')?.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    const leftAnchor = panel ? panel.left : btnRect.left
    setPopupCoords({
      top: Math.max(8, Math.min(btnRect.top, window.innerHeight - 343 - 8)),
      left: leftAnchor - 240 - 8
    })
  }
  const closeMaterialPopup = (): void => setPopupCoords(null)

  // Read-only material properties popup — opened by clicking a picked material's
  // name. One nullable object rather than separate coords/material state: null =
  // closed (the same convention as popupCoords above), and the material can't
  // desync from the position it was measured against. Measured once on open, so
  // it doesn't follow a scroll — matching the Select popup and the kebab menu.
  const [detailPopup, setDetailPopup] = React.useState<{
    material: DraftMaterialGroup
    top: number
    left: number
  } | null>(null)
  const closeDetailPopup = (): void => setDetailPopup(null)
  const openDetailPopup = (row: HTMLElement, material: DraftMaterialGroup): void => {
    // Both popups sit on the same strip beside the panel and each lays down its
    // own full-screen outside-click overlay — two open at once would stack
    // overlays over each other's contents. So they're mutually exclusive.
    closeMaterialPopup()
    // Fetch this material's properties if we don't already have them (a freshly
    // picked group carries none until the library detail loads). The Materials
    // container caches the result, so the popup fills in on the next render.
    if (!membersFor(material)) dispatch(loadMaterialDetailRequested(material.groupId))
    const panel = row.closest('aside')?.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const leftAnchor = panel ? panel.left : rowRect.left
    // Clamp against the height the popup can actually reach, not the 866 cap: on
    // a short window it shrinks to the viewport (see MaterialPropertiesPopup's
    // max-height), and clamping against 866 there would pin it off-screen.
    const height = Math.min(DETAIL_POPUP_MAX_HEIGHT, window.innerHeight - POPUP_GAP * 2)
    setDetailPopup({
      material,
      top: Math.max(POPUP_GAP, Math.min(rowRect.top, window.innerHeight - height - POPUP_GAP)),
      // 8px left of the whole panel, like the Select popup — but clamped: at 370
      // wide an unclamped left goes negative on a window under ~720px and walks
      // off the left edge. Clamping can slide it over the panel instead; the
      // portal renders at z-50, above it.
      left: Math.max(POPUP_GAP, leftAnchor - DETAIL_POPUP_WIDTH - POPUP_GAP)
    })
  }

  // Focus the name field the moment the pencil unlocks it (it's read-only until
  // then, so we can't focus in the same click handler before the re-render).
  React.useEffect(() => {
    if (nameEditing) nameInputRef.current?.focus()
  }, [nameEditing])

  const objectType = objectTypes.find((o) => o.id === draft.objectTypeId)
  const { groups } = resolveObjectFormByType(objectType)
  const fieldsValid = isObjectFormValid(groups, draft.values)

  // Cross-field rule: texture repeat counts must not exceed the ground
  // resolution they tile across (see textureDepErrors). Keyed by property so the
  // matching field can render its inline error.
  const depErrors = textureDepErrors(draft.values)

  // The name error shown below the name field: the instant rules (non-empty,
  // ≤20 chars) win, falling back to the backend rename rejection (e.g. a
  // duplicate) carried on the draft. Both stay scoped to this form — neither
  // leaks onto the left tree row. Uniqueness is left to the backend, which is
  // why a duplicate only surfaces after a rename round-trip.
  const nameError = validateGroupName(draft.name, NO_NAME_CONFLICTS) ?? draft.nameError
  // Save gates on the property fields only — the name persists on its own blur
  // path, so a name error never blocks saving field edits. Cross-field
  // dependency violations (texture > resolution) block Save too.
  const valid = fieldsValid && Object.keys(depErrors).length === 0

  // Save is enabled once the form differs from its loaded/last-saved baseline:
  // any changed property value, or a picked material not already assigned on the
  // backend (materialBaseline, seeded from the GET). Editing back to the original
  // values / adding no new material disables Save again.
  const original = detailsById[draft.objectId]
  const node = nodesById[draft.objectId]
  const valuesDirty = !original || !sameValues(draft.values, original.values)
  const materialDirty = draft.materials.some((m) => !draft.materialBaseline.includes(m.groupId))
  // Name changes are excluded — Save is field-only; the name commits on blur.
  const dirty = valuesDirty || materialDirty

  // Block the keystroke when the in-progress value isn't numeric, or would add
  // an 8th decimal place — surfacing the matching message instead of storing it.
  const handleFieldChange = (property: string, next: string,  isInteger: boolean): void => {
    if (!isPartialNumericInput(next)) {
      setGuardErrors((g) => ({ ...g, [property]: messages.inputNotSupported }))
      return
    }

    // Integer fields (e.g. Ground Resolution) take no decimal point — reject the
    // '.' keystroke itself rather than letting "1." commit and silently normalize
    // to a whole number that passes validation.
    if (isInteger && next.includes('.')) {
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
            className={`min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-sm font-medium text-neutral-100 outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
              !nameEditing ? 'cursor-default ' : ''
            }${
              nameError
                ? 'border-red-500'
                : nameEditing
                  ? 'border-neutral-500'
                  : 'border-transparent hover:border-app-border'
            }`}
          />
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
              <p className="mb-1.5 text-[13px] font-medium leading-[20px] tracking-normal text-[#D3D3D3]">{group.heading}</p>
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
                // validation (the rejected character never reached the value),
                // which in turn falls back to a cross-field dependency error
                // (texture > resolution) when the value itself is otherwise valid.
                const error =
                  guardErrors[field.property] ??
                  (showError
                    ? (validateFieldValue(field, value) ?? depErrors[field.property] ?? null)
                    : null)
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
                      inputClassName: 'bg-[#121212]',
                      onChange: (e) =>
                        handleFieldChange(field.property, e.target.value, field.datatype === 'integer'),
                      onBlur: () => handleFieldBlur(field.property)
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {/* Materials row — "Materials" label + a "Select" button that opens the
            material picker (built next). 320×36 row; 58×25 button; bracketed by
            1px #424242 divider lines (border-app-border). */}
        <div className="flex h-9 items-center justify-between border-y border-app-border">
          <p className="text-[13px] font-medium leading-[20px] tracking-normal text-[#D3D3D3]">
            Materials
          </p>
          <button
            ref={selectBtnRef}
            type="button"
            disabled={objectDeleted}
            aria-expanded={materialPopupOpen}
            onClick={() => (materialPopupOpen ? closeMaterialPopup() : openMaterialPopup())}
            className="rounded-[4px] border border-app-border bg-white px-2.5 py-[5px] text-[13px] font-normal leading-[15px] text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select
          </button>
        </div>

        {/* Assigned materials — the GET baseline ∪ freshly-picked groups, listed
            under the Materials row. A bottom divider separates the last material
            from the Save button. Each name opens that material's read-only
            properties popup; a marker flags a library mismatch (stale/drift). */}
        {draft.materials.length > 0 && (
          <div className="flex flex-col border-b border-app-border pb-2">
            {draft.materials.map((m) => (
              <button
                key={m.groupId}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={detailPopup?.material.groupId === m.groupId}
                // currentTarget IS the anchor, measured synchronously here — so a
                // growing list of rows needs no ref map.
                onClick={(e) => openDetailPopup(e.currentTarget, m)}
                className="flex w-full items-center gap-1.5 rounded py-2 text-left text-[13px] leading-[18px] text-white hover:bg-white/5"
              >
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {(m.stale || m.drift) && (
                  <span
                    aria-hidden="true"
                    title={
                      m.stale
                        ? 'This material group was removed from the library'
                        : 'Values differ from the material library'
                    }
                    className="shrink-0 text-amber-400"
                  >
                    •
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* "Select Materials" popup — rendered in a portal so the panel's overflow
            can't clip it; an overlay closes it on outside-click. */}
        {popupCoords &&
          createPortal(
            <>
              <div
                className="fixed inset-0 z-40"
                aria-hidden="true"
                onClick={closeMaterialPopup}
              />
              <div className="fixed z-50" style={{ top: popupCoords.top, left: popupCoords.left }}>
                <SelectMaterialsPopup
                  materials={libraryMaterials.map((m) => ({ id: m.id, name: m.name }))}
                  onSelectMaterial={handleSelectMaterial}
                  onAddNewMaterial={() => {}}
                />
              </div>
            </>,
            document.body
          )}

        {/* An assigned material's read-only properties — its own portal + overlay,
            mirroring the Select popup. Only one of the two is ever open. Sections
            come from the group's members (from the GET); a freshly-picked group
            has none yet, so the popup shows its empty state until the ground is
            reopened. */}
        {detailPopup &&
          createPortal(
            <>
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={closeDetailPopup} />
              <div className="fixed z-50" style={{ top: detailPopup.top, left: detailPopup.left }}>
                <MaterialPropertiesPopup
                  name={detailPopup.material.name}
                  sections={buildMaterialSections(
                    membersFor(detailPopup.material) ?? [],
                    materialTypes
                  )}
                  onClose={closeDetailPopup}
                />
              </div>
            </>,
            document.body
          )}

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
