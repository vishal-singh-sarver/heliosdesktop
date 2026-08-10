import deleteIcon from '@renderer/assets/delete.svg'
import fileIcon from '@renderer/assets/file.svg'
import FormField from '@renderer/components/FormField'
import React from 'react'
import type { CatalogPropertyDatatype } from 'containers/ProjectScreen/types'
import { trimText } from 'utils/trimText'
import { showFullTextOnHover } from 'utils/truncationTooltip'
import {
  RADIATION_BANDS,
  radiationBandProperties,
  radiationBandSumViolations,
  radiationHeaderFields,
  SPECTRAL_DATA_PROPERTY,
  type ResolvedMaterialField
} from './materialBlueprint'
import messages from './messages'
import { SPECTRAL_ACCEPT_ATTR, validateSpectralFile } from './validation'

// The body the Radiation type's card renders instead of the plain field grid: the
// curated specular / Heat-Transfer fields, an "Apply spectral data" toggle, the
// spectral-data file control, and the PAR/NIR/LW per-band optics grid.
//
// Its number/enum fields go through the CARD's own field pipeline
// (onFieldChange/onFieldBlur/fieldError), so their keystroke guards, validation
// and messages are identical to the plain FormFields. The toggle drives which side
// Save persists (manual bands vs a spectral file); the band inputs disable while a
// spectral file supersedes them.

// Spectral upload constraints (XML only, at most 5 MB, and it must actually PARSE
// as XML) live in ./validation, so they can be unit-tested without a DOM and stay
// in one place next to the texture rules.

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
// "leaf.xml"). Splits on BOTH separators: a Windows backend stores native paths
// with '\', which have no '/' to split on, so the whole path would be shown.
const basename = (path: string): string => path.split(/[\\/]/).pop() ?? path

// How much of a field's name its placeholder can show — same two-column grid in
// the same 340px panel as the plain material fields, so the same budget. See
// MaterialPropertiesForm's PLACEHOLDER_CHARS for where the number comes from.
const PLACEHOLDER_CHARS = 15

export function MaterialRadiationEditor({
  idPrefix,
  values,
  fields,
  fieldError,
  onFieldChange,
  onFieldBlur,
  applySpectral,
  onToggleSpectral,
  uploading,
  uploadError,
  onPickSpectralFile,
  onClearSpectral,
  spectrumFields,
  spectrumLabels
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
  uploading: boolean
  // A failed upload's message (rendered under the control).
  uploadError?: string | null
  onPickSpectralFile: (file: File) => void
  onClearSpectral: () => void
  // The catalog's gated "Spectrum" group — which curve inside the uploaded file
  // this material uses. Passed in rather than picked out of `fields` because the
  // backend decides what belongs to the spectral side; whatever arrives here is
  // rendered, so a third choice added later needs no change in this file.
  spectrumFields: ResolvedMaterialField[]
  // The labels the stored file actually holds — the pickers' options. Empty until
  // a file is uploaded, or when it can't be read.
  spectrumLabels: string[]
}): React.JSX.Element {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)

  // Both the top-level fields and the spectrum group's, so renderField can draw
  // either by property name.
  const fieldByProp = React.useMemo(
    () => new Map([...fields, ...spectrumFields].map((f) => [f.property, f])),
    [fields, spectrumFields]
  )

  // Band fields whose reflectivity + transmissivity + emissivity exceed 1 — every
  // field of an offending band shows the same tooltip (Save is gated on this too,
  // in the parent card). Only in MANUAL mode: spectral mode disables the bands and
  // erases their values on save, so the sum rule doesn't apply there.
  const bandSumViolations = applySpectral
    ? new Set<string>()
    : radiationBandSumViolations(values)

  // One catalog field as a FormField wired to the card pipeline. `label` overrides
  // the catalog label (e.g. the band grid shows "Reflectivity", not "Reflectivity
  // PAR"); `disabled` greys a band while a spectral file supersedes it.
  const renderField = (
    property: string,
    opts?: { label?: string; disabled?: boolean; options?: { value: string; label: string }[] }
  ): React.JSX.Element | null => {
    const field = fieldByProp.get(property)
    if (!field) return null
    const label = opts?.label ?? field.label
    const disabled = opts?.disabled === true
    return (
      <FormField
        key={property}
        labelProps={{ label, optional: !field.required, helpText: field.description }}
        inputProps={{
          name: `${idPrefix}-${property}`,
          value: values[property] ?? '',
          placeholder:
            field.datatype === 'enum'
              ? messages.selectPlaceholder
              : trimText(label, PLACEHOLDER_CHARS),
          // Per-field validation wins; else the band-sum rule (R+T+E ≤ 1) flags
          // all three of an offending band with the same tooltip.
          //
          // A SUPERSEDED band shows neither. Its box is disabled, so the error is
          // a complaint about something the user is not allowed to fix — and the
          // value is dropped on save anyway (toRadiationProperties), so there is
          // nothing to fix. The value itself stays put: flip the toggle back and
          // both the number and its error are exactly as they were. The band-sum
          // rule already works this way (bandSumViolations is empty in spectral
          // mode); this is the per-field half of the same rule.
          error: disabled
            ? undefined
            : (fieldError(field) ??
              (bandSumViolations.has(property) ? messages.bandSumExceedsOne : undefined)),
          // Surface the validation error as an in-cell info-icon tooltip
          // (matches the Geometry right panel); selects keep the inline message.
          errorAsTooltip: true,
          disabled,
          inputClassName: BAND_INPUT_CLASSES,
          // An explicit list wins: the spectrum choices are catalog `string`
          // fields whose options aren't in the catalog at all — they come from
          // the labels inside the material's own uploaded file.
          options:
            opts?.options ??
            (field.datatype === 'enum' && field.enumValues
              ? field.enumValues.map((v) => ({ value: v, label: v }))
              : undefined),
          onChange: (e) => onFieldChange(property, e.target.value, field.datatype),
          onBlur: () => onFieldBlur(property)
        }}
      />
    )
  }

  const [firstHeader, ...restHeader] = radiationHeaderFields(fields)

  const spectralPath = values[SPECTRAL_DATA_PROPERTY] ?? ''
  // The upload only stores the file and returns its path (the member is written
  // by Save), so it needs nothing but spectral mode being on and no upload already
  // in flight — no save-first requirement.
  const canUpload = applySpectral && !uploading

  // Async: the check parses the file. The backend enforces the .xml EXTENSION and
  // nothing else, so a renamed archive is stored happily and only fails later,
  // inside a simulation, where nothing points back at this upload.
  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked after a clear
    if (!file) return

    const error = await validateSpectralFile(file)
    setFileError(error)
    if (error) return
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

      {/* Apply spectral data toggle. Only the switch itself toggles — the row was
          a full-width <button> (a flex-col child stretches), so clicking anywhere
          in the row flipped it. The label is now a plain, non-clickable span. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={applySpectral}
          aria-label={messages.applySpectralData}
          onClick={onToggleSpectral}
          className={`relative h-4 w-7 shrink-0 rounded-full border-0 p-0 transition-colors ${
            applySpectral ? 'bg-blue-500' : 'bg-neutral-600'
          }`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
              applySpectral ? 'left-3.5' : 'left-0.5'
            }`}
          />
        </button>
        <span className="text-sm text-neutral-200">{messages.applySpectralData}</span>
      </div>

      {/* Spectral data file: a stored file shows its name + remove; otherwise the
          Upload control, enabled only once the material exists on the backend. */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-neutral-300">{messages.spectralDataFile}</p>
        {spectralPath !== '' ? (
          // The mirror image of a superseded band: with the toggle OFF the manual
          // bands are what Save persists and the file is dropped, so the row that
          // holds it greys out and its 🗑 locks. Without this the file read as live
          // and removable while having no effect on anything — the toggle looked
          // like it only governed the bands, when it governs both sides.
          //
          // Same #424242 fill/border the band inputs use when THEY are superseded,
          // so one disabled treatment means one thing throughout the card.
          <div
            className={`flex items-center justify-between rounded border px-3 py-2 ${
              applySpectral ? 'border-app-border bg-[#121212]' : 'border-[#424242] bg-[#424242]'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <img
                src={fileIcon}
                alt=""
                aria-hidden="true"
                // file.svg ships dark (#344054); this row sits on a dark fill, so
                // render it white to stay visible.
                style={{ filter: 'brightness(0) invert(1)' }}
                className="h-4 w-4 shrink-0"
              />
              <span
                className={`truncate text-sm ${applySpectral ? 'text-neutral-200' : 'text-neutral-300'}`}
                onMouseEnter={showFullTextOnHover}
              >
                {basename(spectralPath)}
              </span>
            </span>
            <button
              type="button"
              aria-label={messages.spectralRemove}
              disabled={!applySpectral}
              onClick={onClearSpectral}
              className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <img src={deleteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={SPECTRAL_ACCEPT_ATTR}
              className="hidden"
              disabled={!canUpload}
              onChange={handlePick}
            />
            <button
              type="button"
              disabled={!canUpload}
              onClick={() => fileInputRef.current?.click()}
              // Fixed 123×30 pill. Dark (its original look) while the spectral
              // toggle is OFF; white with the dark upload glyph once ON — the same
              // white treatment as the Visualiser's "Upload File" button.
              className={`flex h-[30px] w-[123px] items-center justify-center gap-1 rounded-[4px] border border-app-border px-[10px] py-[5px] text-sm font-medium disabled:cursor-not-allowed ${
                applySpectral
                  ? 'bg-white text-black hover:opacity-90 disabled:opacity-60'
                  : 'bg-[#121212] text-neutral-200 hover:bg-neutral-800 disabled:opacity-50'
              }`}
            >
              <img
                src={fileIcon}
                alt=""
                aria-hidden="true"
                // White on the dark (toggle-OFF) pill; left dark on the white
                // (toggle-ON) pill, where file.svg's own #344054 already reads.
                style={applySpectral ? undefined : { filter: 'brightness(0) invert(1)' }}
                className="h-4 w-4"
              />
              {uploading ? messages.spectralUploading : messages.spectralUploadButton}
            </button>
          </>
        )}
        {/* Hidden while the toggle is OFF, for the same reason a superseded band
            hides its error: the control it belongs to is inert, so the message
            reports a problem the user cannot act on. It returns with the toggle. */}
        {applySpectral && (fileError || uploadError) && (
          <p className="form-error-text" style={{ color: '#D92D20' }}>
            {fileError ?? uploadError}
          </p>
        )}

        {/* Which spectrum inside the file this material uses. Directly under the
            file because that is what they index into, and greyed with the toggle
            like the file row itself — off, they describe a file that isn't in use.
            Options are the file's own labels, so a value the engine can't resolve
            can't be chosen: an unresolvable label doesn't error, it falls back to
            a reflectivity of 0 and blackens the surface for the whole run.
            A stored choice missing from the current file is added to the list so
            it stays visible and selected rather than silently blanking. */}
        {spectrumFields.map((field) => {
          const current = values[field.property] ?? ''
          const options = spectrumLabels.map((l) => ({ value: l, label: l }))
          if (current !== '' && !spectrumLabels.includes(current)) {
            options.unshift({ value: current, label: messages.spectrumLabelMissing(current) })
          }
          return renderField(field.property, { disabled: !applySpectral, options })
        })}
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
