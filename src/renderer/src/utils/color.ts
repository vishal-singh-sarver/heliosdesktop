// Pure colour-space helpers for the material visualisation colour picker. RGB
// channels are integers 0-255 (matching the catalog's color_r/g/b `integer`
// properties); HSV is hue 0-360, saturation/value 0-1. No React, no I/O — every
// function is total and unit-tested.

export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface HsvColor {
  h: number
  s: number
  v: number
}

// Clamp to an inclusive range.
export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return n < min ? min : n > max ? max : n
}

// Clamp + round to a whole 0-255 channel — the form only ever stores integer
// channels, so every RGB we produce is snapped here.
export function toChannel(n: number): number {
  return clamp(Math.round(n), 0, 255)
}

// HSV → RGB. h wraps to [0,360); s and v are clamped to [0,1]. Returns integer
// channels.
export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 1)
  const val = clamp(v, 0, 1)

  const c = val * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = val - c

  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  return { r: toChannel((r + m) * 255), g: toChannel((g + m) * 255), b: toChannel((b + m) * 255) }
}

// RGB → HSV. Channels are clamped to [0,255] first. Hue is 0 for greys (an
// undefined hue) so the result is deterministic.
export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const rn = clamp(r, 0, 255) / 255
  const gn = clamp(g, 0, 255) / 255
  const bn = clamp(b, 0, 255) / 255

  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }
  if (h < 0) h += 360

  const s = max === 0 ? 0 : delta / max
  return { h, s, v: max }
}

// RGB → "#rrggbb" (lowercase, always 6 digits).
export function rgbToHex({ r, g, b }: RgbColor): string {
  const hex = (n: number): string => toChannel(n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

// "#rgb" / "#rrggbb" (with or without the leading #) → RgbColor, or null if it
// isn't a valid hex colour.
export function hexToRgb(hex: string): RgbColor | null {
  const cleaned = hex.trim().replace(/^#/, '')
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : cleaned
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16)
  }
}

// Two colours are equal when every (snapped) channel matches — used to de-dupe
// the recent-colours list.
export function rgbEquals(a: RgbColor, b: RgbColor): boolean {
  return (
    toChannel(a.r) === toChannel(b.r) &&
    toChannel(a.g) === toChannel(b.g) &&
    toChannel(a.b) === toChannel(b.b)
  )
}
