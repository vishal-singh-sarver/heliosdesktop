import React from 'react'
import { createPortal } from 'react-dom'
import { useDispatch } from 'react-redux'
import { setModelVisibility, toggleViewport } from './actions'
import { MODELS, isAllHidden, isModelOn, toggleAllModels, toggleOneModel } from './models'
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

const stroke = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
} as const

const filled = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'currentColor',
  'aria-hidden': true
} as const

// Models glyph — two overlapping rounded squares (render/duplicate).
function RenderIcon(): React.JSX.Element {
  return (
    <svg {...stroke}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </svg>
  )
}

// Render glyph with a slash — hidden from all models.
function RenderOffIcon(): React.JSX.Element {
  return (
    <svg {...stroke}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
      <path d="M2.5 2.5l11 11" />
    </svg>
  )
}

// Viewport toggle — eye (visible) / eye with a slash (hidden).
function EyeIcon(): React.JSX.Element {
  return (
    <svg {...stroke}>
      <path d="M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.9" />
    </svg>
  )
}

function EyeOffIcon(): React.JSX.Element {
  return (
    <svg {...stroke}>
      <path d="M3 3l10 10" />
      <path d="M6.2 6.25C3.4 7.05 1.5 8 1.5 8s2.5 4.25 6.5 4.25c1 0 1.9-.18 2.7-.47" />
      <path d="M9.8 9.7A2 2 0 0 1 6.3 6.2" />
      <path d="M11.6 10.3C13.4 9.3 14.5 8 14.5 8S12 3.75 8 3.75c-.4 0-.78.04-1.15.1" />
    </svg>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg {...stroke}>
      <path d="M3 4.5h10" />
      <path d="M6.5 4.5v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1" />
      <path d="M4.5 4.5v8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-8" />
      <path d="M6.75 7v4M9.25 7v4" />
    </svg>
  )
}

function DragHandleIcon(): React.JSX.Element {
  return (
    <svg {...filled}>
      <circle cx="6" cy="4" r="1" />
      <circle cx="10" cy="4" r="1" />
      <circle cx="6" cy="8" r="1" />
      <circle cx="10" cy="8" r="1" />
      <circle cx="6" cy="12" r="1" />
      <circle cx="10" cy="12" r="1" />
    </svg>
  )
}

function KebabIcon(): React.JSX.Element {
  return (
    <svg {...filled}>
      <circle cx="8" cy="4" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="8" cy="12" r="1.2" />
    </svg>
  )
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

  const setVisibility = (next: GeoNode['modelVisibility']): void => {
    if (projectId && scenarioId) dispatch(setModelVisibility(projectId, scenarioId, node.id, next))
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

              {/* Per-model toggles. A hidden model is shown with a greyed,
                  dimmed row so its hidden state is obvious. */}
              {MODELS.map((model) => {
                const on = isModelOn(node.modelVisibility, model.key)
                return (
                  <button
                    key={model.key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => setVisibility(toggleOneModel(node.modelVisibility, model.key))}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-neutral-700/50 ${
                      on ? 'text-neutral-200' : 'bg-neutral-800/70 text-neutral-500'
                    }`}
                  >
                    <span className="truncate">{model.label}</span>
                    <span className={on ? 'text-neutral-200' : 'text-neutral-600'}>
                      <RenderIcon />
                    </span>
                  </button>
                )
              })}
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

// The selection-revealed cluster pinned to the right edge of the row. Shown for
// both leaves and groups: hide-all-models, viewport, delete, plus a drag handle.
export default function RowActions({
  node,
  projectId,
  scenarioId,
  selected,
  onDelete
}: RowActionsProps): React.JSX.Element | null {
  const dispatch = useDispatch()
  if (!selected) return null

  const modelsHidden = isAllHidden(node.modelVisibility)
  const onToggleAllModels = (): void => {
    if (projectId && scenarioId) {
      dispatch(setModelVisibility(projectId, scenarioId, node.id, toggleAllModels(node.modelVisibility)))
    }
  }

  const onToggleViewport = (): void => {
    if (projectId && scenarioId) dispatch(toggleViewport(projectId, scenarioId, node.id))
  }

  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      <IconButton
        label={modelsHidden ? 'Show in all models' : 'Hide from all models'}
        active={modelsHidden}
        onClick={onToggleAllModels}
      >
        {modelsHidden ? <RenderOffIcon /> : <RenderIcon />}
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
