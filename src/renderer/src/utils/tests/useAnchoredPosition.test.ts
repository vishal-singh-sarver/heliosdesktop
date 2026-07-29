import { describe, it, expect } from 'vitest'
import {
  availableSpace,
  placeFloating,
  type AnchorRect,
  type Placement,
  type Position,
  type Size
} from '../useAnchoredPosition'

// A 1600×900 window, the shape the app is normally used at.
const VIEWPORT = { width: 1600, height: 900 }
const GAP = 8
const PAD = 8

// The right-hand Properties panel: 340px wide, flush to the right edge.
const panel: AnchorRect = { top: 100, left: 1252, width: 340, height: 700 }
// The "Select" button inside it — the popup takes its y from here and its x
// from the panel (see getSelectAnchorRect in ObjectPropertiesForm).
const selectAnchor: AnchorRect = { top: 412, left: 1252, width: 340, height: 25 }

const place = (anchor: AnchorRect, floating: Size, placement: Placement): Position =>
  placeFloating(anchor, floating, placement, VIEWPORT, GAP, PAD)

const space = (anchor: AnchorRect, placement: Placement): Size =>
  availableSpace(anchor, placement, VIEWPORT, GAP, PAD)

describe('placeFloating', () => {
  it("places 'left-start' beside the anchor, top edges aligned", () => {
    // The Select Materials popup: 240×343, sitting 8px left of the panel and
    // level with the button. Matches what openMaterialPopup produced by hand.
    expect(place(selectAnchor, { width: 240, height: 343 }, 'left-start')).toEqual({
      left: 1252 - 240 - 8,
      top: 412
    })
  })

  it("centres 'left' vertically against the anchor", () => {
    // The material properties popup: 370 wide, height 80% of the panel's 700,
    // centred in it. 100 + (700 - 560) / 2 = 170.
    expect(place(panel, { width: 370, height: 560 }, 'left')).toEqual({
      left: 1252 - 370 - 8,
      top: 170
    })
  })

  it("places 'bottom-start' under the anchor, left edges aligned", () => {
    expect(place(selectAnchor, { width: 200, height: 120 }, 'bottom-start')).toEqual({
      left: 1252,
      top: 412 + 25 + 8
    })
  })

  it('clamps a popup that would run off the left edge', () => {
    // The bug in openMaterialPopup today: left goes negative on a narrow window
    // and the popup walks off-screen. An anchor at x=120 wants left = -128.
    const nearLeft: AnchorRect = { ...selectAnchor, left: 120 }
    expect(place(nearLeft, { width: 240, height: 343 }, 'left-start').left).toBe(PAD)
  })

  it('clamps a popup that would run off the bottom edge', () => {
    // Anchor near the bottom: top would be 800, pushing 343px past the viewport.
    const nearBottom: AnchorRect = { ...selectAnchor, top: 800 }
    expect(place(nearBottom, { width: 240, height: 343 }, 'left-start').top).toBe(
      VIEWPORT.height - 343 - PAD
    )
  })

  it('clamps a popup that would run off the top edge', () => {
    // 'left' centring against a tall anchor can produce a negative top.
    const tall: AnchorRect = { top: 0, left: 1252, width: 340, height: 100 }
    expect(place(tall, { width: 370, height: 400 }, 'left').top).toBe(PAD)
  })

  it('pins to the padding when the popup is larger than the viewport', () => {
    // Both clamp bounds cross over (max < min); the popup starts at the padding
    // and overflows the far edge rather than jumping to a negative coordinate.
    const p = place(selectAnchor, { width: 2000, height: 1200 }, 'left-start')
    expect(p).toEqual({ left: PAD, top: PAD })
  })
})

describe('availableSpace', () => {
  it("reports the room left of the anchor for 'left-start'", () => {
    // 1252 - 8 gap - 8 padding = 1236 wide; full viewport height less padding.
    expect(space(selectAnchor, 'left-start')).toEqual({
      width: 1252 - GAP - PAD,
      height: VIEWPORT.height - PAD * 2
    })
  })

  it("reports the same room for 'left'", () => {
    expect(space(panel, 'left')).toEqual({
      width: 1252 - GAP - PAD,
      height: VIEWPORT.height - PAD * 2
    })
  })

  it("reports the room below the anchor for 'bottom-start'", () => {
    expect(space(selectAnchor, 'bottom-start')).toEqual({
      width: VIEWPORT.width - 1252 - PAD,
      height: VIEWPORT.height - (412 + 25 + GAP) - PAD
    })
  })

  it('never reports negative space when the anchor is flush against an edge', () => {
    // A panel at x=0 leaves nothing to its left; consumers use this as a
    // maxHeight/maxWidth, and a negative would collapse the popup entirely.
    const flush: AnchorRect = { top: 890, left: 0, width: 340, height: 25 }
    expect(space(flush, 'left-start').width).toBe(0)
    expect(space(flush, 'bottom-start').height).toBe(0)
  })
})
