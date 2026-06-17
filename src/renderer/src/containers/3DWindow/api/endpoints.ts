// Backend routes for the 3D window. Scoped by (project_id, scenario_id).

export const GEOMETRY_ROUTES = {
  // GET — binary primitive stream for one object (parsed by api/geometry.ts).
  objectGeometryBinary: (projectId: string, scenarioId: string, objectId: number) =>
    `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}/geometry/binary`,

  // GET — binary primitive stream for the entire scene (all objects combined).
  sceneGeometryBinary: (projectId: string, scenarioId: string) =>
    `/api/geometry/project/${projectId}/scenario/${scenarioId}/geometry/binary`,

  // GET — serve a texture referenced by a primitive's texture path.
  texture: (path: string) => `/api/textures/serve?path=${encodeURIComponent(path)}`
} as const
