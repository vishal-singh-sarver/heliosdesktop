// Unit tests for the frameless-window control cluster. Previously 52% — the
// IPC-wired onClick handlers and the mac hover-swap were unexercised. window.api
// is stubbed globally in tests/setup.ts; we spy on the three window verbs to
// assert the buttons dispatch the right IPC calls.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import WindowControls from '../index'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function spyWindowApi(): {
  minimize: ReturnType<typeof vi.spyOn>
  maximize: ReturnType<typeof vi.spyOn>
  close: ReturnType<typeof vi.spyOn>
} {
  return {
    minimize: vi.spyOn(window.api, 'windowMinimize'),
    maximize: vi.spyOn(window.api, 'windowToggleMaximize'),
    close: vi.spyOn(window.api, 'windowClose')
  }
}

describe('WindowControls — right (Windows/Linux)', () => {
  it('renders min/max/close and each button fires its IPC verb', () => {
    const spy = spyWindowApi()
    render(<WindowControls side="right" />)

    // All three are visible immediately (no hover gate on this side).
    fireEvent.click(screen.getByLabelText('Minimize window'))
    fireEvent.click(screen.getByLabelText('Maximize window'))
    fireEvent.click(screen.getByLabelText('Close window'))

    expect(spy.minimize).toHaveBeenCalledTimes(1)
    expect(spy.maximize).toHaveBeenCalledTimes(1)
    expect(spy.close).toHaveBeenCalledTimes(1)
  })
})

describe('WindowControls — left (macOS traffic lights)', () => {
  it('shows only the dummy image until hover, then reveals interactive controls', () => {
    const spy = spyWindowApi()
    const { container } = render(<WindowControls side="left" />)

    // Before hover: the combined dummy SVG, no clickable buttons.
    expect(screen.queryByLabelText('Close window')).toBeNull()

    const wrapper = container.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)

    // On hover the real traffic-light buttons appear and are wired to IPC.
    fireEvent.click(screen.getByLabelText('Close window'))
    fireEvent.click(screen.getByLabelText('Minimize window'))
    fireEvent.click(screen.getByLabelText('Maximize window'))
    expect(spy.close).toHaveBeenCalledTimes(1)
    expect(spy.minimize).toHaveBeenCalledTimes(1)
    expect(spy.maximize).toHaveBeenCalledTimes(1)

    // Leaving collapses back to the dummy image.
    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByLabelText('Close window')).toBeNull()
  })
})
