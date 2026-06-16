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
  // Delete confirmation
  deleteTitle: 'Delete geometry',
  deleteConfirm: 'Delete',
  deleteCancel: 'Cancel'
} as const

export default messages
