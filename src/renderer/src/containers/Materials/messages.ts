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
  nameExists: 'Material name already exists'
} as const

export default messages
