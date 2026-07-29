import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AnchoredPopup from '../index'
import type { AnchorRect } from 'utils/useAnchoredPosition'

// A stand-in for the right-hand panel: 340 wide, 700 tall, near the right edge.
const ANCHOR: AnchorRect = { top: 100, left: 1252, width: 340, height: 700 }
const getAnchorRect = (): AnchorRect => ANCHOR

describe('AnchoredPopup', () => {
  it('renders nothing when closed', () => {
    render(
      <AnchoredPopup open={false} onClose={vi.fn()} getAnchorRect={getAnchorRect} placement="left">
        <p>Popup body</p>
      </AnchoredPopup>
    )
    expect(screen.queryByText('Popup body')).not.toBeInTheDocument()
  })

  it('portals into document.body when open', () => {
    // The portal is what keeps the panel's overflow:hidden from clipping the popup.
    const { container } = render(
      <AnchoredPopup open onClose={vi.fn()} getAnchorRect={getAnchorRect} placement="left">
        <p>Popup body</p>
      </AnchoredPopup>
    )
    const body = screen.getByText('Popup body')
    expect(body).toBeInTheDocument()
    expect(container).not.toContainElement(body)
  })

  it('closes on outside click', () => {
    const onClose = vi.fn()
    render(
      <AnchoredPopup open onClose={onClose} getAnchorRect={getAnchorRect} placement="left">
        <p>Popup body</p>
      </AnchoredPopup>
    )
    fireEvent.click(screen.getByTestId('anchored-popup-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <AnchoredPopup open onClose={onClose} getAnchorRect={getAnchorRect} placement="left">
        <p>Popup body</p>
      </AnchoredPopup>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on Escape once closed', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AnchoredPopup open onClose={onClose} getAnchorRect={getAnchorRect} placement="left">
        <p>Popup body</p>
      </AnchoredPopup>
    )
    rerender(
      <AnchoredPopup open={false} onClose={onClose} getAnchorRect={getAnchorRect} placement="left">
        <p>Popup body</p>
      </AnchoredPopup>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('hands the render prop the live anchor rect and the space around it', () => {
    // This is what lets a popup size itself against its anchor (the detail
    // popup's 80%-of-panel height) and cap itself to what fits.
    render(
      <AnchoredPopup open onClose={vi.fn()} getAnchorRect={getAnchorRect} placement="left" gap={8}>
        {({ anchorRect, available }) => (
          <p>{`h=${anchorRect.height} maxH=${available.height} maxW=${available.width}`}</p>
        )}
      </AnchoredPopup>
    )
    // jsdom's window is 1024×768. left placement → width 1252-8-8, height 768-16.
    expect(screen.getByText('h=700 maxH=752 maxW=1236')).toBeInTheDocument()
  })

  it('re-measures when the anchor moves', () => {
    // The whole point: a resize moves the trigger and the popup follows. The rAF
    // loop drives this in the app; here we force a re-render with a moved anchor.
    let rect: AnchorRect = { ...ANCHOR }
    const moving = (): AnchorRect => rect

    const { rerender } = render(
      <AnchoredPopup open onClose={vi.fn()} getAnchorRect={moving} placement="left">
        {({ anchorRect }) => <p>{`top=${anchorRect.top}`}</p>}
      </AnchoredPopup>
    )
    expect(screen.getByText('top=100')).toBeInTheDocument()

    rect = { ...ANCHOR, top: 250 }
    rerender(
      <AnchoredPopup open onClose={vi.fn()} getAnchorRect={moving} placement="left">
        {({ anchorRect }) => <p>{`top=${anchorRect.top}`}</p>}
      </AnchoredPopup>
    )
    expect(screen.getByText('top=250')).toBeInTheDocument()
  })
})
