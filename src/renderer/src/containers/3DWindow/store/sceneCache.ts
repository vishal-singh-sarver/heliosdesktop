import type { PrimitiveInfo } from '../models/types'

const cache = new Map<number, PrimitiveInfo[]>()

export function setObjectPrimitives(objectId: number, primitives: PrimitiveInfo[]): void {
  cache.set(objectId, primitives)
}

export function getObjectPrimitives(objectId: number): PrimitiveInfo[] | undefined {
  return cache.get(objectId)
}

export function removeObjectPrimitives(objectId: number): void {
  cache.delete(objectId)
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
  cache.clear()
}
