import React, { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { PrimitiveInfo } from '../models/types'
import { meshReady } from '../store/actions'
import { getAllCachedPrimitives, getObjectPrimitives } from '../store/sceneCache'
import { selectScene, selectSelectedObjectId } from '../store/selectors'
import KeyboardShortcuts from './KeyboardShortcuts'
import ObjectMesh from './ObjectMesh'
import SceneHelpers from './SceneHelpers'
import type { LightingSettings } from './SceneLighting'
import SceneLighting from './SceneLighting'

interface RenderableObject {
  objectId: number | string
  primitives: PrimitiveInfo[]
}

interface SceneContentProps {
  lightingSettings: LightingSettings
  /** Scene stamp captured on reset-view; the grid shows default params for as
   *  long as it still matches the current scene. See SceneHelpers.gridStamp. */
  gridResetAt?: string | null
}

/** Everything inside the Canvas: lights, helpers, loaded objects. */
export function SceneContent({ lightingSettings, gridResetAt = null }: SceneContentProps): React.JSX.Element {
  const dispatch = useDispatch()
  const scene = useSelector(selectScene)
  const selectedObjectId = useSelector(selectSelectedObjectId)

  const objects = useMemo<RenderableObject[]>(() => {
    if (selectedObjectId === null) {
      const allPrimitives = getAllCachedPrimitives()
      if (allPrimitives.length > 0) {
        return [{ objectId: 'scene-all', primitives: allPrimitives }]
      }
    } else {
      const objectPrimitives = getObjectPrimitives(selectedObjectId)
      if (objectPrimitives) {
        return [{ objectId: selectedObjectId, primitives: objectPrimitives }]
      }
    }
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometryVersion proxies sceneCache contents
  }, [scene.objectIds, scene.geometryVersion, selectedObjectId])

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      dispatch(meshReady())
    })
    return () => cancelAnimationFrame(handle)
  }, [objects, dispatch])

  return (
    <>
      <SceneLighting settings={lightingSettings} />
      <SceneHelpers fitVersion={scene.fitVersion} selectedObjectId={selectedObjectId} geometryVersion={scene.geometryVersion} gridResetAt={gridResetAt} />

      {objects.map((obj) => (
        <ObjectMesh
          key={obj.objectId}
          primitives={obj.primitives}
          lightingMode={lightingSettings.mode}
        />
      ))}

      <KeyboardShortcuts />
    </>
  )
}

export default SceneContent
