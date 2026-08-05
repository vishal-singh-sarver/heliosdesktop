import { flip, offset, shift } from '@floating-ui/dom'
import React from 'react'
import { Tooltip as ReactTooltip, type PlacesType } from 'react-tooltip'
import 'react-tooltip/dist/react-tooltip.css'

// react-tooltip's own defaults, reproduced because passing `middlewares`
// REPLACES the whole array rather than adding to it.
const TOOLTIP_OFFSET = 10
// Breathing room between the tooltip and the edge of whatever contains it.
const EDGE_PADDING = 8

interface TooltipProps {
  text: string
  ariaLabel: string
  place?: PlacesType
  /** Custom trigger content. When omitted, renders the default `?` circle. */
  children?: React.ReactNode
  /** className applied to the trigger wrapper. When omitted, uses the
   * default `?`-circle styling. Pass this to position the trigger
   * (e.g. absolute placement inside a cell) or restyle it. */
  className?: string
  /** Color of the tooltip text. Defaults to `#e5e5e5` (off-white). Set to
   * an error color (e.g. `#F04438`) for validation tooltips. */
  textColor?: string
}

const DEFAULT_TRIGGER_CLS =
  'flex h-5 w-5 cursor-default items-center justify-center rounded-full border border-neutral-300 text-xs font-semibold text-white outline-none'

function Tooltip({
  text,
  ariaLabel,
  place = 'top',
  children,
  className,
  textColor = '#e5e5e5'
}: TooltipProps): React.JSX.Element {
  const id = React.useId()
  const triggerRef = React.useRef<HTMLSpanElement>(null)

  // The panel this tooltip lives in (the left/right panels are <aside>s), or
  // null when the trigger sits in open page content. Resolved after mount, from
  // the trigger itself, so no caller has to thread the panel down to a shared
  // field component.
  const [panel, setPanel] = React.useState<Element | null>(null)
  React.useEffect(() => {
    setPanel(triggerRef.current?.closest('aside') ?? null)
  }, [])

  // The tooltip is `fixed`, which frees it from the panel's overflow clipping —
  // but also from being contained by it: a 224px-wide bubble centred on an icon
  // in the panel's left column hangs out over the 3D viewport. So shift against
  // the PANEL rather than the viewport, which keeps it inside the panel it
  // belongs to. Without a panel ancestor this falls back to floating-ui's
  // default (the nearest clipping ancestors), i.e. the previous behaviour.
  const middlewares = React.useMemo(
    () => [
      offset(TOOLTIP_OFFSET),
      flip({ fallbackAxisSideDirection: 'start' }),
      shift(panel ? { boundary: panel, padding: EDGE_PADDING } : { padding: EDGE_PADDING })
    ],
    [panel]
  )

  return (
    <>
      <span
        ref={triggerRef}
        data-tooltip-id={id}
        data-tooltip-content={text}
        tabIndex={0}
        aria-label={ariaLabel}
        className={className ?? DEFAULT_TRIGGER_CLS}
      >
        {children ?? '?'}
      </span>

      <ReactTooltip
        id={id}
        place={place}
        // Fixed positioning anchors the tooltip to the viewport so it isn't
        // clipped by an overflow:hidden / scroll ancestor (e.g. the right panel).
        positionStrategy="fixed"
        middlewares={middlewares}
        border="1px solid #2a2d35"
        style={{
          backgroundColor: '#2b2d33',
          color: textColor,
          fontSize: '11px',
          lineHeight: '16px',
          maxWidth: '224px',
          padding: '0',
          borderRadius: '4px',
          zIndex: 30
        }}
      />
    </>
  )
}

export default Tooltip
