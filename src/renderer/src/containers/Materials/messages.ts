// User-facing strings for the Materials feature.
const messages = {
  addMaterials: 'Add Materials',
  savedMaterials: 'Saved Materials',
  searchPlaceholder: 'Search...',
  loading: 'Loading materials…',
  openingMaterial: 'Opening material…',
  empty: 'No saved materials yet.',
  noMatches: 'No materials match your search.',
  loadError: 'Unable to load materials',
  // Rename validation / errors (match the backend §7 / §9 copy).
  nameRequired: 'Name is required',
  nameTooLong: 'Character limit exceeded',
  nameExists: 'Material name already exists',
  // Right-panel material Properties form.
  parameterGroups: 'Material Types',
  // A numbered material-type header, e.g. "Material Type.01".
  parameterGroupTitle: (n: number): string => `Material Type.${String(n).padStart(2, '0')}`,
  // Property-field validation (mirrors the Geometry right-panel form). An empty
  // REQUIRED field shows "Required Field"; a non-numeric or non-whole-number value
  // shows "Invalid Input"; an out-of-range value shows the range; the keystroke
  // guards reuse the shared decimal copy.
  //
  // Word-for-word the Geometry form's REQUIRED_MESSAGE — the two right-panel forms
  // are the same control to the user, so they must not phrase this differently.
  fieldRequired: 'Required Field',
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
  // The visible label on the header's add pill — the "+" carries the "Add".
  materialType: 'Material Type',
  // Visualisation colour/texture editor (the Visualiser type's card body).
  visualisationCustomTab: 'Custom',
  visualisationTextureTab: 'Select Texture',
  rgbValues: 'RGB Values',
  opacityLabel: 'Opacity',
  usedColors: 'Used colors',
  colorAreaLabel: 'Saturation and brightness',
  hueSliderLabel: 'Hue',
  opacitySliderLabel: 'Opacity',
  usedColorSwatch: (hex: string): string => `Use colour ${hex}`,
  // Texture sub-tabs.
  textureFromLibraryTab: 'From Library',
  textureUploadTab: 'Upload File',
  textureUploadButton: 'Upload File',
  textureLibraryLoading: 'Loading textures…',
  textureLibraryEmpty: 'No textures available.',
  textureLibraryError: 'Unable to load textures',
  textureSwatch: (name: string): string => `Use texture ${name}`,
  texturePreviewAlt: 'Selected texture',
  textureUploading: 'Uploading…',
  textureUploadError: 'Unable to upload texture',
  textureFileTypeError: 'Only JPG, JPEG or PNG files are allowed',
  textureFileSizeError: 'File must be 10 MB or smaller',
  // The name says .png/.jpg but the file's own contents say otherwise — usually a
  // renamed document rather than anything malicious.
  textureFileContentError: 'This file is not a valid JPG, JPEG or PNG image',
  // Radiation bespoke editor (spectral toggle + per-band optics).
  applySpectralData: 'Apply spectral data',
  spectralDataFile: 'Spectral Data File',
  spectralUploadButton: 'Upload Here',
  spectralUploading: 'Uploading…',
  spectralFileTypeError: 'Only XML files are allowed',
  spectralFileSizeError: 'File must be 5 MB or smaller',
  spectralRemove: 'Remove spectral data file',
  bandReflectivity: 'Reflectivity',
  bandTransmissivity: 'Transmissivity',
  bandEmissivity: 'Emissivity',
  // Shown on all three band fields when their values add up past 1.
  bandSumExceedsOne: "The sum of reflectivity, transmissivity and emissivity can't exceed 1.",
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
  // Word-for-word the Geometry delete body (Geometry/messages.ts deleteBody), so
  // the confirm dialog reads identically whichever thing is being deleted.
  deleteBody: 'Are you sure you want to delete this? This action cannot be undone.',
  deleteCancel: 'Cancel',
  deleteConfirm: 'Delete',
  // Delete outcome toasts, matching Geometry's copy. Success confirms which
  // material went; failure says why nothing happened (the row stays — the delete
  // is pessimistic). The failure toast is the ONLY report: the raw backend text is
  // deliberately not put on the slice for a delete.
  deleteSuccess: (name: string): string => `Deleted "${name}"`,
  deleteFailure: (name: string): string => `Failed to delete "${name}"`
} as const

export default messages
