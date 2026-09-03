# CLAUDE.md — M2 e2e automation

Working notes for the effort to give the **M2 feature set** (Geometry, Materials,
left panel, 3D window) end-to-end coverage. Read this before touching `e2e/`.

---

## 1. What this work is

`M2` is ~230 commits ahead of `develop` and added the entire left-panel feature
set. The **unit** suite tracked that work closely; the **e2e** suite did not —
`git diff --stat develop..M2 -- e2e/` is 388 insertions, and every line is a
*repair* for M2's new tabbed workspace, not new coverage.

So the 312-test e2e suite covers develop-era features only (home page, project
screen, weather, upload wizard, persistence). We are adding coverage for the M2
features, driven by a supplied set of ~260 manual test cases.

### Standing constraints

| Rule | Why |
|---|---|
| **No backend code changes.** | Set by the project owner. Build-artifact refreshes (rebuild, prune, submodule checkout) are fine — those are not code edits. |
| **Frontend changes are `data-testid` only.** | No new props, no signature changes, no call-site edits. Testids are *derived from props components already receive*. |
| **Tests assert SHIPPED behaviour.** | Where the manual spec disagrees with the code, the test follows the code and the conflict is recorded as a DEVIATION, not encoded as a failing test. |
| **3D viewport is asserted by proxy.** | react-three-fiber draws into a WebGL canvas; WebDriver cannot see meshes. Visibility is asserted via the row's icon state. |

---

## 2. Environment — the two things that will waste your day

### 2.0 WHICH PLATFORM ARE YOU ON? Most of this section is Windows-only

Sections 2.2-2.4 below were written on Windows and several are inert elsewhere.
On the **native Linux** checkout (verified 2026-09-02):

| Windows note | Linux reality |
|---|---|
| `libhelios.dll` staleness (§2.2) | the artifact is `pyhelios/pyhelios_build/build/lib/**libhelios.so**`. Same staleness risk, same check with `-newer …libhelios.so` |
| `resources/backend/win` | `resources/backend/**linux**/heliosgui_backend/heliosgui_backend` |
| PowerShell build/prune scripts | not used; the packaged backend was already built |
| "reaping is POSIX-only, so on Windows every run leaves orphans" | `reapOrphans` **does** run here, and no orphan accumulation was observed across six full spec runs |

**Do NOT `pkill -f electron` on Linux.** The pattern matches the editor and the
agent harness themselves. `reapOrphans` already handles it; if you must sweep by
hand, match `heliosgui_backend` and nothing broader.

The backend can also be driven **directly over HTTP** without Electron, which is
by far the cheapest way to answer "what does the engine actually do?":

```bash
resources/backend/linux/heliosgui_backend/heliosgui_backend --port=PORT
# HELIOS_DATA_DIR / HELIOS_LOG_DIR point it at a scratch dir
```
Two gotchas: health is **`/health`**, not `/api/health`; and
`GET /api/project/{p}/scenarios/{s}/init` is the ONE route taking `session_id`
as a **query param** (EventSource cannot set headers) — everything else uses the
`session-id` header. Object creation requires the FULL property set (`texture_y`
included) or it 400s `MISSING_REQUIRED_PROPERTY`.

### 2.1 The backend submodule must match M2's pin

`M2` records backend **`91b4099`**, which is the only revision with the
`/api/catalog/*`, `/api/geometry/.../objects` and `/api/materials` (m2) routes.
An older checkout (`b706e1e`) serves none of them and the Geometry/Materials UI
is inert — `+ Ground` silently does nothing.

Verify:
```bash
cd helios-desktop-backend && git log -1 --format=%h     # want 91b4099
```

### 2.2 `libhelios.dll` goes stale silently — this is the big one

`build_binary.ps1` gates the native build on `Test-Path` **only** — it asks
whether the DLL *exists*, never whether it is *current*. Backend revisions pin
different `pyhelios` versions (`b706e1e`→`c4e2f31`, `91b4099`→`47c265e`), so
after a submodule bump the build happily reuses a DLL compiled from the old
source.

**Symptom:** `POST .../objects` returns `500 {"code":"BUILD_FAILED"}`, the
frontend looks broken, and nothing appears in the build log.

**Check:**
```bash
cd helios-desktop-backend
find pyhelios/helios-core/core/src -name '*.cpp' \
  -newer pyhelios/pyhelios_build/build/lib/libhelios.dll | head
# any output = the DLL is stale
```

### 2.3 Full backend rebuild (the order matters)

```bash
cd helios-desktop-backend
rm pyhelios/pyhelios_build/build/lib/libhelios.dll          # force the native build
powershell -File scripts/build_pyhelios.ps1 -PythonExe "$PWD/venv/Scripts/python.exe" -SkipPipInstall
```
Then **prune the MSBuild scratch before packaging** — the native build
regenerates `*.dir/`, `CMakeFiles/`, `x64/` under
`pyhelios/pyhelios_build/build/plugins/`, and PyInstaller bundling those blows
Windows' 260-char MAX_PATH (a `.tlog` path lands at 264):

```powershell
$plugins='...\pyhelios\pyhelios_build\build\plugins'
Get-ChildItem $plugins -Recurse -Directory -Force |
  Where-Object { $_.Name -in @('CMakeFiles','x64','Testing') -or $_.Name -like '*.dir' } |
  Sort-Object { $_.FullName.Length } -Descending |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -EA SilentlyContinue }
```
Healthy result: **830 files → 246**, longest bundled path 209 chars.

```bash
powershell -File helios-desktop-backend/scripts/build_binary.ps1
rm -rf resources/backend/win     # sync-backend REUSES an existing dir on Windows
npm run sync-backend
```

Acceptance: `GET /api/catalog/material-types` returns seven types, and
`+ Ground` inserts a `Ground.001` row.

### 2.4 Other environment notes

- **Kill orphans before every run.** `reapOrphans` in `wdio.config.ts` opens with
  `if (process.platform === 'win32') return` — reaping is POSIX-only, so on
  Windows every run leaves its Electron + backend processes behind. They
  accumulate, collide with the next session, and the run then dies in `before`
  after ~25s with every test skipped. It reads exactly like flakiness.
  ```powershell
  Get-Process electron, heliosgui_backend, chromedriver -EA SilentlyContinue | Stop-Process -Force
  ```
- Root `.env` is required and gitignored: `cp .env.example .env`.
- chromedriver caches to `os.tmpdir()`; a temp cleaner can empty the folder but
  leave it in place, after which wdio refuses to re-download. Fix: delete
  `%TEMP%\chromedriver\win64-<version>` and re-run. Set `WEBDRIVER_CACHE_DIR` to
  something stable to avoid recurrence.

---

## 3. Commands

```bash
# One spec file (fastest loop)
npx wdio run wdio.config.ts --spec ./e2e/tests/geometry.test.ts

# WATCH IT RUN — the window is hidden under automation unless this is set.
# It appears a moment AFTER launch: the window is created with show:false and
# revealed only when the renderer sends 'app:ready', which is later than
# waitForMainWindow() returns. Do not conclude the flag is broken.
HELIOS_E2E_HEADED=1 npx wdio run wdio.config.ts --spec ./e2e/tests/geometry.test.ts

# Narrow to one area — 133 tests otherwise flash past
npx wdio run wdio.config.ts --spec ./e2e/tests/geometry.test.ts --mochaOpts.grep "inline rename"

# Reproduce CI's narrow display
HELIOS_E2E_VIEWPORT=1024x768 npx wdio run wdio.config.ts --spec ./e2e/tests/geometry.test.ts

npm run build            # required after any src/ change, before running e2e
npm run e2e              # whole suite
npm run e2e:smoke        # journey.test.ts only
npm run e2e:typecheck    # tsc over e2e/
npx vitest run           # unit suite (the regression gate for testid changes)
```

---

## 4. Test hooks added to `src/`

All derived from existing props — **no component signatures changed**.

| Component | Testid | Derived from |
|---|---|---|
| `Accordion` | `accordion-{title}` `-toggle` `-body` | `title` |
| `ToolbarButton` | `toolbar-{label}` | `label` |
| `ColorPicker` | `color-channel-{r\|g\|b\|opacity}` | channel key |

Containers: `geometry-panel`, `geometry-tree`,
`geometry-tree-{loading,error,retry,empty}`, `geo-row-{id}`,
`geo-row-name-{id}`, `object-properties-form`, `object-name`, `object-save`,
`materials-panel`, `materials-list`, `materials-list-empty`,
`material-row-{id}`, `material-row-name-{id}`, `material-form-name`,
`material-card-{id}`, `material-card-save-{id}`, `left-rail-{section}`.

**Deliberately NOT hooked:**
- `SearchBar` keeps its hardcoded `data-testid="searchbar"` — changing it breaks
  `HomePage.page.ts` and 82 tests. All four instances have unique `aria-label`s.
- Row eye/render/delete icons — their `aria-label` **flips with state**
  (`Hide from viewport` ↔ `Show in viewport`), so a derived testid would be
  unstable. They are scoped inside `geo-row-{id}` and the label doubles as the
  state oracle.

Regression gate: `npx vitest run` must stay green. The only expected change is a
snapshot with **added attributes and zero deletions**.

---

## 5. Traps that cost real time — read before writing a spec

1. **An open `<dialog>` poisons the whole file.** `components/Dialog` always
   renders its `<dialog>`; `isOpen` only controls `showModal()`. One left open
   sits in the top layer and makes *every* later click fail with
   `element click intercepted`, naming the wrong element. Mutating helpers must
   self-clean on failure, and `afterEach` must sweep. Fixing this cut the
   geometry spec from **7m53s to 2m6s**.
2. **`dialog[aria-label="X"]` is ambiguous** — one per row plus one in the
   Properties form. Always add `[open]`.
3. **`setValue` loses to React.** Controlled inputs need the native value setter
   plus an `input` event (see `Weather.setReactInput`,
   `ProjectScreen.replaceValue`). This includes clearing to `''`.
4. **`aria-pressed` is INVERTED** on the eye/render icons: `true` = hidden.
5. **Nothing unmounts on collapse** — panel and accordion bodies use
   `display:none`. Assert `isDisplayed()`, never `isExisting()`.
6. **The rename editor stays open on an invalid commit**, so the row shows an
   input instead of the name span. Escape out before reading the name.
7. **Row action icons are `opacity-0`** until hover/focus/selection but always
   in the DOM. Click them in-page rather than via WebDriver.
8. **`Ground.NNN` is GAP-FILLING** — never hardcode the next name; derive it.
9. **Never save a ground above ~100 resolution cells** — outside
   `large-ground.test.ts`, which does it deliberately and pays for it in its own
   spec file. The rule stands, but the reasoning it used to carry was wrong in
   both directions. MEASURED 2026-09-02 against the packaged backend:
   - A **soil ground physically cannot exceed 511 per axis.** Every unstyled
     ground has `dirt.jpg` (512×512) baked into it, and the engine refuses
     `subdiv >= repeat × texture_px` (`Context_object.cpp`). 1000×1000 comes back
     **422 `RESOLUTION_TOO_HIGH`**. So the old advice "a max-boundary 25000×25000
     save would wedge the runner" describes a save that cannot happen at all.
   - **A colour-mode Visualiser material UNLOCKS it.** No texture, no cap, and
     the identical PATCH returns 200. The material is what permits the
     resolution — the inverse of the obvious expectation.
   - Costs at 1000×1000: build **10.9s**, assign another material **16.1s**,
     delete **15.7s**, mesh **70,000,004 bytes** (66.8 MB — the "228 MB" figure
     repeated in eight files is the TEXTURED case). All inside the 120s budget.
   - **The real hazard is memory, not time.** Backend RSS goes 0.11 GB → 2.55 GB
     on the build and **stays at 2.56 GB after the ground is deleted**. 2.45 GB
     is retained for the life of the process. That is why a big ground gets its
     own spec FILE: wdio gives each spec file its own session and backend, so the
     retention dies with it instead of following the other ~40 tests.
   - Always **close the eye before the big save.** `onGeometryUpdated` and
     `onMaterialAssigned` both bail on `!visibleInViewport`, so a hidden ground is
     never fetched or parsed. Never re-open it — unhiding triggers a fresh fetch.
10. **Portalled surfaces** (`Select` listbox, per-model menu, popups) attach to
    `document.body` — query from the root, never scoped to a panel.
11. **An out-of-range field raises a global error in the app.** WebdriverIO
    surfaces a pending page error on the NEXT `execute/sync`, so a read done via
    `browser.execute` comes back as
    `WebDriverError: Values should be between (0.01 - 1000000)` — the app's own
    copy arriving as a driver error rather than as the assertion it belongs to.
    Read field state with ELEMENT commands instead. (Product-side: worth a look,
    it would reach an error boundary in production.)
12. **`setField` does NOT bypass the keystroke guards.** `ObjectProperties.setField`
    used to claim it did, and two tests written on that belief failed. Its
    `input` dispatch runs React's `onChange`, which IS `handleFieldChange` — the
    guard tests the WHOLE incoming value and returns without storing it. What
    `setField` skips is per-CHARACTER delivery, not the guard. Consequence: the
    guard refuses non-numerics and refuses adding a `.` to an integer field
    before `validateFieldValue` ever sees them, reporting
    `This input is not supported` instead — so those routes never produce
    `messages.invalidInput`.
    **RESOLVED — `invalidInput` IS reachable**, by one route: an *incomplete
    exponent*. `1e` passes the guard (it must, or an error would flash on the
    `e` of a valid `1e3`), `expandForDisplay` leaves it alone because it is not
    a complete number, and the blur commits a value `Number()` reads as NaN.
    Float and integer fields alike. This file, `e2e/constants/geometry.ts` and
    `geometry.test.ts` all used to call the string dead; they were wrong.
    Covered by `ground.test.ts` → `describe('an incomplete exponent')`.
13. **HTML5 drag needs synthetic events.** Pointer actions cannot produce
    `dragstart`/`dataTransfer`. Rows split 30/40/30 by `clientY`, and
    `handleDrop` reads React state written by `handleDragOver` — so dragover and
    drop must be SEPARATE `browser.execute` calls with a polled settle between.
14. **Fault injection must patch XHR, not fetch.** axios resolves
    `new XMLHttpRequest()` at call time, so every REST call is XHR; `fetch`
    carries only the 3D mesh. A fetch stub would pass vacuously.
15. **`+ Ground` opens THAT ground's form.** After a second create the panel
    shows the new one — select the row you mean before editing it.
16. **A SELECTOR ENUM SHOWS THE GROUP NAME, NOT ITS STORED VALUE.**
    `materialBlueprint` maps each `selector_value` to the NAME OF THE GROUP it
    unlocks — its own comment says "so the driving dropdown reads
    'Ball-woodrow-berry' not 'BWB'". So the user picks `Farquhar model` while the
    stored value is `farquhar_model`. This broke **31 tests** in one run. Always
    go through `enumLabel(type, property, value)` in `e2e/constants/materials.ts`.
17. **`FormField` puts `input-{name}` on a DIV for an enum**, not on a control —
    its own comment explains why. So `MaterialProperties.setField` (which calls
    the HTMLInputElement value setter) throws `Illegal invocation` against every
    enum property. That one bug is why no material dropdown was ever tested. Use
    the `enumControl` / `openEnum` / `enumOptions` / `setEnum` helpers.
18. **Four strings in `Geometry/messages.ts` are DEAD CODE**: `deleteSuccess`,
    `deleteFailure`, `createFailed`, `renameFailed`, plus
    `assignMaterialSuccess` / `assignMaterialFailure`. The saga toasts come from
    `store/toastMessages.ts`. A test written from the feature's own messages.ts
    fails. Mirror toasts from `toastMessages.ts`, always.
19. **The assign toast belongs to the DROP path only.** `assignMaterialWorker`
    raises `materialAssigned`, and only `TreeRow` dispatches it. The right-panel
    Save goes through `updateObjectWorker`, whose only toast is `changesSaved`.
20. **This file has no `beforeEach(reloadToHome)`** (shared provisioning), so
    anything needing the Home sidebar must return there itself.
21. **A SELECTOR ENUM READS BACK DIFFERENTLY ON THE GROUND THAN IN THE FORM.**
    Trap 16 says the form shows the GROUP NAME (`Ball-woodrow-berry`, not `BWB`).
    The ground's read-only popup does the OPPOSITE: `buildMaterialSections`
    renders the **humanized stored code** — `farquhar_model` → `Farquhar Model`,
    `BWB` → `BWB`. So a user picks one string and reads back another, and a test
    that reuses `enumLabel()` for the popup fails, as does one that reuses the
    raw value. Go through **`readOnlyEnumValue(type, property, value)`** in
    `e2e/constants/materials.ts`. An ORDINARY enum
    (`two_sided_heat_transfer`) drives no group, so both surfaces agree and the
    helper is the identity. Pinned as a DEVIATION by `material-submodels.test.ts`.
22. **The read-only popup's `<dt>` labels are NOT in the e2e catalog mirror.**
    `MATERIAL_CATALOG` carries shape (datatype, bounds, groups) but not the
    catalog's `label` column. Use **`materialLabel(property)`**, which mirrors
    `LABEL_OVERRIDES[p] ?? catalog.label ?? humanizeProperty(p)`. Two entries are
    not the catalog's own text and cannot be found by grepping the database:
    `stomatal_model` ships as "Stomatal Conductance" and is OVERRIDDEN to
    "Stomatal Model", and the four Visualiser channels have no catalog label at
    all (the app supplies `R`/`G`/`B`/`Opacity (%)`). Note `gs, o` and `a1` repeat
    across stomatal sub-models — safe to assert on only because the sub-models are
    mutually exclusive, so one rendered popup never shows both.
23. **`ObjectProperties.detailRows(name)` / `.valueIn(rows, section, label)`** are
    the only way to read a VALUE off a ground. `detailSections()` returns headings
    only. `valueIn` returns `<no "X" row in Y>` on a miss rather than `''`,
    because the popup lists every catalog property of an active group INCLUDING
    the unset ones, and "blank" and "absent" must not look alike in a diff.

---

## 6. Coverage today

### `e2e/tests/geometry.test.ts` — 133 tests

Was 106 (92 literal `it(` + 3 parameterised loops expanding to 17). Do not
"correct" the count down to the literal one. The 27 added are the three new
groups below plus 6 rows appended to the existing range/boundary loops
(`length`/`breadth` above max, `position_*` at both bounds — neither had a
case).

Runtime: **8m 3.8s**, measured 2026-08-28 on this machine (130 passing,
1 skipped). Neither figure this file used to carry was right: the header's
"~7m 45s" and trap 1's "2m6s" contradicted each other, and the real number is
above both. Trap 1's 7m53s→2m6s pair describes the dialog fix's effect on a
much smaller file, not today's suite — treat it as history, not a baseline.

One file per surface, matching `homepage.test.ts` / `projectscreen.test.ts`.
Shared provisioning: one project for the file; each test creates rows via
`track()` and `afterEach` deletes exactly those.

| Group | n | Covers |
|---|---:|---|
| left panel — default state | 5 | expanded-by-default, aria-expanded, empty Models body, create actions, reachable without a tab |
| left panel — section toggling | 4 | independent sections, hidden-not-unmounted, no refetch, round-trip toggle |
| left panel — collapse | 6 | bodies hidden, icon rail, rail absent when expanded, button relabels, rail opens only its section, Space toggles |
| left panel — inert actions | 2 | Crop and Import from File create nothing |
| creation and auto-naming | 6 | empty tree, create round-trip, 3-digit padding, sequence, gap-filling, Properties form opens |
| viewport visibility (eye) | 5 | toggle, per-row independence, survives selection / rename, still searchable |
| render visibility | 2 | master switch, independent of viewport |
| inline rename | 8 | editor opens seeded, Enter commits, Escape discards, 20 ok / 21 rejected, empty rejected, case-insensitive duplicate, same-name no-op |
| search | 5 | partial filter, case-insensitive, whitespace trimmed, no-match hint ≠ empty hint, clearing restores |
| delete | 4 | cancel keeps, confirm removes, toast, last row → empty state |
| creation side effects | 3 | create toast, **3D mesh fetch**, blueprint defaults |
| range validation (negative) | 13 | 7 below-min, 3 above-max, empty-required, non-numeric, decimal-in-integer |
| boundary values (inclusive) | 8 | 7 accepted boundaries + max resolution validated WITHOUT saving |
| keystroke guards | 3 | letters rejected, 8 decimals refused, 7 accepted |
| save gating | 4 | disabled clean, enabled on edit, blocked while invalid, revert re-disables |
| save round-trip | 2 | PATCH + toast + mesh rebuild, survives reselect |
| texture repeat divisor | 2 | snaps on commit, exceeds-resolution blocks Save |
| name field negative | 1 | empty name does NOT disable Save |
| **panel chrome copy** | 5 | three sections by VISIBLE title, chevron rotation, all three headers round-trip, first tap hides the create actions, labels carry no "Add" prefix |
| **delete confirmation** | 6 | heading + generic body, Cancel-then-Delete with no "Yes", focus on Delete so Enter deletes, Escape, header ×, rapid taps open one dialog |
| **validation copy** | 8 | the catalog range message on 6 fields, "Invalid Input" for non-numeric and for an in-range non-integer |
| **grouping** | 10 | drag creates a group, expanded with indented members, chevron, add third, sibling-not-nested, Group.NNN sequence, duplicate group name, drag payload, two scope-loss guards |
| **backend failures** | 7 | failed create / delete / visibility-revert / rename / save, tree error + Retry, Retry recovers |
| **persistence + isolation** | 6 | customised props survive reopen, several grounds independently, new project empty, switching keeps each project's own, hidden + renamed survive reopen |

### How the 3D view is verified

WebDriver cannot see inside a WebGL canvas, and `toDataURL()` returns blank (no
`preserveDrawingBuffer`). But the app uses **axios/XHR for every REST call and
`fetch` for exactly one thing — the 3D binary mesh**. So patching `window.fetch`
captures the 3D pipeline and nothing else. `e2e/support/viewport3d.ts` records
it; the test asserts a `200` with a non-empty body on
`.../objects/{id}/geometry/binary` (269 bytes for a default ground).

That proves the backend built the tile and the viewport received it. It does NOT
prove it was painted correctly — nothing available to WebDriver can. It does
catch the failure that cost a day: a stale `libhelios.dll` makes the create 500
with `BUILD_FAILED` and no mesh is ever requested.

### `e2e/tests/materials.test.ts` — 252 tests, ~13m 12s

Measured 2026-09-02: **252 passing, 0 failing** (178 literal `it(`, expanded by
the generated sweeps). **The "151 tests, ~5m 15s / 149 passing, 2 skipped" this
header used to carry was stale** — do not restore it, and do not "correct" 252
down to the literal 178.

**252 passing, 1 skipped, 0 failing.** The single skip is the empty-library
self-skip (`an empty library shows "No saved materials yet."`) — the library is
GLOBAL, so it is essentially never empty. The OTHER historically-skipped test,
the texture library, now **runs and passes on Linux**: this build does bundle the
assets, and `GET /api/textures/defaults` returns `dirt.jpg`, `dirt2.jpg` and
`grass.jpg` (verified 2026-09-02). See the corrected product finding in §7.

**It had never run green, and it was ONE assertion away.**
`it('a new material opens with NO type cards')` asserted zero cards while
`reducer.ts:314` seeds `groups: [emptyCard(1, 1)]` ("Open it with one blank
card, ready to pick a material type") and the card's testid renders outside the
`open &&` gate. Corrected to assert exactly ONE blank card. Every other
assertion in the file was already right.

| Group | n | Covers |
|---|---:|---|
| panel / creation / naming / name validation | 17 | unchanged |
| material type dropdown | 5 | unchanged |
| **parameter ranges — the catalog sweep** | 41 | one test per numeric property: both bounds accepted, just-above-max rejected with the exact catalog message |
| **parameter ranges — below the minimum** | 4 | one representative property per type |
| **enum parameters (the portalled Select)** | 15 | every enum's options against the catalog, the pick sticking, the selector value/label split, the flag being a dropdown |
| **conditional parameter groups** | 3 | Farquhar revealed by its selector, all four stomatal sub-models swapping groups, gamma_co2 staying top-level |
| **catalog properties the form withholds** | 3 | the superseded broadband trio, the absent `glass_n_`, computed/external getting no input |
| **visualiser** | 23 | was 9 — inline picker, tab-not-toggle, absent sub-tabs, channel bounds, integer guard, save round-trip, texture library |
| radiation / generic cards / field validation | 12 | unchanged |
| **library list — ordering and chrome** | 4 | newest-LAST ordering, heading, search selecting a row |
| **delete confirmation — the material** | 5 | shipped copy, Escape, header ×, no stacked dialogs |
| **material-type cards** | 4 | the THIRD delete confirmation (a saved card), the all-types-added limit |
| **backend failures — loading the library** | 2 | failed list, failed open |
| search / delete / persistence / failures | 13 | unchanged |

The 2 skips are honest self-skips, not hidden failures: the empty-library test
(the library is GLOBAL, so it is essentially never empty) and the texture-library
test — which skips because **the library genuinely ships empty**, see below.

### `e2e/tests/material-assignment.test.ts` — 48 tests, ~4m 27s

Measured 2026-09-02: **47 passing, 1 self-skipped, 0 failing** (48 literal
`it(`). **The "23 tests, ~2m / 22 passing" this header used to carry was stale.**
The skip is the empty-library case at `:485`.

Covers the Select Materials picker (both shapes, its search, the single-select
radio rule), picking as a draft change, the Replace confirmation, the CONDITIONAL
unassign, the read-only detail popup, a failed save, the amber `stale` sync dot,
**drag-and-drop assign** (`dragMaterialOnto` — the old "no test uses it yet" note
is also stale; it now has six callers) including the collapsed-group fan-out, and
the panel hand-off ground → material → ground.

Added 2026-09-02 (+9):

| Group | n | Covers |
|---|---:|---|
| **renaming a material that is ON a ground** | 5 | a library-list rename relabels the OPEN ground form in place (no reselect, no refetch); the detail popup's `aria-label` follows; the picker follows; the rename survives a RESELECT — which is the oracle for `nameFor()`, because `DraftMaterialGroup.name` is a denormalized copy the geometry slice never repairs; and the form path commits on BLUR only (**Enter does nothing** — there is no `onKeyDown` on that input) |
| **the two duplicate-name paths** | 1 | the LIST row refuses client-side with `nameExists`; the FORM has no client check (`NO_NAME_CONFLICTS` is empty) so it takes the BACKEND 409 `nameExistsBackend` — pinned against each other in ONE test so the two strings cannot drift together |
| **one material on SEVERAL grounds** | 3 | two INDEPENDENT grounds (not the group fan-out) wearing one material; deleting it from the library empties BOTH grounds and BOTH pickers live; UNASSIGNING from one leaves the other wearing it — the differential that proves the delete test was about the delete |

Still not covered, deliberately: the **`drift`** sync dot, UNREACHABLE from the
GUI because every client write hardcodes `sync: true`.

### `e2e/tests/material-submodels.test.ts` — 30 tests, ~2m 13s

New file, 2026-09-02. **30 passing, 0 failing** first run (24 literal `it(`,
expanded by a per-sub-model loop).

**It is a JOIN, and that is the whole point.** `materials.test.ts` drives the
sub-models inside the FORM (reveal / hide / switch-blanks / survives a reload),
and `material-assignment.test.ts` drives ASSIGNMENT. Nothing carried a
sub-model's coefficients from the form, over an assignment, to the ground's
read-only view and compared them value by value — which is what the feature is
actually for.

| Group | n | Covers |
|---|---:|---|
| **Photosynthesis — Farquhar on a ground** | 8 | the group's EXACT membership (a 15th coefficient added by a migration would otherwise ship green); **ALL 14 coefficients filled, assigned and read back one for one** with spread values so a shifted mapping cannot coincidentally agree; the selector's form-vs-ground disagreement; `topt_*` accepting 273 and rejecting 272.9; top-level fields listed alongside the group; an ORDINARY enum read back RAW while the SELECTOR is humanized; survival of a reselect; a post-assignment edit reaching the ground with no reload |
| **Stomatal Conductance — all four sub-models** | 12 | generated per sub-model from `SUBMODELS`: each one's own parameters and ONLY its own reach the ground, and each reads back as its stored CODE (`BWB`/`BBL`/`Medlyn`/`BMF`), not the `Ball-woodrow-berry` the user clicked |
| **the widest bounds, SAVED** | 3 | `gamma_co2` staying top-level across sub-models; `bbl_d0` at 5000000 and `bmf_k` at 10000000 accepted, `+0.1` refused, both saved onto a ground; switching the sub-model after assignment swaps what the ground shows |
| **read-only fidelity** | 6 | numbers NOT reformatted (character for character); a value typed `1e3` stored EXPANDED and read back `1000`; an unset field still gets a row with an EMPTY value; two type cards → two sections with a shared label disambiguated by section; sections collapsible and open by default; the popup carries THIS material, not another |
| **the DROP path** | 4 | a drop assigns immediately with its toast and no Save, coefficients readable at once; a REPLACING drop swaps the reported sub-model; a FAILED card save leaves the PREVIOUS values on the ground; the coefficients survive REOPENING the project |

### `e2e/tests/large-ground.test.ts` — 4 tests, ~1m 44s

New file, 2026-09-02. **4 passing, 0 failing.** Deliberately its own spec file —
see trap 9: a 1000×1000 build retains **2.45 GB** in the backend that DELETE does
not reclaim, and wdio gives each spec FILE its own session and backend, so the
retention dies with this file instead of following the other ~40 tests.

| n | Covers |
|---:|---|
| 1 | a 100 × 100 m ground SAVES at a safe resolution — **extent is not what costs**, cell count is |
| 1 | a SOIL ground REFUSES 1000 × 1000; the engine's own message reaches the form's inline error, unattached to any field |
| 1 | with a COLOUR-mode Visualiser assigned the SAME save is ACCEPTED — **the material is what unlocks the resolution** — the row hidden throughout, asserted by proving no mesh was fetched |
| 1 | **the colour surface is a ONE-WAY DOOR** — see the product finding in §7 |

### `e2e/tests/ground.test.ts` — 22 tests, ~1m 25s

New file. **22 passing, 0 failing.** Written from a case-by-case audit of the
239 cases in `docs/test-cases-ground-container.md` against EVERY layer — e2e,
the 1579-line `Geometry/tests/ObjectPropertiesForm.test.tsx`,
`RightPanel/tests/index.test.tsx`, and the backend pytest suite. That audit
found 98 covered, 117 covered at unit/API level but not e2e, and **24 covered
nowhere**. This file holds every one of those that is reachable from the UI.

**The other five stay MANUAL.** `GRD-API-01/02/03/16/17` (DATATYPE_MISMATCH,
INVALID_NUMBER, and `properties` as an array) are API-contract cases with no
route from the form — the keystroke guard blocks every path — so testing them
means editing the backend suite, which the no-backend-changes rule forbids.
They are documented cases, not gaps waiting to be filled. Do not "fix" them by
adding a pytest file.

**Do not add field-validation, keystroke-guard, save-gating or texture-repeat
cases here.** They are already covered — mostly at the unit layer, which sees
them better and faster. The audit's whole point was that the e2e suite had been
read in isolation and the same ground re-covered.

The through-line of what was missing: **the right panel's NAME field.** Nothing
at any layer had driven the pencil, so `handleNameBlur` — the only path to a
rename from this form, and the only place `NO_NAME_CONFLICTS` makes the form
behave differently from the tree — was unreached code.

| Group | n | Covers |
|---|---:|---|
| rename from the Properties form | 5 | read-only until the pencil, double-click, BLUR commits (Enter does not), delete closes the form |
| duplicate name — the form path | 3 | no client-side check → the real 409, error survives a panel collapse, group/geometry namespaces |
| save gating — the name | 1 | a name change alone never lights Save |
| an incomplete exponent | 4 | the ONE reachable route to `Invalid Input` |
| **a ground at its catalog maxima** | 2 | length/breadth/position/rotation ALL at max, SAVED, and surviving a reselect |
| save gating — partial recovery | 1 | two invalid fields, fix one, Save stays down |
| the name validation tooltip | 2 | empty name sends no PATCH; the tooltip goes with the form |
| inline rename by BLUR | 2 | the discard and commit branches — `commit:'blur'` had never been passed |
| loading a ground | 1 | an unsaved edit is discarded on switching rows |
| a failed per-object load | 1 | it is SILENT (deviation + product finding) |

### `e2e/tests/material-uploads.test.ts` — 6 tests, ~40s

**6 passing, 0 failing**, measured 2026-09-01. The only spec that drives a file
picker with a REAL file. Everything else in the suite builds its uploads inline
as strings, which can only ever express a file the app REFUSES — so before this
file, nothing had uploaded anything the app accepts, and the accept path is the
only one that POSTs, stores a file on disk and reads it back.

| Group | n | Covers |
|---|---:|---|
| spectral data | 2 | a valid Helios library — the BACKEND parses the stored file and reports its five spectra; a genuine ANSI N42 XML refused at the root check |
| texture | 4 | a PNG **at** the 10 MB cap accepted; one megabyte past it refused; a real PNG named `.jpeg` refused as a format MISMATCH; an uploaded texture reaching a ground through drag-assign |

**The fixtures are load-bearing — do not swap them for "some other image".**

| fixture | bytes | why that number |
|---|---:|---|
| `test_image_10MB.png` (`TEXTURE_PNG`) | 10,485,760 | EXACTLY `MAX_TEXTURE_BYTES`. `validation.ts:114` rejects on a strict `>`, so this is the happy path AND the inclusive boundary in one file |
| `test_image_11MB.png` (`TEXTURE_OVERSIZE_PNG`) | 11,534,336 | the same image re-encoded past the cap — a genuine PNG in every other respect, so it can only fail on size |
| `test_image.png` (`TEXTURE_SMALL_PNG`) | ~25 KB | for rejections that need REAL image bytes but fail early. Shipping 10 MB of base64 over the WebDriver wire to be refused at byte 8 is pure cost |

Two traps this file already paid for:

1. **`10485760` is not decoration.** On its own, "10 MB is accepted" is also
   satisfied by an app with no size rule at all; only the pair pins `>` against
   `>=`. That property lives in a byte count that nothing enforces, so the accept
   test asserts `statSync(...).size` itself — otherwise re-encoding the fixture
   turns the boundary case into an ordinary one with every assertion still green.
2. **No fixture may lie about its own format.** The mismatch case overrides the
   name at the `File` constructor (`uploadImage(cardId, file, asName, mime)`)
   rather than committing a mis-labelled image. One such file did land here — a
   JPEG named `.png` — and was indistinguishable from an accident; it has been
   re-encoded to a real PNG. A `.png` fixture that is secretly a JPEG will
   silently redirect the happy path into `textureFileFormatMismatch`.

**The e2e tree is NOT under `npm run format`** (that script is `src/**` only) and
several files there already fail `prettier --check` — `e2e/constants/materials.ts`
keeps its catalog as one compact line per property on purpose. Do not run
prettier over `e2e/`; it explodes that table into 8-line blocks and buries the
real diff.

### Supporting files
```
e2e/pages/Geometry.page.ts          rows, groups, tree states, one-execute snapshot
e2e/pages/LeftPanel.page.ts         panel + accordion chrome, titles, chevrons
e2e/pages/ObjectProperties.page.ts  ground form: fields, tooltip errors, save, NAME row,
                                    the material picker, and detailRows()/valueIn() —
                                    the ONLY way to read a VALUE off a ground (trap 23)
e2e/pages/RightPanel.page.ts        the collapse chevron (display:none, never unmount)
e2e/pages/Materials.page.ts         library rows, search, delete
e2e/pages/MaterialProperties.page.ts type cards, portalled Select, card fields
e2e/support/dialogs.ts              READ an open <dialog> without completing it
e2e/support/dnd.ts                  synthetic HTML5 drag (grouping AND material assign)
e2e/support/faults.ts               XHR fault injection
e2e/support/toasts.ts               snackbar reads (auto-dismiss ~2.5s)
e2e/support/viewport3d.ts           3D mesh-fetch verification
e2e/constants/geometry.ts           copy, live-catalog bounds, safety ceiling
e2e/constants/materials.ts          materials copy, limits, live catalog types, the
                                    LABEL table + materialLabel(), readOnlyEnumValue()
                                    (trap 21), SUBMODELS, midRangeValue(), propDef()
e2e/support/harness.ts              enterGeometry(), enterMaterials()
e2e/config/fixtures.ts              fixture paths + the byte counts that matter
e2e/fixtures/materials/             real upload files (see material-uploads.test.ts)
```

`dialogs.ts` is the one that unblocked a whole class of assertion. Both page
objects only offered helpers that drive a confirmation straight to completion
(`deleteRow` / `cancelDelete`), so nothing could observe a dialog while it was
open — which is why none of its copy had ever been asserted and why
`deleteTitle` / `deleteBody` sat in the constants with no consumer. Two traps
it encodes: the header `×` lives OUTSIDE the body div, so a bare
`dialog[open] button` list has three entries where the component only counts
two; and the heading is two sibling `<p>` on a tree row but `<h3>` + `<p>`
everywhere else.

---

## 7. Deviations — manual spec vs shipped code

Tests follow the code. Each is marked `DEVIATION` inline.

| Spec claims | Code does |
|---|---|
| Panel/sections default **collapsed** (~8 cases) | All default **expanded** |
| Models tab has content | Body is empty (`future step`) |
| "Add Crop" / "Add Ground" | Labels are `Crop`, `Ground`, `Import from File` |
| Crop / Import start workflows | Both handlers are `() => {}` |
| "Number of Tiles" rows/columns | `Number of Textures`, labels `R`/`C`, must **divide** the resolution |
| Size/tiles **strictly > 1** | Bounds are **inclusive**: size ≥ 0.01, texture ≥ 1 |
| "Select Texture" is a toggle; sub-tabs disabled | It is a **tab**; sub-tabs are conditionally **rendered**, labelled `From Library` / `Upload File` |
| A colour-wheel opens a palette | `ColorPicker` is **inline** |
| Type "Visualisation Properties" | It is **`Visualiser`**. The other six names are correct — Solar Position and Boundary Layer Conductance *are* material types (and model types too) |
| Toast "Unable to create group…" | No such string; shipped toasts come from `store/toastMessages.ts` |
| Empty material name disables Save | It blocks the **rename commit** only |
| Delete dialog: "Are you sure you want to delete this geometry? This will delete the existing data and progress." | Generic body: `Are you sure you want to delete this? This action cannot be undone.` — names neither the geometry nor its data. Same string for materials |
| Delete dialog buttons "Yes" / "Cancel" | `Cancel` then `Delete`. Order matters: Dialog focuses the LAST enabled body button, so **Enter on an opened confirmation deletes outright** |
| Dialog background is blurred | Flat `backdrop:bg-black/50` scrim. `backdrop-blur` appears only in `Weather/SelectionActionBar` and `Viewport3D` |
| One delete-dialog heading | TWO. The tree row builds `Delete "Ground.001"?` (and `Delete "G" and its N geometries?`); the right panel uses `Delete Ground.001` — no quotes, no question mark |
| Chevron points DOWN by default | The rotation mapping is right, but all three sections ship EXPANDED, so the default a user meets is the UP chevron |

These six are now **pinned by tests** rather than only recorded here: the suite
asserts the shipped copy and carries the conflict as a DEVIATION comment, so a
change in either direction surfaces. The rest of the table is recorded only.

### NOT a bug: the trailing space in `constants.ts:91`

The group DELETE template ends `.../objects ` with a trailing space. It is
**cosmetic**. The WHATWG URL parser strips leading and trailing spaces before
the request is made, so the wire sees `.../objects`, the backend route matches,
and deleting a group works. Verified with `new URL('…/objects ')`.

Recorded because an investigation here built three rounds of theory on that
space — "404 → scope loss → go-Home dialog" — without ever checking whether it
survives into the request. One `new URL()` call would have ended it. Tidy the
space up if you like; do not treat it as a defect.

### PRODUCT FINDINGS from the materials work (not test bugs)

- **The texture library ships empty ON WINDOWS ONLY — it is fine on Linux.**
  CORRECTED 2026-09-02. `list_default_textures()` resolves
  `Path(__file__).parents[2]/assets` = `_internal/assets`. The Windows
  `scripts/build_binary.ps1` has no `--add-data` for
  `helios-desktop-backend/assets`, so that build serves `{"textures": []}`. The
  **Linux** package DOES bundle them: `_internal/assets/` holds `dirt.jpg`,
  `dirt2.jpg` and `grass.jpg`, and `GET /api/textures/defaults` returns all
  three (verified against the packaged binary). So the story's "select a texture
  from a set of predefined Helios textures" IS satisfiable here, the e2e test no
  longer self-skips, and the remaining defect is a **packaging gap on Windows**,
  not a missing feature. Do not re-file this as "the feature does not work".
- **`GEOMETRY_MSG.invalidInput` is reachable after all — via an incomplete
  exponent.** Earlier notes here called it dead. Type `1e` and blur: the guard
  admits it, `expandForDisplay` cannot expand it, and `Number('1e')` is NaN. It
  is the ONLY route — a letter, or a `.` added to an integer field, is refused
  by the guard first and reports `This input is not supported`. Now covered by
  `ground.test.ts`.
- **`GEOMETRY_MSG.objectDeletedNotice` IS unreachable from the GUI.**
  `This geometry was deleted. Close the panel.` never appears from either trash:
  `DELETE_NODE_SUCCEEDED` nulls `createDraft` when the removed object is the one
  on screen (`reducer.ts:465-470`, "close it rather than leave it in the
  read-only 'deleted' state"), so the form unmounts instead. `objectDeleted`
  needs the node to leave `nodesById` while the draft SURVIVES — a `LIST_NODES`
  refetch after a delete performed elsewhere. That is why the string has never
  had a consumer. `ground.test.ts` pins the shipped close instead.
- **A failed per-object load is COMPLETELY SILENT.** `loadObjectFailed` is
  dispatched (`saga.ts:274`) and handled by nothing — no reducer case, no toast,
  no listener anywhere in `src/`. Clicking a ground whose `GET` fails produces no
  feedback at all and leaves the panel as it was. Pinned as a DEVIATION in
  `ground.test.ts`; worth a product decision before Geometry sign-off.
- **`drift` on the material sync dot is unreachable from the GUI.** Every client
  write hardcodes `sync: true`, so only `stale` can be produced.
- **A COLOUR MATERIAL ON A HIGH-RESOLUTION GROUND IS A ONE-WAY DOOR, AND THE
  FAILURE IS NOT CLEAN.** The sharpest finding from the 2026-09-02 work; pinned
  by `large-ground.test.ts`. A colour-mode Visualiser is what lets a ground
  exceed the 511/axis soil-texture cap (trap 9). But it can then never be
  swapped or removed at that resolution: replacing a material is
  *delete-then-add* (`updateObjectWorker` DELETEs the displaced assignment before
  the add-only PATCH, "so the ground is never momentarily double-assigned"), and
  with the last material gone the backend's desired surface reverts to `soil`, so
  `_apply_assignment_change` tries to rebuild the tile with `dirt.jpg` at
  1000×1000 — the very thing the engine refuses. The intermediate state is
  unbuildable.
  **The worse half:** `unassign_material_group` does `db.delete(...)` then
  `db.commit()` and only THEN calls `_apply_assignment_change`. So when the
  repaint raises, the assignment is ALREADY COMMITTED AWAY and the 422 is
  returned on top of it. `update_object` compensates for exactly this on the
  intrinsic path (it re-upserts `prev_canonical` before re-raising); the unassign
  path has no such rollback. The user is told the save failed while the backend
  has genuinely dropped the material, and the client's `materialBaseline` still
  lists it — so a second Save tries to DELETE an assignment that no longer exists
  and fails differently. The user's only route back is to lower the resolution
  first, and nothing in the UI says so. **Product decision needed.**
- **The two surfaces disagree about a selector enum.** The Materials form shows
  the GROUP NAME a value unlocks (`Ball-woodrow-berry`); the ground's read-only
  popup shows the humanized STORED CODE (`BWB`). Both are deliberate and both
  carry comments saying so, but together they mean a user picks one string and
  reads back another. See trap 21; pinned by `material-submodels.test.ts`.
- **A 422 `RESOLUTION_TOO_HIGH` has no specific handling in the frontend**, but
  it is NOT swallowed: `api.ts` surfaces the backend's `detail.error` verbatim,
  `UPDATE_OBJECT_FAILED` writes it to `draft.createDraft.saveError`, and the form
  renders it on its inline `.form-error-text` line. So the engine's own sentence
  ("Ground resolution is too high for the ground texture. Lower the resolution
  and try again.") does reach the user — just unattached to the field that caused
  it, with both resolution inputs left looking valid.
- **`topt_tpu` is 273-373 in the catalog; Story 10 states 272.** Every other
  numeric bound in that story matches the live catalog exactly.
- **Both `031` migrations DID land** on this machine's database (schema v31
  carries the spectrum properties AND the photosynthesis submodel selector), so
  the duplicate-version risk did not materialise here. It is still worth fixing:
  a database stamped 31 by the first file before the second existed would skip
  the second permanently.

### OPEN: ungroup by dropping on the tree background

Dragging a member onto the empty area below the tree does **not** ungroup it,
despite `handleRootDrop` existing — so there is no test for it.

**This is unresolved, not settled.** The acceptance criteria explicitly require
the gesture, so it is either a missing feature or a stale requirement. Parked by
the team for now; revisit before Geometry sign-off.

### Ground bounds (live catalog, backend `91b4099`)

| property | type | min | max |
|---|---|---|---|
| `length`, `breadth` | float | 0.01 | 1e6 |
| `resolution_x/y` | integer | 1 | 25000 |
| `position_x/y/z` | float | -1e6 | 1e6 |
| `rotation_z` | float | 0 | 360 |
| `texture_x/y` | integer | 1 | — (must divide the resolution) |
| name | — | 1 | 20 |

**`resolution_x/y`'s catalog max of 25000 is NOT the reachable maximum.** The
engine caps a TEXTURED tile at `texture_px × repeat`, and every unstyled ground
carries the 512px `dirt.jpg` — so the real ceiling on a default ground is **511
per axis**, and 25000 is only approachable on an UNTEXTURED (colour-material)
ground. See trap 9.

---

## 8. Still to do

Geometry is ~60% of its action surface. What is left, roughly in value order:

- ~~**Material assignment** to a geometry~~ **DONE** — the Select popup, assign
  (both the picker+Save path and drag-and-drop), the Replace confirmation,
  unassign, the read-only detail popup, cross-panel rename, one material on
  several grounds, and `stale` are all in `material-assignment.test.ts`;
  sub-model values through to the ground's read-only view are in
  `material-submodels.test.ts`. `drift` remains UNREACHABLE from the GUI.
- **Per-model visibility dropdown** — right-click the render icon. Only the
  all-models master switch is covered.
- **Delete from the Properties form** — its own trash and the
  `This geometry was deleted. Close the panel.` notice.
- **Multi-select** (Ctrl/Cmd-click) — needs a synthetic click carrying modifiers.
- **Reorder** — the before/after drag bands. Client-only, never persisted.
- Smaller: the `-0` signed-zero rule,
  `position_*` / `length` upper bounds, search matching a GROUP name, name
  namespaces (a geometry may take a group's name), row keyboard access,
  `+ Ground` disabled during an in-flight write, the row busy spinner, and the
  1s created-row highlight.
- ~~`materials.test.ts` — the whole Materials surface~~ **DONE**: library CRUD,
  the type dropdown against the live catalog and the visualiser tabs are in
  `materials.test.ts`; texture and spectral upload are in
  `material-uploads.test.ts`. The **From Library** tab is now testable on Linux
  (the assets ARE bundled here — see the corrected §7 finding), so its test no
  longer self-skips; what remains are the two `validateTextureFile` branches:
  `textureFileCorruptError` (bytes with a valid 8-byte header behind which
  nothing decodes) and `textureFileTooLargeDimensions` (a flat-colour image over
  8192px, which compresses small enough that the byte cap never sees it).
- ~~Scientific-notation expansion on blur~~ **DONE for materials** — the `1e`
  incomplete exponent, `1e3`/`1e-3` blur expansion, the integer-field second
  route to `Invalid Input`, and the `1e-9` keystroke refusal are in
  `materials.test.ts`. The GROUND-side analogue was already in `ground.test.ts`.
- **A high-resolution ground cannot have its material swapped** — the one-way
  door in §7. Pinned by `large-ground.test.ts`, but it needs a PRODUCT DECISION,
  not more tests.
- The full ~260-case triage table (automate / unit-covered / manual-only /
  spec-conflict), and the remaining testid hooks (dialogs, portalled `Select`
  listbox, `TextureSelector`, radiation spectral toggle).

### Not automatable — keep manual
Animation smoothness, alignment/readability, 10,000-geometry performance,
memory after 100 toggles, ghost-mesh / world-grid rendering, camera and zoom
interactions, offline mode, undo/redo (no implementation exists).
