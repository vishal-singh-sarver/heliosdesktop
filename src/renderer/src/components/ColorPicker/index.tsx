import infoIcon from '@renderer/assets/info.svg'
import React from 'react'
import Tooltip from '../Tooltip'
import {
  clamp,
  hsvToRgb,
  isDarkColor,
  rgbEquals,
  rgbToHex,
  rgbToHsv,
  type HsvColor,
  type RecentColor,
  type RgbColor
} from 'utils/color'

// A self-contained RGB colour picker: a saturation/brightness area, a hue slider,
// an opacity slider, R/G/B + opacity number fields, and a row of recent colours.
// Fully controlled — the parent owns `rgb` (integer channels) and `opacity`
// (0-100) for the visual controls, AND supplies each number field as a
// FormField-style control (raw text + error + change/blur), so validation lives
// in the caller and matches the app's other fields. No app/Redux coupling.

// One number box, wired like the app's FormField: the raw text to show, its
// current error (drives the red border + message), and the change/blur handlers.
// `onChange` receives the raw keystroke value — the caller's guard decides whether
// it commits.
export interface ColorPickerFieldControl {
  value: string
  error?: string
  onChange: (raw: string) => void
  onBlur: () => void
}

export interface ColorPickerProps {
  rgb: RgbColor
  opacity: number
  // Each history entry carries the opacity it was saved at; picking one restores
  // that too (see the swatch row below).
  recentColors: RecentColor[]
  onChangeColor: (rgb: RgbColor) => void
  onChangeOpacity: (opacity: number) => void
  // The R/G/B and opacity number boxes, each controlled + validated by the caller.
  channelFields: Record<keyof RgbColor, ColorPickerFieldControl>
  opacityField: ColorPickerFieldControl
  // Mark the colour as a required entry: a red star on the "RGB Values" heading.
  // On the HEADING rather than each box, because the four boxes are the channels
  // of ONE value — the same rule the Geometry form's group headings follow.
  required?: boolean
  // Accessible labels (passed in so copy stays with the feature, not the
  // component).
  labels: {
    rgbValues: string
    opacity: string
    usedColors: string
    colorArea: string
    hueSlider: string
    opacitySlider: string
    swatch: (hex: string) => string
  }
}

// Half the thumb (h-5 = 20px across). Every track insets its thumb's travel by
// this much at each end, so the circle stops with its edge against the track's
// edge instead of straddling it — at 0 it used to sit half outside the corner.
const THUMB_RADIUS = 10

// Read a 0..1 fraction of where the pointer sits within a track's box, over the
// band the thumb can actually travel (the box, less a thumb radius at each end).
// Clamped, so the ends stay reachable: dragging to — or past — the edge pins to
// 0 or 1, and the thumb's centre simply stops a radius short of the edge.
function fractionIn(rect: DOMRect, clientX: number, clientY: number): { fx: number; fy: number } {
  const width = rect.width - THUMB_RADIUS * 2
  const height = rect.height - THUMB_RADIUS * 2
  const fx = width <= 0 ? 0 : clamp((clientX - rect.left - THUMB_RADIUS) / width, 0, 1)
  const fy = height <= 0 ? 0 : clamp((clientY - rect.top - THUMB_RADIUS) / height, 0, 1)
  return { fx, fy }
}

// Where a thumb's centre sits along a track, for a 0..1 value: the same inset
// band `fractionIn` reads from, so the thumb lands exactly under the cursor
// everywhere except the clamped ends.
function thumbAt(fraction: number): string {
  return `calc(${THUMB_RADIUS}px + ${clamp(fraction, 0, 1)} * (100% - ${THUMB_RADIUS * 2}px))`
}

// Wires one draggable track (the area, or either slider): pointer capture, plus
// the two things that keep a drag smooth.
//
//  1. The track's box is measured ONCE per drag, on pointerdown. Measuring it on
//     every move meant reading layout straight after React had written the thumb's
//     new position, which forces the browser to re-lay-out the panel
//     synchronously — mid-drag, every single move.
//  2. Moves are coalesced to one update per animation frame. A pointer can report
//     faster than the screen repaints, and each of ours commits the colour to the
//     store and re-renders the form; frames beyond the first are work whose result
//     is overwritten before it can ever be seen.
//
// The pointer can't be over the track before it's pressed, so a drag always
// starts with the pointerdown that measures it.
function useTrackDrag(
  onMove: (fx: number, fy: number) => void
): React.HTMLAttributes<HTMLDivElement> {
  const rectRef = React.useRef<DOMRect | null>(null)
  const frameRef = React.useRef<number | null>(null)
  const pointRef = React.useRef<{ x: number; y: number } | null>(null)
  // The latest handler, read when the frame fires — so the deferred move uses the
  // current colour rather than whatever it was when the pointer moved.
  const moveRef = React.useRef(onMove)
  React.useEffect(() => {
    moveRef.current = onMove
  })

  const emit = (clientX: number, clientY: number): void => {
    const rect = rectRef.current
    if (!rect) return
    const { fx, fy } = fractionIn(rect, clientX, clientY)
    moveRef.current(fx, fy)
  }

  React.useEffect(
    () => () => {
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current)
    },
    []
  )

  return {
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      rectRef.current = e.currentTarget.getBoundingClientRect()
      // Emit straight away: a click should land where it was clicked, without
      // waiting for a frame.
      emit(e.clientX, e.clientY)
    },
    onPointerMove: (e) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      // Keep only the newest position; the frame below reads whatever it is by
      // the time it runs.
      pointRef.current = { x: e.clientX, y: e.clientY }
      if (frameRef.current != null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        const point = pointRef.current
        if (point) emit(point.x, point.y)
      })
    }
  }
}

// Keyboard steps along a 0..1 track: 1% per arrow, 10% with Shift or Page keys.
const KEY_STEP = 0.01
const KEY_STEP_COARSE = 0.1

// Maps a key to a movement on a 0..1 track, positive meaning right/up. Home and
// End return a full-range move, which the caller's clamp turns into "go to the
// end". Returns null for keys the track doesn't own, so they keep bubbling —
// Tab in particular must still move focus.
//
// Without this the three role="slider" tracks were focusable and announced as
// adjustable while responding only to a pointer.
function keyMove(e: React.KeyboardEvent): { dx: number; dy: number } | null {
  const step = e.shiftKey ? KEY_STEP_COARSE : KEY_STEP
  switch (e.key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 }
    case 'ArrowRight':
      return { dx: step, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: step }
    case 'ArrowDown':
      return { dx: 0, dy: -step }
    case 'PageUp':
      return { dx: KEY_STEP_COARSE, dy: KEY_STEP_COARSE }
    case 'PageDown':
      return { dx: -KEY_STEP_COARSE, dy: -KEY_STEP_COARSE }
    case 'Home':
      return { dx: -1, dy: -1 }
    case 'End':
      return { dx: 1, dy: 1 }
    default:
      return null
  }
}

function ColorPicker({
  rgb,
  opacity,
  recentColors,
  onChangeColor,
  onChangeOpacity,
  channelFields,
  opacityField,
  required = false,
  labels
}: ColorPickerProps): React.JSX.Element {
  // HSV is the picker's internal source of truth for the area + hue (RGB↔HSV
  // isn't 1:1 at the greys/edges, so deriving hue from RGB every render would
  // make the handle jump). We re-sync it from an EXTERNAL rgb change (a recent
  // swatch, a typed channel) using React's "adjust state during render" pattern —
  // no effect, so the handle never lags a frame. Our own drags already produce a
  // matching rgb, so the equality guard skips those.
  const [hsv, setHsv] = React.useState<HsvColor>(() => rgbToHsv(rgb))
  const [prevRgb, setPrevRgb] = React.useState<RgbColor>(rgb)
  if (!rgbEquals(rgb, prevRgb)) {
    setPrevRgb(rgb)
    if (!rgbEquals(hsvToRgb(hsv), rgb)) setHsv(rgbToHsv(rgb))
  }

  const emitFromHsv = (next: HsvColor): void => {
    setHsv(next)
    onChangeColor(hsvToRgb(next))
  }

  // The three tracks. Each keeps the axes it doesn't own — an area drag preserves
  // the hue, a hue drag preserves saturation/brightness.
  const areaDrag = useTrackDrag((fx, fy) => emitFromHsv({ h: hsv.h, s: fx, v: 1 - fy }))
  const hueDrag = useTrackDrag((fx) => emitFromHsv({ ...hsv, h: fx * 360 }))
  const opacityDrag = useTrackDrag((fx) => onChangeOpacity(Math.round(fx * 100)))

  // The keyboard equivalents of those three drags. The area is two-axis, so it
  // uses dx and dy separately; the two sliders are one-axis, so they take dx+dy
  // and respond to Left/Down as well as Right/Up.
  const onAreaKeyDown = (e: React.KeyboardEvent): void => {
    const move = keyMove(e)
    if (!move) return
    e.preventDefault() // arrows would otherwise scroll the panel
    emitFromHsv({
      h: hsv.h,
      s: clamp(hsv.s + move.dx, 0, 1),
      v: clamp(hsv.v + move.dy, 0, 1)
    })
  }
  const onHueKeyDown = (e: React.KeyboardEvent): void => {
    const move = keyMove(e)
    if (!move) return
    e.preventDefault()
    emitFromHsv({ ...hsv, h: clamp(hsv.h / 360 + move.dx + move.dy, 0, 1) * 360 })
  }
  const onOpacityKeyDown = (e: React.KeyboardEvent): void => {
    const move = keyMove(e)
    if (!move) return
    e.preventDefault()
    onChangeOpacity(Math.round(clamp(opacity / 100 + move.dx + move.dy, 0, 1) * 100))
  }

  const hex = rgbToHex(rgb)
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }))

  // Same error treatment as the app's FormField: a red outline on the input, plus
  // an in-cell info-icon tooltip. Reserve right padding when errored so the value
  // doesn't run under the icon (mirrors FormField's `pr-8`); pl-2/pr-2 keep the
  // valid-state padding byte-identical to the previous `px-2`.
  // `hasSuffix` is the opacity box, which shows a "%" inside it: the value needs
  // clearance from that as well as from any error icon.
  const fieldClass = (error?: string, hasSuffix = false): string => {
    // Exactly ONE padding-right utility, decided here. Appending a second pr-*
    // to the class string would leave the winner to Tailwind's emit order — the
    // same trap that silently killed the red outline below.
    const paddingRight = error ? (hasSuffix ? 'pr-12' : 'pr-7') : hasSuffix ? 'pr-6' : 'pr-2'
    // The placeholder is the channel's own letter, so an empty box still says
    // WHICH channel it is — greyed, so it never reads as an entered value.
    //
    // `outline-none` lives in the ERROR-FREE branch only, never in the base. Both
    // it and the red `outline` utilities set outline-style, so carrying both at
    // once left the winner to Tailwind's emit order rather than to this string —
    // and the red ring silently lost. FormField has always split them this way;
    // this is the same recipe, so an errored channel rings red exactly like an
    // errored field in the Geometry panel.
    // Text starts at the leading edge, like every other input in the app (the
    // FormField sets no alignment, so they all sit left). Centred is deliberately
    // NOT used: `text-align` on ::placeholder is ignored in Chromium, so the
    // placeholder can only follow the input's own alignment — centred letters
    // would have jumped to a different spot the moment a digit was typed.
    return `h-8 w-full rounded border border-app-border bg-[#121212] pl-2 ${paddingRight} text-left text-sm text-white placeholder:text-[#424242] ${
      error
        ? 'outline outline-1 -outline-offset-1 outline-[#D92D20] focus:border-[#D92D20]'
        : 'outline-none focus:border-neutral-500'
    }`
  }

  // The validation error as an in-cell info-icon tooltip — the same Tooltip the
  // app's FormField uses for `errorAsTooltip`, positioned inside the input box.
  const errorIcon = (error?: string): React.JSX.Element | null =>
    error ? (
      <Tooltip
        text={error}
        ariaLabel={`Validation error: ${error}`}
        place="top"
        className="absolute right-1.5 top-1/2 -translate-y-1/2"
      >
        <img src={infoIcon} alt="" className="h-4 w-4" />
      </Tooltip>
    ) : null

  return (
    <div className="flex flex-col gap-3">
      {/* Saturation (x) / brightness (y) area. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={labels.colorArea}
        // A two-axis control that `slider` can only half describe: the numeric
        // value reports saturation (the x axis), while valuetext carries the
        // resulting colour, which is the part that actually matters to a listener.
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={hex}
        onKeyDown={onAreaKeyDown}
        {...areaDrag}
        className="relative h-32 w-full cursor-pointer touch-none rounded"
        style={{ backgroundColor: hueColor }}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded"
          style={{ background: 'linear-gradient(to right, #fff, rgba(255,255,255,0))' }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded"
          style={{ background: 'linear-gradient(to top, #000, rgba(0,0,0,0))' }}
        />
        {/* Filled with the selected colour (a white ring + dark outer ring keep it
            visible on any background) — not a hollow white circle. */}
        <span
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{
            left: thumbAt(hsv.s),
            top: thumbAt(1 - hsv.v),
            background: `radial-gradient(circle, ${hex} 0 5px, #fff 6px)`
          }}
        />
      </div>

      {/* Hue slider. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={labels.hueSlider}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={onHueKeyDown}
        {...hueDrag}
        className="relative h-2 w-full cursor-pointer touch-none rounded-full"
        style={{
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{
            left: thumbAt(hsv.h / 360),
            background: `radial-gradient(circle, ${hueColor} 0 5px, #fff 6px)`
          }}
        />
      </div>

      {/* Opacity slider — a plain white track. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={labels.opacitySlider}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={opacity}
        onKeyDown={onOpacityKeyDown}
        {...opacityDrag}
        className="relative mt-2 h-2 w-full cursor-pointer touch-none rounded-full bg-white"
      >
        {/* Solid grey thumb (no colour dot) — opacity isn't a colour. */}
        <span
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#98A2B3] shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: thumbAt(opacity / 100) }}
        />
      </div>

      {/* R / G / B / opacity number fields. */}
      <div>
        <p className="mb-1 text-[13px] font-medium leading-[20px] text-[#D3D3D3]">
          {labels.rgbValues}
          {required && <span className="text-red-400">*</span>}
        </p>
        {/* No caption above any box: each channel's own letter is its placeholder,
            and the opacity box carries its unit inline (see below). The captions
            said the same thing twice and stole a row of height. `aria-label` keeps
            every box named for a screen reader. */}
        <div className="flex items-end gap-2">
          {(['r', 'g', 'b'] as const).map((key) => {
            const field = channelFields[key]
            return (
              <div key={key} className="relative flex-1">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={key.toUpperCase()}
                  aria-invalid={field.error != null}
                  placeholder={key.toUpperCase()}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                  className={fieldClass(field.error)}
                />
                {errorIcon(field.error)}
              </div>
            )
          })}
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="numeric"
              aria-label={labels.opacity}
              aria-invalid={opacityField.error != null}
              value={opacityField.value}
              onChange={(e) => opacityField.onChange(e.target.value)}
              onBlur={opacityField.onBlur}
              className={fieldClass(opacityField.error, true)}
            />
            {/* The unit as a static suffix, NOT part of the input's value: the box
                still holds a bare number, so typing, the keystroke guard and the
                range validation all stay exactly as they are for the channels.
                Sits left of the error icon when there is one, so the two never
                overlap. */}
            {opacityField.value !== '' && (
              <span
                aria-hidden="true"
                // Off-white (neutral-200 is #e5e5e5, the app's off-white token) —
                // it belongs to the value beside it, so it reads at the same
                // weight rather than as dimmed helper text.
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-neutral-200 ${
                  opacityField.error ? 'right-7' : 'right-2'
                }`}
              >
                %
              </span>
            )}
            {errorIcon(opacityField.error)}
          </div>
        </div>
      </div>

      {/* Recently-used colours. */}
      {recentColors.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium leading-[20px] text-[#D3D3D3]">
            {labels.usedColors}
          </p>
          <div className="flex flex-wrap gap-2">
            {recentColors.map((c) => {
              const swatchHex = rgbToHex(c)
              return (
                <button
                  key={swatchHex}
                  type="button"
                  aria-label={labels.swatch(swatchHex)}
                  // A swatch restores the appearance the user saved, which is the
                  // colour AND the opacity they chose for it — handing back the
                  // RGB alone left the card on whatever opacity it happened to
                  // carry, silently changing the picked colour's transparency.
                  onClick={() => {
                    onChangeColor({ r: c.r, g: c.g, b: c.b })
                    onChangeOpacity(c.opacity)
                  }}
                  // The outline flips with the swatch's own brightness: a dark
                  // swatch on this dark panel has no visible edge of its own (a
                  // black one disappeared entirely), so it gets a LIGHT ring;
                  // light swatches keep the dark one that separates them from the
                  // panel. Either way the circle reads as a circle.
                  className={`h-6 w-6 rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                    isDarkColor(c) ? 'border-white/40' : 'border-black/30'
                  }`}
                  style={{ backgroundColor: swatchHex }}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default ColorPicker
