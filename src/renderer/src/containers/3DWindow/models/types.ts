// ── Scene objects (returned by GET /objects) ─────────────────────────────────

export interface SceneObject {
  id: number
  name: string
  object_type_id: number
}

// ── Errors ───────────────────────────────────────────────────────────────────

export interface ApiErrorPayload {
  status: number // HTTP status (0 = network failure / missing context)
  message: string
  fieldErrors: Record<string, string>
}

// Binary geometry wire format (parsed)

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Vec2UV {
  u: number
  v: number
}

export interface RGBColor {
  r: number
  g: number
  b: number
}

export interface PrimitiveInfo {
  uuid: number
  vertices: Vec3[]
  color: RGBColor
  textureFile?: string
  textureMaskMode?: boolean
  uvs?: Vec2UV[]
}
