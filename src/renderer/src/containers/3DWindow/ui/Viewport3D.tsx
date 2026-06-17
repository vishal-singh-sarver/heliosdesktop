import React from 'react'
import { useSelector } from 'react-redux'
import { selectSceneLoad, selectSceneObjects } from '../store/selectors'
import messages from '../messages'
import SceneCanvas from './SceneCanvas'
import SceneContent from './SceneContent'
import SceneSelector from './SceneSelector'

export function Viewport3D(): React.JSX.Element {
  const sceneLoad = useSelector(selectSceneLoad)
  const objects = useSelector(selectSceneObjects)

  const isLoading = sceneLoad.loading || sceneLoad.objectLoading

  return (
    <div className="relative h-full w-full">
      {!sceneLoad.selectionLoading && (
        <SceneCanvas>
          <SceneContent />
        </SceneCanvas>
      )}

      {/* Scene selector dropdown — top-left corner */}
      {objects.length > 0 && !isLoading && !sceneLoad.selectionLoading && (
        <div className="absolute left-3 top-3 z-10">
          <SceneSelector />
        </div>
      )}

      {/* Loading indicator (scene or object geometry fetch) */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/60">
          <div className="rounded bg-neutral-900/90 px-4 py-2 text-sm text-neutral-200">
            {sceneLoad.loading ? messages.viewport.sceneLoading : messages.viewport.objectLoading}
          </div>
        </div>
      )}

      {/* Selection loading — hide canvas entirely, show only the loader */}
      {sceneLoad.selectionLoading && (
        <div className="flex h-full w-full items-center justify-center bg-neutral-950">
          <div className="rounded bg-neutral-900/90 px-4 py-2 text-sm text-neutral-200">
            {messages.viewport.selectionLoading}
          </div>
        </div>
      )}

      {/* Error display */}
      {sceneLoad.error && (
        <div className="absolute left-3 top-12 z-10 rounded bg-red-900/80 px-3 py-1.5 text-sm text-red-100">
          {sceneLoad.error.message}
        </div>
      )}
    </div>
  )
}

export default Viewport3D
