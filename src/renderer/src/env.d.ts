/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string
  /**
   * Geometry wire format this build defaults to: 'v2' for the GPU-buffer path,
   * anything else (or unset) for v1. Runtime storage still overrides it — see
   * containers/3DWindow/store/featureFlags.ts.
   */
  readonly VITE_GEOMETRY_FORMAT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

import type { FileFilter, BackendStatus } from '../../preload/index'

declare global {
  interface Window {
    api: {
      openFile: (filters: FileFilter[]) => Promise<string | null>
      saveFile: (filters: FileFilter[], defaultPath?: string) => Promise<string | null>
      readFile: (filePath: string) => Promise<string>
      writeFile: (filePath: string, content: string) => Promise<void>
      getBackendStatus: () => Promise<BackendStatus>
      getBackendUrl: () => Promise<string | null>
      startBackend: () => Promise<{ ok: boolean }>
      stopBackend: () => Promise<{ ok: boolean }>
      windowMinimize: () => Promise<void>
      windowToggleMaximize: () => Promise<boolean>
      windowTitleBarDoubleClick: () => Promise<void>
      windowClose: () => Promise<void>
      windowIsMaximized: () => Promise<boolean>
      windowIsFullScreen: () => Promise<boolean>
      onFullScreenChange: (cb: (isFullScreen: boolean) => void) => () => void
      getPlatform: () => Promise<NodeJS.Platform>
      appReady: () => void
    }
    __APP_BASE_URL__?: string
  }
}
