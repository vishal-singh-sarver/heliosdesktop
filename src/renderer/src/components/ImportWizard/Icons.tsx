import React from 'react'
import closeIconSrc from '@renderer/assets/CloseIcon.svg'
import checkIconSrc from '@renderer/assets/CheckIcon.svg'
import chevronLeftIconSrc from '@renderer/assets/ChevronLeftIcon.svg'
import chevronDownIconSrc from '@renderer/assets/ChevronDownIcon.svg'
import checkCircleIconSrc from '@renderer/assets/CheckCircleIcon.svg'

type IconProps = React.ImgHTMLAttributes<HTMLImageElement>

// Five icons load from /assets as <img> so the SVG files are the source of
// truth and a designer can swap them without touching code. AlertTriangleIcon
// stays inline because no asset has been provided yet.

export const CloseIcon = (p: IconProps): React.JSX.Element => (
  <img src={closeIconSrc} alt="" {...p} />
)

export const CheckIcon = (p: IconProps): React.JSX.Element => (
  <img src={checkIconSrc} alt="" {...p} />
)

export const ChevronLeftIcon = (p: IconProps): React.JSX.Element => (
  <img src={chevronLeftIconSrc} alt="" {...p} />
)

export const ChevronDownIcon = (p: IconProps): React.JSX.Element => (
  <img src={chevronDownIconSrc} alt="" {...p} />
)

export const CheckCircleIcon = (p: IconProps): React.JSX.Element => (
  <img src={checkCircleIconSrc} alt="" {...p} />
)

// ── Inline (no asset yet) ─────────────────────────────────────────────────────

type SvgProps = React.SVGProps<SVGSVGElement>

const baseProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

export const AlertTriangleIcon = (p: SvgProps): React.JSX.Element => (
  <svg {...baseProps} {...p} viewBox="0 0 24 24" strokeWidth="2">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

// The same × as CloseIcon, drawn inline instead of loaded as an <img>. An image
// carries its own baked-in fill (#101828), which no `text-*` class can reach —
// so on a coloured surface it stayed near-black while everything beside it took
// the surface's colour. This one fills with currentColor, so it matches whatever
// it sits next to. Same path data, so the glyph itself is identical.
export const CloseGlyphIcon = (p: SvgProps): React.JSX.Element => (
  <svg {...p} viewBox="0 0 12 12" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.16667 11.6667L0 10.5L4.66667 5.83333L0 1.16667L1.16667 0L5.83333 4.66667L10.5 0L11.6667 1.16667L7 5.83333L11.6667 10.5L10.5 11.6667L5.83333 7L1.16667 11.6667Z" />
  </svg>
)

// The outlined tick-in-a-circle the toast uses. Distinct from CheckCircleIcon,
// which is a FILLED asset in a fixed blue — fine on the wizard's own surfaces,
// but on the toast's tinted background it reads as a second, unrelated accent.
// This one strokes with currentColor, so it takes the toast's own colour.
export const CheckCircleOutlineIcon = (p: SvgProps): React.JSX.Element => (
  <svg {...baseProps} {...p} viewBox="0 0 24 24" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5.5" />
  </svg>
)

export const InfoIcon = (p: SvgProps): React.JSX.Element => (
  <svg {...baseProps} {...p} viewBox="0 0 24 24" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="10" x2="12" y2="16" />
    <line x1="12" y1="7" x2="12.01" y2="7" />
  </svg>
)
