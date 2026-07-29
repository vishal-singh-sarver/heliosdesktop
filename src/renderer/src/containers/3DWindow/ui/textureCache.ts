import * as THREE from 'three'
import { BASE_URL } from 'utils/constants'
import { GEOMETRY_ROUTES } from '../api/endpoints'

// Module-scoped texture cache shared across all mesh instances so textures
// survive component remounts (e.g. tab switches, visibility toggles).
export const globalTextureCache = new Map<string, THREE.Texture>()

// Loads that have STARTED but not yet finished, with everyone waiting on each.
//
// The cache alone isn't enough: SceneContent mounts one ObjectMesh per object in
// a single pass, so objects sharing a texture all miss the (still empty) cache in
// the same tick and each fire their own request. That's N identical HTTP calls
// and N THREE.Texture objects for one image — and since only the last to finish
// takes the cache slot, the rest become unreachable and clearTextureCache() can
// never dispose them. Recording the in-flight load lets later callers queue on it.
const inFlightLoads = new Map<string, Array<(tex: THREE.Texture) => void>>()

export function getSceneTextureUrl(textureFile: string): string {
  return `${BASE_URL}${GEOMETRY_ROUTES.texture(textureFile)}`
}

/**
 * Load a scene texture through the global cache. `onLoad` fires only on a
 * fresh (async) load — cached textures are returned synchronously instead.
 * Concurrent callers for the same file share ONE request and all get the same
 * texture.
 */
export function loadSceneTexture(
  textureFile: string,
  onLoad: (tex: THREE.Texture) => void
): THREE.Texture | null {
  const cached = globalTextureCache.get(textureFile)
  if (cached) return cached

  // Someone already asked for this file and is still waiting — join them rather
  // than starting a second request for the same image.
  const waiting = inFlightLoads.get(textureFile)
  if (waiting) {
    waiting.push(onLoad)
    return null
  }
  inFlightLoads.set(textureFile, [onLoad])

  new THREE.TextureLoader().load(
    getSceneTextureUrl(textureFile),
    (tex) => {
      // Backend UVs are already V-flipped for Three.js; don't flip again.
      tex.flipY = false
      globalTextureCache.set(textureFile, tex)
      // Take the waiters BEFORE notifying: a callback can synchronously trigger
      // another loadSceneTexture for this file, which must see a settled cache
      // and no stale in-flight entry.
      const waiters = inFlightLoads.get(textureFile) ?? []
      inFlightLoads.delete(textureFile)
      for (const notify of waiters) notify(tex)
    },
    undefined,
    (err) => {
      // Without this the failure was completely silent: onLoad never fired, the
      // material kept a null map, and the surface rendered plain white with
      // nothing in the console — the symptom that hid a mangled texture path for
      // an entire debugging session. Clearing the in-flight entry also matters:
      // leaving it would make every later attempt queue behind a load that can
      // never resolve, so a transient failure would become permanent.
      inFlightLoads.delete(textureFile)
      console.error(`Failed to load scene texture: ${getSceneTextureUrl(textureFile)}`, err)
    }
  )
  return null
}

/** Dispose all cached textures and clear the cache. */
export function clearTextureCache(): void {
  for (const tex of globalTextureCache.values()) tex.dispose()
  globalTextureCache.clear()
  // Drop the waiters too, so a load still in flight when the scene is torn down
  // doesn't call back into materials that no longer exist. The request itself
  // still completes and caches its texture, so a later clear disposes it.
  inFlightLoads.clear()
}
