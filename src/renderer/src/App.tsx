import React from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from './store/reducers'
import HomePage from './containers/HomePage/Loadable'
import ProjectScreen from './containers/ProjectScreen/Loadable'
import SnackbarHost from './components/Snackbar/SnackbarHost'

function App(): React.JSX.Element {
  const screen = useSelector((state: RootState) => state.navigation.screen)

  return (
    <div className="flex flex-col h-screen bg-dark text-neutral-200 overflow-hidden">
      {screen === 'home' && <HomePage />}
      {screen === 'project' && <ProjectScreen />}
      {/* App-global toast outlet (material-assignment feedback, etc.). */}
      <SnackbarHost />
    </div>
  )
}

export default App
