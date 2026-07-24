import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import Header from '../index'

// Mock SVG import so it resolves to a plain string
vi.mock('@renderer/assets/Helios_logo.svg', () => ({ default: 'helios-logo.svg' }))

describe('<Header />', () => {
  // Smoke test — component mounts without throwing
  it('renders without error', () => {
    render(
      <Header>
        <span>child</span>
      </Header>
    )
  })

  // Verifies the Helios logo image is rendered with correct src and alt text
  it('renders the Helios logo', () => {
    render(
      <Header>
        <span>child</span>
      </Header>
    )
    const logo = screen.getByAltText('Helios logo')
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', 'helios-logo.svg')
  })

  // Verifies that children passed to Header are rendered in the DOM
  it('renders children', () => {
    render(
      <Header>
        <span data-testid="test-child">Menu content</span>
      </Header>
    )
    expect(screen.getByTestId('test-child')).toBeInTheDocument()
  })

  // Verifies the two-row header structure (logo row + children row)
  it('renders two bordered rows', () => {
    const { container } = render(
      <Header>
        <span>child</span>
      </Header>
    )
    const headerEl = container.querySelector('header')
    // First div = logo row, second div = children row
    const rows = headerEl?.querySelectorAll(':scope > div')
    expect(rows?.length).toBe(2)
  })

  // ── onLogoClick behavior ──

  // Without onLogoClick: logo is a plain <img>, no button wrapper
  it('does not wrap the logo in a button when onLogoClick is absent', () => {
    render(
      <Header>
        <span>child</span>
      </Header>
    )
    expect(screen.queryByRole('button', { name: 'Go to home' })).not.toBeInTheDocument()
  })

  // With onLogoClick: logo is wrapped in a button that fires the callback
  it('wraps the logo in a "Go to home" button when onLogoClick is provided', () => {
    render(
      <Header onLogoClick={vi.fn()}>
        <span>child</span>
      </Header>
    )
    expect(screen.getByRole('button', { name: 'Go to home' })).toBeInTheDocument()
  })

  it('fires onLogoClick when the logo button is clicked', () => {
    const onLogoClick = vi.fn()
    render(
      <Header onLogoClick={onLogoClick}>
        <span>child</span>
      </Header>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go to home' }))
    expect(onLogoClick).toHaveBeenCalledTimes(1)
  })

  // ── Project title + scenario controls (title branch) ──

  it('renders the project title and scenario controls when a title is provided', () => {
    render(
      <Header title="My Project">
        <span>child</span>
      </Header>
    )
    expect(screen.getByTestId('project-title')).toHaveTextContent('My Project')
    expect(screen.getByTestId('scenario-chip')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename scenario' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close scenario' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add scenario' })).toBeInTheDocument()
  })

  it('does not render the title block when no title is provided', () => {
    render(
      <Header>
        <span>child</span>
      </Header>
    )
    expect(screen.queryByTestId('project-title')).not.toBeInTheDocument()
    expect(screen.queryByTestId('scenario-chip')).not.toBeInTheDocument()
  })

  // ── Fullscreen behavior (title bar row show/hide) ──

  describe('fullscreen (non-mac)', () => {
    const api = (window as unknown as { api: Record<string, unknown> }).api
    const originalIsFullScreen = api.windowIsFullScreen
    const originalOnFullScreenChange = api.onFullScreenChange

    afterEach(() => {
      api.windowIsFullScreen = originalIsFullScreen
      api.onFullScreenChange = originalOnFullScreenChange
    })

    it('hides the title-bar row (logo) when the window starts in fullscreen', async () => {
      api.windowIsFullScreen = () => Promise.resolve(true)
      render(
        <Header>
          <span data-testid="child">child</span>
        </Header>
      )
      // showTitleBar = isMac(false) || !isFullScreen(true) → false: logo row gone.
      await waitFor(() => expect(screen.queryByAltText('Helios logo')).not.toBeInTheDocument())
      // The children row always renders.
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('reacts to onFullScreenChange events from the main process', async () => {
      let emit: (v: boolean) => void = () => {}
      api.windowIsFullScreen = () => Promise.resolve(false)
      api.onFullScreenChange = (cb: (v: boolean) => void) => {
        emit = cb
        return () => {}
      }
      render(
        <Header>
          <span>child</span>
        </Header>
      )
      // Not fullscreen initially → logo row visible.
      expect(screen.getByAltText('Helios logo')).toBeInTheDocument()
      // Main process reports entering fullscreen → the row disappears.
      act(() => emit(true))
      await waitFor(() => expect(screen.queryByAltText('Helios logo')).not.toBeInTheDocument())
    })
  })

  // ── macOS title-bar double-click strip ──
  //
  // On macOS the 45px title-bar row renders an aria-hidden .app-no-drag strip
  // across its bottom edge that toggles maximize on double-click (the OS zone
  // only covers the upper ~28px). The strip only exists when getPlatform()
  // reports 'darwin', so we drive the platform bridge to the mac branch.

  describe('on macOS', () => {
    const api = (window as unknown as { api: Record<string, unknown> }).api
    const originalGetPlatform = api.getPlatform
    const originalDoubleClick = api.windowTitleBarDoubleClick

    afterEach(() => {
      api.getPlatform = originalGetPlatform
      api.windowTitleBarDoubleClick = originalDoubleClick
    })

    it('invokes windowTitleBarDoubleClick when the mac strip is double-clicked', async () => {
      const windowTitleBarDoubleClick = vi.fn()
      api.getPlatform = () => Promise.resolve('darwin')
      api.windowTitleBarDoubleClick = windowTitleBarDoubleClick

      const { container } = render(
        <Header>
          <span>child</span>
        </Header>
      )

      // isMac starts false; wait for the getPlatform() promise to resolve and
      // the mac-only strip to appear.
      const strip = await waitFor(() => {
        const el = container.querySelector('div[aria-hidden="true"].app-no-drag')
        expect(el).not.toBeNull()
        return el as HTMLElement
      })

      fireEvent.doubleClick(strip)
      expect(windowTitleBarDoubleClick).toHaveBeenCalledTimes(1)
    })
  })

  // Snapshot regression guard
  it('should match the snapshot', () => {
    const { container } = render(
      <Header>
        <span>child content</span>
      </Header>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
