import React from 'react'
import * as THREE from 'three'
import type { LightingMode } from './materials'

const LIGHT_SCALE = 4.0

export interface LightingSettings {
  mode: LightingMode
  sunElevation: number
  sunAzimuth: number
  directIntensity: number
  diffuseIntensity: number
  lightColor: { r: number; g: number; b: number }
}

export const defaultLightingSettings: LightingSettings = {
  mode: 'phong',
  sunElevation: 60,
  sunAzimuth: 45,
  directIntensity: 1.0,
  diffuseIntensity: 0.4,
  lightColor: { r: 1, g: 1, b: 1 }
}

function sunAnglesToPosition(
  elevation: number,
  azimuth: number,
  distance: number
): [number, number, number] {
  const el = (elevation * Math.PI) / 180
  const az = (azimuth * Math.PI) / 180
  const cosEl = Math.cos(el)
  return [distance * cosEl * Math.sin(az), distance * cosEl * Math.cos(az), distance * Math.sin(el)]
}

interface SceneLightingProps {
  settings: LightingSettings
}

export function SceneLighting({ settings }: SceneLightingProps): React.JSX.Element | null {
  if (settings.mode === 'flat') return null

  const { r, g, b } = settings.lightColor
  const color = new THREE.Color(r, g, b)
  const sunPos = sunAnglesToPosition(settings.sunElevation, settings.sunAzimuth, 50)

  return (
    <>
      <ambientLight intensity={settings.diffuseIntensity * LIGHT_SCALE} color={color} />
      <directionalLight
        position={sunPos}
        intensity={settings.directIntensity * LIGHT_SCALE}
        color={color}
        castShadow={settings.mode === 'phong-shadows'}
      />
    </>
  )
}

export default SceneLighting
