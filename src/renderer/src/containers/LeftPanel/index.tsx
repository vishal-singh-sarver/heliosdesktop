import geometryIcon from '@renderer/assets/Geometry.svg'
import materialIcon from '@renderer/assets/Material.svg'
import modelIcon from '@renderer/assets/Model.svg'
import Accordion from '@renderer/components/Accordion'
import CollapseButton from '@renderer/components/CollapseButton'
import Geometry from '@renderer/containers/Geometry'
import Materials from '@renderer/containers/Materials'
import React from 'react'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import reducer from './reducer'
import saga from './saga'

type Section = 'geometry' | 'materials' | 'models'

// To read state:  const value = useSelector((s: RootState) => s.leftPanel.someField)
// To dispatch:    const dispatch = useDispatch()

export function LeftPanel(): React.JSX.Element {
  useInjectReducer({ key: 'leftPanel', reducer: reducer as Reducer })
  useInjectSaga({ key: 'leftPanel', saga })

  const [collapsed, setCollapsed] = React.useState(true)
  const toggle = (): void => setCollapsed((prev) => !prev)

  // Which sections are expanded. Each open section shares the panel height
  // equally with its open siblings (Accordion grows with flex-1); closed
  // ones shrink to their header.
  const [open, setOpen] = React.useState<Record<Section, boolean>>({
    geometry: true,
    materials: true,
    models: true
  })
  const toggleSection = (section: Section): void =>
    setOpen((prev) => ({ ...prev, [section]: !prev[section] }))

  const widthClass = collapsed ? 'w-8' : 'w-[340px]'

  return (
    <aside
      className={`${widthClass} flex shrink-0 flex-col overflow-hidden rounded-lg bg-[#202020] transition-[width] duration-150`}
    >
      <div
        className={`flex shrink-0 items-center px-3 py-2 ${collapsed ? 'justify-center' : 'justify-between'}`}
      >
        {!collapsed && (
          <span className="font-['Geist'] text-[12px] font-normal leading-[15px] tracking-normal text-neutral-200">
            Tools
          </span>
        )}
        <CollapseButton collapsed={collapsed} side="left" onToggle={toggle} />
      </div>
      {!collapsed && (
        <>
          <div className="shrink-0 border-t border-app-border" />
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <Accordion
              title="Geometry"
              icon={geometryIcon}
              open={open.geometry}
              grow={open.geometry}
              onToggle={() => toggleSection('geometry')}
            >
              <Geometry />
            </Accordion>

            <Accordion
              title="Materials"
              icon={materialIcon}
              open={open.materials}
              grow={open.materials}
              onToggle={() => toggleSection('materials')}
            >
              <Materials />
            </Accordion>

            <Accordion
              title="Models"
              icon={modelIcon}
              open={open.models}
              grow={open.models}
              onToggle={() => toggleSection('models')}
            >
              {/* Models content — future step */}
            </Accordion>
          </div>
        </>
      )}
    </aside>
  )
}

export default LeftPanel
