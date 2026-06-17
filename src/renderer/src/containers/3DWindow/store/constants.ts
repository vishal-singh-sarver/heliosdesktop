// ── Load individual object geometry (triggered by external panel) ────────────
export const LOAD_OBJECT_GEOMETRY_REQUESTED = 'app/3DWindow/LOAD_OBJECT_GEOMETRY_REQUESTED' as const

// Fired after an object's binary geometry has been fetched, parsed
// and stored in sceneCache — bumps geometryVersion so the viewport re-reads.
export const OBJECT_GEOMETRY_LOADED = 'app/3DWindow/OBJECT_GEOMETRY_LOADED' as const

// ── Load entire scene (all objects) ─────────────────────────────────────────
export const LOAD_SCENE_REQUESTED = 'app/3DWindow/LOAD_SCENE_REQUESTED' as const
export const LOAD_SCENE_SUCCEEDED = 'app/3DWindow/LOAD_SCENE_SUCCEEDED' as const
export const LOAD_SCENE_FAILED = 'app/3DWindow/LOAD_SCENE_FAILED' as const

// ── Scene selector (dropdown) ────────────────────────────────────────────────
export const SELECT_SCENE_OBJECT = 'app/3DWindow/SELECT_SCENE_OBJECT' as const
