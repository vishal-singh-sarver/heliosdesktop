import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface BackendStatus {
  running: boolean
  pid: number | null
}

// App-specific API exposed to the renderer
const api = {
  // File dialogs
  openFile: (filters: FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),

  saveFile: (filters: FileFilter[], defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', filters, defaultPath),

  // File system
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath),

  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  // Backend session
  getBackendStatus: (): Promise<BackendStatus> => ipcRenderer.invoke('backend:getStatus'),

  // Resolves to e.g. "http://127.0.0.1:8009" — the actual port the backend
  // bound to this run. Renderer must call this before any HTTP/SSE setup.
  getBackendUrl: (): Promise<string | null> => ipcRenderer.invoke('backend:getUrl'),

  startBackend: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('backend:start'),

  stopBackend: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('backend:stop'),

  // Window controls — the renderer paints its own title bar (frameless window).
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggleMaximize'),
  windowTitleBarDoubleClick: (): Promise<void> => ipcRenderer.invoke('window:titleBarDoubleClick'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  windowIsFullScreen: (): Promise<boolean> => ipcRenderer.invoke('window:isFullScreen'),
  onFullScreenChange: (cb: (isFullScreen: boolean) => void): (() => void) => {
    const listener = (_: unknown, isFullScreen: boolean): void => cb(isFullScreen)
    ipcRenderer.on('window:fullScreenChange', listener)
    return () => ipcRenderer.removeListener('window:fullScreenChange', listener)
  },
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('window:getPlatform'),

  // Renderer fires this once React has mounted. Main process holds the splash
  // and keeps the main window hidden until this arrives — see src/main/index.ts.
  appReady: (): void => ipcRenderer.send('app:ready')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (fallback for non-isolated context)
  window.electron = electronAPI
  // This file is type-checked under BOTH tsconfigs, which disagree here: the
  // node one has no DOM lib, so `window` is unknown and a suppression is
  // required; the web one pulls this file in via renderer/src/env.d.ts, which
  // declares Window.api, so there is no error to suppress and @ts-expect-error
  // would itself be flagged as unused. @ts-ignore is the only form that is
  // correct in both.
  // @ts-ignore
  window.api = api
}
