import React from 'react'
import { useSelector } from 'react-redux'
import { selectMeshReady, selectSceneLoad, selectSceneObjects } from '../store/selectors'
import messages from '../messages'
import SceneCanvas from './SceneCanvas'
import SceneContent from './SceneContent'
import SceneSelector from './SceneSelector'

export function Viewport3D(): React.JSX.Element {
  const sceneLoad = useSelector(selectSceneLoad)
  const meshReady = useSelector(selectMeshReady)
  const objects = useSelector(selectSceneObjects)

  const isFetching = sceneLoad.loading || sceneLoad.objectLoading || sceneLoad.selectionLoading
  const showLoader = isFetching || !meshReady

  return (
    <div className="relative h-full w-full">
      {/* Canvas is always mounted — never unmount/remount on tab or selection
          switches. The loader overlay hides it until meshes are ready. */}
      <SceneCanvas>
        <SceneContent />
      </SceneCanvas>

      {/* Scene selector dropdown — top-left corner */}
      {objects.length > 0 && !showLoader && (
        <div className="absolute left-3 top-3 z-10">
          <SceneSelector />
        </div>
      )}

      {/* Loading overlay — covers the canvas while geometry is being fetched
          or meshes are being rebuilt. Prevents visible flickering. */}
      {showLoader && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/60">
          <div className="rounded bg-neutral-900/90 px-4 py-2 text-sm text-neutral-200">
            {sceneLoad.loading
              ? messages.viewport.sceneLoading
              : sceneLoad.selectionLoading
                ? messages.viewport.selectionLoading
                : sceneLoad.objectLoading
                  ? messages.viewport.objectLoading
                  : messages.viewport.sceneLoading}
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
