import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from 'utils/storageKeys'
import {
  DEFAULT_RECENT_OPACITY,
  RECENT_COLORS_LIMIT,
  loadRecentColors,
  normalizeRecentColors,
  prependRecentColor,
  saveRecentColors
} from '../recentColors'

describe('normalizeRecentColors', () => {
  it('keeps each entry’s opacity and snaps it to a whole 0-100', () => {
    expect(
      normalizeRecentColors([
        { r: 10, g: 20, b: 30, opacity: 40 },
        { r: 0, g: 0, b: 0, opacity: 40.6 },
        { r: 1, g: 1, b: 1, opacity: 250 },
        { r: 2, g: 2, b: 2, opacity: -10 }
      ])
    ).toEqual([
      { r: 10, g: 20, b: 30, opacity: 40 },
      { r: 0, g: 0, b: 0, opacity: 41 },
      { r: 1, g: 1, b: 1, opacity: 100 },
      { r: 2, g: 2, b: 2, opacity: 0 }
    ])
  })

  it('defaults a missing or non-finite opacity to fully opaque', () => {
    // A v1 entry (written before the history stored opacity) stays usable.
    expect(normalizeRecentColors([{ r: 5, g: 6, b: 7 }])).toEqual([
      { r: 5, g: 6, b: 7, opacity: DEFAULT_RECENT_OPACITY }
    ])
    expect(normalizeRecentColors([{ r: 5, g: 6, b: 7, opacity: NaN }])).toEqual([
      { r: 5, g: 6, b: 7, opacity: DEFAULT_RECENT_OPACITY }
    ])
  })

  it('de-dupes on the colour alone, keeping the leading entry’s opacity', () => {
    // Two swatches of one colour would be visually identical, so the most recent
    // save wins outright — colour and opacity together.
    expect(
      normalizeRecentColors([
        { r: 255, g: 0, b: 0, opacity: 30 },
        { r: 255, g: 0, b: 0, opacity: 90 }
      ])
    ).toEqual([{ r: 255, g: 0, b: 0, opacity: 30 }])
  })

  it('caps the list at the limit', () => {
    const many = Array.from({ length: RECENT_COLORS_LIMIT + 4 }, (_, i) => ({
      r: i,
      g: 0,
      b: 0,
      opacity: 100
    }))
    expect(normalizeRecentColors(many)).toHaveLength(RECENT_COLORS_LIMIT)
  })
})

describe('prependRecentColor', () => {
  it('moves a re-saved colour to the front with its NEW opacity', () => {
    const list = [
      { r: 255, g: 0, b: 0, opacity: 100 },
      { r: 0, g: 255, b: 0, opacity: 50 }
    ]
    expect(prependRecentColor(list, { r: 0, g: 255, b: 0, opacity: 25 })).toEqual([
      { r: 0, g: 255, b: 0, opacity: 25 },
      { r: 255, g: 0, b: 0, opacity: 100 }
    ])
  })
})

describe('load / save round trip', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists and reads back the opacity', () => {
    saveRecentColors([{ r: 1, g: 2, b: 3, opacity: 60 }])
    expect(loadRecentColors()).toEqual([{ r: 1, g: 2, b: 3, opacity: 60 }])
  })

  it('reads a stored v1 list (no opacity) as fully opaque', () => {
    localStorage.setItem(STORAGE_KEYS.recentColors, JSON.stringify([{ r: 1, g: 2, b: 3 }]))
    expect(loadRecentColors()).toEqual([{ r: 1, g: 2, b: 3, opacity: DEFAULT_RECENT_OPACITY }])
  })

  it('drops entries that are not colours at all, and never throws on junk', () => {
    localStorage.setItem(
      STORAGE_KEYS.recentColors,
      JSON.stringify([{ r: 1, g: 2, b: 3, opacity: 10 }, { r: 'x' }, null, 7])
    )
    expect(loadRecentColors()).toEqual([{ r: 1, g: 2, b: 3, opacity: 10 }])

    localStorage.setItem(STORAGE_KEYS.recentColors, 'not json')
    expect(loadRecentColors()).toEqual([])
  })
})
