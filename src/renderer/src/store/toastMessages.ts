/*
 * Toast copy
 *
 * Every app-wide notification's wording, in one place. These messages come from
 * a single design spec and share one voice — "<Thing> "<name>" has been
 * successfully <verb>." — so they live together rather than scattered across each
 * feature's messages.ts, where they would drift apart a phrase at a time.
 *
 * Feature-local copy (field validation, dialog bodies, empty states) stays in
 * that feature's own messages.ts. This file is only for what the snackbar says.
 *
 * Each success has a matching failure. The failure names the same thing and says
 * plainly that it did not happen — never a bare "Error", which leaves the user
 * guessing which of their actions is the one that failed.
 */

// Rows are the only thing acted on in bulk, so they're the only messages that
// need to count. Both forms read naturally at 1 rather than saying "1 rows".
const rowCount = (count: number, verb: string): string =>
  count === 1
    ? `Row has been successfully ${verb}.`
    : `${count} rows have been successfully ${verb}.`

const rowCountFailed = (count: number, verb: string): string =>
  count === 1 ? `Row could not be ${verb}.` : `${count} rows could not be ${verb}.`

const toastMessages = {
  // ── Project ────────────────────────────────────────────────────────────────
  projectRenamed: (from: string, to: string): string =>
    `Project "${from}" has been successfully renamed to "${to}".`,
  projectRenameFailed: (name: string): string => `Project "${name}" could not be renamed.`,
  projectDeleted: (name: string): string => `Project "${name}" has been successfully deleted.`,
  projectDeleteFailed: (name: string): string => `Project "${name}" could not be deleted.`,

  // ── Weather file ───────────────────────────────────────────────────────────
  weatherFileUploaded: (file: string): string =>
    `Weather file "${file}" has been successfully uploaded.`,
  weatherFileUploadFailed: (file: string): string =>
    `Weather file "${file}" could not be uploaded.`,
  weatherFileDeleted: (file: string): string =>
    `Weather file "${file}" has been successfully deleted.`,
  weatherFileDeleteFailed: (file: string): string => `Weather file "${file}" could not be deleted.`,

  // ── Weather table ──────────────────────────────────────────────────────────
  columnAdded: (name: string): string => `Column "${name}" has been successfully added.`,
  columnAddFailed: (name: string): string => `Column "${name}" could not be added.`,
  columnDeleted: (name: string): string => `Column "${name}" has been successfully deleted.`,
  columnDeleteFailed: (name: string): string => `Column "${name}" could not be deleted.`,
  rowsAdded: (count: number): string => rowCount(count, 'added'),
  rowsAddFailed: (count: number): string => rowCountFailed(count, 'added'),
  rowsDeleted: (count: number): string => rowCount(count, 'deleted'),
  rowsDeleteFailed: (count: number): string => rowCountFailed(count, 'deleted'),

  // ── Geometry ───────────────────────────────────────────────────────────────
  groundCreated: (name: string): string => `"${name}" has been successfully created.`,
  // The name is assigned by the create itself, so a failed create has none to
  // report — the object never got far enough to be called anything.
  groundCreateFailed: 'Ground could not be created.',
  groundDeleted: (name: string): string => `"${name}" has been successfully deleted.`,
  groundDeleteFailed: (name: string): string => `Ground "${name}" could not be deleted.`,

  // ── Material ───────────────────────────────────────────────────────────────
  materialCreated: (name: string): string => `"${name}" has been successfully created.`,
  materialCreateFailed: (name: string): string => `Material "${name}" could not be created.`,
  materialDeleted: (name: string): string => `"${name}" has been successfully deleted.`,
  materialDeleteFailed: (name: string): string => `Material "${name}" could not be deleted.`,
  materialAssigned: (material: string, geometry: string): string =>
    `Material "${material}" has been successfully assigned to "${geometry}".`,
  materialAssignFailed: (material: string, geometry: string): string =>
    `Material "${material}" could not be assigned to "${geometry}".`,
  // The same failure with the backend's own reason appended. Used only when the
  // response carried the house {error, code} shape, which is what marks the text
  // as copy meant for a user ("This texture is 512x512 pixels, too small for
  // 'Ground.001' at 900 x 2.") rather than a bare status line. Anything else
  // falls back to the unqualified form above — see serverReason in Geometry/saga.
  materialAssignFailedBecause: (material: string, geometry: string, reason: string): string =>
    `Material "${material}" could not be assigned to "${geometry}". ${reason}`,

  // ── Saving a form ──────────────────────────────────────────────────────────
  // Raised by BOTH right-panel Saves (the ground Properties form and a Material
  // Type card). Deliberately unqualified: the user just pressed Save on a thing
  // they are looking at, so naming it back adds nothing.
  changesSaved: 'Changes have been successfully saved',
  changesSaveFailed: 'Changes could not be saved',
  // As changesSaveFailed, with the backend's reason appended on the same terms as
  // materialAssignFailedBecause.
  changesSaveFailedBecause: (reason: string): string => `Changes could not be saved. ${reason}`
} as const

export default toastMessages
