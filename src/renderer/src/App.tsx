import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import projectBootSaga from './containers/ProjectBoot/saga'
import projectScreenReducer from './containers/ProjectScreen/reducer'
import projectScreenSaga from './containers/ProjectScreen/saga'
import threeDWindowReducer from './containers/3DWindow/store/reducer'
import threeDWindowSaga from './containers/3DWindow/store/saga'
import { openProject, scopeLost } from './containers/ProjectBoot/actions'
import type { RootState } from './store/reducers'
import HomePage from './containers/HomePage/Loadable'
import ProjectScreen from './containers/ProjectScreen/Loadable'
import OpeningLoader from './components/OpeningLoader'
import ScopeLostDialog from './components/OpeningLoader/ScopeLostDialog'
import SnackbarHost from './components/Snackbar/SnackbarHost'
import TruncationTooltip from './components/TruncationTooltip'
import { useInjectReducer } from './utils/injectReducer'
import { useInjectSaga } from './utils/injectSaga'
import { onScopeLost } from './utils/scopeError'
import { STORAGE_KEYS } from './utils/storageKeys'

function App(): React.JSX.Element {
  const dispatch = useDispatch()
  const screen = useSelector((state: RootState) => state.navigation.screen)

  // Injected here rather than in each container because the boot saga
  // dispatches into these two BEFORE any screen mounts — on a row click the
  // project screen does not exist yet, so a slice that waits for its own
  // component would never see the actions aimed at it. Injection is keyed and
  // idempotent, so the containers' own calls stay as harmless no-ops.
  //
  // Only these two: the boot touches projectScreen (setActiveProject,
  // listScenariosSucceeded) and threeDWindow (resetScene). Geometry and
  // Materials are injected by their own panels, which mount before anything
  // dispatches into them.
  useInjectReducer({ key: 'projectScreen', reducer: projectScreenReducer as Reducer })
  useInjectSaga({ key: 'projectScreen', saga: projectScreenSaga })
  useInjectReducer({ key: 'threeDWindow', reducer: threeDWindowReducer as Reducer })
  useInjectSaga({ key: 'threeDWindow', saga: threeDWindowSaga })
  useInjectSaga({ key: 'projectBoot', saga: projectBootSaga })

  // A failed call anywhere — REST, the raw binary fetch, or the init stream —
  // funnels through utils/scopeError, which decides whether the project on
  // screen has been deleted. This is the one place that turns that into state.
  React.useEffect(() => onScopeLost((loss) => dispatch(scopeLost(loss))), [dispatch])

  // Restart: navigationReducer opens straight to the project screen when both
  // ids were persisted, so the boot runs with the screen already behind the
  // loader. The ref keeps StrictMode's deliberate double-mount in dev from
  // starting a second load.
  const restoredRef = React.useRef(false)
  React.useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (screen !== 'project') return

    try {
      const projectId = localStorage.getItem(STORAGE_KEYS.activeProjectId)
      const scenarioId = localStorage.getItem(STORAGE_KEYS.activeScenarioId)
      if (projectId && scenarioId) dispatch(openProject(projectId))
    } catch {
      /* storage disabled — nothing to restore */
    }
  }, [dispatch, screen])

  return (
    <div className="flex flex-col h-screen bg-dark text-neutral-200 overflow-hidden">
      {screen === 'home' && <HomePage />}
      {screen === 'project' && <ProjectScreen />}
      {/* App-global toast outlet (material-assignment feedback, etc.). */}
      <SnackbarHost />
      {/* App-global outlet for the full text of any label `truncate` has cut off. */}
      <TruncationTooltip />
      {/* Owned by App, not by either screen: the loader covers the home page on
          a row click and the project screen on restart. */}
      <OpeningLoader />
      <ScopeLostDialog />
    </div>
  )
}

export default App
