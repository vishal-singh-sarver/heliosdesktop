/**
 * 3D viewport copy and expected scene figures.
 *
 * Mirrored BY HAND from the app, like every other file in this folder: a test
 * that imports the value it is checking cannot detect a change to that value.
 */

/**
 * Loading overlay copy — containers/3DWindow/messages.ts.
 *
 * The message KEYS are counter-intuitive and easy to mirror wrongly:
 * `objectLoading` renders "Loading geometry…" and `selectionLoading` renders
 * "Loading object…". All three end with U+2026, not three dots.
 *
 * `objectLoading` is UNREACHABLE in the shipped app — it is set only by
 * LOAD_OBJECT_GEOMETRY_REQUESTED, an action that is defined, reduced and watched
 * by a saga but never dispatched anywhere in src/. Recorded here so nobody
 * writes a test for it; see the DEVIATION note in tests/viewport.test.ts.
 */
export const VIEWPORT_MSG = {
  sceneLoading: 'Loading scene…',
  /** Shown while the SceneSelector loads a single object. */
  selectionLoading: 'Loading object…',
  /** DEAD: reachable only via an action nothing dispatches. */
  objectLoading: 'Loading geometry…'
} as const

/** SceneSelector — containers/3DWindow/messages.ts `sceneSelector.allOption`. */
export const SCENE_SELECTOR = {
  allOption: 'All'
} as const

/** Lighting mode buttons — the `title` on each, from LIGHTING_MODES. */
export const LIGHTING_MODE_TITLES = {
  flat: 'Flat shading (no lighting)',
  phong: 'Phong lighting',
  'phong-shadows': 'Phong lighting + shadows'
} as const

/** The mode the viewport starts in — SceneLighting.defaultLightingSettings. */
export const DEFAULT_LIGHTING_MODE = 'phong'

/**
 * Scene figures for ONE default ground.
 *
 * A default ground is 10x10 at resolution 1x1, which the backend builds as a
 * single textured Helios patch: 1 primitive, 4 vertices. computeStats then
 * counts a 4-vertex primitive as one quad and two triangles.
 *
 * General rule for a ground at resolution N (= resolution_x * resolution_y):
 *   primitives = N, vertices = 4N, triangles = 2N, quads = N
 *
 * Keep every test well under MAX_SAVEABLE_RESOLUTION_CELLS (100). That ceiling
 * also keeps every figure below 1000, which matters because the overlay renders
 * Primitives/Triangles/Vertices through formatNumber — at 1000 it collapses to
 * "1.0K" and stops being an exact oracle.
 */
export const DEFAULT_GROUND_STATS = {
  primitives: 1,
  vertices: 4,
  triangles: 2,
  quads: 1
} as const

/** Per-ground contribution, for building expectations across N grounds. */
export function expectedStatsForGrounds(count: number): {
  objects: number
  primitives: number
  triangles: number
  vertices: number
  quads: number
} {
  return {
    objects: count,
    primitives: DEFAULT_GROUND_STATS.primitives * count,
    triangles: DEFAULT_GROUND_STATS.triangles * count,
    vertices: DEFAULT_GROUND_STATS.vertices * count,
    quads: DEFAULT_GROUND_STATS.quads * count
  }
}
