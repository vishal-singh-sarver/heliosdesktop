import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, systemPreferences } from 'electron'
import { promises as fs, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { backendManager } from './backend-manager'

const isDev = !app.isPackaged

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
      sandbox: false
    }
  })

  // Skip 'ready-to-show' — it fires after HTML/CSS parse, but the renderer
  // still has an async backend-URL IPC, two dynamic imports, and React mount
  // ahead of it. Instead the initial screen (HomePage / ProjectScreen) sends
  // 'app:ready' from its own mount effect, so the splash holds until the
  // screen has actually painted.
  mainWindow.webContents.ipc.once('app:ready', () => {
    if (mainWindow.isDestroyed()) return
    mainWindow.show()
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
    show: true,
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
          position: relative;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .logo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
      </style>
    </head>
    <body>
      <img class="logo" src="${logoUrl}" />
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
 * On Windows, the jump list item re-launches the Helios executable. The new
 * process hits the single-instance lock, which triggers the 'second-instance'
 * handler in the running instance, which then calls createWindow().
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
          arguments: '',
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

// Acquire single-instance lock AFTER setUserDataPath so the lock file uses
// the correct userData directory. If another Helios is already running, this
// process quits immediately — but before it does, Electron notifies the
// running instance via the 'second-instance' event (which we handle below
// to open a new window instead of starting a second backend).
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  writeEarlyLog('Another Helios instance is already running — quitting this process')
  app.quit()
  process.exit(0)
}

// Only the first (and only) instance reaches this point.
// When another Helios is launched, Electron fires 'second-instance' here
// instead of spawning a new OS process.
app.on('second-instance', () => {
  writeEarlyLog('second-instance event received — opening a new window')
  createWindow()
})

// Debug-only: log every activate event so we can see what's triggering reopens
// after the user closes the window. Remove once the reopen-on-close cause is
// confirmed.
app.on('activate', () => {
  writeEarlyLog(
    `activate event fired (windows=${BrowserWindow.getAllWindows().length})`
  )
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
