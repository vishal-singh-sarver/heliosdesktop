import CollapseButton from '@renderer/components/CollapseButton'
import ObjectPropertiesForm from '@renderer/containers/Geometry/ObjectPropertiesForm'
import { selectCreateDraftNonce } from '@renderer/containers/Geometry/selectors'
import React, { memo } from 'react'
import { useSelector } from 'react-redux'
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

  // Every +Ground (or any open) auto-expands the panel so the Properties form
  // is visible. We watch a monotonic open-nonce rather than draft presence, so
  // re-opening works even when a draft is already active and the panel was
  // manually collapsed. Detected during render (React's "adjust state from a
  // previous render" pattern) so it doesn't fight a later manual collapse.
  const openNonce = useSelector(selectCreateDraftNonce)
  const [prevNonce, setPrevNonce] = React.useState(openNonce)
  if (openNonce !== prevNonce) {
    setPrevNonce(openNonce)
    setCollapsed(false)
  }

  const widthClass = collapsed ? 'w-8' : 'w-[340px]'

  return (
    <aside
      className={`${widthClass} flex shrink-0 flex-col overflow-hidden rounded-lg bg-[#202020] transition-[width] duration-150`}
    >
      <div
        className={`flex shrink-0 items-center px-1 py-2 ${collapsed ? 'justify-center' : 'justify-between'}`}
      >
        {!collapsed && (
          <span className="pl-2 text-[14px] font-normal leading-[15px] tracking-normal text-neutral-200">
            Properties
          </span>
        )}
        <CollapseButton collapsed={collapsed} side="right" onToggle={toggle} />
      </div>
      {!collapsed && (
        // The form hugs its content (no inner scroll). This wrapper only scrolls
        // as a fallback when the window is too short to show the whole form.
        <>
          <div className="shrink-0 border-t border-app-border" />
          <div className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto p-3">
            <ObjectPropertiesForm />
          </div>
        </>
      )}
    </aside>
  )
}

export default memo(RightPanel)
