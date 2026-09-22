// Backend routes for the 3D window. Scoped by (project_id, scenario_id).

export const GEOMETRY_ROUTES = {
  // GET — binary primitive stream for one object (parsed by api/geometry.ts).
  objectGeometryBinary: (projectId: string, scenarioId: string, objectId: number) =>
    `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}/geometry/binary`,

  // GET — wire format v2: GPU-ready typed arrays for one object, parsed by
  // api/geometryV2.ts. Same object, same scoping; a different packer.
  objectGeometryGpu: (projectId: string, scenarioId: string, objectId: number) =>
    `/api/geometry/project/${projectId}/scenario/${scenarioId}/objects/${objectId}/geometry/gpu`,

  // GET — serve a texture referenced by a primitive's texture path.
  texture: (path: string) => `/api/textures/serve?path=${encodeURIComponent(path)}`
} as const
