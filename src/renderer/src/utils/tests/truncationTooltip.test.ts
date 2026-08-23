import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type React from 'react'
import {
  getTruncatedHover,
  hideFullText,
  showFullTextOnHover,
  subscribeToTruncatedHover
} from '../truncationTooltip'

// jsdom lays nothing out, so every element reports scrollWidth/clientWidth 0 —
// the two numbers the clipped/not-clipped decision is made from. They are
// defined per element here, which is exactly what the browser would report for
// a label wider than the box it was given.
function sized<T extends HTMLElement>(el: T, scrollWidth: number, clientWidth: number): T {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth })
  document.body.appendChild(el)
  return el
}

function label({ scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  const el = document.createElement('span')
  el.textContent = 'Ball-woodrow-berry stomatal conductance'
  return sized(el, scrollWidth, clientWidth)
}

// The handler only ever reads currentTarget off the event.
const enter = (el: HTMLElement): void =>
  showFullTextOnHover({ currentTarget: el } as unknown as React.MouseEvent<HTMLElement>)

const clipped = (): HTMLElement => label({ scrollWidth: 300, clientWidth: 120 })
const fits = (): HTMLElement => label({ scrollWidth: 120, clientWidth: 120 })

describe('showFullTextOnHover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    hideFullText()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('publishes the full text once the show delay elapses', () => {
    const el = clipped()
    enter(el)

    // Nothing yet — the delay is what stops a tooltip flashing on every row the
    // pointer sweeps across.
    expect(getTruncatedHover()).toBeNull()

    vi.advanceTimersByTime(100)
    expect(getTruncatedHover()).toEqual({
      anchor: el,
      text: 'Ball-woodrow-berry stomatal conductance'
    })
  })

  it('reads a name out of an input, which carries no text of its own', () => {
    // The Materials and Geometry panel headers: the name is an input so the
    // pencil can unlock it for renaming, and an input's text is its value.
    const el = document.createElement('input')
    el.value = 'A material name longer than its box'
    enter(sized(el, 300, 120))

    vi.advanceTimersByTime(100)
    expect(getTruncatedHover()?.text).toBe('A material name longer than its box')
  })

  it('stays silent for a label that fits', () => {
    enter(fits())
    vi.advanceTimersByTime(100)
    expect(getTruncatedHover()).toBeNull()
  })

  it('stays silent for a label overflowing by a single rounded pixel', () => {
    // Both widths are whole numbers, so a label that fits can still report one
    // more than the other. That is rounding, not clipping — a tooltip here would
    // repeat text the user can already read in full.
    enter(label({ scrollWidth: 121, clientWidth: 120 }))
    vi.advanceTimersByTime(100)
    expect(getTruncatedHover()).toBeNull()
  })

  it('shows the text as it stands when the tooltip fires, not on entry', () => {
    // A name can be renamed out from under the pointer inside the delay window.
    const el = clipped()
    enter(el)
    el.textContent = 'Renamed while the tooltip was pending'

    vi.advanceTimersByTime(100)
    expect(getTruncatedHover()?.text).toBe('Renamed while the tooltip was pending')
  })

  it('cancels a pending tooltip when the pointer leaves before it appears', () => {
    const el = clipped()
    enter(el)
    el.dispatchEvent(new MouseEvent('mouseleave'))

    vi.advanceTimersByTime(100)
    expect(getTruncatedHover()).toBeNull()
  })

  it('hides when the pointer leaves a label whose tooltip is already up', () => {
    const el = clipped()
    enter(el)
    vi.advanceTimersByTime(100)

    el.dispatchEvent(new MouseEvent('mouseleave'))
    expect(getTruncatedHover()).toBeNull()
  })

  it('survives the leave of the label the pointer just left', () => {
    // Moving between two adjacent clipped rows: the browser dispatches the old
    // row's leave BEFORE the new row's enter, and an unconditional hide there
    // would cancel the tooltip the new row had just scheduled.
    const first = clipped()
    const second = clipped()

    enter(first)
    enter(second)
    first.dispatchEvent(new MouseEvent('mouseleave'))

    vi.advanceTimersByTime(100)
    expect(getTruncatedHover()?.anchor).toBe(second)
  })

  it('notifies subscribers as the hover comes and goes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTruncatedHover(listener)

    enter(clipped())
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledTimes(1)

    hideFullText()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    enter(clipped())
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('showFullTextOnHover — labels that overflow by less than a pixel', () => {
  // jsdom has no canvas and no layout, so both halves of the sub-pixel pass are
  // supplied here: a 2D context that measures text at a fixed width per
  // character, and a border box for the label to be measured against.
  let charWidth = 10

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (text: string) => ({ width: text.length * charWidth })
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    hideFullText()
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  // A label whose ROUNDED widths say "fits" — the blind spot that kept the
  // geometry tree silent. Names there are capped at 20 characters, so they
  // overflow their column by a pixel or two and never by more.
  function narrowlyClipped(text: string, boxWidth: number): HTMLElement {
    const el = label({ scrollWidth: 173, clientWidth: 172 })
    el.textContent = text
    el.getBoundingClientRect = () => ({ width: boxWidth }) as DOMRect
    return el
  }

  it('shows the tooltip for a name overflowing by a single pixel', () => {
    // 17 characters at 10px = 170.4 of text in a 169.4 box: one pixel over, and
    // enough for the browser to drop two letters for the ellipsis.
    charWidth = 10.02
    enter(narrowlyClipped('GGJSHDJXJCKKVKDCK', 169.4))

    vi.advanceTimersByTime(100)
    expect(getTruncatedHover()?.text).toBe('GGJSHDJXJCKKVKDCK')
  })

  it('stays silent when the text fits the box to the fraction', () => {
    // The case CLIP_TOLERANCE was added for: rounding alone reports 173 against
    // 172 while nothing is actually cut off.
    charWidth = 10
    enter(narrowlyClipped('GGJSHDJXJCKKVKDCK', 170))

    vi.advanceTimersByTime(100)
    expect(getTruncatedHover()).toBeNull()
  })

  it('subtracts padding and borders before comparing', () => {
    // The box is measured border-to-border, so a padded label has less room for
    // its text than its rect suggests.
    charWidth = 10
    const el = narrowlyClipped('ABCDEFGHIJKLMNOPQ', 180)
    el.style.paddingLeft = '8px'
    el.style.paddingRight = '8px'

    enter(el)
    vi.advanceTimersByTime(100)
    // 170 of text against 180 - 16 = 164 of room.
    expect(getTruncatedHover()?.text).toBe('ABCDEFGHIJKLMNOPQ')
  })
})
