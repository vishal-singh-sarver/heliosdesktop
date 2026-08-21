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
interface InFlightLoad {
  // Identity of the request that currently OWNS this entry. Handlers close over
  // the token they were started with and check it before touching anything, so a
  // superseded request cannot act on a later one's state — see loadSceneTexture.
  token: object
  waiters: Array<(tex: THREE.Texture) => void>
}
const inFlightLoads = new Map<string, InFlightLoad>()

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
    waiting.waiters.push(onLoad)
    return null
  }
  const entry: InFlightLoad = { token: {}, waiters: [onLoad] }
  inFlightLoads.set(textureFile, entry)

  // Both handlers below start by checking the entry is STILL this request's, and
  // that check is the whole point of the token.
  //
  // The map is keyed by filename alone, which says nothing about WHICH request is
  // waiting on it. clearTextureCache() empties the map while the requests it
  // started are still in flight — loadSceneWorker clears at the top of every
  // scene load, and it is takeLatest, so a reload cancels the saga but not the
  // images already on the wire. The next scene's meshes then miss the cache and
  // start a SECOND request for the same file, and the abandoned one landed on the
  // new one's entry:
  //
  //   • on failure it deleted that entry — so when the new request succeeded it
  //     read its waiters back as an empty list, notified nobody, and left every
  //     material for that file on a null map. A white surface, permanently, with
  //     a perfectly healthy 200 in the network tab.
  //   • on success it consumed those waiters and handed them the OLD texture,
  //     then deleted the entry; the new request's own texture took the cache slot
  //     with nothing pointing at it, so clearTextureCache later disposed the copy
  //     nobody was rendering and leaked the one everybody was.
  //
  // Comparing tokens makes a superseded request inert: it neither caches nor
  // notifies nor deletes, and disposes whatever it managed to fetch.
  const isCurrent = (): boolean => inFlightLoads.get(textureFile)?.token === entry.token

  new THREE.TextureLoader().load(
    getSceneTextureUrl(textureFile),
    (tex) => {
      if (!isCurrent()) {
        // Superseded: the scene that asked for this is gone, or a newer request
        // owns the file now. Dispose rather than cache — the current request is
        // the only one entitled to the cache slot, and keeping these bytes only
        // to be overwritten is the leak described above.
        tex.dispose()
        return
      }
      // Backend UVs are already V-flipped for Three.js; don't flip again.
      tex.flipY = false
      globalTextureCache.set(textureFile, tex)
      // Drop the entry BEFORE notifying: a callback can synchronously trigger
      // another loadSceneTexture for this file, which must see a settled cache
      // and no stale in-flight entry.
      inFlightLoads.delete(textureFile)
      for (const notify of entry.waiters) notify(tex)
    },
    undefined,
    (err) => {
      if (!isCurrent()) return
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
  // doesn't call back into materials that no longer exist. Emptying the map is
  // also what makes those requests read as superseded when they land, so nothing
  // they fetch reaches the next scene's cache.
  inFlightLoads.clear()
}
