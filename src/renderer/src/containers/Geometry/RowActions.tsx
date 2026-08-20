import deleteIcon from '@renderer/assets/delete.svg'
import eyeIcon from '@renderer/assets/EyeIcon.svg'
import eyeOffIcon from '@renderer/assets/EyeOffIcon.svg'
import renderIcon from '@renderer/assets/RenderIcon.svg'
import renderOffIcon from '@renderer/assets/RenderOffIcon.svg'
import { selectModelTypes } from 'containers/ProjectScreen/selectors'
import React from 'react'
import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { showFullTextOnHover } from 'utils/truncationTooltip'
import { setModelOn, toggleRender, toggleViewport } from './actions'
import { isModelOn } from './models'
import { selectModelIds } from './selectors'
import type { GeoNode } from './types'

// Row action affordances for a tree row. Icons are inline SVG (vector, never
// rasterized via <img>, so always crisp) and inherit the row colour via
// currentColor. The whole cluster reveals for a hovered, focused or selected
// row. The render icon carries two gestures: left click toggles every model at
// once, right click opens the per-model menu.

interface IconButtonProps {
  label: string
  children: React.ReactNode
  className?: string
  active?: boolean
  disabled?: boolean
  // Suppresses the hover background tint (icon still brightens via text colour).
  noHoverBg?: boolean
  onClick?: () => void
  // Right click. Given the raw event because a context menu has to decide about
  // preventDefault itself.
  onContextMenu?: (e: React.MouseEvent) => void
  // Marks the button as a menu trigger for assistive tech. Only the render icon
  // sets these — the rest of the cluster is plain toggles.
  hasMenu?: boolean
  expanded?: boolean
  // Optional handle on the underlying <button> (e.g. to restore focus on Esc).
  buttonRef?: React.Ref<HTMLButtonElement>
}

function IconButton({
  label,
  children,
  className = '',
  active = false,
  disabled = false,
  noHoverBg = false,
  onClick,
  onContextMenu,
  hasMenu = false,
  expanded = false,
  buttonRef
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-pressed={active}
      aria-haspopup={hasMenu ? 'menu' : undefined}
      aria-expanded={hasMenu ? expanded : undefined}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      onContextMenu={onContextMenu}
      className={`flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 ${
        noHoverBg ? '' : 'hover:bg-neutral-600/50'
      } ${className}`}
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

// The per-model menu, rendered in a portal so the panel's overflow-scroll
// containers can't clip it.
const MENU_WIDTH = 200
// Keeps the menu off the window edge when the icon sits close to it.
const VIEWPORT_MARGIN = 8

interface RowActionsProps {
  node: GeoNode
  projectId: string | null
  scenarioId: string | null
  // The cluster only appears once the row is selected (clicked), not on hover.
  selected: boolean
  // Opens the delete confirmation (owned by the row).
  onDelete: () => void
  // This node's DELETE is in flight — the trash locks so a second confirm can't
  // fire a duplicate onto the already-gone node.
  deleting?: boolean
}

// The action cluster pinned to the right edge of the row: render, viewport,
// delete. Always present, but only visible when the row is hovered, focused, or
// selected (so it doesn't clutter idle rows). Shown for both leaves and groups.
//
// No drag handle: the whole row is draggable (see TreeRow's `draggable`), so the
// grip was decorative — it never started the drag and its absence doesn't stop
// one.
export default function RowActions({
  node,
  projectId,
  scenarioId,
  selected,
  onDelete,
  deleting = false
}: RowActionsProps): React.JSX.Element | null {
  const dispatch = useDispatch()
  // The render icon is a master switch over every catalog model, so it needs the
  // full model id list to set them all (render off ⇒ all models false).
  const modelIds = useSelector(selectModelIds)
  const modelTypes = useSelector(selectModelTypes)

  const anchorRef = React.useRef<HTMLSpanElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null)
  const menuOpen = coords !== null

  const closeMenu = (): void => setCoords(null)

  // Reveal on hover/focus (Tailwind group-* off the row) or while selected. Also
  // held open while the menu is: the pointer leaves the row to reach the menu,
  // and the trigger fading out from under an open menu reads as a glitch.
  const visibility =
    selected || menuOpen
      ? 'opacity-100'
      : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

  // Right click on the render icon. The menu starts at the icon's LEFT edge and
  // opens rightwards, over the viewport rather than back across the panel — a
  // menu extending left from here covers the geometry names underneath it, which
  // is precisely the list the user is working in. Clamped to the window so the
  // last column of rows still gets a whole menu. Skipped if the trigger isn't
  // measurable — no sensible position to anchor to.
  const openMenu = (e: React.MouseEvent): void => {
    // Suppress the native context menu, and don't let the row treat this as a
    // click on itself.
    e.preventDefault()
    e.stopPropagation()
    if (menuOpen) {
      closeMenu()
      return
    }
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)
    )
    setCoords({ top: rect.bottom + 4, left })
  }

  // Close on Escape and restore focus to the trigger, matching native menu
  // behaviour for keyboard users (outside-click close is handled by the overlay).
  React.useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeMenu()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  // Reflect the per-model state: the icon is "shown" if any model is on, and
  // only "hidden" when every model is off. Falls back to the render flag before
  // the catalog has loaded.
  const renderHidden =
    modelIds.length > 0
      ? modelIds.every((id) => !isModelOn(node.modelVisibility, id))
      : !node.renderEnabled
  const onToggleRender = (): void => {
    if (projectId && scenarioId) dispatch(toggleRender(projectId, scenarioId, node.id, modelIds))
  }

  const onToggleModel = (modelId: number, on: boolean): void => {
    if (projectId && scenarioId)
      dispatch(setModelOn(projectId, scenarioId, node.id, modelId, on, modelIds))
  }

  const onToggleViewport = (): void => {
    if (projectId && scenarioId) dispatch(toggleViewport(projectId, scenarioId, node.id))
  }

  return (
    <div
      className={`ml-auto flex shrink-0 items-center gap-0.5 transition-opacity ${visibility}`}
    >
      {/* Two gestures on one icon: left click is the master switch over every
          model, right click opens the per-model menu. */}
      <span className="relative shrink-0" ref={anchorRef}>
        <IconButton
          label={renderHidden ? 'Show in render' : 'Hide from render'}
          active={renderHidden}
          hasMenu
          expanded={menuOpen}
          onClick={onToggleRender}
          onContextMenu={openMenu}
          buttonRef={triggerRef}
        >
          {renderHidden ? <RenderOffIcon /> : <RenderIcon />}
        </IconButton>

        {menuOpen &&
          createPortal(
            <>
              <div
                className="fixed inset-0 z-40"
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation()
                  closeMenu()
                }}
                // The overlay swallows a right click too, so dismissing the menu
                // the same way it was opened doesn't raise the native one.
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  closeMenu()
                }}
              />
              <div
                role="menu"
                style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
                className="fixed z-50 rounded-md border border-app-border bg-[#1f2126] p-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="px-2 py-1 text-[13px] uppercase tracking-wide text-neutral-500">
                  Models
                </p>

                {/* Per-model toggles from the catalog (top-level models). A hidden
                    model is shown with a greyed, dimmed row so its state is obvious. */}
                {modelTypes.length === 0 ? (
                  <p className="px-2 py-1.5 text-[13px] text-neutral-500">No models</p>
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
                        className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-neutral-700/50 ${
                          on ? 'text-neutral-200' : 'bg-neutral-800/70 text-neutral-500'
                        }`}
                      >
                        <span className="truncate" onMouseEnter={showFullTextOnHover}>
                          {model.model}
                        </span>
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
      <IconButton
        label={node.visibleInViewport ? 'Hide from viewport' : 'Show in viewport'}
        active={!node.visibleInViewport}
        noHoverBg
        onClick={onToggleViewport}
      >
        {node.visibleInViewport ? <EyeIcon /> : <EyeOffIcon />}
      </IconButton>
      <IconButton label="Delete" disabled={deleting} onClick={onDelete}>
        <TrashIcon />
      </IconButton>
    </div>
  )
}
