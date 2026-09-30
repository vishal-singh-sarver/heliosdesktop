/**
 * Exact validation / copy strings asserted by the functional tests, verbatim
 * from the app source. Single source of truth — when the app copy changes, update
 * it HERE once instead of hunting through every spec.
 *
 * These back the *functional* validation-message assertions (a required-field or
 * out-of-range message IS the behavior under test). Pure decorative copy (dialog
 * titles, labels, placeholders) is intentionally NOT catalogued here — those
 * display-only assertions were removed from the suite.
 *
 * TOAST copy is a third category and IS catalogued here, in the `*_TOAST` blocks,
 * mirroring the geometry/materials split (`*_MSG` for validation, `*_TOAST` for
 * the snackbar). A toast is functional: it is the only report the user gets that
 * a write landed or failed, and for several paths it is the only report at all.
 *
 * ── HAND-MIRRORED, NEVER IMPORTED ─────────────────────────────────────────
 * e2e/tsconfig.json includes only e2e/**, so nothing here can import from src/.
 * Source of truth for every `*_TOAST` block is src/renderer/src/store/
 * toastMessages.ts — NOT a feature's own messages.ts, several of whose toast
 * entries are dead code that never reaches the DOM.
 *
 * ── waitForToast MATCHES BY SUBSTRING ─────────────────────────────────────
 * support/toasts.ts:34 is `m.includes(text)`. Always assert the FULL templated
 * string; a fragment can be satisfied by another entity's toast. Two collisions
 * exist today and both are live: GEOMETRY_TOAST.created and MATERIALS_TOAST.created
 * render the IDENTICAL string (`"X" has been successfully created.`), and that
 * string is a SUBSTRING of PROJECT_TOAST.deleted (`Project "X" has been
 * successfully deleted.`).
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

/**
 * Project toast copy, from store/toastMessages.ts — NOT from HomePage/messages.ts.
 * Toasts auto-dismiss after 2500ms (+160ms exit), so assert immediately after the
 * triggering action.
 *
 * There is deliberately NO `created` entry: creating a project raises no toast
 * (HomePage/saga.ts has no showSnackbar on that path).
 *
 * `renamed` reports the OLD name from the GET the saga makes BEFORE the PATCH
 * (HomePage/saga.ts:117), so a caller must pass the name as it was, not as it is.
 */
export const PROJECT_TOAST = {
  renamed: (from: string, to: string) =>
    `Project "${from}" has been successfully renamed to "${to}".`,
  renameFailed: (name: string) => `Project "${name}" could not be renamed.`,
  deleted: (name: string) => `Project "${name}" has been successfully deleted.`,
  deleteFailed: (name: string) => `Project "${name}" could not be deleted.`
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

/**
 * Weather toast copy, from store/toastMessages.ts. Auto-dismiss ~2.66s, so the
 * read must be the NEXT statement after the action that raises it.
 *
 * Two sagas feed this one block — the FILE entries come from Weather/saga.ts
 * (:354/:367/:370 upload, :417/:422/:425 delete) and the TABLE entries from
 * ProjectScreen/saga.ts (:570-:588 rows add, :625/:628 column add,
 * :759/:764 column delete, :777/:782 and :800/:803 rows delete). They are kept
 * together because a user meets them all on the Weather tab.
 *
 * ROW MESSAGES PLURALISE. toastMessages.ts:19-25 renders count 1 as
 * "Row has been successfully added." and any other count as
 * "N rows have been successfully added." Reproduced here rather than simplified:
 * a mirror that only emits the plural form silently never matches a 1-row action,
 * and the single-row trash goes through the BULK path with keys.length === 1
 * (WeatherTable.tsx:552-556), so the singular form is reachable two ways.
 *
 * `fileDeleted`/`fileDeleteFailed` name the IMPORTED file, read from
 * `selectDataset` (Weather/saga.ts:377). That store entry is written ONLY by
 * IMPORT_FINALIZE_SUCCEEDED (reducer.ts:138) and is wiped by a refresh — so on a
 * scenario seeded with addRows rather than an import, the filename is the EMPTY
 * STRING. Pass '' for that case; it is the shipped behaviour, not a test bug.
 */
const rowCount = (count: number, verb: string): string =>
  count === 1
    ? `Row has been successfully ${verb}.`
    : `${count} rows have been successfully ${verb}.`

const rowCountFailed = (count: number, verb: string): string =>
  count === 1 ? `Row could not be ${verb}.` : `${count} rows could not be ${verb}.`

export const WEATHER_TOAST = {
  // ── The imported file ────────────────────────────────────────────────────
  fileUploaded: (file: string) => `Weather file "${file}" has been successfully uploaded.`,
  fileUploadFailed: (file: string) => `Weather file "${file}" could not be uploaded.`,
  fileDeleted: (file: string) => `Weather file "${file}" has been successfully deleted.`,
  fileDeleteFailed: (file: string) => `Weather file "${file}" could not be deleted.`,

  // ── The table ────────────────────────────────────────────────────────────
  columnAdded: (name: string) => `Column "${name}" has been successfully added.`,
  columnAddFailed: (name: string) => `Column "${name}" could not be added.`,
  columnDeleted: (name: string) => `Column "${name}" has been successfully deleted.`,
  columnDeleteFailed: (name: string) => `Column "${name}" could not be deleted.`,
  rowsAdded: (count: number) => rowCount(count, 'added'),
  rowsAddFailed: (count: number) => rowCountFailed(count, 'added'),
  rowsDeleted: (count: number) => rowCount(count, 'deleted'),
  rowsDeleteFailed: (count: number) => rowCountFailed(count, 'deleted')
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
