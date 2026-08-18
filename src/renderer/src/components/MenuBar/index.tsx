import React from 'react'
import { ToolbarMap } from '../../types/project'

interface MenuBarProps {
  items: ToolbarMap
  onItemSelect: (menuItem: string) => void
}

function MenuBar({ items, onItemSelect }: MenuBarProps): React.JSX.Element {
  return (
    <nav
      data-testid="menubar"
      className="flex items-center gap-2 text-sm font-medium text-neutral-300"
    >
      {Object.keys(items).map((item) => (
        <div key={item} className="group relative">
          <button className="rounded px-2 py-1 group-hover:bg-panel group-hover:text-white">
            {item}
          </button>

          <div className="invisible absolute top-7 left-0 z-20 min-w-44 group-hover:visible">
            <div className="h-2 w-full" />
            <div className="rounded border border-app-border bg-[#181a1f] py-1 shadow-lg">
              {items[item]?.map((menuItem) => (
                <button
                  key={menuItem}
                  data-testid={`menu-${menuItem}`}
                  onClick={() => onItemSelect(menuItem)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-app-border"
                >
                  {menuItem}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </nav>
  )
}

export default MenuBar
