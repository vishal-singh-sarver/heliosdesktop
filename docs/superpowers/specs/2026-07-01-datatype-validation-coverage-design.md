# Data-type / unit / range-validation E2E coverage — design

**Date:** 2026-07-01
**Status:** approved (brainstorming), pending implementation plan
**Scope:** test-only (`e2e/`). No app/source changes.

## Problem

The Helios weather workflow lets a user assign a **data type** and a **unit** to each
column; the backend catalog (`GET /api/data-types/`) publishes a per-unit `min`/`max`
range, and the renderer validates every cell against the assigned unit's range
([`validation.ts`](../../../src/renderer/src/containers/Weather/validation.ts)). Two
big pieces of that machinery are under-tested end-to-end:

1. **Range validation is only exercised for one arbitrary data type.** `weather.test.ts`
   picks "any bounded unit the catalog offers first" and checks below/above/in-range
   generically. Nothing sweeps the range check across all the real data types
   (temperature, pressure, humidity, wind, CO₂, radiation, turbidity, …) using each
   type's actual backend bounds.
2. **The post-import manual-assignment path is untested.** Imported CSV columns are
   created with `datatype: null, data_unit: null`
   ([`saga.ts:292`](../../../src/renderer/src/containers/Weather/saga.ts#L292)), so
   range validation only arms **after** the user manually assigns a data type + unit
   via the header picker. No test covers "import → assign a type → validation now
   fires," let alone for multiple types.
3. **The `is_base` "default unit" auto-selection** is only checked on Add-Column, not
   asserted against the catalog per type.
4. **Add-Rows auto-fill** is only asserted as "fields are non-empty," never that
   `startDate` / `startTime` / `deltaHours` actually equal `lastRow + inferredDelta`
   ([`AddRowsDialog.tsx:77-130`](../../../src/renderer/src/containers/Weather/AddRowsDialog.tsx#L77-L130)).

## Goals

- Sweep out-of-range cell validation across **every rangeable data type** using the
  backend's real min/max.
- Assert the **default (`is_base`) unit** is auto-selected per data type.
- Prove per-unit ranges re-derive when the **unit changes**.
- Cover the **post-import manual-assignment** flow (imported column starts type-less →
  assign → validation fires) for a real type on real data.
- Assert the **Add-Rows auto-fill** (delta + start date/time) **exactly**, on
  inferred-from-import data.

## Non-goals

- No app/source changes. Genuine app misbehavior surfaced by these tests is left as a
  **red finding**, not patched (standing project rule).
- No exhaustive per-unit cartesian sweep (all ~40 units). Base + one alternate per type
  is enough to prove per-unit ranges.
- No coverage of `check` (no units) or `date_time` (format "units", null ranges) for
  numeric range validation.

## Decisions (from brainstorming)

- **Packaging:** *both* — a light validation arc added to the existing journey test
  **and** a dedicated catalog-sweep spec.
- **Sweep breadth:** base (`is_base`) unit **+ one alternate unit** per rangeable type.
- **Range source:** **hardcoded** min/max from the API response, rendered into expected
  messages exactly as the app formats them — an independent oracle. (A silent backend
  range change should make these go red, by design.)

## Deliverables

### A. New spec — `e2e/tests/datatype-validation.test.ts`

A hardcoded, catalog-swept range-validation suite. One shared project is created in a
`before` hook and `addRows(3)` is run once (cell validation is pure client-side, so no
per-type backend isolation is needed — this keeps the sweep fast). The Weather screen
stays mounted across the `it`s (this suite intentionally does **not** use
`beforeEach(reloadToHome)`).

One `it(...)` **per data type**. Each does:

1. **Add a managed column** selecting only the data type → assert the dialog
   **auto-selected the `is_base` unit** (the "default unit" check).
2. **Base-unit range:** edit a cell to `min − δ` → assert `aria-invalid=true` +
   exact message; `max + δ` → same; **midpoint** → assert **valid** (no false positive).
3. **Alternate unit:** `changeUnit` to a second unit, edit a cell to a value
   out-of-range *for that unit* → assert the message shows the **alternate's different
   min/max** (proves the range re-derives with the unit).

Expected messages are built exactly as
[`formatRangeMessage`](../../../src/renderer/src/containers/Weather/validation.ts#L44-L49):

- both bounds → `Value should be between {min} and {max}`
- min only  → `Values should be ≥ {min}`
- max only  → `Values should be ≤ {max}`

where `{min}`/`{max}` are JS-number-stringified (e.g. `1500`, not `1500.0`; `-50.15`).

**Hardcoded fixture table** (from the provided `GET /api/data-types/` response):

| Data type | Base (`is_base`) | Alternate | One-sided |
|---|---|---|---|
| direct_horizontal_radiation_flux | W/m^2 `[0, 1500]` | kW/m^2 `[0, 1.5]` | no |
| diffuse_horizontal_radiation_flux | W/m^2 `[0, 1500]` | kW/m^2 `[0, 1.5]` | no |
| air_temperature | K `[223, 350]` | C `[-50.15, 76.85]` | no |
| air_pressure | Pa `[87000, 150000]` | kPa `[87, 150]` | no |
| air_humidity | 0-1 `[0, 1]` | 0-100 `[0, 100]` | no |
| wind_speed | m/s `[0, 60]` | km/h `[0, 216]` | no |
| turbidity | 0-1 `[0, 1]` | >1 `[1, ∞)` → `Values should be ≥ 1` | alt |
| beta_soil | 0-1 `[0, 1]` | *(single unit — no alt step)* | no |
| air_CO2 | ppm `[0, 3000]` | kg/m³ `(-∞, 0.005894]` → `Values should be ≤ 0.005894` | alt |

Each row also carries the concrete test values and the expected message string(s),
so the loop asserts literals. Value-derivation convention:

- `belowMin = min − 1`, `aboveMax = max + 1` (both stay typeable within ±1e6 for every
  unit in the table).
- `inRange`: for two-bound units, the midpoint `(min + max) / 2`; for one-sided units, a
  concrete value satisfying the single bound (e.g. turbidity `>1` → `5`; air_CO2 kg/m³
  `≤ 0.005894` → `0.001`).
- One-sided units assert only the bounded side (below-min for `≥`, above-max for `≤`)
  plus the `inRange` no-false-positive case.

**Deliberately excluded** (with an in-test `log`/comment): `check` (no units),
`date_time` (null ranges), and large-scale units — `air_CO2 ppb` (max 3,000,000),
`Wh/m²`, `umol/m^2/s` (max 6855 is fine, but ppb/Wh exceed the **global ±1,000,000**
keystroke bound). A value beyond ±1e6 can't be typed and would hit the global message
(`Value should be between -1000000 and 1000000`), not the unit message
([`validation.ts:15-17,73-75`](../../../src/renderer/src/containers/Weather/validation.ts#L15-L17)).
Every base/alt in the table is inside ±1e6 on purpose.

### B. Journey extension — `e2e/tests/journey.test.ts`

Inserted into the existing single `it`, using the real imported davis data
(`davis, ca yesterday.csv` — 24 hourly rows, `2026-05-12T00:00` … `2026-05-12T23:00`,
ascending; `temp` column is °F, ~58–65):

- **Add-Rows auto-fill (after import):** open Add Rows, assert seeded fields **exactly**
  `deltaHours = "1"`, `startDate = "2026-05-13"`, `startTime = "00:00"` (last row 23:00
  + inferred 1h), then **Cancel** — no rows added, journey narrative unchanged.
- **Post-import manual assignment:** assign **air_temperature + F** to the imported
  `temp` column via the header picker (proves imported columns start type-less and
  validation only arms after assignment); edit a temp cell to `500` → assert invalid +
  `Value should be between -58.27 and 170.33`; edit back in-range → assert valid.

Slots in before the "go Home" step; reopen/persist, rename, delete are untouched.

### C. Page-object additions — `e2e/pages/Weather.page.ts`

- `addRowsSeededValues(): Promise<{ startDate: string; startTime: string; deltaHours: string }>`
  — open Add Rows (or read while open) and return the three fields' current `getValue()`.
- Reuse existing: `assignDataTypeUnit`, `changeUnit`, `cellInvalid`, `cellError`,
  `editCell`, `addColumn`, `headerPickerLabel`, `addRows`, `deleteColumn`,
  `openAddRows` / `arCancel`.

## Risks / details to nail during implementation

- **Data-type option label** in the header picker (journey step): confirm
  `DataTypeUnitPicker` renders the raw `data_type` (`air_temperature`) vs a prettified
  label before pinning the name in `assignDataTypeUnit(colId, 'air_temperature', 'F')`.
- **`is_base` auto-select assertion mechanism:** either read the Add-Column unit
  `<select>` selected value (= `is_base` unit id) before submit, or assert
  `headerPickerLabel(colId)` shows the base unit token after create — mirror the
  existing `weather.test.ts` "auto-selected base unit" assertion.
- **Tooltip message fidelity:** `cellError` reads the info-icon tooltip
  (`aria-label^="Validation error:"`); confirmed usable by the existing unit-range test.
  Assert `contains`/equality against the computed message.
- **Global-bound collisions:** none for the chosen base/alt units (all within ±1e6);
  keep it that way if the table is extended.
- **Shared-project sweep** deviates from other suites' `beforeEach(reloadToHome)`. If
  full per-type isolation is later wanted, switch each `it` to create its own fresh
  project (slower, ~9 creates).

## Test-quality bar

Every assertion is **differential** (mirrors the existing suites): a value in range
must stay valid (no false positive), an out-of-range value must flip `aria-invalid` and
surface the exact configured bound, and the alternate-unit message must differ from the
base message. The Add-Rows and post-import checks assert literal derived values, not
mere non-emptiness.
