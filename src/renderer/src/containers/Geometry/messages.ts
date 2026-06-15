// User-facing strings for the Geometry feature. Validation/error copy lives
// here (not inline) so it stays consistent and translatable.
const messages = {
  savedGeometries: 'Saved Geometries',
  searchPlaceholder: 'Search...',
  loadError: 'Unable to load Geometries',
  emptyTree: 'No saved geometries yet.',
  noMatches: 'No geometries match your search.',
  // Rename validation / errors
  nameRequired: 'Name is required',
  nameTooLong: 'Character limit exceeded',
  nameExists: 'Geometry name already exists',
  renameFailed: 'Unable to rename group. Please try again',
  // Per-keystroke input guards (story copy). Geometry-specific so they don't
  // change the shared decimalValidation copy used elsewhere (e.g. Weather).
  decimalLimit: 'Only 7 Decimal places are supported',
  inputNotSupported: 'This input is not supported',
  // Delete confirmation
  deleteTitle: 'Delete geometry',
  deleteConfirm: 'Delete',
  deleteCancel: 'Cancel'
} as const

export default messages
