import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Dialog from '../index'

// jsdom does not support HTMLDialogElement — mock showModal and close
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

describe('<Dialog />', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Test Dialog',
    onClose: vi.fn(),
    children: <p>Dialog content</p>
  }

  // Smoke test — component mounts without throwing
  it('renders without error', () => {
    render(<Dialog {...defaultProps} />)
  })

  // Verifies the dialog title is rendered in the header
  it('renders the title', () => {
    render(<Dialog {...defaultProps} />)
    expect(screen.getByText('Test Dialog')).toBeInTheDocument()
  })

  // Verifies children are rendered inside the dialog body
  it('renders children content', () => {
    render(<Dialog {...defaultProps} />)
    expect(screen.getByText('Dialog content')).toBeInTheDocument()
  })

  // Verifies the dialog element has the correct aria-label
  it('has correct aria-label', () => {
    render(<Dialog {...defaultProps} />)
    expect(screen.getByLabelText('Test Dialog')).toBeInTheDocument()
  })

  // Verifies showModal is called when isOpen is true
  it('calls showModal when isOpen is true', () => {
    render(<Dialog {...defaultProps} />)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
  })

  // Verifies close is called when isOpen changes from true to false
  it('calls close when isOpen becomes false', () => {
    const { rerender } = render(<Dialog {...defaultProps} />)
    rerender(<Dialog {...defaultProps} isOpen={false} />)
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
  })

  // Verifies showModal is NOT called when isOpen starts as false
  it('does not call showModal when isOpen is false', () => {
    vi.mocked(HTMLDialogElement.prototype.showModal).mockClear()
    render(<Dialog {...defaultProps} isOpen={false} />)
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled()
  })

  // Verifies onClose is called when the close (×) button is clicked
  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<Dialog {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Verifies the native cancel event (ESC key) is prevented and onClose is called
  it('calls onClose on cancel event and prevents default', () => {
    const onClose = vi.fn()
    render(<Dialog {...defaultProps} onClose={onClose} />)
    const dialog = screen.getByLabelText('Test Dialog')
    const cancelEvent = new Event('cancel', { bubbles: true, cancelable: true })
    const preventDefaultSpy = vi.spyOn(cancelEvent, 'preventDefault')
    dialog.dispatchEvent(cancelEvent)
    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  // Verifies the close button shows the × character
  it('renders the close button with × symbol', () => {
    render(<Dialog {...defaultProps} />)
    expect(screen.getByLabelText('Close dialog')).toHaveTextContent('×')
  })

  // Opening focuses the first real FIELD, not a focusable help icon that happens
  // to sit above it in the label — that icon stealing focus popped its tooltip
  // open (react-tooltip opens on focus) before anyone hovered it.
  it('focuses the first input, not a focusable element preceding it', () => {
    render(
      <Dialog {...defaultProps}>
        <label>
          Project Name
          <span tabIndex={0} data-testid="help">
            ?
          </span>
        </label>
        <input aria-label="Project Name" />
      </Dialog>
    )
    expect(document.activeElement).toBe(screen.getByLabelText('Project Name'))
    expect(document.activeElement).not.toBe(screen.getByTestId('help'))
  })

  // With no form control at all, any other focusable element is still used.
  it('falls back to a focusable non-input when the body has no field', () => {
    render(
      <Dialog {...defaultProps}>
        <span tabIndex={0} data-testid="help">
          ?
        </span>
      </Dialog>
    )
    expect(document.activeElement).toBe(screen.getByTestId('help'))
  })

  // Vertical position is MEASURED once on open, not left to CSS. `inset-0 m-auto`
  // centres continuously, which makes the dialog's y a function of its own height
  // — so a body that grew a line mid-click (a field's inline error appearing on
  // the blur that clicking a button causes) moved the × out from under the
  // pointer between mousedown and mouseup, and no click event fired at all: the
  // New Project dialog just stayed open. Measuring gives the same placement and
  // then holds it.
  describe('vertical placement', () => {
    // jsdom has no layout, so offsetHeight is stubbed to give the measurement
    // something real to centre.
    const withHeight = (px: number): void => {
      Object.defineProperty(HTMLDialogElement.prototype, 'offsetHeight', {
        configurable: true,
        get: () => px
      })
    }
    // Both stubs are global, and the snapshot tests below measure too — leaving
    // either behind would make those snapshots depend on test order.
    const realHeight = window.innerHeight
    afterEach(() => {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'offsetHeight')
      window.innerHeight = realHeight
    })

    it('centres on open, whatever the dialog’s height', () => {
      window.innerHeight = 1000

      withHeight(150) // a delete confirmation
      const { unmount } = render(<Dialog {...defaultProps} />)
      expect(screen.getByLabelText('Test Dialog').style.top).toBe('425px')
      unmount()

      withHeight(320) // a form dialog — centred too, not at some fixed offset
      render(<Dialog {...defaultProps} />)
      expect(screen.getByLabelText('Test Dialog').style.top).toBe('340px')
    })

    // The point of measuring rather than letting CSS do it: growth moves nothing.
    it('does NOT move when the body grows after opening', () => {
      window.innerHeight = 1000
      withHeight(300)
      const { rerender } = render(<Dialog {...defaultProps} />)
      const dialog = screen.getByLabelText('Test Dialog')
      expect(dialog.style.top).toBe('350px')

      withHeight(340) // an inline error appeared under a field
      rerender(
        <Dialog {...defaultProps}>
          <p>Dialog content</p>
          <p>Project name is required.</p>
        </Dialog>
      )
      expect(dialog.style.top).toBe('350px')
    })

    // A dialog too tall to centre would otherwise be placed at a negative top,
    // putting its header and × off the top of the screen.
    it('clamps a dialog taller than the window instead of centring it off-screen', () => {
      window.innerHeight = 400
      withHeight(900)
      render(<Dialog {...defaultProps} />)
      expect(screen.getByLabelText('Test Dialog').style.top).toBe('24px')
    })

    // A resize is not something that happens between a mousedown and a mouseup,
    // so re-measuring there is safe — and maximising with a dialog open would
    // otherwise strand it where it was first measured.
    it('re-centres when the window is resized', () => {
      window.innerHeight = 1000
      withHeight(200)
      render(<Dialog {...defaultProps} />)
      const dialog = screen.getByLabelText('Test Dialog')
      expect(dialog.style.top).toBe('400px')

      window.innerHeight = 600
      fireEvent(window, new Event('resize'))
      expect(dialog.style.top).toBe('200px')
    })
  })

  // Horizontal centring stays in CSS — a dialog's WIDTH doesn't change mid-click.
  // app-no-drag keeps the header clickable where the dialog overlaps the frameless
  // window's `-webkit-app-region: drag` title bar, which swallows pointer events
  // from anything that doesn't opt out.
  it('centres horizontally in CSS and opts out of the window drag region', () => {
    render(<Dialog {...defaultProps} />)
    const dialog = screen.getByLabelText('Test Dialog')
    expect(dialog).toHaveClass('left-1/2', '-translate-x-1/2', 'app-no-drag')
    expect(dialog.className).not.toMatch(/\binset-0\b|\bm-auto\b/)
  })

  // Positioning is not part of the overridable `className` — a caller that passes
  // its own (the Rename Project dialog does) must still get it.
  it('keeps its positioning when the caller overrides className', () => {
    render(<Dialog {...defaultProps} className="w-[352px] bg-[#202020]" />)
    const dialog = screen.getByLabelText('Test Dialog')
    expect(dialog).toHaveClass('left-1/2', 'app-no-drag', 'w-[352px]')
    expect(dialog.style.top).not.toBe('')
  })

  // Buttons default to type="submit" — harmless today (nothing here is in a
  // <form>), but a body that grows one later would make the × submit it.
  it('gives the close button an explicit type', () => {
    render(<Dialog {...defaultProps} />)
    expect(screen.getByLabelText('Close dialog')).toHaveAttribute('type', 'button')
  })

  // Snapshot regression guard — open state
  it('should match the snapshot (open)', () => {
    const { container } = render(<Dialog {...defaultProps} />)
    expect(container.firstChild).toMatchSnapshot()
  })

  // Snapshot regression guard — closed state
  it('should match the snapshot (closed)', () => {
    const { container } = render(<Dialog {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
