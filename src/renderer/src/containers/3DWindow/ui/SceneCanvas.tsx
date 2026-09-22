import { Canvas } from '@react-three/fiber'
import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface SceneCanvasProps {
  children: React.ReactNode
}

/**
 * R3F canvas configured for the Helios convention: Z-up coordinates
 * (X=East, Y=North, Z=Height) and on-demand rendering.
 */
export function SceneCanvas({ children }: SceneCanvasProps): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Auto-focus the canvas when it becomes visible (tab switch).
  // Disconnects the observer on unmount to prevent leaks.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const canvas = wrapper.querySelector('canvas')
    if (!canvas) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          canvas.focus({ preventScroll: true })
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(wrapper)

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={wrapperRef} className="h-full w-full">
      <Canvas
        frameloop="demand"
        shadows="percentage"
        camera={{
          position: [10, 10, 8],
          fov: 50,
          near: 0.1,
          far: 1000000,
          up: [0, 0, 1]
        }}
        style={{ background: '#0f0f1a', height: '100%', width: '100%' }}
        onCreated={({ gl, camera }) => {
          // Helios colors are linear; skip sRGB conversion and tone mapping so
          // the viewport matches the C++ visualizer.
          gl.outputColorSpace = THREE.LinearSRGBColorSpace
          gl.toneMapping = THREE.NoToneMapping
          camera.up.set(0, 0, 1)
          camera.lookAt(0, 0, 0)

          // Make the canvas focusable so keyboard shortcuts work.
          gl.domElement.tabIndex = 0
          gl.domElement.style.outline = 'none'
          // Auto-focus on mount.
          gl.domElement.focus({ preventScroll: true })
        }}
      >
        {children}
      </Canvas>
    </div>
  )
}

export default SceneCanvas
