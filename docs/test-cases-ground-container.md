# Formal Test Cases — Ground container (Geometry / M2)

Scope: the **Ground** object end-to-end — the left-panel tree row and the
right-panel Properties form that owns it. Derived from the shipped code, not
from the manual spec; where the two disagree the case follows the code and the
conflict is listed in §16.

Verified against backend `91b4099` and the live catalog
(`GET /api/catalog/object-types`).

Source files behind these cases:

| Area | File |
|---|---|
| Form, save gating, guards, tooltips | `src/renderer/src/containers/Geometry/ObjectPropertiesForm.tsx` |
| Field validation + bounds resolution | `src/renderer/src/containers/Geometry/propertyBlueprint.ts` |
| Name rules | `src/renderer/src/containers/Geometry/validation.ts` |
| Auto-naming | `src/renderer/src/containers/Geometry/naming.ts` |
| Texture divisor rule | `src/renderer/src/containers/Geometry/textureRepeat.ts` |
| Tree row, inline rename | `src/renderer/src/containers/Geometry/TreeRow.tsx`, `NameEditor.tsx` |
| Material picker | `src/renderer/src/containers/Geometry/SelectMaterialsPopup.tsx` |
| Panel collapse behaviour | `src/renderer/src/containers/RightPanel/index.tsx` |
| Keystroke guards | `src/renderer/src/utils/decimalValidation.ts` |
| Backend validation | `helios-desktop-backend/app/services/eav_validation.py` |

---

## 1. Reference data

### 1.1 Ground field bounds (live catalog, inclusive)

| Property | Form label | Datatype | Min | Max | Required |
|---|---|---|---|---|---|
| `length` | Ground Size → Length | float | 0.01 | 1 000 000 | yes |
| `breadth` | Ground Size → Breadth | float | 0.01 | 1 000 000 | yes |
| `resolution_x` | Ground Resolution → Width | integer | 1 | 25 000 | yes |
| `resolution_y` | Ground Resolution → Height | integer | 1 | 25 000 | yes |
| `position_x` | Position → X | float | −1 000 000 | 1 000 000 | yes |
| `position_y` | Position → Y | float | −1 000 000 | 1 000 000 | yes |
| `position_z` | Position → Z | float | −1 000 000 | 1 000 000 | yes |
| `rotation_z` | Rotation → Degree | float | 0 | 360 | yes |
| `texture_x` | Number of Textures → R | integer | 1 | *(none)* | yes |
| `texture_y` | Number of Textures → C | integer | 1 | *(none)* | yes |
| name | — | — | 1 char | 20 chars | yes |

Create-time defaults: size `10`/`10`, resolution `1`/`1`, position `0`/`0`/`0`,
rotation `0`, textures `1`/`1`.

### 1.2 Exact validation copy

| Key | String |
|---|---|
| Range (two-sided) | `Values should be between (<min> - <max>)` |
| Range (min only) | `Values should be greater than or equal to <min>` |
| Range (max only) | `Values should be less than or equal to <max>` |
| Empty required | `Required Field` |
| Generic invalid | `Invalid Input` |
| Non-numeric keystroke | `This input is not supported` |
| 8th decimal keystroke | `Only 7 Decimal places are supported` |
| Texture over resolution | `Texture repeat can't exceed the ground resolution (<res>)` |
| Repeat snapped down | `Snapped to <n> (must divide Resolution of <res>)` |
| Repeat snapped to floor | `Snapped to 1 (minimum is 1)` |
| Repeat re-adjusted | `Repeat adjusted <from> → <to> (must divide Resolution of <res>)` |
| Name empty | `Name is required` |
| Name too long | `Character limit exceeded` |
| Name duplicate | `Geometry name already exists` |
| Object deleted notice | `This geometry was deleted. Close the panel.` |

Toasts (from `store/toastMessages.ts`, **not** `Geometry/messages.ts`):

| Event | String |
|---|---|
| Created | `"<name>" has been successfully created.` |
| Create failed | `Ground could not be created.` |
| Deleted | `"<name>" has been successfully deleted.` |
| Saved | `Changes have been successfully saved` |

### 1.3 Standing preconditions (assumed by every case)

- P1 — A project and scenario are open; the left panel's **Geometry** section is expanded.
- P2 — The backend is on `91b4099` and `libhelios.dll` is current (`+ Ground` inserts a row).
- P3 — The right panel is reachable (it force-expands whenever a draft opens).
- P4 — Priority: **P1** = blocks release, **P2** = core, **P3** = edge/cosmetic.

---

## 2. Ground creation

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-CRT-01 | On an empty tree, confirm the empty state, then press `+ Ground` | Empty hint `No saved geometries yet.` is replaced by one row named `Ground.001` | P1 |
| GRD-CRT-02 | Press `+ Ground` | A `POST .../objects` succeeds; the row appears **and** the right panel opens the Properties form for it | P1 |
| GRD-CRT-03 | Read the form of a just-created ground | Length 10, Breadth 10, Width 1, Height 1, X/Y/Z 0, Degree 0, R 1, C 1 | P1 |
| GRD-CRT-04 | Press `+ Ground` and read the snackbar | `"Ground.001" has been successfully created.` (auto-dismisses ~2.5 s) | P2 |
| GRD-CRT-05 | Create the first ground | The name is zero-padded to three digits — `Ground.001`, never `Ground.1` | P2 |
| GRD-CRT-06 | Press `+ Ground` three times | Rows are `Ground.001`, `Ground.002`, `Ground.003` in creation order | P1 |
| GRD-CRT-07 | With 001/002/003 present, delete `Ground.002`, then press `+ Ground` | The new row is `Ground.002` — numbering **fills the lowest gap**, it does not continue from the max | P2 |
| GRD-CRT-08 | With `Ground.001` open in the form, press `+ Ground` again | The form **swaps** to `Ground.002`; edits now target the new ground, not the old one | P1 |
| GRD-CRT-09 | Create a ground and watch the network | A `fetch` of `.../objects/{id}/geometry/binary` returns 200 with a non-empty body (default ground ≈ 269 bytes) | P1 |
| GRD-CRT-10 | Inject a failure on `POST .../objects`, press `+ Ground` | Toast `Ground could not be created.`; no row is added | P2 |
| GRD-CRT-11 | Create three grounds, close and reopen the project | All three rows are present with their own saved values | P1 |
| GRD-CRT-12 | Create a ground in project A, open project B | B's tree is empty — grounds do not leak across projects | P2 |
| GRD-CRT-13 | Press `+ Ground` twice rapidly | Exactly two rows are created with distinct names; no duplicate name and no crash | P3 |

---

## 3. Multiple grounds — independence

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-MUL-01 | Create two grounds; edit Length on `Ground.001` and save | `Ground.002` keeps its own Length of 10 | P1 |
| GRD-MUL-02 | Customise both grounds differently, save both, reopen the project | Each ground reloads its **own** values | P1 |
| GRD-MUL-03 | Select `Ground.001`, then `Ground.002`, then `Ground.001` again | The form shows the values of whichever row is selected, every time | P1 |
| GRD-MUL-04 | Delete `Ground.001` while `Ground.002` is open | `Ground.002` and its open form are untouched | P2 |
| GRD-MUL-05 | Delete the ground currently open in the form | The form closes only on delete **success**; while the DELETE is in flight the trash is disabled | P2 |
| GRD-MUL-06 | Delete a ground from the tree while its form is open in the right panel | The form shows `This geometry was deleted. Close the panel.` and every control is disabled | P2 |

---

## 4. Viewport visibility — the eye toggle

> `aria-pressed` on the eye is **inverted**: `true` means *hidden*. The label
> flips between `Hide from viewport` and `Show in viewport`.

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-VIS-01 | Hover a row and click the eye | The icon flips to the hidden state (`aria-pressed="true"`, label `Show in viewport`) | P1 |
| GRD-VIS-02 | Click the eye again | It returns to visible (`aria-pressed="false"`, label `Hide from viewport`) | P1 |
| GRD-VIS-03 | Hide `Ground.001` | `Ground.002`'s eye is unchanged — visibility is per row | P1 |
| GRD-VIS-04 | Hide a row, then select it | The hidden state survives selection | P2 |
| GRD-VIS-05 | Hide a row, then rename it | The hidden state survives the rename | P2 |
| GRD-VIS-06 | Hide a row, then search for its name | The hidden row is still returned by search | P3 |
| GRD-VIS-07 | Hide a row, save the project, reopen it | The row is still hidden — visibility is persisted via `PATCH .../objects/{id}` | P1 |
| GRD-VIS-08 | Inject a failure on the visibility `PATCH`, click the eye | The icon flips optimistically and then **reverts** to its previous state | P2 |
| GRD-VIS-09 | Toggle the eye, then the render icon on the same row | The two are independent — the render master switch does not move the eye | P2 |
| GRD-VIS-10 | Click the eye on a row inside a group | Only that member's visibility changes | P3 |
| GRD-VIS-11 | Hide a row and confirm it in the 3D window (manual) | The tile disappears from the viewport | P2 (manual) |

---

## 5. Rename — left panel (inline tree editor)

> Client-side validation, live per keystroke. An invalid value **blocks the
> commit and keeps the editor open**; blurring out of an invalid value discards.

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-RNL-01 | Double-click the row name | An input appears, seeded with the current name and fully selected | P1 |
| GRD-RNL-02 | Type `Field A` and press Enter | The row reads `Field A`; a `PATCH .../objects/{id}` carries the new name | P1 |
| GRD-RNL-03 | Type a new name and press Escape | The editor closes and the **original** name is kept; no request is sent | P1 |
| GRD-RNL-04 | Enter exactly 20 characters and press Enter | Accepted and committed | P2 |
| GRD-RNL-05 | Enter 21 characters | `Character limit exceeded` shows under the row, the row border turns red, Enter does **not** commit and the editor stays open | P1 |
| GRD-RNL-06 | Clear the field entirely | `Name is required`; commit blocked, editor stays open | P1 |
| GRD-RNL-07 | With an error showing, click elsewhere (blur) | The editor closes and the original name is restored | P2 |
| GRD-RNL-08 | Open the editor and press Enter without changing anything | The editor closes; **no** rename request is sent | P2 |
| GRD-RNL-09 | Enter `  Field A  ` (padded) and commit | Stored as `Field A` — leading/trailing whitespace is trimmed | P2 |
| GRD-RNL-10 | Enter 20 characters that include internal spaces | Accepted — internal spaces count toward the 20-char limit but are not trimmed | P3 |
| GRD-RNL-11 | Rename a row, then read it in the tree without reopening the editor | The new name is shown, and search matches it | P2 |
| GRD-RNL-12 | Inject a failure on the rename `PATCH`, commit a valid new name | The row reverts to its old name (rename is pessimistic) and the error is shown on the row | P2 |

---

## 6. Rename — right panel (Properties form)

> The name is **read-only** until the pencil is tapped, and it commits on
> **blur** — not on Enter and not via Save.

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-RNR-01 | Open a saved ground and inspect the name field | It carries the ground's name and is `readonly` | P1 |
| GRD-RNR-02 | Click the pencil (`Edit name`) | The field becomes editable and receives focus | P1 |
| GRD-RNR-03 | Double-click the name field | It also becomes editable (second route to the same state) | P3 |
| GRD-RNR-04 | Edit the name and click outside the field | The rename is sent on blur; the **left-panel row updates** to the new name | P1 |
| GRD-RNR-05 | Edit the name and press Enter without blurring | No rename occurs until the field loses focus | P3 |
| GRD-RNR-06 | Clear the name field | Red border, an info icon appears inside the field, tooltip `Name is required`; no request is sent | P1 |
| GRD-RNR-07 | Enter 21 characters | Tooltip `Character limit exceeded`; no request is sent | P1 |
| GRD-RNR-08 | Enter exactly 20 characters and blur | Accepted; the tree row updates | P2 |
| GRD-RNR-09 | Change **only** the name, then look at Save | Save stays **disabled** — Save is field-only; the name has its own commit path | P1 |
| GRD-RNR-10 | Clear the name, then edit a numeric field | Save becomes **enabled** despite the empty name — an empty name does not gate Save | P2 |
| GRD-RNR-11 | Rename from the right panel, then reopen the ground | The new name is shown in both panels | P2 |
| GRD-RNR-12 | Delete the ground while the name field is being edited | The name field is disabled and the deleted notice appears | P3 |

---

## 7. Duplicate name — negative flow across both panels

> **The two panels fail at different moments, by design.**
> The tree editor checks duplicates **client-side** (`selectLeafNamesLower`
> minus the row's own name, case-insensitive) and blocks the commit.
> The Properties form passes an **empty** conflict set (`NO_NAME_CONFLICTS`),
> so it sends the rename and surfaces the backend's 409 instead.
> Both cases must be tested; they are not redundant.

**Precondition (all cases):** two saved grounds exist — `Ground.001` and `Field A`.

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-DUP-01 | Tree: double-click `Ground.001`, type `Field A` | `Geometry name already exists` appears **live, while typing**; the row border turns red | P1 |
| GRD-DUP-02 | Tree: with that error showing, press Enter | The commit is **blocked**, the editor stays open, and **no** network request is made | P1 |
| GRD-DUP-03 | Tree: type `field a` (different case) | Still rejected — the duplicate check is case-insensitive | P1 |
| GRD-DUP-04 | Tree: with the error showing, press Escape | The editor closes and `Ground.001` keeps its name | P2 |
| GRD-DUP-05 | Tree: open the editor on `Field A` and re-commit `Field A` unchanged | Accepted (no error) — a row's own name is excluded from the conflict set | P1 |
| GRD-DUP-06 | Tree: create a group named `Field A`, then rename a ground to `Field A` | Accepted — groups and geometries are **separate namespaces** | P2 |
| GRD-DUP-07 | Form: open `Ground.001`, pencil, type `Field A`, blur | The field accepts it and a `PATCH` **is sent** — there is no client-side duplicate check here | P1 |
| GRD-DUP-08 | Form: after GRD-DUP-07 completes | The backend answers `409 GEOMETRY_NAME_EXISTS`; the field shows a red border and the info-icon tooltip reads `Geometry name already exists` | P1 |
| GRD-DUP-09 | Form: after GRD-DUP-08, look at the left-panel row | The row still reads `Ground.001` — the rename is pessimistic and the tree never showed the rejected name | P1 |
| GRD-DUP-10 | Form: after GRD-DUP-08, type any different character | The duplicate error clears immediately as the user types | P2 |
| GRD-DUP-11 | Form: after GRD-DUP-08, type a unique name and blur | The rename succeeds and both panels show it | P1 |
| GRD-DUP-12 | Form: type `field a` (different case) and blur | Rejected by the backend with the same 409 — uniqueness is case-insensitive server-side too | P2 |
| GRD-DUP-13 | Form: after a rejected duplicate, collapse and re-expand the right panel | The duplicate error is still displayed (see §14) | P2 |
| GRD-DUP-14 | Compare GRD-DUP-01 and GRD-DUP-07 side by side | **Recorded — §16 row 7.** Not an executable case: it asks for a finding, and both halves are now pinned by tests (`geometry.test.ts` "a duplicate name is blocked CASE-INSENSITIVELY" for the tree, `ground.test.ts` "the form has NO client-side duplicate check" for the form), so a change in either direction surfaces | P3 |

---

## 8. Opening a saved ground — values round-trip

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-LOD-01 | Click a saved ground row | A `GET .../objects/{id}` fires and the right panel opens its Properties form | P1 |
| GRD-LOD-02 | Save a ground with 12.5 / 7.25 / 4×5 / 1,2,3 / 45° / 1×1, reselect it | Every one of the ten fields reads back the saved value | P1 |
| GRD-LOD-03 | Immediately after opening a saved ground, look at Save | Save is **disabled** — the freshly loaded values are the clean baseline | P1 |
| GRD-LOD-04 | Open `Ground.001`, then click `Ground.002` | The form swaps to `Ground.002`'s values with nothing carried over | P1 |
| GRD-LOD-05 | Open a ground that has a material assigned | The material is listed under the **Materials** row | P2 |
| GRD-LOD-06 | Open a ground, edit a field, then select another ground **without** saving | The unsaved edit is discarded; returning to the first ground shows its stored values | P2 |
| GRD-LOD-07 | Open a ground, save an edit, close and reopen the project, reselect it | The saved values are shown | P1 |
| GRD-LOD-08 | Inject a failure on `GET .../objects/{id}`, click the row | The failure is reported and the panel does not show stale values from the previous ground | P2 |
| GRD-LOD-09 | Open a ground whose name is longer than the field | The name is ellipsised and the full text appears on hover | P3 |
| GRD-LOD-10 | Open a ground saved with `0.0000001` in a float field | It renders as `0.0000001`, not `1e-7`, and Save stays disabled (no phantom edit) | P2 |

---

## 9. Field validation — range and required

Each row is one test case. Enter the value in the named field, then blur.
Save must be **disabled** for every rejected row and **enabled** for every
accepted row (assuming the value differs from the baseline).

### 9.1 Below the minimum → range message

| ID | Field | Input | Expected message |
|---|---|---|---|
| GRD-FLD-01 | Length | `0.009` | `Values should be between (0.01 - 1000000)` |
| GRD-FLD-02 | Breadth | `0.009` | `Values should be between (0.01 - 1000000)` |
| GRD-FLD-03 | Width (`resolution_x`) | `0` | `Values should be between (1 - 25000)` |
| GRD-FLD-04 | Height (`resolution_y`) | `0` | `Values should be between (1 - 25000)` |
| GRD-FLD-05 | Position X | `-1000001` | `Values should be between (-1000000 - 1000000)` |
| GRD-FLD-06 | Position Y | `-1000001` | `Values should be between (-1000000 - 1000000)` |
| GRD-FLD-07 | Position Z | `-1000001` | `Values should be between (-1000000 - 1000000)` |
| GRD-FLD-08 | Degree (`rotation_z`) | `-1` | `Values should be between (0 - 360)` |
| GRD-FLD-09 | Length | `-5` | `Values should be between (0.01 - 1000000)` |
| GRD-FLD-10 | Width | `-3` | `Values should be between (1 - 25000)` |

### 9.2 Above the maximum → range message

| ID | Field | Input | Expected message |
|---|---|---|---|
| GRD-FLD-11 | Length | `1000001` | `Values should be between (0.01 - 1000000)` |
| GRD-FLD-12 | Breadth | `1000001` | `Values should be between (0.01 - 1000000)` |
| GRD-FLD-13 | Width | `25001` | `Values should be between (1 - 25000)` |
| GRD-FLD-14 | Height | `25001` | `Values should be between (1 - 25000)` |
| GRD-FLD-15 | Position X | `1000001` | `Values should be between (-1000000 - 1000000)` |
| GRD-FLD-16 | Position Y | `1000001` | `Values should be between (-1000000 - 1000000)` |
| GRD-FLD-17 | Position Z | `1000001` | `Values should be between (-1000000 - 1000000)` |
| GRD-FLD-18 | Degree | `361` | `Values should be between (0 - 360)` |

### 9.3 Minimum boundary — inclusive, must be ACCEPTED

| ID | Field | Input | Expected |
|---|---|---|---|
| GRD-FLD-19 | Length | `0.01` | No error; Save enabled |
| GRD-FLD-20 | Breadth | `0.01` | No error; Save enabled |
| GRD-FLD-21 | Width | `1` | No error |
| GRD-FLD-22 | Height | `1` | No error |
| GRD-FLD-23 | Position X | `-1000000` | No error; Save enabled |
| GRD-FLD-24 | Position Y | `-1000000` | No error |
| GRD-FLD-25 | Position Z | `-1000000` | No error |
| GRD-FLD-26 | Degree | `0` | No error |
| GRD-FLD-27 | R (`texture_x`) | `1` | No error |
| GRD-FLD-28 | C (`texture_y`) | `1` | No error |

### 9.4 Maximum boundary — inclusive, must be ACCEPTED

> Validate only. **Do not press Save** on rows marked ⚠ — see §15.

| ID | Field | Input | Expected |
|---|---|---|---|
| GRD-FLD-29 | Length | `1000000` | No error; Save enabled ⚠ |
| GRD-FLD-30 | Breadth | `1000000` | No error; Save enabled ⚠ |
| GRD-FLD-31 | Width | `25000` | No error; Save enabled ⚠ (never saved) |
| GRD-FLD-32 | Height | `25000` | No error; Save enabled ⚠ (never saved) |
| GRD-FLD-33 | Position X | `1000000` | No error |
| GRD-FLD-34 | Position Y | `1000000` | No error |
| GRD-FLD-35 | Position Z | `1000000` | No error |
| GRD-FLD-36 | Degree | `360` | No error |

### 9.5 Empty → required

Clear the field completely (a native value write plus an `input` event; a bare
`setValue('')` does not reach React).

| ID | Field | Expected |
|---|---|---|
| GRD-FLD-37 | Length | `Required Field`; Save disabled |
| GRD-FLD-38 | Breadth | `Required Field`; Save disabled |
| GRD-FLD-39 | Width | `Required Field`; Save disabled |
| GRD-FLD-40 | Height | `Required Field`; Save disabled |
| GRD-FLD-41 | Position X | `Required Field`; Save disabled |
| GRD-FLD-42 | Position Y | `Required Field`; Save disabled |
| GRD-FLD-43 | Position Z | `Required Field`; Save disabled |
| GRD-FLD-44 | Degree | `Required Field`; Save disabled |
| GRD-FLD-45 | R | `Required Field`; Save disabled (no snapping on a blank field) |
| GRD-FLD-46 | C | `Required Field`; Save disabled |

### 9.6 Range-message shape

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-FLD-47 | Enter `0` in R with Width `10` | One-sided copy `Values should be greater than or equal to 1` shows **while typing** (texture has no max) | P2 |
| GRD-FLD-48 | Confirm the message text against the live catalog rather than a hardcoded table | The bounds in the message equal `GET /api/catalog/object-types` for that property | P2 |
| GRD-FLD-49 | Enter an out-of-range value in two fields at once | Each field shows its own message; Save is disabled once | P3 |
| GRD-FLD-50 | Fix one of the two invalid fields | Save stays disabled while the other is still invalid | P2 |
| GRD-FLD-51 | Fix both | Save becomes enabled | P1 |

---

## 10. Input type validation — keystroke guards

> These guards **reject the keystroke**, so the field keeps its previous value.
> They must be exercised character by character; a single native-setter write is
> not a keystroke and bypasses them.

| ID | Field | Input | Expected result | Pri |
|---|---|---|---|---|
| GRD-TYP-01 | Length | `abc` | `This input is not supported`; the field keeps its previous value | P1 |
| GRD-TYP-02 | Length | `12a` | Rejected at `a`; the field holds `12` | P1 |
| GRD-TYP-03 | Width | `5.5` | The `.` keystroke is refused with `This input is not supported`; integer fields take no decimal point | P1 |
| GRD-TYP-04 | Length | `+5` | The leading `+` is rejected (deliberate — `+5` would silently store as `5`) | P2 |
| GRD-TYP-05 | Length | `1,5` | Rejected — comma is not a decimal separator | P2 |
| GRD-TYP-06 | Length | `1 5` (space) | Rejected | P3 |
| GRD-TYP-07 | Length | `1*2`, `1/2` | Rejected | P3 |
| GRD-TYP-08 | Length | `1.12345678` (8 dp) | `Only 7 Decimal places are supported`; the 8th digit never lands | P1 |
| GRD-TYP-09 | Length | `1.1234567` (7 dp) | Accepted, no error | P1 |
| GRD-TYP-10 | Length | `-` alone | Allowed as a partial value, no error while typing | P2 |
| GRD-TYP-11 | Length | `1e3`, then blur | Accepted; the field expands to `1000` on blur | P2 |
| GRD-TYP-12 | Length | `1e`, no blur | **No** error while the exponent is still being typed | P2 |
| GRD-TYP-13 | Length | `1e`, then blur | **`Invalid Input`** — an incomplete exponent is admitted by the keystroke guard, is not expandable, so it survives the blur and fails `Number()`. This is the reachable route to `Invalid Input` on this form. Save is disabled | P1 |
| GRD-TYP-14 | Length | `1e-9`, typed character by character | The final `9` is **refused** with `Only 7 Decimal places are supported` — the expansion would carry 9 decimals — so the field is left holding `1e-`, never `1e-9` | P2 |
| GRD-TYP-15 | Degree | `-0` | Range message, not silent acceptance — a typed minus sign on a non-negative range is out of range | P2 |
| GRD-TYP-16 | Width | focus, then blur with no typing | The value is left byte-identical and Save stays disabled | P2 |
| GRD-TYP-17 | Width | Backspace through a value that already contains `.` | Editing is possible — the guard only refuses **adding** a `.`, not a value that already has one | P2 |
| GRD-TYP-18 | Any field | Type an invalid character, then blur | The transient guard message clears on blur and committed-value validation takes over | P2 |
| GRD-TYP-19 | Length | Enter `abc`, then `5.5` in Width, then `1e` — compare the three | `Invalid Input` is reachable **only** through a left-over incomplete exponent (GRD-TYP-13/20). Every other route — non-numerics, and a `.` added to an integer field — is intercepted by the keystroke guard first and reports `This input is not supported` instead | P2 |
| GRD-TYP-20 | Width (integer) | `1e`, then blur | `Invalid Input` — the same route works on an integer field; the guard only refuses the `.` character, not `e` | P2 |
| GRD-TYP-21 | Length | Leave `1e` in the field and inspect Save | Save is **disabled** while the incomplete exponent stands, and re-enables once it is completed or cleared | P1 |

---

## 11. Backend validation — API layer

The UI guards block most malformed input, so these are executed against the API
directly (`POST` / `PATCH .../objects`). They protect the contract the form
depends on.

| ID | Request | Expected response | Pri |
|---|---|---|---|
| GRD-API-01 | `resolution_x: 5.5` | `400` `DATATYPE_MISMATCH` — `resolution_x must be an integer` | P1 |
| GRD-API-02 | `length: "10"` (string) | `400` `DATATYPE_MISMATCH` — `length must be a number` | P1 |
| GRD-API-03 | `length: true` (boolean) | `400` `DATATYPE_MISMATCH` — booleans are not numbers | P2 |
| GRD-API-04 | `length: 0.009` | `400` `VALUE_OUT_OF_RANGE` — `Values should be between (0.01 - 1000000)` | P1 |
| GRD-API-05 | `rotation_z: 361` | `400` `VALUE_OUT_OF_RANGE` — `Values should be between (0 - 360)` | P1 |
| GRD-API-06 | `length: 1.12345678` | `400` `TOO_MANY_DECIMALS` — `Only 7 Decimal places are supported` | P2 |
| GRD-API-07 | Create omitting `position_z` | `400` `MISSING_REQUIRED_PROPERTY` — `position_z is required` | P1 |
| GRD-API-08 | Create with `properties: { "bogus": 1 }` | `400` `UNKNOWN_PROPERTY` | P2 |
| GRD-API-09 | `texture_x: 5`, `resolution_x: 4` | `400` `VALUE_OUT_OF_RANGE` — `Values should be between (1 - 4)` | P1 |
| GRD-API-10 | `texture_x: 3`, `resolution_x: 10` | **`200` — accepted.** The backend enforces `texture ≤ resolution` only; the *divisor* rule is client-side. Documented divergence, see §16 | P1 |
| GRD-API-11 | `PATCH` a name that already exists | `409` `GEOMETRY_NAME_EXISTS` — `Geometry name already exists` | P1 |
| GRD-API-12 | `PATCH` a 21-character name | `400` `NAME_TOO_LONG` — `Character limit exceeded` | P2 |
| GRD-API-13 | `PATCH` an empty / whitespace-only name | `400` `NAME_REQUIRED` — `Name is required` | P2 |
| GRD-API-14 | `PATCH` a name containing a control character (e.g. `\x00abc`) | `400` `NAME_INVALID` — `Name contains invalid characters` | P3 |
| GRD-API-15 | `PATCH` a partial update touching one property | Untouched properties keep their stored values; cross-field rules run against the merged set | P2 |
| GRD-API-16 | `length: 1e400` / non-finite | `400` `INVALID_NUMBER` — `This input is not supported` | P3 |
| GRD-API-17 | `properties` sent as an array | `400` `DATATYPE_MISMATCH` — `properties must be an object` | P3 |

---

## 12. Texture repeat — the "must divide" rule

> Valid values for an axis are the **divisors of that axis's resolution**
> (10 → 1, 2, 5, 10). The rule is per axis: `texture_x` against `resolution_x`,
> `texture_y` against `resolution_y`. Snapping happens on **commit** (blur /
> Enter / Save), never per keystroke.

| ID | Setup | Action | Expected result | Pri |
|---|---|---|---|---|
| GRD-TEX-01 | Width `10` | Enter `5` in R and blur | Accepted, no note — 5 divides 10 | P1 |
| GRD-TEX-02 | Width `10` | Enter `7` in R and blur | R becomes `5`; note `Snapped to 5 (must divide Resolution of 10)` | P1 |
| GRD-TEX-03 | Width `10` | Enter `3` in R and blur | R becomes `2`; note names 10 as the resolution | P1 |
| GRD-TEX-04 | Width `10` | Enter `0` in R and blur | R becomes `1`; note `Snapped to 1 (minimum is 1)` — the one case that snaps **up** | P1 |
| GRD-TEX-05 | Width `10` | Enter `-4` in R and blur | R becomes `1` with the minimum note | P2 |
| GRD-TEX-06 | Width `10` | Enter `50` in R and blur | R becomes `10` — the resolution is its own largest divisor, so this doubles as the upper clamp | P1 |
| GRD-TEX-07 | Width `10` | Enter `05` in R and blur | Normalised to `5`, no note | P3 |
| GRD-TEX-08 | Width `10`, R `5` | Change Width to `8` and blur | R is adjusted to `4`; note `Repeat adjusted 5 → 4 (must divide Resolution of 8)` | P1 |
| GRD-TEX-09 | Width `7` (prime) | Open the R stepper range | Only `1` and `7` are reachable | P2 |
| GRD-TEX-10 | Width `10`, R `1` | Press ▲ repeatedly | R walks `1 → 2 → 5 → 10` and then ▲ is disabled | P1 |
| GRD-TEX-11 | Width `10`, R `10` | Press ▼ repeatedly | R walks `10 → 5 → 2 → 1` and then ▼ is disabled | P1 |
| GRD-TEX-12 | Width `10`, R `7` (mid-edit) | Press ▲ | Lands on `10` — the stepper works from an invalid value too | P2 |
| GRD-TEX-13 | Width `10`, R focused | Press ArrowUp / ArrowDown | Same movement as the ▲/▼ chevrons | P2 |
| GRD-TEX-14 | Width cleared | Look at the R steppers | Both are disabled and no snapping occurs — the constraint cannot be evaluated | P2 |
| GRD-TEX-15 | Width `10`, R snapped with a note showing | Type one character in R | The note clears on the first keystroke | P2 |
| GRD-TEX-16 | Width `4`, Height `9` | Set R `4`, C `9` | Both accepted — the axes are independent | P1 |
| GRD-TEX-17 | Width `4`, Height `9` | Set R `9` | R snaps to `4`; C is untouched | P2 |
| GRD-TEX-18 | Width `4` | Type `9` in R **without blurring** | `Texture repeat can't exceed the ground resolution (4)` is shown and **Save is disabled** | P1 |
| GRD-TEX-19 | Continue from GRD-TEX-18 | Blur R | The value snaps to `4`, the dependency error clears and Save becomes available | P1 |
| GRD-TEX-20 | A ground stored (via API) with Width `10`, R `7` | Open it in the form | R opens already corrected to `5` with `Repeat adjusted 7 → 5 …`, and the form reads as **dirty** even though nothing was typed | P2 |
| GRD-TEX-21 | Width `10`, R `7` typed, focus still in R | Click Save directly | `performSave` commits the pending snap first, so the PATCH carries `5`, never `7` | P1 |
| GRD-TEX-22 | Any ground | Read the section heading | It is `Number of Textures` with labels `R` / `C` — **not** "Number of Tiles" / rows / columns | P3 |
| GRD-TEX-23 | Width `1` | Enter any R | Only `1` is valid; anything larger snaps to `1` | P2 |
| GRD-TEX-24 | Width `100`, R `25` | Blur | Accepted — 25 divides 100 | P2 |

---

## 13. Error tooltips

> Field errors surface as an **info icon inside the input**, not as an inline
> line of text. The icon's accessible name is `Validation error: <message>`.

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-TIP-01 | Enter an out-of-range value in Length | An info icon appears at the right edge of the input; there is no inline error paragraph | P1 |
| GRD-TIP-02 | Hover the info icon | A tooltip shows the exact validation message | P1 |
| GRD-TIP-03 | Read the icon's accessible name | `Validation error: Values should be between (0.01 - 1000000)` | P1 |
| GRD-TIP-04 | Inspect the invalid input | It carries the error outline in `#D92D20`, and focusing it does **not** flip the ring to blue | P2 |
| GRD-TIP-05 | Correct the value | The icon and the outline disappear | P1 |
| GRD-TIP-06 | Tab to the info icon | It is focusable (`tabIndex=0`) and the tooltip opens on focus | P2 |
| GRD-TIP-07 | Trigger an error on the **name** field | The same icon/tooltip pattern appears at the right of the name input | P1 |
| GRD-TIP-08 | Trigger an error on a field in the panel's left column | The tooltip stays **inside** the right panel and does not lie across the field it describes | P2 |
| GRD-TIP-09 | Open a freshly created ground and touch nothing | No `Required Field` errors are shown — the error appears only after a field is touched | P1 |
| GRD-TIP-10 | Type a single `-` into an empty Position X | The error appears on the **first keystroke** (a field with any value reports immediately) | P2 |
| GRD-TIP-11 | Trigger errors on three fields at once | Each field carries its own icon and its own message | P2 |
| GRD-TIP-12 | Trigger a guard error and a range error on the same field | The live keystroke-guard message wins while typing; committed-value validation takes over after blur | P2 |
| GRD-TIP-13 | Trigger the texture dependency error | It appears through the same tooltip mechanism on the R/C field | P2 |
| GRD-TIP-14 | Read the group heading of a required group | The `*` marker sits on the **heading** (e.g. `Position*`), not on each of X/Y/Z | P3 |
| GRD-TIP-15 | Delete the object, then look at a previously invalid name | The name tooltip is suppressed while the deleted notice is showing | P3 |

---

## 14. Save gating and error persistence

### 14.1 Save is enabled only by a real change

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-SAV-01 | Open a saved ground | Save is **disabled** | P1 |
| GRD-SAV-02 | Change Length from `10` to `12` | Save becomes **enabled** | P1 |
| GRD-SAV-03 | Change it back to `10` | Save is **disabled** again | P1 |
| GRD-SAV-04 | Focus a field and blur it without typing | Save stays disabled — a focus/blur is not an edit | P1 |
| GRD-SAV-05 | Enter an invalid value | Save is disabled while the error stands | P1 |
| GRD-SAV-06 | Fix the invalid value to something new | Save is enabled | P1 |
| GRD-SAV-07 | Leave a texture dependency error standing | Save is disabled even though every individual field is in range | P1 |
| GRD-SAV-08 | Change **only** the name | Save stays disabled | P1 |
| GRD-SAV-09 | Pick a material and change nothing else | Save becomes enabled | P1 |
| GRD-SAV-10 | Press Save on a valid dirty form | Label shows `Saving…`, the button is inert, a `PATCH` is sent | P1 |
| GRD-SAV-11 | After a successful save | Toast `Changes have been successfully saved`; Save is disabled again (new baseline) | P1 |
| GRD-SAV-12 | After a successful save | The 3D mesh is re-fetched for the object | P2 |
| GRD-SAV-13 | Reselect the ground after saving | The saved values are shown and Save is disabled | P1 |
| GRD-SAV-14 | Inject a failure on the `PATCH`, press Save | The failure is reported, the form keeps the user's values and Save is available again | P2 |
| GRD-SAV-15 | Open a ground whose stored repeat needed an open-time correction | Save is **enabled** on open with nothing typed — the stored value is not the one the engine would use | P2 |
| GRD-SAV-16 | While a save is in flight, look at the tree row | The row shows a busy indicator | P3 |

### 14.2 Errors survive collapsing and reopening the right panel

> The panel's collapse chevron hides the form with `display:none`; it does
> **not** unmount it. That is deliberate — unmounting used to discard the
> form's record of which fields had been touched, so a cleared field came back
> with no error and a disabled Save that nothing explained.
> Assert `isDisplayed()`, never `isExisting()`.

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-PST-01 | Clear Length → `Required Field`; collapse the right panel; expand it | The error is **still shown** on Length | P1 |
| GRD-PST-02 | Continue from GRD-PST-01 | Save is **still disabled** after the round trip | P1 |
| GRD-PST-03 | Continue from GRD-PST-01 | The field is still empty — the value survives in the store | P1 |
| GRD-PST-04 | Enter an out-of-range Degree, collapse, expand | The range message and the red outline are unchanged | P1 |
| GRD-PST-05 | Leave a texture dependency error standing, collapse, expand | `Texture repeat can't exceed the ground resolution (N)` is still shown and Save is still disabled | P1 |
| GRD-PST-06 | Trigger a rejected duplicate name, collapse, expand | `Geometry name already exists` is still shown | P1 |
| GRD-PST-07 | Snap a repeat so a note is showing, collapse, expand | The note is still under the field | P2 |
| GRD-PST-08 | Make an unsaved valid edit, collapse, expand | The edit is intact and Save is still enabled | P1 |
| GRD-PST-09 | While collapsed, inspect the form in the DOM | It is present but not displayed, and it is out of the tab order and the accessibility tree | P2 |
| GRD-PST-10 | Open the material picker, then collapse the panel | The portalled popup **closes** rather than floating beside the collapsed strip | P2 |
| GRD-PST-11 | With an error standing, select a **different** ground, then come back | The error is gone — a different object is a fresh draft, not a preserved one | P2 |
| GRD-PST-12 | With an error standing, collapse the panel and create a new ground | The panel force-expands onto the new ground's form; the old draft's error does not follow it | P2 |

---

## 15. Resolution ceiling

> **Test envelope: resolution is exercised up to `1000 × 1000` and no further.**
> Values above that are validated only, never saved.

| ID | Action | Expected result | Pri |
|---|---|---|---|
| GRD-CAP-01 | Set Width `1000`, Height `1000`, press Save | Accepted and persisted. **Manual only** — the mesh is ≈228 MB and the fetch has no timeout | P2 (manual) |
| GRD-CAP-02 | Set Width `1000`, Height `1000` in automation | Assert validation state and the enabled Save button; **do not press Save** | P1 |

| GRD-CAP-04 | Automated runs | Nothing above `resolution_x * resolution_y = 100` is ever saved (`GEOMETRY_LIMITS.MAX_SAVEABLE_RESOLUTION_CELLS`) | P1 |
| GRD-CAP-05 | Save a large but in-envelope ground | The request is allowed to run to completion — there is no client timeout, by design | P3 |
| GRD-CAP-06 | Set Width `1000` with R `7` | R snaps to `5` (divisors of 1000 are 1,2,4,5,8,10,20,25,…) — the divisor rule still applies at the ceiling | P3 |

---

## 16. Deviations and known limitations

Recorded so a test failure here is read correctly. Tests assert the **shipped**
behaviour; these rows say where the manual spec disagrees.

| # | Spec / expectation | Shipped behaviour | Covered by |
|---|---|---|---|
| 1 | Ground size and texture counts must be **strictly** greater than 1 | Bounds are **inclusive**: size ≥ 0.01, texture ≥ 1 | GRD-FLD-19…28 |
| 2 | Section is "Number of Tiles" with rows / columns | `Number of Textures`, labels `R` / `C`, and the value must **divide** the resolution | GRD-TEX-22 |
| 3 | Toolbar reads "Add Ground" | The label is `Ground`; the `+` is an icon | — |
| 4 | Delete dialog names the geometry and its data | Generic body `Are you sure you want to delete this? This action cannot be undone.` | (covered in the delete suite) |
| 5 | Delete dialog buttons are "Yes" / "Cancel" | `Cancel` then `Delete`; the dialog focuses the **last** button, so Enter deletes outright | (covered in the delete suite) |
| 6 | One delete heading | Two: the tree row builds `Delete "Ground.001"?`, the form uses `Delete Ground.001` | (covered in the delete suite) |
| 7 | Duplicate names are rejected the same way everywhere | The tree rejects **locally before sending**; the form sends and surfaces the backend 409 | GRD-DUP-01 vs GRD-DUP-07 |
| 8 | An empty name blocks Save | It blocks only the **rename commit** | GRD-RNR-10 |
| 9 | The texture rule is enforced server-side | The backend enforces `texture ≤ resolution` only; the **divisor** rule is client-side, applied by snapping | GRD-API-10 |
| 10 | `Invalid Input` is the generic message for any bad value | It has exactly **one** reachable route on this form — a left-over incomplete exponent (`1e`). The keystroke guard intercepts every other path and reports `This input is not supported`. **Confirmed by a passing test**; the "suspected dead" notes in `CLAUDE.md`, `e2e/constants/geometry.ts` and `geometry.test.ts` have been corrected | GRD-TYP-13, GRD-TYP-20 |
| 11 | `topt_tpu` bound is 272 (Story 10) | The live catalog says 273–373 | — (materials) |
| 12 | Deleting a ground leaves the form showing `This geometry was deleted. Close the panel.` | **The form CLOSES.** `DELETE_NODE_SUCCEEDED` nulls `createDraft` when the removed object is on screen (`reducer.ts:465-470` — "close it rather than leave it in the read-only 'deleted' state the user then has to dismiss by hand"). `objectDeletedNotice` is therefore **unreachable from either trash**, which is why it has never had a consumer. Reaching it needs the node to leave `nodesById` while the draft survives — a `LIST_NODES` refetch after a delete performed elsewhere | GRD-RNR-12, GRD-TIP-15 |
| 13 | A failed per-object load "is reported" | **It is completely silent.** `loadObjectFailed` is dispatched (`saga.ts:274`) and handled by **nothing** — no reducer case, no toast, no listener in `src/`. No feedback, and the panel stays as it was. PRODUCT FINDING | GRD-LOD-08 |
| 14 | `properties` sent as an array → `400 DATATYPE_MISMATCH` | **`422`** from pydantic (`properties: dict[str, Any]`, `schemas/scene_objects.py:15`) before the route runs. `validate_properties`' isinstance guard is dead over HTTP | GRD-API-17 |

---

## 17. Traps that invalidate a run

1. **An open `<dialog>` poisons every later click** in the same file with
   `element click intercepted`, naming the wrong element. Mutating helpers must
   self-clean on failure and `afterEach` must sweep.
2. **`dialog[aria-label="X"]` is ambiguous** — one per row plus one in the form.
   Always add `[open]`.
3. **`setValue` loses to React.** Controlled inputs need the native value setter
   plus an `input` event — including when clearing to `''`.
4. **`aria-pressed` is inverted** on the eye and render icons: `true` = hidden.
5. **Nothing unmounts on collapse.** Assert `isDisplayed()`, never `isExisting()`.
6. **Row action icons are `opacity-0`** until hover/focus/selection but are always
   in the DOM — click them in-page rather than through WebDriver.
7. **`Ground.NNN` is gap-filling** — derive the next name, never hardcode it.
8. **Portalled surfaces** (the material picker, the read-only detail popup) attach
   to `document.body` — query from the root, not scoped to the panel.
9. **An out-of-range field raises a global app error.** WebdriverIO surfaces it as
   a pending page error on the next `execute`, so reading field state via
   `browser.execute` returns the app's own copy as a `WebDriverError`. Read field
   state with element commands instead.
10. **Kill orphan Electron / backend / chromedriver processes before every run** —
    `reapOrphans` is POSIX-only, so on Windows they accumulate and the next run
    dies in `before` with every test skipped. It reads exactly like flakiness.
