import { produce, type Draft } from 'immer'
import type { MaterialsAction } from './actions'
import {
  ADD_PARAMETER_GROUP,
  CLEAR_CREATE_HIGHLIGHT,
  CLOSE_MATERIAL_DRAFT,
  CREATE_MATERIAL_FAILED,
  CREATE_MATERIAL_REQUESTED,
  CREATE_MATERIAL_SUCCEEDED,
  DELETE_MATERIAL_FAILED,
  DELETE_MATERIAL_REQUESTED,
  DELETE_PARAMETER_GROUP_FAILED,
  DELETE_PARAMETER_GROUP_REQUESTED,
  LIST_MATERIALS_FAILED,
  LIST_MATERIALS_REQUESTED,
  LIST_MATERIALS_SUCCEEDED,
  OPEN_SAVED_MATERIAL_FAILED,
  OPEN_SAVED_MATERIAL_LOADED,
  OPEN_SAVED_MATERIAL_REQUESTED,
  RECORD_RECENT_COLOR,
  REMOVE_MATERIAL,
  REMOVE_PARAMETER_GROUP,
  RENAME_MATERIAL_FAILED,
  RENAME_MATERIAL_SUCCEEDED,
  SAVE_PARAMETER_GROUP_FAILED,
  SAVE_PARAMETER_GROUP_REQUESTED,
  SAVE_PARAMETER_GROUP_SUCCEEDED,
  SELECT_MATERIAL,
  SET_MATERIAL_DRAFT_NAME,
  SET_NAME_ERROR,
  SET_PARAMETER_GROUP_TYPE,
  SET_PARAMETER_GROUP_VALUE,
  SET_SEARCH_QUERY,
  UPLOAD_TEXTURE_FAILED,
  UPLOAD_TEXTURE_REQUESTED,
  UPLOAD_TEXTURE_SUCCEEDED
} from './constants'
import {
  TEXTURE_PROPERTY,
  TEXTURE_TOGGLE_PROPERTY,
  VISUALISATION_CUSTOM_PROPERTIES
} from './materialBlueprint'
import { lowestFreeNumber } from './naming'
import { loadRecentColors, prependRecentColor } from './recentColors'
import type { RgbColor } from 'utils/color'
import type { Material, MaterialDraft, MaterialGroupDetail, MaterialParameterGroup } from './types'

export type { Material }

// A brand-new, unsaved "Parameter Group.0N" card.
const emptyCard = (id: number, number: number): MaterialParameterGroup => ({
  id,
  number,
  typeId: null,
  values: {},
  // Never saved, so there is nothing to compare against — Save opens up as soon
  // as the card is complete.
  savedValues: null,
  saved: false,
  saveStatus: 'idle',
  saveError: null,
  deleteStatus: 'idle',
  uploadStatus: 'idle',
  uploadError: null
})

// A write the BACKEND accepted, whose outcome could not be applied because the
// user has since opened a different material. The draft is gone, so there is
// nothing to update — but the cached detail is now a lie: it still describes the
// group as it was BEFORE the write, and openSavedMaterialWorker serves that cache
// instead of re-GETting. Dropping the entry is the honest move — the next click
// refetches and sees what the backend actually holds.
//
// Without this, a save that landed after a material switch was invisible until a
// full list reload (the reopened card showed pre-save values and read as clean),
// and a card whose first save landed that way stayed stashed as UNSAVED — so
// saving it again POSTed a member the group already had.
const invalidateDetailCache = (state: Draft<MaterialsState>, materialId: string): void => {
  delete state.detailsById[materialId]
}

// Apply `mutate` to ONE card of the open draft, but only when that draft is the
// material the action was raised for. `cardId` is a per-draft key that restarts
// at 1 for every material (see OPEN_SAVED_MATERIAL_LOADED), so a save/upload/
// delete that resolves after the user clicked a DIFFERENT material would
// otherwise find that material's card with the same id and apply another
// material's outcome to it — silently marking it saved, overwriting its baseline
// and, for an upload, writing the wrong texture path. Matching on `materialId`
// first drops the stale result instead. Returns whether it landed, so callers
// can skip follow-up work (e.g. the cache refresh) on a dropped one.
const withCard = (
  state: Draft<MaterialsState>,
  materialId: string,
  cardId: number,
  mutate: (card: Draft<MaterialParameterGroup>) => void
): boolean => {
  const d = state.editDraft
  if (!d || d.groupId !== materialId) return false
  const card = d.groups.find((g) => g.id === cardId)
  if (!card) return false
  mutate(card)
  return true
}

// Write-through cache refresh. After a card is saved or removed we already KNOW
// the group's persisted state — it is exactly the draft's SAVED cards — so we
// rewrite the cached detail from them instead of dropping it and forcing another
// GET on the next click. Mirrors Geometry, which likewise refreshes detailsById
// with the just-saved values rather than invalidating.
const refreshDetailCache = (state: Draft<MaterialsState>): void => {
  const d = state.editDraft
  if (!d) return
  state.detailsById[d.groupId] = {
    id: d.groupId,
    // The row is the source of truth for the name (a draft rename that the
    // backend rejected must not leak into the cache).
    name: state.byId[d.groupId]?.name ?? d.name,
    members: d.groups
      .filter((g): g is MaterialParameterGroup & { typeId: number } => g.saved && g.typeId != null)
      .map((g) => ({
        materialTypeId: g.typeId,
        // `savedValues`, NOT `values`: this cache stands in for a GET, so it must
        // hold what the backend confirmed. Only one card was just persisted, and
        // `values` on the others is live draft state — a sibling card edited but
        // not saved would have its pending edits cached as if they were stored,
        // and re-opening the material would show them as clean and saved while
        // the backend still had the old ones.
        // Match what a GET returns: blank fields aren't stored.
        properties: Object.fromEntries(
          Object.entries(g.savedValues ?? {}).filter(([, v]) => v !== '')
        )
      }))
  }
}

// ── State ──────────────────────────────────────────────────────────────────────

export interface MaterialsState {
  // Materials keyed by backend group id (as a string), with a separate display
  // order (oldest-first — the service re-orders the newest-first response, so a
  // newly created material appends at the bottom, matching Geometry).
  byId: Record<string, Material>
  order: string[]
  selectedId: string | null
  searchQuery: string
  loadStatus: 'idle' | 'loading' | 'loaded' | 'error'
  loadError: string | null
  // Backend rename-failure messages (e.g. duplicate name), keyed by material id.
  nameErrors: Record<string, string>
  // Fetched group details, cached by group id — clicking a material that was
  // already loaded reopens it from here instead of GETting it again (mirrors
  // Geometry's detailsById). A fresh list load, or any mutation to a group,
  // invalidates it so the next click refetches.
  detailsById: Record<string, MaterialGroupDetail>
  // The single material open in the right-panel Properties form, or null.
  // `editDraftNonce` is a monotonic open counter the RightPanel watches to
  // auto-expand.
  editDraft: MaterialDraft | null
  editDraftNonce: number
  // The id of a material whose detail is being FETCHED (a row click that missed
  // the cache), or null. Drives the right-panel "opening…" state so a slow GET
  // doesn't just leave the previous material on screen. Cleared when the open
  // resolves (loaded) or fails. A cached open sets and clears it in the same tick,
  // so it never flashes.
  openingId: string | null
  // +Add Materials creates the empty group on the backend; this gates the button
  // and surfaces a create failure.
  createStatus: 'idle' | 'creating' | 'error'
  createError: string | null
  // The material +Add Materials just created, so its row can flash the "just
  // appeared" cue. Cleared once the cue has run (the list dispatches it), so a
  // remount can't replay it.
  lastCreatedId: string | null
  // Ids of materials whose whole-material DELETE is in flight. The delete is
  // pessimistic (the row stays until success), so without this the trash stayed
  // live and a second confirm fired a second DELETE — which 404s on the
  // already-gone material. The row disables its trash while its id is here.
  deletingIds: string[]
  // The last list-level action that failed and has nowhere else to show: opening a
  // material (the GET) or deleting one. Both used to be announced by the saga and
  // received by nobody, so a failed row-click showed NOTHING — the panel simply
  // stayed on the previous material — and a failed delete left the row in place
  // unexplained. Cleared as soon as one of them next succeeds.
  actionError: string | null
  // The visualisation colour picker's "Used colors" — a GLOBAL, most-recent-first
  // history seeded from localStorage; a saga mirrors changes back to it.
  recentColors: RgbColor[]
}

export const initialState: MaterialsState = {
  byId: {},
  order: [],
  selectedId: null,
  searchQuery: '',
  loadStatus: 'idle',
  loadError: null,
  nameErrors: {},
  detailsById: {},
  editDraft: null,
  editDraftNonce: 0,
  openingId: null,
  createStatus: 'idle',
  createError: null,
  lastCreatedId: null,
  deletingIds: [],
  actionError: null,
  // Seed the picker history from localStorage at slice creation (guarded — falls
  // back to [] outside a browser). The selector fallback re-uses this object, so
  // the picker still reads the persisted list before the slice mounts.
  recentColors: loadRecentColors()
}

// ── Reducer ────────────────────────────────────────────────────────────────────

const materialsReducer = (
  state: MaterialsState = initialState,
  action: MaterialsAction
): MaterialsState =>
  produce(state, (draft) => {
    switch (action.type) {
      case LIST_MATERIALS_REQUESTED:
        draft.loadStatus = 'loading'
        draft.loadError = null
        break

      case LIST_MATERIALS_SUCCEEDED: {
        draft.byId = {}
        draft.order = []
        // A create never re-lists (see the saga), so any pending cue here belongs
        // to an earlier session of this list — forget it rather than flash a row
        // the user created long ago. Belt and braces for the timer-driven clear:
        // that one can't fire if the list unmounted mid-cue.
        draft.lastCreatedId = null
        draft.nameErrors = {} // ids are reloaded; any pending rename error is stale
        draft.detailsById = {} // a fresh load invalidates the cached group details
        draft.actionError = null // an open/delete failure can't outlive the list it referred to
        // A failed create belongs to the list as it was BEFORE this load — leaving
        // it set kept the banner up across a tab switch, complaining about an
        // attempt the user had long since moved on from.
        draft.createStatus = 'idle'
        draft.createError = null
        for (const material of action.payload) {
          draft.byId[material.id] = material
          draft.order.push(material.id)
        }
        if (draft.selectedId && !draft.byId[draft.selectedId]) draft.selectedId = null
        // Close the Properties form if its material no longer exists (e.g. it was
        // deleted elsewhere), so it can't edit a group that's gone.
        if (draft.editDraft && !draft.byId[draft.editDraft.groupId]) draft.editDraft = null
        // A fresh list invalidates any in-flight open (its cache is gone too).
        draft.openingId = null
        draft.loadStatus = 'loaded'
        draft.loadError = null
        break
      }

      case LIST_MATERIALS_FAILED:
        draft.loadStatus = 'error'
        draft.loadError = action.payload
        break

      // ── +Add Materials → create the empty group ────────────────────────────
      case CREATE_MATERIAL_REQUESTED:
        draft.createStatus = 'creating'
        draft.createError = null
        break

      case CREATE_MATERIAL_SUCCEEDED: {
        const { groupId, name } = action
        // The material now exists on the backend. Insert its row straight from
        // what we know rather than refetching the whole list — a list reload would
        // also wipe the detail cache. (Geometry does the same: it inserts the
        // object the POST returned instead of re-listing.) It goes to the BOTTOM of
        // the list, matching Geometry's +Ground, which appends the new object.
        draft.byId[groupId] = {
          id: groupId,
          name,
          materialTypeId: 0,
          materialType: '',
          preview: null,
          createdAt: ''
        }
        if (!draft.order.includes(groupId)) draft.order.push(groupId)
        // A freshly created group is EMPTY by definition, so its detail is already
        // known — seed the cache so clicking it later costs no GET.
        draft.detailsById[groupId] = { id: groupId, name, members: [] }
        // Open it with one blank card, ready to pick a material type.
        draft.editDraft = {
          groupId,
          name,
          nameError: null,
          groups: [emptyCard(1, 1)],
          nextGroupId: 2
        }
        draft.editDraftNonce += 1
        draft.selectedId = groupId
        draft.lastCreatedId = groupId
        draft.createStatus = 'idle'
        draft.createError = null
        break
      }

      case CLEAR_CREATE_HIGHLIGHT:
        draft.lastCreatedId = null
        break

      case CREATE_MATERIAL_FAILED:
        draft.createStatus = 'error'
        draft.createError = action.payload
        break

      case RENAME_MATERIAL_SUCCEEDED: {
        const material = draft.byId[action.id]
        if (material) material.name = action.name
        // Keep the open Properties form's header in sync with the row, and clear
        // any rejection it was showing — this name was accepted.
        if (draft.editDraft && draft.editDraft.groupId === action.id) {
          draft.editDraft.name = action.name
          draft.editDraft.nameError = null
        }
        // Keep the cached detail usable rather than dropping it — only its name
        // went stale.
        const cached = draft.detailsById[action.id]
        if (cached) cached.name = action.name
        delete draft.nameErrors[action.id]
        break
      }

      case RENAME_MATERIAL_FAILED:
        // A rejection for the material open in the right-panel form belongs to
        // that form — under its name field, where the refused text still sits.
        // The left row shows the committed (still valid) old name, so an error
        // beneath it would point at the wrong name and linger stale. Renames from
        // anywhere else (the row's own inline editor) surface on the row.
        if (draft.editDraft && draft.editDraft.groupId === action.id) {
          draft.editDraft.nameError = action.payload
        } else {
          draft.nameErrors[action.id] = action.payload
        }
        break

      case SET_NAME_ERROR:
        if (action.payload === null) delete draft.nameErrors[action.id]
        else draft.nameErrors[action.id] = action.payload
        break

      case OPEN_SAVED_MATERIAL_FAILED:
        // The fetch is over — stop the spinner and surface why. (Previously
        // dispatched into the void, so a failed open showed nothing at all.)
        draft.openingId = null
        draft.actionError = action.payload
        break

      case DELETE_MATERIAL_REQUESTED:
        // Mark the delete in flight so the row's trash disables — a pessimistic
        // delete leaves the row visible, and without this a second confirm fired a
        // second DELETE that 404'd on the already-gone material.
        if (!draft.deletingIds.includes(action.id)) draft.deletingIds.push(action.id)
        break

      case DELETE_MATERIAL_FAILED:
        // The material is still there — release its trash and surface why. (The
        // failure was previously dispatched into the void: the row silently stayed
        // with no explanation.)
        draft.deletingIds = draft.deletingIds.filter((i) => i !== action.id)
        draft.actionError = action.payload
        break

      case REMOVE_MATERIAL: {
        // A delete that landed clears the banner from any earlier failed attempt.
        draft.actionError = null
        draft.deletingIds = draft.deletingIds.filter((i) => i !== action.id)
        delete draft.byId[action.id]
        draft.order = draft.order.filter((i) => i !== action.id)
        delete draft.nameErrors[action.id]
        delete draft.detailsById[action.id]
        if (draft.selectedId === action.id) draft.selectedId = null
        if (draft.openingId === action.id) draft.openingId = null
        // Close the Properties form if it was editing the removed material.
        if (draft.editDraft && draft.editDraft.groupId === action.id) draft.editDraft = null
        break
      }

      case SELECT_MATERIAL:
        draft.selectedId = action.id
        break

      case SET_SEARCH_QUERY:
        draft.searchQuery = action.payload
        break

      // ── Right-panel material Properties form ───────────────────────────────
      case OPEN_SAVED_MATERIAL_REQUESTED:
        // Mark this row as opening so the right panel can show a spinner while the
        // GET is in flight. A cached open dispatches LOADED in the same tick, which
        // clears it before any render — so only a real fetch shows the spinner.
        draft.openingId = action.id
        break

      case OPEN_SAVED_MATERIAL_LOADED: {
        draft.openingId = null
        // A saved row was fetched — open it with one card per member, each
        // pre-selecting its material type, carrying its own stored values and
        // already marked `saved` (so its Save PATCHes and its Delete removes the
        // member on the backend).
        const { detail } = action
        // A material opened successfully — clear any earlier open/delete failure.
        draft.actionError = null
        // Cache it, so re-clicking this material reopens it without a second GET.
        draft.detailsById[detail.id] = detail

        const cards: MaterialParameterGroup[] = detail.members.map((member, index) => ({
          id: index + 1,
          number: index + 1,
          typeId: member.materialTypeId,
          values: { ...member.properties },
          // Opened straight from the backend, so it starts clean: Save stays
          // disabled until something actually changes.
          savedValues: { ...member.properties },
          saved: true,
          saveStatus: 'idle',
          saveError: null,
          deleteStatus: 'idle',
          uploadStatus: 'idle',
          uploadError: null
        }))

        // A group with no members (created by +Add Materials but never filled in,
        // then reopened after a refetch) would otherwise open with NO card at all —
        // no material-type Select to start from. Seed the same blank card +Add
        // Materials opens with.
        if (cards.length === 0) cards.push(emptyCard(1, 1))

        draft.editDraft = {
          groupId: detail.id,
          name: detail.name,
          nameError: null,
          groups: cards,
          nextGroupId: cards.length + 1
        }
        draft.editDraftNonce += 1
        break
      }

      case ADD_PARAMETER_GROUP: {
        // "+ Add Material Type" — append a new, empty card. Its display number
        // fills the lowest free slot (the Ground.NNN gap-filling rule), while its
        // `id` stays monotonic for stable React keys.
        const d = draft.editDraft
        if (d) {
          const number = lowestFreeNumber(d.groups.map((g) => g.number))
          d.groups.push(emptyCard(d.nextGroupId, number))
          d.nextGroupId += 1
        }
        break
      }

      case REMOVE_PARAMETER_GROUP: {
        const d = draft.editDraft
        // Guarded like the other card outcomes: a delete that resolves after the
        // user switched materials must not drop the same-numbered card here.
        if (d && d.groupId === action.materialId) {
          d.groups = d.groups.filter((g) => g.id !== action.cardId)
          // The group's members changed — rewrite its cached detail from the cards
          // that remain saved (no refetch needed; we know the new state).
          refreshDetailCache(draft)
        } else {
          // The member IS gone on the backend; we just can't see the draft to say
          // so. Leaving the cache would show the deleted member on reopen, and
          // editing it would PUT to a member that no longer exists.
          invalidateDetailCache(draft, action.materialId)
        }
        break
      }

      case SET_PARAMETER_GROUP_TYPE: {
        const card = draft.editDraft?.groups.find((g) => g.id === action.groupId)
        // Changing the type swaps the whole property set, so the old values are
        // meaningless — drop them. (A saved card's type is locked in the UI.)
        if (card && !card.saved) {
          card.typeId = action.typeId
          card.values = {}
          card.saveStatus = 'idle'
          card.saveError = null
        }
        break
      }

      case SET_PARAMETER_GROUP_VALUE: {
        const card = draft.editDraft?.groups.find((g) => g.id === action.groupId)
        if (card) {
          card.values[action.property] = action.value
          // Editing answers the failure — the message described the values as
          // they were, and pinning it under the card until the next round-trip
          // left the user correcting a field while still being told it was wrong.
          // SET_PARAMETER_GROUP_TYPE already clears these for the same reason.
          //
          // Keyed on the MESSAGE, not on saveStatus: a failed DELETE writes
          // `saveError` while deliberately leaving `saveStatus` idle, so a
          // status-gated clear never fired for it and its red text stuck around
          // — reading as a save failure — until the next save or reopen.
          if (card.saveError != null) {
            card.saveStatus = 'idle'
            card.saveError = null
          }
        }
        break
      }

      case DELETE_PARAMETER_GROUP_REQUESTED: {
        // Mark the delete in flight so the trash disables — without this a
        // double-click fired two DELETEs, and the second 404'd onto a card that
        // was already on its way out.
        withCard(draft, action.payload.groupId, action.payload.cardId, (card) => {
          card.deleteStatus = 'deleting'
          card.saveError = null
        })
        break
      }

      case SAVE_PARAMETER_GROUP_REQUESTED: {
        withCard(draft, action.payload.groupId, action.payload.cardId, (card) => {
          card.saveStatus = 'saving'
          card.saveError = null
        })
        break
      }

      case SAVE_PARAMETER_GROUP_SUCCEEDED: {
        const applied = withCard(draft, action.materialId, action.cardId, (card) => {
          // From here on this card updates (PATCH) rather than adds (POST).
          card.saved = true
          card.saveStatus = 'idle'
          card.saveError = null
          // What's on the backend is now what's on screen — the card is clean, so
          // Save closes again until the next edit.
          card.savedValues = { ...card.values }
        })
        // Refresh the cache with the values we just persisted, so re-opening this
        // material shows them without another GET. Only when the save actually
        // landed on the open draft — otherwise this would rewrite the cache of
        // whatever material happens to be open now. A dropped outcome invalidates
        // instead: the backend took the write, so the cached detail is stale.
        if (applied) refreshDetailCache(draft)
        else invalidateDetailCache(draft, action.materialId)
        break
      }

      case SAVE_PARAMETER_GROUP_FAILED: {
        withCard(draft, action.materialId, action.cardId, (card) => {
          card.saveStatus = 'error'
          card.saveError = action.payload
        })
        break
      }

      case DELETE_PARAMETER_GROUP_FAILED: {
        // The member is still there — release the trash and show why it stayed.
        // `saveStatus` is left alone: this was a delete, and flagging the card as
        // save-errored would disable a Save that never ran.
        withCard(draft, action.materialId, action.cardId, (card) => {
          card.deleteStatus = 'idle'
          card.saveError = action.payload
        })
        break
      }

      case SET_MATERIAL_DRAFT_NAME: {
        if (draft.editDraft) {
          draft.editDraft.name = action.name
          // Typing answers the rejection — it described the name as it was.
          draft.editDraft.nameError = null
        }
        break
      }

      case CLOSE_MATERIAL_DRAFT:
        // Closing the form discards any unsaved work — a card is only kept once its
        // own Save persists it to the backend.
        draft.editDraft = null
        draft.openingId = null
        break

      case RECORD_RECENT_COLOR:
        // Move the just-saved colour to the front of the history (de-duped,
        // capped). A saga mirrors the new list to localStorage.
        draft.recentColors = prependRecentColor(draft.recentColors, action.color)
        break

      // ── Visualiser texture upload ──────────────────────────────────────────
      // The upload endpoint (POST …/files/texture_file) both stores the file AND
      // persists the member in texture mode — CREATING it if missing. So a texture
      // upload IS the member's save+apply; there is no separate "add" step. These
      // cases drive `uploadStatus` (a distinct in-flight indicator, so the upload
      // completing doesn't trip the Save-completed fold) and, on success, reflect
      // the persisted member: switch to texture mode and mark the card SAVED so a
      // later Save UPDATES it (PUT) rather than trying to re-ADD it (POST → 409).
      case UPLOAD_TEXTURE_REQUESTED: {
        withCard(draft, action.payload.groupId, action.payload.cardId, (card) => {
          card.uploadStatus = 'uploading'
          card.uploadError = null
        })
        break
      }

      case UPLOAD_TEXTURE_SUCCEEDED: {
        const applied = withCard(draft, action.materialId, action.cardId, (card) => {
          card.uploadStatus = 'idle'
          card.uploadError = null
          // Reflect the member the upload persisted: texture mode on, colour
          // cleared, the returned path stored.
          card.values[TEXTURE_PROPERTY] = action.path
          card.values[TEXTURE_TOGGLE_PROPERTY] = 'true'
          for (const key of VISUALISATION_CUSTOM_PROPERTIES) card.values[key] = ''
          // The member now exists on the backend → future saves PATCH, not POST.
          card.saved = true
          // Snapshot AFTER the texture values land, so the card reads as clean
          // against what the upload persisted (Save stays shut until a real edit).
          card.savedValues = { ...card.values }
        })
        // The upload persisted the member, so a dropped outcome must invalidate
        // rather than leave a cache that predates the texture.
        if (applied) refreshDetailCache(draft)
        else invalidateDetailCache(draft, action.materialId)
        break
      }

      case UPLOAD_TEXTURE_FAILED: {
        withCard(draft, action.materialId, action.cardId, (card) => {
          card.uploadStatus = 'error'
          card.uploadError = action.payload
        })
        break
      }
    }
  })

export default materialsReducer
