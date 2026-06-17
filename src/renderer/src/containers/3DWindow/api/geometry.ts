import { ApiError } from 'utils/api'
import { BASE_URL } from 'utils/constants'
import { getSessionId } from 'utils/session'
import type { PrimitiveInfo, Vec2UV, Vec3 } from '../models/types'
import { GEOMETRY_ROUTES } from './endpoints'

/**
 * Parse the backend's binary geometry wire format into PrimitiveInfo[].
 */
export function parseBinaryPrimitives(buffer: ArrayBuffer): PrimitiveInfo[] {
  const view = new DataView(buffer)
  let offset = 0

  const count = view.getUint32(offset, true)
  offset += 4

  const primitives: PrimitiveInfo[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const uuid = view.getInt32(offset, true)
    offset += 4
    const vertexCount = view.getUint32(offset, true)
    offset += 4

    const vertices: Vec3[] = new Array(vertexCount)
    for (let v = 0; v < vertexCount; v++) {
      vertices[v] = {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true)
      }
      offset += 12
    }

    const r = view.getFloat32(offset, true)
    const g = view.getFloat32(offset + 4, true)
    const b = view.getFloat32(offset + 8, true)
    offset += 12

    const texPathLen = view.getUint16(offset, true)
    offset += 2

    let textureFile: string | undefined
    let textureMaskMode = false
    let uvs: Vec2UV[] | undefined

    if (texPathLen > 0) {
      const pathBytes = new Uint8Array(buffer, offset, texPathLen)
      let rawPath = new TextDecoder().decode(pathBytes)
      offset += texPathLen

      if (rawPath.startsWith('mask:')) {
        textureMaskMode = true
        rawPath = rawPath.substring(5)
      }
      textureFile = rawPath

      uvs = new Array(vertexCount)
      for (let vi = 0; vi < vertexCount; vi++) {
        uvs[vi] = {
          u: view.getFloat32(offset, true),
          v: view.getFloat32(offset + 4, true)
        }
        offset += 8
      }
    }

    primitives[i] = {
      uuid,
      vertices,
      color: { r, g, b },
      textureFile,
      textureMaskMode: textureMaskMode || undefined,
      uvs
    }
  }

  return primitives
}

/**
 * Fetch binary geometry from a URL path. Uses fetch (not utils/api) because
 * the response is a binary ArrayBuffer, not JSON.
 */
async function fetchBinaryGeometry(path: string): Promise<PrimitiveInfo[]> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'session-id': getSessionId() },
    signal: AbortSignal.timeout(120_000)
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, body || res.statusText || `Failed to load geometry: ${path}`)
  }

  const buffer = await res.arrayBuffer()
  return parseBinaryPrimitives(buffer)
}

/** Fetch and parse one object's geometry. */
export async function fetchObjectGeometryBinary(
  projectId: string,
  scenarioId: string,
  objectId: number
): Promise<PrimitiveInfo[]> {
  const path = GEOMETRY_ROUTES.objectGeometryBinary(projectId, scenarioId, objectId)
  return fetchBinaryGeometry(path)
}
