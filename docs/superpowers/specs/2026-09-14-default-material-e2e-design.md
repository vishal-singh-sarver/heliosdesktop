# Default material and e2e repair — design

Date: 2026-09-14 · Branch: `feature/automation_M2` at `e070eb6` · Status: agreed in chat, awaiting spec review · Not committed

## Goal

1. Make the 113 failing tests from the 14 Sep run pass again, by updating them to what the app ships today.
2. Add e2e coverage for the default material on new grounds, renaming by double-click, and required-field asterisks.

## Constraints (from `CLAUDE.md`)

- No backend code changes. Frontend changes only as `data-testid`, derived from props components already receive.
- Tests assert shipped behaviour. Where a requirement disagrees with the code, the test follows the code and the conflict is marked `DEVIATION`.
- The 3D viewport is asserted by proxy: the mesh the viewport downloads.

## Shipped behaviour this design relies on (verified in source)

| Topic | Behaviour | Where |
|---|---|---|
| Default material | Every new **ground** is created with one material named `Mtl.<ground name>`: a single Visualiser member in texture mode on `dirt.jpg`, created in the same transaction as the ground. | `material_library_service.create_default_ground_group` |
| Name clashes | Material names are unique across the whole library (case-insensitive). If `Mtl.Ground.001` is taken, the next is `Mtl.Ground.001.1`, then `.2`, and so on. Names are at most 20 characters. | `material_library_service._auto_group_name` |
| Ground rename | Renaming a ground does not rename its default material. | `scene_object_service.rename_object` |
| Ground delete | Deleting a ground does not delete its default material; it stays in the library. Confirmed as intended. | `scene_object_service.delete_object` |
| Form state | The create response carries the default material and the form counts it as already saved (`materialBaseline`). Picking another material therefore turns Save into a **Replace** confirmation. | `Geometry/reducer.ts`, `ObjectPropertiesForm.tsx` |
| Unassign | Removing a saved material opens the Unassign confirmation; the row goes once the backend DELETE returns. No separate Save. | `ObjectProperties.page.ts › removeAssigned`, `material-assignment.test.ts` |
| No material | A ground with no material is built as a plain tile, and the engine's default tile colour is green `(0, 0.75, 0)`. | `scene_object_service._winner_surface`, `Context_object.cpp` |
| 3D mesh | The viewport downloads `…/objects/{id}/geometry/gpu` (wire format v2). Untextured parts carry per-vertex colours; textured parts carry a texture path and UVs. `…/geometry/binary` is no longer requested. | `3DWindow/store/saga.ts`, `pyhelios_wrapper_context.cpp` |
| Rename | The pencil is gone (`10a5a51`). Names in both Properties forms unlock on double-click. Hover hints while locked: "Double-click to rename the geometry." and "Double-click to rename the material." (also on tree rows and library rows). | `ObjectPropertiesForm.tsx`, `MaterialPropertiesForm.tsx`, `messages.ts` |
| Statistics | The viewport statistics toggle and overlay are hidden (`SHOW_STATS_UI = false`). | `Viewport3D.tsx` (`d9b9d39`) |
| Asterisks | `FormField` shows a red `*` unless the field is `optional`; `ColorPicker` shows one when `required`. The ground form hides every field label (screen-reader only) and its headings carry no star, so nothing is visible there, although `*` still exists inside the hidden labels. | `FormField`, `ColorPicker`, `ObjectPropertiesForm.tsx` (`dffdbd0`) |

## Decisions (14 Sep)

1. Existing material tests use **option A**: remove the default material from the ground first, so they keep testing "assign onto an empty ground". Replacing the default gets its own tests.
2. Item 5 means: remove the default, the ground stays and turns green, and it can still be deleted.
3. Item 6 means: switch the default material's Visualiser to solid red, then check the right-panel popup and the red mesh.
4. A deleted ground leaving its `Mtl.` material in the library is intended.

## Part A — repair the failing tests

| Cause | Tests | Change |
|---|---:|---|
| Default material | 65 | Each material spec's ground helper removes the default right after creating the ground: it checks the ground wears exactly its `Mtl.` default, unassigns it, waits for the row to go, and records the material for cleanup. **Exception:** `large-ground.test.ts` › "a SOIL ground REFUSES 1000 × 1000" keeps the default, because its `dirt.jpg` texture is what caps the resolution. Its wording is updated to say so. |
| Mesh URL | 22 | The recorder and `waitForMeshFetch` in `e2e/support/viewport3d.ts` match `/geometry/gpu`, and still accept `/geometry/binary`. |
| Pencil removed | 14 | Replace the pencil click with a double-click on the name field. Assert the hover hint while the name is locked, that it disappears while editing, and that no "Edit name" button exists. |
| Statistics hidden | 2 | Assert the toggle and overlay are absent, marked `DEVIATION`: turning the flag back on should bring back the original assertions. |
| Already failing | 9 | Investigate each (`weather.test.ts` 8, `materials.test.ts` 1). Fix test-side causes. If the app is at fault, stop and report before changing the test. |
| Likely flaky | 1 | Run `viewport-lighting.test.ts` alone three times; harden only if it fails again. |

Cleanup: every spec that creates grounds also deletes the default materials those grounds created, so the existing library-leak checks keep working.

## Part B — new spec `e2e/tests/default-material.test.ts`

Its own spec file, so its writes to the shared library stay in their own session. It deletes every ground and material it creates. Expected default names are always computed from the library as it is just before the ground is created, never hard-coded.

| Item | Test | Checks |
|---|---|---|
| 1, 4 | `+ Ground` adds the ground with its default | the row appears; the right panel lists exactly one material, `Mtl.<ground name>`; that material also appears in the Materials library |
| 2 | What the default is | the popup shows a Visualiser in texture mode on `dirt.jpg`; the mesh has a textured part using `dirt.jpg` |
| 3 | Name format | first ground: `Mtl.<its name>`; second ground: `Mtl.<its name>`; delete a ground and create it again, and the new default takes the `.1` suffix while the old one stays in the library |
| 5 | Remove the default | Unassign confirmation, the section empties, the mesh is fetched again with green vertices, the default stays in the library, and the ground can then be deleted |
| 5 | Different materials on different grounds | ground 1 gets a red material, ground 2 a blue one; each lists only its own; mesh colours are red and blue |
| 6 | Change the default | switch its Visualiser to solid red (R 255, G 0, B 0); without reselecting, the ground's popup shows the new values, the mesh is fetched again with red vertices, and the material is still assigned |
| 7 | Across projects | project A's default appears in project B's library and picker; B's first ground's default takes the next free suffix |
| 9 | Replace the default | pick another material and Save: the Replace dialog names the ground; Cancel keeps the default; Replace leaves exactly the new material; the default stays in the library |
| 10 | Rename by double-click, everywhere | rename the default from its library row, and again from the material form. The new name shows in the library row, the form header, the ground's Materials section, the picker and the popup title, and still after reselecting the ground. Renaming the ground by double-clicking its form name updates the tree row and leaves the material's name as it was |

## Part C — new spec `e2e/tests/required-markers.test.ts`

A `*` counts as visible when it sits outside a screen-reader-only label and has a non-zero rendered size. No `src/` change.

| Surface | Visible `*` expected |
|---|---|
| Ground Properties form | none, on headings or fields |
| New Project dialog | Project Name, Latitude, Longitude |
| Rename Project dialog | its name field |
| Add Rows dialog | on every field shown |
| Add Column dialog | exactly one, on the field not marked optional (Data type and Unit are optional) |
| Material type card | on exactly the properties the catalog marks required |
| Visualiser colour picker | shown if and only if a colour channel is required |

## Test oracles

- **Mesh summary.** The fetch recorder reads each `/geometry/gpu` response in the page and stores a summary per part: texture path, whether it has colours, and the average vertex colour. Only the summary is kept, so large grounds stay cheap.
  - Green: G ≥ 0.6 and R, B ≤ 0.1 (engine default is `0, 0.75, 0`).
  - Red: R ≥ 0.9 and G, B ≤ 0.1.
  - Blue: B ≥ 0.9 and R, G ≤ 0.1.
- **Default name.** Apply the backend's rule to the library names read just before the ground is created: `Mtl.<name>` if free, otherwise the first free `.N`.

## Order of work

1. Part A shared fixes: mesh URL, remove-the-default step, double-click rename. Together these cover 101 of the 113.
2. Part A remainder: statistics, the 9 already failing, the flaky one.
3. Part B, then Part C.
4. Update `CLAUDE.md`: coverage tables, trap 9 (an unstyled ground is now plain and green; `dirt.jpg` comes from the default material), the Linux orphan note in §2.0, and §8.

## Done when

- Every spec touched here passes when run on its own.
- A full `npm run e2e` has no failures, apart from any app bug reported under "Already failing".
- `npm run e2e:typecheck` passes.
- No backend code changed; any `src/` change is `data-testid` only.

## Out of scope

- The persistence suite (`wdio.persist.config.ts`).
- Truncating long default names: unreachable from the UI, because `+ Ground` always names grounds `Ground.NNN`.
