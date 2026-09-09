# Add a property to a type

Add a parameter to an object type or a material type that already exists — a new Ground dimension,
another Radiation coefficient.

Mostly a migration. **No schema change, no table, no backfill.**

!!! tip "Which recipe do you want?"
    | You want to… | Go to |
    |---|---|
    | Add a parameter to an existing type | **This page** |
    | Add a whole new object type | [Add an object type](add-object-type.md) |
    | Change a valid range on an existing property | [Changing a range](#changing-a-range-instead) below |

## Before you start

Read [The property system](../arch/properties.md). The short version: `property_type` is a
**globally unique shared pool**, and a link table attaches properties to types with a display
order and optional range overrides.

Check whether the property already exists before adding it:

```bash
sqlite3 "$HOME/Library/Application Support/Helios/backend-data/heliosgui.db" \
  "SELECT property, min, max FROM property_type WHERE property LIKE '%height%';"
```

If it exists with the meaning you want, skip step 1a and just link it.

!!! warning "Names are global, so they must be unambiguous"
    You cannot have two different `gs0` properties. That is why the four stomatal sub-models use
    `bwb_gs0`, `bbl_gs0`, `medlyn_gs0` and `bmf_*`. Prefix when a name would otherwise collide.

---

## Step 1 — The migration

`helios-desktop-backend/app/db/migrations/0NN_short_description.sql`

### 1a. The property, if it is new

```sql
WITH p(property, description, dt, mn, mx) AS (VALUES
    ('leaf_angle', 'Mean leaf inclination angle in degrees', 'float', 0, 90)
)
INSERT OR IGNORE INTO property_type (property, description, datatype_id, min, max)
SELECT p.property, p.description,
       (SELECT d.id FROM datatype d WHERE d.name = p.dt),
       p.mn, p.mx
FROM p;
```

Enums carry `enum_values` as a JSON array instead of min/max:

```sql
INSERT OR IGNORE INTO property_type (property, description, datatype_id, enum_values) VALUES
    ('leaf_distribution', 'Leaf angle distribution',
        (SELECT id FROM datatype WHERE name = 'enum'),
        '["Spherical", "Planophile", "Erectophile"]');
```

### 1b. Link it to the type

=== "Material type"

    ```sql
    WITH m(prop, ord) AS (VALUES
        ('leaf_angle', 19)
    )
    INSERT OR IGNORE INTO material_property_type
        (material_type_id, property_type_id, min_override, max_override, display_order)
    SELECT (SELECT id FROM material_type WHERE materialtype = 'Radiation'),
           pt.id, NULL, NULL, m.ord
    FROM m JOIN property_type pt ON pt.property = m.prop;
    ```

=== "Object type"

    ```sql
    WITH g(prop, ord) AS (VALUES
        ('leaf_angle', 11)
    )
    INSERT OR IGNORE INTO object_property_type (object_type_id, property_type_id, display_order)
    SELECT (SELECT id FROM object_types WHERE object = 'Ground'), pt.id, g.ord
    FROM g JOIN property_type pt ON pt.property = g.prop;
    ```

**Choose `display_order` deliberately.** It decides where the field appears if there is no
blueprint entry, and it is how the existing blocks stay separated. Radiation is the worked example:
model properties occupy 1–8, the radiation bands added by migration 023 took 9–18, and the
visualisation block sits at 90–93. Migration 023's header says so explicitly, and leaving gaps is
the reason a later insert did not have to renumber anything.

Pass `min_override` / `max_override` only when *this type* needs a narrower bound than the shared
property's default. `NULL` inherits.

!!! note "Migration 023 is the reference"
    `023_radiation_bands.sql` adds ten properties to an existing material type. Additive seed
    only, no schema change, `INSERT OR IGNORE` throughout so a re-run is a no-op. Copy its shape.

**Verify:**

```bash
curl -s localhost:8008/api/catalog/material-types | python3 -m json.tool | grep -A6 leaf_angle
```

---

## Step 2 — Material-only metadata (materials only)

Skip this for object types — `object_property_type` has no such columns, and the loader reads them
with `getattr(..., None)`.

| Want | Column | Migration |
|---|---|---|
| Render inside a named collapsible group | `group_name` | 027 |
| Show only when an enum has a given value | `selector_property` + `selector_value` | 027 |
| A display label different from the property name | `label` | 027 |
| Hide it from the form but keep it validating | `visibility` = `external` \| `computed` | 029 |

```sql
UPDATE material_property_type
SET group_name = 'Farquhar model'
WHERE material_type_id = (SELECT id FROM material_type WHERE materialtype = 'Photosynthesis')
  AND property_type_id = (SELECT id FROM property_type WHERE property = 'leaf_angle');
```

Two rules worth repeating from [the property system](../arch/properties.md):

- `label` is **display-only** and may repeat across sub-models. It never becomes a storage key.
- `visibility` affects only the **catalog response**. Validation and apply keep every property, so
  a hidden value still validates and still reaches the engine.

---

## Step 3 — Required (object types only)

`helios-desktop-backend/app/services/eav_validation.py`

```python
REQUIRED_OBJECT_PROPERTIES = {
    "Ground": {..., "leaf_angle"},
}
```

!!! info "Materials have no required-property mechanism"
    Migration 023 states it directly: *"Materials have no required-property mechanism, so no
    backend gating is needed."* `REQUIRED_MATERIAL_PROPERTIES` exists but is used only for the
    Visualiser's mode rule. A new material property is optional by construction.

### Marking it required does not fix existing objects

This is the trap, and it is quiet:

- The create form sends the full property set, so **new** objects must supply it.
- The right-panel Save sends a **PATCH**, and the backend intersects required with the keys
  actually sent: `required & set(body.properties.keys())`. A property not in the payload is not
  enforced.
- `numericProperties()` in the Geometry saga **drops blank fields** before the request is built.

So an existing Ground with no value for `leaf_angle` opens with the field blank, saves cleanly, and
keeps no value. Nothing errors. If existing objects must end up with a value, add a `UPDATE`/
`INSERT` backfill to your migration writing rows into `object_property_data` with
`project_material_id IS NULL` — in the canonical TEXT form.

---

## Step 4 — The form blueprint

=== "Object types"

    `src/renderer/src/containers/Geometry/propertyBlueprint.ts`

    ```ts
    {
      heading: 'Canopy',
      columns: 2,
      fields: [
        { property: 'leaf_angle', label: 'Leaf angle', defaultValue: '45' }
      ]
    }
    ```

=== "Material types"

    `src/renderer/src/containers/Materials/materialBlueprint.ts` — the material side also
    consumes `group`, `label` and `enum_values` from the catalog.

Skipping this is survivable: `appendUnmapped` defaults to true, so the field still renders in a
trailing two-column group with a humanized label (`leaf_angle` → "Leaf Angle") in
`display_order` position. What you lose is placement and — more importantly — `defaultValue`, so
the create form opens that field blank.

!!! danger "Object properties are numeric-only today"
    The Geometry form pipeline converts every value with `Number(trimmed)`:

    ```ts
    function numericProperties(values: Record<string, string>): Record<string, number> {
      // blank fields are dropped; everything else goes through Number()
    }
    ```

    and `CreateObjectInput.properties` is typed `Record<string, number>`. A `string`, `enum`,
    `boolean`, `date` or `file` property added to an **object** type will be coerced to `NaN`.

    The **material** form does handle those datatypes — enums, booleans and file pickers are all in
    use there. So a non-numeric object property needs frontend work beyond a blueprint entry.

---

## Step 5 — Does anything have to *use* it?

A property that is stored and displayed but never read changes nothing in the simulation.

| Side | Where the value is consumed |
|---|---|
| Object | `scene_object_service._build()` — reads intrinsic properties to construct the geometry |
| Material | `material_apply` — writes the value onto the primitives / into the engine |

Material property **names match the engine's own convention on purpose**. Migration 023 notes that
the band properties are named `reflectivity_<band>` etc. *"so `material_apply` writes them to the
engine unchanged."* Follow that: pick the name the engine already uses and you may need no apply
code at all.

For object properties, check whether the change should **rebuild** the object or patch it in place
— `_apply_intrinsic_change` and `_rebuild` make that decision.

---

## Verify

1. Restart the backend; the migration runs at startup. Watch for
   `[db] applied migration 0NN_….sql`.
2. `GET /api/catalog/object-types` (or `material-types`) shows the property with the right
   datatype, range and order.
3. The form renders it.
4. Save a value, reopen the object — it round-trips.
5. Out-of-range input returns **400 `VALUE_OUT_OF_RANGE`** quoting both bounds.

---

## Changing a range instead

Not a new property at all — one `UPDATE`, and there are two precedents:

```sql
-- 021: ground size floor raised to 0.01 m
UPDATE property_type SET min = 0.01 WHERE property IN ('length', 'breadth');

-- 026: a digit typo, 272 → 273 K
UPDATE property_type SET min = 273 WHERE property = 'topt_tpu';
```

Update `property_type` when the bound should apply everywhere the property is used; update
`min_override` / `max_override` on the link row when it applies to one type only.

!!! warning "A range change can need a code change too"
    Migration 021 raised the floor to `0.01` **and** required dropping `length`/`breadth` from
    `_EXCLUSIVE_MIN` in `eav_validation.py`, so the bound became inclusive (`>= 0.01` accepts
    `0.01`, rejects `0.009`). The set is empty today — but check it before assuming a range is
    purely data.

---

## Common mistakes

| Symptom | Cause |
|---|---|
| `400 UNKNOWN_PROPERTY` | Step 1b missing — the property exists but is not linked to this type |
| `400 MATERIAL_TYPE_MISMATCH` | Sent to the wrong material type; a distinct code by design |
| Field appears in an odd position with a clumsy label | No blueprint entry — `appendUnmapped` rendered it |
| Field appears blank on create | No `defaultValue` in the blueprint |
| Value saves as `NaN`, or is rejected | Non-numeric property on an **object** type — see step 4 |
| Value is stored but nothing changes in the render | Step 5 — nothing reads it |
| Existing objects have no value and never complain | Expected — see step 3 |
| Migration ran but the property is missing | The `JOIN property_type ON pt.property = …` found no row; step 1a did not run, or the name differs |

## Related

- [The property system](../arch/properties.md) — the mechanism.
- [Add an object type](add-object-type.md) — when the type itself is new.
- [Database & migrations](../arch/database.md) — numbering, idempotency, probes.
