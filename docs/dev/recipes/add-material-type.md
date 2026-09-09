# Add a material type

Add a new kind of material alongside Radiation, Energy Balance, Photosynthesis and the rest.

!!! success "This one is mostly just a migration"
    Unlike [adding an object type](add-object-type.md), the material form is **catalog-driven** —
    it renders whatever the catalog describes, including collapsible groups and conditional
    sub-models, with no frontend change at all.

    Expect: one migration, and possibly one small change in `material_apply`.

## Decide first: model, or rendering?

This single question drives step 2 and it is easy to get wrong.

| | Model type | Rendering type |
|---|---|---|
| Examples | Radiation, Photosynthesis | Visualiser |
| Describes | Physics the simulation runs | How the scene is drawn |
| Needs a `model_type` row | **Yes** | **No** |
| Appears in the model list and Run configuration | Yes | No |

Migration 024 states it for the Visualiser: *"deliberately gets NO `model_type` row (migration
018): it is a rendering type, not a physics model, and must not appear in the model list."*

## Before you start

- Read [The property system](../arch/properties.md).
- Read `024_visualiser_material_type.sql`. It is the **exact precedent** — the last time a
  material type was added — and its header documents every step it takes and why.
- Remember the group rule: a material group may carry **at most one member per material type**
  (`UNIQUE(material_group_id, material_type_id)`).

---

## Step 1 — The migration

`helios-desktop-backend/app/db/migrations/0NN_add_<name>_material_type.sql`

### 1a. The type

```sql
INSERT OR IGNORE INTO material_type (materialtype, description) VALUES
    ('Soil Moisture', 'Soil water content and hydraulic properties');
```

`materialtype` is `UNIQUE COLLATE NOCASE`, so `INSERT OR IGNORE` makes a re-run a no-op.

### 1b. Any new properties

Same as [Add a property to a type](add-property.md) — `property_type` is a globally unique shared
pool, so check before adding.

```sql
INSERT OR IGNORE INTO property_type (property, description, datatype_id, min, max)
SELECT 'soil_water_content', 'Volumetric soil water content',
       (SELECT id FROM datatype WHERE name = 'float'), 0, 1;
```

### 1c. Link them to the type

```sql
WITH m(prop, ord) AS (VALUES
    ('soil_water_content', 1),
    ('soil_conductivity',  2)
)
INSERT OR IGNORE INTO material_property_type (material_type_id, property_type_id, display_order)
SELECT (SELECT id FROM material_type WHERE materialtype = 'Soil Moisture'), pt.id, m.ord
FROM m JOIN property_type pt ON pt.property = m.prop;
```

When this type needs a **narrower** range than the shared property's default, carry the overrides
in the CTE as Radiation does in migration 017 — `NULL` inherits:

```sql
WITH m(prop, mn, mx, ord) AS (VALUES
    ('soil_water_content', 0, 0.6,  1),
    ('soil_conductivity',  NULL, NULL, 2)
)
INSERT OR IGNORE INTO material_property_type
    (material_type_id, property_type_id, min_override, max_override, display_order)
SELECT (SELECT id FROM material_type WHERE materialtype = 'Soil Moisture'),
       pt.id, m.mn, m.mx, m.ord
FROM m JOIN property_type pt ON pt.property = m.prop;
```

Keep `display_order` below **90** — that band is the visualisation block.

!!! warning "New types do NOT inherit the visualisation properties"
    Migration 017 attached `color_r/g/b` and `texture_file` to all six types with a one-off
    `CROSS JOIN`, and migration 024 then **removed** those links, making the Visualiser their sole
    owner.

    So a type added today gets no colour or texture properties, and should not want them. Colour,
    opacity and texture are a rendering concern that belongs to the Visualiser.

### 1d. Optional — grouping, selectors, labels, visibility

If your type has a collapsible sub-section, or mutually-exclusive sub-models chosen by an enum,
set the migration-027 columns. See
[Add a property to a type](add-property.md#step-2-material-only-metadata-materials-only).

### 1e. Optional — a default material group

The library ships one default group per type. Migration 024's step (e) is the pattern: a
`material_group` with `project_id` and `scenario_id` NULL, one `project_material` member, and its
`material_data` values — all linked by pure SQL subqueries with no host variables.

```sql
INSERT INTO material_group (project_id, scenario_id, name)
SELECT NULL, NULL, 'Default Soil Moisture'
WHERE NOT EXISTS (
    SELECT 1 FROM material_group WHERE name = 'Default Soil Moisture' COLLATE NOCASE
);

INSERT OR IGNORE INTO project_material (material_group_id, material_type_id)
SELECT (SELECT id FROM material_group WHERE name = 'Default Soil Moisture' COLLATE NOCASE),
       (SELECT id FROM material_type WHERE materialtype = 'Soil Moisture');
```

The group `INSERT` is guarded by `NOT EXISTS` rather than `INSERT OR IGNORE` because the
uniqueness is enforced by an index on a `COLLATE NOCASE` name — a re-run must not violate it.

!!! danger "Migration file constraints"
    The runner splits on semicolons and strips only **full-line** `--` comments. So: no semicolons
    inside a statement, no trailing comments on a code line, and no triggers.

---

## Step 2 — The model catalog

**Model types only.** Skip entirely for a rendering type.

`model_type` (migration 018) is a separate, hierarchical catalog — `parent_id NULL` is a
top-level model, otherwise a sub-model:

```sql
INSERT OR IGNORE INTO model_type (model, description) VALUES
    ('Soil Moisture', 'Soil moisture transport model');
```

Sub-models join to their parent by name:

```sql
WITH s(model, description, parent) AS (VALUES
    ('Richards', 'Richards-equation soil submodel', 'Soil Moisture')
)
INSERT OR IGNORE INTO model_type (model, description, parent_id)
SELECT s.model, s.description, mt.id
FROM s JOIN model_type mt ON mt.model = s.parent AND mt.parent_id IS NULL;
```

The six existing model types are named **identically** to their material types. Keep that
convention — it is what makes the two catalogs line up for a reader.

!!! note "Two independent levels of enablement"
    `scenario_object_model` is per-geometry ("which models use this geometry"), `scenario_model`
    is per-scenario ("which models run"). An **absent row means enabled** in both — only explicit
    settings are stored.

---

## Step 3 — Required properties and mode rules

Usually **nothing to do**.

Migration 023 puts it plainly: *"Materials have no required-property mechanism, so no backend
gating is needed."* `REQUIRED_MATERIAL_PROPERTIES` exists but holds only the Visualiser, whose
colour mode must be complete.

Add an entry only if your type genuinely cannot be saved partially. If it has mutually-exclusive
modes like the Visualiser's colour/texture toggle, model the rule on `visualiser_mode_required()`
in `eav_validation.py`.

---

## Step 4 — The form

Usually **nothing to do**. This is the real difference from object types.

`materialBlueprint.ts` joins the catalog wire shape into render-ready groups: top-level fields
first, then each group as a collapsible section, with a `selector_property`/`selector_value` group
appearing only while its enum holds the matching value. Labels, ranges, order and group membership
all come from the catalog.

Two types have bespoke editors, and how they are detected matters:

| Type | Editor | Detected by |
|---|---|---|
| Visualiser | `MaterialVisualisationEditor` | the presence of `color_r` — a **property signature**, not a name or id |
| Radiation | `MaterialRadiationEditor` | its own field signature |

Because detection is by signature, **a new type falls through to the generic renderer
automatically**. You only touch the frontend if you want a bespoke editor.

One thing to be aware of: `MATERIAL_WIDE_PROPERTIES` marks properties that belong to the material
as a whole rather than to the type declaring them — `two_sided_heat_transfer` today. Several types
carry it, every card shows the same answer, and setting it on one sets it on all. If your type
declares such a property, add it to that set.

---

## Step 5 — Reaching the engine

`helios-desktop-backend/app/services/material_apply.py`

This is where a material's values land on primitives. Two channels:

| Channel | Mechanism |
|---|---|
| `color_r/g/b` and `texture_file` | A per-object Helios **material label** — `addMaterial` + `setMaterialColor` / `setMaterialTexture` + `assignMaterialToPrimitive`. A label is serialized by `writeXML`; a raw `setPrimitiveColor` is **not**, so this survives a `context.xml` reload |
| Everything else | `ctx.setPrimitiveData<typed>(uuids, name, value)` |

!!! tip "Name your properties after the engine's convention and write no code"
    The property name becomes the **primitive data name verbatim**. Migration 023 chose
    `reflectivity_PAR`, `emissivity_NIR` and so on precisely *"so `material_apply` writes them to
    the engine unchanged."*

    Pick the name Helios already uses and step 5 is free.

The datatype → setter mapping is a plain dict:

```python
_DATATYPE_SETTER = {
    "float":   "setPrimitiveDataFloat",
    "integer": "setPrimitiveDataInt",
    "boolean": "setPrimitiveDataUInt",   # no native bool setter; 0/1, matching Helios
    "string":  "setPrimitiveDataString",
    "enum":    "setPrimitiveDataString",
    "date":    "setPrimitiveDataString",
    "time":    "setPrimitiveDataString",
    "file":    "setPrimitiveDataString",
}
```

You only touch this when adding a whole new **datatype**, which is rare. There is also a small set
of enums the engine wants as a numeric flag rather than a string — the heat-transfer flag is
modelled as an enum for a clean dropdown but written as Helios' own two-sided flag. Add to that
set if your enum is really a flag.

All PyHelios access here degrades to a no-op when the native library is unavailable (headless,
CI) or when the object was not built in this session.

---

## Verify

1. Restart the backend; watch for `[db] applied migration 0NN_….sql`.
2. `GET /api/catalog/material-types` lists your type with its properties in `display_order`.
3. In the UI: create a material, add a "Parameter Group" card, and your type appears in the
   picker.
4. Save values, reopen — they round-trip.
5. Assign the material to a ground and confirm the values reach the engine.
6. If it is a model type, it appears in the per-geometry model list.

---

## Common mistakes

| Symptom | Cause |
|---|---|
| Type missing from the picker | Step 1a did not run, or the migration was not stamped |
| Type present with no fields | Step 1c — no property links |
| `400 MATERIAL_TYPE_MISMATCH` | The property is not linked to *this* type — a distinct code from `UNKNOWN_PROPERTY` by design |
| Fields render but nothing changes in the render | Step 5 — nothing consumes the values, or the name does not match what the engine expects |
| A second card of the same type cannot be added | Correct — `UNIQUE(material_group_id, material_type_id)`. One member per type per group |
| Rendering type is polluting the model list | Step 2 — you added a `model_type` row you should not have |
| Colour/texture fields expected but absent | Correct since migration 024 — the Visualiser owns them |
| Migration fails mid-file | A semicolon inside a statement, or a trailing `--` comment on a code line |

## Related

- [The property system](../arch/properties.md) — catalog, validation, canonical storage.
- [Add a property to a type](add-property.md) — extending a type that already exists.
- [Materials & textures](../../concepts/materials.md) — groups, assignment, and the sync engine.
- [Database & migrations](../arch/database.md) — numbering and idempotency.
