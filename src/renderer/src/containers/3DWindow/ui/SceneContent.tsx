import React, { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { PrimitiveInfo } from '../models/types'
import { meshReady } from '../store/actions'
import { getAllCachedPrimitives, getObjectPrimitives } from '../store/sceneCache'
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
  const dispatch = useDispatch()
  const scene = useSelector(selectScene)
  const selectedObjectId = useSelector(selectSelectedObjectId)

  // geometryVersion is the cache-invalidation signal: primitives live in
  // sceneCache (outside Redux), so re-read them whenever it bumps.
  const objects = useMemo<RenderableObject[]>(() => {
    if (selectedObjectId === null) {
      // "All" — combine all per-object cached primitives.
      const allPrimitives = getAllCachedPrimitives()
      if (allPrimitives.length > 0) {
        return [{ objectId: 'scene-all', primitives: allPrimitives }]
      }
    } else {
      // Individual object selected from dropdown.
      const objectPrimitives = getObjectPrimitives(selectedObjectId)
      if (objectPrimitives) {
        return [{ objectId: selectedObjectId, primitives: objectPrimitives }]
      }
    }

    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometryVersion proxies sceneCache contents
  }, [scene.objectIds, scene.geometryVersion, selectedObjectId])

  // Signal that meshes have been built and are ready to display.
  // This runs after the render that builds the geometry, so the canvas
  // content is committed before the loader overlay is removed.
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      dispatch(meshReady())
    })
    return () => cancelAnimationFrame(handle)
  }, [objects, dispatch])

  return (
    <>
      <SceneLighting />
      <SceneHelpers fitVersion={scene.fitVersion} />

      {objects.map((obj) => (
        <ObjectMesh key={obj.objectId} primitives={obj.primitives} />
      ))}
    </>
  )
}

export default SceneContent
