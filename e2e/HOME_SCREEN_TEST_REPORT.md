# Home Screen — E2E Test Coverage Report

**Scope:** Everything currently tested on the Helios **Home screen** (the project-list / launch screen) by the WebdriverIO e2e suite.
**Date:** 2026-06-29
**Source files reviewed:**
- [tests/homepage.test.ts](tests/homepage.test.ts) — main HomePage suite (**79 tests**)
- [tests/recentprojects.gaps.test.ts](tests/recentprojects.gaps.test.ts) — gap-coverage for the project list / sort headers / delete (**12 tests**)
- [tests/app.test.ts](tests/app.test.ts) — app-launch & shell smoke tests that gate the Home screen (**9 tests**)
- [pages/HomePage.page.ts](pages/HomePage.page.ts) — the Page Object backing all of the above

**Total home-screen coverage: ~100 tests across 3 spec files.**

---

## How the suite runs (test harness)

- Each ChromeDriver launch starts with a **fresh, empty backend** — so the very first test asserts the empty state, and every other test **self-provisions its own project(s)** and asserts only on its *own* rows (never absolute counts).
- A splash window opens first; a `before()` hook waits for the **main window (`#root`)** and switches focus to it before any DOM query.
- `beforeEach` runs `reloadToHome()` — clears the active-project localStorage ids and refreshes the renderer in-session, so the backend session + created projects survive between tests.
- Controlled (Formik/React) inputs are replaced via a `setInputValue` helper (focus → select-all → delete → type) because plain `setValue` can leave stale React state.
- The create/rename/delete `<dialog>` elements are always in the DOM (open/close toggles `showModal`), so open/closed is asserted by **visibility**, not existence.

---

## Coverage at a glance

| Area | Tests | What's verified |
|------|-------|-----------------|
| App launch / shell smoke | 9 | Window visible, React root mounts, `window.api` bridge, app metadata, window bounds |
| Initial shell render | 2 | Header, menubar, search, sidebar, table all display; empty-state on fresh DB |
| Create — open triggers | 4 | Open via sidebar, empty-state, menu-bar entry; reopen is clean |
| Create — valid happy submit | 5 | Navigates away; persists as a row; boundary coords; 30-char name |
| Create — name validation | 4 | Required, whitespace-trim, 31-char too long, 30-char OK |
| Create — latitude validation | 8 | Required, regex, exponential, ±range, decimals, boundary 90, exactly-7 decimals |
| Create — longitude validation | 7 | Required, regex, ±range, decimals, boundary 180, exactly-7 decimals |
| Create — duplicate name | 1 | Server duplicate error (case-insensitive), dialog stays open |
| Create — submit guard | 1 | Double-click Create makes exactly one project |
| Create — cancel paths | 3 | Cancel, × button, Escape all close & create nothing |
| Create — special chars / placeholders / labels / tooltips | 5 | Special-char names accepted; placeholders; title/labels/buttons; field-help tooltips |
| Kebab row menu | 5 | Appears on open, toggles closed, Escape, outside-click, single-open-menu |
| Rename flow | 7 | Valid rename (PATCH), same-name no-op, trim no-op, required, too-long, cancel, server duplicate |
| Delete flow | 3 + 6 gap | Confirm removes, cancel keeps, Escape; plus multi-delete, permanence, concurrency guards |
| Search / filter | 5 + 2 gap | Match/no-match, case-insensitive, discriminate, empty-state, whitespace; regex-meta literal filtering |
| Sidebar active state | 4 | Home active by default; New Project / Open project toggling; exactly-one-active |
| Row navigation | 5 | Single-click no-op, double-click, Enter, Space, correct project among many |
| Sorting | 6 | Default Last-Updated-desc; Name asc/desc; real row order by Name & Last Updated; Size toggle; search+sort |
| Project list / headings | 3 gap | "Recent Projects" heading, column headers, empty-state copy |
| Toolbar (menu bar) | 3 | All top-level menus + items exist; only "New Project" wired; no-op item does nothing |
| Project row structure | 1 + 1 gap | 4 cells (name / relative date / formatted size / kebab); virtualized scale (12 rows) |

---

## Detailed coverage by feature

### 1. App launch & shell smoke ([app.test.ts](tests/app.test.ts))
These gate that the Home screen can even render:
- Opens a visible application window; React `#root` exists and mounts children.
- `window.api` context bridge is exposed with expected methods: `openFile`, `saveFile`, `readFile`, `writeFile`, `getBackendStatus`, `startBackend`, `stopBackend`.
- Electron app metadata: non-empty app name, semver version string.
- BrowserWindow starts visible/non-minimised with positive width & height.

### 2. Initial shell & empty state
- Renders the full Home shell: **header, menubar, search bar, sidebar, projects table**.
- A **fresh DB shows the EmptyState** with an "Add New Project" trigger.
- Empty-state copy (gap suite): title `No Projects Found` and body `No Projects Found. Please add a new Project.`

### 3. Create-project dialog
**Open triggers:** sidebar "New Project", empty-state button, and the menu-bar "New Project" entry; reopening the dialog starts clean (no stale value).

**Valid submit:** a valid create navigates away from Home, persists and reappears as a row on return; accepts boundary coordinates (lat ±90, lon ±180) and a 30-character name.

**Name validation** (exact copy asserted):
- Empty → `Project name is required.`
- Whitespace-only → required (trim)
- 31 chars → `Project name must be 30 characters or fewer.`
- 30 chars → no error

**Latitude validation** (exact copy asserted):
- Empty → `Latitude is required.`
- Non-numeric `abc` and exponential `1e5` → `Invalid latitude` (regex, not range)
- `91` / `-91` → out-of-range message (`Valid range: -90 <= latitude <= 90.`)
- 8 decimals → `Latitude can have at most 7 decimal places.`
- Boundary `90` and exactly-7-decimals `45.1234567` → no error

**Longitude validation** mirrors latitude: required, regex, `181`/`-181` range, 8-decimal error, boundary `180`, exactly-7-decimals `12.1234567`.

**Duplicate name:** submitting an existing name (tested case-insensitively, `.toUpperCase()`) surfaces `A project with this name already exists` and keeps the dialog open.

**Submit guard:** double-clicking Create produces exactly one project (guard + saga `takeLeading`).

**Cancel paths:** Cancel button, × button, and Escape each close the dialog and create nothing.

**Special characters:** a name with `- _ . space ( ) + #` is accepted and shown verbatim in its row.

**UI/copy:** dialog title `New Project`; field labels `Project Name` / `Latitude` / `Longitude`; `Create` + `Cancel` buttons; placeholders `My Simulation`, `38.5449`, `-121.7405`; search placeholder `Search...`.

**Field-help tooltips:** the `?` triggers carry the exact wired tooltip content for project-name, latitude, and longitude, and the bubble shows on hover / dismisses on move-away.

### 4. Kebab (per-row action) menu
- Rename/Delete items render only after the kebab is opened (`aria-expanded` flips to `true`).
- Clicking the same kebab again toggles it closed.
- **Escape** and an **outside click** both close an open menu.
- Opening row B's menu closes row A's (only one menu open at a time).

### 5. Rename flow
- Valid rename issues a PATCH and the row reflects the new name.
- Submitting the **same name** (and same-name-with-whitespace) is a no-op that closes the dialog.
- Empty name → required error blocks submit (dialog stays open).
- 31-char name → too-long error.
- Cancel closes with the row unchanged.
- Renaming to an **existing** name surfaces a server error and stays open; editing the field clears the stale error.

### 6. Delete flow
Main suite: confirm deletes (row disappears, with `Delete <name>` heading + body copy verified); cancel keeps the row; Escape closes without deleting.

Gap suite ([recentprojects.gaps.test.ts](tests/recentprojects.gaps.test.ts)):
- Several projects delete **sequentially**, each removed independently with no resurrection.
- Confirm **permanently** removes (absent after a renderer reload / backend re-fetch); deleted project does not reappear, sibling survives.
- **Concurrency guards:** double-clicking the kebab Delete opens exactly one dialog; rapid double-confirm deletes exactly once; refreshing while the dialog is open performs no deletion.

### 7. Search / filter
- Non-matching term hides a row, matching term shows it; clearing restores.
- Partial, **case-insensitive** matching.
- Discriminates between two projects (shows match, hides other), clear restores both.
- Empty result → EmptyState; whitespace-only query returns the full list.
- Gap suite: **regex-meta characters** (`[ ]( )*+.\^$?`) filter **literally** without crashing; a special-char substring filters to its own row.

### 8. Sidebar active state
- Home is active by default; others are not.
- Clicking New Project activates it and opens the create dialog; Open project activates with no dialog.
- Exactly one sidebar item is active after switching.

### 9. Row navigation
- A **single click does not navigate**.
- **Double-click** navigates away from Home.
- **Enter** on a focused row navigates and writes `helios:activeProjectId`.
- **Space** on a focused row navigates.
- With several projects, the correct one is opened (verified via stored active id).

### 10. Sorting
- Default sort is **Last Updated, descending** (`aria-sort` verified on all three `<th>`).
- Clicking **Name** sorts ascending then toggles descending — both `aria-sort` and **actual row order** (Alpha/Bravo/Charlie) verified.
- **Last Updated** real row order verified (newest first on desc).
- **Size** sort toggles `aria-sort` (order not asserted — backend-computed).
- **Search + sort** combine: sort applies only to the filtered subset.

### 11. Recent-projects list & headings (gap suite)
- `Recent Projects` `<h2>` heading renders above the table with rows below.
- Column headers render **Name / Last Updated / Size**.

### 12. Toolbar (menu bar)
- Every top-level menu and its items exist: **File** (New Project, Open Project, Import Project, Exit), **Edit** (Undo, Redo, Preferences), **View** (Zoom In/Out, Reset Layout), **Tools** (Scripting Console, Extensions, Diagnostics), **Help** (Documentation, Shortcuts, About Helios).
- Only **"New Project"** is wired — it opens the create dialog.
- A no-op item (Undo) does nothing — no dialog, table stays.

### 13. Project row structure & scale
- A row exposes **4 cells**: name, relative date (`today` / `yesterday` / `N days ago` / `MM/DD/YYYY`), formatted size (`\d+(.\d+)? (B|KB|MB|GB|TB)`), and a kebab button.
- Gap suite: provisioning **12 projects** keeps the **virtualized** list responsive; sorting the filtered subset still works under load.

---

## Notes / observations

- **Toolbar items are mostly stubs:** only "New Project" is functionally wired on the Home screen; the other File/Edit/View/Tools/Help items are asserted to *exist* (and Undo is asserted to be a no-op), not to perform actions. This reflects the current app state, not a test gap.
- **Sizes & "Last Updated" are backend-computed**, so Size-sort row order is intentionally not asserted (only the `aria-sort` toggle is).
- The `recentprojects.gaps.test.ts` file is **additive coverage of working behavior** (heading, column labels, empty-state copy, literal search, delete permanence/concurrency, virtualization) that the main suite exercised only functionally — these are passing, not pending-feature gaps.
- This report covers the **Home screen only**. The Project screen, Weather/import-wizard, units, and persistence suites live in the other spec files and are out of scope here.
