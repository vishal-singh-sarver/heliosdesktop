import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import projectBootSaga from './containers/ProjectBoot/saga'
import projectScreenReducer from './containers/ProjectScreen/reducer'
import projectScreenSaga from './containers/ProjectScreen/saga'
import threeDWindowReducer from './containers/3DWindow/store/reducer'
import threeDWindowSaga from './containers/3DWindow/store/saga'
import { openProject, scopeLost } from './containers/ProjectBoot/actions'
import { navigate } from './store/navigationReducer'
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

  // ── Restart restore ────────────────────────────────────────────────────────
  //
  // navigationReducer opens straight to 'project' when both ids were persisted,
  // which mounted ProjectScreen in the FIRST frame — before the restore effect
  // below had even dispatched openProject. React runs child effects before
  // parent ones, so the whole screen's data load went out ahead of /init: the
  // four type catalogs, listScenarios (and the scene load it chains), and the
  // geometry tree. They did not corrupt anything — the backend's hydration lock
  // serialises them — they simply queued behind the very hydration they were
  // meant to run after. The loader hid that, but hiding a request is not the
  // same as not making it, and it defeated the point of running /init first and
  // alone (see ProjectBoot/saga's streamInit).
  //
  // So on this path those requests are held back until the boot settles, which
  // is what already happens on the Home path — there ProjectScreen does not
  // exist until reveal() navigates to it, after /init is done.
  //
  // What is held back is the point. This used to unmount the whole SCREEN, and
  // that overshot: the shell — header, project name, the empty panel frame —
  // fetches nothing, and unmounting it meant that on this path nothing at all
  // was mounted while /init ran. The splash comes down only when a screen
  // signals `app:ready`, so a slow /init (a large context.xml is legitimately
  // slow) left the user on an always-on-top splash with no progress bar and no
  // Cancel — with the boot loader rendering, unseen, underneath it.
  //
  // The gate now lives in ProjectScreen and covers exactly the fetching parts.
  // See the hydration gate there for why it reads `restored || bootActive`.

  // The ref keeps StrictMode's deliberate double-mount in dev from starting a
  // second load.
  const restoreStartedRef = React.useRef(false)
  React.useEffect(() => {
    if (restoreStartedRef.current) return
    restoreStartedRef.current = true
    if (screen !== 'project') return

    try {
      const projectId = localStorage.getItem(STORAGE_KEYS.activeProjectId)
      const scenarioId = localStorage.getItem(STORAGE_KEYS.activeScenarioId)
      if (projectId && scenarioId) {
        dispatch(openProject(projectId))
        return
      }
    } catch {
      /* storage disabled — nothing to restore */
    }

    // No boot will run, so nothing would ever open the gate above. Only
    // reachable if storage stopped being readable between pickInitialScreen()
    // and here — but a window stuck on an empty backdrop forever is not an
    // acceptable way to lose that race, and Home is where a restore that cannot
    // happen belongs anyway.
    dispatch(navigate('home'))
  }, [dispatch, screen])

  return (
    <div className="flex flex-col h-screen bg-dark text-neutral-200 overflow-hidden">
      {screen === 'home' && <HomePage />}
      {/* The gate moved INTO ProjectScreen, and narrowed: it holds back the
          panels and the fetch effects, not the screen itself. Keeping the whole
          screen unmounted meant that on the restart path NOTHING was mounted
          while /init ran — and since the splash comes down only when a screen
          signals `app:ready`, a slow or stalled /init left the user staring at
          an always-on-top splash with no progress and no way out. The shell
          makes no requests, so mounting it costs nothing and is what lets the
          window reveal. See the hydration gate in ProjectScreen. */}
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
