import { produce } from 'immer'
import type { MaterialsAction } from './actions'
import {
  ADD_LOCAL_MATERIAL,
  LIST_MATERIALS_FAILED,
  LIST_MATERIALS_REQUESTED,
  LIST_MATERIALS_SUCCEEDED,
  REMOVE_MATERIAL,
  RENAME_MATERIAL_FAILED,
  RENAME_MATERIAL_SUCCEEDED,
  SELECT_MATERIAL,
  SET_NAME_ERROR,
  SET_SEARCH_QUERY,
  TOGGLE_MATERIAL_VISIBILITY
} from './constants'
import type { Material } from './types'

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
}

export const initialState: MaterialsState = {
  byId: {},
  order: [],
  selectedId: null,
  searchQuery: '',
  loadStatus: 'idle',
  loadError: null,
  nameErrors: {}
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
    }
  })

export default materialsReducer
