import CollapseButton from '@renderer/components/CollapseButton'
import ObjectPropertiesForm from '@renderer/containers/Geometry/ObjectPropertiesForm'
import { selectCreateDraftNonce } from '@renderer/containers/Geometry/selectors'
import MaterialPropertiesForm from '@renderer/containers/Materials/MaterialPropertiesForm'
import { selectMaterialDraftNonce } from '@renderer/containers/Materials/selectors'
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

  // The panel serves two Properties forms — geometry objects (+Ground / click a
  // ground) and materials (+Add Materials). Each feature bumps its own monotonic
  // open-nonce when a draft opens; we watch both. Whichever bumped most recently
  // wins: it decides which form renders AND force-expands the panel. Watching a
  // nonce (not draft presence) means re-opening works even when a draft is
  // already active and the panel was manually collapsed. Detected during render
  // (React's "adjust state from a previous render" pattern) so it doesn't fight a
  // later manual collapse. Each form still returns null when its own draft is
  // inactive, so only the active one ever shows content.
  const geometryNonce = useSelector(selectCreateDraftNonce)
  const materialNonce = useSelector(selectMaterialDraftNonce)
  const [prevGeometryNonce, setPrevGeometryNonce] = React.useState(geometryNonce)
  const [prevMaterialNonce, setPrevMaterialNonce] = React.useState(materialNonce)
  const [activeForm, setActiveForm] = React.useState<'geometry' | 'material'>('geometry')
  if (geometryNonce !== prevGeometryNonce) {
    setPrevGeometryNonce(geometryNonce)
    setActiveForm('geometry')
    setCollapsed(false)
  }
  if (materialNonce !== prevMaterialNonce) {
    setPrevMaterialNonce(materialNonce)
    setActiveForm('material')
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
          <span className="pl-2 text-[13px] font-normal leading-[15px] tracking-normal text-neutral-200">
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
            {activeForm === 'material' ? <MaterialPropertiesForm /> : <ObjectPropertiesForm />}
          </div>
        </>
      )}
    </aside>
  )
}

export default memo(RightPanel)
