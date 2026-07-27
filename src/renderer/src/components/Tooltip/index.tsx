import React from 'react'
import { Tooltip as ReactTooltip, type PlacesType } from 'react-tooltip'
import 'react-tooltip/dist/react-tooltip.css'

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

  return (
    <>
      <span
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
