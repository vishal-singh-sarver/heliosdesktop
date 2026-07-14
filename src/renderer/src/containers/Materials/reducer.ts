import { produce, type Draft } from 'immer'
import type { MaterialsAction } from './actions'
import {
  ADD_PARAMETER_GROUP,
  CLOSE_MATERIAL_DRAFT,
  CREATE_MATERIAL_FAILED,
  CREATE_MATERIAL_REQUESTED,
  CREATE_MATERIAL_SUCCEEDED,
  DELETE_PARAMETER_GROUP_FAILED,
  LIST_MATERIALS_FAILED,
  LIST_MATERIALS_REQUESTED,
  LIST_MATERIALS_SUCCEEDED,
  OPEN_SAVED_MATERIAL_LOADED,
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
  TOGGLE_MATERIAL_VISIBILITY
} from './constants'
import { lowestFreeNumber } from './naming'
import type { Material, MaterialDraft, MaterialGroupDetail, MaterialParameterGroup } from './types'

export type { Material }

// A brand-new, unsaved "Parameter Group.0N" card.
const emptyCard = (id: number, number: number): MaterialParameterGroup => ({
  id,
  number,
  typeId: null,
  values: {},
  saved: false,
  saveStatus: 'idle',
  saveError: null
})

// The cards that exist ONLY on the client: a card the user added but never saved
// (blank, or filled in but not yet Saved). The backend knows nothing about them,
// so re-opening the material — which rebuilds the form from the fetched members —
// would silently drop them. Stash them by group id whenever the open draft is
// replaced or closed; OPEN_SAVED_MATERIAL_LOADED restores them after the saved
// cards. A card that has since been saved is a real member and is excluded.
const stashUnsavedCards = (state: Draft<MaterialsState>): void => {
  const d = state.editDraft
  if (!d) return
  const unsaved = d.groups
    .filter((g) => !g.saved)
    .map((g) => ({ ...g, values: { ...g.values }, saveStatus: 'idle' as const, saveError: null }))
  if (unsaved.length > 0) state.unsavedById[d.groupId] = unsaved
  else delete state.unsavedById[d.groupId]
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
        // Match what a GET returns: blank fields aren't stored.
        properties: Object.fromEntries(Object.entries(g.values).filter(([, v]) => v !== ''))
      }))
  }
}

// ── State ──────────────────────────────────────────────────────────────────────

export interface MaterialsState {
  // Materials keyed by backend group id (as a string), with a separate display
  // order (newest-first from the backend).
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
  // Client-only parameter-group cards (added but never saved), by group id. The
  // backend has no record of them, so they are kept here across material switches
  // and restored when the material is re-opened.
  unsavedById: Record<string, MaterialParameterGroup[]>
  // The single material open in the right-panel Properties form, or null.
  // `editDraftNonce` is a monotonic open counter the RightPanel watches to
  // auto-expand.
  editDraft: MaterialDraft | null
  editDraftNonce: number
  // +Add Materials creates the empty group on the backend; this gates the button
  // and surfaces a create failure.
  createStatus: 'idle' | 'creating' | 'error'
  createError: string | null
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
  unsavedById: {},
  editDraft: null,
  editDraftNonce: 0,
  createStatus: 'idle',
  createError: null
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
        draft.nameErrors = {} // ids are reloaded; any pending rename error is stale
        draft.detailsById = {} // a fresh load invalidates the cached group details
        for (const material of action.payload) {
          draft.byId[material.id] = material
          draft.order.push(material.id)
        }
        if (draft.selectedId && !draft.byId[draft.selectedId]) draft.selectedId = null
        // Close the Properties form if its material no longer exists (e.g. it was
        // deleted elsewhere), so it can't edit a group that's gone.
        if (draft.editDraft && !draft.byId[draft.editDraft.groupId]) draft.editDraft = null
        // Unlike the detail cache, the client-only cards survive a refresh — the
        // backend never had them, so a re-list can't tell us anything new about
        // them. Only drop those whose material is gone.
        for (const id of Object.keys(draft.unsavedById)) {
          if (!draft.byId[id]) delete draft.unsavedById[id]
        }
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
        // The new material takes over the form — hold on to the previous one's
        // unsaved cards.
        stashUnsavedCards(draft)
        // The material now exists on the backend. Insert its row straight from
        // what we know rather than refetching the whole list — a list reload would
        // also wipe the detail cache. (Geometry does the same: it inserts the
        // object the POST returned instead of re-listing.) It's the newest, so it
        // goes to the top of the newest-first order.
        draft.byId[groupId] = {
          id: groupId,
          name,
          materialTypeId: 0,
          materialType: '',
          preview: null,
          createdAt: '',
          visible: true
        }
        if (!draft.order.includes(groupId)) draft.order.unshift(groupId)
        // A freshly created group is EMPTY by definition, so its detail is already
        // known — seed the cache so clicking it later costs no GET.
        draft.detailsById[groupId] = { id: groupId, name, members: [] }
        // Open it with one blank card, ready to pick a material type.
        draft.editDraft = { groupId, name, groups: [emptyCard(1, 1)], nextGroupId: 2 }
        draft.editDraftNonce += 1
        draft.selectedId = groupId
        draft.createStatus = 'idle'
        draft.createError = null
        break
      }

      case CREATE_MATERIAL_FAILED:
        draft.createStatus = 'error'
        draft.createError = action.payload
        break

      case RENAME_MATERIAL_SUCCEEDED: {
        const material = draft.byId[action.id]
        if (material) material.name = action.name
        // Keep the open Properties form's header in sync with the row.
        if (draft.editDraft && draft.editDraft.groupId === action.id) {
          draft.editDraft.name = action.name
        }
        // Keep the cached detail usable rather than dropping it — only its name
        // went stale.
        const cached = draft.detailsById[action.id]
        if (cached) cached.name = action.name
        delete draft.nameErrors[action.id]
        break
      }

      case RENAME_MATERIAL_FAILED:
        draft.nameErrors[action.id] = action.payload
        break

      case SET_NAME_ERROR:
        if (action.payload === null) delete draft.nameErrors[action.id]
        else draft.nameErrors[action.id] = action.payload
        break

      case REMOVE_MATERIAL: {
        delete draft.byId[action.id]
        draft.order = draft.order.filter((i) => i !== action.id)
        delete draft.nameErrors[action.id]
        delete draft.detailsById[action.id]
        // The material is gone, so its client-only cards have nothing to come back
        // to (the Properties form dispatches CLOSE before the delete lands, which
        // would otherwise have just stashed them).
        delete draft.unsavedById[action.id]
        if (draft.selectedId === action.id) draft.selectedId = null
        // Close the Properties form if it was editing the removed material.
        if (draft.editDraft && draft.editDraft.groupId === action.id) draft.editDraft = null
        break
      }

      case TOGGLE_MATERIAL_VISIBILITY: {
        const material = draft.byId[action.id]
        if (material) material.visible = !material.visible
        break
      }

      case SELECT_MATERIAL:
        draft.selectedId = action.id
        break

      case SET_SEARCH_QUERY:
        draft.searchQuery = action.payload
        break

      // ── Right-panel material Properties form ───────────────────────────────
      case OPEN_SAVED_MATERIAL_LOADED: {
        // A saved row was fetched — open it with one card per member, each
        // pre-selecting its material type, carrying its own stored values and
        // already marked `saved` (so its Save PATCHes and its Delete removes the
        // member on the backend).
        const { detail } = action
        // Switching materials replaces the form — keep the outgoing material's
        // unsaved cards so going back to it shows them again.
        stashUnsavedCards(draft)
        // Cache it, so re-clicking this material reopens it without a second GET.
        draft.detailsById[detail.id] = detail

        const cards: MaterialParameterGroup[] = detail.members.map((member, index) => ({
          id: index + 1,
          number: index + 1,
          typeId: member.materialTypeId,
          values: { ...member.properties },
          saved: true,
          saveStatus: 'idle',
          saveError: null
        }))

        // Re-attach this material's client-only cards after its saved ones. Their
        // ids and display numbers are reassigned around the members (a member may
        // have taken the number since), and one whose material type has since been
        // saved is dropped — the group can only hold a type once.
        const savedTypeIds = new Set(cards.map((c) => c.typeId))
        const usedNumbers = cards.map((c) => c.number)
        let nextId = cards.length + 1
        for (const stashed of draft.unsavedById[detail.id] ?? []) {
          if (stashed.typeId != null && savedTypeIds.has(stashed.typeId)) continue
          const number = lowestFreeNumber(usedNumbers)
          usedNumbers.push(number)
          cards.push({ ...stashed, values: { ...stashed.values }, id: nextId, number })
          nextId += 1
        }

        // A group with no members and nothing stashed (created by +Add Materials
        // but never filled in, then reopened after a refetch) would otherwise open
        // with NO card at all — no material-type Select to start from. Seed the
        // same blank card +Add Materials opens with.
        if (cards.length === 0) {
          cards.push(emptyCard(1, 1))
          nextId = 2
        }

        draft.editDraft = {
          groupId: detail.id,
          name: detail.name,
          groups: cards,
          nextGroupId: nextId
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
        if (d) {
          d.groups = d.groups.filter((g) => g.id !== action.groupId)
          // The group's members changed — rewrite its cached detail from the cards
          // that remain saved (no refetch needed; we know the new state).
          refreshDetailCache(draft)
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
        if (card) card.values[action.property] = action.value
        break
      }

      case SAVE_PARAMETER_GROUP_REQUESTED: {
        const card = draft.editDraft?.groups.find((g) => g.id === action.payload.cardId)
        if (card) {
          card.saveStatus = 'saving'
          card.saveError = null
        }
        break
      }

      case SAVE_PARAMETER_GROUP_SUCCEEDED: {
        const card = draft.editDraft?.groups.find((g) => g.id === action.cardId)
        if (card) {
          // From here on this card updates (PATCH) rather than adds (POST).
          card.saved = true
          card.saveStatus = 'idle'
          card.saveError = null
        }
        // Refresh the cache with the values we just persisted, so re-opening this
        // material shows them without another GET.
        refreshDetailCache(draft)
        break
      }

      case SAVE_PARAMETER_GROUP_FAILED:
      case DELETE_PARAMETER_GROUP_FAILED: {
        const card = draft.editDraft?.groups.find((g) => g.id === action.cardId)
        if (card) {
          card.saveStatus = 'error'
          card.saveError = action.payload
        }
        break
      }

      case SET_MATERIAL_DRAFT_NAME: {
        if (draft.editDraft) draft.editDraft.name = action.name
        break
      }

      case CLOSE_MATERIAL_DRAFT:
        // Closing the form is not discarding the work — the unsaved cards come
        // back when the material is opened again.
        stashUnsavedCards(draft)
        draft.editDraft = null
        break
    }
  })

export default materialsReducer
