# Data-type / unit / range-validation E2E coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add E2E coverage that sweeps out-of-range cell validation across every rangeable data type (base + one alternate unit) using the backend's real min/max, asserts the `is_base` "default unit" auto-selects, and extends the journey test with a post-import manual-assignment check and an exact Add-Rows auto-fill assertion.

**Architecture:** Two test-only deliverables. (1) A new self-contained WebdriverIO spec `e2e/tests/datatype-validation.test.ts` with a hardcoded fixture table (min/max copied from `GET /api/data-types/`) that loops one `it` per data type against one shared project — cell validation is pure client-side (`validateCellValue`), so `setReactInput` (change-only, never blur) exercises it instantly with no backend PATCH. (2) A small page-object helper `addRowsSeededValues()` plus three inserts into the existing `journey.test.ts`.

**Tech Stack:** WebdriverIO 9 (`wdio-electron-service`), Mocha, TypeScript 5.9, existing `Weather.page.ts` page object + `support/harness`.

## Global Constraints

- **Test-only. No app/`src` changes.** A genuine app misbehavior surfaced by a new assertion is left as a RED finding (record it; do **not** patch app logic without asking) — standing project rule.
- **Strict TypeScript.** No `any` without a one-line justification; no non-null `!` — narrow instead.
- **Message strings must match [`validation.ts` `formatRangeMessage`](../../../src/renderer/src/containers/Weather/validation.ts#L44-L49) exactly:** two-bound → `Value should be between {min} and {max}`; min-only → `Values should be ≥ {min}` (Unicode `≥`); max-only → `Values should be ≤ {max}` (Unicode `≤`). `{min}`/`{max}` are JS-number stringified (`1500`, not `1500.0`).
- **Typed cell values must stay within the global ±1,000,000 bound and ≤ 7 decimal places** ([`decimalValidation.ts` `MAX_DECIMALS`](../../../src/renderer/src/utils/decimalValidation.ts#L6)); a value beyond either is rejected by the keystroke guard and never lands. All fixture values below obey this.
- **Managed column names ≤ 30 chars.**
- **These specs characterize EXISTING behavior** — they should run GREEN on first run. A red assertion means either a test bug (fix the test) or a real app finding (surface it), never "write app code to make it pass."
- Header picker and the Add-Column data-type `<select>` both render the **raw `data_type` string** (e.g. `air_temperature`) verbatim. The header picker unit label after assignment is the bare `unit.unit` token (e.g. `K`, `m/s`, `W/m^2`) plus a decorative `▾` caret to normalize out.

---

## File Structure

- **Create:** `e2e/tests/datatype-validation.test.ts` — the catalog-sweep spec (Task 1). Self-contained: its own `before`, fixture table, and local helpers. Auto-discovered by `wdio.config.ts` (`specs: ['./e2e/tests/**/*.test.ts']`).
- **Modify:** `e2e/pages/Weather.page.ts` — add one method `addRowsSeededValues()` (Task 2).
- **Modify:** `e2e/tests/journey.test.ts` — capture `tempCol`; insert the Add-Rows auto-fill check and the post-import manual-assignment check (Task 2).

No source files change.

**Run commands** (from `helios_gui/`):
- Single spec: `npm run build && npx wdio run wdio.config.ts --spec ./e2e/tests/<file>.test.ts`
- Lint: `npm run lint`

---

## Task 1: Catalog-sweep range-validation spec

**Files:**
- Create: `e2e/tests/datatype-validation.test.ts`
- (No page-object or source change — every method used already exists on `Weather.page.ts`.)

**Interfaces:**
- Consumes (from `support/harness`): `enterProject(label: string): Promise<{ id: string; name: string }>`, `waitForBackendReady(): Promise<void>`, `waitForMainWindow(): Promise<void>`.
- Consumes (from `Weather.page.ts`): `openAddColumns()`, `setReactInput(selector, value)`, `acDataType` (`selectByVisibleText`), `acUnit` (`getValue`), `acSubmit`, `addColumnDialog`, `waitForColumn(name)`, `addRows(n)`, `visibleRowIds()`, `selectAllCheckbox`, `dateTimeHeaderTrigger`, `cellInvalid(rowId, colId)`, `cellError(rowId, colId)`, `changeUnit(colId, unit)`, `headerPickerLabel(colId)`.
- Produces: nothing consumed by later tasks (leaf spec).

- [ ] **Step 1: Create the spec file with the fixture table + helpers + sweep**

Create `e2e/tests/datatype-validation.test.ts` with exactly this content:

```typescript
/**
 * Data-type / unit RANGE-VALIDATION sweep. For every rangeable catalog data
 * type: assign it to a fresh managed column, assert the is_base unit
 * auto-selects (the "default unit" check), then drive below-min / above-max /
 * in-range values against the base unit AND one alternate unit, asserting the
 * EXACT message the app surfaces (validation.ts formatRangeMessage).
 *
 * Ranges are HARDCODED from GET /api/data-types/ so a silent backend range
 * change goes red (independent oracle). One shared project + addRows(3): cell
 * validation is pure client-side (validateCellValue on the change event), so
 * setReactInput never blurs -> no backend PATCH -> fast and isolated per column.
 *
 * Excluded (can't be range-tested the same way): `check` (no units), `date_time`
 * (null ranges), and large-scale units (air_CO2 ppb max 3e6, Wh/m^2) whose
 * out-of-range value exceeds the global +/-1e6 keystroke bound and would hit the
 * global message, not the unit message.
 */
import Weather from '../pages/Weather.page'
import { enterProject, waitForBackendReady, waitForMainWindow } from '../support/harness'

/** One unit's range + the concrete literals the loop drives and asserts. */
interface UnitCase {
  /** Unit token as the header picker / dialog renders it (e.g. 'K', 'W/m^2'). */
  unit: string
  /** Backend unit id (is_base id for `base`). */
  unitId: number
  /** Below-min probe (omitted when the unit has no min). */
  below?: number
  /** Above-max probe (omitted when the unit has no max). */
  above?: number
  /** A value inside the range (no-false-positive guard). */
  inRange: number
  /** Exact validation message for an out-of-range value in THIS unit. */
  message: string
}

interface TypeCase {
  /** Raw catalog data_type string (rendered verbatim by picker + <select>). */
  dataType: string
  /** Managed-column name (<= 30 chars). */
  col: string
  base: UnitCase
  /** null when the type has a single unit (skip the alternate step). */
  alt: UnitCase | null
}

// Hardcoded from the provided GET /api/data-types/ response. Every below/above
// probe is a clean number within +/-1e6 and <= 7 decimals.
const TYPES: TypeCase[] = [
  {
    dataType: 'direct_horizontal_radiation_flux',
    col: 'rad_dir',
    base: { unit: 'W/m^2', unitId: 1, below: -1, above: 1501, inRange: 750, message: 'Value should be between 0 and 1500' },
    alt: { unit: 'kW/m^2', unitId: 2, below: -1, above: 2, inRange: 0.75, message: 'Value should be between 0 and 1.5' }
  },
  {
    dataType: 'diffuse_horizontal_radiation_flux',
    col: 'rad_dif',
    base: { unit: 'W/m^2', unitId: 3, below: -1, above: 1501, inRange: 750, message: 'Value should be between 0 and 1500' },
    alt: { unit: 'kW/m^2', unitId: 4, below: -1, above: 2, inRange: 0.75, message: 'Value should be between 0 and 1.5' }
  },
  {
    dataType: 'air_temperature',
    col: 'temp',
    base: { unit: 'K', unitId: 5, below: 222, above: 351, inRange: 286, message: 'Value should be between 223 and 350' },
    alt: { unit: 'C', unitId: 6, below: -51, above: 78, inRange: 13, message: 'Value should be between -50.15 and 76.85' }
  },
  {
    dataType: 'air_pressure',
    col: 'press',
    base: { unit: 'Pa', unitId: 8, below: 86999, above: 150001, inRange: 118500, message: 'Value should be between 87000 and 150000' },
    alt: { unit: 'kPa', unitId: 10, below: 86, above: 151, inRange: 118, message: 'Value should be between 87 and 150' }
  },
  {
    dataType: 'air_humidity',
    col: 'humid',
    base: { unit: '0-1', unitId: 14, below: -1, above: 2, inRange: 0.5, message: 'Value should be between 0 and 1' },
    alt: { unit: '0-100', unitId: 15, below: -1, above: 101, inRange: 50, message: 'Value should be between 0 and 100' }
  },
  {
    dataType: 'wind_speed',
    col: 'wind',
    base: { unit: 'm/s', unitId: 16, below: -1, above: 61, inRange: 30, message: 'Value should be between 0 and 60' },
    alt: { unit: 'km/h', unitId: 17, below: -1, above: 217, inRange: 108, message: 'Value should be between 0 and 216' }
  },
  {
    dataType: 'turbidity',
    col: 'turb',
    base: { unit: '0-1', unitId: 21, below: -1, above: 2, inRange: 0.5, message: 'Value should be between 0 and 1' },
    // min-only (max is null) -> only the below-min probe applies; message uses >=.
    alt: { unit: '>1', unitId: 22, below: 0, inRange: 5, message: 'Values should be ≥ 1' }
  },
  {
    dataType: 'beta_soil',
    col: 'soil',
    base: { unit: '0-1', unitId: 23, below: -1, above: 2, inRange: 0.5, message: 'Value should be between 0 and 1' },
    alt: null
  },
  {
    dataType: 'air_CO2',
    col: 'co2',
    base: { unit: 'ppm', unitId: 24, below: -1, above: 3001, inRange: 1500, message: 'Value should be between 0 and 3000' },
    // max-only (min is null) -> only the above-max probe applies; message uses <=.
    alt: { unit: 'kg/m³', unitId: 26, above: 1, inRange: 0.001, message: 'Values should be ≤ 0.005894' }
  }
]

/** Strip the header picker's decorative caret so the label compares to a token. */
const norm = (s: string): string => s.replace(/▾/g, '').trim()

let SHARED_ROW = ''

/**
 * Add a managed column choosing ONLY the data type, so the base (is_base) unit
 * auto-selects. Returns the new column's colId and the auto-selected unitId
 * (read from the dialog's unit <select> before submit).
 */
async function addTypedColumn(name: string, dataType: string): Promise<{ colId: string; unitId: string }> {
  await Weather.openAddColumns()
  await Weather.setReactInput('[data-testid="input-parameterName"]', name)
  await Weather.acDataType.selectByVisibleText(dataType)
  await browser.waitUntil(async () => (await Weather.acUnit.getValue()) !== '', {
    timeout: 10000,
    timeoutMsg: `data type "${dataType}" did not auto-select a unit`
  })
  const unitId = await Weather.acUnit.getValue()
  await Weather.acSubmit.click()
  await Weather.addColumnDialog.waitForDisplayed({ reverse: true, timeout: 20000 })
  const colId = await Weather.waitForColumn(name)
  return { colId, unitId }
}

/** Set a cell and assert it flags aria-invalid with the EXACT unit message. */
async function assertOutOfRange(colId: string, value: number, message: string): Promise<void> {
  await Weather.setReactInput(`[aria-label="${SHARED_ROW} ${colId}"]`, String(value))
  await browser.waitUntil(async () => (await Weather.cellInvalid(SHARED_ROW, colId)) === 'true', {
    timeout: 10000,
    timeoutMsg: `cell[${colId}] never became aria-invalid for out-of-range ${value}`
  })
  expect(await Weather.cellError(SHARED_ROW, colId)).toBe(message)
}

/** Set an in-range value and assert the flag clears (no false positive). */
async function assertInRange(colId: string, value: number): Promise<void> {
  await Weather.setReactInput(`[aria-label="${SHARED_ROW} ${colId}"]`, String(value))
  await browser.waitUntil(async () => (await Weather.cellInvalid(SHARED_ROW, colId)) === null, {
    timeout: 10000,
    timeoutMsg: `in-range ${value} did not clear aria-invalid on ${colId}`
  })
  expect(await Weather.cellError(SHARED_ROW, colId)).toBe(null)
}

/** Drive the below/above probes (whichever the unit has) + the in-range guard. */
async function exerciseUnit(colId: string, u: UnitCase): Promise<void> {
  if (u.below != null) await assertOutOfRange(colId, u.below, u.message)
  if (u.above != null) await assertOutOfRange(colId, u.above, u.message)
  await assertInRange(colId, u.inRange)
}

describe('Weather data types — per-type range validation sweep', () => {
  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
    await enterProject('dtvalid')
    await Weather.selectAllCheckbox.waitForDisplayed({ timeout: 20000 })
    await Weather.dateTimeHeaderTrigger.waitForDisplayed({ timeout: 20000 })
    // One shared row set is enough — each type edits row 0 of its own column.
    await Weather.addRows(3)
    const rows = await Weather.visibleRowIds()
    SHARED_ROW = rows[0]
  })

  for (const t of TYPES) {
    it(`${t.dataType}: is_base auto-selects, then base + alt unit ranges validate`, async function () {
      this.timeout(60000)

      // Add the column with ONLY the data type -> the is_base unit auto-selects.
      const { colId, unitId } = await addTypedColumn(t.col, t.dataType)
      // Default-unit check: the dialog auto-selected the catalog is_base unit id.
      expect(unitId).toBe(String(t.base.unitId))
      // ...and the header now shows that base unit's token.
      expect(norm(await Weather.headerPickerLabel(colId))).toBe(t.base.unit)

      // Base-unit range validation (exact messages from the backend bounds).
      await exerciseUnit(colId, t.base)

      // Alternate unit: switching re-derives a DIFFERENT range + message.
      if (t.alt) {
        await Weather.changeUnit(colId, t.alt.unit)
        await browser.waitUntil(
          async () => norm(await Weather.headerPickerLabel(colId)) === t.alt!.unit,
          { timeout: 10000, timeoutMsg: `unit did not change to ${t.alt.unit}` }
        )
        await exerciseUnit(colId, t.alt)
      }
    })
  }
})
```

- [ ] **Step 2: Lint the new file**

Run: `npm run lint`
Expected: PASS (no errors for `e2e/tests/datatype-validation.test.ts`). If ESLint flags the `t.alt!` non-null in the `waitUntil` closure, replace that closure body with a captured const:
```typescript
        const alt = t.alt
        await browser.waitUntil(
          async () => norm(await Weather.headerPickerLabel(colId)) === alt.unit,
          { timeout: 10000, timeoutMsg: `unit did not change to ${alt.unit}` }
        )
```
(the `if (t.alt)` guard already narrows `alt` to non-null).

- [ ] **Step 3: Run the sweep spec**

Run: `npm run build && npx wdio run wdio.config.ts --spec ./e2e/tests/datatype-validation.test.ts`
Expected: PASS — 9 passing `it`s (one per data type).

Interpreting a failure (do NOT edit `src/` to fix):
- A `cellError` mismatch on ONE type/unit → the app's live message differs from the hardcoded bound. First re-check the fixture literal against `validation.ts formatRangeMessage` and the API response; if the fixture is right, this is a **real app finding** — record it (e.g. an `it.skip` with a `// RED FINDING:` note capturing expected vs actual) and continue, per the standing rule. Do not silently loosen the assertion.
- `data type "…" did not auto-select a unit` → the Add-Column dialog didn't auto-select `is_base` for that type — also a real finding; record it the same way.
- `option not found` in `changeUnit` → the unit token in the fixture doesn't match the rendered label; fix the fixture `unit` string to match the catalog's `unit` field exactly (this is a test bug).

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/datatype-validation.test.ts
git commit -m "test(e2e): per-data-type range-validation sweep (base + alt unit)"
```

---

## Task 2: Journey extension — post-import assignment + exact Add-Rows auto-fill

**Files:**
- Modify: `e2e/pages/Weather.page.ts` (add `addRowsSeededValues()`)
- Modify: `e2e/tests/journey.test.ts` (capture `tempCol`; two inserts)

**Interfaces:**
- Consumes: existing `Weather.page.ts` — `openAddRows()`, `arStartDate`, `arStartTime`, `arDeltaHours`, `arCancel`, `addRowsDialog`, `assignDataTypeUnit(colId, dataType, unit)`, `setReactInput`, `cellInvalid`, `cellError`, `waitForColumn`; and journey-local `numericCell(rowId, colId)`.
- Produces: `addRowsSeededValues(): Promise<{ startDate: string; startTime: string; deltaHours: string }>` on the Weather page object (opens Add Rows, returns the seeded field values, leaves the dialog OPEN for the caller to assert then cancel).

- [ ] **Step 1: Add the `addRowsSeededValues()` page-object method**

In `e2e/pages/Weather.page.ts`, insert this method immediately AFTER the existing `addRows(...)` method (it ends at the `}` on the line after the `no rows appeared after Add Rows` `waitUntil`, ~line 300):

```typescript
  /**
   * Open the Add-Rows dialog and return its auto-seeded field values. The dialog
   * derives Start Date/Time + Delta from the last existing row on open
   * (AddRowsDialog.tsx inferDeltaHours/seededStart). Leaves the dialog OPEN — the
   * caller asserts the values then closes it (arCancel).
   */
  async addRowsSeededValues(): Promise<{ startDate: string; startTime: string; deltaHours: string }> {
    await this.openAddRows()
    return {
      startDate: await this.arStartDate.getValue(),
      startTime: await this.arStartTime.getValue(),
      deltaHours: await this.arDeltaHours.getValue()
    }
  }
```

- [ ] **Step 2: Capture the imported temp column's colId in the journey**

In `e2e/tests/journey.test.ts`, change the line (~81) that resolves the temp column so its colId is captured. Find:

```typescript
    const humidityCol = await Weather.waitForColumn('humidity')
    await Weather.waitForColumn('temp')
```

Replace with:

```typescript
    const humidityCol = await Weather.waitForColumn('humidity')
    const tempCol = await Weather.waitForColumn('temp')
```

- [ ] **Step 3: Insert the exact Add-Rows auto-fill assertion (after the humidity check, before step 4)**

In `e2e/tests/journey.test.ts`, find the end of step 3 — the humidity guard block that ends with:

```typescript
    if (Math.abs(humidity - 70.98) > 0.01) {
      throw new Error(`humidity[row0] = ${humidity}, expected ~70.98 from the file`)
    }
```

Immediately AFTER that closing `}` (and before the `// ── 4.` comment), insert:

```typescript

    // ── 3b. Add Rows AUTO-PICKS start date/time + delta from the imported rows.
    // davis is hourly; last imported row is 2026-05-12T23:00, so the dialog seeds
    // delta '1' and the next hour (2026-05-13 00:00). Differential: broken
    // inference would seed blanks or a different stamp. Cancel without adding so
    // the journey's row set is unchanged.
    const seeded = await Weather.addRowsSeededValues()
    expect(seeded.deltaHours).toBe('1')
    expect(seeded.startDate).toBe('2026-05-13')
    expect(seeded.startTime).toBe('00:00')
    await Weather.arCancel.click()
    await Weather.addRowsDialog.waitForDisplayed({ reverse: true, timeout: 10000 })
```

- [ ] **Step 4: Insert the post-import manual-assignment + range-validation check (after step 5, before step 5b)**

In `e2e/tests/journey.test.ts`, find the end of step 5 — the committed-cell guard that ends with:

```typescript
    await browser.waitUntil(async () => (await Weather.cellInput(editRow, noteCol).getValue()) === '42', {
      timeout: 15000,
      timeoutMsg: 'edited cell did not show the committed value'
    })
```

Immediately AFTER that closing `})` (and before the `// ── 5b.` comment), insert:

```typescript

    // ── 5b'. Imported columns arrive WITHOUT a data type (the import saga uploads
    // datatype:null), so range validation only ARMS after a manual assignment.
    // Assign air_temperature + Fahrenheit to the imported temp column, then prove
    // an out-of-range value is flagged with the unit's backend range and an
    // in-range value clears it. setReactInput fires the change event only (no
    // blur) → purely client-side validation, the committed backend value is
    // untouched, so later steps are unaffected.
    const originalTemp = await numericCell(editRow, tempCol)
    await Weather.assignDataTypeUnit(tempCol, 'air_temperature', 'F')
    await Weather.setReactInput(`[aria-label="${editRow} ${tempCol}"]`, '500')
    await browser.waitUntil(async () => (await Weather.cellInvalid(editRow, tempCol)) === 'true', {
      timeout: 10000,
      timeoutMsg: 'out-of-range temp (500 °F) did not flag aria-invalid'
    })
    expect(await Weather.cellError(editRow, tempCol)).toBe('Value should be between -58.27 and 170.33')
    await Weather.setReactInput(`[aria-label="${editRow} ${tempCol}"]`, String(originalTemp))
    await browser.waitUntil(async () => (await Weather.cellInvalid(editRow, tempCol)) === null, {
      timeout: 10000,
      timeoutMsg: 'restored in-range temp did not clear aria-invalid'
    })
```

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS for `e2e/pages/Weather.page.ts` and `e2e/tests/journey.test.ts`.

- [ ] **Step 6: Run the journey spec**

Run: `npm run build && npx wdio run wdio.config.ts --spec ./e2e/tests/journey.test.ts`
Expected: PASS — the single journey `it` still green with the two new arcs.

Interpreting a failure (do NOT edit `src/` to fix):
- Add-Rows seed mismatch (`startDate`/`startTime`/`deltaHours`) → confirm the davis fixture's last row is still `2026-05-12T23:00` and hourly (`head`/`tail` of `e2e/fixtures/weather/davis, ca yesterday.csv`). If the fixture changed, update the three literals. If the fixture is unchanged but the dialog seeds differently, that's a real finding in `AddRowsDialog.tsx inferDeltaHours/seededStart` — record it, don't patch.
- `assignDataTypeUnit` "picker option not found: air_temperature" → the header picker no longer renders the raw `data_type` string; inspect `DataTypeUnitPicker` and update the label passed. (Verified raw at plan time.)
- `cellError` mismatch on the temp check → re-verify Fahrenheit bounds (`-58.27`, `170.33`) against the API response; if unchanged, it's a real app finding.

- [ ] **Step 7: Commit**

```bash
git add e2e/pages/Weather.page.ts e2e/tests/journey.test.ts
git commit -m "test(e2e): journey covers post-import type assignment + exact Add-Rows auto-fill"
```

---

## Self-Review

**1. Spec coverage** (each spec requirement → task):
- Range validation swept across all rangeable data types with backend min/max → Task 1 `TYPES` loop (9 types). ✅
- `is_base` default-unit auto-selection asserted per type → Task 1 Step 1 (`expect(unitId).toBe(String(t.base.unitId))` + header label). ✅
- Per-unit range re-derives on unit change (base + one alternate) → Task 1 `changeUnit` + second `exerciseUnit`. ✅
- One-sided units (`turbidity >1` ≥, `air_CO2 kg/m³` ≤) → Task 1 fixture omits the absent bound's probe; `≥`/`≤` messages. ✅
- Excluded `check` / `date_time` / large-scale units → Task 1 file header comment (not in `TYPES`). ✅
- Post-import manual assignment (imported column type-less → assign → validation fires) → Task 2 Step 4. ✅
- Exact Add-Rows auto-fill after import → Task 2 Steps 1+3 (`addRowsSeededValues` + literal asserts). ✅
- Page-object helper `addRowsSeededValues()` → Task 2 Step 1. ✅

**2. Placeholder scan:** No TBD/TODO; every step has full code and exact run commands. Failure-handling steps give concrete diagnostics, not "handle errors." ✅

**3. Type consistency:** `addTypedColumn` returns `{ colId, unitId }` (unitId a string from `getValue()`), compared with `String(t.base.unitId)`. `UnitCase.below/above` optional; `exerciseUnit` null-checks both. `addRowsSeededValues()` return shape matches its consumer in journey Step 3. `norm`, `SHARED_ROW`, `TYPES` all defined before use. Header-label comparisons use `norm(...)` consistently. ✅

**Notes / residual risks** (called out for the executor):
- Shared-project sweep intentionally omits `beforeEach(reloadToHome)` — all `it`s share the `before` project. If a later run shows cross-`it` bleed, switch each `it` to its own `enterProject` (slower).
- `enterProject('dtvalid')` uses default coordinates (label-only overload, as `weather.test.ts` does).
