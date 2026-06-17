import React from 'react'

// Defaults mirrored from the source project (types/geometry.ts
// defaultLightingSettings + Viewport3D LIGHT_SCALE): phong mode, sun at
// elevation 60° / azimuth 45°, user-facing intensities 1.0 direct / 0.4
// diffuse. With linear output color space and no tone mapping, lights need
// higher Three.js values, hence the ×4 scale.
const LIGHT_SCALE = 4.0
const DIRECT_INTENSITY = 1.0 * LIGHT_SCALE
const DIFFUSE_INTENSITY = 0.4 * LIGHT_SCALE
const SUN_ELEVATION_DEG = 60
const SUN_AZIMUTH_DEG = 45
const SUN_DISTANCE = 50

/** Elevation/azimuth (degrees) → light position. Azimuth 0=North(+Y), 90=East(+X). */
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

const SUN_POSITION = sunAnglesToPosition(SUN_ELEVATION_DEG, SUN_AZIMUTH_DEG, SUN_DISTANCE)

export function SceneLighting(): React.JSX.Element {
  return (
    <>
      <ambientLight intensity={DIFFUSE_INTENSITY} />
      <directionalLight position={SUN_POSITION} intensity={DIRECT_INTENSITY} />
    </>
  )
}

export default SceneLighting
