import deleteIcon from '@renderer/assets/delete.svg'
import infoIcon from '@renderer/assets/info.svg'
import pencilIcon from '@renderer/assets/pencil.svg'
import AnchoredPopup from '@renderer/components/AnchoredPopup'
import Dialog from '@renderer/components/Dialog'
import FormField from '@renderer/components/FormField'
import Tooltip from '@renderer/components/Tooltip'
import { showSnackbar } from '@renderer/store/snackbarReducer'
import { createMaterialRequested, loadMaterialDetailRequested } from 'containers/Materials/actions'
import {
  isVisualisationFieldSet,
  resolveParameterGroups,
  TEXTURE_PROPERTY,
  TEXTURE_TOGGLE_PROPERTY,
  visibleParameterGroups,
  VISUALISATION_CHANNEL_LABELS
} from 'containers/Materials/materialBlueprint'
import materialsReducer from 'containers/Materials/reducer'
import materialsSaga from 'containers/Materials/saga'
import {
  selectAllMaterials,
  selectCreateStatus as selectMaterialCreateStatus,
  selectMaterialDetailsById,
  selectNextMaterialName
} from 'containers/Materials/selectors'
import { textureServeUrl } from 'containers/Materials/service'
import {
  selectActiveProjectId,
  selectActiveScenarioId,
  selectAllMaterialTypes,
  selectAllObjectTypes
} from 'containers/ProjectScreen/selectors'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import {
  exceedsMaxDecimals,
  expandForDisplay,
  isIncompleteExponent,
  isPartialNumericInput
} from 'utils/decimalValidation'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import { sameValues } from 'utils/sameValues'
import { trimText } from 'utils/trimText'
import { showFullTextOnHover } from 'utils/truncationTooltip'
import type { AnchorRect } from 'utils/useAnchoredPosition'
import {
  addDraftMaterial,
  closeCreateForm,
  deleteNodeRequested,
  removeDraftMaterial,
  renameRequested,
  setDraftName,
  setDraftValue,
  unassignMaterialRequested,
  updateObjectRequested
} from './actions'
import MaterialPropertiesPopup, { type MaterialDetailSection } from './MaterialPropertiesPopup'
import messages from './messages'
import {
  humanizeProperty,
  isObjectFormValid,
  resolveObjectFormByType,
  validateFieldValue,
  type ResolvedFormGroup
} from './propertyBlueprint'
import reducer from './reducer'
import RepeatField from './RepeatField'
import saga from './saga'
import SelectMaterialsPopup from './SelectMaterialsPopup'
import {
  selectCreateDraft,
  selectCreateDraftNonce,
  selectDeletingIds,
  selectDetailsById,
  selectNodesById
} from './selectors'
import { divisorsOf, nextValid, prevValid, snapRepeat } from './textureRepeat'
import type { CreateDraft, DraftMaterialGroup } from './types'
import { validateGroupName } from './validation'

// Name uniqueness is enforced by the backend on Save, so we don't scan every
// geometry per keystroke. The empty set makes validateGroupName's uniqueness
// branch a no-op, leaving the cheap instant rules: non-empty + ≤20 characters.
const NO_NAME_CONFLICTS = new Set<string>()

// How much of a field's name its placeholder can show, by how many fields share
// the row. This form hides its labels (the group heading is the visible one), so
// the placeholder IS the field's name — it can't simply be dropped when it runs
// long, the way a form with visible labels could.
//
// Unlike the Materials cards, a group here picks its own column count (1, 2 or 3
// — see propertyBlueprint), so the room per field varies within the same panel
// and one budget cannot serve all three. Each is set a little under what its
// column measures, because a character count is not a width: the app's font is
// proportional, so a label of broad letters runs wider than the average these
// came from. FormField keeps `text-ellipsis` as a backstop if one is ever too
// generous.
const PLACEHOLDER_CHARS_BY_COLUMNS: Record<number, number> = { 1: 38, 2: 18, 3: 10 }

const placeholderCharsFor = (columns: number): number =>
  PLACEHOLDER_CHARS_BY_COLUMNS[columns] ?? PLACEHOLDER_CHARS_BY_COLUMNS[2]

// The popup's height as a fraction of the 3D window's — "20% less than the window,
// split top and bottom" (per the Figma), so it reads as a tall centered panel
// rather than a content-hugging tooltip. Purely visual; tweak to taste.
const DETAIL_POPUP_HEIGHT_RATIO = 0.8
// The breathing room every popup on this panel keeps from the panel and the
// viewport edges.
const POPUP_GAP = 8

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

// The same pairing read the other way — resolution property → the repeat that
// depends on it. Editing a resolution re-checks its repeat (see reconcileRepeat).
const RESOLUTION_DEPENDENT_REPEAT: Record<string, string> = Object.fromEntries(
  Object.entries(TEXTURE_RESOLUTION_CAP).map(([texProp, resProp]) => [resProp, texProp])
)

const isRepeatProperty = (property: string): boolean => property in TEXTURE_RESOLUTION_CAP

// The subdivision count a repeat is measured against, as a number. NaN/0 for a
// blank or non-numeric resolution, which divisorsOf turns into an empty valid
// set — the signal that the constraint can't be evaluated yet.
function subdivisionCount(values: Record<string, string>, texProp: string): number {
  return Number((values[TEXTURE_RESOLUTION_CAP[texProp]] ?? '').trim())
}

// Re-check a repeat against its subdivision count and report what the engine
// would actually use. Returns null when there is nothing to change — no usable
// resolution, a blank/junk value that per-field validation already owns, or a
// repeat that is already valid. Shared by the resolution-blur re-check and the
// open-time correction, so both behave identically.
function repeatAdjustment(
  values: Record<string, string>,
  property: string
): { value: string; note: string } | null {
  const count = subdivisionCount(values, property)
  const divisors = divisorsOf(count)
  const raw = (values[property] ?? '').trim()
  if (divisors.length === 0 || raw === '') return null
  const current = Number(raw)
  if (!Number.isFinite(current)) return null
  const snapped = snapRepeat(current, divisors)
  if (snapped == null || snapped === current) return null
  return { value: String(snapped), note: messages.repeatAdjusted(current, snapped, count) }
}

// Every repeat a freshly-opened form needs corrected. A ground saved before the
// divisor rule (or written by another client) can hold a repeat its resolution
// never allowed; this is what the form opens with, computed once from the
// initial values so the note can be rendered without storing it in state.
export function openTimeRepeatAdjustments(
  values: Record<string, string>
): Record<string, { value: string; note: string }> {
  const adjustments: Record<string, { value: string; note: string }> = {}
  for (const property of Object.keys(TEXTURE_RESOLUTION_CAP)) {
    const adjustment = repeatAdjustment(values, property)
    if (adjustment) adjustments[property] = adjustment
  }
  return adjustments
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

// A stored file property's name — the last segment, exactly as the backend holds
// it. e.g. "uploads/groups/77/Screenshot_2026-07-21_at_2.21.13_PM.png" →
// "Screenshot_2026-07-21_at_2.21.13_PM.png".
//
// Used for EVERY file-typed property in this popup, not just the texture: a
// spectral data file is stored the same way and was showing its whole path here,
// while the Materials editor it came from shows just the name. A path tells the
// user nothing they can act on and pushes the actual name out of the column.
//
// Deliberately NOT prettified. This used to title-case the stem and swap '_'/'-'
// for spaces, which turned the stored name into something that matched nothing on
// disk or in the API response ("Screenshot 2026 07 21 At 2.21.13 PM.png"). It is
// a file name, so it reads as one — the same rule the Radiation spectral row uses.
//
// BOTH separators are split on. A backend running on Windows stores native paths
// ("C:\Program Files\Helios\…\assets\grass.jpg"), which contain no '/' at all —
// so splitting on '/' alone returned the WHOLE path, and the user saw the
// installation directory instead of the texture's name.
function fileDisplayName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  // A stored path may be percent-encoded; show the decoded form, and fall back to
  // the raw one when it isn't valid encoding (a literal '%' in the name).
  try {
    return decodeURIComponent(base)
  } catch {
    return base
  }
}

// The Visualiser's persisted mode discriminator. Tolerates both the string form
// (the Materials detail cache stores values as strings) and the native boolean
// (the object GET baseline), so a texture member is recognised from either source.
function isTextureMode(properties: Record<string, number | string | boolean | null>): boolean {
  const toggle = properties[TEXTURE_TOGGLE_PROPERTY]
  return toggle === true || toggle === 1 || toggle === 'true' || toggle === '1'
}

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
      // The catalog lists EVERY conditional group a type can have (e.g. all four
      // stomatal sub-models), so rendering it unfiltered showed the three the user
      // never picked as empty sections — implying settings the material doesn't
      // have. Filter on the member's own selector value, exactly as the editable
      // Materials form does, so the two views agree.
      const selectorValues: Record<string, string> = {}
      for (const [property, value] of Object.entries(member.properties)) {
        selectorValues[property] = asDisplay(value)
      }
      const groups = visibleParameterGroups(resolveParameterGroups([type]), selectorValues).map(
        (pg) => {
          // The Visualiser in texture mode gets a dedicated section: the texture's
          // name + the image itself, served from the same /api/textures/serve
          // endpoint the visualiser editor and 3D scene already use. Every other
          // group — and the Visualiser in colour mode — keeps the generic text
          // mapping below.
          if (isVisualisationFieldSet(pg.fields) && isTextureMode(member.properties)) {
            const path = asDisplay(member.properties[TEXTURE_PROPERTY])
            const name = fileDisplayName(path)
            return {
              group: 'visualisation',
              // No heading: the section sits under the "Visualiser" type header and
              // its two rows name themselves ("Texture Name", "Texture Image"), so a
              // caption above them only said again what was already on screen. The
              // empty label is the popup's signal to render the rows bare.
              label: '',
              singleColumn: true,
              rows: [
                { property: 'texture_name', label: 'Texture Name', value: path ? name : '—' },
                {
                  property: TEXTURE_PROPERTY,
                  label: 'Texture Image',
                  value: '',
                  ...(path ? { image: { src: textureServeUrl(path), alt: name } } : {})
                }
              ]
            }
          }
          return {
            // The blueprint's top-level fields (name null) map to the header-less
            // "general" bucket the popup already renders inline; named groups keep
            // their catalog name as the section heading.
            group: pg.name ?? 'general',
            label: pg.name ?? 'General',
            rows: pg.fields.map((f) => {
              const value = asDisplay(member.properties[f.property])
              return {
                property: f.property,
                // The Visualiser's colour channels read "R"/"G"/"B" here, matching
                // the editable form's ColorPicker. Every other field keeps the
                // label the catalog gave it (or the humanized property name).
                label: VISUALISATION_CHANNEL_LABELS[f.property] ?? f.label,
                // A file property (the Radiation spectral data file) holds a
                // stored PATH; show the file's name, the same thing the Materials
                // editor shows once it's uploaded and the same treatment the
                // texture row above already gets.
                value: f.datatype === 'file' && value !== '' ? fileDisplayName(value) : value
              }
            })
          }
        }
      )
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
  const deletingIds = useSelector(selectDeletingIds)
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
  // Backing for the picker's "+ Add New Material": the next free Material.NNN (the
  // same label the left panel's +Add Materials would use) and the create's status,
  // which guards a double click while the POST is in flight.
  const nextMaterialName = useSelector(selectNextMaterialName)
  const materialCreateStatus = useSelector(selectMaterialCreateStatus)

  // The material currently in the Materials section — the GET baseline, or the
  // one picked this session that replaced it. A ground carries at most one, so
  // this drives which popup row shows the tick. Kept as a Set because the draft
  // list is still modelled as an array (drag-drop and the GET both write it).
  const selectedMaterialIds = React.useMemo(
    () => new Set(draft.materials.map((m) => m.groupId)),
    [draft.materials]
  )

  // Picking a material row REPLACES whatever the draft held (the reducer swaps
  // the list rather than appending). Client-side only: Save is what unassigns the
  // material this one displaced and PATCHes the new pick, so abandoning the form
  // leaves the previously saved material untouched.
  const applyMaterialPick = (m: { id: string; name: string }): void => {
    dispatch(addDraftMaterial(m.id, m.name))
    // The pick is done, so dismiss the picker — the new row is already showing
    // under the Materials heading behind it. Lives here rather than in the popup
    // so the popup stays a dumb list and the open/closed state has a single owner.
    closeMaterialPopup()
  }

  const handleSelectMaterial = (m: { id: string; name: string }): void => {
    // Re-picking the row that's already ticked changes nothing — report it
    // rather than letting the click vanish.
    if (selectedMaterialIds.has(m.id)) {
      dispatch(showSnackbar(messages.materialAlreadyAssigned(draft.name), 'info'))
      closeMaterialPopup()
      return
    }
    // Picking is free: the swap is client-side and costs nothing until Save.
    // The replace confirmation belongs on Save, which is what actually unassigns
    // the displaced material on the backend.
    applyMaterialPick(m)
  }

  // The per-material trash icon. A material only in the draft (picked this session,
  // not in the baseline) is dropped immediately from the data; a material already
  // saved on the ground opens a confirm dialog, then a backend unassign DELETE.
  const [unassignTarget, setUnassignTarget] = React.useState<DraftMaterialGroup | null>(null)
  const handleDeleteMaterial = (m: DraftMaterialGroup): void => {
    if (draft.materialBaseline.includes(m.groupId)) setUnassignTarget(m)
    else dispatch(removeDraftMaterial(m.groupId))
  }
  const performUnassign = (): void => {
    if (!projectId || !scenarioId || !unassignTarget) return
    dispatch(
      unassignMaterialRequested(projectId, scenarioId, draft.objectId, unassignTarget.groupId)
    )
    setUnassignTarget(null)
  }

  // Resolve a group's members for the read-only popup. A material is assigned to a
  // ground with sync:true (see saga.updateObjectWorker), so it stays live-linked to
  // the library — the popup must show the material's CURRENT values, not the
  // snapshot the object GET baked into the ground when it loaded. So the Materials
  // library detail cache wins: it is refreshed write-through on every material edit
  // (reducer.refreshDetailCache), so a value just saved in the Materials editor
  // shows here immediately. The object GET's baseline is only the fallback until
  // that cache loads; else undefined = nothing loaded (openDetailPopup fetches it).
  const membersFor = (group: DraftMaterialGroup): PopupMaterialMember[] | undefined => {
    const detail = materialDetailsById[group.groupId]
    if (detail) {
      return detail.members.map((m) => ({
        materialTypeId: m.materialTypeId,
        properties: m.properties
      }))
    }
    if (group.materials) return group.materials
    return undefined
  }

  // …and the NAME to show for one, on exactly the same reasoning. The draft holds
  // a copy taken when the material was picked (or when the object GET loaded),
  // and that copy goes stale the moment the material is renamed in the Materials
  // panel — so the geometry went on showing the old name until the form was
  // closed and reopened. An assigned material is live-linked to the library, so
  // the library is the authority for its name just as it already is for its
  // values above.
  //
  // The draft's copy is the fallback for when the library has no answer, which is
  // NOT the case of a material deleted here — that one never reaches this code,
  // because the geometry slice purges the row from the draft and every cached
  // detail the moment REMOVE_MATERIAL lands (see reducer.ts). It covers the two
  // cases where a row outlives its library entry:
  //   • the moment before the library list arrives. Only <Materials/> fetches it,
  //     and though it mounts with the project screen, an object form open across
  //     that gap would otherwise render every assigned row BLANK for a frame.
  //   • a row the backend hands us already flagged `stale` (service.ts) — a
  //     material deleted in another session, which this client never saw removed.
  // In both, the name the row was assigned under is the only name there is.
  const libraryNamesById = React.useMemo(
    () => new Map(libraryMaterials.map((m) => [m.id, m.name])),
    [libraryMaterials]
  )
  const nameFor = (group: DraftMaterialGroup): string =>
    libraryNamesById.get(group.groupId) ?? group.name

  // The form's object was removed from the tree (deleted via the left panel)
  // while this form was open. It no longer exists on the backend, so editing /
  // saving it would 404 — lock the form down to a read-only "deleted" state and
  // let the user only dismiss it.
  const objectDeleted = !nodesById[draft.objectId]

  // This object's DELETE is in flight. The form now closes on DELETE_NODE_SUCCEEDED
  // rather than on the click, so it is still on screen while the request runs —
  // locking the trash keeps that from becoming a second, duplicate DELETE.
  const deleting = deletingIds.includes(draft.objectId)

  // Track which fields have been touched so "Required" errors only appear after
  // interaction rather than on first open.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  // Transient keystroke-guard errors (non-numeric / >7 decimals), keyed by
  // property. The offending keystroke is rejected before it reaches the draft,
  // so this lives in local state — not the Redux value — and clears on blur.
  // Mirrors Weather's CellInput guard, reusing the same decimalValidation util.
  const [guardErrors, setGuardErrors] = React.useState<Record<string, string | null>>({})
  // Properties whose value is mid-exponent ("1e", "1e-") because the user is
  // typing one. Set on keystroke, cleared on blur — see handleFieldChange.
  const [typingExponent, setTypingExponent] = React.useState<Record<string, boolean>>({})
  // Properties the user has actually typed into since their last blur. Blur
  // rewrites only a value the user touched: a stored 0.0000001 loads back as
  // "1e-7" (String() switches to exponent form below 1e-6, and 7 decimals is
  // exactly what the keystroke guard permits), and expanding that on a focus/blur
  // with NO typing rewrote the raw string sameValues compares — lighting Save up
  // on a form nobody had edited.
  //
  // A ref, not state: nothing renders from it, and reading a stale render closure
  // is precisely the bug it exists to prevent.
  const editedRef = React.useRef<Record<string, boolean>>({})
  // A different object is a different set of values; a flag left over from the
  // last one would expand an untouched field on this one exactly once.
  React.useEffect(() => {
    editedRef.current = {}
  }, [draft.objectId])
  // Why a Texture Repeat currently reads differently from what the user last
  // typed, keyed by property — set whenever the value is snapped to a valid one
  // (on commit, on a resolution change, or on open). Cleared as soon as that
  // field is edited again, so it always describes the value on screen.
  const [repeatNotes, setRepeatNotes] = React.useState<Record<string, string | null>>({})
  // The name is read-only until the pencil is tapped (spec: "edit icon which
  // should be tapped only to edit the name"); the trash icon's confirmation lives
  // here too (saved objects confirm before delete; brand-new ones discard).
  const [nameEditing, setNameEditing] = React.useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  const nameInputRef = React.useRef<HTMLInputElement>(null)

  // "Select Materials" popup — anchored just outside the right panel's left edge,
  // vertically following the Select button. AnchoredPopup measures the popup and
  // keeps it there as the window resizes, so nothing here knows its size.
  const selectBtnRef = React.useRef<HTMLButtonElement>(null)
  const [materialPopupOpen, setMaterialPopupOpen] = React.useState(false)
  const openMaterialPopup = (): void => {
    closeDetailPopup()
    setMaterialPopupOpen(true)
  }
  const closeMaterialPopup = (): void => setMaterialPopupOpen(false)

  // "+ Add New Material", from the picker's empty state — the same thing +Add
  // Materials does in the left panel: create an empty Material.NNN group on the
  // backend. The Materials reducer inserts the row, opens it as a draft and bumps
  // its open-nonce, which is what makes the right panel swap this form for the
  // material Properties form. Nothing material-specific is duplicated here.
  // The popup closes first: this form is about to be swapped out from under it.
  const handleAddNewMaterial = (): void => {
    if (materialCreateStatus === 'creating') return
    closeMaterialPopup()
    dispatch(createMaterialRequested(nextMaterialName))
  }

  // x from the panel's left edge, y from the Select button: the popup sits on the
  // strip beside the panel, level with the button. Re-read on every measure pass,
  // so both parts track independently as the layout moves. Falls back to the
  // button alone when there's no panel (unit tests render the form bare).
  const getSelectAnchorRect = React.useCallback((): AnchorRect | null => {
    const btn = selectBtnRef.current
    if (!btn) return null
    const b = btn.getBoundingClientRect()
    const panel = btn.closest('aside')?.getBoundingClientRect()
    return {
      top: b.top,
      height: b.height,
      left: panel?.left ?? b.left,
      width: panel?.width ?? b.width
    }
  }, [])

  // Read-only material properties popup — opened by clicking a picked material's
  // name. One nullable object rather than separate panel/material state: null =
  // closed (the same convention as materialPopupOpen above). We keep the panel
  // ELEMENT, not a rect, so AnchoredPopup can re-read it as the window resizes —
  // and because the panel outlives the row that was clicked, the popup survives
  // its material being removed from the list underneath it.
  const [detailPopup, setDetailPopup] = React.useState<{
    material: DraftMaterialGroup
    panel: HTMLElement | null
  } | null>(null)
  const closeDetailPopup = (): void => setDetailPopup(null)
  const openDetailPopup = (row: HTMLElement, material: DraftMaterialGroup): void => {
    // Both popups sit on the same strip beside the panel and each lays down its
    // own full-screen outside-click overlay — two open at once would stack
    // overlays over each other's contents. So they're mutually exclusive.
    closeMaterialPopup()
    // Load this material's CURRENT library properties whenever they aren't cached
    // yet — a freshly-picked group (no baseline), or an assigned one we've not
    // fetched this session (whose GET baseline may already be stale). The Materials
    // container caches the result and refreshes it on every edit, so the popup fills
    // in / updates on the next render. A stale group has no library entry to fetch,
    // so it keeps its baseline.
    if (!materialDetailsById[material.groupId] && !material.stale) {
      dispatch(loadMaterialDetailRequested(material.groupId))
    }
    setDetailPopup({ material, panel: row.closest('aside') })
  }

  // The popup is sized + centered against the 3D window, matching the Figma: a
  // tall panel ~80% of the window's height, vertically centered (equal gap top
  // and bottom). The right panel (this `aside`) is a flex sibling of the 3D
  // window in the same row, so it shares the window's top and height — reuse it
  // as the anchor rather than reaching across to the workspace. Centering in it
  // also keeps the popup well below the app's 45px `-webkit-app-region: drag`
  // title bar, which would otherwise swallow the close button's click. Fall back
  // to the viewport when there's no panel (e.g. unit tests).
  const detailPanel = detailPopup?.panel ?? null
  const getDetailAnchorRect = React.useCallback((): AnchorRect => {
    const panel = detailPanel?.getBoundingClientRect()
    if (panel) {
      return { top: panel.top, left: panel.left, width: panel.width, height: panel.height }
    }
    return {
      top: POPUP_GAP,
      left: window.innerWidth - POPUP_GAP,
      width: 0,
      height: window.innerHeight - POPUP_GAP * 2
    }
  }, [detailPanel])

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

  // The valid Texture Repeat values per axis: the divisors of that axis's ground
  // resolution (10 → 1, 2, 5, 10). Empty while a resolution is blank or
  // non-numeric — the signal that the constraint can't be evaluated yet, which
  // disables the steppers and suppresses snapping rather than guessing.
  const repeatDivisors = React.useMemo(() => {
    const byProperty: Record<string, readonly number[]> = {}
    for (const texProp of Object.keys(TEXTURE_RESOLUTION_CAP)) {
      byProperty[texProp] = divisorsOf(subdivisionCount(draft.values, texProp))
    }
    return byProperty
  }, [draft.values])

  // Re-check a repeat against a subdivision count that moved under it — the
  // user edited a resolution. The adjustment is applied AND reported: silently
  // leaving a value the engine would floor is exactly what this prevents.
  const reconcileRepeat = (values: Record<string, string>, property: string): void => {
    const adjustment = repeatAdjustment(values, property)
    if (!adjustment) return
    dispatch(setDraftValue(property, adjustment.value))
    setRepeatNotes((n) => ({ ...n, [property]: adjustment.note }))
  }

  // Repeats the form opened holding an invalid value — computed ONCE from the
  // values this draft mounted with (DraftForm is keyed by the open-nonce, so a
  // different object remounts and recomputes). Deliberately not derived on every
  // render: the effect below rewrites those values, which would make a
  // render-time derivation erase its own reason for existing.
  const [openAdjustments] = React.useState(() => openTimeRepeatAdjustments(draft.values))

  // Apply the open-time correction. The form reads as dirty afterwards even
  // though the user typed nothing — that's honest: the value on the backend is
  // not the one the engine would use. Dispatch only; the note comes from
  // `openAdjustments`, so no React state is set here.
  React.useEffect(() => {
    for (const [property, adjustment] of Object.entries(openAdjustments)) {
      dispatch(setDraftValue(property, adjustment.value))
    }
    // Open-time only. Later re-checks ride on the resolution field's blur, so
    // this must not re-run as the user edits.
  }, [dispatch, openAdjustments])

  // The note under a repeat field. An explicit entry in `repeatNotes` always
  // wins — including a null one, which is how an edit dismisses the open-time
  // note that has no other owner.
  const repeatNoteFor = (property: string): string | null =>
    property in repeatNotes ? repeatNotes[property] : (openAdjustments[property]?.note ?? null)

  // Snap a repeat to the value the engine would actually use. Runs on COMMIT
  // (blur / Enter / Save), never per keystroke: the valid set is the divisors of
  // the resolution, and a prefix of a valid value often isn't one. Across 21
  // subdivisions valid = 1, 3, 7, 21 — typing "21" passes through "2", so
  // per-keystroke snapping would rewrite it to 1 and make 21 untypeable.
  const commitRepeat = (property: string): void => {
    const divisors = repeatDivisors[property] ?? []
    const raw = (draft.values[property] ?? '').trim()
    // Nothing to snap to, or a state per-field validation already owns (blank →
    // "Required Field", junk → "Invalid Input"). Inventing a value there would
    // replace a clear error with a number the user never entered.
    if (divisors.length === 0 || raw === '') return
    const current = Number(raw)
    if (!Number.isFinite(current)) return
    const snapped = snapRepeat(current, divisors)
    if (snapped == null) return

    if (snapped === current) {
      // Already valid. Still normalise the text ("05" → "5") so the field shows
      // one canonical form, and drop any note left by an earlier snap.
      if (raw !== String(snapped)) dispatch(setDraftValue(property, String(snapped)))
      setRepeatNotes((n) => (n[property] ? { ...n, [property]: null } : n))
      return
    }

    dispatch(setDraftValue(property, String(snapped)))
    setRepeatNotes((n) => ({
      ...n,
      [property]:
        // Snapping UP happens only below the minimum, where there is no valid
        // value to come down to — cite the floor, not the divisor rule.
        current < snapped
          ? messages.repeatSnappedToMin(snapped)
          : messages.repeatSnapped(snapped, subdivisionCount(draft.values, property))
    }))
  }

  // Move a repeat to the neighbouring VALID value — the stepper chevrons and
  // ArrowUp/ArrowDown. Stepping by one would walk through values the engine
  // rejects, which is what makes the valid set undiscoverable in the first place.
  const stepRepeat = (property: string, direction: 1 | -1): void => {
    const divisors = repeatDivisors[property] ?? []
    if (divisors.length === 0) return
    const raw = (draft.values[property] ?? '').trim()
    // An empty field steps from below the range, so ▲ lands on the minimum.
    const current = raw === '' ? 0 : Number(raw)
    const target = direction === 1 ? nextValid(current, divisors) : prevValid(current, divisors)
    if (target == null) return
    dispatch(setDraftValue(property, String(target)))
    // The user moved it deliberately and can see where it landed — a "snapped"
    // note would be explaining something that didn't happen. An explicit null
    // (not a delete) so this also dismisses an open-time note, which lives
    // outside this map.
    setRepeatNotes((n) => (n[property] === null ? n : { ...n, [property]: null }))
    setTouched((t) => ({ ...t, [property]: true }))
  }

  // Block the keystroke when the in-progress value isn't numeric, or would add
  // an 8th decimal place — surfacing the matching message instead of storing it.
  const handleFieldChange = (property: string, next: string, isInteger: boolean): void => {
    if (!isPartialNumericInput(next)) {
      setGuardErrors((g) => ({ ...g, [property]: messages.inputNotSupported }))
      return
    }

    // Integer fields (e.g. Ground Resolution) take no decimal point — reject the
    // '.' KEYSTROKE itself rather than letting "1." commit and silently normalize
    // to a whole number that passes validation. Which means rejecting a value that
    // ADDS a '.' the field does not already have: testing next.includes('.') alone
    // rejected the whole VALUE, so once a '.' was in there (blur expanding a typed
    // "1e-3" into "0.001" put it there) every later keystroke still contained it
    // and was refused too — the box could not be edited, or even backspaced,
    // without a select-all. validateFieldValue still flags the '.'-bearing value
    // during render, so Save stays disabled the whole time it is there.
    const current = draft.values[property] ?? ''
    if (isInteger && next.includes('.') && !current.includes('.')) {
      setGuardErrors((g) => ({ ...g, [property]: messages.inputNotSupported }))
      return
    }

    if (exceedsMaxDecimals(next)) {
      setGuardErrors((g) => ({ ...g, [property]: messages.decimalLimit }))
      return
    }
    if (guardErrors[property]) setGuardErrors((g) => ({ ...g, [property]: null }))
    // "1e" / "1e-" is a number the user is still typing, not a broken one. Record
    // it so the render below can hold the "This input is not supported" message
    // back until the run ends — Number("1e") is NaN, so without this an error
    // flashes the moment 'e' is pressed and clears on the very next keystroke.
    // Only ever set from a keystroke, and cleared on blur, so a field genuinely
    // LEFT at "1e" still reports (same lifecycle as guardErrors).
    setTypingExponent((t) => ({ ...t, [property]: isIncompleteExponent(next) }))
    // This keystroke reached the draft, so the blur that ends this run has
    // something of the user's to normalize. See editedRef.
    editedRef.current[property] = true
    // A snap note describes the value on screen; editing that value makes it
    // stale, so it goes on the first keystroke rather than lingering over a
    // number it no longer explains. Writing an explicit null (rather than
    // deleting the key) is also what dismisses an open-time note, which lives
    // outside this map. Skipped once already null, so this doesn't re-render on
    // every subsequent keystroke.
    if (isRepeatProperty(property) && repeatNotes[property] !== null) {
      setRepeatNotes((n) => ({ ...n, [property]: null }))
    }
    dispatch(setDraftValue(property, next))
  }

  const handleFieldBlur = (property: string): void => {
    // Drop the transient guard error; committed-value validation takes over.
    if (guardErrors[property]) setGuardErrors((g) => ({ ...g, [property]: null }))
    setTouched((t) => ({ ...t, [property]: true }))
    // The typing run is over: an unfinished "1e" now gets its error. Runs before
    // the repeat branch below returns — a Texture Repeat left mid-exponent has to
    // surface its error too, and an early return here would suppress it forever.
    setTypingExponent((t) => ({ ...t, [property]: false }))
    // Show scientific notation in the decimal form it will actually be stored as,
    // so "1e3" reads back as "1000" HERE rather than silently on the next load
    // (the saga's Number() already converts it on save — the user just never saw
    // it happen). Expansion is value-preserving, so the error computed during
    // render is the same before and after.
    //
    // Writes the value directly rather than going through handleFieldChange, which
    // would re-enter the guard chain on text that is already known-numeric.
    //
    // …but ONLY for a field the user actually typed into this time round. A
    // focus/blur with no typing has to leave the value byte-identical, or the
    // raw-string dirty check reads the rewrite as an edit. There is nothing to
    // preview for a value that has already been through the backend anyway.
    const wasEdited = editedRef.current[property] === true
    editedRef.current[property] = false
    if (wasEdited) {
      const raw = draft.values[property] ?? ''
      const expanded = expandForDisplay(raw)
      if (expanded !== raw) dispatch(setDraftValue(property, expanded))
    }

    // Blur is the commit point for the divisor rule, in both directions:
    // leaving a REPEAT snaps it, and leaving a RESOLUTION re-checks the repeat
    // that depends on it. Per keystroke would break both — typing "10" passes
    // through "1", which would drag the repeat down to 1 mid-edit.
    //
    // Runs AFTER the expansion above, and unconditionally — not under `wasEdited`.
    // A repeat commits on every blur, typed into or not; that is what snaps a
    // value the backend stored but the engine would floor. commitRepeat reads the
    // pre-expansion string from this render's closure, but it goes through
    // Number(), so "1e1" and "10" snap identically — and it writes String(snapped),
    // which is already the expanded form.
    if (isRepeatProperty(property)) {
      commitRepeat(property)
      return
    }
    const dependent = RESOLUTION_DEPENDENT_REPEAT[property]
    if (dependent) reconcileRepeat(draft.values, dependent)
  }

  // Chromium selects the whole value when you TAB into a text input; collapse that
  // to a caret-at-end so tabbing focuses the field without highlighting its value.
  // A click sets its own caret (not a full selection), so it's left untouched.
  const caretToEndOnTabFocus = (
    e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    const el = e.currentTarget
    if (!(el instanceof HTMLInputElement)) return
    requestAnimationFrame(() => {
      if (el.selectionStart === 0 && el.selectionEnd === el.value.length && el.value.length > 0) {
        try {
          el.setSelectionRange(el.value.length, el.value.length)
        } catch {
          // Input type doesn't support selection ranges — nothing to collapse.
        }
      }
    })
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

  // Saving would unassign a material the ground actually carries and put another
  // in its place — the same pair the save saga acts on (a newly picked group ∧ a
  // baseline group no longer in the draft). Picking is reversible until this
  // point, so this is where the replace is confirmed.
  const [confirmReplaceOpen, setConfirmReplaceOpen] = React.useState(false)
  const saveReplacesMaterial =
    draft.materials.some((m) => !draft.materialBaseline.includes(m.groupId)) &&
    draft.materialBaseline.some((id) => !draft.materials.some((m) => m.groupId === id))

  const performSave = (): void => {
    if (!projectId || !scenarioId) return
    // Defensive: every real route to Save blurs the focused field first (a
    // click, Tab, or Enter), so a pending repeat has already snapped. This
    // covers the routes that don't — and guarantees we never PATCH a repeat the
    // engine would floor behind the user's back.
    for (const property of Object.keys(TEXTURE_RESOLUTION_CAP)) commitRepeat(property)
    dispatch(updateObjectRequested(projectId, scenarioId))
  }

  const onSave = (): void => {
    // Save is disabled while the form is invalid; this guard is defensive.
    if (!valid || objectDeleted || !projectId || !scenarioId) return
    if (saveReplacesMaterial) {
      setConfirmReplaceOpen(true)
      return
    }
    performSave()
  }

  const confirmReplaceMaterial = (): void => {
    setConfirmReplaceOpen(false)
    performSave()
  }

  // Trash icon. Always confirm first — for both brand-new (in-progress) and
  // already-saved grounds — so a stray tap can't silently wipe a geometry, and
  // the delete is always an explicit, visible action rather than an instant
  // close. Confirming runs performDelete, which only fires the delete.
  const onDeleteClick = (): void => {
    if (objectDeleted || deleting) return
    setConfirmDeleteOpen(true)
  }

  // The panel is NOT closed here: the delete is pessimistic, and closing up front
  // left a failed delete with the row still in the tree and the panel gone. The
  // reducer closes this form on DELETE_NODE_SUCCEEDED instead — so the panel goes
  // only once the object is really gone, whether the delete came from here or from
  // the left-panel tree row. Mirrors the Materials form's header trash.
  const performDelete = (): void => {
    if (deleting) return
    if (!objectDeleted && projectId && scenarioId) {
      dispatch(deleteNodeRequested(projectId, scenarioId, draft.objectId))
    }
    setConfirmDeleteOpen(false)
  }

  // The note lines under the Texture Repeat row. Rendered FULL WIDTH below the
  // 2-column grid rather than inside a cell — "Snapped to 5 (must divide
  // Resolution of 10)" doesn't fit half a panel column. Returns null for every
  // other group, so the generic layout above is untouched.
  //
  // There is deliberately no standing "Valid: 1, 2, 5, 10" helper line: the
  // stepper is what makes the valid values discoverable, and a permanent list
  // beside it was only restating what stepping already shows.
  const renderRepeatFooter = (group: ResolvedFormGroup): React.JSX.Element | null => {
    const fields = group.fields.filter((f) => isRepeatProperty(f.property))
    if (fields.length === 0) return null

    const notes = fields
      .map((field) => ({ label: field.label, note: repeatNoteFor(field.property) }))
      .filter((entry): entry is { label: string; note: string } => entry.note != null)

    if (notes.length === 0) return null

    return (
      <div className="mt-1 flex flex-col gap-0.5">
        {notes.map((n) => (
          // role="status" (polite) because the value changed without the user
          // asking — a screen reader gets told what happened, the same as a
          // sighted user reading the line.
          <p key={n.label} role="status" className="text-[12px] leading-[16px] text-[#B54708]">
            {/* Prefixed with the axis whenever the row has both R and C, so the
                note names the field it belongs to. */}
            {fields.length > 1 ? `${n.label}: ${n.note}` : n.note}
          </p>
        ))}
      </div>
    )
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
              onMouseEnter={showFullTextOnHover}
              // truncate: an input clips a too-long name mid-letter. The
              // ellipsis says the name goes on, and the hover shows the rest.
              className={`w-full truncate rounded border bg-transparent py-0.5 ${
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
            disabled={objectDeleted || deleting}
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
              <p className="mb-1.5 text-[13px] font-medium leading-[20px] tracking-normal text-[#D3D3D3]">
                {group.heading}
                {/* The required marker sits on the HEADING, not the fields: the
                    heading is the group's name ("Position"), and its fields are
                    the axes of one value (X, Y, Z) whose own labels are sr-only.
                    Starring each box would repeat the same claim three times for
                    what the user reads as a single required entry. Shown when the
                    group holds any required field. */}
                {group.fields.some((field) => field.required) && (
                  <span className="text-red-400">*</span>
                )}
              </p>
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
                // Suppressed only while the flag AND the value agree a number is
                // mid-typing, so a flag that somehow outlived its typing run can
                // never hide a real error on its own.
                const midExponent = typingExponent[field.property] && isIncompleteExponent(value)
                const error =
                  guardErrors[field.property] ??
                  (showError && !midExponent
                    ? (validateFieldValue(field, value) ?? depErrors[field.property] ?? null)
                    : null)
                // Texture Repeat keeps the same numeric input, plus a stepper
                // that walks the VALID values. Everything about the constraint —
                // the valid set, the snap, the note — lives in the parent; the
                // field only reports blur/Enter and step requests.
                if (isRepeatProperty(field.property)) {
                  const divisors = repeatDivisors[field.property] ?? []
                  const current = value.trim() === '' ? 0 : Number(value.trim())
                  return (
                    <RepeatField
                      key={field.property}
                      property={field.property}
                      label={field.label}
                      value={value}
                      error={error ?? undefined}
                      disabled={objectDeleted}
                      canStepUp={nextValid(current, divisors) != null}
                      canStepDown={prevValid(current, divisors) != null}
                      onChange={(next) =>
                        handleFieldChange(field.property, next, field.datatype === 'integer')
                      }
                      onCommit={() => commitRepeat(field.property)}
                      onStep={(direction) => stepRepeat(field.property, direction)}
                      onBlur={() => handleFieldBlur(field.property)}
                      onFocus={caretToEndOnTabFocus}
                    />
                  )
                }
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
                      placeholder: trimText(field.label, placeholderCharsFor(group.columns)),
                      error: error ?? undefined,
                      // Surface validation as an in-cell info-icon tooltip
                      // (Weather's CellInput pattern) instead of a text line.
                      errorAsTooltip: true,
                      disabled: objectDeleted,
                      inputClassName: 'bg-[#121212]',
                      onChange: (e) =>
                        handleFieldChange(
                          field.property,
                          e.target.value,
                          field.datatype === 'integer'
                        ),
                      onBlur: () => handleFieldBlur(field.property),
                      onFocus: caretToEndOnTabFocus
                    }}
                  />
                )
              })}
            </div>
            {renderRepeatFooter(group)}
          </div>
        ))}

        {/* Materials row — "Materials" label + a 58×25 "Select" button that opens
            the material picker. 8px vertical padding keeps the 1px #424242 divider
            lines (border-y, border-app-border) 8px off the content, above and below. */}
        <div className="flex items-center justify-between border-y border-app-border py-2">
          <p className="text-[13px] font-medium leading-[20px] tracking-normal text-[#D3D3D3]">
            Materials
          </p>
          <button
            ref={selectBtnRef}
            type="button"
            disabled={objectDeleted}
            aria-expanded={materialPopupOpen}
            onClick={() => (materialPopupOpen ? closeMaterialPopup() : openMaterialPopup())}
            className="flex h-[25px] w-[58px] shrink-0 items-center justify-center rounded-[4px] border border-app-border bg-white text-[13px] font-normal leading-none text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
              // Borderless row (as before): the name (opens the read-only properties
              // popup) + a trash icon (removes a draft pick, or unassigns a saved one).
              // The hover highlight lives on the ROW so the whole row lights up —
              // name and trash together — not just up to the trash icon.
              <div
                key={m.groupId}
                // The focus ring lives on the ROW (focus-within), not the inner
                // name button — so tabbing shows ONE blue box around the full width
                // (name + trash). The inner buttons kill their own :focus-visible
                // ring inline (the global one in index.css is unlayered, so a
                // Tailwind outline-none utility can't override it). gap-2 == px-2 so
                // the trash sits with equal spacing on both sides.
                className="flex items-center gap-2 rounded px-2 hover:bg-white/5 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-[#245AC5]"
              >
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={detailPopup?.material.groupId === m.groupId}
                  // currentTarget IS the anchor, measured synchronously here — so a
                  // growing list of rows needs no ref map.
                  onClick={(e) => openDetailPopup(e.currentTarget, m)}
                  style={{ outline: 'none' }}
                  className="flex min-w-0 flex-1 items-center gap-[5px] py-2 text-left text-[13px] leading-[15px] text-white"
                >
                  <span className="min-w-0 flex-1 truncate" onMouseEnter={showFullTextOnHover}>
                    {nameFor(m)}
                  </span>
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
                <button
                  type="button"
                  aria-label={`Remove ${nameFor(m)}`}
                  onClick={() => handleDeleteMaterial(m)}
                  style={{ outline: 'none' }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-white/10"
                >
                  <img src={deleteIcon} alt="" aria-hidden="true" className="h-[18px] w-[18px]" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* "Select Materials" popup — level with the Select button, on the strip
            beside the panel, and it stays there as the window resizes. */}
        <AnchoredPopup
          open={materialPopupOpen}
          onClose={closeMaterialPopup}
          getAnchorRect={getSelectAnchorRect}
          placement="left-start"
          gap={POPUP_GAP}
        >
          {({ available }) => (
            <SelectMaterialsPopup
              // The WHOLE library, including the material already saved on the
              // ground — that row is the one carrying the tick, so filtering it
              // out (as the old add-only checkbox list did) would leave the
              // current selection invisible.
              materials={libraryMaterials.map((m) => ({
                id: m.id,
                name: m.name,
                selected: selectedMaterialIds.has(m.id)
              }))}
              onSelectMaterial={handleSelectMaterial}
              onAddNewMaterial={handleAddNewMaterial}
              // Shrink rather than overflow when the window is too short for the
              // popup's designed height; its list scrolls to absorb it.
              maxHeight={available.height}
            />
          )}
        </AnchoredPopup>

        {/* An assigned material's read-only properties — centred on the panel,
            mirroring the Select popup. Only one of the two is ever open. Sections
            come from the group's members (from the GET); a freshly-picked group
            has none yet, so the popup shows its empty state until the ground is
            reopened. */}
        <AnchoredPopup
          open={detailPopup !== null}
          onClose={closeDetailPopup}
          getAnchorRect={getDetailAnchorRect}
          placement="left"
          gap={POPUP_GAP}
        >
          {({ anchorRect, available }) =>
            detailPopup && (
              <MaterialPropertiesPopup
                name={nameFor(detailPopup.material)}
                sections={buildMaterialSections(
                  membersFor(detailPopup.material) ?? [],
                  materialTypes
                )}
                // Sized to the 3D window and re-derived as it resizes, capped to
                // what actually fits. The popup's body scrolls inside that height,
                // so a material with many parameter groups scrolls rather than
                // overflowing the panel.
                height={Math.min(
                  Math.round(anchorRect.height * DETAIL_POPUP_HEIGHT_RATIO),
                  available.height
                )}
                onClose={closeDetailPopup}
              />
            )
          }
        </AnchoredPopup>

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

      {/* Unassign confirmation — only shown for a material already saved on the
          ground (a draft-only pick is removed without this dialog). */}
      <Dialog
        isOpen={unassignTarget !== null}
        title={messages.unassignTitle}
        onClose={() => setUnassignTarget(null)}
      >
        <h3 className="text-base font-medium text-white">
          {messages.unassignHeading(unassignTarget ? nameFor(unassignTarget) : '')}
        </h3>
        <p className="text-sm text-neutral-400">{messages.unassignBody}</p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setUnassignTarget(null)}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
          >
            {messages.unassignCancel}
          </button>
          <button
            type="button"
            onClick={performUnassign}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
          >
            {messages.unassignConfirm}
          </button>
        </div>
      </Dialog>

      {/* Replace-material confirmation — raised by SAVE, the point at which the
          material already on the ground is actually unassigned. Cancel returns
          to the form with the pick intact, so nothing is lost either way. */}
      <Dialog
        isOpen={confirmReplaceOpen}
        title={messages.replaceMaterialTitle}
        onClose={() => setConfirmReplaceOpen(false)}
      >
        <p className="text-sm text-neutral-200">{messages.replaceMaterialHeading(draft.name)}</p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setConfirmReplaceOpen(false)}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
          >
            {messages.replaceMaterialCancel}
          </button>
          <button
            type="button"
            onClick={confirmReplaceMaterial}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500"
          >
            {messages.replaceMaterialConfirm}
          </button>
        </div>
      </Dialog>
    </div>
  )
}

export default ObjectPropertiesForm
