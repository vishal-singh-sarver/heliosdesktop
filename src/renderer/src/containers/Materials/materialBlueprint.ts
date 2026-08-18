import type { CatalogPropertyDatatype, MaterialTypeDef } from 'containers/ProjectScreen/types'
// Reuse the Geometry form's property-name humanizer so labels read the same
// across both right-panel forms ("surface_albedo" → "Surface Albedo").
import { humanizeProperty } from 'containers/Geometry/propertyBlueprint'
import messages from './messages'

// ── Material Properties-form blueprint ───────────────────────────────────────
//
// The material-types catalog (state.projectScreen.catalog.materialTypes) gives
// each material type a flat list of TOP-LEVEL `properties` plus a `groups` array
// of collapsible sub-sections (e.g. "Farquhar model", the stomatal-conductance
// sub-models). The right-panel Material Properties form renders one card per
// material type: its top-level fields first, then each group as a collapsible
// section — a group carrying a `selector_property`/`selector_value` only appears
// while that top-level enum holds the matching value.
//
// This layer joins the catalog wire shape into render-ready groups; the catalog
// stays the source of truth (labels, ranges, display order, group membership).

// One editable material field, joined from its catalog property definition.
export interface ResolvedMaterialField {
  property: string
  label: string
  datatype: CatalogPropertyDatatype
  description: string
  min: number | null
  max: number | null
  // Whether the catalog marks this property as required — drives the label's red
  // star. Absent from a material-type payload today (the API sends `required` on
  // object types only), so it currently resolves to false for every material
  // field and no star renders; the moment the API starts marking one, its label
  // shows it without a further change here.
  required: boolean
  // Present only when datatype === 'enum' — drives the field's Select options.
  enumValues?: string[]
  // For a selector enum (one that drives conditional groups): friendly option
  // labels keyed by enum value, e.g. "BWB" → "Ball-woodrow-berry". Absent for an
  // ordinary enum, whose value doubles as its own label.
  enumLabels?: Record<string, string>
}

// A Parameter Group: a `name` (null for the type's top-level fields, which render
// flat with no header) and the fields it holds, in catalog display order. A group
// with `selectorProperty` set is conditional — shown only while the top-level enum
// it names holds `selectorValue`.
export interface ResolvedParameterGroup {
  // null = the type's top-level fields, rendered without a collapsible header.
  name: string | null
  selectorProperty: string | null
  selectorValue: string | null
  fields: ResolvedMaterialField[]
}

// The "Visualiser" catalog type (id 7) — its colour/opacity/texture properties
// carry NO `group` tag in the live catalog, so it's identified by its signature
// colour channels rather than a group name. `color_r` is enough to recognise it.
const VISUALISATION_SIGNATURE_PROPERTY = 'color_r'

// The "Custom" (colour) layer's fields — a full colour plus opacity. Required
// (unlike the otherwise-optional material properties), so an empty colour can't be
// saved. (The Texture layer, added later, will require texture_file instead.)
export const VISUALISATION_CUSTOM_PROPERTIES = ['color_r', 'color_g', 'color_b', 'opacity'] as const

// Short labels for the colour channels. The catalog sends no `label` for these,
// so the generic fallback humanizes the property name into "Color R" / "Color G"
// / "Color B" — three words where the editable form's ColorPicker says simply
// "R", "G", "B". The read-only popup exists to mirror that form, so it reads the
// same here. Keyed by property, so a catalog that later ships real labels wins
// over neither: this map is consulted only where it's explicitly applied.
//
// Opacity carries its UNIT here. It is stored as a 0..100 percent, and the
// editable ColorPicker says so with a "%" printed inside the box beside the
// number. The read-only popup has no box to print it in — it renders a bare value
// — so "100" sat there naming no unit at all, readable as 100% or as fully
// transparent depending on what you assumed. The unit moves into the label.
export const VISUALISATION_CHANNEL_LABELS: Record<string, string> = {
  color_r: 'R',
  color_g: 'G',
  color_b: 'B',
  opacity: 'Opacity (%)'
}

// The backend's mode discriminator, a boolean inside the member's `properties`:
// false = colour (RGB + opacity), true = texture (texture_file). Required on every
// Visualiser write.
export const TEXTURE_TOGGLE_PROPERTY = 'texture_toggle'
// The texture path property.
export const TEXTURE_PROPERTY = 'texture_file'

// Properties that belong to the MATERIAL, not to the material type that happens
// to declare them. Several types carry the Heat Transfer Flag, but a material is
// one-sided or two-sided as a whole — so every card showing it shows the same
// answer, and setting it on one sets it on all. Cards whose type doesn't declare
// the property never render it, and `toNativeProperties` only writes a type's own
// definitions, so carrying the value on them is inert.
export const TWO_SIDED_HEAT_TRANSFER_PROPERTY = 'two_sided_heat_transfer'
export const MATERIAL_WIDE_PROPERTIES: ReadonlySet<string> = new Set([
  TWO_SIDED_HEAT_TRANSFER_PROPERTY
])

// The Visualiser's two mutually-exclusive appearance modes.
export type VisualisationMode = 'custom' | 'texture'

// Read the persisted mode from a values bag (texture_toggle is stored as a string
// once loaded). Defaults to colour.
export function readVisualisationMode(values: Record<string, string>): VisualisationMode {
  const raw = values[TEXTURE_TOGGLE_PROPERTY]
  return raw === 'true' || raw === '1' ? 'texture' : 'custom'
}

// Whether a resolved field set belongs to the Visualiser — the right-panel card
// renders the colour editor for it instead of plain FormFields.
export function isVisualisationFieldSet(fields: ResolvedMaterialField[]): boolean {
  return fields.some((f) => f.property === VISUALISATION_SIGNATURE_PROPERTY)
}

// True when the Visualiser's required Custom (colour) fields are all present and
// valid — the visualisation half of a card's Save gate. Non-visualisation groups
// are always "complete" here (their own fields are optional).
export function isVisualisationComplete(
  groups: ResolvedParameterGroup[],
  values: Record<string, string>
): boolean {
  return visibleParameterGroups(groups, values).every((group) => {
    if (!isVisualisationFieldSet(group.fields)) return true
    return group.fields.every((field) => {
      if (!(VISUALISATION_CUSTOM_PROPERTIES as readonly string[]).includes(field.property)) {
        return true
      }
      const value = values[field.property] ?? ''
      return value.trim() !== '' && validateMaterialFieldValue(field, value) === null
    })
  })
}

const toResolvedField = (def: MaterialTypeDef['properties'][number]): ResolvedMaterialField => ({
  property: def.property,
  // Prefer the catalog's explicit label ("V cmax25"); fall back to humanizing the
  // property name so an unlabeled property still reads sensibly.
  label: def.label ?? humanizeProperty(def.property),
  datatype: def.datatype,
  description: def.description,
  min: def.min,
  max: def.max,
  required: def.required ?? false,
  enumValues: def.enum_values
})

const resolveFields = (props: MaterialTypeDef['properties']): ResolvedMaterialField[] =>
  [...props].sort((a, b) => a.display_order - b.display_order).map(toResolvedField)

// Join the added material types into render-ready Parameter Groups: one leading
// group of the types' top-level fields (name null, always shown) followed by each
// catalog group in display order, carrying its selector so the form can show it
// conditionally. Fields keep the catalog's display order. The form calls this with
// a single type per card; a property shared across the passed types is de-duplicated
// (first wins) so overlapping types never render the same field twice.
export function resolveParameterGroups(types: MaterialTypeDef[]): ResolvedParameterGroup[] {
  const topFields: ResolvedMaterialField[] = []
  const groups: ResolvedParameterGroup[] = []
  const seenProperties = new Set<string>()

  const take = (props: MaterialTypeDef['properties']): ResolvedMaterialField[] => {
    const out: ResolvedMaterialField[] = []
    for (const field of resolveFields(props)) {
      if (seenProperties.has(field.property)) continue
      seenProperties.add(field.property)
      out.push(field)
    }
    return out
  }

  for (const type of types) {
    // Friendly labels for any selector enum: selector_property → { value → group
    // name }, so the driving dropdown reads "Ball-woodrow-berry" not "BWB".
    const selectorLabels = new Map<string, Record<string, string>>()
    for (const g of type.groups) {
      if (g.selector_property == null || g.selector_value == null) continue
      const labels = selectorLabels.get(g.selector_property) ?? {}
      labels[g.selector_value] = g.name
      selectorLabels.set(g.selector_property, labels)
    }
    for (const field of take(type.properties)) {
      const labels = selectorLabels.get(field.property)
      topFields.push(labels ? { ...field, enumLabels: labels } : field)
    }
    for (const g of [...type.groups].sort((a, b) => a.display_order - b.display_order)) {
      const fields = take(g.properties)
      if (fields.length === 0) continue
      groups.push({
        name: g.name,
        selectorProperty: g.selector_property,
        selectorValue: g.selector_value,
        fields
      })
    }
  }

  const result: ResolvedParameterGroup[] = []
  if (topFields.length > 0) {
    result.push({ name: null, selectorProperty: null, selectorValue: null, fields: topFields })
  }
  return result.concat(groups)
}

// A conditional group is shown only while its selector property currently holds
// its selector value; a group with no selector is always shown. Shared by the
// form (what to render), the Save gate + validation (which fields count) and the
// payload builder (which fields to send) so they never disagree.
function groupIsActive(
  group: Pick<ResolvedParameterGroup, 'selectorProperty' | 'selectorValue'>,
  values: Record<string, string>
): boolean {
  return group.selectorProperty == null || values[group.selectorProperty] === group.selectorValue
}

// The groups whose fields are live for the current values — the leading top-level
// group plus every conditional group whose selector currently matches.
export function visibleParameterGroups(
  groups: ResolvedParameterGroup[],
  values: Record<string, string>
): ResolvedParameterGroup[] {
  return groups.filter((g) => groupIsActive(g, values))
}

// Below the field's lower bound. `Number("-0")` is negative zero, and `-0 < 0`
// is false, so a minus-signed zero ("-0", "-0.00", "-0e5") used to pass the range
// check on a field whose range starts at 0 — a 0-1 band optic, a 0-255 RGB
// channel — and commit as a negative-looking value. A sign the user typed is a
// sign they meant: on a non-negative range it is out of range and gets the range
// message, same as "-5" does. A range that genuinely admits negatives is
// unaffected — there -0 is just zero.
function isBelowMin(num: number, min: number | null): boolean {
  if (min == null) return false
  return num < min || (Object.is(num, -0) && min >= 0)
}

// Validate one material property's committed value against its catalog metadata,
// mirroring the Geometry form's validateFieldValue. Returns an error message, or
// null when valid. Only numeric properties (float / integer) are range-checked;
// enum / boolean / file / date / time are chosen from controls that can't
// produce an invalid value, so they always pass.
//
// Empty is checked FIRST and for every datatype, so a required field reads the
// same here as in the Geometry form: a required enum or file is just as unfilled
// as a required number. This used to return null for every empty value, which
// meant the Visualiser's colour channels — which the catalog marks required, and
// which already blocked Save — could be blanked with nothing on screen saying why
// the button had gone dead.
export function validateMaterialFieldValue(
  field: ResolvedMaterialField,
  raw: string
): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return field.required ? messages.fieldRequired : null
  if (field.datatype !== 'float' && field.datatype !== 'integer') return null

  const num = Number(trimmed)
  if (!Number.isFinite(num)) return messages.fieldInvalid
  // Range before datatype: an out-of-range value (whole or not) shows the range;
  // only an in-range non-integer falls through to the datatype error.
  if (isBelowMin(num, field.min) || (field.max != null && num > field.max)) {
    return messages.valuesBetween(field.min, field.max)
  }
  // A non-integer in an integer field (e.g. an RGB channel) is a datatype error —
  // only whole numbers are supported for those parameters.
  if (field.datatype === 'integer' && !Number.isInteger(num)) return messages.fieldInvalid
  return null
}

// True when every field of the given resolved parameter groups passes validation
// for the current values — the field half of a card's Save gate.
export function isMaterialFormValid(
  groups: ResolvedParameterGroup[],
  values: Record<string, string>,
  // Properties whose validity doesn't matter in the card's CURRENT mode: the
  // Radiation bands while a spectral file supersedes them. They keep their values
  // (the toggle may come back) but they are dropped on save, so a stale invalid
  // one must not gate it — and the editor hides its error there, which would make
  // the block invisible.
  ignoreProperties?: readonly string[]
): boolean {
  const ignored = new Set(ignoreProperties ?? [])
  // Only VISIBLE groups gate Save — a hidden sub-model's fields (e.g. the BWB
  // coefficients while Medlyn is selected) must not block a valid form.
  return visibleParameterGroups(groups, values).every((group) =>
    group.fields.every(
      (field) =>
        ignored.has(field.property) ||
        validateMaterialFieldValue(field, values[field.property] ?? '') === null
    )
  )
}

// The form keeps every value as a string; the backend requires each property in
// its NATIVE JSON type (a number for float/integer, a boolean for boolean, a
// string for enum/date/time/file) and rejects a mistyped one with
// DATATYPE_MISMATCH. Convert a card's values against its material type's catalog
// definition, dropping the ones the user left blank. Shared by the add (POST) and
// update (PATCH) calls.
export function toNativeProperties(
  type: MaterialTypeDef,
  values: Record<string, string>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  // Top-level properties plus the properties of every group whose selector
  // currently matches — so an inactive sub-model's coefficients are never sent
  // (e.g. no BWB fields while Medlyn is selected), and active group fields, which
  // used to live outside `type.properties`, are no longer dropped.
  const activeDefs = [
    ...type.properties,
    ...type.groups
      .filter((g) => g.selector_property == null || values[g.selector_property] === g.selector_value)
      .flatMap((g) => g.properties)
  ]
  for (const def of activeDefs) {
    // Trim BEFORE the blank test, matching how validation decides "empty". A field
    // holding only whitespace is not === '' but IS blank — and Number(' ') is 0,
    // so without the trim a stray space sailed past the blank check and shipped a
    // real 0 (bypassing the field's min bound) for a value the user left unset.
    const value = values[def.property]?.trim()
    if (value === undefined || value === '') continue
    if (def.datatype === 'float' || def.datatype === 'integer') {
      const num = Number(value)
      // Save is gated on field validity, so this is already a finite, in-range
      // number; the guard just keeps a stray value out of the payload.
      if (!Number.isFinite(num)) continue
      out[def.property] = num
    } else if (def.datatype === 'boolean') {
      out[def.property] = value === 'true' || value === '1'
    } else {
      out[def.property] = value
    }
  }
  return out
}

// Build the full-replace payload for a Visualiser member. The save is PUT/POST
// (full-replace), so we send the complete state for the ACTIVE mode and OMIT the
// other side's fields — the backend nulls whatever we leave out.
//
//   - colour  → `{ texture_toggle: false, color_r/g/b, opacity }` (texture omitted)
//   - texture → `{ texture_toggle: true,  texture_file }` (colour omitted)
//
// `texturePath` overrides the stored path (a freshly picked library texture). The
// texture upload path doesn't come through here — it uses the dedicated upload
// endpoint, which writes the member itself.
export function toVisualisationProperties(
  type: MaterialTypeDef,
  values: Record<string, string>,
  mode: VisualisationMode,
  texturePath?: string
): Record<string, string | number | boolean> {
  if (mode === 'texture') {
    return {
      [TEXTURE_TOGGLE_PROPERTY]: true,
      [TEXTURE_PROPERTY]: texturePath ?? values[TEXTURE_PROPERTY] ?? ''
    }
  }
  const native = toNativeProperties(type, values)
  const out: Record<string, string | number | boolean> = { [TEXTURE_TOGGLE_PROPERTY]: false }
  for (const key of VISUALISATION_CUSTOM_PROPERTIES) {
    if (native[key] !== undefined) out[key] = native[key]
  }
  return out
}

// ── Radiation bespoke editor ─────────────────────────────────────────────────
//
// The Radiation type gets a custom body (like the Visualiser), recognised by its
// per-band signature. It curates the catalog: specular exponent/scale + Heat
// Transfer Flag, an "Apply spectral data" toggle, a spectral-data file, and the
// PAR/NIR/LW band grid — hiding surface_temperature, the broadband trio, and the
// raw use_radiation_bands / spectral_data rows the generic grid would show.

// Signature property — enough to recognise a Radiation field set.
const RADIATION_SIGNATURE_PROPERTY = 'reflectivity_PAR'
// The mode discriminator: use_radiation_bands true = manual per-band values,
// false = a spectral-data file supersedes them ("Apply spectral data" ON).
export const USE_RADIATION_BANDS_PROPERTY = 'use_radiation_bands'
export const SPECTRAL_DATA_PROPERTY = 'spectral_data'

// The three wavebands and their per-band property names (the catalog contract).
export const RADIATION_BANDS = ['PAR', 'NIR', 'LW'] as const
export type RadiationBand = (typeof RADIATION_BANDS)[number]
export const radiationBandProperties = (band: RadiationBand): [string, string, string] => [
  `reflectivity_${band}`,
  `transmissivity_${band}`,
  `emissivity_${band}`
]
export const ALL_BAND_PROPERTIES = RADIATION_BANDS.flatMap(radiationBandProperties)

// The Radiation top-level fields the bespoke editor renders as CONTROLS rather
// than as rows in the field grid: the mode toggle and the file picker each have
// their own widget below, so listing them here keeps them out of the grid above.
//
// This set used to also carry surface_temperature and the broadband trio. Those
// are gone: the catalog stops sending them (migration 031 tags them 'computed' /
// 'superseded'), so hiding them here was doing nothing — while quietly breaking
// two things. The read-only material popup has no copy of this list, so it kept
// showing what this file hid; and surface_temperature is tagged 'computed'
// precisely so a future "disable model -> enter input" pass can send it back,
// which a hardcoded hide would have swallowed.
//
// The rule for what a screen shows now lives in ONE place — the catalog — so the
// editor and the popup cannot disagree about it again. Keep it that way: a
// property that shouldn't be offered belongs behind a visibility tag or a gated
// group, not in a list here.
const RADIATION_HIDDEN_PROPERTIES = new Set([
  USE_RADIATION_BANDS_PROPERTY,
  SPECTRAL_DATA_PROPERTY
])

// The specular / heat-transfer fields that render above the spectral toggle, in
// catalog order — everything left once the band + hidden props are removed.
export function radiationHeaderFields(
  fields: ResolvedMaterialField[]
): ResolvedMaterialField[] {
  const bandProps = new Set<string>(ALL_BAND_PROPERTIES)
  return fields.filter(
    (f) => !bandProps.has(f.property) && !RADIATION_HIDDEN_PROPERTIES.has(f.property)
  )
}

// Whether a resolved field set belongs to the Radiation type — the card renders
// the bespoke Radiation editor for it instead of the plain field grid.
export function isRadiationFieldSet(fields: ResolvedMaterialField[]): boolean {
  return fields.some((f) => f.property === RADIATION_SIGNATURE_PROPERTY)
}

// The persisted "Apply spectral data" state: ON exactly when use_radiation_bands
// is explicitly false. A new/unset card defaults to OFF (manual per-band values).
export function readApplySpectral(values: Record<string, string>): boolean {
  return values[USE_RADIATION_BANDS_PROPERTY] === 'false'
}

// The gated group holding the spectrum choices — which curve inside the uploaded
// file this material uses (migration 031).
//
// Found by its SELECTOR, not by the property names inside it. The backend owns
// what belongs to the spectral side (it gates the group on use_radiation_bands),
// so a third spectrum property added later lands here with no change to this
// file — the thing that went wrong with the hand-written hidden list above.
export function spectrumGroup(
  groups: ResolvedParameterGroup[]
): ResolvedParameterGroup | undefined {
  return groups.find((g) => g.selectorProperty === USE_RADIATION_BANDS_PROPERTY)
}

// True while spectral mode is not yet usable — the Save gate for that mode.
// Two ways to be incomplete: no file, or a file with a choice still unmade.
//
// Not a nicety: neither failure is loud. RadiationModel warns and falls back to
// a reflectivity of 0, blackening the surface for the entire simulation with
// nothing pointing back here — so both are caught before Save rather than in a
// run.
export function spectralSetupIncomplete(
  groups: ResolvedParameterGroup[],
  values: Record<string, string>
): boolean {
  if (!readApplySpectral(values)) return false

  // No file is the worse half of this rule, not an exemption from it. Spectral
  // mode DROPS the per-band values on save (toRadiationProperties), on the
  // understanding that a file replaces them — so saving with no file ships a
  // material carrying no reflectivity or transmissivity at all. It also strands
  // any spectrum names still held from a file that has since been deleted, which
  // the engine resolves to a reflectivity of 0 and a black surface.
  //
  // Safe to block on: the upload needs only the material GROUP, not a saved
  // member (upload_file_property — "a texture can be uploaded before the member
  // exists"), so a brand-new card can always satisfy this. It is never a state
  // the user is stuck in.
  if ((values[SPECTRAL_DATA_PROPERTY] ?? '').trim() === '') return true

  const group = spectrumGroup(groups)
  if (group == null) return false
  return group.fields.some((f) => (values[f.property] ?? '').trim() === '')
}

// Build the Radiation member payload for the active mode. Full-replace, so we send
// the mode's own side and omit the other:
//   - manual   → use_radiation_bands: true,  the filled band values, no file
//   - spectral → use_radiation_bands: false, the spectral_data file, no bands
// Specular / Heat Transfer fields are carried through in both modes.
export function toRadiationProperties(
  type: MaterialTypeDef,
  values: Record<string, string>,
  applySpectral: boolean
): Record<string, string | number | boolean> {
  const out = toNativeProperties(type, values)
  out[USE_RADIATION_BANDS_PROPERTY] = !applySpectral
  if (applySpectral) {
    for (const p of ALL_BAND_PROPERTIES) delete out[p]
  } else {
    delete out[SPECTRAL_DATA_PROPERTY]
  }
  return out
}

// Per band (PAR/NIR/LW), reflectivity + transmissivity + emissivity must not
// exceed 1 (each may be up to 1 on its own). Returns the band-field properties
// that belong to a band whose FILLED numeric values sum past 1 — so the editor can
// flag all three of that band and Save can gate on it. An empty box counts as 0; a
// band with a non-numeric filled value is skipped (its per-field validation
// surfaces that instead). A tiny epsilon keeps an exact 1 (e.g. 0.1+0.2+0.7) from
// tripping on floating-point drift.
export function radiationBandSumViolations(values: Record<string, string>): Set<string> {
  const over = new Set<string>()
  for (const band of RADIATION_BANDS) {
    const props = radiationBandProperties(band)
    const parsed = props.map((p) => {
      const raw = (values[p] ?? '').trim()
      return raw === '' ? 0 : Number(raw)
    })
    if (parsed.some((n) => !Number.isFinite(n))) continue
    if (parsed[0] + parsed[1] + parsed[2] - 1 > 1e-9) for (const p of props) over.add(p)
  }
  return over
}
