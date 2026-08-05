import { afterEach, vi } from 'vitest'
import messages from '../messages'
import {
  detectImageFormat,
  formatFromExtension,
  isWellFormedXml,
  normalizeImageOrientation,
  validateSpectralXml,
  readJpegOrientation,
  validateSpectralFile,
  hasImageSignature,
  MAX_TEXTURE_BYTES,
  MAX_TEXTURE_DIMENSION,
  validateMaterialName,
  validateTextureFile
} from '../validation'

describe('validateMaterialName', () => {
  it('accepts a fresh, in-length name', () => {
    expect(validateMaterialName('Soil', new Set())).toBeNull()
  })

  it('rejects blank and whitespace-only names', () => {
    expect(validateMaterialName('', new Set())).toBe(messages.nameRequired)
    expect(validateMaterialName('   ', new Set())).toBe(messages.nameRequired)
  })

  it('rejects a name past the length cap, counting internal spaces', () => {
    expect(validateMaterialName('a'.repeat(21), new Set())).toBe(messages.nameTooLong)
    // Trimmed ends don't count toward the limit.
    expect(validateMaterialName(`  ${'a'.repeat(20)}  `, new Set())).toBeNull()
  })

  it('rejects a duplicate case-insensitively', () => {
    expect(validateMaterialName('Soil', new Set(['soil']))).toBe(messages.nameExists)
  })
})

// Build a File whose CONTENT we control, so the signature check has something
// real to read. jsdom's File supports slice()/arrayBuffer().
const fileOf = (
  name: string,
  bytes: number[],
  type = '',
  size?: number
): File => {
  const file = new File([new Uint8Array(bytes)], name, { type })
  // File.size is read-only and derives from the content; override it when a test
  // needs to look huge without allocating 10 MB.
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
}

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]
const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34] // "%PDF-1.4"

describe('hasImageSignature', () => {
  it('recognises PNG and JPEG headers', () => {
    expect(hasImageSignature(new Uint8Array(PNG_BYTES))).toBe(true)
    expect(hasImageSignature(new Uint8Array(JPEG_BYTES))).toBe(true)
  })

  it('rejects anything else, and a truncated header', () => {
    expect(hasImageSignature(new Uint8Array(PDF_BYTES))).toBe(false)
    expect(hasImageSignature(new Uint8Array([0x89, 0x50]))).toBe(false)
    expect(hasImageSignature(new Uint8Array([]))).toBe(false)
  })
})

describe('validateTextureFile', () => {
  it('accepts a real PNG and a real JPEG', async () => {
    expect(await validateTextureFile(fileOf('a.png', PNG_BYTES, 'image/png'))).toBeNull()
    expect(await validateTextureFile(fileOf('b.jpg', JPEG_BYTES, 'image/jpeg'))).toBeNull()
    expect(await validateTextureFile(fileOf('c.jpeg', JPEG_BYTES, 'image/jpeg'))).toBeNull()
  })

  it('accepts a real image whose type the OS did not report', async () => {
    // Some platforms hand back an empty File.type for a perfectly good image, so
    // an empty value must not be treated as a failure — only a wrong one.
    expect(await validateTextureFile(fileOf('a.png', PNG_BYTES, ''))).toBeNull()
  })

  it('rejects a non-image renamed to .png — the case the name check missed', async () => {
    // Extension says PNG, OS type says PNG, but the bytes are a PDF. Only reading
    // the content catches this; previously it uploaded and then rendered white.
    const disguised = fileOf('fake.png', PDF_BYTES, 'image/png')
    expect(await validateTextureFile(disguised)).toBe(messages.textureFileContentError)
  })

  it('rejects a disallowed extension', async () => {
    expect(await validateTextureFile(fileOf('doc.pdf', PDF_BYTES, 'application/pdf'))).toBe(
      messages.textureFileTypeError
    )
    // A double extension is judged on the real (last) one.
    expect(await validateTextureFile(fileOf('a.png.txt', PNG_BYTES, ''))).toBe(
      messages.textureFileTypeError
    )
  })

  it('rejects a right-looking name whose reported type is wrong', async () => {
    expect(await validateTextureFile(fileOf('a.png', PNG_BYTES, 'application/pdf'))).toBe(
      messages.textureFileTypeError
    )
  })

  it('rejects a file over the size cap before reading any of it', async () => {
    const huge = fileOf('big.png', PNG_BYTES, 'image/png', MAX_TEXTURE_BYTES + 1)
    expect(await validateTextureFile(huge)).toBe(messages.textureFileSizeError)
  })

  it('accepts a file exactly at the cap', async () => {
    const atCap = fileOf('edge.png', PNG_BYTES, 'image/png', MAX_TEXTURE_BYTES)
    expect(await validateTextureFile(atCap)).toBeNull()
  })
})


// ── Decode-stage checks ───────────────────────────────────────────────────────
// jsdom has no image decoder, so `createImageBitmap` is stubbed per test. That is
// also why validateTextureFile treats a MISSING decoder as "not checked" rather
// than "corrupt" — see the last test in this block.

const stubDecoder = (result: { width: number; height: number } | Error): (() => void) => {
  const close = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (result instanceof Error) throw result
      return { ...result, close }
    })
  )
  return close
}

afterEach(() => vi.unstubAllGlobals())

describe('detectImageFormat / formatFromExtension', () => {
  it('names the format the bytes actually are', () => {
    expect(detectImageFormat(new Uint8Array(PNG_BYTES))).toBe('PNG')
    expect(detectImageFormat(new Uint8Array(JPEG_BYTES))).toBe('JPEG')
    expect(detectImageFormat(new Uint8Array(PDF_BYTES))).toBeNull()
  })

  it('names the format the FILENAME claims', () => {
    expect(formatFromExtension('a.png')).toBe('PNG')
    expect(formatFromExtension('a.PNG')).toBe('PNG')
    expect(formatFromExtension('a.jpg')).toBe('JPEG')
    expect(formatFromExtension('a.jpeg')).toBe('JPEG')
    expect(formatFromExtension('a.webp')).toBeNull()
    expect(formatFromExtension('png')).toBeNull()
  })
})

describe('validateTextureFile — content vs name', () => {
  it('rejects a real PNG renamed .jpeg, naming the mismatch', async () => {
    // Both are genuine image formats, so "invalid image" would be a lie — this
    // uploads and stores fine today, then dies wherever a decoder is chosen by
    // extension.
    stubDecoder({ width: 64, height: 64 })
    const error = await validateTextureFile(fileOf('shot.jpeg', PNG_BYTES, 'image/jpeg'))
    expect(error).toBe(messages.textureFileFormatMismatch('PNG', 'shot.jpeg'))
  })

  it('rejects a real JPEG renamed .png', async () => {
    stubDecoder({ width: 64, height: 64 })
    const error = await validateTextureFile(fileOf('shot.png', JPEG_BYTES, 'image/png'))
    expect(error).toBe(messages.textureFileFormatMismatch('JPEG', 'shot.png'))
  })

  it('rejects a zero-byte file that is named like an image', async () => {
    expect(await validateTextureFile(fileOf('empty.png', [], 'image/png'))).toBe(
      messages.textureFileContentError
    )
  })
})

describe('validateTextureFile — decode', () => {
  it('rejects a file whose header is fine but whose image data will not decode', async () => {
    // The corrupted-image case: the first 8 bytes still say PNG, so every check
    // short of an actual decode passes it.
    stubDecoder(new Error('decode failed'))
    expect(await validateTextureFile(fileOf('broken.png', PNG_BYTES, 'image/png'))).toBe(
      messages.textureFileCorruptError
    )
  })

  it('rejects a decoder result with no pixels', async () => {
    stubDecoder({ width: 0, height: 0 })
    expect(await validateTextureFile(fileOf('empty.png', PNG_BYTES, 'image/png'))).toBe(
      messages.textureFileCorruptError
    )
  })

  it('rejects an image past the GPU dimension cap, on either edge', async () => {
    stubDecoder({ width: MAX_TEXTURE_DIMENSION + 1, height: 16 })
    expect(await validateTextureFile(fileOf('wide.png', PNG_BYTES, 'image/png'))).toBe(
      messages.textureFileTooLargeDimensions(MAX_TEXTURE_DIMENSION)
    )

    stubDecoder({ width: 16, height: MAX_TEXTURE_DIMENSION + 1 })
    expect(await validateTextureFile(fileOf('tall.png', PNG_BYTES, 'image/png'))).toBe(
      messages.textureFileTooLargeDimensions(MAX_TEXTURE_DIMENSION)
    )
  })

  it('accepts an image exactly at the cap, and frees the decoded pixels', async () => {
    const close = stubDecoder({ width: MAX_TEXTURE_DIMENSION, height: MAX_TEXTURE_DIMENSION })
    expect(await validateTextureFile(fileOf('big.png', PNG_BYTES, 'image/png'))).toBeNull()
    // A 10 MB JPEG expands to far more in memory; only the dimensions are wanted.
    expect(close).toHaveBeenCalled()
  })

  it('does not run the decode at all when the file is unreadable', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)
    const file = fileOf('gone.png', PNG_BYTES, 'image/png')
    // The volume went away between the picker and here.
    file.slice = () => {
      throw new DOMException('NotReadableError')
    }
    expect(await validateTextureFile(file)).toBe(messages.textureFileUnreadable)
    expect(decode).not.toHaveBeenCalled()
  })

  it('passes a good file when the runtime has no decoder, rather than failing shut', async () => {
    // A missing API must never reject every upload — the earlier checks still ran.
    vi.stubGlobal('createImageBitmap', undefined)
    expect(await validateTextureFile(fileOf('a.png', PNG_BYTES, 'image/png'))).toBeNull()
  })
})


// ── EXIF orientation ─────────────────────────────────────────────────────────
// A phone JPEG stores its rotation as a tag instead of rotating the pixels. An
// <img> honours it; WebGL does not — so the same file looks upright in the upload
// preview and sideways on the 3D surface.

// Build the smallest JPEG that carries an EXIF orientation tag: SOI, an APP1
// segment holding a TIFF header with one IFD entry (0x0112), then EOI.
const jpegWithOrientation = (orientation: number, littleEndian = true): Uint8Array<ArrayBuffer> => {
  const tiff: number[] = []
  const u16 = (n: number): void => {
    if (littleEndian) tiff.push(n & 0xff, (n >> 8) & 0xff)
    else tiff.push((n >> 8) & 0xff, n & 0xff)
  }
  const u32 = (n: number): void => {
    if (littleEndian) tiff.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff)
    else tiff.push((n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff)
  }
  tiff.push(...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d])) // 'II' or 'MM'
  u16(42) // TIFF magic
  u32(8) // IFD0 starts right after this header
  u16(1) // one entry
  u16(0x0112) // Orientation
  u16(3) // type SHORT
  u32(1) // count
  u16(orientation)
  u16(0) // pad the 4-byte value slot

  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff] // "Exif\0\0" + TIFF
  const length = exif.length + 2 // the length field counts itself
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, // APP1
    ...exif,
    0xff, 0xd9 // EOI
  ])
}

describe('readJpegOrientation', () => {
  it('reads the tag from a little-endian and a big-endian JPEG', () => {
    expect(readJpegOrientation(jpegWithOrientation(6))).toBe(6)
    expect(readJpegOrientation(jpegWithOrientation(8, false))).toBe(8)
    expect(readJpegOrientation(jpegWithOrientation(1))).toBe(1)
  })

  it('returns null for a JPEG with no EXIF, and for a PNG', () => {
    // SOI, a comment segment, EOI — a valid JPEG carrying no APP1.
    expect(
      readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x03, 0x00, 0xff, 0xd9]))
    ).toBeNull()
    expect(readJpegOrientation(new Uint8Array(PNG_BYTES))).toBeNull()
  })

  it('refuses to loop or over-read on malformed input', () => {
    expect(readJpegOrientation(new Uint8Array([]))).toBeNull()
    expect(readJpegOrientation(new Uint8Array([0xff, 0xd8]))).toBeNull()
    // A zero-length segment would otherwise advance the cursor by nothing.
    expect(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00]))).toBeNull()
    // Out-of-range tag values aren't orientations.
    expect(readJpegOrientation(jpegWithOrientation(9))).toBeNull()
    // EXIF that claims an IFD past the end of the data.
    expect(
      readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]))
    ).toBeNull()
  })
})

describe('normalizeImageOrientation', () => {
  const jpegFile = (bytes: BlobPart, name = 'photo.jpg'): File =>
    new File([bytes], name, { type: 'image/jpeg' })

  it('returns the original file when there is nothing to correct', async () => {
    // Upright, so a re-encode would cost quality for no benefit.
    const upright = jpegFile(jpegWithOrientation(1))
    expect(await normalizeImageOrientation(upright)).toBe(upright)

    // A PNG can't carry EXIF orientation at all.
    const png = new File([new Uint8Array(PNG_BYTES)], 'a.png', { type: 'image/png' })
    expect(await normalizeImageOrientation(png)).toBe(png)
  })

  it('returns the original file when the runtime cannot re-encode', async () => {
    // A rotated texture is a far smaller problem than a pick that refuses to work,
    // so every failure path hands back what it was given.
    vi.stubGlobal('createImageBitmap', undefined)
    const rotated = jpegFile(jpegWithOrientation(6))
    expect(await normalizeImageOrientation(rotated)).toBe(rotated)
  })

  it('re-encodes a rotated JPEG, keeping its name', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 40, height: 20, close }))
    )
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) =>
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }))
    )

    const rotated = jpegFile(jpegWithOrientation(6), 'tilted.jpg')
    const out = await normalizeImageOrientation(rotated)

    expect(out).not.toBe(rotated)
    expect(out.name).toBe('tilted.jpg')
    expect(out.type).toBe('image/jpeg')
    expect(drawImage).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

// ── Spectral data ────────────────────────────────────────────────────────────

describe('validateSpectralFile', () => {
  const xmlFile = (body: BlobPart, name = 'leaf.xml'): File =>
    new File([body], name, { type: 'text/xml' })

  it('accepts a real spectral library', async () => {
    const body = '<helios>\n<globaldata_vec2 label="leaf">350.0\t0.11</globaldata_vec2>\n</helios>'
    expect(await validateSpectralFile(xmlFile(body))).toBeNull()
  })

  it('rejects a renamed archive — the case the extension check missed', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
    expect(await validateSpectralFile(xmlFile(zip))).toBe(messages.spectralFileContentError)
  })

  it('rejects XML that is merely malformed, and an empty file', async () => {
    expect(await validateSpectralFile(xmlFile('<helios><unclosed></helios>'))).toBe(
      messages.spectralFileContentError
    )
    expect(await validateSpectralFile(xmlFile(''))).toBe(messages.spectralFileContentError)
  })

  it('still enforces extension and size, and does so before reading', async () => {
    expect(await validateSpectralFile(xmlFile('<a/>', 'leaf.txt'))).toBe(
      messages.spectralFileTypeError
    )
    const big = xmlFile('<a/>')
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 })
    expect(await validateSpectralFile(big)).toBe(messages.spectralFileSizeError)
  })

  it('reports an unreadable file as such, not as bad XML', async () => {
    const gone = xmlFile('<a/>')
    gone.text = () => Promise.reject(new DOMException('NotReadableError'))
    expect(await validateSpectralFile(gone)).toBe(messages.spectralFileUnreadable)
  })
})

describe('isWellFormedXml', () => {
  it('separates parseable XML from everything else', () => {
    expect(isWellFormedXml('<helios><a/></helios>')).toBe(true)
    expect(isWellFormedXml('<?xml version="1.0"?><helios/>')).toBe(true)
    expect(isWellFormedXml('')).toBe(false)
    expect(isWellFormedXml('   ')).toBe(false)
    expect(isWellFormedXml('not xml at all')).toBe(false)
    expect(isWellFormedXml('<a><b></a>')).toBe(false)
  })
})


// ── Spectral STRUCTURE ───────────────────────────────────────────────────────
// Not a guess at the schema: these are the cases helios-core's Context::loadXML
// hard-errors on. A file that gets past the backend (which checks only the .xml
// extension) fails inside a simulation, where nothing points back at the upload.

describe('validateSpectralXml', () => {
  const parse = (xml: string): Document =>
    new DOMParser().parseFromString(xml, 'application/xml')

  const spectrum = (label: string, body: string): string =>
    `<globaldata_vec2 label="${label}">${body}</globaldata_vec2>`

  it('accepts a real spectral library shape', () => {
    const xml = `<helios>${spectrum('grape_leaf', '350.0\t0.11880\n351.0\t0.10533')}</helios>`
    expect(validateSpectralXml(parse(xml))).toBeNull()
  })

  it('rejects XML that is valid but is not a Helios file', () => {
    // "XML file must have tag '<helios> ... </helios>' bounding all other tags"
    expect(validateSpectralXml(parse('<data><a>1</a></data>'))).toBe(messages.spectralRootError)
    expect(validateSpectralXml(parse('<note>hello</note>'))).toBe(messages.spectralRootError)
  })

  it('rejects a Helios file carrying no spectra', () => {
    // Loads without error and contributes nothing — worse than failing, because
    // the material then LOOKS configured.
    expect(validateSpectralXml(parse('<helios></helios>'))).toBe(messages.spectralNoDataError)
    expect(validateSpectralXml(parse('<helios><globaldata_double label="x">1</globaldata_double></helios>'))).toBe(
      messages.spectralNoDataError
    )
  })

  it('only counts spectra that are DIRECT children, as the loader does', () => {
    // `helios.child("globaldata_vec2")` does not search descendants, so a nested
    // block is data Helios will never read.
    const nested = `<helios><wrapper>${spectrum('buried', '1 2')}</wrapper></helios>`
    expect(validateSpectralXml(parse(nested))).toBe(messages.spectralNoDataError)
  })

  it('rejects an empty data block, naming which one', () => {
    // parse_data_vec2 returns 1 for empty content → "contained invalid data".
    expect(validateSpectralXml(parse(`<helios>${spectrum('leaf', '')}</helios>`))).toBe(
      messages.spectralDataEmpty('leaf')
    )
    expect(validateSpectralXml(parse(`<helios>${spectrum('leaf', '   \n  ')}</helios>`))).toBe(
      messages.spectralDataEmpty('leaf')
    )
  })

  it('rejects non-numeric values, naming which spectrum', () => {
    // parse_data_vec2 returns 2 when a token isn't a float.
    const xml = `<helios>${spectrum('good', '1 2')}${spectrum('bad', '350.0 abc')}</helios>`
    expect(validateSpectralXml(parse(xml))).toBe(messages.spectralDataInvalid('bad'))
  })

  it('tolerates what the loader tolerates', () => {
    // An odd token count: the C++ accepts it, so refusing here would block a file
    // that loads. Same for a missing label and for scientific notation.
    expect(validateSpectralXml(parse(`<helios>${spectrum('odd', '1 2 3')}</helios>`))).toBeNull()
    expect(
      validateSpectralXml(parse('<helios><globaldata_vec2>1 2</globaldata_vec2></helios>'))
    ).toBeNull()
    expect(validateSpectralXml(parse(`<helios>${spectrum('sci', '3.5e2 1.1e-3')}</helios>`))).toBeNull()
  })
})
