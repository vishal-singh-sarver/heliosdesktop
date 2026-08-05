import { render, screen } from '@testing-library/react'
import Tooltip from '../index'

// react-tooltip positions itself with floating-ui, which jsdom can't exercise
// (every rect is zero). Capture the props it is handed instead, so the
// containment wiring is asserted at the only place it's observable.
const captured = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))
vi.mock('react-tooltip', () => ({
  Tooltip: (props: Record<string, unknown>) => {
    captured.props = props
    return null
  }
}))

// One floating-ui middleware as react-tooltip receives it. The factories expose
// the options they were built with, which is what we assert on.
type CapturedMiddleware = { name: string; options?: { boundary?: unknown; padding?: unknown } }

const middlewares = (): CapturedMiddleware[] =>
  (captured.props?.middlewares ?? []) as CapturedMiddleware[]

const shiftOptions = (): CapturedMiddleware['options'] =>
  middlewares().find((m) => m.name === 'shift')?.options

describe('<Tooltip />', () => {
  const defaultProps = {
    text: 'Help text here',
    ariaLabel: 'Show help'
  }

  beforeEach(() => {
    captured.props = null
  })

  it('renders without error', () => {
    render(<Tooltip {...defaultProps} />)
  })

  it('renders the trigger with correct label and "?" glyph', () => {
    render(<Tooltip {...defaultProps} />)
    expect(screen.getByLabelText('Show help')).toHaveTextContent('?')
  })

  it('wires the trigger with data-tooltip-* attributes for react-tooltip', () => {
    render(<Tooltip {...defaultProps} />)
    const trigger = screen.getByLabelText('Show help')

    // react-tooltip matches a tooltip bubble to its trigger via these attrs.
    expect(trigger).toHaveAttribute('data-tooltip-content', 'Help text here')
    expect(trigger.getAttribute('data-tooltip-id')).toBeTruthy()
  })

  it('makes the trigger keyboard-focusable', () => {
    render(<Tooltip {...defaultProps} />)
    expect(screen.getByLabelText('Show help')).toHaveAttribute('tabindex', '0')
  })

  describe('containment', () => {
    it('shifts against the panel it lives in, so it cannot hang outside it', () => {
      // A fixed-position bubble is free of the panel's clipping — and of its
      // bounds. Handing floating-ui the panel is what keeps it inside.
      const { container } = render(
        <aside>
          <Tooltip {...defaultProps} />
        </aside>
      )
      const panel = container.querySelector('aside')

      expect(shiftOptions()?.boundary).toBe(panel)
      expect(shiftOptions()?.padding).toBe(8)
    })

    it('falls back to the default boundary outside a panel', () => {
      render(<Tooltip {...defaultProps} />)

      // No panel to be contained by — floating-ui's own clipping-ancestor
      // default applies, which is the behaviour this had before.
      expect(shiftOptions()).toEqual({ padding: 8 })
    })

    it('keeps the offset and flip react-tooltip would have applied itself', () => {
      // Passing `middlewares` REPLACES react-tooltip's defaults rather than
      // adding to them, so dropping either one would silently change placement.
      render(<Tooltip {...defaultProps} />)

      expect(middlewares().map((m) => m.name)).toEqual(['offset', 'flip', 'shift'])
    })
  })
})
