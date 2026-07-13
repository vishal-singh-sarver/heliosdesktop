// User-facing strings for the Materials feature.
const messages = {
  addMaterials: 'Add Materials',
  savedMaterials: 'Saved Materials',
  searchPlaceholder: 'Search...',
  loading: 'Loading materials…',
  empty: 'No saved materials yet.',
  noMatches: 'No materials match your search.',
  loadError: 'Unable to load materials',
  // Rename validation / errors (match the backend §7 / §9 copy).
  nameRequired: 'Name is required',
  nameTooLong: 'Character limit exceeded',
  nameExists: 'Material name already exists',
  // Right-panel material Properties form.
  parameterGroups: 'Parameter Groups',
  // A numbered parameter-group header, e.g. "Parameter Group.01".
  parameterGroupTitle: (n: number): string => `Parameter Group.${String(n).padStart(2, '0')}`,
  // Property-field validation (mirrors the Geometry right-panel form). A
  // non-numeric or non-whole-number value shows "Invalid Input"; an out-of-range
  // value shows the range; the keystroke guards reuse the shared decimal copy.
  fieldInvalid: 'Invalid Input',
  decimalLimit: 'Only 7 Decimal places are supported',
  inputNotSupported: 'This input is not supported',
  valuesBetween: (min: number | null, max: number | null): string => {
    if (min != null && max != null) return `Values should be between ${min}-${max}`
    if (min != null) return `Value should be at least ${min}`
    if (max != null) return `Value should be at most ${max}`
    return 'Invalid Input'
  },
  selectPlaceholder: 'Select',
  addMaterialType: 'Add Material Type',
  // Each Parameter Group card saves itself: the first save adds its material type
  // to the group, later ones update it.
  saveParameterGroup: 'Save',
  savingParameterGroup: 'Saving…',
  createError: 'Unable to create material. Please try again',
  noMaterialTypes: 'No material types available',
  allTypesAdded: 'All material types added',
  // Delete confirmation (matches the Geometry object-form copy).
  deleteTitle: 'Delete material',
  deleteHeading: (name: string): string => `Delete "${name}"?`,
  deleteBody: 'This action cannot be undone.',
  deleteCancel: 'Cancel',
  deleteConfirm: 'Delete'
} as const

export default messages
