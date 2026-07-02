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

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Runs once before every test in this file: wait for the main window to exist.
before(async () => {
  await browser.waitUntil(
    async () => {
      try {
        const handles = await browser.getWindowHandles()
        if (handles.length === 0) return false
        // Focus the most recently opened window. Once the splash closes, this is
        // the main window. Checking for #root guarantees we land on it even if
        // the splash is briefly still open.
        await browser.switchToWindow(handles[handles.length - 1])
        return await browser.execute(() => document.querySelector('#root') !== null)
      } catch {
        // A window may be mid-transition (splash closing) — retry.
        return false
      }
    },
    { timeout: 30000, timeoutMsg: 'Main window with #root never became available' }
  )
})

describe('App launch', () => {
  // The app uses a frameless custom title bar, so the OS-level window title is
  // intentionally empty. We assert the launch via a visible window instead.
  it('opens a visible application window', async () => {
    const visibleWindowCount = await browser.electron.execute(
      (electron) => electron.BrowserWindow.getAllWindows().filter((win) => win.isVisible()).length
    )
    expect(visibleWindowCount).toBeGreaterThan(0)
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
  it('starts in a visible, non-minimised state', async () => {
    const isVisible = await browser.electron.execute((electron) => {
      const win = electron.BrowserWindow.getAllWindows().find((w) => w.isVisible())
      return win ? win.isVisible() : false
    })
    expect(isVisible).toBe(true)
  })

  it('has a positive width and height', async () => {
    const bounds = await browser.electron.execute((electron) => {
      const windows = electron.BrowserWindow.getAllWindows()
      const win = windows.find((w) => w.isVisible()) ?? windows[0]
      return win ? win.getBounds() : { width: 0, height: 0 }
    })
    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.height).toBeGreaterThan(0)
  })
})

describe('Splash window', () => {
  // The splash is created then destroy()ed the instant the main window is ready
  // (main/index.ts) — BEFORE WebdriverIO connects — so its size can't be queried
  // at runtime like the main window's. We assert the configured dimensions
  // statically from source instead.
  //
  // This asserts the EXPECTED 1000×600 and therefore FAILS until the code matches
  // — by design, matching the delete-row test: a divergence must be reported, not
  // hidden. A merge ("splash window height changed") set the height to 500 in
  // main/index.ts createSplashWindow; if 500 is the intended value, update this
  // expectation and that line together.
  it('is configured 1000×600', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/main/index.ts'), 'utf8')
    const opts = src.slice(src.indexOf('new BrowserWindow(', src.indexOf('function createSplashWindow')))
    const width = Number(opts.match(/width:\s*(\d+)/)?.[1])
    const height = Number(opts.match(/height:\s*(\d+)/)?.[1])
    expect({ width, height }).toEqual({ width: 1000, height: 600 })
  })
})
