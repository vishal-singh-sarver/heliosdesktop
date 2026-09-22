import { api } from 'utils/api'
import { API_ROUTES } from 'utils/constants'
import type { MaterialTypeDef, ModelTypeDef, ObjectTypeDef } from './types'

// ── Catalog: object / material / model types ────────────────────────────────
//
// The data-types catalog is fetched separately (see Weather/service.ts —
// loadDataTypesRequest); these three siblings are loaded in parallel alongside
// it on ProjectScreen mount. Each endpoint returns its list under a snake_case
// key, which we unwrap here so the saga deals only in domain arrays.

export interface ObjectTypesResponse {
  object_types: ObjectTypeDef[]
}

export interface MaterialTypesResponse {
  material_types: MaterialTypeDef[]
}

export interface ModelTypesResponse {
  model_types: ModelTypeDef[]
}

export function loadObjectTypesRequest(): Promise<ObjectTypesResponse> {
  return api.get<ObjectTypesResponse>(API_ROUTES.catalog.objectTypes)
}

export function loadMaterialTypesRequest(): Promise<MaterialTypesResponse> {
  return api.get<MaterialTypesResponse>(API_ROUTES.catalog.materialTypes)
}

export function loadModelTypesRequest(): Promise<ModelTypesResponse> {
  return api.get<ModelTypesResponse>(API_ROUTES.catalog.modelTypes)
}
