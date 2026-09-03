/**
 * Materials feature copy + limits, mirrored from the app.
 *
 * Hand-mirrored: e2e/tsconfig.json includes only e2e/**, so these cannot be
 * imported from src/. Sources:
 *   src/renderer/src/containers/Materials/messages.ts
 *   src/renderer/src/containers/Materials/validation.ts
 *
 * NOTE the phrasing differs from Geometry's in two places, which is a real
 * product inconsistency rather than a transcription slip:
 *   Geometry range msg -> "Values should be between (1 - 25000)"   (parens)
 *   Geometry delete    -> "Delete Ground.001"                      (no quotes/?)
 *   Materials delete   -> 'Delete "Material.001"?'                 (quotes + ?)
 */

export const MATERIALS_MSG = {
  addMaterials: 'Add Materials',
  savedMaterials: 'Saved Materials',
  loading: 'Loading materials…',
  empty: 'No saved materials yet.',
  noMatches: 'No materials found',
  loadError: 'Unable to load materials',

  // Name validation (validation.ts validateMaterialName)
  nameRequired: 'Name is required',
  nameTooLong: 'Character limit exceeded',
  nameExists: 'Material name already exists',

  // Field validation
  fieldRequired: 'Required Field',
  fieldInvalid: 'Invalid Input',
  decimalLimit: 'Only 7 Decimal places are supported',
  inputNotSupported: 'This input is not supported',
  /**
   * The out-of-range message, built from the field's CATALOG bounds.
   *
   * Note the phrasing against Geometry's, which is a real product
   * inconsistency and not a transcription slip — the two right-panel forms are
   * the same control to a user:
   *   Materials -> `Values should be between 0-255`      (no parens, no spaces)
   *   Geometry  -> `Values should be between (0 - 255)`  (parens and spaces)
   * A third phrasing lives in Weather (`Value should be between 0 and 1500`).
   */
  valuesBetween: (min: number | null, max: number | null): string => {
    if (min != null && max != null) return `Values should be between ${min}-${max}`
    if (min != null) return `Value should be at least ${min}`
    if (max != null) return `Value should be at most ${max}`
    return 'Invalid Input'
  },

  // Card / type chrome
  materialType: 'Material Type',
  addMaterialType: 'Add Material Type',
  allTypesAdded: 'All material types added',
  selectPlaceholder: 'Select',
  /** Card headings are `Material Type.01` — TWO digits, unlike Ground.NNN. */
  cardTitle: (n: number) => `Material Type.${String(n).padStart(2, '0')}`,

  // Visualiser
  visualisationCustomTab: 'Custom',
  visualisationTextureTab: 'Select Texture',
  textureFromLibraryTab: 'From Library',
  textureUploadTab: 'Upload File',
  rgbValues: 'RGB Values',

  // Texture file validation
  textureFileTypeError: 'Only JPG, JPEG or PNG files are allowed',
  textureFileSizeError: 'File must be 10 MB or smaller',
  textureFileContentError: 'This file is not a valid JPG, JPEG or PNG image',
  // A REAL image whose extension names the OTHER format. Distinct from
  // textureFileContentError, which is for bytes that are no image at all: this
  // file uploads and stores fine and only dies later, wherever a decoder is
  // picked by extension — so the message names the mismatch rather than calling
  // a perfectly good picture invalid.
  textureFileFormatMismatch: (actual: string, named: string): string =>
    `This is a ${actual} image named "${named}". ` +
    'Rename it with the matching extension and try again',

  // Radiation
  applySpectralData: 'Apply spectral data',
  bandSumExceedsOne:
    "The sum of reflectivity, transmissivity and emissivity can't exceed 1.",

  // Delete confirmation
  deleteTitle: 'Delete',
  deleteHeading: (name: string) => `Delete "${name}"?`,

  /**
   * The DUPLICATE-NAME rejection from the BACKEND, which is a different string
   * from the client's `nameExists` above — one word different, and easy to
   * mistake for it.
   *
   * Which one you get depends on WHICH rename you drove:
   *  - the LEFT PANEL row editor validates client-side and never sends a
   *    duplicate, so it shows `nameExists`;
   *  - the RIGHT PANEL form passes an EMPTY conflict set to validateMaterialName
   *    (MaterialPropertiesForm's NO_NAME_CONFLICTS), so it has no client-side
   *    duplicate check at all and the only rejection is this 409.
   * Source: material_library_service.py — 409 MATERIAL_GROUP_NAME_EXISTS.
   */
  nameExistsBackend: 'Material group name already exists'
} as const

/**
 * Toast copy that actually ships, from store/toastMessages.ts — NOT the
 * feature's messages.ts, whose toast entries are dead code. Toasts auto-dismiss
 * after ~2.5s.
 */
export const MATERIALS_TOAST = {
  created: (name: string) => `"${name}" has been successfully created.`,
  deleted: (name: string) => `"${name}" has been successfully deleted.`,
  saved: 'Changes have been successfully saved'
} as const

export const MATERIAL_LIMITS = {
  NAME_MAX: 20,
  nameValid: 'a'.repeat(20),
  nameTooLong: 'a'.repeat(21),
  DECIMALS_MAX: 7,
  decimals7: '1.1234567',
  decimals8: '1.12345678',

  /** Visualiser colour channels (catalog: integer 0-255) and opacity (0-100). */
  CHANNEL_MIN: 0,
  CHANNEL_MAX: 255,
  OPACITY_MIN: 0,
  OPACITY_MAX: 100,

  /** Radiation: reflectivity + transmissivity + emissivity must not exceed 1. */
  BAND_SUM_MAX: 1,

  TEXTURE_MAX_BYTES: 10 * 1024 * 1024,
  TEXTURE_MAX_DIMENSION: 8192,
  SPECTRAL_MAX_BYTES: 5 * 1024 * 1024
} as const

/** Auto-naming is `Material.NNN`, zero-padded to 3, GAP-FILLING. */
export const materialName = (n: number): string => `Material.${String(n).padStart(3, '0')}`

/**
 * The seven material types the backend seeds, verified against the live
 * catalog on 2026-08-27 (backend 91b4099).
 *
 * Only for picking a type to exercise — NEVER as the oracle for what the
 * dropdown should list. That must be read from /api/catalog/material-types at
 * runtime, since a migration can change it with no frontend change.
 *
 * DEVIATION: the user story calls the visualisation type "Visualisation
 * Properties"; the catalog calls it `Visualiser`. The other six names match.
 * Solar Position and Boundary Layer Conductance ARE material types (they are
 * also model types, which is what makes them easy to mislabel).
 */
export const KNOWN_MATERIAL_TYPES = [
  'Radiation',
  'Energy Balance',
  'Solar Position',
  'Photosynthesis',
  'Boundary Layer Conductance',
  'Stomatal Conductance',
  'Visualiser'
] as const

/** Solar Position's catalog entry has properties: [] — its card renders empty. */
export const TYPE_WITH_NO_FIELDS = 'Solar Position'

/**
 * The material-type CATALOG, as the backend actually serves it.
 *
 * Generated from the live database (`%APPDATA%/Helios/backend-data/heliosgui.db`,
 * schema version 31, read 2026-08-28) — NOT transcribed from the user stories.
 * Only `visibility = 'editable'` rows are here: those are the ones the form
 * renders as controls. `computed` and `external` properties exist on the type
 * and reach the engine, but no input is ever offered for them.
 *
 * The form is catalog-DRIVEN, so this table is the oracle for two different
 * things and it is worth keeping them apart:
 *   - which controls a type's card renders, and in what order
 *   - the bounds each numeric field validates against, which is what the app's
 *     own "Values should be between X-Y" copy is built from
 * A backend migration that moves a bound moves the message with it and turns
 * these tests red, which is the point.
 *
 * ── What this table shows about the user stories ───────────────────────────
 * DEVIATION: `topt_tpu` is 273-373 here; Story 10 states 272-373. Every other
 *   numeric bound in the story matches the catalog exactly.
 * DEVIATION: plain `reflectivity` / `transmissivity` / `emissivity` are marked
 *   `superseded` by the per-band trio and are therefore ABSENT, not disabled.
 *   The story's "if bands are added, disable them" rule has no shipped
 *   counterpart — there is no state in which they appear.
 * DEVIATION: `glass_n_`, which the story lists under Radiation, does not exist
 *   as a property at all.
 * DEVIATION: the story calls the Two-Sided Heat Transfer Flag a "toggle" for
 *   Energy Balance / Photosynthesis / Boundary Layer Conductance and a
 *   "dropdown" for Radiation. It is an ENUM (a dropdown) on all four.
 * Only `color_r`, `color_g`, `color_b` and `opacity` are INTEGER; every other
 *   numeric property is float. That is the shipped meaning of the story's
 *   "only whole numbers" rule — it applies to the colour channels alone.
 */
export interface MaterialPropertyDef {
  property: string
  datatype: 'float' | 'integer' | 'enum' | 'file' | 'boolean' | 'string'
  min: number | null
  max: number | null
  enumValues: string[] | null
  /** Conditional group heading, e.g. "Farquhar model". null = a top-level field. */
  group: string | null
  /** The field+value that must be set for this one to render at all. */
  selector: { property: string; value: string } | null
}

export const MATERIAL_CATALOG: Record<string, MaterialPropertyDef[]> = {
  'Radiation': [
    { property: 'specular_exponent', datatype: 'float', min: 1, max: 1000, enumValues: null, group: null, selector: null },
    { property: 'specular_scale', datatype: 'float', min: 0, max: 100, enumValues: null, group: null, selector: null },
    { property: 'two_sided_heat_transfer', datatype: 'enum', min: null, max: null, enumValues: ['One Sided', 'Two Sided'], group: null, selector: null },
    { property: 'spectral_data', datatype: 'file', min: null, max: null, enumValues: null, group: null, selector: null },
    { property: 'use_radiation_bands', datatype: 'boolean', min: null, max: null, enumValues: null, group: null, selector: null },
    { property: 'reflectivity_PAR', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'transmissivity_PAR', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'emissivity_PAR', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'reflectivity_NIR', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'transmissivity_NIR', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'emissivity_NIR', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'reflectivity_LW', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'transmissivity_LW', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'emissivity_LW', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'reflectivity_spectrum', datatype: 'string', min: null, max: null, enumValues: null, group: 'Spectrum', selector: { property: 'use_radiation_bands', value: 'false' } },
    { property: 'transmissivity_spectrum', datatype: 'string', min: null, max: null, enumValues: null, group: 'Spectrum', selector: { property: 'use_radiation_bands', value: 'false' } },
  ],
  'Energy Balance': [
    { property: 'two_sided_heat_transfer', datatype: 'enum', min: null, max: null, enumValues: ['One Sided', 'Two Sided'], group: null, selector: null },
    { property: 'stomatal_sidedness', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'object_length', datatype: 'float', min: 1e-06, max: 1000000, enumValues: null, group: null, selector: null },
    { property: 'heat_capacity', datatype: 'float', min: 0, max: 1000000, enumValues: null, group: null, selector: null },
  ],
  'Photosynthesis': [
    { property: 'two_sided_heat_transfer', datatype: 'enum', min: null, max: null, enumValues: ['One Sided', 'Two Sided'], group: null, selector: null },
    { property: 'stomatal_sidedness', datatype: 'float', min: 0, max: 1, enumValues: null, group: null, selector: null },
    { property: 'vcmax25', datatype: 'float', min: 0, max: 1000, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'submodel', datatype: 'enum', min: null, max: null, enumValues: ['farquhar_model'], group: null, selector: null },
    { property: 'jmax25', datatype: 'float', min: 0, max: 1000, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'tpu25', datatype: 'float', min: 0, max: 100, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'rd25', datatype: 'float', min: 0, max: 100, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'alpha', datatype: 'float', min: 0, max: 10, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'theta', datatype: 'float', min: 0, max: 10, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'dha_vcmax', datatype: 'float', min: 0, max: 500, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'topt_vcmax', datatype: 'float', min: 273, max: 373, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'dha_jmax', datatype: 'float', min: 0, max: 500, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'topt_jmax', datatype: 'float', min: 273, max: 373, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'dhd_jmax', datatype: 'float', min: 0, max: 500, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'dha_tpu', datatype: 'float', min: 0, max: 500, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'topt_tpu', datatype: 'float', min: 273, max: 373, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
    { property: 'dhd_tpu', datatype: 'float', min: 0, max: 500, enumValues: null, group: 'Farquhar model', selector: { property: 'submodel', value: 'farquhar_model' } },
  ],
  'Boundary Layer Conductance': [
    { property: 'two_sided_heat_transfer', datatype: 'enum', min: null, max: null, enumValues: ['One Sided', 'Two Sided'], group: null, selector: null },
    { property: 'boundary_layer_model', datatype: 'enum', min: null, max: null, enumValues: ['Pohlhausen', 'InclinedPlate', 'Sphere', 'Ground'], group: null, selector: null },
  ],
  'Stomatal Conductance': [
    { property: 'gamma_co2', datatype: 'float', min: 0, max: 1000, enumValues: null, group: null, selector: null },
    { property: 'stomatal_model', datatype: 'enum', min: null, max: null, enumValues: ['BWB', 'BBL', 'Medlyn', 'BMF'], group: null, selector: null },
    { property: 'bwb_gs0', datatype: 'float', min: 0, max: 1, enumValues: null, group: 'Ball-woodrow-berry', selector: { property: 'stomatal_model', value: 'BWB' } },
    { property: 'bwb_a1', datatype: 'float', min: 0, max: 50, enumValues: null, group: 'Ball-woodrow-berry', selector: { property: 'stomatal_model', value: 'BWB' } },
    { property: 'bbl_gs0', datatype: 'float', min: 0, max: 1, enumValues: null, group: 'Ball-berry-leuning', selector: { property: 'stomatal_model', value: 'BBL' } },
    { property: 'bbl_a1', datatype: 'float', min: 0, max: 50, enumValues: null, group: 'Ball-berry-leuning', selector: { property: 'stomatal_model', value: 'BBL' } },
    { property: 'bbl_d0', datatype: 'float', min: 0, max: 5000000, enumValues: null, group: 'Ball-berry-leuning', selector: { property: 'stomatal_model', value: 'BBL' } },
    { property: 'medlyn_gs0', datatype: 'float', min: 0, max: 1, enumValues: null, group: 'Medlyn Optimality', selector: { property: 'stomatal_model', value: 'Medlyn' } },
    { property: 'medlyn_g1', datatype: 'float', min: 0, max: 50, enumValues: null, group: 'Medlyn Optimality', selector: { property: 'stomatal_model', value: 'Medlyn' } },
    { property: 'bmf_em', datatype: 'float', min: 0, max: 50000, enumValues: null, group: 'Buckley-mott-farquhar', selector: { property: 'stomatal_model', value: 'BMF' } },
    { property: 'bmf_i0', datatype: 'float', min: 0, max: 10000, enumValues: null, group: 'Buckley-mott-farquhar', selector: { property: 'stomatal_model', value: 'BMF' } },
    { property: 'bmf_k', datatype: 'float', min: 0, max: 10000000, enumValues: null, group: 'Buckley-mott-farquhar', selector: { property: 'stomatal_model', value: 'BMF' } },
    { property: 'bmf_b', datatype: 'float', min: 0, max: 50000, enumValues: null, group: 'Buckley-mott-farquhar', selector: { property: 'stomatal_model', value: 'BMF' } },
  ],
  'Visualiser': [
    { property: 'texture_toggle', datatype: 'boolean', min: null, max: null, enumValues: null, group: null, selector: null },
    { property: 'color_r', datatype: 'integer', min: 0, max: 255, enumValues: null, group: null, selector: null },
    { property: 'color_g', datatype: 'integer', min: 0, max: 255, enumValues: null, group: null, selector: null },
    { property: 'color_b', datatype: 'integer', min: 0, max: 255, enumValues: null, group: null, selector: null },
    { property: 'opacity', datatype: 'integer', min: 0, max: 100, enumValues: null, group: null, selector: null },
    { property: 'texture_file', datatype: 'file', min: null, max: null, enumValues: null, group: null, selector: null },
  ],
}

/**
 * value -> VISIBLE LABEL for a selector enum.
 *
 * A selector dropdown does not show its stored values. `materialBlueprint`
 * builds `enumLabels` as `selector_value -> the GROUP NAME that value unlocks`,
 * with the comment "so the driving dropdown reads 'Ball-woodrow-berry' not
 * 'BWB'". So the option a user clicks is labelled `Farquhar model`, never
 * `farquhar_model`, and `Ball-berry-leuning`, never `BBL`.
 *
 * This cost 31 test failures on the first run: setEnum takes what is ON SCREEN,
 * and the catalog's enum_values are what is STORED. Always map through here.
 *
 * Ordinary enums (two_sided_heat_transfer, boundary_layer_model) drive no group,
 * so they have no labels and show their raw values — hence the `?? value`.
 */
export const enumOptionLabels = (type: string, property: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const p of MATERIAL_CATALOG[type] ?? []) {
    if (p.selector?.property === property && p.group) out[p.selector.value] = p.group
  }
  return out
}

/** The label shown for one enum value, falling back to the value itself. */
export const enumLabel = (type: string, property: string, value: string): string =>
  enumOptionLabels(type, property)[value] ?? value

/** True when this enum drives conditional groups (and so relabels its options). */
export const isSelectorEnum = (type: string, property: string): boolean =>
  Object.keys(enumOptionLabels(type, property)).length > 0

/** Numeric properties of a type — the ones a range sweep can probe. */
export const numericProps = (type: string): MaterialPropertyDef[] =>
  (MATERIAL_CATALOG[type] ?? []).filter(
    (p) => (p.datatype === 'float' || p.datatype === 'integer') && p.min != null && p.max != null
  )

/** Properties rendered unconditionally (no selector gate). */
export const topLevelProps = (type: string): MaterialPropertyDef[] =>
  (MATERIAL_CATALOG[type] ?? []).filter((p) => p.selector === null)

/**
 * A value just outside a bound, chosen for the datatype.
 *
 * Integer fields take whole steps: 256 for a 0-255 channel. Float fields step
 * by a decimal the 7-place guard still accepts, so the value under test is the
 * RANGE rule and not the decimal one.
 */
export const justBelowMin = (p: MaterialPropertyDef): string =>
  p.datatype === 'integer' ? String((p.min as number) - 1) : String((p.min as number) - 0.1)
export const justAboveMax = (p: MaterialPropertyDef): string =>
  p.datatype === 'integer' ? String((p.max as number) + 1) : String((p.max as number) + 0.1)

// ── Visible LABELS ──────────────────────────────────────────────────────────
//
// MATERIAL_CATALOG above mirrors the catalog's SHAPE (datatype, bounds, groups)
// but not its `label` column, and a label is what both the form's <label> and
// the ground's read-only <dt> actually render. Without them a test can only
// assert values positionally, which says nothing about the row it read.
//
// Resolution rule, mirrored from materialBlueprint.toResolvedField:
//     LABEL_OVERRIDES[property] ?? catalog.label ?? humanizeProperty(property)
// Read from the live catalog (GET /api/catalog/material-types, backend 91b4099)
// on 2026-09-02, not transcribed from the stories.

/** "resolution_x" -> "Resolution X". Mirrors Geometry/propertyBlueprint. */
export const humanizeProperty = (property: string): string =>
  property
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/**
 * Labels the catalog ships, plus the two sets the app supplies itself.
 *
 * Anything absent here resolves through humanizeProperty, which is exactly what
 * the app does — so `materialLabel()` below is correct for every property, not
 * just the listed ones.
 *
 * Two entries are NOT the catalog's own text and will not be found by grepping
 * the database:
 *  - `stomatal_model` ships as "Stomatal Conductance" and is OVERRIDDEN to
 *    "Stomatal Model" (LABEL_OVERRIDES). Photosynthesis's `submodel` is not
 *    overridden and keeps its catalog "Photosynthesis Model".
 *  - The four Visualiser channels have NO catalog label; the app supplies
 *    R / G / B / "Opacity (%)" (VISUALISATION_CHANNEL_LABELS). Opacity carries
 *    its unit in the label because the read-only popup has no box to print a
 *    "%" in.
 *
 * NOTE three properties share the label "gs, o" and two share "a1", across
 * different stomatal sub-models. That is safe to assert on only because the
 * sub-models are mutually exclusive: one group is active at a time, so a
 * rendered popup never shows two rows with the same label.
 */
const CATALOG_LABELS: Record<string, string> = {
  two_sided_heat_transfer: 'Heat Transfer Flag',
  stomatal_sidedness: 'Stomatal Sidedness',
  // Photosynthesis
  submodel: 'Photosynthesis Model',
  vcmax25: 'Vcmax_25', jmax25: 'Jmax_25', tpu25: 'TPU_25', rd25: 'Rd25',
  alpha: 'alpha', theta: 'theta',
  dha_vcmax: 'dHa_Vcmax', topt_vcmax: 'Topt_Vcmax',
  dha_jmax: 'dHa_Jmax', topt_jmax: 'Topt_Jmax', dhd_jmax: 'dHd_Jmax',
  dha_tpu: 'dHa_TPU', topt_tpu: 'Topt_TPU', dhd_tpu: 'dHd_TPU',
  // Stomatal Conductance
  gamma_co2: 'Gamma_CO2',
  stomatal_model: 'Stomatal Model',
  bwb_gs0: 'gs, o', bwb_a1: 'a1',
  bbl_gs0: 'gs, o', bbl_a1: 'a1', bbl_d0: 'Do',
  medlyn_gs0: 'gs, o', medlyn_g1: 'g1',
  bmf_em: 'Em', bmf_i0: 'io', bmf_k: 'k', bmf_b: 'b',
  // Visualiser
  color_r: 'R', color_g: 'G', color_b: 'B', opacity: 'Opacity (%)'
}

/** The label rendered for a property, in the form AND the read-only popup. */
export const materialLabel = (property: string): string =>
  CATALOG_LABELS[property] ?? humanizeProperty(property)

/**
 * What the GROUND'S READ-ONLY POPUP prints for an enum value — which is NOT
 * what the editable form shows for the same value.
 *
 * buildMaterialSections renders a SELECTOR enum as the humanized STORED CODE
 * (`farquhar_model` -> "Farquhar Model", `BWB` -> "BWB"), while the form renders
 * the NAME OF THE GROUP that value unlocks (`Farquhar model`,
 * `Ball-woodrow-berry`). So a user picks "Ball-woodrow-berry" and reads back
 * "BWB" on the ground.
 *
 * DEVIATION, pinned by material-submodels.test.ts: the two surfaces disagree
 * about the same stored value. Tests follow the code; this is recorded, not
 * corrected.
 *
 * An ORDINARY enum (two_sided_heat_transfer, boundary_layer_model) drives no
 * group, so the popup passes it through raw and the form shows it raw too —
 * both ends agree and this function is the identity for them.
 */
export const readOnlyEnumValue = (type: string, property: string, value: string): string =>
  isSelectorEnum(type, property) ? humanizeProperty(value) : value

// ── Sub-models ──────────────────────────────────────────────────────────────

/**
 * The two material types whose parameters live behind a sub-model selector, and
 * the groups each selector value unlocks.
 *
 * `selector` is the driving property; each entry maps a STORED value to the
 * group it reveals — which is also the option LABEL the form shows for it (see
 * enumOptionLabels). `props` lists the parameters that appear only while that
 * value is chosen; every other sub-model's parameters are hidden AND blanked.
 */
export const SUBMODELS = {
  Photosynthesis: {
    selector: 'submodel',
    /** Top-level fields that stay visible whichever sub-model is chosen. */
    alwaysVisible: ['two_sided_heat_transfer', 'stomatal_sidedness', 'submodel'],
    groups: {
      farquhar_model: {
        label: 'Farquhar model',
        props: [
          'vcmax25', 'jmax25', 'tpu25', 'rd25', 'alpha', 'theta',
          'dha_vcmax', 'topt_vcmax', 'dha_jmax', 'topt_jmax', 'dhd_jmax',
          'dha_tpu', 'topt_tpu', 'dhd_tpu'
        ]
      }
    }
  },
  'Stomatal Conductance': {
    selector: 'stomatal_model',
    alwaysVisible: ['gamma_co2', 'stomatal_model'],
    groups: {
      BWB: { label: 'Ball-woodrow-berry', props: ['bwb_gs0', 'bwb_a1'] },
      BBL: { label: 'Ball-berry-leuning', props: ['bbl_gs0', 'bbl_a1', 'bbl_d0'] },
      Medlyn: { label: 'Medlyn Optimality', props: ['medlyn_gs0', 'medlyn_g1'] },
      BMF: { label: 'Buckley-mott-farquhar', props: ['bmf_em', 'bmf_i0', 'bmf_k', 'bmf_b'] }
    }
  }
} as const

/**
 * A value comfortably inside a property's catalog range, and DISTINCT per
 * property so a mis-wired assertion cannot pass by coincidence.
 *
 * Derived from the bounds rather than hardcoded: `min + (max - min) * frac`,
 * rounded to 4 decimals so it never trips the 7-decimal keystroke guard, and
 * never lands on a bound (which several other tests already cover).
 *
 * `frac` is varied by the caller — passing the property's index spreads the
 * values apart, so "did Vcmax_25's value land in Jmax_25's row?" is answerable.
 */
export const midRangeValue = (p: MaterialPropertyDef, frac = 0.5): string => {
  const min = p.min as number
  const max = p.max as number
  const raw = min + (max - min) * frac
  const rounded = Math.round(raw * 10000) / 10000
  return p.datatype === 'integer' ? String(Math.round(rounded)) : String(rounded)
}

/** Look one property definition up inside a type. */
export const propDef = (type: string, property: string): MaterialPropertyDef => {
  const found = (MATERIAL_CATALOG[type] ?? []).find((p) => p.property === property)
  if (!found) throw new Error(`propDef: ${type} has no property "${property}"`)
  return found
}
