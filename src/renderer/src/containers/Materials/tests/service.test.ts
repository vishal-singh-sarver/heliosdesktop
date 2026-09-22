import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the HTTP seam so we can feed listMaterials arbitrary (including malformed)
// backend payloads without a network.
const get = vi.fn()
const uploadFile = vi.fn()
const del = vi.fn()
vi.mock('utils/api', () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    uploadFile: (...a: unknown[]) => uploadFile(...a),
    delete: (...a: unknown[]) => del(...a)
  }
}))

import {
  deleteMaterialFile,
  listMaterials,
  sanitizeUploadFileName,
  uploadSpectralFile,
  uploadTextureFile
} from '../service'

beforeEach(() => {
  get.mockReset()
  uploadFile.mockReset()
  del.mockReset()
})

describe('listMaterials — one malformed group must not blank the whole list', () => {
  // A well-formed group as the backend sends it (snake_case wire shape).
  const good = (id: number, name: string, created: string): unknown => ({
    id,
    name,
    material_type_ids: [1],
    material_types: ['Radiation'],
    preview: null,
    created_at: created
  })

  it('keeps the good rows when one group is missing its type array', async () => {
    // Glass is missing material_type_ids entirely — the field the mapping reads.
    const glass = {
      id: 2,
      name: 'Glass',
      material_types: [],
      preview: null,
      created_at: '2026-06-02'
    }
    get.mockResolvedValue({
      groups: [good(1, 'Concrete', '2026-06-01'), glass, good(3, 'Brick', '2026-06-03')]
    })

    const result = await listMaterials()

    // All three survive — Glass degrades to a blank type instead of throwing.
    expect(result.map((m) => m.name)).toEqual(['Concrete', 'Glass', 'Brick'])
    const glassRow = result.find((m) => m.name === 'Glass')!
    expect(glassRow.materialTypeId).toBe(0)
    expect(glassRow.materialType).toBe('')
  })

  it('does not throw when a group is missing its created_at timestamp', async () => {
    const noDate = {
      id: 5,
      name: 'Undated',
      material_type_ids: [1],
      material_types: ['Radiation'],
      preview: null
      // created_at omitted
    }
    get.mockResolvedValue({ groups: [good(1, 'Concrete', '2026-06-01'), noDate] })

    // The sort must not blow up on the missing timestamp.
    await expect(listMaterials()).resolves.toHaveLength(2)
  })

  it('tolerates an entirely absent groups array', async () => {
    get.mockResolvedValue({})
    await expect(listMaterials()).resolves.toEqual([])
  })
})

// macOS names screenshots with U+202F (narrow no-break space) before AM/PM, not
// an ordinary space. Those three bytes (e2 80 af) have to survive the upload AND
// every later `?path=…` fetch of the texture; anything on that route that isn't
// byte-exact about UTF-8 mangles them, and the texture never renders. Names are
// made ASCII-safe before the file is sent.
describe('sanitizeUploadFileName', () => {
  it('replaces the narrow no-break space and drops the trailing AM/PM', () => {
    const macName = `Screenshot 2026-07-21 at 2.07.21\u202fPM.png`
    // Guard the fixture itself: this is the exact byte sequence being defended
    // against, so a normal space here would make the test prove nothing.
    expect(macName).toContain('\u202f')
    expect(sanitizeUploadFileName(macName)).toBe('Screenshot_2026-07-21_at_2.07.21.png')
  })

  it('strips accents to their base letters rather than blanking them', () => {
    // Composed and macOS-style decomposed forms both land on the same name.
    expect(sanitizeUploadFileName('caf\u00e9.png')).toBe('cafe.png')
    expect(sanitizeUploadFileName('cafe\u0301.png')).toBe('cafe.png')
  })

  it('collapses unsafe runs and trims the edges', () => {
    expect(sanitizeUploadFileName('my   photo (1) .PNG')).toBe('my_photo_1.png')
  })

  it('falls back to a usable name when nothing survives', () => {
    expect(sanitizeUploadFileName('\u65e5\u672c\u8a9e.png')).toBe('texture.png')
  })

  it('only drops a TRAILING meridiem token, never one inside a real name', () => {
    expect(sanitizeUploadFileName('spam.png')).toBe('spam.png')
    expect(sanitizeUploadFileName('am.png')).toBe('am.png')
    expect(sanitizeUploadFileName('pm_texture.png')).toBe('pm_texture.png')
    // Lower-case and hyphen-separated forms go too.
    expect(sanitizeUploadFileName('shot 3.04.11 am.jpg')).toBe('shot_3.04.11.jpg')
  })

  it('leaves an already-safe name completely alone', () => {
    expect(sanitizeUploadFileName('grass.png')).toBe('grass.png')
    expect(sanitizeUploadFileName('dirt-2_v3.jpg')).toBe('dirt-2_v3.jpg')
  })
})

// Radiation's spectral file uses its OWN endpoint (POST …/spectral) rather than
// the generic per-property file one, and answers { success, path } — the caller
// stages that path and the member's next Save writes it.
// The generic file upload (Visualiser texture) answers { success, property,
// path } — the caller must read `path`, NOT `value`. Reading the wrong field
// dropped the URL to `undefined`, so the card never staged a texture and its
// Save stayed disabled.
describe('uploadTextureFile', () => {
  const file = new File(['png'], 'grass.png', { type: 'image/png' })

  it('sends a renamed copy when the picked name needs sanitising', async () => {
    uploadFile.mockResolvedValue({ path: 'uploads/groups/50/Screenshot_2026-07-21_at_2.07.21.png' })
    const macFile = new File(['png'], `Screenshot 2026-07-21 at 2.07.21\u202fPM.png`, {
      type: 'image/png'
    })
    await uploadTextureFile('50', 7, macFile, null)

    const [, sent] = uploadFile.mock.calls[0]
    expect((sent as File).name).toBe('Screenshot_2026-07-21_at_2.07.21.png')
    // Same bytes and type — only the name is rewritten.
    expect((sent as File).type).toBe('image/png')
    expect((sent as File).size).toBe(macFile.size)
  })

  it('returns the stored path from the backend { path } response', async () => {
    uploadFile.mockResolvedValue({
      success: true,
      property: 'texture_file',
      path: 'uploads/groups/50/grass.png'
    })
    await expect(uploadTextureFile('50', 7, file, null)).resolves.toBe(
      'uploads/groups/50/grass.png'
    )
    const [path, sent] = uploadFile.mock.calls[0]
    expect(path).toBe('/api/materials/library/groups/50/files/texture_file')
    expect(sent).toBe(file)
  })
})

describe('uploadSpectralFile', () => {
  const file = new File(['<xml/>'], 'leaf.xml', { type: 'text/xml' })

  it('posts to the dedicated spectral endpoint and returns the stored path', async () => {
    uploadFile.mockResolvedValue({ success: true, path: 'uploads/materials/12/leaf.xml' })
    await expect(uploadSpectralFile('12', 1, file, null)).resolves.toBe(
      'uploads/materials/12/leaf.xml'
    )
    const [path, sent] = uploadFile.mock.calls[0]
    expect(path).toBe('/api/materials/library/groups/12/spectral')
    expect(sent).toBe(file)
  })

  it('carries the scenario id as a query param when there is one', async () => {
    uploadFile.mockResolvedValue({ path: 'p' })
    await uploadSpectralFile('12', 1, file, 's1')
    expect(uploadFile.mock.calls[0][0]).toBe(
      '/api/materials/library/groups/12/spectral?scenario_id=s1'
    )
  })
})

// Deleting an uploaded file (e.g. a replaced/removed spectral file) — the group
// files endpoint with the stored path as an ENCODED query param.
describe('deleteMaterialFile', () => {
  it('DELETEs the group files endpoint with the path url-encoded', async () => {
    del.mockResolvedValue(undefined)
    await deleteMaterialFile('50', 'uploads/groups/50/leaf surface.xml')
    expect(del.mock.calls[0][0]).toBe(
      `/api/materials/library/groups/50/files?path=${encodeURIComponent(
        'uploads/groups/50/leaf surface.xml'
      )}`
    )
  })
})
