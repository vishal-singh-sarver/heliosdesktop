import threeDWindowIcon from '@renderer/assets/3D_Window.svg'
import outputIcon from '@renderer/assets/Output.svg'
import weatherIcon from '@renderer/assets/weather.svg'
import Weather from '@renderer/containers/Weather'
import React from 'react'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import reducer from './reducer'
import saga from './saga'

// To read state:  const value = useSelector((s: RootState) => s.centerWorkspace.someField)
// To dispatch:    const dispatch = useDispatch()

type Tab = '3dWindow' | 'weather' | 'output' | null

interface TabButtonProps {
  label: string
  icon: string
  active: boolean
  onClick: () => void
  dataTestId?: string
}

function TabButton({ label, icon, active, onClick, dataTestId }: TabButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={dataTestId}
      aria-pressed={active}
      className={`flex items-center gap-2 rounded-t-sm border px-3 py-1.5 text-sm text-neutral-200 ${
        active
          ? 'border-transparent bg-neutral-700'
          : 'border-neutral-700/80 bg-neutral-800/80 hover:bg-neutral-700/80'
      }`}
    >
      <img src={icon} alt="" aria-hidden="true" className="h-4 w-4" />
      {label}
    </button>
  )
}

export function CenterWorkspace(): React.JSX.Element {
  useInjectReducer({ key: 'centerWorkspace', reducer: reducer as Reducer })
  useInjectSaga({ key: 'centerWorkspace', saga })

  const [activeTab, setActiveTab] = React.useState<Tab>('weather')

  return (
    <section
      data-testid="center-workspace"
      className="flex w-[1200px] flex-1 flex-col overflow-hidden rounded-lg border border-app-border bg-panel/20 p-3"
    >
      <div
        data-testid="center-workspace-tabs"
        className="-mx-3 flex items-center gap-2 border-b border-app-border px-3"
      >
        <TabButton
          label="3D Window"
          icon={threeDWindowIcon}
          active={activeTab === '3dWindow'}
          onClick={() => setActiveTab('3dWindow')}
          dataTestId="tab-3dwindow"
        />
        <TabButton
          label="Weather"
          icon={weatherIcon}
          active={activeTab === 'weather'}
          onClick={() => setActiveTab('weather')}
          dataTestId="tab-weather"
        />
        <TabButton
          label="Output"
          icon={outputIcon}
          active={activeTab === 'output'}
          onClick={() => setActiveTab('output')}
          dataTestId="tab-output"
        />
      </div>

      {activeTab === 'weather' && <Weather />}
    </section>
  )
}

export default CenterWorkspace
