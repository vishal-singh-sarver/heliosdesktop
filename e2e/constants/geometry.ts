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
  /**
   * A GROUP-onto-GROUP clash reports its OWN string, not the geometry one.
   * `validation.ts` routes the group namespace to `messages.groupNameExists`
   * (added by fdb9504) precisely so a group conflict never names a geometry the
   * user would then hunt for. Use this for group renames; `nameExists` above is
   * for geometries.
   */
  groupNameExists: 'Group name already exists',

  // Hover hints (native `title`) on every name a double-click renames: the
  // Properties form header while it is locked, and each tree row. 10a5a51
  // removed the pencil and put the gesture here instead.
  renameHint: 'Double-click to rename the geometry.',
  renameGroupHint: 'Double-click to rename the group.',

  // Field validation. The range message is built from the CATALOG's min/max,
  // so specs should compose it from values read at runtime rather than
  // hardcoding bounds that a backend migration can move.
  required: 'Required Field',
  /**
   * REACHABLE, by exactly one route: an INCOMPLETE EXPONENT left in the field.
   *
   * This used to read "SUSPECTED DEAD", which was wrong. Type `1e` and blur:
   * the keystroke guard admits it (isPartialNumericInput has to, or an error
   * would flash on the 'e' of a valid "1e3"), expandForDisplay leaves it alone
   * because it is not a complete number, and the blur therefore commits a value
   * Number() reads as NaN — validateFieldValue's non-finite branch, i.e. this
   * string. Works on float and integer fields alike; the guard refuses the '.'
   * character, not 'e'.
   *
   * Every OTHER candidate really is pre-empted: a letter, or a '.' added to an
   * integer field, is refused by handleFieldChange first and reports
   * inputNotSupported. So assert this only for the exponent case.
   * Covered by e2e/tests/ground.test.ts, describe('an incomplete exponent').
   */
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

  // Delete confirmation.
  //
  // DEVIATION (two of them, both against the manual spec's Story 14):
  //  - the spec asks for "Are you sure you want to delete this geometry? This
  //    will delete the existing data and progress." The shipped body is generic
  //    and mentions neither the geometry nor its data.
  //  - the spec asks for "Yes" and "Cancel". The shipped buttons are "Cancel"
  //    and "Delete", in that DOM order — which matters beyond the wording,
  //    because components/Dialog focuses the LAST enabled body button on open
  //    and triggers it on Enter. Opening this dialog and pressing Enter deletes.
  //
  // The HEADING depends on where the dialog was opened from, which is a real
  // product inconsistency: the tree row builds its own sentence (quoted, with a
  // question mark, and a member count for a group), while the right-hand
  // Properties form uses messages.deleteHeading — `Delete Ground.001`, no
  // quotes, no question mark.
  deleteTitle: 'Delete',
  deleteBody: 'Are you sure you want to delete this? This action cannot be undone.',
  deleteCancel: 'Cancel',
  deleteConfirm: 'Delete',
  /** Tree-row heading for a leaf. */
  deleteHeadingRow: (name: string) => `Delete "${name}"?`,
  /** Tree-row heading for a group, which names how many geometries go with it. */
  deleteHeadingGroup: (name: string, children: number) =>
    `Delete "${name}" and its ${children} ${children === 1 ? 'geometry' : 'geometries'}?`,
  /** Right-panel (Properties form) heading. Deliberately different grammar. */
  deleteHeadingForm: (name: string) => `Delete ${name}`,

  objectDeletedNotice: 'This geometry was deleted. Close the panel.'
} as const

/**
 * The Geometry panel's own chrome copy.
 *
 * DEVIATION: the manual spec calls these "Add Crop" / "Add Ground" / "Import
 * from File". The "+" is an ICON on each ToolbarButton and the labels carry no
 * "Add" prefix, so a test looking for "Add Ground" finds nothing.
 */
export const GEOMETRY_PANEL = {
  addCrop: 'Crop',
  addGround: 'Ground',
  importFromFile: 'Import from File',
  savedGeometries: 'Saved Geometries',
  /** The three left-panel accordion titles, in render order. */
  sections: ['Geometry', 'Materials', 'Models'] as string[],
  /**
   * The chevron's inline transform. One down-pointing asset, rotated when open.
   *
   * DEVIATION: the spec says the DEFAULT state points DOWN and flips UP when
   * expanded. The rotation mapping is exactly that — but all three sections
   * ship EXPANDED, so on first mount every chevron already points up and the
   * spec's default state is never seen.
   */
  chevronOpen: 'rotate(180deg)',
  /** Accordion writes the literal `none`, not an empty string, when closed. */
  chevronClosed: 'none'
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
  saved: 'Changes have been successfully saved',
  /**
   * Material assignment, from store/toastMessages.ts (saga.ts:451/453).
   *
   * DEAD COPY WARNING — Geometry/messages.ts also defines
   * `assignMaterialSuccess` ("X is added in Y") and `assignMaterialFailure`,
   * and NEITHER ships: nothing references them. Same trap as `deleteSuccess` /
   * `deleteFailure` / `createFailed` / `renameFailed` in that file. A test
   * written from the feature's messages.ts fails; always mirror the toast from
   * store/toastMessages.ts.
   */
  materialAssigned: (material: string, geometry: string) =>
    `Material "${material}" has been successfully assigned to "${geometry}".`,
  materialAssignFailed: (material: string, geometry: string) =>
    `Material "${material}" could not be assigned to "${geometry}".`
} as const

/**
 * The ground form's Materials section: the picker, the assigned rows, and the
 * two dialogs that belong to material assignment.
 *
 * Verified against containers/Geometry/messages.ts and SelectMaterialsPopup.tsx.
 */
export const GEOMETRY_MATERIAL_MSG = {
  // Picker chrome.
  selectButton: 'Select',
  pickerTitle: 'Select Materials',
  searchLabel: 'Search materials',
  /** Shared with the Materials panel — one string so the two cannot drift. */
  noMatches: 'No materials found',
  // The EMPTY-LIBRARY shape, which has no radiogroup at all.
  emptyTitle: 'No Material Found',
  emptyBody: 'No Record Found. Please add a new Material.',
  addNewMaterial: 'Add New Material',

  // Re-picking the material a ground already carries: an INFO toast, not a
  // success one — nothing was posted and nothing changed.
  alreadyAssigned: (target: string) => `This material is already assigned to ${target}`,

  // Unassign confirmation (a material's trash), shown ONLY for a material
  // already saved on the ground; a draft-only pick is removed silently.
  unassignTitle: 'Unassign Material',
  unassignHeading: (name: string) => `Are you sure you want to unassign "${name}"?`,
  unassignBody: 'This action will delete any progress made using this material.',
  unassignConfirm: 'Unassign',
  unassignCancel: 'Cancel',

  // Replace confirmation. NOTE it is raised by SAVE — the point at which the
  // displaced material is actually unassigned — NOT by picking in the popup.
  replaceTitle: 'Replace Material',
  replaceHeading: (target: string) =>
    `Are you sure you want to replace the material already assigned to ${target}?`,
  replaceConfirm: 'Replace',
  replaceCancel: 'Cancel',

  // The read-only properties popup opened from an assigned material's name.
  detailTitle: (name: string) => `${name} properties`,
  detailClose: 'Close material properties',
  detailEmpty:
    'No Material type is assigned to this Material. Assign one to see its properties.',

  // The amber sync dot's two titles — the only place either state is exposed.
  staleTitle: 'This material group was removed from the library',
  driftTitle: 'Values differ from the material library'
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
   * then every remaining test in the file.
   *
   * SCOPE: this bounds the SUBDIVISION COUNT and nothing else. It used to end
   * "boundary cases assert VALIDATION state only and never press Save", which
   * read as a rule over every field — and that is why no ground had ever been
   * SAVED at its length/breadth/position/rotation maxima, for a cost that does
   * not exist. Mesh size is cells, not extent: a 1,000,000 x 1,000,000 ground at
   * resolution 2x2 is four triangles. Only a RESOLUTION boundary must stop at
   * validation; the rest are free to save, and ground.test.ts now does
   * ("a ground at its catalog maxima").
   */
  MAX_SAVEABLE_RESOLUTION_CELLS: 100
} as const

/** Auto-naming is `Ground.NNN` / `Group.NNN`, zero-padded to 3, GAP-FILLING. */
export const geometryName = (n: number): string => `Ground.${String(n).padStart(3, '0')}`
export const groupName = (n: number): string => `Group.${String(n).padStart(3, '0')}`
