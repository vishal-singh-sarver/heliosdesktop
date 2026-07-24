import deleteIcon from '@renderer/assets/delete.svg'
import uploadIcon from '@renderer/assets/Upload.svg'
import FormField from '@renderer/components/FormField'
import React from 'react'
import type { CatalogPropertyDatatype } from 'containers/ProjectScreen/types'
import {
  RADIATION_BANDS,
  radiationBandProperties,
  radiationHeaderFields,
  SPECTRAL_DATA_PROPERTY,
  type ResolvedMaterialField
} from './materialBlueprint'
import messages from './messages'

// The body the Radiation type's card renders instead of the plain field grid: the
// curated specular / Heat-Transfer fields, an "Apply spectral data" toggle, the
// spectral-data file control, and the PAR/NIR/LW per-band optics grid.
//
// Its number/enum fields go through the CARD's own field pipeline
// (onFieldChange/onFieldBlur/fieldError), so their keystroke guards, validation
// and messages are identical to the plain FormFields. The toggle drives which side
// Save persists (manual bands vs a spectral file); the band inputs disable while a
// spectral file supersedes them.

// Spectral upload constraints: XML only, at most 5 MB. The backend enforces the
// extension but not the size, so the size check is ours — rejecting it here also
// saves pushing a large file over the wire just to have it refused.
const ACCEPT_ATTR = '.xml'
const MAX_SPECTRAL_BYTES = 5 * 1024 * 1024

// A band field greyed out because a spectral file supersedes it. FormField gives a
// disabled INPUT no styling of its own (only its <select> branch fades), so the
// box would otherwise read as editable while rejecting every keystroke. Scoped
// here rather than in FormField so no other form's inputs change appearance.
//
// ONLY the input element is restyled — the label, its help icon, the band heading
// and the card background are all untouched. The enabled fill is #121212 (near
// black) and the disabled one is #424242, far enough apart to read at a glance
// (an earlier #1a1a1a sat 8 hex points from #121212 and looked like no change at
// all). Not opacity either — on this dark theme that washes the box toward the
// card colour instead of reading as an inert field. The border matches the fill
// so the disabled box reads as one flat block rather than an outlined input.
//
// The `disabled:` variants carry a pseudo-class, so they outrank the base
// bg/border/text utilities and stay inert while the field is editable.
const BAND_INPUT_CLASSES =
  'bg-[#121212] disabled:bg-[#424242] disabled:border-[#424242] disabled:text-neutral-300 disabled:placeholder-neutral-400 disabled:cursor-not-allowed'

// The filename shown for a stored spectral path ("uploads/materials/8/leaf.xml" →
// "leaf.xml").
const basename = (path: string): string => path.split('/').pop() ?? path

export function MaterialRadiationEditor({
  idPrefix,
  values,
  fields,
  fieldError,
  onFieldChange,
  onFieldBlur,
  applySpectral,
  onToggleSpectral,
  saved,
  uploading,
  uploadError,
  onPickSpectralFile,
  onClearSpectral
}: {
  // Namespaces the field inputs' ids/names so two cards don't collide.
  idPrefix: number
  values: Record<string, string>
  // The Radiation type's resolved top-level fields (specular, heat, bands, …).
  fields: ResolvedMaterialField[]
  fieldError: (field: ResolvedMaterialField) => string | undefined
  onFieldChange: (property: string, next: string, datatype: CatalogPropertyDatatype) => void
  onFieldBlur: (property: string) => void
  // "Apply spectral data": ON = a spectral file supersedes the per-band inputs.
  applySpectral: boolean
  onToggleSpectral: () => void
  // Whether the member exists on the backend yet — the spectral upload needs it,
  // because the file endpoint only auto-creates a member for a Visualiser texture.
  saved: boolean
  uploading: boolean
  // A failed upload's message (rendered under the control).
  uploadError?: string | null
  onPickSpectralFile: (file: File) => void
  onClearSpectral: () => void
}): React.JSX.Element {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)

  const fieldByProp = React.useMemo(
    () => new Map(fields.map((f) => [f.property, f])),
    [fields]
  )

  // One catalog field as a FormField wired to the card pipeline. `label` overrides
  // the catalog label (e.g. the band grid shows "Reflectivity", not "Reflectivity
  // PAR"); `disabled` greys a band while a spectral file supersedes it.
  const renderField = (
    property: string,
    opts?: { label?: string; disabled?: boolean }
  ): React.JSX.Element | null => {
    const field = fieldByProp.get(property)
    if (!field) return null
    const label = opts?.label ?? field.label
    return (
      <FormField
        key={property}
        labelProps={{ label, optional: true, helpText: field.description }}
        inputProps={{
          name: `${idPrefix}-${property}`,
          value: values[property] ?? '',
          placeholder: field.datatype === 'enum' ? messages.selectPlaceholder : label,
          error: fieldError(field),
          disabled: opts?.disabled,
          inputClassName: BAND_INPUT_CLASSES,
          options:
            field.datatype === 'enum' && field.enumValues
              ? field.enumValues.map((v) => ({ value: v, label: v }))
              : undefined,
          onChange: (e) => onFieldChange(property, e.target.value, field.datatype),
          onBlur: () => onFieldBlur(property)
        }}
      />
    )
  }

  const [firstHeader, ...restHeader] = radiationHeaderFields(fields)

  const spectralPath = values[SPECTRAL_DATA_PROPERTY] ?? ''
  // The upload endpoint only attaches to an existing member (unlike the texture
  // one), so the control waits until the material has been saved once.
  const canUpload = applySpectral && saved && !uploading

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked after a clear
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xml')) {
      setFileError(messages.spectralFileTypeError)
      return
    }
    if (file.size > MAX_SPECTRAL_BYTES) {
      setFileError(messages.spectralFileSizeError)
      return
    }
    setFileError(null)
    onPickSpectralFile(file)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Specular exponent full width, then Specular scale | Heat Transfer Flag. */}
      {firstHeader && renderField(firstHeader.property)}
      {restHeader.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {restHeader.map((f) => renderField(f.property))}
        </div>
      )}

      {/* Apply spectral data toggle. */}
      <button
        type="button"
        role="switch"
        aria-checked={applySpectral}
        onClick={onToggleSpectral}
        className="flex items-center gap-2 text-left"
      >
        <span
          className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
            applySpectral ? 'bg-blue-500' : 'bg-neutral-600'
          }`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
              applySpectral ? 'left-3.5' : 'left-0.5'
            }`}
          />
        </span>
        <span className="text-sm text-neutral-200">{messages.applySpectralData}</span>
      </button>

      {/* Spectral data file: a stored file shows its name + remove; otherwise the
          Upload control, enabled only once the material exists on the backend. */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-neutral-300">{messages.spectralDataFile}</p>
        {spectralPath !== '' ? (
          <div className="flex items-center justify-between rounded border border-app-border bg-[#121212] px-3 py-2">
            <span className="truncate text-sm text-neutral-200">{basename(spectralPath)}</span>
            <button
              type="button"
              aria-label={messages.spectralRemove}
              onClick={onClearSpectral}
              className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50"
            >
              <img src={deleteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              disabled={!canUpload}
              onChange={handlePick}
            />
            <button
              type="button"
              disabled={!canUpload}
              title={applySpectral && !saved ? messages.spectralSaveFirst : undefined}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 items-center justify-center gap-2 rounded border border-app-border bg-[#121212] text-sm text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <img src={uploadIcon} alt="" aria-hidden="true" className="h-4 w-4" />
              {uploading ? messages.spectralUploading : messages.spectralUploadButton}
            </button>
            {applySpectral && !saved && (
              <p className="text-xs text-neutral-500">{messages.spectralSaveFirst}</p>
            )}
          </>
        )}
        {(fileError || uploadError) && (
          <p className="form-error-text" style={{ color: '#D92D20' }}>
            {fileError ?? uploadError}
          </p>
        )}
      </div>

      {/* PAR / NIR / LW per-band optics. Disabled while a spectral file supersedes
          them. */}
      {RADIATION_BANDS.map((band) => {
        const [refl, trans, emis] = radiationBandProperties(band)
        return (
          <div key={band} className="flex flex-col gap-2.5">
            <p className="text-[13px] font-medium leading-[20px] text-[#D3D3D3]">{band}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {renderField(refl, { label: messages.bandReflectivity, disabled: applySpectral })}
              {renderField(trans, { label: messages.bandTransmissivity, disabled: applySpectral })}
            </div>
            {renderField(emis, { label: messages.bandEmissivity, disabled: applySpectral })}
          </div>
        )
      })}
    </div>
  )
}

export default MaterialRadiationEditor
