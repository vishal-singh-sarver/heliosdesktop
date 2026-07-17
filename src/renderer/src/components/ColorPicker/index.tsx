import React from 'react'
import {
  clamp,
  hsvToRgb,
  isDarkColor,
  rgbEquals,
  rgbToHex,
  rgbToHsv,
  type HsvColor,
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
  recentColors: RgbColor[]
  onChangeColor: (rgb: RgbColor) => void
  onChangeOpacity: (opacity: number) => void
  // The R/G/B and opacity number boxes, each controlled + validated by the caller.
  channelFields: Record<keyof RgbColor, ColorPickerFieldControl>
  opacityField: ColorPickerFieldControl
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

function ColorPicker({
  rgb,
  opacity,
  recentColors,
  onChangeColor,
  onChangeOpacity,
  channelFields,
  opacityField,
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

  const hex = rgbToHex(rgb)
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }))

  // The first field error drives the single message line under the row; each bad
  // field also gets a red outline.
  const firstError =
    channelFields.r.error ?? channelFields.g.error ?? channelFields.b.error ?? opacityField.error

  // Same error treatment as the app's FormField: a red outline on the input.
  const fieldClass = (error?: string): string =>
    `h-8 w-full rounded border bg-[#121212] px-2 text-center text-sm text-white outline-none ${
      error
        ? 'border-app-border outline outline-1 -outline-offset-1 outline-[#D92D20] focus:border-[#D92D20]'
        : 'border-app-border focus:border-neutral-500'
    }`

  return (
    <div className="flex flex-col gap-3">
      {/* Saturation (x) / brightness (y) area. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={labels.colorArea}
        aria-valuetext={hex}
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
        </p>
        <div className="flex items-end gap-2">
          {(['r', 'g', 'b'] as const).map((key) => {
            const field = channelFields[key]
            return (
              <label key={key} className="flex flex-1 flex-col gap-1">
                <span className="text-xs uppercase text-neutral-500">{key}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={key.toUpperCase()}
                  aria-invalid={field.error != null}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                  className={fieldClass(field.error)}
                />
              </label>
            )
          })}
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-neutral-500">%</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label={labels.opacity}
              aria-invalid={opacityField.error != null}
              value={opacityField.value}
              onChange={(e) => opacityField.onChange(e.target.value)}
              onBlur={opacityField.onBlur}
              className={fieldClass(opacityField.error)}
            />
          </label>
        </div>
        {firstError && (
          <p className="form-error-text mt-1" role="alert">
            {firstError}
          </p>
        )}
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
                  onClick={() => onChangeColor(c)}
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
