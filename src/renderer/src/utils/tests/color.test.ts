import { describe, expect, it } from 'vitest'
import {
  clamp,
  hexToRgb,
  hsvToRgb,
  isDarkColor,
  luminance,
  rgbEquals,
  rgbToHex,
  rgbToHsv,
  toChannel,
  type RgbColor
} from '../color'

describe('clamp / toChannel', () => {
  it('clamps into range and treats NaN as the minimum', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(42, 0, 10)).toBe(10)
    expect(clamp(Number.NaN, 0, 10)).toBe(0)
  })

  it('snaps a channel to a whole 0-255', () => {
    expect(toChannel(127.6)).toBe(128)
    expect(toChannel(-1)).toBe(0)
    expect(toChannel(999)).toBe(255)
  })
})

describe('hsvToRgb', () => {
  it('maps the primary/secondary hues', () => {
    expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 })
    expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 })
    expect(hsvToRgb({ h: 240, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 })
    expect(hsvToRgb({ h: 60, s: 1, v: 1 })).toEqual({ r: 255, g: 255, b: 0 })
  })

  it('handles white, black and grey', () => {
    expect(hsvToRgb({ h: 0, s: 0, v: 1 })).toEqual({ r: 255, g: 255, b: 255 })
    expect(hsvToRgb({ h: 0, s: 0, v: 0 })).toEqual({ r: 0, g: 0, b: 0 })
    expect(hsvToRgb({ h: 200, s: 0, v: 0.5 })).toEqual({ r: 128, g: 128, b: 128 })
  })

  it('wraps hue and clamps s/v out of range', () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual(hsvToRgb({ h: 0, s: 1, v: 1 }))
    expect(hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 })
    expect(hsvToRgb({ h: 0, s: 5, v: 5 })).toEqual({ r: 255, g: 0, b: 0 })
  })
})

describe('rgbToHsv', () => {
  it('inverts the primaries', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 })
    expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toMatchObject({ h: 120, s: 1, v: 1 })
    expect(rgbToHsv({ r: 0, g: 0, b: 255 })).toMatchObject({ h: 240, s: 1, v: 1 })
  })

  it('reports hue 0 and saturation 0 for greys', () => {
    expect(rgbToHsv({ r: 128, g: 128, b: 128 })).toMatchObject({ h: 0, s: 0 })
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 })
  })

  it('round-trips a sample of colours through hsv and back', () => {
    const samples: RgbColor[] = [
      { r: 12, g: 200, b: 77 },
      { r: 255, g: 128, b: 0 },
      { r: 90, g: 90, b: 200 },
      { r: 33, g: 66, b: 99 }
    ]
    for (const rgb of samples) {
      expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb)
    }
  })
})

describe('rgbToHex / hexToRgb', () => {
  it('formats a 6-digit lowercase hex', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 128 })).toBe('#ff0080')
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
  })

  it('parses #rrggbb, #rgb and bare hex; rejects junk', () => {
    expect(hexToRgb('#ff0080')).toEqual({ r: 255, g: 0, b: 128 })
    expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0 })
    expect(hexToRgb('#0f0')).toEqual({ r: 0, g: 255, b: 0 })
    expect(hexToRgb('not-a-color')).toBeNull()
    expect(hexToRgb('#12')).toBeNull()
  })
})

describe('rgbEquals', () => {
  it('compares snapped channels', () => {
    expect(rgbEquals({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(true)
    expect(rgbEquals({ r: 10.4, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(true)
    expect(rgbEquals({ r: 11, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(false)
  })
})

describe('luminance / isDarkColor', () => {
  it('spans black to white', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0)
    expect(luminance({ r: 255, g: 255, b: 255 })).toBe(255)
  })

  it('weights the channels by how bright the eye reads them', () => {
    // Same channel value, very different perceived brightness: green reads as
    // bright, blue as nearly black. An unweighted average would call both "mid".
    expect(luminance({ r: 0, g: 255, b: 0 })).toBeGreaterThan(
      luminance({ r: 0, g: 0, b: 255 })
    )
    expect(isDarkColor({ r: 0, g: 255, b: 0 })).toBe(false)
    expect(isDarkColor({ r: 0, g: 0, b: 255 })).toBe(true)
  })

  it('calls the colours that vanish on a dark panel dark', () => {
    // Black is the one that started this: it needs the light outline.
    expect(isDarkColor({ r: 0, g: 0, b: 0 })).toBe(true)
    expect(isDarkColor({ r: 32, g: 32, b: 32 })).toBe(true)
    expect(isDarkColor({ r: 255, g: 255, b: 255 })).toBe(false)
    expect(isDarkColor({ r: 255, g: 255, b: 0 })).toBe(false)
  })

  it('snaps out-of-range channels rather than reporting an impossible luma', () => {
    expect(luminance({ r: 999, g: 999, b: 999 })).toBe(255)
    expect(isDarkColor({ r: -5, g: -5, b: -5 })).toBe(true)
  })
})
