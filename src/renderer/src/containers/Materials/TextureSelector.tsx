import uploadIcon from '@renderer/assets/Upload.svg'
import React from 'react'
import { showFullTextOnHover } from 'utils/truncationTooltip'
import messages from './messages'
import { listDefaultTextures, textureServeUrl } from './service'
import { normalizeImageOrientation, TEXTURE_ACCEPT_ATTR, validateTextureFile } from './validation'

// The "Select Texture" body of the Visualiser editor: two sub-tabs —
// "From Library" (a grid of the backend's default textures) and "Upload File" (a
// preview + file picker). Both ultimately choose ONE texture: a library pick sets
// the stored path; an upload hands a File up for the parent to POST.
//
// A library texture is identified by its serve `url`; the value we persist in
// `texture_file` is the `path` query param inside that url.

type SubTab = 'library' | 'upload'

// Upload constraints (JPG/JPEG/PNG, at most 10 MB) live in ./validation, so they
// can be unit-tested without a DOM and stay in one place.

interface DefaultTexture {
  name: string
  url: string
}

// Pull the `path` a serve url points at (that's what goes in texture_file).
function servePathOf(url: string): string {
  const q = url.indexOf('?')
  if (q === -1) return url
  return new URLSearchParams(url.slice(q + 1)).get('path') ?? url
}

// Display name without its file extension (e.g. "dirt.jpg" → "dirt").
function displayName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export function TextureSelector({
  selectedPath,
  pendingFileUrl,
  onPickLibrary,
  onPickFile,
  uploading
}: {
  // The library path to highlight: the current pick if there is one, else the
  // texture already stored on the member — so a saved texture still shows which
  // tile it is when the material is reopened. Null when neither applies (or when
  // the stored texture was uploaded, which has no tile in this grid).
  selectedPath: string | null
  // Object URL of a freshly-picked (not-yet-uploaded) file, for the preview.
  // Nothing else: a stored texture's preview is derived below, so that a LIBRARY
  // texture can be told apart from an uploaded one.
  pendingFileUrl?: string
  // Toggle a library texture's highlight (parent clears if it's already the pick).
  // Pressing the highlighted tile again drops the PICK — if the member already has
  // a stored texture, the highlight falls back to that rather than clearing, since
  // the material still carries it until a different one is saved.
  onPickLibrary: (path: string) => void
  onPickFile: (file: File) => void
  uploading: boolean
}): React.JSX.Element {
  const [sub, setSub] = React.useState<SubTab>('library')
  const [textures, setTextures] = React.useState<DefaultTexture[]>([])
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>('loading')
  const [fileError, setFileError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Load the library once on mount (the "From Library" sub-tab is shown first).
  React.useEffect(() => {
    let alive = true
    listDefaultTextures()
      .then((list) => {
        if (alive) {
          setTextures(list)
          setStatus('loaded')
        }
      })
      .catch(() => {
        if (alive) setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [])

  const subClass = (active: boolean): string =>
    `flex-1 rounded border py-1.5 text-center text-sm transition-colors ${
      active
        ? 'border-blue-500 text-blue-400'
        : 'border-app-border text-neutral-400 hover:text-neutral-200'
    }`

  // The Upload preview: a file freshly picked in this tab, else the member's
  // STORED texture — but only when that texture was uploaded. A library pick must
  // never leak in here (the two tabs are independent), and the library list is the
  // only authority on which is which: both kinds are just backend paths, and the
  // library's live under an assets directory the frontend can't hard-code.
  //
  // While the list is still loading we can't classify the stored path, so we show
  // nothing rather than risk flashing a library texture as "your upload". A failed
  // list leaves the library tab unusable anyway, so there we fall back to showing
  // it — better than hiding a genuine upload.
  const storedIsLibrary =
    selectedPath != null && textures.some((t) => servePathOf(t.url) === selectedPath)
  const storedPreview =
    selectedPath != null && !storedIsLibrary && status !== 'loading'
      ? textureServeUrl(selectedPath)
      : undefined
  const previewSrc = pendingFileUrl ?? storedPreview

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again still fires change.
    e.target.value = ''
    if (!file) return

    // Async because the checks read — and decode — the file, rather than trusting
    // its name.
    const error = await validateTextureFile(file)
    setFileError(error)
    if (error) return

    // A phone JPEG carries its rotation as an EXIF tag rather than in the pixels:
    // the preview below honours it, WebGL does not, so the same file would look
    // upright here and sideways on the 3D surface. Bake it in once, here, so every
    // consumer downstream agrees. Returns the original file when there's nothing
    // to correct (the common case) or when the runtime can't do it.
    onPickFile(await normalizeImageOrientation(file))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSub('library')}
          className={subClass(sub === 'library')}
        >
          {messages.textureFromLibraryTab}
        </button>
        <button
          type="button"
          onClick={() => setSub('upload')}
          className={subClass(sub === 'upload')}
        >
          {messages.textureUploadTab}
        </button>
      </div>

      {sub === 'library' ? (
        <div>
          {status === 'loading' && (
            <p className="px-1 py-2 text-sm text-neutral-500">{messages.textureLibraryLoading}</p>
          )}
          {status === 'error' && (
            <p className="form-error-text px-1" style={{ color: '#F04438' }}>
              {messages.textureLibraryError}
            </p>
          )}
          {status === 'loaded' && textures.length === 0 && (
            <p className="px-1 py-2 text-sm text-neutral-500">{messages.textureLibraryEmpty}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {textures.map((t) => {
              const path = servePathOf(t.url)
              const selected = path === selectedPath
              return (
                <button
                  key={t.url}
                  type="button"
                  aria-label={messages.textureSwatch(displayName(t.name))}
                  aria-pressed={selected}
                  // The blue border is the highlight of the current pick, and Save
                  // applies whatever is highlighted. Pressing the tile toggles it.
                  //
                  // It deliberately does NOT clear on blur: the pick is the only
                  // thing that enables Save, and Save sits outside this grid, so
                  // tabbing from a tile to the Save button dropped the selection
                  // and disabled the button on the way — making a library texture
                  // impossible to choose without a pointer.
                  onClick={() => onPickLibrary(path)}
                  className={`flex flex-col gap-1.5 rounded border p-2.5 outline-none ${
                    selected ? 'border-blue-500' : 'border-app-border hover:border-neutral-500'
                  }`}
                >
                  <img
                    src={t.url}
                    alt=""
                    aria-hidden="true"
                    className="h-20 w-full rounded-sm object-cover"
                  />
                  <span
                    className="block w-full truncate text-center text-xs text-neutral-300"
                    onMouseEnter={showFullTextOnHover}
                  >
                    {displayName(t.name)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {/* Preview — the picked/stored image, or a checkerboard placeholder. */}
          <div
            className="h-40 w-full rounded"
            style={
              previewSrc
                ? { background: `center / contain no-repeat url("${previewSrc}")` }
                : {
                    backgroundImage:
                      'conic-gradient(#3a3a3a 0.25turn, #2a2a2a 0.25turn 0.5turn, #3a3a3a 0.5turn 0.75turn, #2a2a2a 0.75turn)',
                    backgroundSize: '16px 16px'
                  }
            }
          >
            {previewSrc && (
              <img
                src={previewSrc}
                alt={messages.texturePreviewAlt}
                className="h-full w-full rounded object-contain"
              />
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={TEXTURE_ACCEPT_ATTR}
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded border border-app-border bg-white px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-60"
          >
            <img src={uploadIcon} alt="" aria-hidden="true" className="h-4 w-4" />
            {uploading ? messages.textureUploading : messages.textureUploadButton}
          </button>
          {fileError && (
            <p className="form-error-text" style={{ color: '#D92D20' }}>
              {fileError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default TextureSelector
