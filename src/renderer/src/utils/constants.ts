// Base URL of your backend server.
// In dev, BASE_URL is empty — requests go to same-origin /api/* and are
// proxied to the real backend by Vite (see electron.vite.config.ts → server.proxy).
// In production, Electron loads from file:// and must hit the backend directly.
export const BASE_URL =
  (window as any).__APP_BASE_URL__ ?? (import.meta.env.DEV ? '' : import.meta.env.VITE_BACKEND_URL)

// ── Backend routes ────────────────────────────────────────────────────────────
//
// Single source of truth for every backend path the renderer calls. Paths are
// relative to BASE_URL and get prefixed inside utils/api.ts.
//
// Weather routes are scoped by (project_id, scenario_id) — exposed as
// builder functions so callers can't forget either.

export const API_ROUTES = {
  project: {
    create: '/api/project/create',
    recent: '/api/project/recent',
    delete: (projectId: string) => `/api/project/${projectId}`,
    update: (projectId: string) => `/api/project/${projectId}`,
    // Returns the project + its scenarios (each with weather_data_headers).
    // Used to bootstrap the active scenario id on project screen mount.
    get: (projectId: string) => `/api/project/${projectId}`
  },
  weather: {
    headers: (projectId: string, scenarioId: string) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/weather_data_header`,
    headerPatch: (projectId: string, scenarioId: string, headerId: number) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/weather_data_header/${headerId}`,
    headerDelete: (projectId: string, scenarioId: string, headerId: number) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/weather_data_header/${headerId}`,
    data: (projectId: string, scenarioId: string) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/getAllTimeSeriesData`,
    update: (projectId: string, scenarioId: string) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/update`,
    // Per-column update — the target column is identified by `columnId` in
    // the URL path, so it must not be repeated in the request body.
    updateCol: (projectId: string, scenarioId: string, columnId: number) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/updateCol/${columnId}`,
    add: (projectId: string, scenarioId: string) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/add`,
    addCol: (projectId: string, scenarioId: string) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/addCol`,
    addRow: (projectId: string, scenarioId: string) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/addRow`,
    deleteRow: (projectId: string, scenarioId: string) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/deleteRow`,
    delete: (projectId: string, scenarioId: string) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/delete`,
    uploadFile: (projectId: string, scenarioId: string) =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/uploadfile`,
    clearData: (projectId: string, scenarioId: string): string =>
      `/api/weather/project/${projectId}/scenario/${scenarioId}/clear_data`
  },
  catalog: {
    // Each data type carries its `units[]` inline, so a single round-trip on
    // ProjectScreen mount populates the entire catalog slice.
    dataTypes: '/api/data-types/',
    // The remaining catalogs are loaded in parallel alongside dataTypes on
    // ProjectScreen mount. Each returns a snake_case wire shape (id + nested
    // properties / submodels) consumed by the Geometry, Materials and Models
    // sections respectively.
    objectTypes: '/api/catalog/object-types',
    materialTypes: '/api/catalog/material-types',
    modelTypes: '/api/catalog/model-types'
  },
  // Geometry routes are scenario-scoped (like weather).
  geometry: {
    list: (projectId: string, scenarioId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects`,
    listGroups: (projectId: string, scenarioId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/groups`,
    createGroup: (projectId: string, scenarioId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/groups`,
    deleteGroup: (projectId: string, scenarioId: string, groupId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/groups/${groupId}/objects `,
    create: (projectId: string, scenarioId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects`,
    rename: (projectId: string, scenarioId: string, objectId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}`,
    // PATCH an object's name (separate from the properties update). Used by the
    // right-panel Save when the name field changed.
    renameObject: (projectId: string, scenarioId: string, objectId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}/rename`,
    // GET one object's full detail (properties + visibility). Used when a ground
    // is clicked in the tree to populate the right-panel form.
    getObject: (projectId: string, scenarioId: string, objectId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}`,
    // PATCH the object's properties / visibility / group (same path as remove,
    // different verb). Used by the right-panel Save.
    update: (projectId: string, scenarioId: string, objectId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}`,
    renameGroup: (projectId: string, scenarioId: string, groupId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/groups/${groupId}/rename`,
    // Group-level visibility (viewport / render / per-model) — the backend
    // cascades to the group's members. Body is nested under `visibility`.
    groupVisibility: (projectId: string, scenarioId: string, groupId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/groups/${groupId}/visibility`,
    remove: (projectId: string, scenarioId: string, objectId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}`
  },
  // Material library (§7) — project-scoped, persisted. Only `list` is wired for
  // now; create/rename/delete land with the right-panel material form later.
  materials: {
    list: (projectId: string) => `/api/materials/project/${projectId}/library`,
    create: (projectId: string) => `/api/materials/project/${projectId}/library`,
    rename: (projectId: string, materialId: string) =>
      `/api/materials/project/${projectId}/library/${materialId}/rename`,
    remove: (projectId: string, materialId: string) =>
      `/api/materials/project/${projectId}/library/${materialId}`
  }
} as const
