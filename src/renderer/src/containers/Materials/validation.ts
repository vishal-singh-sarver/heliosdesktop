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

export type ImageFormat = 'PNG' | 'JPEG'

/** Which format the leading bytes actually are, or null for neither. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'PNG'
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'JPEG'
  return null
}

/** Which format a file NAME claims, or null if the extension isn't one of ours. */
export function formatFromExtension(name: string): ImageFormat | null {
  const match = /\.(jpe?g|png)$/i.exec(name)
  if (!match) return null
  return match[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG'
}

// The largest edge any mainstream GPU will sample. WebGL's MAX_TEXTURE_SIZE is
// commonly 4096–16384; 8192 clears every current desktop GPU while still catching
// the absurd cases (a flat-colour 20000² PNG compresses to a few KB, so the byte
// cap never sees it — it just uploads, stores, and renders black).
export const MAX_TEXTURE_DIMENSION = 8192

export interface ImageSize {
  width: number
  height: number
}

// Actually decode the image. A signature check only proves the first 8 bytes look
// right; this is what catches a truncated download, a mangled body, or a header
// with nothing behind it.
//
// Returns the decoded size, or null when the data does not decode. When the
// runtime has no `createImageBitmap` at all (a non-browser test env), it returns
// `undefined` — meaning "not checked", NOT "corrupt", so a missing API can never
// reject every upload.
export async function decodeImageSize(file: File): Promise<ImageSize | null | undefined> {
  const create = (globalThis as { createImageBitmap?: (b: Blob) => Promise<ImageBitmap> })
    .createImageBitmap
  if (typeof create !== 'function') return undefined
  try {
    const bitmap = await create(file)
    const size = { width: bitmap.width, height: bitmap.height }
    // Release the decoded pixels straight away — a 10 MB JPEG expands to far more
    // in memory, and the caller only ever needs the dimensions.
    bitmap.close?.()
    // A decoder that hands back a zero-sized bitmap decoded nothing usable.
    return size.width > 0 && size.height > 0 ? size : null
  } catch {
    return null
  }
}

/**
 * Validate a picked texture file. Returns an error message, or null when it
 * passes. Async: the last two checks read, then decode, the file itself.
 *
 * Ordered cheapest-first, and each step earns its place by catching something the
 * one before it cannot:
 *   size       → a 40 MB photo, without reading a byte
 *   extension  → a .pdf
 *   MIME       → what the OS thinks it is (when it says anything at all)
 *   signature  → a .zip renamed .png; a 0-byte file
 *   format     → a real PNG named .jpeg (uploads fine, dies at the decoder later)
 *   decode     → a truncated or mangled image whose first 8 bytes still look right
 *   dimensions → a 20000² image that decodes and then exceeds every GPU limit
 */
export async function validateTextureFile(file: File): Promise<string | null> {
  // Size first — it's free, and it's the check most likely to fail on a big
  // photo, so failing here avoids reading anything at all.
  if (file.size > MAX_TEXTURE_BYTES) return messages.textureFileSizeError

  const named = formatFromExtension(file.name)
  if (named == null) return messages.textureFileTypeError

  // `file.type` is set by the OS and is empty on some platforms for a perfectly
  // good image, so an empty value can't be treated as a failure — only a value
  // that IS present and IS wrong.
  if (file.type !== '' && !ALLOWED_TEXTURE_TYPES.includes(file.type)) {
    return messages.textureFileTypeError
  }

  // The name and the OS-reported type are both just labels; this reads the file.
  // It's what stops a PDF renamed to .png from being uploaded, sitting in the
  // library, and then rendering as a blank white surface with no explanation.
  //
  // The read can fail outright — the file may have been moved, deleted, or sat on
  // a volume that went away between the picker and here. That is not a corrupt
  // image and must not be reported as one, and it must certainly not escape as an
  // unhandled rejection that leaves the user staring at a dialog doing nothing.
  let header: Uint8Array
  try {
    header = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer())
  } catch {
    return messages.textureFileUnreadable
  }

  const actual = detectImageFormat(header)
  if (actual == null) return messages.textureFileContentError
  // Both are real image formats here, so this is a naming mistake, not a fake
  // file — and it is worth its own message, because "invalid image" would send
  // the user hunting for a problem with a picture that is perfectly fine.
  if (actual !== named) return messages.textureFileFormatMismatch(actual, file.name)

  // Everything above only proves the file STARTS like an image. This decodes it.
  const size = await decodeImageSize(file)
  if (size === undefined) return null // no decoder in this runtime — checks end here
  if (size === null) return messages.textureFileCorruptError
  if (size.width > MAX_TEXTURE_DIMENSION || size.height > MAX_TEXTURE_DIMENSION) {
    return messages.textureFileTooLargeDimensions(MAX_TEXTURE_DIMENSION)
  }

  return null
}

// ── JPEG EXIF orientation ────────────────────────────────────────────────────
//
// A phone photo records which way up it was taken instead of rotating the pixels.
// An <img> honours that tag, so the upload preview looks right — but WebGL uploads
// the raw decoded pixels, so the same texture lands on the 3D surface rotated or
// mirrored. Same file, two answers, and nothing on screen explaining the
// difference.
//
// The fix is to bake the rotation into the pixels once, at pick time, so every
// consumer afterwards agrees.

// EXIF lives in the APP1 segment near the start of the file; 64 KB is far more
// than enough and avoids pulling a 10 MB photo into memory to read one tag.
const EXIF_SCAN_BYTES = 64 * 1024

// Standalone markers carry no length field, so the segment walk must not try to
// read one: SOI/EOI, the restart markers, and TEM.
function isStandaloneMarker(marker: number): boolean {
  return marker === 0xffd8 || marker === 0xffd9 || marker === 0xff01 || (marker >= 0xffd0 && marker <= 0xffd7)
}

function orientationFromTiff(view: DataView, tiff: number): number | null {
  if (tiff + 8 > view.byteLength) return null
  const order = view.getUint16(tiff)
  const little = order === 0x4949 // 'II'
  if (!little && order !== 0x4d4d) return null // neither 'II' nor 'MM'
  if (view.getUint16(tiff + 2, little) !== 42) return null // TIFF magic

  const directory = tiff + view.getUint32(tiff + 4, little)
  if (directory + 2 > view.byteLength) return null
  const entries = view.getUint16(directory, little)
  for (let i = 0; i < entries; i++) {
    const entry = directory + 2 + i * 12
    if (entry + 12 > view.byteLength) return null
    if (view.getUint16(entry, little) === 0x0112) {
      // Orientation is a SHORT, so it sits in the first 2 bytes of the value slot.
      const value = view.getUint16(entry + 8, little)
      return value >= 1 && value <= 8 ? value : null
    }
  }
  return null
}

/**
 * The EXIF orientation of a JPEG: 1 (upright) through 8, or null when the file
 * isn't a JPEG, carries no EXIF, or the tag is absent//malformed. Pure — give it
 * the file's leading bytes.
 */
export function readJpegOrientation(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 4) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(0) !== 0xffd8) return null // not a JPEG

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    if ((marker & 0xff00) !== 0xff00) return null // lost the segment chain
    if (isStandaloneMarker(marker)) {
      offset += 2
      continue
    }
    // Start of scan — the compressed image data begins, and EXIF would have come
    // before it. Stop rather than walk into the pixels.
    if (marker === 0xffda) return null

    const length = view.getUint16(offset + 2)
    if (length < 2) return null // malformed segment; refuse to loop forever
    if (marker === 0xffe1) {
      const exif = offset + 4
      const EXIF_TAG = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
      if (
        exif + EXIF_TAG.length <= view.byteLength &&
        EXIF_TAG.every((b, i) => bytes[exif + i] === b)
      ) {
        return orientationFromTiff(view, exif + EXIF_TAG.length)
      }
    }
    offset += 2 + length
  }
  return null
}

/**
 * Return a file whose PIXELS are already the right way up: for a JPEG whose EXIF
 * says anything but "upright", decode with the orientation applied and re-encode.
 * Everything else is returned untouched — including a JPEG that is already
 * upright, so the common case never pays a re-encode.
 *
 * Never throws and never blocks a pick: if the runtime has no decoder or canvas,
 * or any step fails, the ORIGINAL file comes back. A rotated texture is a much
 * smaller problem than an upload that refuses to happen.
 */
export async function normalizeImageOrientation(file: File): Promise<File> {
  if (formatFromExtension(file.name) !== 'JPEG') return file

  let head: Uint8Array
  try {
    head = new Uint8Array(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer())
  } catch {
    return file
  }
  const orientation = readJpegOrientation(head)
  if (orientation == null || orientation === 1) return file

  const create = (
    globalThis as {
      createImageBitmap?: (b: Blob, o?: ImageBitmapOptions) => Promise<ImageBitmap>
    }
  ).createImageBitmap
  if (typeof create !== 'function' || typeof document === 'undefined') return file

  try {
    // `from-image` is what makes the decoder apply the tag; drawing the result and
    // re-encoding writes it into the pixels for good.
    const bitmap = await create(file, { imageOrientation: 'from-image' })
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close?.()
      return file
    }
    context.drawImage(bitmap, 0, 0)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_REENCODE_QUALITY)
    )
    if (!blob) return file
    return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

// High enough that a re-encode is visually lossless for a texture; low enough that
// a photo doesn't balloon past the size cap it already passed.
const JPEG_REENCODE_QUALITY = 0.92

// ── Spectral data (Radiation) ────────────────────────────────────────────────

export const MAX_SPECTRAL_BYTES = 5 * 1024 * 1024
export const SPECTRAL_ACCEPT_ATTR = '.xml'

/** True when the text parses as XML with a real root element. */
export function isWellFormedXml(text: string): boolean {
  if (text.trim() === '') return false
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  return doc.querySelector('parsererror') == null && doc.documentElement != null
}

// The spectral-library shape, taken from the loader that consumes these files
// rather than guessed at — helios-core's Context::loadXML:
//
//   • the root must be <helios>, or it hard-errors: "XML file must have tag
//     '<helios> ... </helios>' bounding all other tags"  (Context_fileIO.cpp)
//   • spectra are DIRECT <globaldata_vec2> children of it, each with a `label`
//   • each block's text is whitespace-separated numbers; parse_data_vec2 returns
//     an error for empty content, or for any token that isn't a float, and the
//     caller turns that into "contained invalid data"
//
// Only those hard-error cases are rejected here, plus a file carrying no spectra
// at all. Anything Helios tolerates is left alone — refusing a file the simulation
// would have accepted is a worse failure than the one being prevented.
export function validateSpectralXml(doc: Document): string | null {
  const root = doc.documentElement
  if (root == null || root.tagName !== 'helios') return messages.spectralRootError

  // Direct children only: `helios.child("globaldata_vec2")` does not search
  // descendants, so a block nested deeper is not data Helios will ever read.
  const blocks = Array.from(root.children).filter((el) => el.tagName === 'globaldata_vec2')
  if (blocks.length === 0) return messages.spectralNoDataError

  for (const block of blocks) {
    const label = block.getAttribute('label') ?? ''
    const text = (block.textContent ?? '').trim()
    if (text === '') return messages.spectralDataEmpty(label)
    // Helios reads these as float pairs; a token it can't parse is a hard error.
    // An ODD count is deliberately allowed — the C++ tolerates it, and rejecting
    // here would block a file that loads.
    if (text.split(/\s+/).some((token) => !Number.isFinite(Number(token)))) {
      return messages.spectralDataInvalid(label)
    }
  }
  return null
}

/**
 * Validate a picked spectral-data file. Returns an error message, or null.
 *
 * The backend enforces the .xml extension and NOTHING else, so anything that gets
 * past here is stored happily and only fails much later, inside a simulation,
 * where nothing points back at this upload. So this goes all the way: parse the
 * file, then check it against the structure helios-core actually requires (see
 * validateSpectralXml).
 */
export async function validateSpectralFile(file: File): Promise<string | null> {
  if (file.size > MAX_SPECTRAL_BYTES) return messages.spectralFileSizeError
  if (!/\.xml$/i.test(file.name)) return messages.spectralFileTypeError

  let text: string
  try {
    text = await file.text()
  } catch {
    return messages.spectralFileUnreadable
  }

  if (text.trim() === '') return messages.spectralFileContentError
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror') != null || doc.documentElement == null) {
    return messages.spectralFileContentError
  }
  return validateSpectralXml(doc)
}
