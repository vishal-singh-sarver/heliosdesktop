import deleteIcon from '@renderer/assets/delete.svg'
import dragHandleIcon from '@renderer/assets/DragHandleIco.svg'
import eyeIcon from '@renderer/assets/EyeIcon.svg'
import eyeOffIcon from '@renderer/assets/EyeOffIcon.svg'
import kebabIcon from '@renderer/assets/Kebab Menu.svg'
import renderIcon from '@renderer/assets/RenderIcon.svg'
import renderOffIcon from '@renderer/assets/RenderOffIcon.svg'
import { selectModelTypes } from 'containers/ProjectScreen/selectors'
import React from 'react'
import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setModelOn, toggleRender, toggleViewport } from './actions'
import { isModelOn } from './models'
import type { GeoNode } from './types'

// Row action affordances for a tree row. Icons are inline SVG (vector, never
// rasterized via <img>, so always crisp) and inherit the row colour via
// currentColor. The eye/trash cluster reveals for a selected leaf; the kebab
// menu (always visible) holds the model-visibility controls + Delete.

interface IconButtonProps {
  label: string
  children: React.ReactNode
  className?: string
  active?: boolean
  onClick?: () => void
}

function IconButton({
  label,
  children,
  className = '',
  active = false,
  onClick
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={`flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-600/50 hover:text-neutral-100 ${className}`}
    >
      {children}
    </button>
  )
}

// Models glyph — two overlapping rounded squares (render/duplicate).
function RenderIcon(): React.JSX.Element {
  return <img src={renderIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
}

// Render glyph with a slash — hidden from all models.
function RenderOffIcon(): React.JSX.Element {
  return <img src={renderOffIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
}

// Viewport toggle — eye (visible) / eye with a slash (hidden).
function EyeIcon(): React.JSX.Element {
  return <img src={eyeIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
}

function EyeOffIcon(): React.JSX.Element {
  return <img src={eyeOffIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
}

function TrashIcon(): React.JSX.Element {
  return <img src={deleteIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
}

function DragHandleIcon(): React.JSX.Element {
  return <img src={dragHandleIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
}

function KebabIcon(): React.JSX.Element {
  return <img src={kebabIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
}

interface KebabMenuProps {
  node: GeoNode
  projectId: string | null
  scenarioId: string | null
}

// Always-visible kebab. Opens the row's per-model visibility menu (Delete now
// lives in the row cluster). Rendered in a portal so the panel's overflow can't
// clip it, anchored to start at the trigger icon.
const MENU_WIDTH = 200

export function KebabMenu({
  node,
  projectId,
  scenarioId
}: KebabMenuProps): React.JSX.Element {
  const dispatch = useDispatch()
  const modelTypes = useSelector(selectModelTypes)
  const anchorRef = React.useRef<HTMLSpanElement>(null)
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null)
  const open = coords !== null

  // Anchor the menu to the trigger and render it in a portal so the panel's
  // overflow-scroll containers can't clip it. Left edge starts at the icon.
  const toggleOpen = (): void => {
    if (open) {
      setCoords(null)
      return
    }
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) {
      setCoords({ top: rect.bottom + 4, left: rect.left })
    } else {
      setCoords({ top: 0, left: 0 })
    }
  }

  const close = (): void => setCoords(null)

  const modelIds = modelTypes.map((m) => m.id)
  const onToggleModel = (modelId: number, on: boolean): void => {
    if (projectId && scenarioId)
      dispatch(setModelOn(projectId, scenarioId, node.id, modelId, on, modelIds))
  }

  return (
    <span className="relative shrink-0" ref={anchorRef}>
      <IconButton label="More options" active={open} onClick={toggleOpen}>
        <KebabIcon />
      </IconButton>

      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation()
                close()
              }}
            />
            <div
              role="menu"
              style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
              className="fixed z-50 rounded-md border border-app-border bg-[#1f2126] p-1 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-neutral-500">
                Models
              </p>

              {/* Per-model toggles from the catalog (top-level models). A hidden
                  model is shown with a greyed, dimmed row so its state is obvious. */}
              {modelTypes.length === 0 ? (
                <p className="px-2 py-1.5 text-[12px] text-neutral-500">No models</p>
              ) : (
                modelTypes.map((model) => {
                  const on = isModelOn(node.modelVisibility, model.id)
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      onClick={() => onToggleModel(model.id, !on)}
                      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-neutral-700/50 ${
                        on ? 'text-neutral-200' : 'bg-neutral-800/70 text-neutral-500'
                      }`}
                    >
                      <span className="truncate">{model.model}</span>
                      <span>{on ? <RenderIcon /> : <RenderOffIcon />}</span>
                    </button>
                  )
                })
              )}
            </div>
          </>,
          document.body
        )}
    </span>
  )
}

interface RowActionsProps {
  node: GeoNode
  projectId: string | null
  scenarioId: string | null
  // The cluster only appears once the row is selected (clicked), not on hover.
  selected: boolean
  // Opens the delete confirmation (owned by the row).
  onDelete: () => void
}

// The action cluster pinned to the right edge of the row: render, viewport,
// delete, plus a drag handle. Always present, but only visible when the row is
// hovered, focused, or selected (so it doesn't clutter idle rows). Shown for
// both leaves and groups.
export default function RowActions({
  node,
  projectId,
  scenarioId,
  selected,
  onDelete
}: RowActionsProps): React.JSX.Element | null {
  const dispatch = useDispatch()
  // The render icon is a master switch over every catalog model, so it needs the
  // full model id list to set them all (render off ⇒ all models false).
  const modelIds = useSelector(selectModelTypes).map((m) => m.id)

  // Reveal on hover/focus (Tailwind group-* off the row) or while selected.
  const visibility = selected
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

  // Reflect the kebab's per-model state: the icon is "shown" if any model is on,
  // and only "hidden" when every model is off. Falls back to the render flag
  // before the catalog has loaded.
  const renderHidden =
    modelIds.length > 0
      ? modelIds.every((id) => !isModelOn(node.modelVisibility, id))
      : !node.renderEnabled
  const onToggleRender = (): void => {
    if (projectId && scenarioId) dispatch(toggleRender(projectId, scenarioId, node.id, modelIds))
  }

  const onToggleViewport = (): void => {
    if (projectId && scenarioId) dispatch(toggleViewport(projectId, scenarioId, node.id))
  }

  return (
    <div
      className={`ml-auto flex shrink-0 items-center gap-0.5 transition-opacity ${visibility}`}
    >
      <IconButton
        label={renderHidden ? 'Show in render' : 'Hide from render'}
        active={renderHidden}
        onClick={onToggleRender}
      >
        {renderHidden ? <RenderOffIcon /> : <RenderIcon />}
      </IconButton>
      <IconButton
        label={node.visibleInViewport ? 'Hide from viewport' : 'Show in viewport'}
        active={!node.visibleInViewport}
        onClick={onToggleViewport}
      >
        {node.visibleInViewport ? <EyeIcon /> : <EyeOffIcon />}
      </IconButton>
      <IconButton label="Delete" onClick={onDelete}>
        <TrashIcon />
      </IconButton>
      <span
        className="flex h-5 w-4 cursor-grab items-center justify-center text-neutral-500"
        aria-hidden="true"
      >
        <DragHandleIcon />
      </span>
    </div>
  )
}
