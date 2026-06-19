// ── Load individual object geometry (triggered by external panel) ────────────
export const LOAD_OBJECT_GEOMETRY_REQUESTED = 'app/3DWindow/LOAD_OBJECT_GEOMETRY_REQUESTED' as const

// Fired after an object's binary geometry has been fetched, parsed
// and stored in sceneCache — bumps geometryVersion so the viewport re-reads.
export const OBJECT_GEOMETRY_LOADED = 'app/3DWindow/OBJECT_GEOMETRY_LOADED' as const

// Same as LOADED but without auto-selecting — used when geometry is cached
// silently in the background (create/update events).
export const OBJECT_GEOMETRY_CACHED = 'app/3DWindow/OBJECT_GEOMETRY_CACHED' as const

// ── Load entire scene (all objects) ─────────────────────────────────────────
export const LOAD_SCENE_REQUESTED = 'app/3DWindow/LOAD_SCENE_REQUESTED' as const
export const LOAD_SCENE_SUCCEEDED = 'app/3DWindow/LOAD_SCENE_SUCCEEDED' as const
export const LOAD_SCENE_FAILED = 'app/3DWindow/LOAD_SCENE_FAILED' as const

// ── Scene selector (dropdown) ────────────────────────────────────────────────
export const SELECT_SCENE_OBJECT = 'app/3DWindow/SELECT_SCENE_OBJECT' as const

// ── Object geometry removed (after delete) ──────────────────────────────────
export const OBJECT_GEOMETRY_REMOVED = 'app/3DWindow/OBJECT_GEOMETRY_REMOVED' as const

// ── Reset scene (project change) ─────────────────────────────────────────────
export const RESET_SCENE = 'app/3DWindow/RESET_SCENE' as const

// ── Mesh ready (viewport display signal) ────────────────────────────────────
export const MESH_READY = 'app/3DWindow/MESH_READY' as const
