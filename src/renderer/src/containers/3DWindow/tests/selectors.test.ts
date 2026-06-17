import type { RootState } from 'store/reducers'
import { initialState, initialSceneLoadState } from '../store/reducer'
import {
  selectGeometryVersion,
  selectScene,
  selectSceneLoad,
  selectSceneObjectIds
} from '../store/selectors'
import type { ThreeDWindowState } from '../store/types'

function makeState(threeDWindow?: ThreeDWindowState): RootState {
  return { navigation: { screen: 'project' }, threeDWindow } as unknown as RootState
}

describe('3DWindow selectors', () => {
  it('falls back to the initial state when the slice is not injected yet', () => {
    expect(selectSceneLoad(makeState())).toEqual(initialState.sceneLoad)
    expect(selectScene(makeState())).toEqual(initialState.scene)
  })

  it('selects the slice values when present', () => {
    const slice: ThreeDWindowState = {
      scene: { objectIds: [28, 30], geometryVersion: 5 },
      sceneLoad: { ...initialSceneLoadState, objectLoading: true }
    }
    const state = makeState(slice)

    expect(selectSceneLoad(state)).toEqual(slice.sceneLoad)
    expect(selectSceneObjectIds(state)).toEqual([28, 30])
    expect(selectGeometryVersion(state)).toBe(5)
  })
})
