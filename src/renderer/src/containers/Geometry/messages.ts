// User-facing strings for the Geometry feature. Validation/error copy lives
// here (not inline) so it stays consistent and translatable.
const messages = {
  loadError: 'Unable to load Geometries',
  emptyTree: 'No saved geometries yet.',
  noMatches: 'No geometries found',
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
  // Read-only material properties popup, opened from a picked material's name
  // under the Materials row. The heading is the material's own name — it says
  // what you're looking at; a generic "Material Properties" would not.
  materialDetailTitle: (name: string) => `${name} properties`,
  materialDetailClose: 'Close material properties',
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
  // Replace-material confirmation — a geometry (or a group's members) already
  // carries a DIFFERENT material and an assignment would displace it. `target` is
  // the row the material landed on: the geometry's name for a leaf, the group's
  // own name for a group drop (the same name the success toast uses).
  replaceMaterialTitle: 'Replace Material',
  replaceMaterialHeading: (target: string) =>
    `Are you sure you want to replace the material already assigned to ${target}?`,
  replaceMaterialConfirm: 'Replace',
  replaceMaterialCancel: 'Cancel',
  // Re-assigning the material a target ALREADY carries: nothing to replace and
  // nothing to POST, so it's an info toast rather than a success one — no change
  // was made.
  materialAlreadyAssigned: (target: string) => `This material is already assigned to ${target}`,
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
