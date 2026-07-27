// User-facing strings for the Geometry feature. Validation/error copy lives
// here (not inline) so it stays consistent and translatable.
const messages = {
  loadError: 'Unable to load Geometries',
  emptyTree: 'No saved geometries yet.',
  noMatches: 'No geometries match your search.',
  // Rename validation / errors
  nameRequired: 'Name is required',
  nameTooLong: 'Character limit exceeded',
  nameExists: 'Geometry name already exists',
  renameFailed: 'Unable to rename group. Please try again',
  createFailed: 'Unable to create geometry. Please try again',
  // Field-value validation copy. A value that fails the catalog range shows the
  // range message; any other invalid input (non-numeric, or a decimal in an
  // integer field) shows the generic "Invalid Input". Built from each field's
  // catalog min/max so the message always reflects the real bounds.
  invalidInput: 'Invalid Input',
  valuesBetween: (min: number, max: number) => `Values should be between (${min} - ${max})`,
  valuesAtLeast: (min: number) => `Values should be greater than or equal to ${min}`,
  valuesAtMost: (max: number) => `Values should be less than or equal to ${max}`,
  // Per-keystroke input guards (story copy). Geometry-specific so they don't
  // change the shared decimalValidation copy used elsewhere (e.g. Weather).
  decimalLimit: 'Only 7 Decimal places are supported',
  inputNotSupported: 'This input is not supported',
  // Cross-field rule: a Texture Repeat count tiles across the ground surface, so
  // it can't exceed the matching Ground Resolution. Spelling out the rule and
  // the exact ceiling tells the user what's wrong and how to fix it (instead of
  // a bare "Invalid Input").
  textureExceedsResolution: (max: number) =>
    `Texture repeat can't exceed the ground resolution (${max})`,
  // Delete confirmation
  deleteTitle: 'Delete',
  deleteHeading: (name: string) => `Delete ${name}`,
  deleteBody: 'Are you sure you want to delete this? This action cannot be undone.',
  deleteConfirm: 'Delete',
  deleteCancel: 'Cancel'
} as const

export default messages
