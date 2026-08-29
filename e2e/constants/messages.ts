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

/**
 * Weather shift-click selection pill + its BULK delete confirmation.
 * Mirrors containers/Weather/messages.ts `selection` and `deleteSelectedRows`.
 *
 * The heading is the discriminator that matters: four dialogs in this app share
 * aria-label="Delete", and only the heading tells the bulk confirmation apart
 * from the single-row one ("Delete Row") when reading via support/dialogs.ts.
 */
export const WEATHER_SELECTION = {
  /** SelectionActionBar renders `{count} {summary(count)}` — the count is a sibling span. */
  summarySingular: 'row is selected',
  summaryPlural: 'rows are selected',
  pillDeleteButton: 'Delete',
  dialogTitle: 'Delete',
  heading: 'Delete Selected Rows',
  body: 'Are you sure you want to delete these rows? This action cannot be undone.',
  confirmButton: 'Delete',
  /** Note the real ellipsis character (U+2026), not three dots. */
  confirmButtonBusy: 'Deleting…',
  cancelButton: 'Cancel'
} as const

/**
 * Project-boot surfaces: the Opening loader, the boot error dialog, and the
 * scope-lost dialog. Mirrors containers/ProjectBoot/messages.ts.
 *
 * All three are addressed by `dialog[aria-label="<title>"][open]` — none of them
 * carries a data-testid, and the titles are unique across the app.
 *
 * `Retry` is rendered ONLY when the failure is retryable, which is
 * `!(400 <= status < 500)`. `Go to Home` is always present.
 */
export const BOOT_MSG = {
  loaderTitle: 'Opening',
  loaderCancel: 'Cancel',
  errorTitle: 'Could not open project',
  errorRetry: 'Retry',
  errorHome: 'Go to Home',
  errorGeneric: 'Something went wrong while opening this project.',
  scopeTitle: 'Project unavailable',
  scopeHome: 'Go to Home',
  scopeProject: 'This project no longer exists. It may have been deleted in another window.',
  scopeScenario: 'This scenario no longer exists. It may have been deleted in another window.'
} as const

/**
 * Server-sent progress captions during a project boot, in order.
 *
 * Recorded because the loader's caption comes from the BACKEND's `message`
 * field and nothing else — the frontend writes no fallback text. Note the
 * `done` event's own message ("Scenario ready") is never rendered: the saga
 * returns on isInitDone before dispatching progress, so the last caption a user
 * ever sees is `persist`, held at 100%.
 */
export const BOOT_PROGRESS_CAPTIONS = [
  'Loading scenario context',
  'Preparing geometry',
  'Saving scenario'
] as const
