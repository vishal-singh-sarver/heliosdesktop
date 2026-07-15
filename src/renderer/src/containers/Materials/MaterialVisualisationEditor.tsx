import ColorPicker from '@renderer/components/ColorPicker'
import React from 'react'
import { useSelector } from 'react-redux'
import { clamp, toChannel, type RgbColor } from 'utils/color'
import messages from './messages'
import { selectRecentColors } from './selectors'

// The body a "visualisation"-group parameter-group card renders instead of plain
// FormFields: the material's visual appearance. Two mutually-exclusive layers —
// "Custom" (an RGB colour + opacity) and "Select Texture" (a texture file). Only
// Custom is live for now; the texture tab is a disabled placeholder.
//
// The card keeps every value as a string keyed by catalog property name; this
// component adapts those strings to/from the ColorPicker's numeric model and
// writes changes back through the same per-card `onChangeValue` the FormFields
// use — so the existing Save path serialises the colour with no new plumbing.

// The visualisation-group property names (the catalog contract, ids 11-15).
const COLOR_R = 'color_r'
const COLOR_G = 'color_g'
const COLOR_B = 'color_b'
const OPACITY = 'opacity'

// Seed the picker UI when a channel is unset. This is display-only — it is NOT
// written back, so nothing saves until the user actually picks a colour.
const DEFAULT_CHANNEL = 128
const DEFAULT_OPACITY = 100

type Tab = 'custom' | 'texture'

// Parse a stored channel string to a whole 0-255, falling back to the seed.
function readChannel(values: Record<string, string>, key: string): number {
  const raw = values[key]
  return raw === undefined || raw === '' ? DEFAULT_CHANNEL : toChannel(Number(raw))
}

export function MaterialVisualisationEditor({
  values,
  onChangeValue
}: {
  values: Record<string, string>
  onChangeValue: (property: string, value: string) => void
}): React.JSX.Element {
  const recentColors = useSelector(selectRecentColors)
  const [tab, setTab] = React.useState<Tab>('custom')

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

  // Any colour change writes all three channels — a colour is the three together,
  // and the first interaction is what commits them (before that they stay unset,
  // so an untouched card saves nothing).
  const handleColor = (next: RgbColor): void => {
    onChangeValue(COLOR_R, String(next.r))
    onChangeValue(COLOR_G, String(next.g))
    onChangeValue(COLOR_B, String(next.b))
  }
  const handleOpacity = (next: number): void => {
    onChangeValue(OPACITY, String(next))
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
          aria-pressed={tab === 'custom'}
          onClick={() => setTab('custom')}
          className={tabClass(tab === 'custom')}
        >
          {messages.visualisationCustomTab}
        </button>
        {/* Texture selection is not built yet — the tab is shown (to match the
            final layout) but disabled. */}
        <button
          type="button"
          aria-pressed={tab === 'texture'}
          disabled
          title={messages.visualisationTextureComingSoon}
          className={`${tabClass(false)} cursor-not-allowed opacity-50`}
        >
          {messages.visualisationTextureTab}
        </button>
      </div>

      {tab === 'custom' && (
        <ColorPicker
          rgb={rgb}
          opacity={opacity}
          recentColors={recentColors}
          onChangeColor={handleColor}
          onChangeOpacity={handleOpacity}
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
      )}
    </div>
  )
}

export default MaterialVisualisationEditor
