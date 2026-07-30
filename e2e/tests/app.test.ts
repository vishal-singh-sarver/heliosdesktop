/**
 * App-level smoke tests.
 *
 * Run with:
 *   npm run e2e:build      # builds the app, then runs these tests
 *
 * The wdio-electron-service launches the built Electron binary; each `browser.*`
 * call then drives the live app window via ChromeDriver.
 *
 * Note: Helios shows a splash window first, then opens the main window. The
 * file-level before() hook waits for the main window (the one containing the
 * React #root) and switches WebdriverIO's focus to it, so DOM queries never run
 * against the splash screen.
 */

import { waitForMainWindow } from '../support/harness'

// Runs once before every test in this file: wait for the main window (the one
// with #root) and switch wdio focus to it, so DOM queries never hit the splash.
before(async () => {
  await waitForMainWindow()
})

describe('App launch', () => {
  // The app uses a frameless custom title bar, so the OS-level window title is
  // intentionally empty. We assert the launch via an open, loaded window.
  //
  // NOT isVisible(): e2e runs headless (windows are never show()n so they stay
  // off-screen — see isHeadlessTestRun() in src/main/index.ts), so native
  // visibility is legitimately false. A window that exists and has finished
  // loading is the property that actually matters here.
  it('opens an application window', async () => {
    const openWindowCount = await browser.electron.execute(
      (electron) =>
        electron.BrowserWindow.getAllWindows().filter(
          (win) => !win.isDestroyed() && !win.webContents.isLoading()
        ).length
    )
    expect(openWindowCount).toBeGreaterThan(0)
  })

  it('renders the React root element', async () => {
    await expect($('#root')).toExist()
  })

  it('mounts React content inside #root', async () => {
    // React replaces the empty div — at least one child must exist
    const root = await $('#root')
    const children = await root.$$('*')
    expect(children.length).toBeGreaterThan(0)
  })
})

describe('Context bridge (window.api)', () => {
  it('exposes window.api to the renderer', async () => {
    // window.api is injected by the preload contextBridge; the renderer's global
    // type augmentation isn't part of the e2e project, so cast locally.
    const hasApi = await browser.execute(
      () => typeof (window as unknown as { api?: unknown }).api !== 'undefined'
    )
    expect(hasApi).toBe(true)
  })

  it('exposes expected api methods', async () => {
    const methods = await browser.execute(() =>
      Object.keys((window as unknown as { api: Record<string, unknown> }).api)
    )
    expect(methods).toEqual(
      expect.arrayContaining([
        'openFile',
        'saveFile',
        'readFile',
        'writeFile',
        'getBackendStatus',
        'startBackend',
        'stopBackend',
      ])
    )
  })
})

describe('Electron app metadata', () => {
  it('returns an app name via the Electron API', async () => {
    const name = await browser.electron.execute((electron) => electron.app.getName())
    expect(typeof name).toBe('string')
    expect((name as string).length).toBeGreaterThan(0)
  })

  it('returns a semver version string', async () => {
    const version = await browser.electron.execute((electron) => electron.app.getVersion())
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('BrowserWindow', () => {
  // Headless e2e never show()s the window, so isVisible() is false by design.
  // Minimised IS still meaningful though: it would mean the window was created
  // in a state the renderer can't paint from.
  it('starts in a non-minimised state', async () => {
    const isMinimized = await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows()[0]
      return win ? win.isMinimized() : true
    })
    expect(isMinimized).toBe(false)
  })

  it('has a positive width and height', async () => {
    const bounds = await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows()[0]
      return win ? win.getBounds() : { width: 0, height: 0 }
    })
    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.height).toBeGreaterThan(0)
  })
})
