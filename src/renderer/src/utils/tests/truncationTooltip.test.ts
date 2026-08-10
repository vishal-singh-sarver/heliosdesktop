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
