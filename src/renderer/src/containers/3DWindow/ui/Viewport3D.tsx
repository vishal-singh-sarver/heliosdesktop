import React, { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import type { PrimitiveInfo } from '../models/types'
import messages from '../messages'
import { selectMeshReady, selectSceneLoad, selectSceneObjects } from '../store/selectors'
import { getAllCachedPrimitives } from '../store/sceneCache'
import type { LightingMode } from './materials'
import type { LightingSettings } from './SceneLighting'
import { defaultLightingSettings } from './SceneLighting'
import LightingSettingsDialog from './LightingSettingsDialog'
import SceneCanvas from './SceneCanvas'
import SceneContent from './SceneContent'
import SceneSelector from './SceneSelector'

// ── Inline SVG icons (no external dependency) ────────────────────────────────

function CircleIcon(): React.JSX.Element {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

function SunIcon(): React.JSX.Element {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function SunDimIcon(): React.JSX.Element {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1M12 20v1M5.6 5.6l.7.7M17.7 17.7l.7.7M3 12h1M20 12h1M5.6 18.4l.7-.7M17.7 6.3l.7-.7" />
    </svg>
  )
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7h-9M14 17H5" />
      <circle cx="14" cy="7" r="3" />
      <circle cx="8" cy="17" r="3" />
    </svg>
  )
}

function BarChartIcon(): React.JSX.Element {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 17V9M13 17V5M8 17v-3" />
    </svg>
  )
}

// ── Stats helpers ────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

interface SceneStats {
  objects: number
  totalPrimitives: number
  totalVertices: number
  triangles: number
  quads: number
}

function computeStats(primitives: PrimitiveInfo[], objectCount: number): SceneStats {
  let totalVertices = 0
  let triangles = 0
  let quads = 0
  for (const p of primitives) {
    const v = p.vertices.length
    totalVertices += v
    if (v === 3) triangles++
    else if (v === 4) {
      quads++
      triangles += 2
    } else if (v > 4) triangles += v - 2
  }
  return { objects: objectCount, totalPrimitives: primitives.length, totalVertices, triangles, quads }
}

// ── Lighting mode config ─────────────────────────────────────────────────────

const LIGHTING_MODES: Array<{ mode: LightingMode; Icon: () => React.JSX.Element; title: string }> = [
  { mode: 'flat', Icon: CircleIcon, title: 'Flat shading (no lighting)' },
  { mode: 'phong', Icon: SunIcon, title: 'Phong lighting' },
  { mode: 'phong-shadows', Icon: SunDimIcon, title: 'Phong lighting + shadows' }
]

// ── Component ────────────────────────────────────────────────────────────────

export function Viewport3D(): React.JSX.Element {
  const sceneLoad = useSelector(selectSceneLoad)
  const meshReady = useSelector(selectMeshReady)
  const objects = useSelector(selectSceneObjects)

  const [lightingSettings, setLightingSettings] = useState<LightingSettings>(defaultLightingSettings)
  const [showLightingDialog, setShowLightingDialog] = useState(false)
  const [showStats, setShowStats] = useState(false)

  const isFetching = sceneLoad.loading || sceneLoad.objectLoading || sceneLoad.selectionLoading
  const showLoader = isFetching || !meshReady

  const updateLighting = (patch: Partial<LightingSettings>): void => {
    setLightingSettings((prev) => ({ ...prev, ...patch }))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when scene changes
  const stats = useMemo<SceneStats | null>(() => {
    if (!showStats) return null
    return computeStats(getAllCachedPrimitives(), objects.length)
  }, [showStats, objects.length, sceneLoad])

  return (
    <div className="relative h-full w-full">
      <SceneCanvas>
        <SceneContent lightingSettings={lightingSettings} />
      </SceneCanvas>

      {/* Scene selector dropdown — top-left */}
      {objects.length > 0 && !showLoader && (
        <div className="absolute left-3 top-3 z-10">
          <SceneSelector />
        </div>
      )}

      {/* Top-right toolbar: lighting toggles + settings + stats */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        {/* Lighting mode toggles */}
        <div className="flex overflow-hidden rounded-md border border-neutral-700">
          {LIGHTING_MODES.map(({ mode, Icon, title }) => (
            <button
              key={mode}
              onClick={() => updateLighting({ mode })}
              className={`p-1.5 transition-colors ${
                lightingSettings.mode === mode
                  ? 'bg-sky-400/20 text-sky-400'
                  : 'bg-neutral-800/60 text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
              }`}
              title={title}
            >
              <Icon />
            </button>
          ))}
        </div>

        {/* Lighting settings */}
        <button
          onClick={() => setShowLightingDialog(true)}
          className="rounded border border-neutral-700 bg-neutral-800/60 p-1.5 text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300"
          title="Lighting settings"
        >
          <SettingsIcon />
        </button>

        {/* Stats toggle */}
        <button
          onClick={() => setShowStats((v) => !v)}
          className={`rounded p-1.5 transition-colors ${
            showStats
              ? 'border border-sky-400/30 bg-sky-400/20 text-sky-400'
              : 'border border-neutral-700 bg-neutral-800/60 text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
          }`}
          title="Toggle scene statistics"
        >
          <BarChartIcon />
        </button>
      </div>

      {/* Scene statistics overlay */}
      {showStats && stats && (
        <div className="absolute left-3 top-10 z-10 select-text rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-neutral-400 backdrop-blur-sm">
          <div className="flex gap-6">
            <div className="flex flex-col">
              <span>
                Objects: <span className="text-neutral-200">{stats.objects}</span>
              </span>
              <span>
                Primitives: <span className="text-neutral-200">{formatNumber(stats.totalPrimitives)}</span>
              </span>
              <span>
                Triangles: <span className="text-neutral-200">{formatNumber(stats.triangles)}</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span>
                Vertices: <span className="text-neutral-200">{formatNumber(stats.totalVertices)}</span>
              </span>
              {stats.quads > 0 && (
                <span>
                  Quads: <span className="text-neutral-200">{formatNumber(stats.quads)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {showLoader && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/60">
          <div className="rounded bg-neutral-900/90 px-4 py-2 text-sm text-neutral-200">
            {sceneLoad.loading
              ? messages.viewport.sceneLoading
              : sceneLoad.selectionLoading
                ? messages.viewport.selectionLoading
                : sceneLoad.objectLoading
                  ? messages.viewport.objectLoading
                  : messages.viewport.sceneLoading}
          </div>
        </div>
      )}

      {/* Error display */}
      {sceneLoad.error && (
        <div className="absolute left-3 top-12 z-10 rounded bg-red-900/80 px-3 py-1.5 text-sm text-red-100">
          {sceneLoad.error.message}
        </div>
      )}

      {/* Lighting settings dialog */}
      {showLightingDialog && (
        <LightingSettingsDialog
          settings={lightingSettings}
          onChange={updateLighting}
          onClose={() => setShowLightingDialog(false)}
        />
      )}
    </div>
  )
}

export default Viewport3D
