import { createSelector } from 'reselect'
import { selectNodesById } from 'containers/Geometry/selectors'
import type { RootState } from 'store/reducers'
import type { SceneObject } from '../models/types'
import { initialState } from './reducer'
import type { ThreeDWindowState } from './types'

const selectDomain = (state: RootState): ThreeDWindowState => state.threeDWindow ?? initialState

export const selectScene = createSelector(selectDomain, (s) => s.scene)

export const selectSceneObjectIds = createSelector(selectScene, (s) => s.objectIds)

// The objects whose binary is on the wire, as a Set: every row of the Geometry
// tree asks about itself on every render, and a linear scan per row per render
// is what this avoids.
export const selectPendingObjectIds = createSelector(
  selectScene,
  (s) => new Set(s.pendingObjectIds)
)

export const selectGeometryVersion = createSelector(selectScene, (s) => s.geometryVersion)

export const selectSceneLoad = createSelector(selectDomain, (s) => s.sceneLoad)

// Derive the dropdown items from the Geometry container's node tree.
// Filters out groups and hidden objects — only visible leaf geometries appear.
export const selectSceneObjects = createSelector(selectNodesById, (nodesById): SceneObject[] => {
  const objects: SceneObject[] = []
  for (const node of Object.values(nodesById)) {
    if (node.kind !== 'group' && node.visibleInViewport) {
      objects.push({
        id: Number(node.id),
        name: node.name,
        object_type_id: node.kind === 'ground' ? 1 : 0
      })
    }
  }
  return objects
})

export const selectSelectedObjectId = createSelector(selectSceneLoad, (s) => s.selectedObjectId)

export const selectMeshReady = createSelector(selectSceneLoad, (s) => s.meshReady)
