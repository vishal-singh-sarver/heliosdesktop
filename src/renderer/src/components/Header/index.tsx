import editIcon from '@renderer/assets/edit.svg'
import heliosLogo from '@renderer/assets/Helios_logo.svg'
import scenarioAddIcon from '@renderer/assets/scenerio_add.svg'
import WindowControls from '@renderer/components/WindowControls'
import React from 'react'

interface HeaderProps {
  children: React.ReactNode
  onLogoClick?: () => void
  title?: string
}

function useIsMac(): boolean {
  const [isMac, setIsMac] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    window.api.getPlatform().then((p) => {
      if (!cancelled) setIsMac(p === 'darwin')
    })
    return () => {
      cancelled = true
    }
  }, [])
  return isMac
}

function useIsFullScreen(): boolean {
  const [isFullScreen, setIsFullScreen] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    window.api.windowIsFullScreen().then((v) => {
      if (!cancelled) setIsFullScreen(v)
    })
    const unsubscribe = window.api.onFullScreenChange((v) => setIsFullScreen(v))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])
  return isFullScreen
}

function Header({ children, onLogoClick, title }: HeaderProps): React.JSX.Element {
  const isMac = useIsMac()
  const isFullScreen = useIsFullScreen()
  const logo = <img src={heliosLogo} alt="Helios logo" className="h-5 w-auto" />
  const logoButton = onLogoClick ? (
    <button
      type="button"
      onClick={onLogoClick}
      aria-label="Go to home"
      className="app-no-drag flex items-center rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
    >
      {logo}
    </button>
  ) : (
    logo
  )

  // On Windows/Linux, the entire 45px title bar row disappears in fullscreen
  // (the OS has no hover-reveal there, so leaving it would be wasted space).
  // On macOS the row stays — native traffic lights auto-hide via the OS and
  // reveal on hover, matching every other Mac app.
  const showTitleBar = isMac || !isFullScreen

  return (
    <header data-testid="header" className="border-b border-app-border">
      {showTitleBar && (
      <div
        className={`app-drag relative flex h-[45px] items-center gap-3 border-b border-app-border px-4 ${
          isMac ? 'pl-[80px]' : ''
        }`}
      >
        {/* macOS handles double-click-to-zoom natively, but only inside the
            standard ~28px title bar height — the lower part of this 45px row
            sits below it. A drag region swallows DOM events, so we can't catch
            the double-click on the row itself; this .app-no-drag strip across
            the bottom does receive it and toggles maximize to match. It starts
            below the native zone so the two never both fire. */}
        {isMac && (
          <div
            aria-hidden="true"
            onDoubleClick={() => window.api.windowTitleBarDoubleClick()}
            className="app-no-drag absolute inset-x-0 bottom-0 h-[17px]"
          />
        )}
        {logoButton}
        {title && (
          <div className="flex items-center gap-3">
            <div className="relative pl-3">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1 left-0 text-lg leading-none text-white"
              >
                *
              </span>
              <span className="truncate text-md font-normal leading-[15px] text-[#D3D3D3]">
                {title}
              </span>
            </div>
            <span aria-hidden="true" className="h-5 w-px bg-[#424242]" />
            <div className="app-no-drag flex h-[25px] items-center gap-1 rounded-[4px] border border-[#424242] bg-[#FFFFFF] px-2">
              <span className="text-xs font-normal leading-none text-black">Scenario 1</span>
              <button
                type="button"
                aria-label="Rename scenario"
                className="flex h-4 w-4 items-center justify-center"
              >
                <img src={editIcon} alt="" className="block h-4 w-4 brightness-0" />
              </button>
              <button
                type="button"
                aria-label="Close scenario"
                className="flex h-4 w-4 items-center justify-center text-base leading-none text-black"
              >
                ×
              </button>
            </div>
            <button
              type="button"
              aria-label="Add scenario"
              className="app-no-drag flex h-[25px] w-[35px] items-center justify-center"
            >
              <img src={scenarioAddIcon} alt="" className="block h-[25px] w-[35px]" />
            </button>
          </div>
        )}
        <div className="flex-1" />
        {!isMac && !isFullScreen && <WindowControls side="right" />}
      </div>
      )}

      <div className="flex h-[50px] items-center justify-between bg-[#202020] px-5 py-[10px]">
        {children}
      </div>
    </header>
  )
}

export default Header
