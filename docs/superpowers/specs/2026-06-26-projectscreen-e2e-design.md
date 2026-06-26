# ProjectScreen E2E Automation — Design & Verified Test Matrix

> Status: design complete, adversarially verified. Source: a 10-agent map+verify workflow
> (5 containers x map -> adversarial-verify). 82 flows mapped, 199 edge cases verified
> (64 pass / 66 risky / 56 rewrite / 13 drop), 53 cases added -> 239 implementable tests.

## 1. Scope & method
Extend the existing WebdriverIO E2E suite (HomePage already covered: 79 tests in
e2e/tests/homepage.test.ts + e2e/pages/HomePage.page.ts) to the ProjectScreen and every
container nested inside it, against the real FastAPI backend, mirroring the HomePage
page-object pattern. Units:

| Unit | Container(s) | Verified cases |
|------|--------------|---------------:|
| projectscreen-shell | ProjectScreen Header: nav, coordinates, UTC, scenario chip | 37 |
| panels-tabs | LeftPanel, RightPanel, CenterWorkspace tabs | 35 |
| weather-table | Weather toolbar + table render/structure/selection | 55 |
| weather-crud | Add/del rows & columns, header edit, cell edit/validation | 63 |
| weather-import | CSV import wizard + delete data | 49 |
| **Total** | | **239** |

## 2. Architecture & file layout
```
e2e/
  support/harness.ts        NEW: waitForMainWindow, setInputValue, reloadToHome,
                                 enterProject, STORAGE_KEYS, stubFileDialog (electron)
  pages/
    HomePage.page.ts        reuse (create + open a project)
    ProjectScreen.page.ts   NEW: header (project-title, lat/lon/UTC), panels, tabs, scenario chip
    Weather.page.ts         NEW: toolbar, table (rows/cells/headers), dialogs, import wizard
  tests/
    projectscreen.test.ts   NEW: nav/entry, header coords+UTC, panels, tabs        (~72)
    weather.table.test.ts   NEW: toolbar, render, structure, selection             (~55)
    weather.crud.test.ts    NEW: add/del rows & columns, header edit, cell edit     (~63)
    weather.import.test.ts  NEW: import wizard + delete data                        (~49)
```
Run: npm run e2e:build (build + all specs) or
npm run build && npx wdio run wdio.config.ts --spec e2e/tests/<file>.test.ts
(+ --mochaOpts.grep "<title>" for a subset). Single Electron instance => serial only.

## 3. Critical cross-cutting facts (from adversarial verification)
- data-testid=header and data-testid=menubar are shared by HomePage AND ProjectScreen — never
  use them to prove which screen is mounted. Discriminate via ProjectScreen-only
  data-testid=project-title (NEW) vs HomePage-only projects-table.
- aria-invalid is (invalid || undefined) — when valid the attribute is ABSENT. Assert absence, not =false.
- LabeledField renders NO inline coordinate error (red border + aria-invalid only). Assert no role=alert/p.
- Coordinate commit is silent (no spinner/toast) and fires on blur — assert the OUTCOME (UTC changed) via waitUntil.
- Row ids are index-based (row_${i}) and RESET on every LOAD_SCENARIO_SUCCEEDED — never cache a rowId across a mutation.
- Three dialogs share aria-label=Delete (delete-import / delete-column / delete-row) — add per-dialog testids or
  disambiguate by h3 text (Delete Data / Delete ${name} / Delete Row).
- Managed/imported columns render as HeaderEditor input[aria-label="Column {id} name"], not a span; colId is the
  dynamic backend header id (resolve at runtime).
- Stepper labels contain embedded newlines ("File\nPreview") — match via testid/active-class, not "File Preview".
- Native file dialog (window.api.openFile): re-register the main IPC handler in-test via browser.electron.execute
  -> ipcMain.removeHandler('dialog:openFile'); ipcMain.handle('dialog:openFile', () => FIXTURE_PATH) (write the
  fixture to a real tmp path, or also stub 'fs:readFile'); restore in afterEach.

---

## 4. Source instrumentation plan

# NEW data-testids to add (grouped by source file)

## components/CollapseButton/index.tsx
  - Toggle <button> itself  =>  EXISTING aria-label (dynamic): 'Expand panel' when collapsed, 'Collapse panel' when expanded (line 20). Reuse this for the aria-label flip assertion AFTER panel scoping. ADD an optional data-testid prop to forward onto the <button> for unambiguous scoping.
  - Left/Right panel collapse buttons  =>  TWO identical button[aria-label='Expand panel'] (both panels default collapsed) — propose data-testid='collapse-left' / 'collapse-right' to disambiguate

## components/Header/index.tsx
  - Project title text  =>  [data-testid="header"] span (text equals project name; sits next to the aria-hidden '*'). RECOMMEND new data-testid="project-title" on the title <span> — current title span has no stable hook and shares markup with other spans
  - Scenario chip label 'Scenario 1'  =>  text 'Scenario 1' inside chip; RECOMMEND data-testid="scenario-chip" on the chip container div (currently only matchable by the hardcoded literal 'Scenario 1')

## components/ImportWizard/StepDataPreview.tsx
  - Delimiter select  =>  scoped wizard: select near label 'Delimiter' — propose data-testid="wizard-delimiter"
  - Header Lines to Skip number input  =>  scoped wizard: input[type=number] — propose data-testid="wizard-header-skip"
  - Parse error banner (Step 1)  =>  text containing 'Parse error:' inside wizard — propose data-testid="wizard-parse-error"

## components/ImportWizard/StepDateTime.tsx
  - Date mode radios (parts/string/julian/datetime) and column selects  =>  GroupedChoice radio <button> + <select>; selects keyed by FieldRow label (Day/Month/Year/Date String/Julian Year/Julian Day/Date-Time/Hour/Minute/Hour:Minute/HourMinute) — propose data-testid per mapping field e.g. data-testid="wizard-map-{key}"
  - Date/Time validity badge  =>  text matching 'All N rows valid'/'0 of N rows valid'/'X of N valid' — propose data-testid="wizard-dt-badge"

## components/ImportWizard/StepFilePreview.tsx
  - Browse button  =>  scoped wizard: button (text 'Browse'/'Opening…') — propose data-testid="wizard-browse"
  - Selected filename readonly input  =>  scoped wizard: input[readonly] (placeholder 'No file selected') — propose data-testid="wizard-filename"
  - File error banner  =>  text 'Could not open file. '/'Invalid file. ' inside wizard — propose data-testid="wizard-file-error"

## components/ImportWizard/StepReview.tsx
  - Select All checkbox  =>  scoped wizard: input[type=checkbox] adjacent to span 'Select All' — propose data-testid="wizard-select-all"
  - Per-column include checkbox + name + examples  =>  table rows; column name in second <td> — propose data-testid="wizard-col-row-{header}" and checkbox data-testid="wizard-col-check-{header}"

## components/ImportWizard/Stepper.tsx
  - Step labels (File Preview/Data Preview/Date/Time/Review & Import)  =>  text within stepper; active step has font-semibold text-white — propose data-testid="wizard-step-{key}" if step assertions needed

## components/ImportWizard/index.tsx
  - Wizard Next button  =>  scoped wizard: button=Next  — disabled state via isEnabled()/aria; propose data-testid="wizard-next" to avoid ambiguity with footer
  - Wizard Import button (last step)  =>  scoped wizard: button containing 'Import' (shows Spinner while importing) — propose data-testid="wizard-import"
  - Finalize error banner (Review step)  =>  text containing 'Import failed:' inside wizard — propose data-testid="wizard-import-error"

## containers/CenterWorkspace/index.tsx
  - '3D Window' tab button  =>  EXISTING: button by visible text '3D Window' (the label text node) OR aria-pressed scoped. Recommend PROPOSED data-testid="tab-3dwindow" on TabButton's <button> for stability (label has a leading icon img). Reuse aria-pressed for active assertion.
  - 'Weather' tab button  =>  EXISTING text 'Weather' / aria-pressed. PROPOSED data-testid="tab-weather".
  - 'Output' tab button  =>  EXISTING text 'Output' / aria-pressed. PROPOSED data-testid="tab-output".
  - Center workspace root <section> + tab bar  =>  PROPOSED data-testid="center-workspace" on <section> (line 49) so tab buttons can be scoped and to assert the tab-bar container; tab bar is the first <div> with border-b. Use to assert exactly 3 buttons.

## containers/LeftPanel/index.tsx
  - Left panel root <aside> (width container, w-8 <-> w-[340px])  =>  PROPOSED data-testid="left-panel" on the <aside> (line 22). No stable selector exists otherwise; className is shared verbatim with RightPanel so class matching is ambiguous.
  - Left panel CollapseButton (shares aria-label 'Expand panel'/'Collapse panel' with right)  =>  PROPOSED data-testid="left-panel-collapse-btn". Pass a data-testid prop through CollapseButton to its <button>, set from LeftPanel as `${side}-panel-collapse-btn`. Until added, scope via the left <aside> ancestor: $('[data-testid="left-panel"] button[aria-label="Expand panel"], [data-testid="left-panel"] button[aria-label="Collapse panel"]').

## containers/RightPanel/index.tsx
  - Right panel root <aside>  =>  PROPOSED data-testid="right-panel" on the <aside> (line 22).
  - Right panel CollapseButton (identical aria-label to left)  =>  PROPOSED data-testid="right-panel-collapse-btn" via the same CollapseButton data-testid prop. Until added, scope via right <aside> ancestor.

## containers/Weather/AddColumnDialog.tsx
  - Add Column dialog container  =>  dialog[aria-label="Add Column"]. Optionally data-testid='add-column-dialog'
  - Add Column submit (Add)  =>  dialog[aria-label="Add Column"] button text 'Add'; propose data-testid='add-column-submit'

## containers/Weather/AddRowsDialog.tsx
  - Add Rows dialog container  =>  dialog[aria-label="New Rows"] (existing aria-label from title). Optionally pass data-testid='add-rows-dialog' to <Dialog>
  - Add Rows submit button  =>  dialog[aria-label="New Rows"] button text 'Add' (busy text 'Adding…'); propose data-testid='add-rows-submit'

## containers/Weather/DateTimeHeader.tsx
  - Date-Time header button  =>  button text 'Date-Time' (no aria-label); propose data-testid='datetime-header-button'
  - Date-Time format dropdown trigger + options  =>  button with span text 'Date-Time' (NO aria-label) -> propose data-testid='datetime-header-trigger'; options role='option' (text = format string) reusable

## containers/Weather/WeatherTable.tsx
  - Imported column headers / rows (post-import assertions)  =>  column name rendered as <span class=truncate>{col.name} within <th>; rows via existing aria-label='Select {rowId}' and 'Delete row {rowId}' — propose data-testid on <th> e.g. data-testid="col-header-{name}" for stable column assertions
  - Body row <tr>  =>  No id on <tr>/<td>. Rows keyed by React key only. Propose data-testid='weather-row-${rowId}' on <tr> and data-testid='weather-cell-${rowId}-${colId}' on editable <td> for order/visibility assertions
  - Delete-column confirm dialog  =>  dialog[aria-label="Delete"] containing heading text 'Delete ${name}'. Title 'Delete' is shared with delete-row; scope by heading text. Propose data-testid='delete-column-dialog'
  - Delete-row confirm dialog  =>  dialog[aria-label="Delete"] containing heading 'Delete Row'. Propose data-testid='delete-row-dialog' to disambiguate from delete-column (both aria-label='Delete')
  - Body row <tr>  =>  NO stable selector — propose data-testid='weather-row-{rowId}' on the <tr> for row-existence/order/structure assertions (virtualized)
  - Body data cell <td>  =>  NO stable selector — propose data-testid='weather-cell-{rowId}-{colId}' on each body <td> for read-only display + error-outline assertions
  - Header column <th>  =>  NO stable selector — propose data-testid='weather-header-{colId}' on each header <th> for column presence/order; Action <th> propose data-testid='weather-header-action'
  - Read-only date-time cell display span  =>  read-only cells render <span class='block truncate px-3'>{display}</span> with NO label — propose data-testid='weather-cell-{rowId}-{colId}' (above) covers it
  - Delete-column / Delete-row confirm dialogs  =>  dialog[aria-label='Delete'] — TWO dialogs share title 'Delete' (column + row). Disambiguate by visible heading text ('Delete {name}' vs 'Delete Row') OR propose data-testid='delete-column-dialog' / 'delete-row-dialog' via Dialog data-testid prop

## containers/Weather/WeatherToolbar.tsx
  - Delete confirm dialog (shared Dialog)  =>  dialog[aria-label="Delete"]  — NOTE collides with other Delete dialogs (row/column); propose adding data-testid="delete-import-dialog" to this Dialog instance
  - Add Columns toolbar button  =>  button containing text 'Add Columns' (ToolbarButton renders label); propose data-testid='toolbar-add-columns'
  - Add Rows toolbar button  =>  button text 'Add Rows'; propose data-testid='toolbar-add-rows'
  - Filter toolbar button  =>  button text 'Filter' (ToolbarButton renders <button><span>Filter</span>) — NEW data-testid='toolbar-filter' recommended (it is a no-op; needed to assert no dialog/dispatch)
  - Add Columns toolbar button  =>  button containing span text 'Add Columns' — propose data-testid='toolbar-add-columns'
  - Add Rows toolbar button  =>  button span text 'Add Rows' — propose data-testid='toolbar-add-rows'
  - Upload File toolbar button  =>  button span text 'Upload File' — propose data-testid='toolbar-upload-file'
  - Delete-import confirm dialog  =>  dialog[aria-label='Delete'] (heading 'Delete Data') — THIRD 'Delete' dialog; propose data-testid='delete-import-dialog'

## containers/Weather/index.tsx
  - Success/precision toast  =>  div containing the toast message; Dismiss is [aria-label="Dismiss import notification"] — propose data-testid="import-toast" on the toast container


# Adversarial instrumentation corrections (from verify)

### ProjectScreen renders the three panels inside <main className="flex mi
Confirmed all proposed NEW testids are warranted and there are no pre-existing collisions. Recommended scheme: (1) data-testid="left-panel" and data-testid="right-panel" on each <aside> (LeftPanel/RightPanel line 22). (2) Forward an optional data-testid prop through CollapseButton onto its <button>, set by each panel as "left-panel-collapse-btn"/"right-panel-collapse-btn" — this is the clean fix for the identical-aria-label collision; until added, scope via [data-testid="left-panel"] button. (3) data-testid="center-workspace" on the <section> (line 49). (4) data-testid="tab-3dwindow"/"tab-weather"/"tab-output" forwarded onto each TabButton's <button> (the label text node is preceded by an <img alt="" aria-hidden="true">, so text matching works but per-tab testids are cleaner). SELECTOR COLLISION WARNING the map missed: the Weather toolbar buttons (visible text 'Add Columns','Add Rows','Upload File','Delete Data' and aria-label 'Delete uploaded weather file') render INSIDE the same center <section> when Weather is active. Therefore (a) any "exactly 3 buttons" tab count MUST be scoped to the first border-b tab-bar <div> of center-workspace, NOT the whole section; and (b) the Weather mount sentinel must be a DATA-INDEPENDENT toolbar element ('Upload File' button text or aria-label='Delete uploaded weather file' — both render regardless of dataset) and NOT a WeatherTable row, because rows are virtualized and may not exist on a freshly-provisioned empty scenario (a missing row would falsely "prove" unmount). REUSE: Header data-testid="header" (Header line 67) as the ProjectScreen-mounted gate — confirmed present. aria-pressed serializes to string "true"/"false" (React aria-* boolean serialization), so getAttribute comparisons use strings. Do NOT add testids for the chevron svg — rotation is cosmetic inline style and mirrored (pointsLeft = side==='left' ? !collapsed : collapsed); assert aria-label + width token instead.

### ProjectScreen shell. CRITICAL: both HomePage and ProjectScreen render 
1) BLOCKING: data-testid=header and data-testid=menubar are shared by HomePage AND ProjectScreen; never assert which screen via either. Use ProjectScreen-only project-title (NEW) vs HomePage-only projects-table. 2) ADD data-testid=project-title on the title span (Header line ~97); the header span selector is ambiguous because the title block has the title span, an aria-hidden star span, and the Scenario 1 chip span. 3) ADD data-testid=scenario-chip on the chip container div (Header line ~102). 4) aria-invalid is set to invalid-or-undefined, so when valid the attribute is ABSENT (getAttribute returns null); assert absence, not aria-invalid=false. 5) The Latitude/Longitude LabeledField wrappers contain a labelAdornment (Tooltip trigger span aria-label Show latitude/longitude help plus a ReactTooltip node), so the wrapper is NOT one input plus one span; for the no-inline-error claim assert only no role=alert and no p element. 6) MenuBar top-level buttons have NO data-testid; select menubar dollar button=File scoped to data-testid=menubar (reuse toolbarMenuButton). Dropdown items DO carry data-testid=menu-item and are hover-gated; click via browser.execute (reuse clickMenuItem). 7) Row entry: el.doubleClick() for the dblclick path; for Enter/Space focus the row first via browser.execute focus() because the tr has no onClick to focus it. 8) ProjectScreen is React.lazy/Loadable; always waitForDisplayed after navigate, never assume synchronous mount. 9) Reuse the HomePage harness: setInputValue (click then Ctrl+a then Delete then addValue) to replace seeded controlled lat/long inputs; browser.waitUntil for the PATCH plus GET settle; do NOT assert loading/spinner since none is rendered for the coordinate commit (selectUpdateProjectLoading/Error exist in Redux but no header UI consumes them). 10) createNamed seeds lat=12.34 and lon=56.78; use these as the known seed for the Object.is no-op and value-differs cases.

### Weather CSV Import Wizard + Delete Data. Weather is the DEFAULT tab (C
(1) [data-testid='dialog-close'] is rendered by EVERY shared Dialog (Add Column, Add Rows, delete-import, delete-row, delete-column) — NOT unique; del-07 must scope it inside the delete-import dialog. (2) dialog[aria-label='Delete'] collides with delete-row and delete-column (messages.*.dialogTitle='Delete'); the delete-import instance has NO data-testid — add data-testid='delete-import-dialog' in WeatherToolbar.tsx, or disambiguate via the unique h3 'Delete Data'. (3) BIGGEST selector error: imported/managed column headers are NOT <th data-testid='col-header-{name}'> nor a truncate <span> — backend-managed columns render through HeaderEditor as input[type=text][aria-label='Column {col.id} name'][value={col.name}] (WeatherTable:622 truncate-span is only the fallback for non-managed/non-datetime columns; imported CSV cols are managed). Post-import column assertions must read that input's value (col.id is dynamic -> filter by value). (4) Stepper labels contain EMBEDDED NEWLINES (File\nPreview etc.) — text matching against space-joined 'File Preview' fails; use proposed wizard-step-{key} testids or the active class. (5) Wizard header X [aria-label='Close'] differs from Dialog's [aria-label='Close dialog']/[data-testid='dialog-close'] — scope inside [aria-label='Import Weather Data']. (6) Next/Import/Browse use PrimaryBtn/SecondaryBtn which pass a real disabled attribute so isEnabled() works; still add wizard-next/wizard-import/wizard-browse testids (Import label becomes a Spinner while importing). (7) StepDateTime per-field <select>s are keyed only by FieldRow label (Day/Month/Year/Date String/Julian Year/Julian Day/Date-Time/Hour/Minute/Hour:Minute/HourMinute) with no testid — add data-testid='wizard-map-{key}' for iw-dt-03-style remap tests. (8) ModeChoice radios are <button disabled={!onSelect}> wrapping div[aria-label='<mode>'] (no role=radio) — select by the label div/button; assert disabled via isEnabled(), not opacity. (9) Toast container has no testid (add data-testid='import-toast'); reliable anchors are the exact message text and [aria-label='Dismiss import notification']. (10) Forcing addCol/clear failures (iw-imp-04) needs a renderer window.fetch monkey-patch for the route since reserved-name collisions are silently dropped, not rejected — restore per test.

### Weather lives at CenterWorkspace's default-active "Weather" tab. VERIF
CONFIRMED against source: FormField data-testid uses the FORMIK FIELD NAME (restInputProps.name from getFieldProps), not the label — so AddColumn=input-parameterName/dataTypeId/unitId/defaultValue + error-parameterName/error-defaultValue, AddRows=input-numberOfRows/startDate/startTime/deltaHours + error-* are all CORRECT. The picker icon button aria-label is `Open ${name} picker` -> 'Open startDate picker' / 'Open startTime picker' (startTime's button toggles the custom TimePicker24, it does NOT call showPicker). Dialog: aria-label={title}, optional data-testid prop, dialog-close (data-testid='dialog-close', aria-label='Close dialog'). COLLISIONS/NEW IDs NEEDED: (1) THREE dialogs share aria-label='Delete' with NO data-testid -> add data-testid='delete-import-dialog' (WeatherToolbar Dialog), 'delete-row-dialog' + 'delete-column-dialog' (WeatherTable Dialogs); until then disambiguate by HEADING text only (import & row share the same BODY string, so body is NOT a discriminator). (2) Toolbar buttons (Filter/Add Columns/Add Rows/Upload File) have no testid/aria-label -> add toolbar-filter/toolbar-add-columns/toolbar-add-rows/toolbar-upload-file; 'Add Columns' and 'Add Rows' both contain 'Add' so text matches must be exact. Delete Data button reuses aria-label='Delete uploaded weather file'. (3) DateTimeHeader trigger = button>span 'Date-Time', no label -> add data-testid='datetime-header-trigger'; options are role='option'. (4) Dynamic table elements have no stable selector -> add data-testid='weather-row-{rowId}', 'weather-cell-{rowId}-{colId}' (covers read-only date-time spans too), 'weather-header-{colId}', 'weather-header-action'. (5) CenterWorkspace TAB buttons have no testid -> identify by visible text 'Weather'/'Output'/'3D Window' + aria-pressed (consider adding tab-weather/tab-output/tab-3dwindow). (6) Two identical button[aria-label='Expand panel'] (both panels collapsed) -> add collapse-left/collapse-right if ever toggled (not needed for table tests). REUSE (existing, no new id): input[aria-label='Select all rows'], input[aria-label='Select {rowId}'], button[aria-label='Delete row {rowId}'], input[aria-label='{rowId} {colId}'] (CellInput, sets aria-invalid on error), input[aria-label='Column {colId} name'], button[aria-label='Delete column {colId}'], button[aria-label='Column {colId} data type and unit']. SCOPING: server-error banner (Add Column/Add Rows) = p.form-error-text[role='alert'] WITHOUT data-testid, vs field errors which carry data-testid='error-{name}' AND role='alert' — must scope to avoid cross-match. Managed-column colId = stringified positive-int backend header id, unknown until created -> resolve at runtime from the header name input's aria-label suffix. Date-time colId = the header whose name===DATE_TIME_COL_NAME (numeric id), NOT a literal 'date-time'.

### Weather row/column CRUD + cell edit/validation. VERIFIED against sourc
Confirmed against source: (1) FormField bakes input-${name}/error-${name}/formfield-${name} where ${name} is the formik field name. Add Rows: numberOfRows, startDate (type=date, key flips on open), startTime (plain text), deltaHours. Add Column: parameterName, dataTypeId (select), unitId (select, disabled until dataTypeId set), defaultValue. All proposed reuse is correct. (2) Server-error banners in BOTH AddRowsDialog and AddColumnDialog are <p role='alert' className='form-error-text'> with NO data-testid — but FormField field errors ALSO use form-error-text + role='alert' AND carry data-testid='error-${name}'. The selector p.form-error-text[role='alert']:not([data-testid]) scoped inside the dialog is REQUIRED and matches the existing HomePage renameServerError pattern. (3) THREE-WAY dialog aria-label collision: deleteColumn/deleteRow/deleteImport all set Dialog title='Delete' -> aria-label='Delete'. Disambiguate by inner <h3>: 'Delete {name}' (column), 'Delete Row' (row), 'Delete Data' (import). Strongly recommend adding data-testid='delete-column-dialog'/'delete-row-dialog' (Dialog already accepts a data-testid prop). (4) Toolbar 'Add Columns'/'Add Rows' have NO aria-label/testid (ToolbarButton, nested <span> text) — select by $('button=Add Columns') or add testids. (5) HeaderEditor + trash render ONLY for backend-managed user columns (positive-int header id, name not check/date-time); seeded date-time/check columns are read-only — date-time uses DateTimeHeader (button text 'Date-Time', NO aria-label), check is the leftmost checkbox. (6) DateTimeHeader button needs button*=Date-Time or a new data-testid. (7) Cell inputs: aria-label='{rowId} {colId}' exists ONLY for non-readonly cells; the merged date-time cell and reserved cells are read-only <span>s with NO such aria-label. (8) FormField time picker icon button aria-label is `Open startTime picker` (pattern `Open ${name} picker`). (9) AddColumnDialog auto-picks the base unit on data-type change (defaultUnitForType) despite a stale comment claiming it doesn't — the runtime behavior matches the mapper's 'auto-picks base unit' claim. (10) Add Column submit button is disabled when loading OR formik.errors.defaultValue is truthy. (11) All bounded-unit / convertible-unit / one-sided-range cases depend on the REAL backend /data_types catalog — discover data type/unit options at runtime from input-dataTypeId/role=option lists; never hardcode unit ids or min/max. (12) Error-injection cases (dt-unit-rollback, delcol-rollback, cell-backend-error) are undroppable-by-design: the harness has no network fault injection, so DROP them.


---

## 5. Verified test matrix (239 cases)

Format: category  id  [verdict]  assertion. verdict: pass=solid, risky=fragile-mitigated, rewrite=corrected, add=added-in-review. Dropped no-ops excluded.

```
================ ProjectScreen renders the three panel containers inside  (overlap 30) ================
happy       ps-mount-01      [rewrite] After provisioning a project via the HomePage page object (navigate('project') fires) and waiting for data-testid="header", the element [data-testid="left-panel
happy       ps-mount-02      [pass] On mount, the button inside [data-testid="left-panel"] AND the button inside [data-testid="right-panel"] each have aria-label='Expand panel' (assert each via it
happy       ps-left-01       [pass] Click the scoped left collapse button -> [data-testid="left-panel"] toHaveElementClass 'w-[340px]' (and not 'w-8'); the scoped left button aria-label becomes 'C
happy       ps-left-02       [pass] Click the scoped left collapse button again -> [data-testid="left-panel"] toHaveElementClass 'w-8'; scoped left button aria-label back to 'Expand panel'; the de
happy       ps-right-01      [pass] Click the scoped right collapse button -> [data-testid="right-panel"] toHaveElementClass 'w-[340px]'; scoped right button aria-label 'Collapse panel'; a descend
happy       ps-right-02      [pass] Click the scoped right collapse button again -> [data-testid="right-panel"] toHaveElementClass 'w-8'; scoped right button aria-label 'Expand panel'; descendant 
selection   ps-indep-01      [pass] From both-collapsed, click left collapse only -> [data-testid="left-panel"] toHaveElementClass 'w-[340px]' AND [data-testid="right-panel"] toHaveElementClass 'w
selection   ps-indep-02      [pass] From both-collapsed, click right collapse only -> [data-testid="right-panel"] toHaveElementClass 'w-[340px]' AND [data-testid="left-panel"] toHaveElementClass '
selection   ps-indep-03      [pass] Click left then right collapse buttons -> both [data-testid="left-panel"] and [data-testid="right-panel"] toHaveElementClass 'w-[340px]' simultaneously, and bot
selection   ps-indep-04      [pass] From both-expanded, click left then right collapse -> both scoped asides toHaveElementClass 'w-8' and both scoped buttons read 'Expand panel'.
structure   ps-scope-01      [risky] When both panels collapsed, exactly 2 descendant buttons of <main> have aria-label='Expand panel' (scope $$ to main and run after data-testid="header" present).
structure   ps-scope-02      [pass] After expanding left only: button inside [data-testid="left-panel"] has aria-label='Collapse panel' AND button inside [data-testid="right-panel"] has aria-label
happy       ps-toggle-01     [pass] Expand then collapse left -> [data-testid="left-panel"] toHaveElementClass 'w-8', scoped left button aria-label 'Expand panel', and descendant div.overflow-y-au
happy       ps-tab-default-01 [pass] On ProjectScreen mount, [data-testid="tab-weather"] has aria-pressed='true' AND [data-testid="tab-3dwindow"] and [data-testid="tab-output"] have aria-pressed='f
happy       ps-tab-default-02 [rewrite] On mount, a Weather toolbar sentinel that does not depend on data (e.g. button with visible text 'Upload File' or aria-label='Delete uploaded weather file' from
selection   ps-tab-3d-01     [rewrite] Click [data-testid="tab-3dwindow"] -> it has aria-pressed='true', [data-testid="tab-weather"] and [data-testid="tab-output"] aria-pressed='false', and the Weath
selection   ps-tab-out-01    [rewrite] Click [data-testid="tab-output"] -> aria-pressed='true' on it, 'false' on the other two, and the Weather toolbar sentinel no longer exists inside [data-testid="
selection   ps-tab-back-01   [rewrite] From 3D or Output active, click [data-testid="tab-weather"] -> aria-pressed='true' on Weather, 'false' on others, and the Weather toolbar sentinel (e.g. 'Upload
selection   ps-tab-3to-out-01 [rewrite] From 3D active, click [data-testid="tab-output"] -> Output aria-pressed='true', 3D and Weather aria-pressed='false', and the Weather toolbar sentinel does not e
structure   ps-tab-exclusive-01 [risky] In any tab state, exactly one of the 3 buttons inside the [data-testid="center-workspace"] tab bar has aria-pressed='true' (scope the query to the tab bar; do n
structure   ps-tab-count-01  [risky] The first child div (border-b tab bar) of [data-testid="center-workspace"] contains exactly 3 buttons whose text contains '3D Window', 'Weather', 'Output' in th
keyboard    ps-keyboard-01   [risky] Focus [data-testid="tab-output"] via browser.execute(focus) and browser.keys('Enter') -> tab-output aria-pressed='true', tab-weather 'false', and Weather toolba
keyboard    ps-keyboard-02   [risky] Focus the scoped left collapse button (collapsed) via browser.execute(focus) and browser.keys('Enter') -> [data-testid="left-panel"] toHaveElementClass 'w-[340p
empty       ps-empty-01      [pass] While collapsed, [data-testid="left-panel"] (and right) contains its toolbar div + button but NO descendant div.overflow-y-auto.p-3 (waitForExist {reverse:true}
empty       ps-empty-02      [risky] After expanding, the descendant div.overflow-y-auto.p-3 inside the scoped panel exists, getText()==='' and has no child elements (childElementCount 0). Treat as
persistence ps-persist-01    [rewrite] Provision+enter project, expand left panel, then browser.refresh() WITHOUT clearing helios:activeProjectId/activeScenarioId (so ProjectScreen re-mounts). Wait f
persistence ps-persist-02    [rewrite] Switch to Output, then browser.refresh() preserving helios:activeProjectId -> after data-testid="header", [data-testid="tab-weather"] aria-pressed='true' and ta
navigation  ps-nav-01        [pass] On HomePage (before provisioning), [data-testid="left-panel"], [data-testid="right-panel"], and [data-testid="center-workspace"] tab buttons do NOT exist (not.t
structure   ADDED            [add] FLAG ONLY (do not assert rotation degrees): per CollapseButton, pointsLeft = side==='left' ? !collapsed : collapsed. So when BOTH panels are collapsed, the left
happy       ADDED            [add] Click left collapse button twice in quick succession (expand then collapse) and assert the FINAL settled state is consistent: [data-testid="left-panel"] toHaveE
selection   ADDED            [add] Expand left panel, then click [data-testid="tab-output"]: [data-testid="left-panel"] still toHaveElementClass 'w-[340px]' (unchanged) AND tab-output aria-presse
empty       ADDED            [add] FLAG/optional: collapse and tab state are pure local useState; the injected leftPanel/rightPanel/centerWorkspace sagas only watch FETCH_STATUS/SSE_CONNECT which
structure   ADDED            [add] The Weather toolbar (Add Columns/Add Rows/Upload File/Delete Data) renders INSIDE the center <section> when Weather is active, so a section-wide button count is
navigation  ADDED            [add] Because each ChromeDriver launch = fresh empty backend DB and beforeEach(reloadToHome) clears active ids and lands on HomePage, every panel test MUST first crea
structure   ADDED            [add] FLAG: left panel toolbar div is justify-end, right is justify-start (LeftPanel line 25 / RightPanel line 25). This is cosmetic and must NOT be used to distingui

================ ProjectScreen shell — Header (logo, coordinates, UTC of  (overlap 34) ================
navigation  ps-entry-01      [rewrite] doubleClick row; waitForDisplayed projects-table reverse AND project-title NEW; project-title===name; localStorage activeProjectId===uuid.
keyboard    ps-entry-02      [rewrite] execute focus row; keys Enter; waitForDisplayed project-title; activeProjectId===uuid.
keyboard    ps-entry-03      [rewrite] focus row; keys space; waitForDisplayed project-title.
navigation  ps-entry-04      [rewrite] click row once; projects-table still displayed AND project-title not displayed.
persistence ps-entry-05      [rewrite] waitUntil getItem activeScenarioId non-empty timeout 15000.
happy       ps-title-01      [rewrite] Add project-title; expect toHaveText name exact.
loading     ps-title-02      [pass] projectTitle.waitForDisplayed timeout 15000.
navigation  ps-logo-01       [pass] click Go to home; waitForDisplayed projects-table; waitUntil activeScenarioId null.
persistence ps-logo-02       [pass] after logo home, activeProjectId===uuid still present.
structure   ps-chip-01       [rewrite] Add scenario-chip; expect text Scenario 1 containing.
happy       ps-coord-01      [risky] read seeded UTC; setInputValue differing coord; blur via sibling; waitUntil utcOffset not equal seeded.
happy       ps-coord-02      [rewrite] setInputValue Longitude -121.7405; click Latitude blur; waitUntil utc changed; longitude still -121.7405.
happy       ps-coord-03      [risky] blur without editing; waitUntil ~2s utcOffset stays seeded.
validation  ps-coord-04      [pass] setInputValue empty; no aria-invalid attr; blur utc unchanged.
validation  ps-coord-05      [pass] setInputValue 95; aria-invalid true; no role=alert or p; utc unchanged.
validation  ps-coord-06      [pass] setInputValue abc; aria-invalid true; no UTC change.
validation  ps-coord-07      [pass] setInputValue 12.123456789; aria-invalid true; no commit.
validation  ps-coord-08      [pass] setInputValue Longitude 200; aria-invalid true; no error p; utc unchanged.
validation  ps-coord-09      [risky] setInputValue 90 no aria-invalid; repeat -90, 180, -180; validity only.
validation  ps-coord-10      [risky] setInputValue 7. no aria-invalid; .5 no aria-invalid; settled.
structure   ps-coord-11      [rewrite] assert no role=alert and no p while aria-invalid true; do not count children.
structure   ps-utc-01        [pass] disabled; value matches signed dd colon dd; setValue no change or PATCH.
happy       ps-utc-02        [risky] setInputValue Longitude far band; blur; waitUntil utc changed.
persistence ps-restore-01    [risky] enter project; set both ids; browser.refresh; assert project-title displayed and projects-table never shown.
persistence ps-restore-02    [pass] set only activeProjectId; refresh; projects-table displayed and project-title not.
persistence ps-restore-03    [risky] fold into restore-01; assert only project-title populates; no internal Redux.
structure   ps-menu-01       [pass] after project-title, menubar button=File through Help displayed.
happy       ps-tooltip-01    [risky] moveTo Show latitude help; waitForExist react-tooltip__show; text contains Valid range -90; repeat longitude.
navigation  ADDED            [add] HomePage shows header plus menubar without project-title; ProjectScreen shows header plus menubar plus project-title and no projects-table. Never assert on-Proj
happy       ADDED            [add] type new Latitude then blur commit; input keeps typed value after refetch with no snap-back; waitUntil utc changed then assert latitude equals typed value.
happy       ADDED            [add] enter A then B with different coords; B values shown not A; confirms seededProjectIdRef resets across ids.
validation  ADDED            [add] setInputValue 95 aria-invalid then 45 aria-invalid gone; blur commits.
validation  ADDED            [add] setInputValue +12.5 no aria-invalid; parseFloat 12.5 commits if differs from seed.
validation  ADDED            [add] 12.1234567 no aria-invalid; 12.12345678 aria-invalid true.
validation  ADDED            [add] Latitude 95 invalid plus Longitude 10 valid means only Latitude carries aria-invalid.
structure   ADDED            [add] no onChange so readOnly plus disabled both true; distinguishes from editable lat/long.
validation  ADDED            [add] clear Longitude then blur via Latitude; no aria-invalid, no PATCH, utc unchanged, input empty.

================ Weather CSV Import Wizard + Delete Data  (overlap 38) ================
happy       iw-open-01       [rewrite] Click button=Upload File; [role=dialog][aria-label='Import Weather Data'] waitForDisplayed; scoped button=Browse displayed; scoped button=Next exists AND isEnab
persistence iw-open-02       [pass] Open, Browse (stub cancel/null), Cancel; reopen -> scoped input[readonly] value '' and stepper active on File Preview; no error banner.
happy       iw-pick-01       [rewrite] Re-register dialog:openFile->'/x/weather.csv', fs:readFile->'<csv>'; click Browse; waitUntil scoped input[readonly] value==='weather.csv' AND scoped Next.isEnab
cancel      iw-pick-03       [pass] Re-register dialog:openFile->null; click Browse; no 'Could not open file.' text; Browse re-enabled; scoped Next.isEnabled()===false.
error       iw-pick-04       [rewrite] Re-register dialog:openFile->'/nope.csv', fs:readFile->throw; click Browse; scoped wizard 'Could not open file.' waitForDisplayed; do not assert tail.
error       iw-pick-05       [rewrite] Re-register dialog:openFile->'/bad.xml', fs:readFile->'<not valid xml'; click Browse; scoped wizard '<strong>Invalid file. </strong>' then 'Invalid XML format.'
happy       iw-data-01       [rewrite] After pick+Next, step1: scoped delimiter displayed, header-skip number input displayed, preview table >=1 row, >=1 column chip displayed.
validation  iw-data-02       [rewrite] On step1 change Delimiter to make rows ragged; scoped wizard shows 'Parse error:' AND 'Showing the previous successful parse.'; scoped Next.isEnabled()===false.
navigation  iw-data-03       [pass] Induce parse error step1, Back; step0 active; no 'Parse error:'; scoped Next.isEnabled()===true.
validation  iw-data-04       [rewrite] Pick valid .xml, Next to step1; scoped delimiter isEnabled()===false (or 'Not applicable for XML'); header-skip input isEnabled()===false.
happy       iw-dt-01         [rewrite] Fixture with 'date' column in YYYY-MM-DD, Next to step2; scoped badge matches /All \d+ rows valid/; scoped Next.isEnabled()===true.
validation  iw-dt-02         [risky] Fixture (<=8 rows) with one unparseable date early; on step2 a Parsed cell exact text 'Invalid'; badge matches /\d+ of \d+ valid · \d+ invalid/.
validation  iw-dt-03         [risky] Map valid date, switch Time to Hour:Minute, pick non-time text column; a Parsed cell exact 'Invalid time format'; if all invalid scoped Next.isEnabled()===false
validation  iw-dt-04         [rewrite] Configure mapping with wrong dateFormat so 0 rows parse; badge matches /0 of \d+ rows valid/; scoped Next.isEnabled()===false.
selection   iw-dt-05         [rewrite] On step2 click the date-time choice; Time-section radio buttons isEnabled()===false.
validation  iw-dt-06         [rewrite] Fixture with no date/time-named columns; on step2 no badge text matching /rows valid|valid ·/ displayed; scoped Next.isEnabled()===false.
happy       iw-rev-01        [rewrite] On step3 first row td 'Date-Time'; its checkbox isSelected()===true and isEnabled()===false title 'Date-Time is required and cannot be excluded'; >=1 other chec
validation  iw-rev-02        [risky] Fixture with a text column; on step3 banner 'Character-based columns are disabled as this input is unsupported' displayed; that column's checkbox isEnabled()===
selection   iw-rev-03        [pass] On step3 uncheck Select All; every selectable checkbox isSelected()===false; re-check -> all true; Date-Time/disabled unchanged.
happy       iw-imp-01        [rewrite] Click Import; waitUntil [role=dialog][aria-label='Import Weather Data'] not displayed; then waitUntil header input[aria-label^='Column '] value==='<imported col
loading     iw-imp-02        [risky] Immediately after Import, if button present: isEnabled()===false and text!=='Import'; tolerate wizard already closed.
happy       iw-imp-03        [risky] Import a value with >7 decimals (1.123456789); immediately expect IMPORT_WARNING text displayed OR [aria-label='Dismiss import notification'] displayed; no brow
error       iw-imp-04        [risky] Stub addCol POST to 500; click Import; scoped wizard '<strong>Import failed: </strong>'; wizard stays on Review.
navigation  iw-imp-05        [rewrite] After failed import on step3, Back -> step2 no 'Import failed:'; Next -> step3 'Import failed:' shown again.
cancel      iw-cancel-01     [pass] Click scoped button=Cancel; wizard waitForDisplayed reverse; reopen -> stepper active on File Preview.
cancel      iw-cancel-02     [pass] Click $('[aria-label="Import Weather Data"]').$('[aria-label="Close"]'); wizard waitForDisplayed reverse.
keyboard    iw-cancel-03     [pass] With wizard open (not importing), browser.keys(['Escape']); wizard waitForDisplayed reverse.
cancel      iw-cancel-04     [risky] Click backdrop at offset clear of panel (element.click({x:-250,y:-300})) OR synthetic click the backdrop div; wizard waitForDisplayed reverse.
keyboard    iw-kb-01         [risky] On open activeElement is inside [aria-label='Import Weather Data'] (likely Close X); after Tab still within panel. Do NOT assert Browse.
empty       del-01           [risky] On freshly-created project Weather screen (no import/manual rows), [aria-label='Delete uploaded weather file'].isEnabled()===false. If the seed creates rows, dr
happy       del-02           [pass] After a successful import, [aria-label='Delete uploaded weather file'].isEnabled()===true.
structure   del-03           [rewrite] Open confirm; dialog containing h3 'Delete Data' displayed with p 'Are you sure you want to delete this? This action cannot be undone.' and Cancel+Delete; scope
happy       del-04           [rewrite] Click Delete; waitUntil delete-import dialog not displayed AND imported column input[value='<name>'] no longer exists. Assert button disabled only if no other m
loading     del-05           [risky] Immediately after Delete, if dialog open both Cancel and Delete isEnabled()===false; tolerate already-closed.
cancel      del-06           [rewrite] Open confirm, click Cancel inside delete-import dialog; dialog waitForDisplayed reverse; imported column input[value='<name>'] still exists.
keyboard    del-07           [rewrite] Open confirm; Escape -> dialog reverse; reopen, click dialog-close X SCOPED to that dialog -> closes; data still present.
structure   iw-struct-01     [rewrite] Add data-testid='wizard-step-{key}'; assert active label has font-semibold/text-white and Next moves the active class. Else match the newline label not a spaced
harness     ADDED            [add] afterEach re-registers original dialog:openFile and fs:readFile (or removeHandler) via browser.electron.execute so stubs do not leak across tests.
harness     ADDED            [add] Each test creates a project via HomePage flow (navigates to ProjectScreen, writes helios:activeScenarioId), then asserts Weather tab aria-pressed='true' before 
happy       ADDED            [add] On a fresh Weather screen button=Upload File is displayed and isEnabled()===true (no data-gating).
validation  ADDED            [add] With 0 valid rows the wizard cannot reach step3 (Import button never appears); Next stays disabled.
edge        ADDED            [add] Import a CSV with a column named 'check'/'Date-Time'/'year'; after import that column's header input[value] is absent (isDtName + saga reservedNames) while a no
edge        ADDED            [add] Import mixed valid/invalid-date rows; only valid-date rows are written (rowKeys filters dtIso!==null). Spot-check a valid value present, an invalid-only value a
happy       ADDED            [add] After toast appears, click [aria-label='Dismiss import notification'] -> toast waitForDisplayed reverse immediately.
persistence ADDED            [add] Advance to step2, Cancel, reopen -> wizard at step0 with empty filename and no parsed grid.
edge        ADDED            [add] On fresh scenario add a row via Add Rows (rowOrder>0) without importing; Delete Data enabled; confirming Delete clears rows.
instrumentation ADDED            [add] When asserting the delete-import dialog, do not match Add Column/New Rows/delete-row/delete-column dialogs — scope by h3 'Delete Data' or proposed testid.
placeholder ADDED            [add] FINDING ONLY: Weather/index.tsx renders WeatherToolbar without onFilter, so Filter onClick is undefined; do not test behavior.
instrumentation ADDED            [add] Add data-testid='wizard-step-{key}' so step assertions avoid whitespace-pre-line newline text; active label uses font-semibold/text-white.

================ Weather row/column CRUD + cell edit/validation  (overlap 55) ================
happy       ar-happy-01      [rewrite] Record visible 'Select ' checkbox count C before. Open Add Rows, set numberOfRows='3', valid startDate/startTime/delta='1', click Add (dialog button=Add scoped 
validation  ar-req-numrows   [pass] Open dialog, click dialog[aria-label='New Rows'] button=Add. waitUntil dialog[aria-label='New Rows'] [data-testid='error-numberOfRows'] is displayed with text =
validation  ar-pos-int       [rewrite] setInputValue(input-numberOfRows,'0'); waitUntil error-numberOfRows text === 'Number of rows must be a positive whole number.' (use setInputValue not setValue; 
validation  ar-max-rows      [pass] setInputValue(input-numberOfRows,'10001'); waitUntil error-numberOfRows text === 'Number of rows must be 10000 or fewer.'
validation  ar-date-req      [rewrite] On a scenario with no data rows (date seeds empty), open Add Rows, click button=Add to touch all fields, waitUntil error-startDate text === 'Start date is requi
validation  ar-date-year     [risky] Try browser.execute to set startDate input.value='1899-01-01' and dispatch input+change events; if formik registers it, waitUntil error-startDate === 'Start dat
validation  ar-time-req      [pass] setInputValue(input-startTime,''); then blur by clicking input-numberOfRows (or click Add). waitUntil error-startTime text === 'Start time is required.'
validation  ar-time-fmt      [pass] setInputValue(input-startTime,'25:00'); waitUntil error-startTime text === 'Start time must be in 24-hour format (00:00–23:59).' (note the EN DASH between 00:00
validation  ar-delta-req     [rewrite] setInputValue(input-deltaHours,''); blur (click another field); waitUntil error-deltaHours text === 'Delta is required.'
validation  ar-delta-max     [pass] setInputValue(input-deltaHours,'25'); waitUntil error-deltaHours text === 'Delta must be 24 hours or fewer.'
cancel      ar-cancel        [pass] Open dialog, click dialog[aria-label='New Rows'] button=Cancel; waitForDisplayed({reverse:true}); reopen and assert input-numberOfRows value === ''.
cancel      ar-x-esc         [risky] For 'x': click dialog-close inside dialog[aria-label='New Rows']; waitForDisplayed({reverse:true}). For Escape: ensure TimePicker24 is closed and focus is on a 
happy       ac-happy         [rewrite] Open Add Column, setValue(input-parameterName, uniqueName) on the fresh field, click dialog[aria-label='Add Column'] button=Add. waitUntil dialog[aria-label='Ad
happy       ac-default-fill  [rewrite] Provision 3 rows. Open Add Column, set parameterName unique, leave Data Type/Unit empty, set defaultValue='5', Add. waitUntil dialog closed AND for each of the 
validation  ac-name-req      [pass] Open Add Column, click button=Add (scoped to dialog); waitUntil dialog[aria-label='Add Column'] [data-testid='error-parameterName'] text === 'Column name is req
validation  ac-name-30       [pass] setValue/setInputValue input-parameterName to a 31-char string; waitUntil error-parameterName text === 'Column name must have 30 characters or fewer.'
validation  ac-default-nan   [pass] setValue input-defaultValue 'abc' (Data Type unset); waitUntil error-defaultValue text === 'Default value must be a number.' AND dialog button=Add isEnabled()==
validation  ac-default-decimals [pass] setValue input-defaultValue '1.12345678'; waitUntil error-defaultValue text === 'Default value can have at most 7 decimal places.' AND button=Add disabled.
validation  ac-unit-disabled [rewrite] On open assert input-unitId isEnabled()===false and its option[value=''] text === 'Select a data type first'. Read input-dataTypeId option values, select the fi
validation  ac-default-range [risky] Discover a data type+unit with finite min and max from the catalog; pick it; set defaultValue beyond max; waitUntil error-defaultValue text === `Value should be
error       ac-dup-name      [rewrite] Add a column 'DupCol' successfully. Reopen Add Column, set parameterName='DupCol', Add. waitUntil dialog[aria-label='Add Column'] still displayed AND dialog $('
cancel      ac-cancel        [risky] For each of Cancel / dialog-close x / Escape: trigger, waitForDisplayed({reverse:true}). After a duplicate-error open, Cancel then reopen and assert no p.form-e
happy       he-rename-happy  [rewrite] Add a user column; discover colId. setInputValue(aria-label='Column {colId} name', uniqueNewName); blur (click elsewhere). waitUntil that input value===uniqueNe
validation  he-rename-required [pass] On a user column, setInputValue(name input,'') then blur. waitUntil the sibling p.text-red-500 within the column's header cell text === 'Column name is required
validation  he-rename-30     [pass] setInputValue(name input, 31-char string); waitUntil sibling p.text-red-500 (scoped to that header cell) text === 'Column name must have 30 characters or fewer.
happy       he-rename-noop   [risky] Focus the name input, blur without changing; assert input value still === original name and no inline error appears. (Cannot assert network absence in E2E; trea
error       he-rename-backend-reject [risky] If a backend rename rejection can be provoked (e.g. rename to an existing column's name and backend enforces uniqueness): waitUntil the inline p.text-red-500 sh
happy       dt-unit-recompute [risky] On a column with a multi-unit convertible type and a known cell value, open DataTypeUnitPicker (aria-label='Column {colId} data type and unit'), pick a differen
happy       dt-type-change   [risky] Open picker, pick a NEW data type (role=option) then a unit (role=option). waitUntil picker button label === new unit AND a known cell's numeric text is unchang
selection   dt-back-assign   [risky] On a column with a committed type+unit, open picker (lands on unit view), click button*=Back to Assign Type. waitUntil picker button label === 'Data Type'. (Set
cancel      dt-picker-discard [risky] Open picker, click a data-type role=option (pending), then mousedown outside the picker (e.g. table body). waitUntil picker closed AND picker button label uncha
happy       dth-format       [rewrite] Provision >=1 row. Open Date-Time header (button*=Date-Time), pick a format role=option different from current (e.g. 'DD/MM/YYYY HH:MM'). waitUntil the date-tim
selection   dth-noop         [risky] Open Date-Time header, click the role=option with aria-selected='true'. waitUntil listbox (role=listbox) not displayed AND date-time cell text unchanged. (Outco
happy       delcol-confirm   [rewrite] Add a user column 'X'; click its trash aria-label='Delete column {colId}'. Locate the dialog whose h3 text === 'Delete X' (disambiguate from delete-row/delete-d
cancel      delcol-cancel    [rewrite] Open delete-column dialog (matched by h3 'Delete X'); for each of Cancel / dialog-close / Escape, close and waitForDisplayed({reverse:true}) on that dialog AND 
happy       delrow-confirm   [rewrite] Provision 3 rows; pick one rowId R. Click aria-label='Delete row {R}'. In the dialog whose h3==='Delete Row', click button=Delete. waitUntil dialog not displaye
cancel      delrow-cancel    [rewrite] Open delete-row dialog (h3==='Delete Row'); for each of Cancel/x/Escape, close and waitForDisplayed({reverse:true}) AND assert aria-label='Select {rowId}' still
structure   delrow-dialog-disambig [pass] Treat as instrumentation rule: always scope delete dialogs by h3 text ('Delete Row' vs 'Delete {name}' vs 'Delete Data'), since dialog aria-label is identically
happy       cell-edit-persist [rewrite] On a user numeric column, pick cell aria-label='{rowId} {colId}'. setInputValue to a valid number (in-range), blur. waitUntil the input value persists. Refresh 
happy       cell-edit-noop   [risky] Focus a cell, blur without typing; assert cell value unchanged and no red outline appears. (Outcome-only; cannot assert network absence.)
happy       cell-clear       [pass] On a cell with a value, click it, Ctrl+A, Delete, blur. waitUntil cell input value === ''.
validation  cell-numeric-gate [pass] Focus a numeric cell, type a letter. waitUntil input value does NOT contain the letter AND input aria-invalid==='true' AND an element aria-label='Validation err
validation  cell-decimal-gate [risky] Type '1.12345678' into a cell. waitUntil input value is truncated at <=7 decimals AND tooltip aria-label === 'Validation error: ' + VALIDATION_MESSAGES.MANUAL_I
validation  cell-global-gate [pass] Type '1000001' into a cell. waitUntil the value is blocked at 6 digits AND tooltip aria-label === 'Validation error: Value should be between -1000000 and 100000
validation  cell-range-live  [risky] On a column with a bounded unit (discovered), type an out-of-range numeric value; waitUntil red outline + tooltip aria-label === 'Validation error: Value should
validation  cell-range-one-sided [risky] If a min-only unit exists: below-min value -> tooltip aria-label contains 'Values should be ≥ {min}'. If a max-only unit exists: above-max value -> 'Values shou
keyboard    cell-keyboard    [risky] Focus a cell, type a valid number, press Tab; waitUntil value committed/persists. (Drop the Escape sub-assertion — it tests a non-behavior.)
selection   check-toggle     [rewrite] Provision >=1 row (check column seeded). Click aria-label='Select {rowId}'; waitUntil its checked property flips. Refresh; waitUntil checkbox reflects persisted
selection   check-all        [rewrite] Provision 3 rows. Click aria-label='Select all rows'; waitUntil all visible 'Select {rowId}' checkboxes are checked (or all unchecked on toggle back). Do NOT as
structure   virtualization   [pass] Provision small row counts (3-5) so all rows stay within the virtualization window, OR scroll bodyRef to the target row before querying. Never assert on or quer
empty       empty-seed       [rewrite] On first entry to a fresh scenario, waitUntil the Date-Time header (button*=Date-Time) is displayed AND the header checkbox aria-label='Select all rows' is disp
validation  ADDED            [add] In the Add Rows numberOfRows field (keepWholeNumberInput, /^\d*$/), type 'abc', '1.5', '-3' — assert NONE of these characters appear in the field (gate rejects 
happy       ADDED            [add] On a scenario WITH data rows, open Add Rows (start seeded). setInputValue deltaHours to a new whole number (e.g. '2'); waitUntil input-startDate and input-start
happy       ADDED            [add] Click the clock icon button aria-label='Open startTime picker' (FormField onIconLeftClick builds aria-label `Open ${name} picker` where name='startTime'). TimeP
happy       ADDED            [add] Select a data type in input-dataTypeId; waitUntil input-unitId enabled with value===base unit id AND the Enter Value FormField label text becomes 'Enter Value (
validation  ADDED            [add] With no unit, set defaultValue '2000000' (>1e6) -> validateCellValue returns GLOBAL_RANGE_MESSAGE -> error-defaultValue === 'Value should be between -1000000 an
cancel      ADDED            [add] dialog-close x inside dialog[aria-label='Add Column'] closes (reverse displayed); Escape (dialog onCancel) closes. Reopen resets fields. Splits the mapper's com
structure   ADDED            [add] On a fresh seeded scenario, assert there is NO input aria-label='Column {colId} name' for the check or date-time columns (isBackendManagedCol excludes name===ch
structure   ADDED            [add] On a scenario with rows, assert the date-time column cell has NO input aria-label '{rowId} {dateTimeColId}' (readOnly path renders <span>), and attempting to ty
happy       ADDED            [add] After ac-default-fill, refresh (preserve session) and assert the new column cells still show the default for existing rows — verifies the saga POSTed values[] (
selection   ADDED            [add] Because the check column is ALWAYS seeded, the pure rowSelection path (toggleRow/setRowSelection) is effectively unreachable in normal flow — the leftmost check
error       ADDED            [add] If buildRowsForAdd returns null or backend rejects, addRowFailed sets addRow.error and the dialog stays open showing p.form-error-text[role='alert']:not([data-t
structure   ADDED            [add] INSTRUMENTATION FINDING: ToolbarButton renders <button><span>{label}</span></button> with no aria-label/testid. Select via $('button=Add Columns')/$('button=Add

================ Weather screen lives at CenterWorkspace's default-activ  (overlap 42) ================
structure   wt-toolbar-01    [risky] All five toolbar buttons exist by visible text: 'Filter', 'Add Columns', 'Add Rows', 'Upload File', and the Delete Data button (button[aria-label='Delete upload
empty       wt-delete-disabled-01 [pass] On freshly seeded scenario (0 rows, no import) button[aria-label='Delete uploaded weather file'] isEnabled()===false; clicking it opens no dialog (the toolbar D
happy       wt-delete-enabled-01 [risky] After adding >=1 row and waiting for settle, waitUntil(button[aria-label='Delete uploaded weather file'].isEnabled()); click -> a dialog[aria-label='Delete'] wh
happy       wt-seed-01       [risky] On a fresh project's first scenario, waitUntil the select-all checkbox (input[aria-label='Select all rows']) AND the Date-Time header button (span text 'Date-Ti
structure   wt-seed-cols-02  [risky] After seed settles, the first column header after the select-all checkbox th renders the Date-Time dropdown (button containing span 'Date-Time'); there is no he
structure   wt-header-row-01 [risky] thead contains input[aria-label='Select all rows'], a th with visible text 'Action', and a trailing aria-hidden th. For per-column header presence/order add dat
empty       wt-empty-body-01 [rewrite] With 0 rows, tbody contains no WeatherRow trs: input[aria-label^='Select row_'] count === 0 and no button[aria-label^='Delete row row_']. Do not assert spacer c
happy       wt-addcol-happy-01 [risky] Open Add Column, setInputValue(input-parameterName, uniqueColName), click 'Add'; waitForDisplayed({reverse}) on dialog[aria-label='Add Column']; then waitUntil 
loading     wt-addcol-loading-01 [risky] Prefer asserting the settled outcome (dialog closes, new column appears). If the busy state must be checked, treat it as best-effort/non-deterministic against t
validation  wt-addcol-name-required [pass] Open dialog, click 'Add' (submitForm touches all) OR blur the name input; error-parameterName is displayed with text 'Column name is required.'
validation  wt-addcol-name-toolong [risky] setInputValue(input-parameterName, 'a'.repeat(31)); waitForDisplayed(error-parameterName) with text 'Column name must have 30 characters or fewer.'
validation  wt-addcol-value-nonnumeric [pass] setInputValue(input-defaultValue, 'abc') with no unit selected; error-defaultValue text 'Default value must be a number.' AND the 'Add' submit button isEnabled(
validation  wt-addcol-value-decimals [pass] setInputValue(input-defaultValue, '1.123456789'); error-defaultValue text 'Default value can have at most 7 decimal places.'
validation  wt-addcol-unit-disabled [risky] Initially input-unitId isEnabled()===false. After selecting any option in input-dataTypeId (selectByAttribute/VisibleText), input-unitId becomes enabled and its
error       wt-addcol-server-error [risky] Force a backend rejection (create a column, then Add another with the same name). Within dialog[aria-label='Add Column'], the server banner = p.form-error-text[
cancel      wt-addcol-cancel [pass] Cancel / dialog-close / Escape -> dialog[aria-label='Add Column'] waitForDisplayed({reverse}); reopen -> input-parameterName has value '' and no error banner.
happy       wt-addrows-happy-01 [risky] Open Add Rows; setInputValue(input-numberOfRows,'3'); ensure input-startDate (type=date) set directly to a valid YYYY-MM-DD, input-startTime to 'HH:MM', input-d
happy       wt-addrows-seed  [risky] On a scenario with no rows, opening Add Rows shows input-startDate value '' , input-startTime value '', input-deltaHours value '1'. After provisioning rows, reo
validation  wt-addrows-rows-required [pass] Open Add Rows, click 'Add' (or blur the empty Number of Rows after touching); error-numberOfRows text 'Number of rows is required.'
validation  wt-addrows-rows-max [pass] setInputValue(input-numberOfRows,'10001'); error-numberOfRows text 'Number of rows must be 10000 or fewer.'
validation  wt-addrows-date-required [risky] On an empty scenario (startDate seeds to ''), open Add Rows and click 'Add' (submitForm touches all); error-startDate text 'Start date is required.' Avoid tryin
validation  wt-addrows-date-year [rewrite] Hard to reach via the native date widget (min/max clamp the year). If covered at all, set input-startDate.value programmatically to e.g. '1800-01-01' via browse
validation  wt-addrows-time-format [risky] setInputValue(input-startTime,'25:99'); error-startTime text exactly 'Start time must be in 24-hour format (00:00–23:59).' (note the en-dash – not a hyphen).
validation  wt-addrows-delta-max [risky] setInputValue(input-deltaHours,'25'); error-deltaHours text 'Delta must be 24 hours or fewer.'
cancel      wt-addrows-cancel [pass] Cancel / dialog-close / Escape -> dialog[aria-label='New Rows'] waitForDisplayed({reverse}); reopen re-seeds (input-deltaHours back to '1' or inferred).
selection   wt-selectall-check-01 [risky] Provision a small N (e.g. 3) rows so all are on-window. With all checked, input[aria-label='Select all rows'] is checked; click it; waitUntil every input[aria-l
selection   wt-selectall-empty [pass] On a 0-row scenario, input[aria-label='Select all rows'].isSelected()===false; clicking it creates no row checkboxes and the box stays unchecked.
selection   wt-perrow-check-01 [risky] With >=1 provisioned on-window row, click input[aria-label='Select row_0']; waitUntil it flips (isSelected toggles) and the select-all header checkbox recompute
happy       wt-row-delete-01 [risky] Click button[aria-label='Delete row row_0']; the Delete dialog with heading text 'Delete Row' and body 'Are you sure you want to delete this? This action cannot
cancel      wt-row-delete-cancel [pass] Open the 'Delete Row' dialog, then Cancel / dialog-close / Escape -> dialog waitForDisplayed({reverse}); the row (button[aria-label='Delete row row_0']) still e
happy       wt-col-delete-01 [risky] Add a managed column first; resolve its colId from its name input; click button[aria-label='Delete column {colId}']; Delete dialog heading text 'Delete {name}' 
happy       wt-cell-edit-01  [risky] On a managed numeric column + provisioned row, focus input[aria-label='row_0 {colId}'], replace with a NUMERIC value (e.g. clear then addValue('42')), blur; wai
happy       wt-cell-noop-same [pass] Focus an editable cell input and blur without changing the value; the cell value is unchanged and no validation error appears (the guard skips the dispatch).
structure   wt-cell-readonly-01 [pass] For a date-time cell, the body td renders a <span> (text per chosen format) and NO input[aria-label='row_0 {dateTimeColId}'] exists. Identify via proposed data-
error       wt-cell-error-outline [risky] On a managed column whose unit max < 1e6, type a numeric value above that max into input[aria-label='row_0 {colId}']; assert input aria-invalid==='true' and the
structure   wt-virtualization [pass] With more rows than fit the viewport, off-window rows are absent (input[aria-label^='Select row_'] only returns the on-window band); a top/bottom aria-hidden sp
selection   wt-datetime-format [risky] With a provisioned row having date+time, open the Date-Time dropdown (button containing 'Date-Time'; add data-testid='datetime-header-trigger'), pick a differen
error       wt-header-name-dup [risky] Create two managed columns A and B; rename B's input[aria-label='Column {Bid} name'] to A's name and blur; waitUntil an inline error <p> (text-red-500, under th
keyboard    wt-keyboard-escape [pass] With Add Column / Add Rows / a Delete dialog open (and not in a loading/clearing state), press Escape -> dialog waitForDisplayed({reverse}). Scope each by its a
navigation  wt-tab-switch    [risky] Click the 'Output' tab button (aria-pressed toggles true) -> WeatherToolbar + table are removed from DOM (and the section is empty, Output has no content). Clic
navigation  wt-tab-default   [risky] After entering a project and waiting for the Weather screen to settle, the 'Weather' tab button has aria-pressed='true' and the toolbar (e.g. 'Add Columns' butt
structure   wt-action-column [risky] Header contains a th with visible text 'Action' (add data-testid='weather-header-action' for stability); each provisioned on-window row has button[aria-label='D
navigation  ADDED            [add] createProject -> do NOT clear helios:activeProjectId/activeScenarioId -> waitForMainWindow -> waitUntil ProjectScreen <main> present (projectsTable gone) -> wai
happy       ADDED            [add] Click the 'Upload File' toolbar button; waitUntil the ImportWizard renders (it is lazy-loaded — allow a generous waitUntil for the chunk). Assert the wizard's i
validation  ADDED            [add] With a non-numeric value in input-defaultValue (error-defaultValue showing), the 'Add' submit button isEnabled()===false even though not loading; clearing the v
validation  ADDED            [add] setInputValue(input-numberOfRows,'0'); error-numberOfRows text 'Number of rows must be a positive whole number.' (the digit gate keepWholeNumberInput allows '0'
validation  ADDED            [add] On an empty scenario, open Add Rows and click 'Add' (touches all); error-startTime text 'Start time is required.'
validation  ADDED            [add] setInputValue(input-deltaHours,'0'); error-deltaHours text 'Delta must be a positive whole number of hours.' (and clearing to '' would give 'Delta is required.'
error       ADDED            [add] Define a serverBanner selector scoped inside the open dialog as p.form-error-text[role='alert']:not([data-testid]); a fieldError selector as [data-testid^='erro
validation  ADDED            [add] On an editable numeric cell, attempt to type 'abc' -> the input value stays unchanged (empty/original) because isPartialNumericInput blocks it; the info-icon to
selection   ADDED            [add] FLAG: against a fresh backend every new scenario is seeded WITH a check column, so checkColId is never null in practice — the setRowSelection/setAllRowsSelectio
loading     ADDED            [add] FLAG (non-deterministic): the clearingImport window against a real backend may be too brief to observe; prefer asserting the settled outcome (data cleared, Dele
structure   ADDED            [add] delete-import heading='Delete Data', delete-row heading='Delete Row', delete-column heading='Delete {name}'. Bodies: import & row share 'Are you sure you want t
navigation  ADDED            [add] Click the 'Filter' toolbar button (onClick is undefined — onFilter never passed by Weather/index.tsx); assert NO dialog opens and the table is unchanged. Propos
navigation  ADDED            [add] Clicking 'Output' or '3D Window' shows an empty CenterWorkspace section (no Weather, no other content). This is expected placeholder behavior; assert emptiness,
```

---

## 6. # PLACEHOLDER / NO-OP FINDINGS (flag, do NOT test as behavior)

## ProjectScreen renders the three panel containers inside
  - LeftPanel expanded body is an empty <div className='overflow-y-auto p-3'> containing only the JSX comment {/* Tools: Geometry, Materials, Models */} (LeftPanel/index.tsx line 29). No tools rendered — placeholder. FLAG, do not test for content.
  - RightPanel expanded body is an empty <div className='overflow-y-auto p-3'> containing only {/* Properties */} (RightPanel/index.tsx line 28). No properties UI — placeholder.
  - CenterWorkspace '3D Window' tab renders NOTHING when active — there is no JSX branch for activeTab==='3dWindow' (only {activeTab==='weather' && <Weather/>} at line 71). Inert placeholder tab.
  - CenterWorkspace 'Output' tab renders NOTHING when active — no branch for activeTab==='output'. Inert placeholder tab.
  - The Tab union type includes a null member ('3dWindow'|'weather'|'output'|null) but no UI ever sets null — dead/unreachable state, not testable.
  - LeftPanel/RightPanel/CenterWorkspace each inject a reducer+saga (key leftPanel/rightPanel/centerWorkspace) whose ONLY watchers are FETCH_STATUS and SSE_CONNECT hitting /api/status and /api/events. The panel UIs NEVER dispatch these actions, so the redux/saga/HTTP machinery is wired but DEAD for collapse/tab interactions. Collapse and tab state are pure local useState. FLAG: no network activity on any collapse/tab interaction — do not assert HTTP for these flows.
  - MenuBar in the ProjectScreen Header is wired to onItemSelect={() => {}} (ProjectScreen line 200) — no-op handler. Out of scope for these panels but FLAG if encountered.
  - CollapseButton chevron rotation is purely cosmetic (inline style transform rotate 0/180deg) and mirrored between sides; do not write a test asserting rotation degrees — assert aria-label + parent width instead.

## ProjectScreen shell — Header (logo, coordinates, UTC of
  - Scenario chip is entirely static: literal text 'Scenario 1' (hardcoded in Header/index.tsx, not derived from scenario name/count/order).
  - Scenario chip 'Rename scenario' button (aria-label='Rename scenario') has NO onClick — placeholder/no-op.
  - Scenario chip 'Close scenario' button (aria-label='Close scenario', renders '×') has NO onClick — placeholder/no-op.
  - 'Add scenario' button (aria-label='Add scenario') has NO onClick — placeholder/no-op.
  - MenuBar onItemSelect={() => {}} on ProjectScreen — all 20 dropdown items (File/Edit/View/Tools/Help) are dead no-ops (contrast: HomePage wires 'New Project').
  - UTC Offset field is read-only by design — comment notes 'Kept read-only here until edit-and-save is wired'. No editing path exists.
  - LabeledField intentionally renders NO inline error text for invalid coordinates — only a red border + aria-invalid. Any textual error feedback would be the caller's job, and ProjectScreen does not add any.
  - updateProject.loading / updateProject.error exist in Redux (selectUpdateProjectLoading / selectUpdateProjectError) but the header UI does NOT render any spinner/disabled/error state from them — the coordinate commit is silent (no visible loading or failure surface).

## Weather CSV Import Wizard + Delete Data
  - WeatherToolbar 'Filter' button onClick=onFilter is wired to undefined from Weather/index.tsx (Weather passes no onFilter) — it is a NO-OP. Flag, do not test behavior.
  - StepFilePreview filename input is readOnly/tabIndex=-1 and only reflects state — it is not user-editable; the only way to set a file is Browse -> native dialog.
  - Wizard reset on close is implicit via parent unmount ({wizardOpen && <ImportWizard/>}); there is no explicit reset action — so any wizard-local step state is guaranteed discarded on close (good for tests, but means you cannot reopen mid-flow).
  - importReset / IMPORT_RESET action exists in code but is not dispatched by any flow in this feature (dead-ish path) — do not rely on it.
  - fetchStatus/SSE workers (fetchStatusWorker, sseWorker) and WeatherStatus are legacy scaffolding unrelated to import/delete — ignore.
  - The precision toast is also driven by backendAdjustedImportedValues / precisionNormalized from the scenario refresh, not only by client truncation — a value the backend rounds can trigger the same toast even if the client did not truncate.

## Weather row/column CRUD + cell edit/validation
  - WeatherToolbar 'Filter' ToolbarButton is wired to onFilter which is never passed by Weather/index.tsx (onFilter is undefined) — the Filter button is a no-op. Do not test filtering.
  - updateAllCheckboxesWorker swallows errors in a catch{} with a comment 'Follow-up error handling can be added once the UI has a place to show it.' — bulk-check failures have NO UI surface; do not assert error state for select-all.
  - DateTimeHeader button has no aria-label and the date-time cell value is display-only (computed from row date+time); editing a date-time cell never persists (updateCellWorker bails for DATE_TIME_COL_NAME). Do not attempt to edit date-time cells.
  - Pagination is intentionally unused (loadDataRequest omits limit; comment 'Pagination is intentionally not used yet'). Backend returns full table.
  - Add Column messages.errors.duplicateName/serverError constants exist but the dialog renders the raw backend error string, not these constants — assert against the actual server message or just presence of the role=alert banner, not the constant text.
  - Leftover commented console.log in WeatherTable.toggleAllCheck — no behavior.

## Weather screen lives at CenterWorkspace's default-activ
  - Filter toolbar button is a NO-OP: WeatherToolbar's onFilter prop is never supplied by Weather/index.tsx (only onUploadFile/importedFilename/onClearImportedFile/clearingImport passed), so onClick={undefined}. Clicking Filter does nothing — assert no dialog opens and no action dispatched; do not test 'filtering'.
  - DateTimeHeader 'No formats' branch and DataTypeUnitPicker 'No units' branch are guarded UI states that only appear if the catalog returns empty units — not user-reachable against a normal backend; flag, don't drive.
  - ProjectScreen MenuBar onItemSelect={() => {}} and Header onLogoClick navigate('home') are out of Weather scope; UTC Offset LabeledField is disabled/read-only (no edit).
  - RightPanel body is an empty placeholder ({/* Properties */}) — collapse buttons toggle width only; no Weather impact.
  - selectStatus/selectLoading/selectError/selectStreaming/selectStreamLog (legacy SSE) in Weather selectors are unused by toolbar/table — ignore.
  - updateAllCheckboxesWorker swallows backend errors silently (empty catch) — a failed select-all PATCH leaves optimistic UI checked with NO error surfaced; flag as known gap, assert only the optimistic outcome.


# E2E FEASIBILITY RISKS + MITIGATIONS

## ProjectScreen renders the three panel containers inside
  - The two collapse buttons share identical dynamic aria-labels ('Expand panel'/'Collapse panel'). A global $('button[aria-label=...]') is ambiguous and order-dependent. MITIGATION: add data-testid to CollapseButton (forwarded from each panel as left-panel-collapse-btn / right-panel-collapse-btn) OR scope strictly via a new data-testid on each <aside> (left-panel/right-panel) and query the descendant button. Do not rely on DOM order alone.
  - Width assertions depend on Tailwind class strings 'w-8'/'w-[340px]'. The 150ms width transition (transition-[width] duration-150) means getCSSProperty('width') can read an intermediate px value mid-animation. MITIGATION: assert on the className token (toHaveElementClass / getAttribute('class') contains 'w-[340px]') via auto-waiting expect, NOT the computed pixel width.
  - Both panel <aside> elements share the exact same className string, so class-based selection cannot distinguish them. MITIGATION: rely on new per-panel data-testids or on first/last <aside> child of <main>.
  - RightPanel is wrapped in React.memo(); a test author might assume it won't re-render on toggle. It DOES re-render because its own local useState changes. No mitigation needed — just don't assume memo blocks the toggle.
  - Reaching ProjectScreen requires provisioning a project (create navigates away + writes active ids) — there is no direct route. MITIGATION: reuse the HomePage page object create/open flow; wait for data-testid='header' to confirm ProjectScreen mounted before panel assertions. Each ChromeDriver launch = fresh DB, so self-provision; never assume a project exists.
  - Asserting Weather mount/unmount on tab switch needs a stable Weather sentinel element. If Weather lacks a data-testid, an existing toolbar button text/aria-label must be used; ensure the chosen sentinel is unique and not also present in 3D/Output (which render nothing, so any Weather element disappearing is a safe signal). MITIGATION: assert sentinel present on Weather tab and absent (waitForExist reverse) on 3D/Output.
  - Empty body <div> for collapsed panels is conditionally rendered (only when expanded). Assert its absence with waitForExist({reverse:true}) / not.toExist after collapse, NOT a visibility check.
  - Collapse/tab state is NOT persisted — after the harness's reloadToHome refresh (or any browser.refresh), panels reset to collapsed and tab resets to weather. Tests must not assume state survives a refresh; re-toggle within a single test after navigation.

## ProjectScreen shell — Header (logo, coordinates, UTC of
  - Coordinate commit is OPTIMISTIC-silent: no spinner/disabled/toast. Assert the OUTCOME (UTC Offset value change or refetched lat/long), using browser.waitUntil to tolerate the PATCH+GET round-trip race. Do not assert on intermediate loading state — none is rendered.
  - setValue appends on the controlled Formik lat/long inputs (they are seeded non-empty). Use setInputValue (click -> Ctrl+A -> Delete -> type) to REPLACE. Bare setValue only valid if the field is genuinely empty first.
  - Commit fires on BLUR, not on a button. Tests must move focus off the field (e.g. click the other LabeledField input) to trigger commitCoordinate; relying on keyboard Tab may be flaky — prefer clicking a sibling input.
  - UTC Offset recompute depends on the REAL backend's timezone derivation from lat/long. Choose coordinates known to map to a clearly different offset than the seed (e.g. cross continents) and assert value CHANGED (!= prior), not an exact string, to avoid coupling to backend tz data.
  - Boot auto-restore (ps-restore-01) requires setting BOTH localStorage ids then browser.refresh(); the harness beforeEach(reloadToHome) clears them, so this test must set them itself AFTER reload and then refresh again within the test body. Backend session-id persists across refresh so the project/scenario remain valid.
  - Stale-id bounce (ps-stale-01) needs a 4xx from GET /project for a saved id. Hard to force deterministically against a live backend without deleting the project first; if not feasible, downgrade to a placeholder finding rather than a flaky test.
  - Menu dropdown items are CSS visibility:hidden until parent hover -> direct .click() is 'not interactable'. Mitigate with browser.execute(node.click()) (same approach as HomePage.page.ts clickMenuItem).
  - Project title <span> and scenario chip container lack stable test-ids and share generic span markup with the aria-hidden '*' decorator. Add data-testid='project-title' and data-testid='scenario-chip' to avoid brittle text-based selection.
  - Header title only renders after GET /project resolves; assert with waitForDisplayed, never assume synchronous presence right after navigation.
  - Row entry: single .click() will NOT navigate (no onClick). Tests must use dblClick(), or focus+keys(Enter/Space). For dblclick prefer WDIO el.doubleClick() / browser action; ensure the row is the virtualized window (small dataset, self-provisioned unique name) before targeting.

## Weather CSV Import Wizard + Delete Data
  - NATIVE FILE DIALOG: window.api.openFile -> IPC 'dialog:openFile' -> dialog.showOpenDialog is an OS dialog WDIO cannot drive. Mitigation: before clicking Browse, use browser.electron.execute to re-register the main-process IPC handler — ipcMain.removeHandler('dialog:openFile'); ipcMain.handle('dialog:openFile', () => FIXTURE_PATH). The saga then calls window.api.readFile(FIXTURE_PATH) -> IPC 'fs:readFile' -> real fs.readFile; so write the fixture CSV/XML to a real temp path on disk first (e.g. in os.tmpdir via electron.execute fs.writeFileSync) and return that path. Alternatively also stub 'fs:readFile' to return fixture text directly so no real file is needed. Restore original handlers in afterEach.
  - openFile returns string|null and saga branches on null — to test cancel, stub the handler to return null (not to actually open a dialog).
  - Wizard is a custom <div role=dialog>, NOT a native <dialog>: assert open/closed with waitForDisplayed({reverse:true}) on [aria-label='Import Weather Data']; do NOT use waitForExist (it unmounts, so exist also works, but visibility is the documented convention).
  - The Delete Data confirm uses the shared <Dialog> with aria-label='Delete' — this label is SHARED with delete-row and delete-column dialogs (messages.*.dialogTitle='Delete'). Scope by adding data-testid='delete-import-dialog' (proposed) or by asserting the h3 text 'Delete Data' to disambiguate, since this is the always-in-DOM native dialog.
  - Import finalize races a scenario refresh (loadScenario) and waits for LOAD_SCENARIO_SUCCEEDED scoped to scenarioId before closing; use browser.waitUntil for the wizard to close / table to populate rather than a fixed pause — the settle path includes two HTTP round-trips.
  - Reaching the Weather screen requires entering a project (create -> navigate to ProjectScreen which loads the first scenario and writes helios:activeScenarioId). The Weather tab is the default active tab so no extra click is strictly required, but assert the 'Weather' TabButton aria-pressed=true (or click button=Weather) before interacting.
  - Each ChromeDriver launch = fresh empty backend; the first import test must self-provision a project+scenario. clearData on import is idempotent on empty scenarios, so importing into a freshly-seeded scenario is safe.
  - Toast auto-dismisses after 2000ms — assert its presence promptly (auto-waiting expect) or assert via the Dismiss button before the timer; do not browser.pause waiting for it.
  - WeatherTable rows are virtualized; assert imported data by column header name (<th> span) and a small fixture (few rows) rather than absolute row counts; scope assertions to the imported column names, not global counts.
  - Precision toast trigger depends on host behavior only through UTC-anchored parsing (parsers build dates in UTC) — safe across timezones; but the toast can also fire from backend precisionNormalized, so assert toast presence after importing a clearly >7-decimal value rather than asserting it is absent for borderline values.

## Weather row/column CRUD + cell edit/validation
  - Native <input type='date'> (startDate): WebdriverIO setValue/keys behaves oddly across the segmented date widget. Set value via a known-format string and verify formik value; the field is remounted (key flips with isOpen) so partial segments are cleared on reopen. Prefer setting a full 'YYYY-MM-DD' once on a freshly opened empty field.
  - Both delete dialogs and the toolbar Delete-Data dialog all use Dialog title 'Delete' -> identical aria-label. Mitigation: scope assertions by inner heading text ('Delete Row', 'Delete {name}', 'Delete Data') or add the proposed per-dialog data-testids.
  - Body rows are virtualized (ROW_OVERSCAN=12, ROW_HEIGHT_PX=36). Off-window rows/cells don't exist in DOM. Mitigation: provision small row counts (3-5) and assert only on visible rows, or scroll the body container before querying a specific row.
  - Dialog is always in the DOM (showModal/close). Mitigation: assert open/closed via waitForDisplayed({reverse:true}), never waitForExist.
  - Toolbar closes Add dialogs only on the loading->idle transition with no error (useTransitionToFalse in render). On very fast backends the spinner/disabled window is brief. Mitigation: assert the OUTCOME (dialog closed + rows/column present) via waitUntil, not the transient busy state.
  - Cell range errors do NOT block persistence — a value out of unit range is both saved (PATCH /update) AND keeps the red error. Tests must assert both the persisted value and the lingering tooltip; don't assume an error prevents the write.
  - Unit-only change fires a different endpoint (PATCH updateCol/{columnId} with converted values) than name/type changes (PATCH weather_data_header/{id}). Verify against the correct path; converted display values depend on catalog to_base_factor/offset which must come from the real catalog.
  - Add Rows/Add Column server-error <p role='alert'> and FormField field errors both use role='alert'. Field errors carry data-testid (error-<name>); server banner does not. Mitigation: select server banner as p.form-error-text[role='alert']:not([data-testid]) scoped inside the dialog.
  - Add Column submit button is also disabled when formik.errors.defaultValue is truthy (not just loading) — a bad default value blocks submit even though Data Type/Unit/Value are optional. Account for this when testing the disabled state.
  - Cell live validation dispatches SET_CELL_VALIDATION_ERROR on every keystroke (async settle). Use browser.waitUntil for the tooltip/aria-invalid to appear rather than asserting synchronously after a keystroke.
  - Empty-scenario seed (SEED_DEFAULT_COLUMNS -> addCol -> re-LOAD) runs asynchronously on first scenario entry. Tests must waitUntil the seeded date-time/check columns render before adding rows (addRow requires every column id present as a row key).

## Weather screen lives at CenterWorkspace's default-activ
  - VIRTUALIZATION: body rows are windowed (ROW_HEIGHT=36, OVERSCAN=12). Off-window rows are absent from DOM, so order/selection/count assertions must use small datasets (add few rows) or scroll the bodyRef container first. NEVER assert absolute row counts — only on the test's OWN provisioned rows by rowId prefix.
  - ROW IDs ARE INDEX-BASED (row_${i}) and RESET on every LOAD_SCENARIO_SUCCEEDED — after add/delete the saga refetches and re-keys ALL rows from row_0. Do NOT cache a rowId across a mutation; re-resolve by position/value after settle.
  - THREE dialogs share title/aria-label='Delete' (delete-import in toolbar, delete-column + delete-row in table). aria-label alone is ambiguous — disambiguate by heading text ('Delete Data' vs 'Delete {name}' vs 'Delete Row') or add Dialog data-testid props. Mitigation: scope queries within the open dialog and assert on heading.
  - REAL <dialog> via showModal/close: assert open/closed with waitForDisplayed({reverse:true}), NEVER waitForExist (always in DOM).
  - SETTLE TIMING: add row/column chain LOAD_SCENARIO_REQUESTED then wait for *_SUCCEEDED before the toolbar closes the dialog (useTransitionToFalse on loading edge). Use browser.waitUntil on dialog-closed AND on the new row/column appearing — tolerate the refetch race. Optimistic delete shows immediately but may roll back on backend error — wait for stable state.
  - CONTROLLED INPUTS: AddColumn name / AddRows numeric fields are Formik-controlled — use setInputValue (click->Ctrl+A->Delete->type) to REPLACE seeded Add Rows defaults (Start Date/Time/Delta are pre-filled); bare setValue only on the empty Number of Rows / freshly-opened name field.
  - CELL/HEADER inputs use dynamic aria-labels embedding rowId/colId — colId for managed columns is the stringified backend header id (unknown until created). Resolve colId at runtime from the header (e.g. via input[aria-label^='Column '] then read suffix), or add weather-cell-{rowId}-{colId} testids. Date-time colId is literal 'date-time'? NO — merged column keeps its numeric header id; dateTimeColId found by name==='date-time'.
  - SERVER vs FIELD error both <p role='alert'>: field errors carry data-testid='error-{name}'; the Add Column/Add Rows server banner has NO data-testid and class 'form-error-text'. Scope precisely to avoid cross-matching.
  - Native date input (Start Date type='date') is remounted via key on each open and ::-webkit-calendar-picker-indicator is hidden; the calendar opens via the left-icon button aria-label='Open startDate picker' calling showPicker() — driving the native picker UI in WDIO is unreliable; set the value directly on input-startDate instead.
  - NO browser.pause — use auto-waiting expect matchers + waitUntil for the LOAD refetch and optimistic settle on every mutation.
  - Two identical aria-label='Expand panel' collapse buttons (both panels collapsed by default) will match ambiguously if a test ever needs panel state; add collapse-left/collapse-right testids. Not required for toolbar/table tests (panels collapsed don't occlude).

---

## 7. Definition of done
- New spec files + Page Object methods, all green via targeted-subset runs then full file.
- Cover every interactive element, all validation boundaries with EXACT strings, cancel/x/Escape,
  empty/loading/error states, keyboard, selection.
- npx tsc --noEmit -p e2e/tsconfig.json clean; npx vitest run -u after adding test-ids to shared
  components, review the diff.
- DON'T automate visual/perf/alignment/splash-timing. Placeholder/no-op behaviors (Section 6) are
  findings, not tests.
