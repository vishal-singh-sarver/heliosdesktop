import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { PrimitiveInfo } from '../models/types'
import { getObjectPrimitives, getSceneAllPrimitives } from '../store/sceneCache'
import { selectScene, selectSelectedObjectId } from '../store/selectors'
import ObjectMesh from './ObjectMesh'
import SceneHelpers from './SceneHelpers'
import SceneLighting from './SceneLighting'

interface RenderableObject {
  objectId: number | string
  primitives: PrimitiveInfo[]
}

/** Everything inside the Canvas: lights, helpers, loaded objects. */
export function SceneContent(): React.JSX.Element {
  const scene = useSelector(selectScene)
  const selectedObjectId = useSelector(selectSelectedObjectId)

  // geometryVersion is the cache-invalidation signal: primitives live in
  // sceneCache (outside Redux), so re-read them whenever it bumps.
  const objects = useMemo<RenderableObject[]>(() => {
    // Scene-level rendering: "All" or individual object from the scene dropdown.
    if (selectedObjectId === null) {
      // "All" — show the full scene blob if loaded.
      const scenePrimitives = getSceneAllPrimitives()
      if (scenePrimitives && scenePrimitives.length > 0) {
        return [{ objectId: 'scene-all', primitives: scenePrimitives }]
      }
    } else {
      // Individual object selected from dropdown.
      const objectPrimitives = getObjectPrimitives(selectedObjectId)
      if (objectPrimitives) {
        return [{ objectId: selectedObjectId, primitives: objectPrimitives }]
      }
    }

    // Fallback: individually loaded objects.
    return scene.objectIds.flatMap((objectId) => {
      const primitives = getObjectPrimitives(objectId)
      return primitives ? [{ objectId, primitives }] : []
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometryVersion proxies sceneCache contents
  }, [scene.objectIds, scene.geometryVersion, selectedObjectId])

  return (
    <>
      <SceneLighting />
      <SceneHelpers fitVersion={scene.geometryVersion} />

      {objects.map((obj) => (
        <ObjectMesh key={obj.objectId} primitives={obj.primitives} />
      ))}
    </>
  )
}

export default SceneContent
