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
    // Runnable simulation models (revision 5). Hierarchical — a model can have
    // submodels — but the GUI consumes only the top-level models; their ids key
    // visibility.models on geometry objects (§5).
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
    update: (projectId: string, scenarioId: string, objectId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}`,
    renameObject: (projectId: string, scenarioId: string, objectId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}/rename`,
    renameGroup: (projectId: string, scenarioId: string, groupId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/groups/${groupId}/rename`,
    // Group-level visibility (viewport / render / per-model) — the backend
    // cascades to the group's members. Body is nested under `visibility`.
    groupVisibility: (projectId: string, scenarioId: string, groupId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/groups/${groupId}/visibility`,
    remove: (projectId: string, scenarioId: string, objectId: string) =>
      `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}`
  }
} as const
