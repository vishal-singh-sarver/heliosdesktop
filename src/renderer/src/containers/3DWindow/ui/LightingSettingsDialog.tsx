import React, { useEffect, useRef, useState } from 'react'
import type { LightingSettings } from './SceneLighting'

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-600 focus:border-sky-400 focus:outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

function NumInput({
  value,
  onChange,
  min,
  max,
  step,
  className: extraClass
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  className?: string
}): React.JSX.Element {
  const [text, setText] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(String(value))
  }, [value])

  function commit(): void {
    const n = parseFloat(text)
    if (!isNaN(n)) {
      const clamped = clamp(n, min, max)
      onChange(clamped)
      setText(String(clamped))
    } else {
      setText(String(value))
    }
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => {
        const el = e.target
        setTimeout(() => el.select(), 0)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      className={`${inputClass} ${extraClass ?? ''}`}
      min={min}
      max={max}
      step={step}
    />
  )
}

function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (v: number) => void
}): React.JSX.Element {
  const [text, setText] = useState(value.toFixed(3))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(value.toFixed(3))
  }, [value])

  function commit(): void {
    const n = parseFloat(text)
    if (!isNaN(n)) {
      const clamped = clamp(n, 0, 1)
      onChange(clamped)
      setText(clamped.toFixed(3))
    } else {
      setText(value.toFixed(3))
    }
  }

  return (
    <div className="flex items-center gap-1">
      <span className="w-3 text-xs text-neutral-500">{label}</span>
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        max="1"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          const el = e.target
          setTimeout(() => el.select(), 0)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-xs text-white focus:border-sky-400 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  )
}

interface LightingSettingsDialogProps {
  settings: LightingSettings
  onChange: (patch: Partial<LightingSettings>) => void
  onClose: () => void
}

export function LightingSettingsDialog({
  settings,
  onChange,
  onClose
}: LightingSettingsDialogProps): React.JSX.Element {
  const { r, g, b } = settings.lightColor
  const swatchCss = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pointer-events-none">
      <div className="pointer-events-auto mt-10 w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-6 py-4">
          <div className="flex items-center gap-2 font-medium text-white">
            <svg className="h-5 w-5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            Lighting Settings
          </div>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs text-neutral-400">Sun Direction</label>
            <div className="space-y-3">
              <div>
                <label className="mb-0.5 block text-[13px] text-neutral-500">Elevation (0-90°)</label>
                <div className="flex items-center gap-2">
                  <input type="range" value={settings.sunElevation} onChange={(e) => onChange({ sunElevation: Number(e.target.value) })} min={0} max={90} step={1} className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-700 accent-sky-400" />
                  <NumInput value={settings.sunElevation} onChange={(v) => onChange({ sunElevation: v })} min={0} max={90} step={1} className="!w-16 shrink-0" />
                </div>
              </div>
              <div>
                <label className="mb-0.5 block text-[13px] text-neutral-500">Azimuth (0-360°)</label>
                <div className="flex items-center gap-2">
                  <input type="range" value={settings.sunAzimuth} onChange={(e) => onChange({ sunAzimuth: Number(e.target.value) })} min={0} max={360} step={1} className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-700 accent-sky-400" />
                  <NumInput value={settings.sunAzimuth} onChange={(v) => onChange({ sunAzimuth: ((v % 360) + 360) % 360 })} min={0} max={360} step={1} className="!w-16 shrink-0" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-neutral-400">Direct Intensity</label>
            <NumInput value={settings.directIntensity} onChange={(v) => onChange({ directIntensity: v })} min={0} max={5} step={0.1} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-neutral-400">Diffuse Intensity</label>
            <NumInput value={settings.diffuseIntensity} onChange={(v) => onChange({ diffuseIntensity: v })} min={0} max={5} step={0.1} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-neutral-400">Light Color</label>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded border border-neutral-700" style={{ backgroundColor: swatchCss }} />
              <div className="grid flex-1 grid-cols-3 gap-2">
                <ColorField label="R" value={r} onChange={(v) => onChange({ lightColor: { r: v, g, b } })} />
                <ColorField label="G" value={g} onChange={(v) => onChange({ lightColor: { r, g: v, b } })} />
                <ColorField label="B" value={b} onChange={(v) => onChange({ lightColor: { r, g, b: v } })} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-neutral-700 px-6 py-4">
          <button onClick={onClose} className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-medium text-neutral-950 transition-colors hover:bg-sky-300">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default LightingSettingsDialog
