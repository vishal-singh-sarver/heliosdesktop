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
  // Read-only material properties popup, opened from a picked material's name
  // under the Materials row. The heading is the material's own name — it says
  // what you're looking at; a generic "Material Properties" would not.
  materialDetailTitle: (name: string) => `${name} properties`,
  materialDetailClose: 'Close material properties',
  // The read-only label above a section's material type — the stand-in for the
  // editable Material form's "Parameter Group" type Select.
  materialDetailTypeLabel: 'Parameter Group',
  // Shown while `sections` is empty. Deliberately NOT "this material has no
  // properties" — the values aren't fetched yet, so claiming the material is
  // empty would be a lie the user can't act on. Says what's true today.
  materialDetailEmpty: 'Material properties are not connected yet.',
  // Delete confirmation
  deleteTitle: 'Delete',
  deleteHeading: (name: string) => `Delete ${name}`,
  deleteBody: 'Are you sure you want to delete this? This action cannot be undone.',
  deleteConfirm: 'Delete',
  deleteCancel: 'Cancel',
  // Material drag-and-drop assignment outcome toasts. Success names both the
  // material and the geometry/group it landed on; failure names the material.
  assignMaterialSuccess: (materialName: string, targetName: string) =>
    `${materialName} is added in ${targetName}`,
  assignMaterialFailure: (name: string) => `Failed to assign "${name}"`,
  // Unassign-material confirmation — shown by the per-material trash icon ONLY for
  // a material already saved on the ground (unassigning it deletes backend
  // progress). A draft-only pick is removed silently.
  unassignTitle: 'Unassign Material',
  unassignHeading: (name: string) => `Are you sure you want to unassign "${name}"?`,
  unassignBody: 'This action will delete any progress made using this material.',
  unassignConfirm: 'Unassign',
  unassignCancel: 'Cancel'
} as const

export default messages
