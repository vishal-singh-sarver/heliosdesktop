import type { PrimitiveInfo } from '../models/types'

const cache = new Map<number, PrimitiveInfo[]>()

// Special key for the scene-level "All" geometry blob.
const SCENE_ALL_KEY = -1

export function setObjectPrimitives(objectId: number, primitives: PrimitiveInfo[]): void {
  cache.set(objectId, primitives)
}

export function getObjectPrimitives(objectId: number): PrimitiveInfo[] | undefined {
  return cache.get(objectId)
}

export function removeObjectPrimitives(objectId: number): void {
  cache.delete(objectId)
}

/** Store the full scene geometry (all objects combined). */
export function setSceneAllPrimitives(primitives: PrimitiveInfo[]): void {
  cache.set(SCENE_ALL_KEY, primitives)
}

/** Retrieve the full scene geometry. */
export function getSceneAllPrimitives(): PrimitiveInfo[] | undefined {
  return cache.get(SCENE_ALL_KEY)
}

export function clearSceneCache(): void {
  cache.clear()
}
