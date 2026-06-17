import * as THREE from 'three'
import { BASE_URL } from 'utils/constants'
import { GEOMETRY_ROUTES } from '../api/endpoints'

// Module-scoped texture cache shared across all mesh instances so textures
// survive component remounts (e.g. tab switches, visibility toggles).
export const globalTextureCache = new Map<string, THREE.Texture>()

export function getSceneTextureUrl(textureFile: string): string {
  return `${BASE_URL}${GEOMETRY_ROUTES.texture(textureFile)}`
}

/**
 * Load a scene texture through the global cache. `onLoad` fires only on a
 * fresh (async) load — cached textures are returned synchronously instead.
 */
export function loadSceneTexture(
  textureFile: string,
  onLoad: (tex: THREE.Texture) => void
): THREE.Texture | null {
  const cached = globalTextureCache.get(textureFile)
  if (cached) return cached

  new THREE.TextureLoader().load(getSceneTextureUrl(textureFile), (tex) => {
    // Backend UVs are already V-flipped for Three.js; don't flip again.
    tex.flipY = false
    globalTextureCache.set(textureFile, tex)
    onLoad(tex)
  })
  return null
}
