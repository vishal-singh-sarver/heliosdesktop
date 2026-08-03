import messages from '../messages'
import {
  hasImageSignature,
  MAX_TEXTURE_BYTES,
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
