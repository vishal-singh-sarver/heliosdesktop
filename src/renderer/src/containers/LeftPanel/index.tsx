import CollapseButton from '@renderer/components/CollapseButton'
import React from 'react'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import reducer from './reducer'
import saga from './saga'

// To read state:  const value = useSelector((s: RootState) => s.leftPanel.someField)
// To dispatch:    const dispatch = useDispatch()

export function LeftPanel(): React.JSX.Element {
  useInjectReducer({ key: 'leftPanel', reducer: reducer as Reducer })
  useInjectSaga({ key: 'leftPanel', saga })

  const [collapsed, setCollapsed] = React.useState(true)
  const toggle = (): void => setCollapsed((prev) => !prev)

  const widthClass = collapsed ? 'w-8' : 'w-[340px]'

  return (
    <aside
      data-testid="left-panel"
      className={`${widthClass} shrink-0 overflow-hidden rounded-lg bg-[#202020] transition-[width] duration-150`}
    >
      <div className="flex items-center justify-end p-1">
        <CollapseButton
          collapsed={collapsed}
          side="left"
          onToggle={toggle}
          dataTestId="left-panel-collapse-btn"
        />
      </div>
      {!collapsed && (
        <div className="overflow-y-auto p-3">{/* Tools: Geometry, Materials, Models */}</div>
      )}
    </aside>
  )
}

export default LeftPanel
