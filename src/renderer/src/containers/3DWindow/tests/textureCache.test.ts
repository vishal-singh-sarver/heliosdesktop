import * as THREE from 'three'
import { clearTextureCache, globalTextureCache, loadSceneTexture } from '../ui/textureCache'

// THREE.TextureLoader.load is the only I/O here. Capture each call so a test can
// settle it by hand, and count them — the count IS the thing under test.
type LoadCall = {
  url: string
  onLoad: (tex: THREE.Texture) => void
  onError: (err: unknown) => void
}
let calls: LoadCall[] = []

vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (
  this: THREE.TextureLoader,
  url: string,
  onLoad?: (tex: THREE.Texture) => void,
  _onProgress?: unknown,
  onError?: (err: unknown) => void
) {
  calls.push({
    url,
    onLoad: onLoad ?? ((): void => {}),
    onError: (onError ?? ((): void => {})) as (err: unknown) => void
  })
  return new THREE.Texture()
} as unknown as THREE.TextureLoader['load'])

beforeEach(() => {
  calls = []
  clearTextureCache()
})

describe('loadSceneTexture — one request per file', () => {
  it('fires a SINGLE request when several meshes ask for the same texture at once', () => {
    // SceneContent mounts one ObjectMesh per object in a single pass, so objects
    // sharing a texture all miss the still-empty cache in the same tick. Without
    // in-flight tracking that was one HTTP request (and one THREE.Texture) each.
    const got: THREE.Texture[] = []
    for (let i = 0; i < 5; i++) {
      expect(loadSceneTexture('dirt.jpg', (tex) => got.push(tex))).toBeNull()
    }

    expect(calls).toHaveLength(1)

    // Settling the one load notifies every waiter, with the SAME texture — so
    // there are no unreachable copies left holding GPU memory.
    const loaded = new THREE.Texture()
    calls[0].onLoad(loaded)

    expect(got).toHaveLength(5)
    expect(got.every((t) => t === loaded)).toBe(true)
    expect(globalTextureCache.get('dirt.jpg')).toBe(loaded)
  })

  it('serves later callers straight from the cache, with no further request', () => {
    loadSceneTexture('dirt.jpg', () => {})
    const loaded = new THREE.Texture()
    calls[0].onLoad(loaded)

    // A mesh mounting afterwards gets the texture synchronously.
    const onLoad = vi.fn()
    expect(loadSceneTexture('dirt.jpg', onLoad)).toBe(loaded)
    expect(onLoad).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
  })

  it('keeps separate files on separate requests', () => {
    loadSceneTexture('dirt.jpg', () => {})
    loadSceneTexture('grass.png', () => {})
    expect(calls).toHaveLength(2)
  })

  it('flips flipY off — the backend already V-flipped the UVs', () => {
    loadSceneTexture('dirt.jpg', () => {})
    const loaded = new THREE.Texture()
    loaded.flipY = true
    calls[0].onLoad(loaded)
    expect(loaded.flipY).toBe(false)
  })
})

describe('loadSceneTexture — failures', () => {
  it('reports a failed load instead of leaving the surface silently white', () => {
    // The material keeps a null map on failure and renders plain white; with no
    // onError handler at all there was nothing anywhere to say why.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    loadSceneTexture('missing.png', () => {})

    calls[0].onError(new Error('404'))

    expect(spy).toHaveBeenCalled()
    expect(String(spy.mock.calls[0][0])).toContain('missing.png')
    spy.mockRestore()
  })

  it('lets a later mount retry after a failure, rather than queueing forever', () => {
    // The in-flight entry has to be cleared on failure too — otherwise every
    // later caller waits on a load that can never resolve, turning a transient
    // error into a permanent one.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    loadSceneTexture('flaky.png', () => {})
    calls[0].onError(new Error('boom'))

    const onLoad = vi.fn()
    loadSceneTexture('flaky.png', onLoad)
    expect(calls).toHaveLength(2)

    const loaded = new THREE.Texture()
    calls[1].onLoad(loaded)
    expect(onLoad).toHaveBeenCalledWith(loaded)
    spy.mockRestore()
  })

  it('does not cache anything for a failed load', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    loadSceneTexture('missing.png', () => {})
    calls[0].onError(new Error('404'))
    expect(globalTextureCache.has('missing.png')).toBe(false)
    spy.mockRestore()
  })
})

describe('clearTextureCache', () => {
  it('disposes every cached texture and empties the cache', () => {
    loadSceneTexture('dirt.jpg', () => {})
    const loaded = new THREE.Texture()
    const dispose = vi.spyOn(loaded, 'dispose')
    calls[0].onLoad(loaded)

    clearTextureCache()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(globalTextureCache.size).toBe(0)
  })

  it('drops in-flight waiters so a torn-down scene gets no callbacks', () => {
    const onLoad = vi.fn()
    loadSceneTexture('dirt.jpg', onLoad)

    clearTextureCache()
    calls[0].onLoad(new THREE.Texture())

    // The material this belonged to is gone; calling back into it would write to
    // a disposed object.
    expect(onLoad).not.toHaveBeenCalled()
  })
})
