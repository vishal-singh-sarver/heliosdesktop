import type { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import * as THREE from 'three'
import type { PrimitiveInfo } from '../models/types'
import messages from '../messages'
import {
  selectGeometryVersion,
  selectMeshReady,
  selectSceneLoad,
  selectSceneObjects,
  selectSelectedObjectId
} from '../store/selectors'
import { getAllCachedPrimitives } from '../store/sceneCache'
import type { LightingMode } from './materials'
import type { LightingSettings } from './SceneLighting'
import { defaultLightingSettings } from './SceneLighting'
import LightingSettingsDialog from './LightingSettingsDialog'
import SceneCanvas from './SceneCanvas'
import SceneContent from './SceneContent'
import { gridStamp } from './SceneHelpers'
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
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function SunDimIcon(): React.JSX.Element {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1M12 20v1M5.6 5.6l.7.7M17.7 17.7l.7.7M3 12h1M20 12h1M5.6 18.4l.7-.7M17.7 6.3l.7-.7" />
    </svg>
  )
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 7h-9M14 17H5" />
      <circle cx="14" cy="7" r="3" />
      <circle cx="8" cy="17" r="3" />
    </svg>
  )
}

function BarChartIcon(): React.JSX.Element {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9M13 17V5M8 17v-3" />
    </svg>
  )
}

// ── Left toolbar icons (compact, stroke-only, matching design spec) ─────────
// Each icon is a 20×20 viewBox with thin 1.5px strokes — no embedded
// backgrounds so the toolbar container controls the look.

const ICON_CLASS = 'h-5 w-5'

function LayersIcon(): React.JSX.Element {
  return (
    <svg className={ICON_CLASS} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.5l7 3.5-7 3.5-7-3.5z" />
      <path d="M3 10l7 3.5L17 10" />
      <path d="M3 13.5l7 3.5 7-3.5" />
    </svg>
  )
}

function ZoomInIcon(): React.JSX.Element {
  return (
    <svg className={ICON_CLASS} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5l4.5 4.5" />
      <path d="M8.5 6v5M6 8.5h5" />
    </svg>
  )
}

function ZoomOutIcon(): React.JSX.Element {
  return (
    <svg className={ICON_CLASS} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5l4.5 4.5" />
      <path d="M6 8.5h5" />
    </svg>
  )
}

function ResetViewIcon(): React.JSX.Element {
  return (
    <svg className={ICON_CLASS} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6V2h4M14 2h4v4M18 14v4h-4M6 18H2v-4" />
    </svg>
  )
}

function GrabIcon(): React.JSX.Element {
  return (
    <svg className={ICON_CLASS} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5.5a1.5 1.5 0 013 0V13a5 5 0 01-5 5H9a5 5 0 01-4-2l-2.5-3.3a1.5 1.5 0 012.4-1.7L7 13.5V4.5a1.5 1.5 0 013 0V9" />
      <path d="M10 9V3.5a1.5 1.5 0 013 0V9" />
    </svg>
  )
}

function CameraIcon(): React.JSX.Element {
  return (
    <svg className={ICON_CLASS} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 012-2h2l1-2h4l1 2h2a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <circle cx="10" cy="10.5" r="2.5" />
    </svg>
  )
}

function HierarchyIcon(): React.JSX.Element {
  return (
    <svg className={ICON_CLASS} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="4" r="2" />
      <circle cx="5" cy="16" r="2" />
      <circle cx="15" cy="16" r="2" />
      <path d="M10 6v4M10 10l-5 4M10 10l5 4" />
    </svg>
  )
}

// ── R3F ↔ DOM bridge for toolbar zoom ───────────────────────────────────────

/** Actions the toolbar can trigger on the R3F camera. */
interface ViewportActions {
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
}

const DOLLY_STEP = 0.15
const TRANSITION_MS = 350

/** Default camera pose when no geometry is loaded. */
const DEFAULT_POS: [number, number, number] = [10, 10, 8]
const DEFAULT_TARGET: [number, number, number] = [0, 0, 0]

/**
 * Invisible R3F component that populates a ref with camera-control actions.
 * Rendered inside the Canvas so it can access useThree; the ref is read by
 * the DOM-side toolbar in Viewport3D.
 */
function ControlsBridge({
  actionsRef
}: {
  actionsRef: React.MutableRefObject<ViewportActions | null>
}): null {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls) as CameraControls | null
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    if (!controls) return

    let transitionTimer = 0
    let transitionRunning = false
    let deadline = 0

    function driveTransition(): void {
      deadline = performance.now() + TRANSITION_MS
      if (transitionRunning) return
      transitionRunning = true
      function tick(): void {
        if (!transitionRunning) return
        controls?.update(1 / 60)
        invalidate()
        if (performance.now() < deadline) {
          transitionTimer = requestAnimationFrame(tick)
        } else {
          transitionRunning = false
        }
      }
      transitionTimer = requestAnimationFrame(tick)
    }

    actionsRef.current = {
      zoomIn: () => {
        controls.dolly(controls.distance * DOLLY_STEP, true)
        driveTransition()
      },
      zoomOut: () => {
        controls.dolly(-controls.distance * DOLLY_STEP, true)
        driveTransition()
      },
      resetView: () => {
        // Restore default camera planes and control limits so the scene
        // renders at the correct scale for the origin.
        const perspCam = camera as THREE.PerspectiveCamera
        perspCam.near = 0.1
        perspCam.far = 1_000_000
        perspCam.updateProjectionMatrix()

        controls.minDistance = 0.5
        controls.maxDistance = Infinity

        // Instant snap (smooth=false) to avoid vibration — a smooth
        // transition would traverse positions where the new near/far
        // planes clip the far-away geometry, causing flicker.
        controls.setLookAt(...DEFAULT_POS, ...DEFAULT_TARGET, false)
        controls.update(1 / 60)
        invalidate()
      }
    }

    return () => {
      transitionRunning = false
      cancelAnimationFrame(transitionTimer)
      actionsRef.current = null
    }
  }, [controls, invalidate, actionsRef, camera])

  return null
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
  return {
    objects: objectCount,
    totalPrimitives: primitives.length,
    totalVertices,
    triangles,
    quads
  }
}

// ── Lighting mode config ─────────────────────────────────────────────────────

const LIGHTING_MODES: Array<{ mode: LightingMode; Icon: () => React.JSX.Element; title: string }> =
  [
    { mode: 'flat', Icon: CircleIcon, title: 'Flat shading (no lighting)' },
    { mode: 'phong', Icon: SunIcon, title: 'Phong lighting' },
    { mode: 'phong-shadows', Icon: SunDimIcon, title: 'Phong lighting + shadows' }
  ]

// ── Component ────────────────────────────────────────────────────────────────

export function Viewport3D(): React.JSX.Element {
  const sceneLoad = useSelector(selectSceneLoad)
  const meshReady = useSelector(selectMeshReady)
  const objects = useSelector(selectSceneObjects)
  const geometryVersion = useSelector(selectGeometryVersion)
  const selectedObjectId = useSelector(selectSelectedObjectId)

  const [lightingSettings, setLightingSettings] =
    useState<LightingSettings>(defaultLightingSettings)
  const [showLightingDialog, setShowLightingDialog] = useState(false)
  const [showStats, setShowStats] = useState(false)

  // Stamped on reset so the grid falls back to default params, and stays there
  // until geometry or selection moves on. Captured here in the click handler
  // rather than compared during render — see SceneHelpers.gridStamp.
  const [gridResetAt, setGridResetAt] = useState<string | null>(null)

  const actionsRef = useRef<ViewportActions | null>(null)
  const handleZoomIn = useCallback(() => actionsRef.current?.zoomIn(), [])
  const handleZoomOut = useCallback(() => actionsRef.current?.zoomOut(), [])
  const handleResetView = useCallback(() => {
    actionsRef.current?.resetView()
    setGridResetAt(gridStamp(geometryVersion, selectedObjectId))
  }, [geometryVersion, selectedObjectId])

  const isFetching = sceneLoad.loading || sceneLoad.objectLoading || sceneLoad.selectionLoading
  // Only surface the loading overlay when the scene actually has geometry to
  // load/build. A scene-load cycle speculatively sets loading=true/meshReady=false
  // before the object count is known, so without this guard an empty project
  // flashes "Loading scene…" — and whether it's seen depends on scheduler timing.
  const showLoader = objects.length > 0 && (isFetching || !meshReady)

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
        <SceneContent lightingSettings={lightingSettings} gridResetAt={gridResetAt} />
        <ControlsBridge actionsRef={actionsRef} />
      </SceneCanvas>

      {/* Scene selector dropdown — top-left, z-20 so the dropdown menu
          renders above the toolbar (z-10) below it */}
      {objects.length > 0 && !showLoader && (
        <div className="absolute left-3 top-3 z-20">
          <SceneSelector />
        </div>
      )}

      {/* Left toolbar: compact icon strip matching design */}
      {objects.length > 0 && !showLoader && (
        <div className="absolute left-2 top-14 z-10 flex flex-col items-center rounded bg-[#121212] py-1 shadow-lg ring-1 ring-[#424242]">
          <button disabled className="cursor-not-allowed p-1.5 text-neutral-500" title="Layers (coming soon)">
            <LayersIcon />
          </button>
          <button onClick={handleZoomIn} className="p-1.5 text-neutral-400 transition-colors hover:text-white" title="Zoom in (Ctrl +)">
            <ZoomInIcon />
          </button>
          <button onClick={handleZoomOut} className="p-1.5 text-neutral-400 transition-colors hover:text-white" title="Zoom out (Ctrl -)">
            <ZoomOutIcon />
          </button>
          <button onClick={handleResetView} className="p-1.5 text-neutral-400 transition-colors hover:text-white" title="Reset view (F)">
            <ResetViewIcon />
          </button>
          <button disabled className="cursor-not-allowed p-1.5 text-neutral-500" title="Pan (coming soon)">
            <GrabIcon />
          </button>
          <button disabled className="cursor-not-allowed p-1.5 text-neutral-500" title="Camera (coming soon)">
            <CameraIcon />
          </button>
          <button disabled className="cursor-not-allowed p-1.5 text-neutral-500" title="Hierarchy (coming soon)">
            <HierarchyIcon />
          </button>
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
        <div className="absolute left-3 top-10 z-10 select-text rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 font-mono text-[13px] leading-relaxed text-neutral-400 backdrop-blur-sm">
          <div className="flex gap-6">
            <div className="flex flex-col">
              <span>
                Objects: <span className="text-neutral-200">{stats.objects}</span>
              </span>
              <span>
                Primitives:{' '}
                <span className="text-neutral-200">{formatNumber(stats.totalPrimitives)}</span>
              </span>
              <span>
                Triangles: <span className="text-neutral-200">{formatNumber(stats.triangles)}</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span>
                Vertices:{' '}
                <span className="text-neutral-200">{formatNumber(stats.totalVertices)}</span>
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
