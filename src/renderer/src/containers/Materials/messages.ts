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
  selectPlaceholder: 'Select',
  addMaterialType: 'Add Material Type',
  saveMaterial: 'Save Material',
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
