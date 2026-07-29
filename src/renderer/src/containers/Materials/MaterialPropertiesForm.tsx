import addIcon from '@renderer/assets/add.svg'
import chevronDown from '@renderer/assets/ChevronDownIcon.svg'
import deleteIcon from '@renderer/assets/delete.svg'
import pencilIcon from '@renderer/assets/pencil.svg'
import Dialog from '@renderer/components/Dialog'
import FormField from '@renderer/components/FormField'
import Select from '@renderer/components/Select'
import ToolbarButton from '@renderer/components/ToolbarButton'
import { selectActiveScenarioId, selectAllMaterialTypes } from 'containers/ProjectScreen/selectors'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { exceedsMaxDecimals, isPartialNumericInput } from 'utils/decimalValidation'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import { sameValues } from 'utils/sameValues'
import {
  HIGHLIGHT_CLASSES,
  useScrollIntoViewWhen,
  useTransientHighlight
} from 'utils/useTransientHighlight'
import {
  addParameterGroup,
  deleteMaterialRequested,
  deleteParameterGroupRequested,
  renameMaterialRequested,
  saveParameterGroupRequested,
  setMaterialDraftName,
  setParameterGroupType,
  setParameterGroupValue,
  uploadTextureRequested
} from './actions'
import {
  isMaterialFormValid,
  isRadiationFieldSet,
  isVisualisationComplete,
  isVisualisationFieldSet,
  radiationBandSumViolations,
  readApplySpectral,
  readVisualisationMode,
  resolveParameterGroups,
  SPECTRAL_DATA_PROPERTY,
  TEXTURE_PROPERTY,
  TEXTURE_TOGGLE_PROPERTY,
  toNativeProperties,
  toRadiationProperties,
  toVisualisationProperties,
  USE_RADIATION_BANDS_PROPERTY,
  validateMaterialFieldValue,
  visibleParameterGroups,
  VISUALISATION_CUSTOM_PROPERTIES,
  type ResolvedMaterialField,
  type VisualisationMode
} from './materialBlueprint'
import MaterialRadiationEditor from './MaterialRadiationEditor'
import MaterialVisualisationEditor from './MaterialVisualisationEditor'
import messages from './messages'
import reducer from './reducer'
import saga from './saga'
import { textureServeUrl } from './service'
import {
  selectDeletingIds,
  selectMaterialDraft,
  selectMaterialDraftNonce,
  selectMaterialsById,
  selectOpeningMaterialId
} from './selectors'
import { Spinner } from '@renderer/components/LoadingScreen/Spinner'
import type { MaterialDraft, MaterialParameterGroup } from './types'
import { validateMaterialName } from './validation'

// The right-panel Properties form for a material. The material itself already
// exists on the backend (+Add Materials created it as an empty group), so this
// form builds it up one "Parameter Group" at a time: each card holds ONE material
// type and saves itself — adding that type to the group on its first Save (POST)
// and updating it on every later Save (PATCH). A card's trash removes just that
// material type (DELETE); the header trash deletes the whole material.
export function MaterialPropertiesForm(): React.JSX.Element | null {
  useInjectReducer({ key: 'materials', reducer: reducer as Reducer })
  useInjectSaga({ key: 'materials', saga })

  const draft = useSelector(selectMaterialDraft)
  const draftNonce = useSelector(selectMaterialDraftNonce)
  const openingId = useSelector(selectOpeningMaterialId)

  // A row was clicked and its detail is being fetched (cache miss). Show a spinner
  // rather than leaving the PREVIOUS material on screen with no sign the click
  // registered. Only when opening a DIFFERENT material than the one shown — a
  // re-open of the same one keeps its form up. A cached open never sets openingId
  // long enough to render this.
  if (openingId != null && openingId !== draft?.groupId) {
    return (
      <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
        <Spinner className="h-5 w-5 text-neutral-400" />
        <span className="sr-only">{messages.openingMaterial}</span>
      </div>
    )
  }
  if (!draft) return null
  return <MaterialDraftForm key={draftNonce} draft={draft} />
}

function MaterialDraftForm({ draft }: { draft: MaterialDraft }): React.JSX.Element {
  const dispatch = useDispatch()
  const scenarioId = useSelector(selectActiveScenarioId)
  const materialTypes = useSelector(selectAllMaterialTypes)

  // The name is read-only until the pencil is tapped; the whole-material delete
  // confirmation lives here too.
  const [nameEditing, setNameEditing] = React.useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  // Which cards are expanded (by card id). Adding a card collapses the others so
  // only the new one is open; manual toggles still allow several open at once.
  const [openGroupIds, setOpenGroupIds] = React.useState<Set<number>>(
    () => new Set(draft.groups.map((g) => g.id))
  )
  // The card the + just created — outlined and scrolled to, then cleared. The
  // hook owns the "then cleared" half, on the same timing as the new-row cue in
  // the Materials and Geometry lists.
  const [newCardId, setNewCardId] = React.useState<number | null>(null)
  const highlightedCardId = useTransientHighlight(newCardId, () => setNewCardId(null))
  const nameInputRef = React.useRef<HTMLInputElement>(null)
  // The name as it stands on the BACKEND — the row's, which only changes when a
  // rename is accepted. Blur compares against this so an untouched name is not
  // re-sent. It was previously captured off the draft each time the pencil was
  // clicked, which meant a rejected name became the baseline: retyping the real
  // name then looked like a change and fired a rename to the name it already had.
  const committedName = useSelector(selectMaterialsById)[draft.groupId]?.name ?? draft.name
  // This material's whole-material DELETE is in flight — the header trash locks so
  // a second confirm can't fire a duplicate DELETE.
  const materialDeleting = useSelector(selectDeletingIds).includes(draft.groupId)

  const startNameEdit = (): void => {
    setNameEditing(true)
  }

  const toggleGroup = (id: number): void => {
    setOpenGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openGroup = (id: number): void => {
    setOpenGroupIds((prev) => new Set(prev).add(id))
  }

  const collapseGroup = (id: number): void => {
    setOpenGroupIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  // Picking a type on a collapsed card reveals that type's parameters — but they
  // render inside the card body, which is hidden while collapsed. So expand the
  // card on select, otherwise the fields the user just unlocked stay out of sight.
  const onSelectType = (id: number, typeId: number | null): void => {
    dispatch(setParameterGroupType(id, typeId))
    if (typeId != null) openGroup(id)
  }

  // Each card holds one material type, and a type can appear at most once in the
  // material — so there is no room for more cards than the catalog has types: an
  // extra one could never be given a type. An empty catalog means it hasn't loaded
  // yet, which is not a limit of zero.
  const atTypeLimit = materialTypes.length > 0 && draft.groups.length >= materialTypes.length

  const onAddGroup = (): void => {
    if (atTypeLimit) return
    const newId = draft.nextGroupId
    dispatch(addParameterGroup())
    // Open the new card WITHOUT collapsing the others — a card the user expanded
    // is work in progress, and adding a second one shouldn't hide it.
    setOpenGroupIds((prev) => new Set(prev).add(newId))
    setNewCardId(newId)
  }

  // Focus the name field the moment the pencil unlocks it.
  React.useEffect(() => {
    if (nameEditing) nameInputRef.current?.focus()
  }, [nameEditing])

  // Every catalog material type, by name — each card's Select options.
  const typeOptions = materialTypes.map((t) => ({ value: String(t.id), label: t.materialtype }))

  // A material type can appear at most ONCE in a group (the backend keys each
  // member by material_type_id and rejects a repeat), so a type already chosen in
  // another card is shown disabled in this one's dropdown — the card's own type
  // stays selectable so it keeps showing as the current value.
  const typesUsedByOtherCards = (cardId: number): Set<string> =>
    new Set(
      draft.groups.filter((g) => g.id !== cardId && g.typeId != null).map((g) => String(g.typeId))
    )

  // Only the CHEAP rules run per keystroke here (non-empty, ≤20). Uniqueness is
  // the backend's to enforce on the rename, so this form doesn't pre-empt it — a
  // duplicate surfaces as `draft.nameError` once the PATCH is refused, not while
  // the user is still typing. (The left panel's inline row editor does check
  // locally, against the names it already holds.) Same split as the Geometry
  // right-panel form, which passes an empty set for exactly this reason.
  const NO_NAME_CONFLICTS = React.useMemo(() => new Set<string>(), [])

  // Local rules win; a backend rejection is the fallback once they pass.
  const nameError = validateMaterialName(draft.name, NO_NAME_CONFLICTS) ?? draft.nameError

  const handleNameChange = (next: string): void => {
    dispatch(setMaterialDraftName(next))
  }

  const handleNameBlur = (): void => {
    // The field stays focusable while read-only, so it is blurred just by tabbing
    // through the panel — that is not a rename, and firing the PATCH on it hit the
    // API on every pass. Only a field the pencil actually unlocked can rename, and
    // only when the name really changed.
    if (!nameEditing) return
    setNameEditing(false)
    // An invalid name is not sent: the field re-locks but keeps the text, and the
    // error stays under it, so the user can see what was rejected and why. (The
    // blank name used to be silently reverted, which said nothing at all.)
    if (nameError != null) return
    const next = draft.name.trim()
    if (next === committedName) return
    dispatch(renameMaterialRequested(draft.groupId, next, scenarioId))
  }

  // The header trash — deletes the whole material (group + every member). The
  // form is NOT closed here: the delete is pessimistic, and closing up front left
  // a failed delete with the row still in the list and the panel gone, explaining
  // nothing. REMOVE_MATERIAL (dispatched only on success) closes it — and drops
  // the material's stashed cards, which an eager CLOSE would have re-saved first.
  const performDelete = (): void => {
    if (materialDeleting) return
    dispatch(deleteMaterialRequested(draft.groupId, scenarioId))
    setConfirmDeleteOpen(false)
  }

  const dispatchSave = (
    card: MaterialParameterGroup,
    materialTypeId: number,
    properties: ReturnType<typeof toNativeProperties>,
    // A previously-saved uploaded file this save replaces/removes — deleted from
    // disk after the save succeeds (see the saga). Undefined when nothing changed.
    obsoleteFilePath?: string
  ): void => {
    dispatch(
      saveParameterGroupRequested({
        groupId: draft.groupId,
        cardId: card.id,
        materialTypeId,
        properties,
        saved: card.saved,
        scenarioId,
        obsoleteFilePath
      })
    )
  }

  // The COLOUR / plain save: a Visualiser sends its Custom colour payload
  // (texture_toggle false), every other type sends its plain native properties.
  const handleSaveColour = (card: MaterialParameterGroup): void => {
    const type = materialTypes.find((t) => t.id === card.typeId)
    if (!type) return
    const isVis = isVisualisationFieldSet(resolveParameterGroups([type]).flatMap((g) => g.fields))
    if (isVis) {
      // Clear the texture half in the DRAFT, the mirror of what handleSaveTexture
      // does to the colour half. The payload already omits texture, but the draft
      // is what the reducer snapshots into savedValues and the detail cache — so
      // leaving texture_toggle 'true' here made the card reopen on the Texture tab
      // showing the old image, with the colour just saved nowhere in sight.
      if (readVisualisationMode(card.values) === 'texture') {
        dispatch(setParameterGroupValue(card.id, TEXTURE_TOGGLE_PROPERTY, 'false'))
      }
      if ((card.values[TEXTURE_PROPERTY] ?? '') !== '') {
        dispatch(setParameterGroupValue(card.id, TEXTURE_PROPERTY, ''))
      }
    }
    const properties = isVis
      ? toVisualisationProperties(type, card.values, 'custom')
      : toNativeProperties(type, card.values)
    dispatchSave(card, type.id, properties)
  }

  // The RADIATION save: routes by the "Apply spectral data" toggle (read from the
  // card's values) — manual mode sends the per-band values + use_radiation_bands
  // true; spectral mode sends use_radiation_bands false and drops the bands (the
  // uploaded spectral file, attached separately, supersedes them).
  const handleSaveRadiation = (card: MaterialParameterGroup): void => {
    const type = materialTypes.find((t) => t.id === card.typeId)
    if (!type) return
    const applySpectral = readApplySpectral(card.values)
    // The spectral file being removed (🗑), replaced (new upload) or dropped by
    // switching to manual mode: the last-saved path differs from what this save
    // keeps. Manual mode keeps NO file, so its effective next path is '' — this is
    // what makes a toggle-OFF save delete the file too (the draft still holds the
    // path at this point; the reducer clears it only after success). The save drops
    // the reference, so the saga can then delete it. Undefined when nothing changed.
    const savedSpectral = card.savedValues?.[SPECTRAL_DATA_PROPERTY]
    const nextSpectral = applySpectral ? (card.values[SPECTRAL_DATA_PROPERTY] ?? '') : ''
    const obsoleteFilePath =
      savedSpectral && savedSpectral !== nextSpectral ? savedSpectral : undefined
    dispatchSave(card, type.id, toRadiationProperties(type, card.values, applySpectral), obsoleteFilePath)
  }

  // The Radiation spectral-data upload — reuses the shared file-upload path, keyed
  // by the 'spectral_data' property. Unlike a texture, the endpoint only attaches
  // to an EXISTING member, so the editor gates this on the card already being saved.
  const handleUploadSpectral = (card: MaterialParameterGroup, file: File): void => {
    const type = materialTypes.find((t) => t.id === card.typeId)
    if (!type) return
    dispatch(
      uploadTextureRequested({
        groupId: draft.groupId,
        cardId: card.id,
        materialTypeId: type.id,
        file,
        scenarioId,
        property: SPECTRAL_DATA_PROPERTY
      })
    )
  }

  // The TEXTURE save for a chosen texture path (a highlighted library texture, or
  // the already-stored one when re-saving) — texture_toggle true, colour cleared.
  // The path is reflected in the draft so the cache + reopen show it.
  const handleSaveTexture = (card: MaterialParameterGroup, path: string): void => {
    const type = materialTypes.find((t) => t.id === card.typeId)
    if (!type) return
    dispatch(setParameterGroupValue(card.id, TEXTURE_PROPERTY, path))
    dispatch(setParameterGroupValue(card.id, TEXTURE_TOGGLE_PROPERTY, 'true'))
    for (const key of VISUALISATION_CUSTOM_PROPERTIES) {
      if ((card.values[key] ?? '') !== '') dispatch(setParameterGroupValue(card.id, key, ''))
    }
    dispatchSave(card, type.id, toVisualisationProperties(type, card.values, 'texture', path))
  }

  // The TEXTURE save for a freshly-picked FILE — the upload endpoint persists the
  // member itself (texture mode), so this doesn't go through the normal save path.
  const handleUploadTexture = (card: MaterialParameterGroup, file: File): void => {
    const type = materialTypes.find((t) => t.id === card.typeId)
    if (!type) return
    dispatch(
      uploadTextureRequested({
        groupId: draft.groupId,
        cardId: card.id,
        materialTypeId: type.id,
        file,
        scenarioId
      })
    )
  }

  // A card's trash: remove just this material type from the group (or drop the
  // card outright if it was never saved).
  const handleDeleteGroup = (card: MaterialParameterGroup): void => {
    dispatch(
      deleteParameterGroupRequested({
        groupId: draft.groupId,
        cardId: card.id,
        materialTypeId: card.typeId,
        saved: card.saved,
        scenarioId
      })
    )
  }

  return (
    // Full-height column: a static name header over the Parameter Groups box,
    // which fills the rest of the space and scrolls its own cards.
    <div className="flex h-full flex-col gap-2.5">
      {/* Header: material name with a + (add a Parameter Group), a pencil (unlock
          to rename) and a trash (delete the whole material). The name and its
          error stack, so the error pushes nothing sideways. */}
      <div className="flex shrink-0 flex-col">
      <div className="flex items-center gap-1">
        <input
          ref={nameInputRef}
          aria-label="Material name"
          aria-invalid={nameError != null}
          value={draft.name}
          readOnly={!nameEditing}
          onChange={(e) => handleNameChange(e.target.value)}
          onDoubleClick={startNameEdit}
          onBlur={handleNameBlur}
          className={`min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-sm font-medium text-neutral-100 outline-none ${
            !nameEditing ? 'cursor-default ' : ''
          }${
            nameError
              ? 'border-red-500'
              : nameEditing
                ? 'border-neutral-500'
                : 'border-transparent hover:border-app-border'
          }`}
        />
        {/* "+ Material Type" adds another Parameter Group card — the same action
            the footer button used to carry, now sitting with the material's other
            row actions. It stops once there is a card per catalog material type.
            Same labelled pill as the Geometry / Materials create actions, so the
            two panels' add-buttons read alike; the accessible name spells out the
            full action the shorter visible label stands for. */}
        <ToolbarButton
          label={messages.materialType}
          ariaLabel={messages.addMaterialType}
          title={atTypeLimit ? messages.allTypesAdded : messages.addMaterialType}
          icon={addIcon}
          // Pinned to the same 24px as the pencil and trash it sits beside.
          size="xs"
          bgColor="#ffffff"
          textColor="#000000"
          iconColor="dark"
          disabled={atTypeLimit}
          className="shrink-0"
          onClick={onAddGroup}
        />
        <button
          type="button"
          aria-label="Edit name"
          onClick={startNameEdit}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50"
        >
          <img src={pencilIcon} alt="" aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Delete material"
          disabled={materialDeleting}
          onClick={() => setConfirmDeleteOpen(true)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <img src={deleteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
        {/* Below the row, like the left panel's — so the icons don't shift. */}
        {nameError && <p className="form-error-text mt-1">{nameError}</p>}
      </div>

      {/* The numbered "Parameter Group.0N" cards, scrolling as a group so they all
          stay above the footer; each card hugs its own content. */}
      <div className="scrollbar-custom-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
        {draft.groups.map((group) => (
          <ParameterGroupCard
            key={group.id}
            group={group}
            typeOptions={typeOptions}
            disabledTypeValues={typesUsedByOtherCards(group.id)}
            materialTypes={materialTypes}
            open={openGroupIds.has(group.id)}
            highlighted={group.id === highlightedCardId}
            onToggle={() => toggleGroup(group.id)}
            onSelectType={(typeId) => onSelectType(group.id, typeId)}
            onChangeValue={(property, value) =>
              dispatch(setParameterGroupValue(group.id, property, value))
            }
            onSaveColour={() => handleSaveColour(group)}
            onSaveTexture={(path) => handleSaveTexture(group, path)}
            onSaveRadiation={() => handleSaveRadiation(group)}
            onUploadTexture={(file) => handleUploadTexture(group, file)}
            onUploadSpectral={(file) => handleUploadSpectral(group, file)}
            // A saved card folds itself away — its type still reads from the
            // collapsed header, and the room goes to the cards still being
            // filled in.
            onSaved={() => collapseGroup(group.id)}
            onDelete={() => handleDeleteGroup(group)}
          />
        ))}
      </div>

      {/* Whole-material delete confirmation. */}
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

// A group's editable fields, laid out two per row (matching the mockup). Shared
// by the type's top-level fields and each named group so both read identically.
function MaterialFieldGrid({
  groupId,
  fields,
  values,
  fieldError,
  onFieldChange,
  onFieldBlur
}: {
  groupId: number
  fields: ResolvedMaterialField[]
  values: Record<string, string>
  fieldError: (field: ResolvedMaterialField) => string | undefined
  onFieldChange: (
    property: string,
    next: string,
    datatype: ResolvedMaterialField['datatype']
  ) => void
  onFieldBlur: (property: string) => void
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      {fields.map((field) => {
        const value = values[field.property] ?? ''
        const error = fieldError(field)
        return (
          <FormField
            key={field.property}
            labelProps={{ label: field.label, optional: true, helpText: field.description }}
            inputProps={{
              name: `${groupId}-${field.property}`,
              value,
              // Enum selects read "Select" when empty (not the field's own name);
              // text/number fields keep the label as their placeholder.
              placeholder: field.datatype === 'enum' ? messages.selectPlaceholder : field.label,
              error,
              // Surface the validation error as an in-cell info-icon tooltip
              // (matches the Geometry right panel); selects keep the inline message.
              errorAsTooltip: true,
              inputClassName: 'bg-[#121212]',
              options:
                field.datatype === 'enum' && field.enumValues
                  ? field.enumValues.map((v) => ({ value: v, label: field.enumLabels?.[v] ?? v }))
                  : undefined,
              onChange: (e) => onFieldChange(field.property, e.target.value, field.datatype),
              onBlur: () => onFieldBlur(field.property)
            }}
          />
        )
      })}
    </div>
  )
}

// One "Parameter Group.0N" card: a collapsible box holding ONE material type —
// its Select, that type's parameters (grouped by their catalog `group` tag), and
// its own Save + Delete. The card owns its validation state; the type Select
// locks once the card is saved (the backend keys the member by material_type_id,
// so switching type means deleting this card and adding another).
function ParameterGroupCard({
  group,
  typeOptions,
  disabledTypeValues,
  materialTypes,
  open,
  highlighted,
  onToggle,
  onSelectType,
  onChangeValue,
  onSaveColour,
  onSaveTexture,
  onSaveRadiation,
  onUploadTexture,
  onUploadSpectral,
  onSaved,
  onDelete
}: {
  group: MaterialParameterGroup
  typeOptions: { value: string; label: string }[]
  // Material types already taken by the other cards — shown but not selectable.
  disabledTypeValues: Set<string>
  materialTypes: MaterialTypeDef[]
  open: boolean
  // Just created by the + — outline it and bring it into view.
  highlighted: boolean
  onToggle: () => void
  onSelectType: (typeId: number | null) => void
  onChangeValue: (property: string, value: string) => void
  // Save routes by type: the Visualiser's colour/plain or picked library texture,
  // the Radiation editor's mode, or a plain type's fields.
  onSaveColour: () => void
  onSaveTexture: (path: string) => void
  onSaveRadiation: () => void
  onUploadTexture: (file: File) => void
  onUploadSpectral: (file: File) => void
  // A save landed on the backend — the parent folds this card away.
  onSaved: () => void
  onDelete: () => void
}): React.JSX.Element {
  const type = materialTypes.find((t) => t.id === group.typeId) ?? null
  // Stable across renders so the selector-hygiene effect below (which depends on
  // it) only re-runs when the chosen type actually changes.
  const parameterGroups = React.useMemo(
    () => (type ? resolveParameterGroups([type]) : []),
    [type]
  )
  const title = messages.parameterGroupTitle(group.number)

  // The Visualiser splits into two mutually-exclusive appearance modes; a
  // freshly-picked (not-yet-uploaded) texture file lives here until Save uploads
  // it. Both are card-local: the mode drives which payload Save sends, and the file
  // can't live in the string value bag.
  const isVisualiser = parameterGroups.some((pg) => isVisualisationFieldSet(pg.fields))
  // The Radiation type gets its own bespoke body; the "Apply spectral data" toggle
  // is persisted in the value bag (use_radiation_bands), so it's read straight from
  // there rather than mirrored into local state.
  const isRadiation = parameterGroups.some((pg) => isRadiationFieldSet(pg.fields))
  const applySpectral = readApplySpectral(group.values)
  const [visualMode, setVisualMode] = React.useState<VisualisationMode>(() =>
    readVisualisationMode(group.values)
  )
  // The highlighted library texture — transient: pressing a tile toggles it, and
  // it is only applied on Save. Not written to the value bag.
  const [pendingLibrary, setPendingLibrary] = React.useState<string | null>(null)
  const toggleLibrary = (path: string): void =>
    setPendingLibrary((prev) => (prev === path ? null : path))
  const [pendingFile, setPendingFile] = React.useState<{ file: File; url: string } | null>(null)
  // The live object URL, mirrored in a ref so the unmount cleanup can revoke it
  // without touching state.
  const pendingUrlRef = React.useRef<string | null>(null)
  const setPending = (next: { file: File; url: string } | null): void => {
    if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current)
    pendingUrlRef.current = next?.url ?? null
    setPendingFile(next)
  }
  // Picking a file uploads it RIGHT AWAY: show a local object-URL preview for
  // immediacy, then POST the file so its stored URL lands in the draft. Save
  // (below) persists the member afterwards.
  const pickFile = (file: File): void => {
    setPending({ file, url: URL.createObjectURL(file) })
    onUploadTexture(file)
  }

  // A save that COMPLETED: saving → idle. (A failure goes saving → error, which
  // leaves the card open with its error showing.) That drops the pending file and
  // folds the card away — its work is done and persisted, so the space goes back
  // to the cards still being filled in.
  const prevSaveStatus = React.useRef(group.saveStatus)
  React.useEffect(() => {
    if (prevSaveStatus.current === 'saving' && group.saveStatus === 'idle') {
      setPending(null)
      onSaved()
    }
    prevSaveStatus.current = group.saveStatus
    // setPending/onSaved are stable enough here; only the transition matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.saveStatus])
  React.useEffect(
    () => () => {
      if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current)
    },
    []
  )

  // Changing the card's material type throws away its values (the reducer clears
  // them), so the card-local appearance state has to go with them. The card is
  // keyed by `group.id`, which does NOT change with the type, so all three of
  // these used to survive: a file picked for a Visualiser stayed held — object URL
  // and all — while the card showed a different type, and switching back showed
  // that stale preview and would have uploaded it.
  const prevTypeId = React.useRef(group.typeId)
  React.useEffect(() => {
    if (prevTypeId.current === group.typeId) return
    prevTypeId.current = group.typeId
    setPending(null) // revokes the object URL
    setPendingLibrary(null)
    setVisualMode(readVisualisationMode(group.values))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.typeId])

  // Switching a selector enum (e.g. Stomatal Conductance BWB → Medlyn) leaves the
  // old sub-model's typed values in the bag. They're already excluded from the
  // payload, but clearing them keeps the dirty-check and a reopened card honest.
  // Idempotent: once the stale values are blanked there is nothing left to clear.
  React.useEffect(() => {
    if (!type) return
    const activeProps = new Set(
      visibleParameterGroups(parameterGroups, group.values).flatMap((pg) =>
        pg.fields.map((f) => f.property)
      )
    )
    for (const g of type.groups) {
      for (const def of g.properties) {
        if (!activeProps.has(def.property) && (group.values[def.property] ?? '') !== '') {
          onChangeValue(def.property, '')
        }
      }
    }
  }, [type, parameterGroups, group.values, onChangeValue])

  // Field-validation state, scoped to this card. `touched` gates the errors so
  // they only appear after interaction; `guardErrors` holds the transient
  // per-keystroke rejections (non-numeric / >7 decimals) that never reach the
  // value and clear on blur. Mirrors the Geometry form.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  const [guardErrors, setGuardErrors] = React.useState<Record<string, string | null>>({})
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  // Collapse state for the named parameter groups (e.g. "Farquhar model"), keyed
  // by group name. Groups default open (matching the mockup); a name lands here
  // only once the user collapses it, so the set survives type changes cleanly.
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set())
  const toggleGroupSection = (name: string): void =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  // Bring a freshly added card into view — with the other cards left open, it can
  // be added below the fold of the scrolling list.
  const cardRef = useScrollIntoViewWhen<HTMLDivElement>(highlighted)

  // Clicking away from the card drops the highlighted library texture — it is a
  // transient pick, not a stored one.
  //
  // Detected as a pointer press OUTSIDE the card, not as a blur on the tile. Blur
  // fires on ANY focus loss, so it also fired on Tab — and since the pick is the
  // only thing that enables Save, tabbing from a tile towards Save cleared it and
  // disabled the button on the way, leaving library textures unreachable without a
  // mouse. Scoping to the card keeps everything inside it (Save, the tabs, the
  // other tiles) "not away", and a keyboard Tab never fires mousedown at all.
  React.useEffect(() => {
    if (pendingLibrary == null) return undefined
    const onDown = (e: MouseEvent): void => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) setPendingLibrary(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pendingLibrary, cardRef])

  const handleFieldChange = (
    property: string,
    next: string,
    datatype: MaterialTypeDef['properties'][number]['datatype']
  ): void => {
    const numeric = datatype === 'float' || datatype === 'integer'
    if (numeric) {
      if (!isPartialNumericInput(next) || (datatype === 'integer' && next.includes('.'))) {
        setGuardErrors((g) => ({ ...g, [property]: messages.inputNotSupported }))
        return
      }
      if (exceedsMaxDecimals(next)) {
        setGuardErrors((g) => ({ ...g, [property]: messages.decimalLimit }))
        return
      }
    }
    if (guardErrors[property]) setGuardErrors((g) => ({ ...g, [property]: null }))
    onChangeValue(property, next)
  }

  const handleFieldBlur = (property: string): void => {
    if (guardErrors[property]) setGuardErrors((g) => ({ ...g, [property]: null }))
    setTouched((t) => ({ ...t, [property]: true }))
  }

  // The error shown under a field: the transient keystroke guard if any, else the
  // committed value's validation once the field is touched or non-empty. Shared by
  // the plain FormFields and the visualisation editor so both read identically.
  const fieldError = (field: ResolvedMaterialField): string | undefined => {
    const guard = guardErrors[field.property]
    if (guard != null) return guard
    const value = group.values[field.property] ?? ''
    if (touched[field.property] === true || value !== '') {
      return validateMaterialFieldValue(field, value) ?? undefined
    }
    return undefined
  }

  // Save is available once a type is chosen and its active mode is complete:
  //  - plain type      → every field valid.
  //  - Visualiser Custom → a full, valid colour + opacity.
  //  - Visualiser Texture → a texture is chosen (a picked file or a stored path).
  const fieldsValid = isMaterialFormValid(parameterGroups, group.values)
  const saving = group.saveStatus === 'saving'
  // A file upload (the picked texture) is in flight — Save waits for its URL.
  const uploading = group.uploadStatus === 'uploading'
  // A backend DELETE for this member is in flight — the trash locks until it
  // answers, so a second click can't fire a second DELETE.
  const deleting = group.deleteStatus === 'deleting'
  // The texture that Save would persist: a highlighted library pick wins, else
  // the path a just-completed upload staged into `values`. A picked FILE no
  // longer gates Save on its own — it's uploaded first, and it's the returned
  // URL (now in `values`) that counts.
  const chosenTexture = pendingLibrary ?? (group.values[TEXTURE_PROPERTY] || null)
  const textureReady = chosenTexture != null
  const modeComplete = !isVisualiser
    ? fieldsValid
    : visualMode === 'custom'
      ? isVisualisationComplete(parameterGroups, group.values)
      : textureReady

  // …and once it actually differs from what's on the backend — the same dirty
  // rule the Geometry form's Save uses. A card that was never saved has no
  // baseline, so any complete state counts as a change; a saved card can't be
  // re-saved unchanged, and editing back to the stored values closes Save again.
  const valuesDirty = group.savedValues == null || !sameValues(group.values, group.savedValues)
  // In texture mode the chosen path (uploaded URL or library pick) is dirty when
  // it differs from the stored one — so a fresh upload opens Save, and a saved
  // texture re-read from the backend keeps it shut.
  const textureDirty = chosenTexture !== (group.savedValues?.[TEXTURE_PROPERTY] ?? null)
  const dirty = isVisualiser && visualMode === 'texture' ? textureDirty : valuesDirty

  // Radiation cross-field rule: a band's reflectivity + transmissivity + emissivity
  // must not exceed 1. Blocks Save (the editor also flags the three fields). Only
  // in MANUAL mode — spectral mode disables the bands and drops their values on
  // save, so stale band values must never gate Save there.
  const bandSumInvalid =
    isRadiation && !applySpectral && radiationBandSumViolations(group.values).size > 0

  const canSave =
    group.typeId != null && modeComplete && dirty && !saving && !uploading && !bandSumInvalid

  // Route Save by type/mode. The Visualiser's texture mode persists the chosen path
  // (uploaded or library); Radiation builds its banded/spectral payload; every other
  // type sends its plain fields.
  const onSave = (): void => {
    if (isVisualiser && visualMode === 'texture') {
      if (chosenTexture != null) onSaveTexture(chosenTexture)
    } else if (isRadiation) {
      onSaveRadiation()
    } else {
      onSaveColour()
    }
  }

  const onDeleteClick = (): void => {
    if (deleting) return
    // A card that was never saved has nothing on the backend — drop it without
    // asking. A saved one is a real member, so confirm first.
    if (!group.saved) {
      onDelete()
      return
    }
    setConfirmDeleteOpen(true)
  }

  return (
    <div
      ref={cardRef}
      className={`flex shrink-0 flex-col rounded-[5px] border transition-colors duration-500 ${
        highlighted ? HIGHLIGHT_CLASSES : 'border-app-border'
      }`}
    >
      {/* The whole header row is the expand/collapse target — the chevron alone is
          a tiny hit area, and the bare text next to it showed a text (I-beam)
          cursor. The nested buttons stop propagation so they don't also toggle. */}
      <div
        onClick={onToggle}
        className="flex cursor-pointer select-none items-center justify-between px-3 pb-1 pt-2"
      >
        <span className="flex items-center gap-2 text-[13px] font-normal leading-[15px] text-neutral-200">
          {title}
          <button
            type="button"
            aria-label={`Remove ${title}`}
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation()
              onDeleteClick()
            }}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <img src={deleteIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Toggle ${title}`}
          onClick={(e) => {
            // The header already toggles; without this the click would toggle
            // twice (button + header) and appear to do nothing.
            e.stopPropagation()
            onToggle()
          }}
          className="mr-1 flex h-5 w-5 cursor-pointer items-center justify-center"
        >
          <img
            src={chevronDown}
            alt=""
            aria-hidden="true"
            className="h-1.5 w-auto transition-transform duration-150"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </button>
      </div>

      {/* The material-type box stays put whether the card is open or collapsed —
          collapsed, it is the only thing saying WHICH type this card holds (it
          reads as the type's name where an untouched card reads "Select").
          Collapsing hides just that type's parameters and its Save. */}
      <div className="flex flex-col gap-2.5 px-3 pb-2.5">
        <div className="mt-1">
          <Select
            searchable
            options={typeOptions}
            value={group.typeId == null ? '' : String(group.typeId)}
            placeholder={messages.selectPlaceholder}
            ariaLabel={title}
            // Locked once saved: the group keys this member by its material type.
            disabled={group.saved}
            // A type already used by another card can't be picked again.
            disabledValues={disabledTypeValues}
            className="h-9 w-full rounded border border-app-border bg-[#121212] px-3 pr-9 text-sm text-white outline-none focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
            listClassName="bg-[#121212]"
            onChange={(v) => onSelectType(v === '' ? null : Number(v))}
          />
        </div>

        {open && (
          <>
            {/* The chosen type's parameters, in catalog order: the top-level fields
                first (no header), then each conditional group whose selector is
                currently satisfied. The Visualiser's top-level set (recognised by
                its colour channels) renders the colour editor instead of a grid. */}
            {visibleParameterGroups(parameterGroups, group.values).map((pg) =>
              isVisualisationFieldSet(pg.fields) ? (
                <MaterialVisualisationEditor
                  key="__visualiser"
                  values={group.values}
                  fields={pg.fields}
                  fieldError={fieldError}
                  onFieldChange={handleFieldChange}
                  onFieldBlur={handleFieldBlur}
                  saved={group.saved}
                  mode={visualMode}
                  onModeChange={setVisualMode}
                  selectedPath={pendingLibrary}
                  // Preview: the just-picked file's object URL for immediacy,
                  // else the stored/uploaded path served from the backend — so a
                  // completed upload (or a reopened texture member) still shows.
                  pendingFileUrl={
                    pendingFile?.url ??
                    (group.values[TEXTURE_PROPERTY]
                      ? textureServeUrl(group.values[TEXTURE_PROPERTY])
                      : undefined)
                  }
                  onPickLibrary={toggleLibrary}
                  onPickFile={pickFile}
                  uploading={uploading}
                  // `group.saveError` is NOT passed down: the card renders it
                  // once below Save, for every kind of card. Feeding it here as
                  // well printed a failed upload's message twice, a few rows
                  // apart. TextureSelector still shows its own client-side file
                  // checks (wrong type, too large), which have no other home.
                />
              ) : isRadiationFieldSet(pg.fields) ? (
                <MaterialRadiationEditor
                  key="__radiation"
                  idPrefix={group.id}
                  values={group.values}
                  fields={pg.fields}
                  fieldError={fieldError}
                  onFieldChange={handleFieldChange}
                  onFieldBlur={handleFieldBlur}
                  applySpectral={applySpectral}
                  onToggleSpectral={() =>
                    onChangeValue(USE_RADIATION_BANDS_PROPERTY, applySpectral ? 'true' : 'false')
                  }
                  uploading={uploading}
                  uploadError={group.uploadError}
                  onPickSpectralFile={onUploadSpectral}
                  onClearSpectral={() => onChangeValue(SPECTRAL_DATA_PROPERTY, '')}
                />
              ) : pg.name == null ? (
                <MaterialFieldGrid
                  key="__top"
                  groupId={group.id}
                  fields={pg.fields}
                  values={group.values}
                  fieldError={fieldError}
                  onFieldChange={handleFieldChange}
                  onFieldBlur={handleFieldBlur}
                />
              ) : pg.selectorProperty != null ? (
                // A selector-driven group (e.g. a stomatal sub-model): the enum
                // dropdown above already names it, so its fields render directly
                // with no header — nothing greyish here.
                <MaterialFieldGrid
                  key={pg.name}
                  groupId={group.id}
                  fields={pg.fields}
                  values={group.values}
                  fieldError={fieldError}
                  onFieldChange={handleFieldChange}
                  onFieldBlur={handleFieldBlur}
                />
              ) : (
                // An always-shown titled group (e.g. Farquhar model): only the
                // HEADER is greyish; its fields sit on the plain card background
                // below, unwrapped — matching the mockup.
                <div key={pg.name} className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    aria-expanded={!collapsedGroups.has(pg.name)}
                    onClick={() => toggleGroupSection(pg.name as string)}
                    className="flex items-center justify-between rounded bg-[#313131] px-3 py-2 text-left"
                  >
                    <span className="text-[13px] font-normal leading-[15px] text-neutral-200">
                      {pg.name}
                    </span>
                    <img
                      src={chevronDown}
                      alt=""
                      aria-hidden="true"
                      className="h-1.5 w-auto transition-transform duration-150"
                      style={{
                        transform: collapsedGroups.has(pg.name) ? 'none' : 'rotate(180deg)'
                      }}
                    />
                  </button>
                  {!collapsedGroups.has(pg.name) && (
                    <MaterialFieldGrid
                      groupId={group.id}
                      fields={pg.fields}
                      values={group.values}
                      fieldError={fieldError}
                      onFieldChange={handleFieldChange}
                      onFieldBlur={handleFieldBlur}
                    />
                  )}
                </div>
              )
            )}

            {/* This card's own Save — adds its material type to the material the
                first time, updates it after that. */}
            <button
              type="button"
              disabled={!canSave}
              // Don't steal focus from a highlighted library tile on mousedown —
              // that would blur it and drop the pick before this click reads it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={onSave}
              // Same look as the Geometry ground Save: a faded-blue disabled state.
              className="flex h-9 w-full items-center justify-center gap-1 rounded bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? messages.savingParameterGroup : messages.saveParameterGroup}
            </button>
            {(group.saveError || group.uploadError) && (
              <span className="form-error-text" style={{ color: '#D92D20' }}>
                {group.saveError ?? group.uploadError}
              </span>
            )}
          </>
        )}
      </div>

      {/* Removing a SAVED material type from the material — confirm first. */}
      <Dialog
        isOpen={confirmDeleteOpen}
        title={messages.deleteTitle}
        onClose={() => setConfirmDeleteOpen(false)}
      >
        <h3 className="text-base font-medium text-white">
          {messages.deleteHeading(type?.materialtype ?? title)}
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
            onClick={() => {
              setConfirmDeleteOpen(false)
              onDelete()
            }}
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
