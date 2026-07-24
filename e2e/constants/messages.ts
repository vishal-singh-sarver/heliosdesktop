/**
 * Exact validation / copy strings asserted by the functional tests, verbatim
 * from the app source. Single source of truth — when the app copy changes, update
 * it HERE once instead of hunting through every spec.
 *
 * These back the *functional* validation-message assertions (a required-field or
 * out-of-range message IS the behavior under test). Pure decorative copy (dialog
 * titles, labels, placeholders) is intentionally NOT catalogued here — those
 * display-only assertions were removed from the suite.
 */

/** HomePage create/rename project-form validation. */
export const PROJECT_MSG = {
  nameRequired: 'Project name is required.',
  nameTooLong: 'Project name must be 30 characters or fewer.',
  latRequired: 'Latitude is required.',
  latRegex: 'Invalid latitude',
  latRange:
    'Invalid latitude. Enter latitude in decimal degrees. Valid range: -90 <= latitude <= 90.',
  latDecimals: 'Latitude can have at most 7 decimal places.',
  lonRequired: 'Longitude is required.',
  lonRegex: 'Invalid longitude',
  lonRange:
    'Invalid longitude. Enter longitude in decimal degrees. Valid range: -180 <= longitude <= 180.',
  lonDecimals: 'Longitude can have at most 7 decimal places.',
  duplicate: 'A project with this name already exists'
} as const

/** Weather Add-Column / Add-Rows / cell validation. */
export const WEATHER_MSG = {
  columnNameRequired: 'Column name is required.',
  columnNameTooLong: 'Column name must have 30 characters or fewer.',
  defaultNotNumber: 'Default value must be a number.',
  defaultTooManyDecimals: 'Default value can have at most 7 decimal places.',
  duplicateColumn: 'already exists',
  rowsRequired: 'Number of rows is required.',
  rowsTooMany: 'Number of rows must be 10000 or fewer.',
  startDateRequired: 'Start date is required.',
  startDateYearRange: 'Start date year must be between 1900 and 3000.',
  startTimeRequired: 'Start time is required.',
  startTimeFormat: 'Start time must be in 24-hour format (00:00–23:59).',
  deltaRequired: 'Delta is required.',
  deltaTooLarge: 'Delta must be 24 hours or fewer.'
} as const

/** Delete-Data (import) confirmation dialog copy + button labels. */
export const DELETE_IMPORT = {
  dialogTitle: 'Delete',
  heading: 'Delete Data',
  body: 'Are you sure you want to delete this? This action cannot be undone.',
  confirmButton: 'Delete',
  cancelButton: 'Cancel'
} as const

/** Import-wizard parse / gating banners. */
export const IMPORT_MSG = {
  invalidFile: 'Invalid file',
  parseError: 'Parse error',
  importFailed: 'Import failed',
  duplicate: 'Duplicate',
  couldNotOpen: 'Could not open file.',
  charColumnsDisabled: 'Character-based columns are disabled'
} as const
