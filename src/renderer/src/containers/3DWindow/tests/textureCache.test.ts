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

describe('loadSceneTexture — a request abandoned by a scene reload', () => {
  // loadSceneWorker clears the cache at the top of every scene load, and it is
  // takeLatest — so a reload cancels the saga but NOT the texture requests
  // already on the wire. The next scene's meshes miss the emptied cache and start
  // a second request for the same file, and for a moment two requests exist for
  // one map key. The map is keyed by filename alone, so the abandoned request used
  // to land on the live one's entry.

  // Reload mid-load: clear, then let the new scene ask for the same file.
  const reloadDuring = (file: string, onLoad: (tex: THREE.Texture) => void): void => {
    clearTextureCache()
    loadSceneTexture(file, onLoad)
  }

  it('does not strand the live request when the abandoned one FAILS', () => {
    // The rare white square. The old request's error handler deleted the map
    // entry — which by then belonged to the NEW request — so when the new request
    // succeeded it found no waiters, notified nobody, and left the material on a
    // null map. Permanently white, with a healthy 200 in the network tab.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    loadSceneTexture('dirt.jpg', () => {})

    const onLoad = vi.fn()
    reloadDuring('dirt.jpg', onLoad)
    expect(calls).toHaveLength(2)

    calls[0].onError(new Error('blip')) // the abandoned request dies
    const loaded = new THREE.Texture()
    calls[1].onLoad(loaded) // the live one succeeds

    expect(onLoad).toHaveBeenCalledWith(loaded)
    spy.mockRestore()
  })

  it('does not hand the live request the abandoned one’s texture', () => {
    // The mirror case. The old request's success consumed the new request's
    // waiters and deleted the entry, so the new texture took the cache slot with
    // nothing rendering it — clearTextureCache then disposed the unused copy and
    // leaked the one on screen.
    loadSceneTexture('dirt.jpg', () => {})

    const onLoad = vi.fn()
    reloadDuring('dirt.jpg', onLoad)

    const abandoned = new THREE.Texture()
    const dispose = vi.spyOn(abandoned, 'dispose')
    calls[0].onLoad(abandoned)

    // Inert: no callback, no cache slot, and its bytes released rather than left
    // for the live request to overwrite.
    expect(onLoad).not.toHaveBeenCalled()
    expect(globalTextureCache.has('dirt.jpg')).toBe(false)
    expect(dispose).toHaveBeenCalledTimes(1)

    // The live request still settles normally — cache and waiters both its own.
    const loaded = new THREE.Texture()
    calls[1].onLoad(loaded)
    expect(onLoad).toHaveBeenCalledWith(loaded)
    expect(globalTextureCache.get('dirt.jpg')).toBe(loaded)
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
