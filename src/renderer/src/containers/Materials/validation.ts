import messages from './messages'

// Material names: non-empty, at most 20 characters (internal spaces count toward
// the limit; leading/trailing are trimmed), and unique case-insensitively across
// the project library. Returns an error message, or null when valid. Mirrors the
// backend's §7 rules so an invalid rename is blocked before the PATCH.
export const MAX_NAME_LENGTH = 20

export function validateMaterialName(value: string, existingLowercase: Set<string>): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return messages.nameRequired
  if (trimmed.length > MAX_NAME_LENGTH) return messages.nameTooLong
  if (existingLowercase.has(trimmed.toLowerCase())) return messages.nameExists
  return null
}

// ── Texture uploads ──────────────────────────────────────────────────────────
// JPG/JPEG/PNG only, at most 10 MB.
//
// A note on what this is and isn't: the server is the only place that sees every
// request, so it must enforce these rules itself — a client check is skipped
// entirely by anything that doesn't go through this UI. What the checks below buy
// is catching an honest mistake immediately, with a clear message, instead of
// after an upload round-trip. They are a convenience, not the boundary.

export const MAX_TEXTURE_BYTES = 10 * 1024 * 1024
export const ALLOWED_TEXTURE_TYPES = ['image/jpeg', 'image/png']
export const TEXTURE_ACCEPT_ATTR = '.jpg,.jpeg,.png,image/jpeg,image/png'

const EXTENSION_PATTERN = /\.(jpe?g|png)$/i

// The first bytes of the file itself — the only part of an upload the user can't
// rename. A PNG always opens \x89PNG\r\n\x1a\n; a JPEG always opens \xFF\xD8\xFF.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((b, i) => bytes[i] === b)
}

/** True when the leading bytes are a real PNG or JPEG header. */
export function hasImageSignature(bytes: Uint8Array): boolean {
  return startsWith(bytes, PNG_SIGNATURE) || startsWith(bytes, JPEG_SIGNATURE)
}

/**
 * Validate a picked texture file. Returns an error message, or null when it
 * passes. Async because the content check has to read the file's first bytes.
 */
export async function validateTextureFile(file: File): Promise<string | null> {
  // Size first — it's free, and it's the check most likely to fail on a big
  // photo, so failing here avoids reading anything at all.
  if (file.size > MAX_TEXTURE_BYTES) return messages.textureFileSizeError

  if (!EXTENSION_PATTERN.test(file.name)) return messages.textureFileTypeError

  // `file.type` is set by the OS and is empty on some platforms for a perfectly
  // good image, so an empty value can't be treated as a failure — only a value
  // that IS present and IS wrong.
  if (file.type !== '' && !ALLOWED_TEXTURE_TYPES.includes(file.type)) {
    return messages.textureFileTypeError
  }

  // The name and the OS-reported type are both just labels; this reads the file.
  // It's what stops a PDF renamed to .png from being uploaded, sitting in the
  // library, and then rendering as a blank white surface with no explanation.
  const header = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer())
  if (!hasImageSignature(header)) return messages.textureFileContentError

  return null
}
