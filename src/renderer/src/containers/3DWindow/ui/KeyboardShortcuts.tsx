import type { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import * as THREE from 'three'
import { selectSceneObject } from '../store/actions'
import { selectSelectedObjectId } from '../store/selectors'
import { getAllCachedPrimitives, getObjectPrimitives } from '../store/sceneCache'
import type { PrimitiveInfo } from '../models/types'

// ── Constants ───────────────────────────────────────────────────────────────

/** Rotation step per key press (radians ≈ 5°). */
const ROTATE_STEP = Math.PI / 36

/** Pan step per key press (fraction of current distance). */
const PAN_STEP = 0.08

/** Dolly step per key press (fraction of current distance). */
const DOLLY_STEP = 0.15

/** Duration (ms) to pump the update loop for smooth transitions. */
const TRANSITION_MS = 350

/** Default camera pose — matches SceneCanvas initial values. */
const DEFAULT_POS: [number, number, number] = [10, 10, 8]
const DEFAULT_TARGET: [number, number, number] = [0, 0, 0]

// ── Helpers ─────────────────────────────────────────────────────────────────

function computeBoundingBox(primitives: PrimitiveInfo[]): THREE.Box3 {
  const box = new THREE.Box3()
  const pt = new THREE.Vector3()
  for (const prim of primitives) {
    for (const v of prim.vertices) {
      box.expandByPoint(pt.set(v.x, v.y, v.z))
    }
  }
  return box
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Invisible R3F component that adds keyboard shortcuts for camera orbit, zoom
 * and view reset. Listens on `document` and only activates when the R3F canvas
 * (or its wrapper) is the focused element.
 *
 * Must be rendered inside the R3F `<Canvas>` tree.
 */
export function KeyboardShortcuts(): null {
  const { camera, gl, invalidate } = useThree()
  const controls = useThree((s) => s.controls) as CameraControls | null
  const dispatch = useDispatch()

  const selectedObjectId = useSelector(selectSelectedObjectId)
  const selectedRef = useRef(selectedObjectId)
  selectedRef.current = selectedObjectId

  useEffect(() => {
    if (!controls) return

    // The R3F Canvas wrapper div — we check focus against this subtree.
    const canvasRoot = gl.domElement.parentElement

    function isViewportFocused(): boolean {
      const active = document.activeElement
      if (!active) return false
      // Focused element is the canvas, its wrapper, or any child of the wrapper.
      if (active === gl.domElement) return true
      if (canvasRoot && canvasRoot.contains(active)) return true
      return false
    }

    function isInputFocused(): boolean {
      const tag = document.activeElement?.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    // With frameloop="demand" the R3F render loop is idle, so smooth
    // transitions from camera-controls never tick. This helper pumps
    // controls.update + invalidate for TRANSITION_MS after a command.
    //
    // A single rAF loop runs at a time. Each new shortcut press resets
    // the deadline so rapid/held keys keep the loop alive without
    // stacking multiple loops.
    let transitionTimer = 0
    let transitionRunning = false
    let deadline = 0

    function driveTransition(): void {
      deadline = performance.now() + TRANSITION_MS
      if (transitionRunning) return // loop already ticking — just extended deadline
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

    function stopTransition(): void {
      transitionRunning = false
      cancelAnimationFrame(transitionTimer)
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (isInputFocused()) return
      if (!isViewportFocused()) return

      const ctrl = e.ctrlKey || e.metaKey

      // ── Ctrl + Arrow: rotate/orbit camera around target ─────────────
      if (ctrl && e.code === 'ArrowRight') {
        e.preventDefault()
        controls?.rotate(-ROTATE_STEP, 0, true)
        driveTransition()
        return
      }
      if (ctrl && e.code === 'ArrowLeft') {
        e.preventDefault()
        controls?.rotate(ROTATE_STEP, 0, true)
        driveTransition()
        return
      }
      if (ctrl && e.code === 'ArrowUp') {
        e.preventDefault()
        controls?.rotate(0, -ROTATE_STEP, true)
        driveTransition()
        return
      }
      if (ctrl && e.code === 'ArrowDown') {
        e.preventDefault()
        controls?.rotate(0, ROTATE_STEP, true)
        driveTransition()
        return
      }

      // ── Arrow keys (no modifier): pan/move camera ──────────────────
      if (!ctrl && !e.shiftKey && !e.altKey && e.code === 'ArrowRight') {
        e.preventDefault()
        controls?.truck(controls.distance * PAN_STEP, 0, true)
        driveTransition()
        return
      }
      if (!ctrl && !e.shiftKey && !e.altKey && e.code === 'ArrowLeft') {
        e.preventDefault()
        controls?.truck(-controls.distance * PAN_STEP, 0, true)
        driveTransition()
        return
      }
      if (!ctrl && !e.shiftKey && !e.altKey && e.code === 'ArrowUp') {
        e.preventDefault()
        controls?.truck(0, -controls.distance * PAN_STEP, true)
        driveTransition()
        return
      }
      if (!ctrl && !e.shiftKey && !e.altKey && e.code === 'ArrowDown') {
        e.preventDefault()
        controls?.truck(0, controls.distance * PAN_STEP, true)
        driveTransition()
        return
      }

      // ── Ctrl + Plus / Minus: zoom ───────────────────────────────────
      if (ctrl && (e.code === 'Equal' || e.code === 'NumpadAdd')) {
        e.preventDefault()
        controls?.dolly(controls.distance * DOLLY_STEP, true)
        driveTransition()
        return
      }
      if (ctrl && (e.code === 'Minus' || e.code === 'NumpadSubtract')) {
        e.preventDefault()
        controls?.dolly(-controls.distance * DOLLY_STEP, true)
        driveTransition()
        return
      }

      // ── Ctrl + 0: reset to default view ─────────────────────────────
      if (ctrl && (e.code === 'Digit0' || e.code === 'Numpad0')) {
        e.preventDefault()
        resetView()
        return
      }

      // ── A: show all + fit ───────────────────────────────────────────
      if (!ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyA') {
        e.preventDefault()
        dispatch(selectSceneObject(null))
        fitToAll()
        return
      }

      // ── F: focus on selected object ─────────────────────────────────
      if (!ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyF') {
        e.preventDefault()
        const id = selectedRef.current
        if (id === null) {
          fitToAll()
        } else {
          const prims = getObjectPrimitives(id)
          if (prims && prims.length > 0) fitCameraToBox(computeBoundingBox(prims))
        }
        return
      }

      // ── Esc: clear selection ────────────────────────────────────────
      if (!ctrl && !e.shiftKey && !e.altKey && e.code === 'Escape') {
        e.preventDefault()
        dispatch(selectSceneObject(null))
        return
      }

      // ── Home: frame all ─────────────────────────────────────────────
      if (!ctrl && !e.shiftKey && !e.altKey && e.code === 'Home') {
        e.preventDefault()
        fitToAll()
        return
      }
    }

    function fitToAll(): void {
      const allPrims = getAllCachedPrimitives()
      if (allPrims.length > 0) fitCameraToBox(computeBoundingBox(allPrims))
    }

    function fitCameraToBox(box: THREE.Box3): void {
      if (box.isEmpty()) return

      const center = new THREE.Vector3()
      box.getCenter(center)

      const sphere = new THREE.Sphere()
      box.getBoundingSphere(sphere)
      const perspCam = camera as THREE.PerspectiveCamera
      const vFovHalf = (perspCam.fov * Math.PI) / 180 / 2
      const dist = sphere.radius / Math.sin(vFovHalf)

      perspCam.near = Math.max(0.01, dist * 0.001)
      perspCam.far = dist * 10
      perspCam.updateProjectionMatrix()

      // Keep the current viewing direction, adjust distance and target.
      const camPos = new THREE.Vector3()
      controls?.getPosition(camPos)
      const curTarget = new THREE.Vector3()
      controls?.getTarget(curTarget)
      const dir = camPos.sub(curTarget).normalize()

      const newPos = center.clone().add(dir.multiplyScalar(dist))
      controls?.setLookAt(newPos.x, newPos.y, newPos.z, center.x, center.y, center.z, true)
      controls.minDistance = perspCam.near * 10
      controls.maxDistance = dist * 20
      driveTransition()
    }

    function resetView(): void {
      const allPrims = getAllCachedPrimitives()
      if (allPrims.length > 0) {
        fitCameraToBox(computeBoundingBox(allPrims))
      } else {
        controls?.setLookAt(
          DEFAULT_POS[0],
          DEFAULT_POS[1],
          DEFAULT_POS[2],
          DEFAULT_TARGET[0],
          DEFAULT_TARGET[1],
          DEFAULT_TARGET[2],
          true
        )
        driveTransition()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      stopTransition()
    }
  }, [controls, camera, gl, invalidate, dispatch])

  return null
}

export default KeyboardShortcuts
