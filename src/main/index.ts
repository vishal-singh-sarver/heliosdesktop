import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
  systemPreferences
} from 'electron'
import { promises as fs, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { backendManager } from './backend-manager'

const isDev = !app.isPackaged

/**
 * True when the app was launched by ChromeDriver for WebdriverIO e2e tests.
 * ChromeDriver injects its own --user-data-dir (a temp profile) and a remote
 * debugging flag into the Electron process. Under automation we must NOT
 * override userData or hold a single-instance lock: overriding userData
 * redirects Chromium's DevToolsActivePort file away from where ChromeDriver
 * looks (causing "session not created: DevToolsActivePort file doesn't exist"),
 * and the lock would make the test instance quit if a dev instance is running.
 */
function isUnderTestAutomation(): boolean {
  return process.argv.some(
    (arg) =>
      arg.startsWith('--user-data-dir') ||
      arg.startsWith('--remote-debugging-port') ||
      arg.startsWith('--remote-debugging-pipe') ||
      arg === '--enable-automation'
  )
}

/**
 * True when e2e windows should stay off the screen entirely.
 *
 * Electron has no real headless mode — Chromium's `--headless` is silently
 * ignored by the Electron binary (it still creates a native window), and
 * offscreen rendering (`webPreferences.offscreen`) forces a frameless window,
 * which would bypass the titleBarStyle/traffic-light setup this app depends on.
 * macOS has no Xvfb, so there is nothing to hide the window behind either.
 *
 * What DOES work: never calling show(). A never-shown BrowserWindow still runs
 * the renderer, lays out normally (non-zero getBoundingClientRect), and serves
 * WebDriver clicks, keys, and screenshots — it just never hits the screen.
 * Paired with app.dock.hide() this makes an e2e run fully invisible: no window,
 * no dock icon, no focus stealing.
 *
 * Opt out with HELIOS_E2E_HEADED=1 to watch a run while debugging.
 */
function isHeadlessTestRun(): boolean {
  return isUnderTestAutomation() && process.env['HELIOS_E2E_HEADED'] !== '1'
}

function getPlatformUserDataPath(homeDir: string): string {
  if (process.platform === 'win32') {
    return join(homeDir, 'AppData/Roaming/Helios')
  }

  if (process.platform === 'darwin') {
    return join(homeDir, 'Library/Application Support/Helios')
  }

  return join(homeDir, '.config/Helios')
}

/**
 * Early startup logger - writes to a stable location even if app crashes early.
 * Use this before backendManager is initialized.
 */
function getEarlyLogPath(): string {
  const homeDir = app.getPath('home')
  const logDir = join(getPlatformUserDataPath(homeDir), 'logs')
  return join(logDir, 'app-startup.log')
}

function writeEarlyLog(message: string): void {
  try {
    const logPath = getEarlyLogPath()
    const logDir = join(logPath, '..')

    // Ensure directory exists
    mkdirSync(logDir, { recursive: true })

    // Append timestamp and message
    const line = `${new Date().toISOString()} ${message}\n`
    writeFileSync(logPath, line, { flag: 'a' })
  } catch (error) {
    // If early logging fails, at least log to console
    console.error('[Early Log Error]', error)
  }
}

function createWindow(splash?: BrowserWindow): BrowserWindow {
  const isMac = process.platform === 'darwin'
  // macOS: titleBarStyle 'hidden' keeps the native traffic lights (so the OS
  // handles the fullscreen hover-reveal for free) while the rest of the title
  // bar is painted by the renderer. trafficLightPosition centers the lights
  // vertically in our 45px header row.
  // Linux/Windows: fully frameless — the renderer paints all window controls.
  const frameOptions = isMac
    ? {
        titleBarStyle: 'hidden' as const,
        trafficLightPosition: { x: 15, y: 16 }
      }
    : { frame: false }

  // Open at the minimum of the available work area or 1920x1080. workAreaSize
  // is in device-independent pixels (so it stays "fullscreen" on Retina
  // laptops) and already excludes the menu bar / dock / taskbar.
  const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize

  const mainWindow = new BrowserWindow({
    width: Math.min(workWidth, 1920),
    height: Math.min(workHeight, 1080),
    center: true,
    show: false,
    // Matches --color-bg in renderer/src/index.css. Without this the native
    // BrowserWindow flashes white between mainWindow.show() and the renderer's
    // first paint, even after the splash is destroyed.
    backgroundColor: '#121212',
    autoHideMenuBar: true,
    ...frameOptions,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Under e2e ONLY. isHeadlessTestRun() deliberately never calls show(), so
      // Chromium treats the window as hidden and - with backgroundThrottling at
      // its default of true - throttles the renderer's animations and timers and
      // flips the Page Visibility API to hidden. A test run wants none of that,
      // so we opt out: general hygiene for a never-shown window under test.
      //
      // CORRECTION (2026-08-03, measured on a real Windows box): this flag was
      // originally added believing it caused
      //   SEVERE: Timed out receiving message from renderer: 10.000
      // It does not, and neither do the switches below. That line is emitted by
      // attachFailureScreenshot (e2e/config/reporting.ts) taking a screenshot of
      // the hidden window AFTER a test has already failed - see the evidence
      // block there. The flag is kept because not throttling a test renderer is
      // right on its own merits, NOT because it fixes that stall; do not cite it
      // as the fix.
      //
      // Left at the default in normal use: a real user's hidden window SHOULD
      // throttle to save battery. This only opts out when the window is hidden
      // for the artificial reason that we never show it.
      ...(isHeadlessTestRun() ? { backgroundThrottling: false } : {})
    }
  })

  // Skip 'ready-to-show' — it fires after HTML/CSS parse, but the renderer
  // still has an async backend-URL IPC, two dynamic imports, and React mount
  // ahead of it. Instead the initial screen (HomePage / ProjectScreen) sends
  // 'app:ready' from its own mount effect, so the splash holds until the
  // screen has actually painted.
  mainWindow.webContents.ipc.once('app:ready', () => {
    if (mainWindow.isDestroyed()) return
    // Headless e2e: skip show() so the window never reaches the screen. The
    // renderer is already mounted and painted at this point, so every WebDriver
    // interaction still works — see isHeadlessTestRun().
    if (!isHeadlessTestRun()) mainWindow.show()
    // Short hold covers the macOS show() reveal animation. hide() before
    // destroy() skips the splash's own fade-out, which otherwise reads as a
    // white/flicker frame during the handoff.
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) {
        splash.hide()
        splash.destroy()
      }
    })
  })

  // Safety net: if the renderer crashes before sending 'app:ready', show the
  // window anyway after a generous timeout so the user doesn't stare at the
  // splash forever. The splash stays up — error dialogs in the renderer (if
  // any) will surface.
  const fallbackTimer = setTimeout(() => {
    if (isHeadlessTestRun()) return
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }, 10_000)
  mainWindow.once('closed', () => clearTimeout(fallbackTimer))

  // F11 toggles fullscreen. enter/leave-full-screen fire AFTER the OS animation
  // completes, so we also notify the renderer up front to keep the custom
  // title bar collapse in sync with the transition start.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      const next = !mainWindow.isFullScreen()
      mainWindow.webContents.send('window:fullScreenChange', next)
      mainWindow.setFullScreen(next)
      event.preventDefault()
    }
  })

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('window:fullScreenChange', true)
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('window:fullScreenChange', false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/**
 * Create a minimal splash/loading window shown while backend is starting.
 * This provides visual feedback that the app is initializing.
 */
function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 1000,
    height: 600,
    // Headless e2e: the splash is the FIRST window created, so leaving it
    // visible would flash on screen (and bounce the dock) before the main
    // window is even built.
    show: !isHeadlessTestRun(),
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: false,
      sandbox: true
    }
  })

  const logoPath = app.isPackaged
    ? join(process.resourcesPath, 'Helios_splash.png')
    : resolve(__dirname, '../../resources/Helios_splash.png')
  const logoUrl = `file://${logoPath.replace(/\\/g, '/')}`

  const version = app.getVersion()
  const year = 2026

  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #121212;
        }
        body {
          display: flex;
          flex-direction: column;
          background: #3d3d3d;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-ser
        }
        .logo {
          width: 100%;
          min-height: 0;
          object-fit: cover;
          object-position: center top;
          display: block;
        }
          .footer {
          flex: 0 0 auto;
          /* Pull up 1px so no hairline of the window background shows between
             the image and the footer. */
          margin-top: -1px;
          padding: 22px 20px;
          background: #3d3d3d;
          color: #c8c8c8;
          font-size: 15px;
          line-height: 1;
        }
      </style>
    </head>
    <body>
      <img class="logo" src="${logoUrl}" />
      <div class="footer">Version ${version} &copy; ${year} Helios. All rights reserved</div>
    </body>
    </html>
  `

  const tmpHtml = join(tmpdir(), 'helios-splash.html')
  writeFileSync(tmpHtml, splashHtml)
  splash.loadFile(tmpHtml)
  return splash
}

/**
 * Install an application menu so users can open new windows via Cmd+N / Ctrl+N.
 * autoHideMenuBar on main windows keeps the menu visually hidden on Linux/Windows
 * while still making accelerators work. On macOS the menu lives at the top of
 * the screen as usual.
 */
function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => createWindow()
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Configure platform-specific shortcuts shown in the OS shell:
 * - macOS: dock icon right-click menu (app.dock.setMenu)
 * - Windows: taskbar jump list (app.setUserTasks)
 * - Linux: handled via .desktop file Actions (see linux-installer/helios.desktop)
 *
 * On Windows, the jump list item re-launches the Helios executable with
 * --new-window. The new process hits the single-instance lock, which triggers
 * the 'second-instance' handler in the running instance; that flag is what
 * tells the handler to open a window instead of focusing the existing one.
 * The Linux .desktop NewWindow action passes the same flag.
 */
function configurePlatformShortcuts(): void {
  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: 'New Window',
        click: () => createWindow()
      }
    ])
    app.dock?.setMenu(dockMenu)
    writeEarlyLog('macOS dock menu configured with "New Window" item')
    return
  }

  if (process.platform === 'win32') {
    try {
      app.setUserTasks([
        {
          program: process.execPath,
          arguments: '--new-window',
          iconPath: process.execPath,
          iconIndex: 0,
          title: 'New Window',
          description: 'Open a new Helios window'
        }
      ])
      writeEarlyLog('Windows jump list configured with "New Window" task')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      writeEarlyLog(`Failed to configure Windows jump list: ${msg}`)
    }
  }
}

/**
 * Set userData path using Electron APIs (not environment variables).
 * This ensures the path is correct even when launched from Finder in packaged mode.
 * Must be called BEFORE app.whenReady() to prevent Electron from creating
 * platform-specific default folders.
 */
function setUserDataPath(): void {
  if (isUnderTestAutomation()) {
    // Respect the --user-data-dir ChromeDriver injected; overriding it breaks
    // the WebDriver session (DevToolsActivePort file written to the wrong dir).
    writeEarlyLog('Test automation detected — skipping userData override')
    return
  }

  const homeDir = app.getPath('home')

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.navyug.helios')
  }

  const userDataPath = getPlatformUserDataPath(homeDir)
  app.setPath('userData', userDataPath)
  writeEarlyLog(`${process.platform}: userData=${userDataPath}`)
}

// Initialize paths and early logging BEFORE app is ready
writeEarlyLog('='.repeat(80))
writeEarlyLog(`App startup initiated [packaged=${app.isPackaged}, platform=${process.platform}]`)
setUserDataPath()

// Headless e2e: stop Chromium throttling the renderer of a window we never
// show. MUST be appended before app.whenReady().
//
// These switches are process-global (they apply to every renderer, not one
// window), which is fine here because the whole process is a test run. They are
// the standard set for CI test runners - karma sets them for the same reason.
// Guarded by isHeadlessTestRun() so shipped behaviour is untouched: a real
// user's backgrounded window SHOULD throttle to save battery.
//
// CORRECTION (2026-08-03): these were added to chase
//   SEVERE: Timed out receiving message from renderer: 10.000
// on the windows runner, reasoning from electron#31016 that
// backgroundThrottling:false misses HIDDEN windows on Windows. They had no
// effect, and we now know why: that line never came from throttling at all. It
// is attachFailureScreenshot (e2e/config/reporting.ts) screenshotting the hidden
// window after a test has ALREADY failed - proven by an idle-vs-loaded A/B on a
// real Windows box, where the same failing test produced 0 stall lines idle and
// the exact 2-line CI signature under CPU contention.
//
// The apparent "ubuntu/macOS went to 0 while windows stayed at 2" signal was an
// artifact of counting: stall lines only ever equalled 2 x failed tests, so a
// run with no failures logged none regardless of these switches. Kept as test
// hygiene; they are NOT the fix for that stall.
if (isHeadlessTestRun()) {
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  writeEarlyLog('Headless e2e: renderer backgrounding/throttling switches applied')
}

// Headless e2e: drop to the macOS "accessory" activation policy BEFORE the app
// finishes launching, so no dock icon ever appears (not even a flash) and the
// test app cannot steal focus from whatever you are doing. Must run at module
// scope — calling it once a window exists still flashes the icon.
if (process.platform === 'darwin' && isHeadlessTestRun()) {
  app.dock?.hide()
  writeEarlyLog('Headless e2e run — dock icon hidden')
}

// Acquire single-instance lock AFTER setUserDataPath so the lock file uses
// the correct userData directory. If another Helios is already running, this
// process quits immediately — but before it does, Electron notifies the
// running instance via the 'second-instance' event (which we handle below
// to open a new window instead of starting a second backend).
// Skip the single-instance lock under test automation so the e2e instance is
// never killed by (or killing) a separately-running dev instance.
const gotSingleInstanceLock = isUnderTestAutomation() || app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  writeEarlyLog('Another Helios instance is already running — quitting this process')
  app.quit()
  process.exit(0)
}

// Only the first (and only) instance reaches this point.
// When another Helios is launched, Electron fires 'second-instance' here
// instead of spawning a new OS process.
app.on('second-instance', (_event, argv) => {
  // Only an explicit "New Window" request opens another window. A plain launch
  // (clicking the pinned taskbar/dock icon) must focus what's already open —
  // otherwise every click stacks up one more window.
  if (argv.some((arg) => arg.includes('--new-window'))) {
    writeEarlyLog('second-instance: --new-window requested — opening a new window')
    createWindow()
    return
  }

  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) {
    writeEarlyLog('second-instance: no windows open — creating one')
    createWindow()
    return
  }

  // windows[0] may be the splash if the user clicks again mid-startup;
  // focusing it is the right behavior there too.
  writeEarlyLog(`second-instance: focusing existing window (windows=${windows.length})`)
  const win = windows[0]
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

// Debug-only: log every activate event so we can see what's triggering reopens
// after the user closes the window. Remove once the reopen-on-close cause is
// confirmed.
app.on('activate', () => {
  writeEarlyLog(`activate event fired (windows=${BrowserWindow.getAllWindows().length})`)
})

// --- Window control IPC handlers ---
// Frameless windows have no native controls, so the renderer paints its own
// and asks the main process to perform the action.

ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.handle('window:toggleMaximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  if (win.isMaximized()) {
    win.unmaximize()
    return false
  }
  win.maximize()
  return true
})

// macOS only: the native title bar handles double-click-to-zoom, but only
// within its standard ~28px height — our custom title bar row is taller, so a
// double-click on the lower part never reaches the OS gesture. The renderer
// catches those and calls this, which mirrors the native behavior by honoring
// the user's "double-click a window's title bar to" System Settings choice.
ipcMain.handle('window:titleBarDoubleClick', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const action = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
  if (action === 'Minimize') {
    win.minimize()
  } else if (action === 'None') {
    // User disabled the double-click gesture — do nothing, matching the OS.
  } else {
    // Default ('Maximize') — zoom toggles the maximized state.
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  }
})

ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('window:isMaximized', (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
})

ipcMain.handle('window:isFullScreen', (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
})

ipcMain.handle('window:getPlatform', () => process.platform)

// --- File dialog IPC handlers ---

ipcMain.handle('dialog:openFile', async (event, filters: Electron.FileFilter[]) => {
  // Attach the dialog to the calling window so it becomes a modal sheet on
  // macOS (and stays on top on other platforms). Without this the dialog
  // floats free — the user can click back to the app while it's still open
  // behind the scenes, leaving the renderer's "Opening…" state stuck.
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
    : await dialog.showOpenDialog({ properties: ['openFile'], filters })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(
  'dialog:saveFile',
  async (event, filters: Electron.FileFilter[], defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showSaveDialog(win, { filters, defaultPath })
      : await dialog.showSaveDialog({ filters, defaultPath })
    return result.canceled ? null : result.filePath
  }
)

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  return fs.readFile(filePath, 'utf-8')
})

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, 'utf-8')
})

// --- Backend session IPC handlers ---

ipcMain.handle('backend:getStatus', async () => {
  return backendManager.getBackendStatus()
})

ipcMain.handle('backend:getUrl', async () => {
  const status = backendManager.getBackendStatus()
  return status.port ? `http://127.0.0.1:${status.port}` : null
})

ipcMain.handle('backend:start', async () => {
  return backendManager.startBackend()
})

ipcMain.handle('backend:stop', async () => {
  return backendManager.stopBackend()
})

ipcMain.handle('backend:getLogFile', async () => {
  const runtimePaths = {
    logFile: join(app.getPath('userData'), 'logs', 'backend.log'),
    userData: app.getPath('userData'),
    home: app.getPath('home')
  }
  return runtimePaths
})

// --- App lifecycle ---

const SKIP_BACKEND = process.env.HELIOS_SKIP_BACKEND === '1'

app.whenReady().then(async () => {
  writeEarlyLog(`App ready - showing splash and waiting for backend...`)

  // Show splash screen while backend is starting
  const splash = createSplashWindow()

  if (SKIP_BACKEND) {
    writeEarlyLog('HELIOS_SKIP_BACKEND=1 set - skipping backend startup')
    console.log('HELIOS_SKIP_BACKEND=1 set - skipping backend startup')
    buildAppMenu()
    configurePlatformShortcuts()
    createWindow(splash)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(createSplashWindow())
      }
    })
    return
  }

  try {
    // CRITICAL: Wait for backend to be ready before showing the main window.
    // This prevents the UI appearing "ready" while the backend is still starting or failing.
    const status = await backendManager.startBackend()

    if (!status.running) {
      const errorMsg = status.error || 'unknown error'
      writeEarlyLog(`FAILED to start backend: ${errorMsg}`)
      writeEarlyLog(`Backend log file: ${status.logFile || 'not available'}`)
      console.error(`Failed to start backend: ${errorMsg}`)

      // Close splash screen
      splash?.destroy()

      // Show error dialog - do NOT create main window
      // This ensures the user sees the error immediately
      const errorDetails = `Failed to start the backend server:\n\n${errorMsg}\n\nCheck logs at: ${status.logFile}`

      if (app.isPackaged) {
        // In packaged mode, user won't see console - show dialog
        await dialog.showErrorBox('Backend Error', errorDetails)
      } else {
        console.error(errorDetails)
      }

      // Exit gracefully after showing error
      app.quit()
      return
    }

    // Keep the splash alive until the main window is ready.
    // This avoids a zero-window gap that would trigger window-all-closed on Linux/Windows.
    writeEarlyLog(`Backend started successfully [PID=${status.pid}, port=${status.port}]`)
    console.log(`Backend started (PID: ${status.pid}, Port: ${status.port})`)

    buildAppMenu()
    configurePlatformShortcuts()

    createWindow(splash)
  } catch (error) {
    splash?.destroy()
    const message = error instanceof Error ? error.message : String(error)
    writeEarlyLog(`EXCEPTION during backend startup: ${message}`)
    console.error('Exception during backend startup:', error)

    await dialog.showErrorBox('Startup Error', `An unexpected error occurred:\n\n${message}`)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(createSplashWindow())
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  if (SKIP_BACKEND) {
    writeEarlyLog('App before-quit: backend was skipped, nothing to clean up')
    return
  }
  writeEarlyLog('App before-quit: stopping backend...')
  await backendManager.cleanup()
  writeEarlyLog('App shutdown complete')
})

// Electron does NOT await the async 'before-quit' handler above, so it can be
// cut off mid-cleanup. These synchronous handlers are the guaranteed reaper:
// they force-kill the backend tree before the process exits, so it can't be
// orphaned (which on Windows locks files and blocks reinstall/repackage).
app.on('will-quit', () => {
  if (SKIP_BACKEND) return
  backendManager.killSync()
})

process.on('exit', () => {
  if (SKIP_BACKEND) return
  backendManager.killSync()
})
