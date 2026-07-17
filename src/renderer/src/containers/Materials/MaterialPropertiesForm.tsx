import addIcon from '@renderer/assets/add.svg'
import chevronDown from '@renderer/assets/ChevronDownIcon.svg'
import deleteIcon from '@renderer/assets/delete.svg'
import pencilIcon from '@renderer/assets/pencil.svg'
import Dialog from '@renderer/components/Dialog'
import FormField from '@renderer/components/FormField'
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
  closeMaterialDraft,
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
  isVisualisationComplete,
  isVisualisationFieldSet,
  readVisualisationMode,
  resolveParameterGroups,
  TEXTURE_PROPERTY,
  TEXTURE_TOGGLE_PROPERTY,
  toNativeProperties,
  toVisualisationProperties,
  validateMaterialFieldValue,
  VISUALISATION_CUSTOM_PROPERTIES,
  type ResolvedMaterialField,
  type VisualisationMode
} from './materialBlueprint'
import MaterialVisualisationEditor from './MaterialVisualisationEditor'
import messages from './messages'
import reducer from './reducer'
import saga from './saga'
import { selectMaterialDraft, selectMaterialDraftNonce } from './selectors'
import type { MaterialDraft, MaterialParameterGroup } from './types'

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
  // The name as it stands on the backend, captured when the pencil unlocks the
  // field — blur compares against it so an untouched name is not re-sent.
  const nameBeforeEdit = React.useRef(draft.name)

  const startNameEdit = (): void => {
    nameBeforeEdit.current = draft.name
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
    const next = draft.name.trim()
    // A blank name isn't a rename either — put the old one back rather than
    // leaving the header empty.
    if (next === '') {
      dispatch(setMaterialDraftName(nameBeforeEdit.current))
      return
    }
    if (next === nameBeforeEdit.current) return
    dispatch(renameMaterialRequested(draft.groupId, next, scenarioId))
  }

  // The header trash — deletes the whole material (group + every member).
  const performDelete = (): void => {
    dispatch(deleteMaterialRequested(draft.groupId, scenarioId))
    setConfirmDeleteOpen(false)
    dispatch(closeMaterialDraft())
  }

  const dispatchSave = (
    card: MaterialParameterGroup,
    materialTypeId: number,
    properties: ReturnType<typeof toNativeProperties>
  ): void => {
    dispatch(
      saveParameterGroupRequested({
        groupId: draft.groupId,
        cardId: card.id,
        materialTypeId,
        properties,
        saved: card.saved,
        scenarioId
      })
    )
  }

  // The COLOUR / plain save: a Visualiser sends its Custom colour payload
  // (texture_toggle false), every other type sends its plain native properties.
  const handleSaveColour = (card: MaterialParameterGroup): void => {
    const type = materialTypes.find((t) => t.id === card.typeId)
    if (!type) return
    const isVis = isVisualisationFieldSet(resolveParameterGroups([type]).flatMap((g) => g.fields))
    const properties = isVis
      ? toVisualisationProperties(type, card.values, 'custom')
      : toNativeProperties(type, card.values)
    dispatchSave(card, type.id, properties)
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
          to rename) and a trash (delete the whole material). */}
      <div className="flex shrink-0 items-center gap-1">
        <input
          ref={nameInputRef}
          aria-label="Material name"
          value={draft.name}
          readOnly={!nameEditing}
          onChange={(e) => handleNameChange(e.target.value)}
          onDoubleClick={startNameEdit}
          onBlur={handleNameBlur}
          className={`min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-sm font-medium text-neutral-100 outline-none ${
            !nameEditing ? 'cursor-default ' : ''
          }${nameEditing ? 'border-neutral-500' : 'border-transparent hover:border-app-border'}`}
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
          onClick={() => setConfirmDeleteOpen(true)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50"
        >
          <img src={deleteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
        </button>
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
            onUploadTexture={(file) => handleUploadTexture(group, file)}
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
  onUploadTexture,
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
  // Save routes by the Visualiser's mode: colour/plain, a picked library texture,
  // or a picked file to upload.
  onSaveColour: () => void
  onSaveTexture: (path: string) => void
  onUploadTexture: (file: File) => void
  // A save landed on the backend — the parent folds this card away.
  onSaved: () => void
  onDelete: () => void
}): React.JSX.Element {
  const type = materialTypes.find((t) => t.id === group.typeId) ?? null
  const parameterGroups = type ? resolveParameterGroups([type]) : []
  const title = messages.parameterGroupTitle(group.number)

  // The Visualiser splits into two mutually-exclusive appearance modes; a
  // freshly-picked (not-yet-uploaded) texture file lives here until Save uploads
  // it. Both are card-local: the mode drives which payload Save sends, and the file
  // can't live in the string value bag.
  const isVisualiser = parameterGroups.some((pg) => isVisualisationFieldSet(pg.fields))
  const [visualMode, setVisualMode] = React.useState<VisualisationMode>(() =>
    readVisualisationMode(group.values)
  )
  // The highlighted library texture — transient: clicking toggles it, clicking away
  // (blur) drops it, and it is only applied on Save. Not written to the value bag.
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
  const pickFile = (file: File): void => setPending({ file, url: URL.createObjectURL(file) })

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

  // Field-validation state, scoped to this card. `touched` gates the errors so
  // they only appear after interaction; `guardErrors` holds the transient
  // per-keystroke rejections (non-numeric / >7 decimals) that never reach the
  // value and clear on blur. Mirrors the Geometry form.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  const [guardErrors, setGuardErrors] = React.useState<Record<string, string | null>>({})
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)

  // Bring a freshly added card into view — with the other cards left open, it can
  // be added below the fold of the scrolling list.
  const cardRef = useScrollIntoViewWhen<HTMLDivElement>(highlighted)

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
  // Texture mode can save only when a texture is CHOSEN right now — a highlighted
  // library texture or a picked file. An already-stored texture does NOT keep Save
  // enabled (nothing selected ⇒ disabled), mirroring the colour gate.
  const textureReady = pendingLibrary != null || pendingFile != null
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
  // A texture pick lives outside `values` until Save writes it, so the baseline
  // can't see it: a picked FILE is always a change (a fresh upload), and a library
  // pick is one only when it isn't the texture already stored.
  const textureDirty =
    pendingFile != null || pendingLibrary !== (group.savedValues?.[TEXTURE_PROPERTY] ?? null)
  const dirty = isVisualiser && visualMode === 'texture' ? textureDirty : valuesDirty

  const canSave = group.typeId != null && modeComplete && dirty && !saving

  // Route Save by the Visualiser's active mode. In texture mode, a highlighted
  // library pick wins, then a picked file (upload). The gate guarantees one exists.
  const onSave = (): void => {
    if (isVisualiser && visualMode === 'texture') {
      if (pendingLibrary != null) onSaveTexture(pendingLibrary)
      else if (pendingFile) onUploadTexture(pendingFile.file)
    } else {
      onSaveColour()
    }
  }

  const onDeleteClick = (): void => {
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
            onClick={(e) => {
              e.stopPropagation()
              onDeleteClick()
            }}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-100"
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
        <MaterialTypeSelect
          options={typeOptions}
          value={group.typeId == null ? '' : String(group.typeId)}
          placeholder={messages.selectPlaceholder}
          ariaLabel={title}
          // Locked once saved: the group keys this member by its material type.
          disabled={group.saved}
          // A type already used by another card can't be picked again.
          disabledValues={disabledTypeValues}
          onChange={(v) => onSelectType(v === '' ? null : Number(v))}
        />

        {open && (
          <>
            {/* The chosen type's parameters. The Visualiser's fields (recognised
                by their colour channels — the live catalog has no `group` tag)
                render the colour editor; every other group is plain FormFields. */}
            {parameterGroups.map((pg) =>
              isVisualisationFieldSet(pg.fields) ? (
                <MaterialVisualisationEditor
                  key={pg.group}
                  values={group.values}
                  fields={pg.fields}
                  fieldError={fieldError}
                  onFieldChange={handleFieldChange}
                  onFieldBlur={handleFieldBlur}
                  mode={visualMode}
                  onModeChange={setVisualMode}
                  selectedPath={pendingLibrary}
                  pendingFileUrl={pendingFile?.url}
                  onPickLibrary={toggleLibrary}
                  onClearLibrary={() => setPendingLibrary(null)}
                  onPickFile={pickFile}
                  uploading={saving}
                  uploadError={
                    visualMode === 'texture' ? (group.saveError ?? undefined) : undefined
                  }
                />
              ) : (
                <div key={pg.group} className="flex flex-col gap-2">
                  <p className="text-[13px] font-medium leading-[20px] text-[#D3D3D3]">
                    {pg.label}
                  </p>
                  {pg.fields.map((field) => {
                    const value = group.values[field.property] ?? ''
                    const error = fieldError(field)
                    return (
                      <FormField
                        key={field.property}
                        labelProps={{
                          label: field.label,
                          optional: true,
                          helpText: field.description
                        }}
                        inputProps={{
                          name: `${group.id}-${field.property}`,
                          value,
                          placeholder: field.label,
                          error,
                          inputClassName: 'bg-[#121212]',
                          options:
                            field.datatype === 'enum' && field.enumValues
                              ? field.enumValues.map((v) => ({ value: v, label: v }))
                              : undefined,
                          onChange: (e) =>
                            handleFieldChange(field.property, e.target.value, field.datatype),
                          onBlur: () => handleFieldBlur(field.property)
                        }}
                      />
                    )
                  })}
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
            {group.saveError && (
              <span className="form-error-text" style={{ color: '#D92D20' }}>
                {group.saveError}
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

// A searchable material-type picker: type to filter the catalog options, click
// (or Enter) to select. Replaces the native <select> so the long material-type
// list is filterable. Controlled by the card's typeId; local state only tracks
// the typed query, the open state, and the keyboard highlight.
function MaterialTypeSelect({
  options,
  value,
  placeholder,
  ariaLabel,
  disabled = false,
  disabledValues,
  onChange
}: {
  options: { value: string; label: string }[]
  value: string
  placeholder: string
  ariaLabel: string
  disabled?: boolean
  // Option values that are present but not selectable (already used elsewhere).
  disabledValues?: Set<string>
  onChange: (value: string) => void
}): React.JSX.Element {
  const selected = options.find((o) => o.value === value) ?? null
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listId = React.useId()

  // Close the dropdown on an outside click.
  React.useEffect(() => {
    if (!open) return undefined
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Open from a closed state with a fresh (empty) query, so the full list shows;
  // no-op if already open, so clicking to reposition the caret keeps the text.
  const openList = (): void => {
    if (disabled) return
    if (!open) {
      setOpen(true)
      setQuery('')
      setHighlight(0)
    }
  }

  // The chevron is a real toggle: it both opens AND closes the list. (The input
  // itself only ever opens, so that clicking into the text to reposition the
  // caret doesn't dismiss the list mid-typing.) Opening also focuses the input so
  // the user can type to filter, since the chevron suppresses the focus itself.
  const toggleList = (): void => {
    if (disabled) return
    if (open) {
      setOpen(false)
    } else {
      openList()
      inputRef.current?.focus()
    }
  }

  const q = query.trim().toLowerCase()
  const filtered = q === '' ? options : options.filter((o) => o.label.toLowerCase().includes(q))

  const isTaken = (opt: { value: string }): boolean => disabledValues?.has(opt.value) ?? false
  // Every option is spoken for — nothing left to add to this material.
  const allTaken = filtered.length > 0 && filtered.every(isTaken)

  const commit = (opt: { value: string; label: string }): void => {
    if (isTaken(opt)) return
    onChange(opt.value)
    setOpen(false)
  }

  // Arrow keys walk past the taken options rather than landing on them.
  const nextSelectable = (from: number, step: 1 | -1): number => {
    for (let i = from; i >= 0 && i < filtered.length; i += step) {
      if (!isTaken(filtered[i])) return i
    }
    return highlight
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => nextSelectable(Math.min(h + 1, filtered.length - 1), 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => nextSelectable(Math.max(h - 1, 0), -1))
    } else if (e.key === 'Enter') {
      const opt = filtered[highlight]
      if (open && opt && !isTaken(opt)) {
        e.preventDefault()
        commit(opt)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative mt-1">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        disabled={disabled}
        value={open ? query : (selected?.label ?? '')}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded border border-app-border bg-[#121212] px-3 pr-9 text-sm text-white outline-none focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {/* The chevron is its own button, not an overlay image: as a bare image it
          sat on top of the text input, so it showed the input's text (I-beam)
          cursor and its click fell through to the input — which only ever opens
          the list. As a button it toggles, and shows the pointer cursor. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        // Keep the click from blurring/refocusing the input, which would
        // re-open the list via onFocus right after we closed it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleList}
        className="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center disabled:cursor-not-allowed"
      >
        <img
          src={chevronDown}
          alt=""
          aria-hidden="true"
          className="h-1.5 w-auto transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {open && filtered.length > 0 && (
        <div
          id={listId}
          className="scrollbar-custom-thin absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-app-border bg-[#121212] py-1 shadow-lg"
        >
          {/* Every remaining type is already on this material — say so rather than
              showing a list where nothing can be picked. */}
          {allTaken && (
            <p className="px-3 py-2 text-sm text-neutral-500">{messages.allTypesAdded}</p>
          )}
          {filtered.map((opt, i) => {
            // Already used by another parameter group: still listed (so the user
            // can see it exists) but greyed out and unselectable.
            const taken = isTaken(opt)
            return (
              <button
                key={opt.value}
                type="button"
                disabled={taken}
                aria-current={opt.value === value}
                onMouseEnter={() => {
                  if (!taken) setHighlight(i)
                }}
                onClick={() => commit(opt)}
                className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                  taken
                    ? 'cursor-not-allowed text-neutral-600'
                    : `text-neutral-200 hover:bg-neutral-700/50 ${
                        i === highlight ? 'bg-neutral-700/50' : ''
                      }`
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MaterialPropertiesForm
