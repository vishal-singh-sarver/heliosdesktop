import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RgbColor } from 'utils/color'
import ColorPicker, { type ColorPickerFieldControl } from '..'

const field = (value = ''): ColorPickerFieldControl => ({
  value,
  onChange: () => {},
  onBlur: () => {}
})

const labels = {
  rgbValues: 'RGB Values',
  opacity: 'Opacity',
  usedColors: 'Used colors',
  colorArea: 'Saturation and brightness',
  hueSlider: 'Hue',
  opacitySlider: 'Opacity slider',
  swatch: (hex: string) => `Use colour ${hex}`
}

// The picker is fully controlled, so a harness feeds each emitted colour back in
// as the next `rgb` — the same round trip the real form does.
function Harness({
  onChangeColor = () => {},
  onChangeOpacity = () => {},
  recentColors = []
}: {
  onChangeColor?: (rgb: RgbColor) => void
  onChangeOpacity?: (o: number) => void
  recentColors?: RgbColor[]
}): React.JSX.Element {
  const [rgb, setRgb] = React.useState<RgbColor>({ r: 255, g: 0, b: 0 })
  const [opacity, setOpacity] = React.useState(100)
  return (
    <ColorPicker
      rgb={rgb}
      opacity={opacity}
      recentColors={recentColors}
      onChangeColor={(next) => {
        setRgb(next)
        onChangeColor(next)
      }}
      onChangeOpacity={(next) => {
        setOpacity(next)
        onChangeOpacity(next)
      }}
      channelFields={{ r: field('255'), g: field('0'), b: field('0') }}
      opacityField={field('100')}
      labels={labels}
    />
  )
}

// A track whose box is known, so a client point maps to a predictable fraction.
const stubTrack = (el: HTMLElement, width = 200, height = 100): { calls: () => number } => {
  let calls = 0
  el.getBoundingClientRect = () => {
    calls++
    return { left: 0, top: 0, width, height, right: width, bottom: height } as DOMRect
  }
  return { calls: () => calls }
}

describe('<ColorPicker /> dragging', () => {
  let frames: FrameRequestCallback[] = []

  beforeEach(() => {
    frames = []
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.hasPointerCapture = vi.fn(() => true)
    // Hold the frame callbacks so each test decides when a frame runs.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  const runFrame = (): void => {
    const pending = frames
    frames = []
    pending.forEach((cb) => cb(0))
  }

  it('commits on pointer down, without waiting for a frame', () => {
    const onChangeColor = vi.fn()
    render(<Harness onChangeColor={onChangeColor} />)
    const area = screen.getByRole('slider', { name: 'Saturation and brightness' })
    stubTrack(area)

    // Click the top-right corner: full saturation, full brightness → pure red.
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 200, clientY: 0 })
    expect(onChangeColor).toHaveBeenCalledWith({ r: 255, g: 0, b: 0 })
  })

  it('coalesces a burst of moves into ONE commit per frame, keeping the last', () => {
    // The point of the frame: a pointer reports faster than the screen repaints,
    // and every commit re-renders the form that owns the colour.
    const onChangeColor = vi.fn()
    render(<Harness onChangeColor={onChangeColor} />)
    const area = screen.getByRole('slider', { name: 'Saturation and brightness' })
    stubTrack(area)

    fireEvent.pointerDown(area, { pointerId: 1, clientX: 0, clientY: 100 })
    onChangeColor.mockClear()

    fireEvent.pointerMove(area, { pointerId: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(area, { pointerId: 1, clientX: 100, clientY: 50 })
    fireEvent.pointerMove(area, { pointerId: 1, clientX: 200, clientY: 0 })
    // Nothing committed yet — the frame hasn't run.
    expect(onChangeColor).not.toHaveBeenCalled()

    runFrame()
    // Exactly one commit, and it's the newest position (not a stale one).
    expect(onChangeColor).toHaveBeenCalledTimes(1)
    expect(onChangeColor).toHaveBeenCalledWith({ r: 255, g: 0, b: 0 })
  })

  it('measures the track once per drag, not on every move', () => {
    // Reading layout mid-drag forces a synchronous re-layout of the panel right
    // after React wrote the thumb's new position — that is what made dragging lag.
    render(<Harness />)
    const area = screen.getByRole('slider', { name: 'Saturation and brightness' })
    const track = stubTrack(area)

    fireEvent.pointerDown(area, { pointerId: 1, clientX: 0, clientY: 100 })
    expect(track.calls()).toBe(1)

    for (let i = 0; i < 10; i++) {
      fireEvent.pointerMove(area, { pointerId: 1, clientX: i * 10, clientY: 50 })
      runFrame()
    }
    expect(track.calls()).toBe(1)

    // A NEW drag re-measures — the panel may have scrolled or resized since.
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 0, clientY: 100 })
    expect(track.calls()).toBe(2)
  })

  it('ignores moves once the pointer is no longer captured', () => {
    const onChangeColor = vi.fn()
    render(<Harness onChangeColor={onChangeColor} />)
    const area = screen.getByRole('slider', { name: 'Saturation and brightness' })
    stubTrack(area)
    Element.prototype.hasPointerCapture = vi.fn(() => false)

    fireEvent.pointerMove(area, { pointerId: 1, clientX: 100, clientY: 50 })
    runFrame()
    expect(onChangeColor).not.toHaveBeenCalled()
  })

  it('clamps a drag past the edge instead of overshooting', () => {
    const onChangeOpacity = vi.fn()
    render(<Harness onChangeOpacity={onChangeOpacity} />)
    const slider = screen.getByRole('slider', { name: 'Opacity slider' })
    stubTrack(slider, 200, 8)

    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 400, clientY: 4 })
    expect(onChangeOpacity).toHaveBeenLastCalledWith(100)

    fireEvent.pointerMove(slider, { pointerId: 1, clientX: -80, clientY: 4 })
    runFrame()
    expect(onChangeOpacity).toHaveBeenLastCalledWith(0)
  })

  it('keeps the thumb inside the track at both ends, instead of straddling the corner', () => {
    // At 0 the thumb used to centre on the track's edge, so half the circle hung
    // outside it. Its centre now stops a radius (10px) short at each end.
    render(<Harness />)
    const slider = screen.getByRole('slider', { name: 'Opacity slider' })
    stubTrack(slider, 200, 8)
    const thumb = slider.querySelector('span') as HTMLElement

    fireEvent.pointerDown(slider, { pointerId: 1, clientX: -50, clientY: 4 })
    expect(thumb.style.left).toBe('calc(10px + 0 * (100% - 20px))')

    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 999, clientY: 4 })
    expect(thumb.style.left).toBe('calc(10px + 1 * (100% - 20px))')
  })

  it('still reaches both extremes — the inset moves the thumb, not the range', () => {
    const onChangeOpacity = vi.fn()
    render(<Harness onChangeOpacity={onChangeOpacity} />)
    const slider = screen.getByRole('slider', { name: 'Opacity slider' })
    stubTrack(slider, 200, 8)

    // Anywhere within a radius of the left edge is still 0% — the ends get a
    // bigger hit area rather than becoming unreachable.
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 0, clientY: 4 })
    expect(onChangeOpacity).toHaveBeenLastCalledWith(0)
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 10, clientY: 4 })
    expect(onChangeOpacity).toHaveBeenLastCalledWith(0)
    // …and the midpoint of the travel is still the midpoint of the value.
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 100, clientY: 4 })
    expect(onChangeOpacity).toHaveBeenLastCalledWith(50)
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 190, clientY: 4 })
    expect(onChangeOpacity).toHaveBeenLastCalledWith(100)
  })

  it('a hue drag keeps saturation and brightness', () => {
    // Each track owns one axis; the deferred frame must not resurrect a stale
    // value for the axes it doesn't touch.
    const onChangeColor = vi.fn()
    render(<Harness onChangeColor={onChangeColor} />)
    const area = screen.getByRole('slider', { name: 'Saturation and brightness' })
    const hue = screen.getByRole('slider', { name: 'Hue' })
    stubTrack(area)
    stubTrack(hue, 360, 8)

    // Half saturation, half brightness.
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 100, clientY: 50 })
    const dimmed = onChangeColor.mock.lastCall![0] as RgbColor

    // Now swing the hue to ~120° (green) — the colour must stay as dim and as
    // washed-out as it was, just a different hue.
    fireEvent.pointerDown(hue, { pointerId: 2, clientX: 120, clientY: 4 })
    const swung = onChangeColor.mock.lastCall![0] as RgbColor

    const brightness = (c: RgbColor): number => Math.max(c.r, c.g, c.b)
    const spread = (c: RgbColor): number => brightness(c) - Math.min(c.r, c.g, c.b)
    expect(brightness(swung)).toBe(brightness(dimmed))
    expect(spread(swung)).toBe(spread(dimmed))
    // …and it really is a different hue (green now leads, not red).
    expect(swung.g).toBeGreaterThan(swung.r)
  })
})
