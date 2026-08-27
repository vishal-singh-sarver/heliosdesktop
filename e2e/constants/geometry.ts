/**
 * Geometry feature copy + limits, mirrored from the app.
 *
 * Hand-mirrored on purpose: e2e/tsconfig.json includes only e2e/**, so these
 * cannot be imported from src/. Same reason e2e/constants/messages.ts exists.
 * Sources:
 *   src/renderer/src/containers/Geometry/messages.ts
 *   src/renderer/src/containers/Geometry/validation.ts   (MAX_NAME_LENGTH)
 *   src/renderer/src/containers/Geometry/propertyBlueprint.ts (REQUIRED_MESSAGE)
 *
 * WARNING — not every string in the app's messages.ts actually ships. Several
 * entries there have no production reference and the real toast copy comes from
 * src/renderer/src/store/toastMessages.ts. Only strings verified to reach the
 * DOM belong here; see GEOMETRY_TOAST below for the ones that do.
 */

/** Copy rendered by the Geometry panel, tree and Properties form. */
export const GEOMETRY_MSG = {
  loadError: 'Unable to load Geometries',
  emptyTree: 'No saved geometries yet.',
  noMatches: 'No geometries found',

  // Rename validation (Geometry/validation.ts validateGroupName).
  nameRequired: 'Name is required',
  nameTooLong: 'Character limit exceeded',
  nameExists: 'Geometry name already exists',

  // Field validation. The range message is built from the CATALOG's min/max,
  // so specs should compose it from values read at runtime rather than
  // hardcoding bounds that a backend migration can move.
  required: 'Required Field',
  invalidInput: 'Invalid Input',
  valuesBetween: (min: number, max: number) => `Values should be between (${min} - ${max})`,
  valuesAtLeast: (min: number) => `Values should be greater than or equal to ${min}`,
  valuesAtMost: (max: number) => `Values should be less than or equal to ${max}`,

  // Per-keystroke guards — these REJECT the keystroke, so the field keeps its
  // previous value. A test must type character-by-character to observe them;
  // a single native-setter write is not a keystroke and bypasses the guard.
  decimalLimit: 'Only 7 Decimal places are supported',
  inputNotSupported: 'This input is not supported',

  // Texture Repeat divisor rule.
  textureExceedsResolution: (max: number) =>
    `Texture repeat can't exceed the ground resolution (${max})`,
  repeatSnapped: (to: number, count: number) =>
    `Snapped to ${to} (must divide Resolution of ${count})`,
  repeatSnappedToMin: (min: number) => `Snapped to ${min} (minimum is ${min})`,
  repeatAdjusted: (from: number, to: number, count: number) =>
    `Repeat adjusted ${from} → ${to} (must divide Resolution of ${count})`,

  // Delete confirmation. NOTE the grammar differs from Materials', which is
  // `Delete "<name>"?` — same dialog title, different heading.
  deleteTitle: 'Delete',
  deleteBody: 'Are you sure you want to delete this? This action cannot be undone.',

  objectDeletedNotice: 'This geometry was deleted. Close the panel.'
} as const

/**
 * Toast copy that actually ships, from store/toastMessages.ts — NOT from the
 * feature's messages.ts, several of whose toast entries are dead code.
 * Toasts auto-dismiss after 2500ms (+160ms exit), so assert immediately after
 * the triggering action.
 */
export const GEOMETRY_TOAST = {
  created: (name: string) => `"${name}" has been successfully created.`,
  createFailed: 'Ground could not be created.',
  deleted: (name: string) => `"${name}" has been successfully deleted.`,
  saved: 'Changes have been successfully saved'
} as const

/**
 * Ground field bounds, read from the LIVE backend catalog
 * (GET /api/catalog/object-types) on 2026-08-27 against backend 91b4099.
 *
 * The frontend reads these at runtime, so a backend migration can move them
 * without any frontend change. Specs that assert a range message should read
 * the catalog rather than trust this table; it is here for picking test VALUES
 * (a known-good number, a known-bad number), not as an oracle.
 *
 * All bounds are INCLUSIVE — the manual test spec's "must be strictly greater
 * than 1" is wrong for both ground size (>= 0.01) and texture repeat (>= 1).
 */
export const GROUND_BOUNDS = {
  length: { datatype: 'float', min: 0.01, max: 1_000_000, required: true },
  breadth: { datatype: 'float', min: 0.01, max: 1_000_000, required: true },
  resolution_x: { datatype: 'integer', min: 1, max: 25_000, required: true },
  resolution_y: { datatype: 'integer', min: 1, max: 25_000, required: true },
  position_x: { datatype: 'float', min: -1_000_000, max: 1_000_000, required: true },
  position_y: { datatype: 'float', min: -1_000_000, max: 1_000_000, required: true },
  position_z: { datatype: 'float', min: -1_000_000, max: 1_000_000, required: true },
  rotation_z: { datatype: 'float', min: 0, max: 360, required: true },
  texture_x: { datatype: 'integer', min: 1, max: null, required: true },
  texture_y: { datatype: 'integer', min: 1, max: null, required: true }
} as const

export const GEOMETRY_LIMITS = {
  NAME_MAX: 20,
  nameValid: 'a'.repeat(20),
  nameTooLong: 'a'.repeat(21),
  DECIMALS_MAX: 7,
  decimals7: '1.1234567',
  decimals8: '1.12345678',

  /** +Ground blueprint defaults, POSTed by the saga at create time. */
  DEFAULT_SIZE: '10',
  DEFAULT_RESOLUTION: '1',
  DEFAULT_POSITION: '0',
  DEFAULT_ROTATION: '0',
  DEFAULT_TEXTURE_REPEAT: '1',

  /**
   * SAFETY CEILING — do NOT save a ground whose resolution_x * resolution_y
   * exceeds this in e2e. The 3D window is always mounted and fetches the built
   * mesh with no timeout; a 1000x1000 ground is ~228MB and a max-boundary
   * 25000x25000 save would wedge the runner for the whole 120s mocha budget,
   * then every remaining test in the file. Boundary cases assert VALIDATION
   * state only and never press Save.
   */
  MAX_SAVEABLE_RESOLUTION_CELLS: 100
} as const

/** Auto-naming is `Ground.NNN` / `Group.NNN`, zero-padded to 3, GAP-FILLING. */
export const geometryName = (n: number): string => `Ground.${String(n).padStart(3, '0')}`
export const groupName = (n: number): string => `Group.${String(n).padStart(3, '0')}`
