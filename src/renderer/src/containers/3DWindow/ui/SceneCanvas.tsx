import { Canvas } from '@react-three/fiber'
import React from 'react'
import * as THREE from 'three'

interface SceneCanvasProps {
  children: React.ReactNode
}

/**
 * R3F canvas configured for the Helios convention: Z-up coordinates
 * (X=East, Y=North, Z=Height) and on-demand rendering.
 */
export function SceneCanvas({ children }: SceneCanvasProps): React.JSX.Element {
  return (
    <Canvas
      frameloop="demand"
      shadows
      camera={{
        position: [10, 10, 8],
        fov: 50,
        near: 0.1,
        far: 100000,
        up: [0, 0, 1]
      }}
      style={{ background: '#0f0f1a' }}
      onCreated={({ gl, camera }) => {
        // Helios colors are linear; skip sRGB conversion and tone mapping so
        // the viewport matches the C++ visualizer.
        gl.outputColorSpace = THREE.LinearSRGBColorSpace
        gl.toneMapping = THREE.NoToneMapping
        camera.up.set(0, 0, 1)
        camera.lookAt(0, 0, 0)
      }}
    >
      {children}
    </Canvas>
  )
}

export default SceneCanvas
