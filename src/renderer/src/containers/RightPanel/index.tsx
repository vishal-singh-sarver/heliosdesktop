import { PanelVisibilityProvider } from '@renderer/components/AnchoredPopup'
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
      data-testid="right-panel"
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
        <CollapseButton
          collapsed={collapsed}
          side="right"
          onToggle={toggle}
          dataTestId="right-panel-collapse-btn"
        />
      </div>
      {/* The form stays mounted at all times — collapsing only hides it with CSS
          (display:none) instead of unmounting, mirroring the LeftPanel. The
          chevron is a VISUAL control, so it must not destroy state: unmounting
          discarded the form's own record of which fields had been touched, which
          is what gates the "Required Field" errors. A cleared field therefore
          came back after a reopen with no error and a disabled Save that nothing
          explained — the values live in Redux and survived, the explanation
          didn't. `contents` keeps the divider and the body as flex children of
          the aside while expanded, and display:none keeps the hidden form out of
          the layout, the tab order and the accessibility tree. */}
      {/* display:none can't reach through a portal, so the form's popups — which
          portal to document.body — would keep floating over the app beside the
          collapsed strip. Declaring the panel hidden makes them close themselves,
          which is what the unmount used to do. The provider renders no DOM, so
          the wrapper below stays a direct flex child of the aside. */}
      <PanelVisibilityProvider visible={!collapsed}>
        <div className={collapsed ? 'hidden' : 'contents'}>
          <div className="shrink-0 border-t border-app-border" />
          {/* The form hugs its content (no inner scroll). This wrapper only scrolls
              as a fallback when the window is too short to show the whole form. */}
          <div className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto p-3">
            {activeForm === 'material' ? <MaterialPropertiesForm /> : <ObjectPropertiesForm />}
          </div>
        </div>
      </PanelVisibilityProvider>
    </aside>
  )
}

export default memo(RightPanel)
