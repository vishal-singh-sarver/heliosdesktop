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

  // Open (expanded) by default when the app launches; the user can collapse it.
  const [collapsed, setCollapsed] = React.useState(false)
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

  // Clicking a rail icon while collapsed expands the panel and focuses that
  // section: it opens the clicked one and minimizes (closes) the others.
  const openSection = (section: Section): void => {
    setCollapsed(false)
    setOpen({ geometry: false, materials: false, models: false, [section]: true })
  }

  // The collapsed rail shows each section's icon stacked vertically. w-auto
  // keeps the non-square Material icon (10×13) from squishing.
  const railSections: { key: Section; label: string; icon: string }[] = [
    { key: 'geometry', label: 'Geometry', icon: geometryIcon },
    { key: 'materials', label: 'Materials', icon: materialIcon },
    { key: 'models', label: 'Models', icon: modelIcon }
  ]

  const widthClass = collapsed ? 'w-12' : 'w-[340px]'

  return (
    <aside
      data-testid="left-panel"
      className={`${widthClass} flex shrink-0 flex-col overflow-hidden rounded-lg bg-[#202020] transition-[width] duration-150`}
    >
      <div
        className={`flex shrink-0 items-center px-3 py-2 ${collapsed ? 'justify-center' : 'justify-between'}`}
      >
        {!collapsed && (
          <span className="text-[13px] font-normal leading-[15px] tracking-normal text-neutral-200">
            Tools
          </span>
        )}
        <CollapseButton
          collapsed={collapsed}
          side="left"
          onToggle={toggle}
          dataTestId="left-panel-collapse-btn"
        />
      </div>
      {collapsed && (
        <div className="flex flex-col items-center gap-1 pt-1">
          {railSections.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => openSection(key)}
              className="flex h-9 w-9 items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/60 hover:text-white"
            >
              <img src={icon} alt="" aria-hidden="true" className="h-5 w-auto" />
            </button>
          ))}
        </div>
      )}
      {/* The expanded content stays mounted at all times — collapsing only hides
          it with CSS (display:none) instead of unmounting, so Geometry/Materials
          load once and never remount (and never refetch) on collapse/expand or
          accordion toggles. `contents` keeps the border + body as flex children
          of the aside while expanded. */}
      <div className={collapsed ? 'hidden' : 'contents'}>
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
        </div>
    </aside>
  )
}

export default LeftPanel
