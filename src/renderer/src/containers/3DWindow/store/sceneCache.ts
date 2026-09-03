import * as THREE from 'three'
import type { GpuGeometry } from '../api/geometryV2'
import type { PrimitiveInfo } from '../models/types'

const cache = new Map<number, PrimitiveInfo[]>()

// ── Wire format v2 ───────────────────────────────────────────────────────────
//
// Kept in its own map rather than converted into PrimitiveInfo[]: converting
// would rebuild exactly the per-vertex object graph v2 exists to avoid. An
// object is in one map or the other, never both.
interface GpuEntry {
  gpu: GpuGeometry
  // Computed ONCE, here, from the positions array. The v1 path recomputes scene
  // bounds by walking every vertex of every primitive on each geometryVersion
  // bump — about thirteen full passes during a twelve-object load. There is no
  // reason to pay that more than once per object.
  bounds: THREE.Box3
}

const gpuCache = new Map<number, GpuEntry>()

/** Axis-aligned bounds straight off the interleaved position array. */
function boundsOfPositions(positions: Float32Array): THREE.Box3 {
  const box = new THREE.Box3()
  if (positions.length === 0) return box
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  box.min.set(minX, minY, minZ)
  box.max.set(maxX, maxY, maxZ)
  return box
}

export function setObjectGpu(objectId: number, gpu: GpuGeometry): void {
  gpuCache.set(objectId, { gpu, bounds: boundsOfPositions(gpu.positions) })
}

export function getObjectGpu(objectId: number): GpuGeometry | undefined {
  return gpuCache.get(objectId)?.gpu
}

export function getObjectGpuBounds(objectId: number): THREE.Box3 | undefined {
  return gpuCache.get(objectId)?.bounds
}

/** Ids of every object holding v2 geometry, in insertion order. */
export function getCachedGpuIds(): number[] {
  return Array.from(gpuCache.keys())
}

/** Union of every cached object's bounds. A few boxes, not a few million verts. */
export function getGpuSceneBounds(): THREE.Box3 {
  const box = new THREE.Box3()
  for (const entry of gpuCache.values()) box.union(entry.bounds)
  return box
}

// ── Staleness token ──────────────────────────────────────────────────────────
//
// A binary fetch is slow and nothing cancels it, so a result can land long after
// the thing that asked for it stopped being true. Two ways that corrupted the
// scene, both reported from the app:
//
//   - The user closes an object's eye while its geometry is still downloading.
//     The fetch lands afterwards, re-adds the object, and the viewport shows
//     geometry whose toggle reads "hidden" — state the user cannot correct
//     without toggling twice.
//   - The user edits and saves the object while its geometry is downloading.
//     The save's own fetch joined the in-flight request (same URL) and so
//     returned the geometry from BEFORE the edit — the viewport kept the old
//     shape and the save looked like it had done nothing.
//
// Every object carries a generation, and the whole cache carries an epoch. Any
// event that makes an in-flight result obsolete bumps one of them. A fetch reads
// the token before it starts and its result is discarded unless the token still
// matches when it lands — so a late arrival is dropped instead of overwriting
// the scene.
const generation = new Map<number, number>()
let epoch = 0

/**
 * The current staleness token for one object.
 *
 * Capture before a fetch, compare after: a difference means something happened
 * meanwhile that the fetched bytes do not reflect.
 */
export function geometryToken(objectId: number): string {
  return `${epoch}:${generation.get(objectId) ?? 0}`
}

/**
 * Mark whatever is in flight for this object as obsolete.
 *
 * Called on every edit that changes the bytes the backend would return — a
 * property save, a material change — and on every hide, where the correct result
 * is no geometry at all.
 */
export function bumpGeometryGeneration(objectId: number): void {
  generation.set(objectId, (generation.get(objectId) ?? 0) + 1)
}

export function setObjectPrimitives(objectId: number, primitives: PrimitiveInfo[]): void {
  cache.set(objectId, primitives)
}

export function getObjectPrimitives(objectId: number): PrimitiveInfo[] | undefined {
  return cache.get(objectId)
}

export function removeObjectPrimitives(objectId: number): void {
  cache.delete(objectId)
  gpuCache.delete(objectId)
  // Hiding an object is exactly the case where a fetch already running for it
  // must not be allowed to land. Bumping here covers every caller that hides —
  // the eye toggle and the visibility-sync revert — rather than asking each to
  // remember.
  bumpGeometryGeneration(objectId)
}

/** Retrieve primitives for all cached objects combined. */
export function getAllCachedPrimitives(): PrimitiveInfo[] {
  const result: PrimitiveInfo[][] = []
  for (const primitives of cache.values()) {
    result.push(primitives)
  }
  return result.flat()
}

export function clearSceneCache(): void {
  // One epoch bump invalidates every object at once, including objects being
  // fetched for the very first time that have no generation entry yet. Without
  // it, a fetch started under the previous project could land in the new one.
  epoch += 1
  generation.clear()
  cache.clear()
  gpuCache.clear()
}
