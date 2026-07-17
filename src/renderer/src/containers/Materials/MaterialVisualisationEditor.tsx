import ColorPicker, { type ColorPickerFieldControl } from '@renderer/components/ColorPicker'
import React from 'react'
import { useSelector } from 'react-redux'
import { clamp, toChannel, type RgbColor } from 'utils/color'
import type { CatalogPropertyDatatype } from 'containers/ProjectScreen/types'
import type { ResolvedMaterialField, VisualisationMode } from './materialBlueprint'
import messages from './messages'
import { selectRecentColors } from './selectors'
import TextureSelector from './TextureSelector'

// The body the Visualiser type's card renders instead of plain FormFields: the
// material's visual appearance. Two mutually-exclusive layers —
// "Custom" (an RGB colour + opacity) and "Select Texture" (a texture file). Only
// Custom is live for now; the texture tab is a disabled placeholder.
//
// The number fields (R/G/B/opacity) go through the CARD's own field pipeline
// (onFieldChange/onFieldBlur/fieldError), so their keystroke guards, validation
// and messages are byte-identical to the plain FormFields — the colour area and
// sliders just commit valid values through that same pipeline.

// The visualisation-group property names (the catalog contract, ids 11-15).
const COLOR_R = 'color_r'
const COLOR_G = 'color_g'
const COLOR_B = 'color_b'
const OPACITY = 'opacity'

// Seed the VISUAL controls (area + sliders) when a value is unset — display-only,
// never written back, so an untouched card still saves nothing. The number fields
// stay empty when unset, exactly like the other optional fields.
const DEFAULT_CHANNEL = 128
const DEFAULT_OPACITY = 100

// Parse a stored channel string to a whole 0-255 for the visual controls, falling
// back to the seed when unset or (transiently) out of range.
function readChannel(values: Record<string, string>, key: string): number {
  const raw = values[key]
  return raw === undefined || raw === '' ? DEFAULT_CHANNEL : toChannel(Number(raw))
}

export function MaterialVisualisationEditor({
  values,
  fields,
  fieldError,
  onFieldChange,
  onFieldBlur,
  mode,
  onModeChange,
  selectedPath,
  pendingFileUrl,
  onPickLibrary,
  onClearLibrary,
  onPickFile,
  uploading,
  uploadError
}: {
  values: Record<string, string>
  // The visualisation group's catalog fields (color_r/g/b, opacity, texture_file).
  fields: ResolvedMaterialField[]
  // The card's shared field helpers — reused verbatim so validation matches the
  // plain FormFields.
  fieldError: (field: ResolvedMaterialField) => string | undefined
  onFieldChange: (property: string, next: string, datatype: CatalogPropertyDatatype) => void
  onFieldBlur: (property: string) => void
  // The active appearance mode (the top Custom/Texture tabs), owned by the card so
  // it drives the Save payload.
  mode: VisualisationMode
  onModeChange: (mode: VisualisationMode) => void
  // Texture state (only used in texture mode).
  selectedPath: string | null
  pendingFileUrl?: string
  onPickLibrary: (path: string) => void
  onClearLibrary: () => void
  onPickFile: (file: File) => void
  uploading: boolean
  uploadError?: string
}): React.JSX.Element {
  const recentColors = useSelector(selectRecentColors)

  const fieldByProp = new Map(fields.map((f) => [f.property, f]))

  // Commit a numeric property through the card's guarded change handler (drops
  // invalid input, clears stale guards). Used by both the sliders and the boxes.
  const commit = (property: string, value: string): void => {
    const field = fieldByProp.get(property)
    if (field) onFieldChange(property, value, field.datatype)
  }

  // The FormField-style control for one number box: current text, its error, and
  // the guarded change/blur handlers.
  const control = (property: string): ColorPickerFieldControl => {
    const field = fieldByProp.get(property)
    return {
      value: values[property] ?? '',
      error: field ? fieldError(field) : undefined,
      onChange: (raw) => commit(property, raw),
      onBlur: () => onFieldBlur(property)
    }
  }

  const rgb: RgbColor = {
    r: readChannel(values, COLOR_R),
    g: readChannel(values, COLOR_G),
    b: readChannel(values, COLOR_B)
  }
  const opacityRaw = values[OPACITY]
  const opacity =
    opacityRaw === undefined || opacityRaw === ''
      ? DEFAULT_OPACITY
      : clamp(Math.round(Number(opacityRaw)), 0, 100)

  // A colour is the three channels together, so any area/hue/swatch change commits
  // all three (each through the guarded handler). Opacity is required alongside a
  // colour, so the first colour also defines the default 100% — the slider already
  // sits there, and it means picking a colour yields a complete, saveable state.
  const handleColor = (next: RgbColor): void => {
    commit(COLOR_R, String(next.r))
    commit(COLOR_G, String(next.g))
    commit(COLOR_B, String(next.b))
    if ((values[OPACITY] ?? '') === '') commit(OPACITY, String(DEFAULT_OPACITY))
  }
  const handleOpacity = (next: number): void => {
    commit(OPACITY, String(next))
  }

  const tabClass = (active: boolean): string =>
    `flex-1 border-b-2 pb-2 text-center text-sm transition-colors ${
      active
        ? 'border-blue-500 text-blue-400'
        : 'border-transparent text-neutral-400 hover:text-neutral-200'
    }`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-pressed={mode === 'custom'}
          onClick={() => onModeChange('custom')}
          className={tabClass(mode === 'custom')}
        >
          {messages.visualisationCustomTab}
        </button>
        <button
          type="button"
          aria-pressed={mode === 'texture'}
          onClick={() => onModeChange('texture')}
          className={tabClass(mode === 'texture')}
        >
          {messages.visualisationTextureTab}
        </button>
      </div>

      {mode === 'custom' ? (
        <ColorPicker
          rgb={rgb}
          opacity={opacity}
          recentColors={recentColors}
          onChangeColor={handleColor}
          onChangeOpacity={handleOpacity}
          channelFields={{ r: control(COLOR_R), g: control(COLOR_G), b: control(COLOR_B) }}
          opacityField={control(OPACITY)}
          labels={{
            rgbValues: messages.rgbValues,
            opacity: messages.opacityLabel,
            usedColors: messages.usedColors,
            colorArea: messages.colorAreaLabel,
            hueSlider: messages.hueSliderLabel,
            opacitySlider: messages.opacitySliderLabel,
            swatch: messages.usedColorSwatch
          }}
        />
      ) : (
        <TextureSelector
          selectedPath={selectedPath}
          pendingFileUrl={pendingFileUrl}
          onPickLibrary={onPickLibrary}
          onClearLibrary={onClearLibrary}
          onPickFile={onPickFile}
          uploading={uploading}
          uploadError={uploadError}
        />
      )}
    </div>
  )
}

export default MaterialVisualisationEditor
