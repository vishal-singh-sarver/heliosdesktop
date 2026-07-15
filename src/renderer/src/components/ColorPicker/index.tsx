import React from 'react'
import {
  clamp,
  hsvToRgb,
  rgbEquals,
  rgbToHex,
  rgbToHsv,
  toChannel,
  type HsvColor,
  type RgbColor
} from 'utils/color'

// A self-contained RGB colour picker: a saturation/brightness area, a hue slider,
// an opacity slider, R/G/B + opacity number fields, and a row of recent colours.
// Fully controlled — the parent owns `rgb` (integer channels) and `opacity`
// (0-100) and is notified on every change. No app/Redux coupling, so it stays a
// generic component.

export interface ColorPickerProps {
  rgb: RgbColor
  opacity: number
  recentColors: RgbColor[]
  onChangeColor: (rgb: RgbColor) => void
  onChangeOpacity: (opacity: number) => void
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

// Read a 0..1 fraction of where the pointer sits along an element, clamped to
// the element's box (so a drag past the edge pins to 0 or 1).
function fractionAlong(
  el: HTMLElement,
  clientX: number,
  clientY: number
): { fx: number; fy: number } {
  const rect = el.getBoundingClientRect()
  const fx = rect.width === 0 ? 0 : clamp((clientX - rect.left) / rect.width, 0, 1)
  const fy = rect.height === 0 ? 0 : clamp((clientY - rect.top) / rect.height, 0, 1)
  return { fx, fy }
}

function ColorPicker({
  rgb,
  opacity,
  recentColors,
  onChangeColor,
  onChangeOpacity,
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

  const onAreaPointer = (e: React.PointerEvent<HTMLDivElement>): void => {
    const { fx, fy } = fractionAlong(e.currentTarget, e.clientX, e.clientY)
    emitFromHsv({ h: hsv.h, s: fx, v: 1 - fy })
  }
  const onHuePointer = (e: React.PointerEvent<HTMLDivElement>): void => {
    const { fx } = fractionAlong(e.currentTarget, e.clientX, e.clientY)
    emitFromHsv({ ...hsv, h: fx * 360 })
  }
  const onOpacityPointer = (e: React.PointerEvent<HTMLDivElement>): void => {
    const { fx } = fractionAlong(e.currentTarget, e.clientX, e.clientY)
    onChangeOpacity(Math.round(fx * 100))
  }

  // While the pointer is held, keep tracking moves (setPointerCapture routes them
  // to the element even when the cursor leaves it).
  const dragHandlers = (
    onMove: (e: React.PointerEvent<HTMLDivElement>) => void
  ): React.HTMLAttributes<HTMLDivElement> => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      onMove(e)
    },
    onPointerMove: (e) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) onMove(e)
    }
  })

  const setChannel = (key: keyof RgbColor, raw: string): void => {
    // Blank → treat as 0 while typing; every channel is snapped to 0-255 so the
    // stored value is always valid.
    const next = { ...rgb, [key]: toChannel(raw === '' ? 0 : Number(raw)) }
    onChangeColor(next)
  }

  const hex = rgbToHex(rgb)
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }))
  const rgbCss = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`

  return (
    <div className="flex flex-col gap-3">
      {/* Saturation (x) / brightness (y) area. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={labels.colorArea}
        aria-valuetext={hex}
        {...dragHandlers(onAreaPointer)}
        className="relative h-32 w-full cursor-crosshair touch-none rounded"
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
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
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
        {...dragHandlers(onHuePointer)}
        className="relative h-3 w-full cursor-pointer touch-none rounded-full"
        style={{
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>

      {/* Opacity slider (checkerboard behind a transparent→colour gradient). */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={labels.opacitySlider}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={opacity}
        {...dragHandlers(onOpacityPointer)}
        className="relative h-3 w-full cursor-pointer touch-none rounded-full"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(${rgb.r},${rgb.g},${rgb.b},0), ${rgbCss}), conic-gradient(#4b4b4b 0.25turn, #2a2a2a 0.25turn 0.5turn, #4b4b4b 0.5turn 0.75turn, #2a2a2a 0.75turn)`,
          backgroundSize: '100% 100%, 10px 10px'
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${opacity}%` }}
        />
      </div>

      {/* R / G / B / opacity number fields. */}
      <div>
        <p className="mb-1 text-[13px] font-medium leading-[20px] text-[#D3D3D3]">
          {labels.rgbValues}
        </p>
        <div className="flex items-end gap-2">
          {(['r', 'g', 'b'] as const).map((key) => (
            <label key={key} className="flex flex-1 flex-col gap-1">
              <span className="text-xs uppercase text-neutral-500">{key}</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label={key.toUpperCase()}
                value={String(rgb[key])}
                onChange={(e) => setChannel(key, e.target.value)}
                className="h-8 w-full rounded border border-app-border bg-[#121212] px-2 text-center text-sm text-white outline-none focus:border-neutral-500"
              />
            </label>
          ))}
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-neutral-500">%</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label={labels.opacity}
              value={String(opacity)}
              onChange={(e) =>
                onChangeOpacity(
                  clamp(Math.round(e.target.value === '' ? 0 : Number(e.target.value)), 0, 100)
                )
              }
              className="h-8 w-full rounded border border-app-border bg-[#121212] px-2 text-center text-sm text-white outline-none focus:border-neutral-500"
            />
          </label>
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
                  onClick={() => onChangeColor(c)}
                  className="h-6 w-6 rounded-full border border-black/30 outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
