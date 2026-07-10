import { produce } from 'immer'
import type { MaterialsAction } from './actions'
import {
  ADD_LOCAL_MATERIAL,
  ADD_PARAMETER_GROUP,
  CLOSE_MATERIAL_DRAFT,
  LIST_MATERIALS_FAILED,
  LIST_MATERIALS_REQUESTED,
  LIST_MATERIALS_SUCCEEDED,
  OPEN_MATERIAL_DRAFT,
  REMOVE_MATERIAL,
  REMOVE_PARAMETER_GROUP,
  RENAME_MATERIAL_FAILED,
  RENAME_MATERIAL_SUCCEEDED,
  SAVE_MATERIAL_FAILED,
  SAVE_MATERIAL_REQUESTED,
  SAVE_MATERIAL_SUCCEEDED,
  SELECT_MATERIAL,
  SET_MATERIAL_DRAFT_NAME,
  SET_MATERIAL_DRAFT_VALUE,
  SET_NAME_ERROR,
  SET_PARAMETER_GROUP_TYPE,
  SET_SEARCH_QUERY,
  TOGGLE_MATERIAL_VISIBILITY
} from './constants'
import { lowestFreeNumber } from './naming'
import type { Material, MaterialDraft } from './types'

export type { Material }

// ── State ──────────────────────────────────────────────────────────────────────

export interface MaterialsState {
  // Materials keyed by id (backend integer-as-string, or `local-*` for unsaved
  // rows), with a separate display order (newest-first from the backend; local
  // adds append to the top).
  byId: Record<string, Material>
  order: string[]
  selectedId: string | null
  searchQuery: string
  loadStatus: 'idle' | 'loading' | 'loaded' | 'error'
  loadError: string | null
  // Backend rename-failure messages (e.g. duplicate name), keyed by material id.
  nameErrors: Record<string, string>
  // The single material open in the right-panel Properties form, or null. Mirrors
  // Geometry's createDraft. `editDraftNonce` is a monotonic open counter the
  // RightPanel watches to auto-expand (bumped on every OPEN_MATERIAL_DRAFT).
  editDraft: MaterialDraft | null
  editDraftNonce: number
  // Save Material (POST group) status + the backend failure message, shown under
  // the Save button. Reset whenever the Properties form opens/closes.
  saveStatus: 'idle' | 'saving' | 'error'
  saveError: string | null
}

export const initialState: MaterialsState = {
  byId: {},
  order: [],
  selectedId: null,
  searchQuery: '',
  loadStatus: 'idle',
  loadError: null,
  nameErrors: {},
  editDraft: null,
  editDraftNonce: 0,
  saveStatus: 'idle',
  saveError: null
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
        // Replace with the persisted library. Unsaved (local) rows are dropped —
        // they were never persisted, so a refresh legitimately loses them.
        draft.byId = {}
        draft.order = []
        draft.nameErrors = {} // ids are reloaded; any pending rename error is stale
        for (const material of action.payload) {
          draft.byId[material.id] = material
          draft.order.push(material.id)
        }
        if (draft.selectedId && !draft.byId[draft.selectedId]) draft.selectedId = null
        // A refresh drops unsaved (local) rows; close the Properties form if its
        // material no longer exists so it can't edit a row that's gone.
        if (draft.editDraft && !draft.byId[draft.editDraft.materialId]) draft.editDraft = null
        draft.loadStatus = 'loaded'
        draft.loadError = null
        break
      }

      case LIST_MATERIALS_FAILED:
        draft.loadStatus = 'error'
        draft.loadError = action.payload
        break

      case ADD_LOCAL_MATERIAL: {
        // Client-only placeholder until the create-form flow exists. Keyed by a
        // `local-` id and shown at the top, mirroring the backend's newest-first.
        const id = `local-${action.name}`
        if (!draft.byId[id]) {
          draft.byId[id] = {
            id,
            name: action.name,
            materialTypeId: 0,
            materialType: '',
            preview: null,
            createdAt: '',
            visible: true,
            local: true
          }
          draft.order.unshift(id)
        }
        draft.selectedId = id
        break
      }

      case RENAME_MATERIAL_SUCCEEDED: {
        const material = draft.byId[action.id]
        if (material) material.name = action.name
        // Keep the open Properties form's header in sync with the row.
        if (draft.editDraft && draft.editDraft.materialId === action.id) {
          draft.editDraft.name = action.name
        }
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
        if (draft.selectedId === action.id) draft.selectedId = null
        // Close the Properties form if it was editing the removed material.
        if (draft.editDraft && draft.editDraft.materialId === action.id) draft.editDraft = null
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

      // ── Right-panel material Properties draft ──────────────────────────────
      case OPEN_MATERIAL_DRAFT: {
        // Edit the row +Add Materials just appended (same `local-<name>` id).
        // Start with one empty "Parameter Group.01" so the form opens ready to
        // pick a material type.
        draft.editDraft = {
          materialId: `local-${action.name}`,
          name: action.name,
          groups: [{ id: 1, number: 1, typeId: null }],
          nextGroupId: 2,
          values: {}
        }
        draft.editDraftNonce += 1
        // A freshly opened form starts with a clean save slate.
        draft.saveStatus = 'idle'
        draft.saveError = null
        break
      }

      case ADD_PARAMETER_GROUP: {
        // "+ Add Material Type" — append a new, empty parameter group. Its display
        // number fills the lowest free slot (same gap-filling rule as Ground.NNN /
        // Material.NNN), while its `id` stays monotonic for stable React keys.
        const d = draft.editDraft
        if (d) {
          const number = lowestFreeNumber(d.groups.map((g) => g.number))
          d.groups.push({ id: d.nextGroupId, number, typeId: null })
          d.nextGroupId += 1
        }
        break
      }

      case REMOVE_PARAMETER_GROUP: {
        const d = draft.editDraft
        if (d) d.groups = d.groups.filter((g) => g.id !== action.groupId)
        break
      }

      case SET_PARAMETER_GROUP_TYPE: {
        const group = draft.editDraft?.groups.find((g) => g.id === action.groupId)
        if (group) group.typeId = action.typeId
        break
      }

      case SET_MATERIAL_DRAFT_VALUE: {
        if (draft.editDraft) draft.editDraft.values[action.property] = action.value
        break
      }

      case SET_MATERIAL_DRAFT_NAME: {
        if (draft.editDraft) draft.editDraft.name = action.name
        break
      }

      case CLOSE_MATERIAL_DRAFT:
        draft.editDraft = null
        draft.saveStatus = 'idle'
        draft.saveError = null
        break

      case SAVE_MATERIAL_REQUESTED:
        draft.saveStatus = 'saving'
        draft.saveError = null
        break

      case SAVE_MATERIAL_SUCCEEDED:
        // The list refresh + CLOSE_MATERIAL_DRAFT the saga dispatches next do the
        // visible work; just settle the status here.
        draft.saveStatus = 'idle'
        draft.saveError = null
        break

      case SAVE_MATERIAL_FAILED:
        draft.saveStatus = 'error'
        draft.saveError = action.payload
        break
    }
  })

export default materialsReducer
