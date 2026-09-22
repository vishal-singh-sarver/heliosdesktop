import React, { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { PrimitiveInfo } from '../models/types'
import { meshReady } from '../store/actions'
import {
  getAllCachedPrimitives,
  getCachedGpuIds,
  getObjectGpu,
  getObjectPrimitives
} from '../store/sceneCache'
import { getGeometryFormat } from '../store/featureFlags'
import type { GpuGeometry } from '../api/geometryV2'
import { selectScene, selectSelectedObjectId } from '../store/selectors'
import KeyboardShortcuts from './KeyboardShortcuts'
import PerfProbe from '../perf/PerfProbe'
import GpuObjectMesh from './GpuObjectMesh'
import ObjectMesh from './ObjectMesh'
import SceneHelpers from './SceneHelpers'
import type { LightingSettings } from './SceneLighting'
import SceneLighting from './SceneLighting'

interface RenderableObject {
  objectId: number | string
  primitives: PrimitiveInfo[]
}

interface RenderableGpuObject {
  objectId: number
  gpu: GpuGeometry
}

interface SceneContentProps {
  lightingSettings: LightingSettings
}

/** Everything inside the Canvas: lights, helpers, loaded objects. */
export function SceneContent({ lightingSettings }: SceneContentProps): React.JSX.Element {
  const dispatch = useDispatch()
  const scene = useSelector(selectScene)
  const selectedObjectId = useSelector(selectSelectedObjectId)

  // v2 renders ONE mesh per object rather than one merged mesh for the scene.
  // That is not a stylistic choice: the payload arrays cannot be concatenated
  // without copying them, which is the cost v2 exists to avoid. It also fixes
  // the rebuild storm on its own — each entry's `gpu` reference is stable in the
  // cache, so an object that did not change does not rebuild when a sibling
  // lands, where the merged v1 path rebuilt everything N times per load.
  const gpuObjects = useMemo<RenderableGpuObject[]>(() => {
    if (getGeometryFormat() !== 'v2') return []
    const ids = selectedObjectId === null ? getCachedGpuIds() : [selectedObjectId]
    const out: RenderableGpuObject[] = []
    for (const id of ids) {
      const gpu = getObjectGpu(id)
      if (gpu) out.push({ objectId: id, gpu })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometryVersion proxies sceneCache contents
  }, [scene.objectIds, scene.geometryVersion, selectedObjectId])

  const objects = useMemo<RenderableObject[]>(() => {
    if (getGeometryFormat() === 'v2') return []
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
  }, [objects, gpuObjects, dispatch])

  return (
    <>
      <SceneLighting settings={lightingSettings} />
      <SceneHelpers fitVersion={scene.fitVersion} selectedObjectId={selectedObjectId} geometryVersion={scene.geometryVersion} />

      {objects.map((obj) => (
        <ObjectMesh
          key={obj.objectId}
          primitives={obj.primitives}
          lightingMode={lightingSettings.mode}
        />
      ))}

      {gpuObjects.map((obj) => (
        <GpuObjectMesh
          key={obj.objectId}
          gpu={obj.gpu}
          lightingMode={lightingSettings.mode}
        />
      ))}

      <KeyboardShortcuts />
      <PerfProbe />
    </>
  )
}

export default SceneContent
