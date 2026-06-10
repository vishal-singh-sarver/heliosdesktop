import CollapseButton from '@renderer/components/CollapseButton'
import React, { memo } from 'react'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import reducer from './reducer'
import saga from './saga'

// To read state:  const value = useSelector((s: RootState) => s.rightPanel.someField)
// To dispatch:    const dispatch = useDispatch()

export function RightPanel(): React.JSX.Element {
  useInjectReducer({ key: 'rightPanel', reducer: reducer as Reducer })
  useInjectSaga({ key: 'rightPanel', saga })

  const [collapsed, setCollapsed] = React.useState(true)
  const toggle = (): void => setCollapsed((prev) => !prev)

  const widthClass = collapsed ? 'w-8' : 'w-[340px]'

  return (
    <aside
      className={`${widthClass} shrink-0 overflow-hidden rounded-lg bg-[#202020] transition-[width] duration-150`}
    >
      <div className="flex items-center justify-end p-1">
        <CollapseButton collapsed={collapsed} side="right" onToggle={toggle} />
      </div>
      {!collapsed && <div className="overflow-y-auto p-3">{/* Properties */}</div>}
    </aside>
  )
}

export default memo(RightPanel)
