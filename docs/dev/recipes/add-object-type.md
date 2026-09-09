# Add an object type

Add a new kind of scene object — a Canopy, a Tree, a Building — alongside `Ground`.

**Five touch points, three languages, two git repositories.** Most of the work is a migration.

!!! danger "Four of the five fail silently"
    Miss the migration and you get a loud 404. Miss any of the other four and there is **no error
    at all** — the type just does not appear, or appears with no way to create it, or creates a
    database row with no geometry. [Common mistakes](#common-mistakes) maps each symptom back to
    its step.

## Before you start

- Read [The property system](../arch/properties.md). This recipe assumes you know that object
  types and their properties are catalog rows.
- Read [Database & migrations](../arch/database.md) for the migration rules.
- Have the app running (`npm run dev`) so you can verify as you go.

Decide two things up front:

1. **Which properties it has.** Reuse existing `property_type` rows where the meaning is identical
   — `position_x` means the same thing on any object.
2. **How PyHelios builds it.** A Ground is a `TileObject`. Your type needs an engine call that
   exists.

---

## Step 1 — The migration

In the **backend submodule**: `helios-desktop-backend/app/db/migrations/0NN_add_canopy_type.sql`,
using the next free number.

### 1a. The type itself

```sql
INSERT OR IGNORE INTO object_types (object) VALUES ('Canopy');
```

### 1b. Any properties that do not exist yet

`property_type` is a **globally unique shared pool** — check before adding. If `height` already
exists with the meaning you want, skip to 1c and just link it.

```sql
WITH p(property, description, dt, mn, mx) AS (VALUES
    ('canopy_height',  'Canopy height in meters',        'float',   0.01, 100),
    ('leaf_count',     'Number of leaves per plant',     'integer', 1,    100000)
)
INSERT OR IGNORE INTO property_type (property, description, datatype_id, min, max)
SELECT p.property, p.description,
       (SELECT d.id FROM datatype d WHERE d.name = p.dt),
       p.mn, p.mx
FROM p;
```

For an enum, supply `enum_values` as a JSON array instead of min/max:

```sql
INSERT OR IGNORE INTO property_type (property, description, datatype_id, enum_values) VALUES
    ('canopy_shape', 'Canopy shape model',
        (SELECT id FROM datatype WHERE name = 'enum'),
        '["Spherical", "Conical", "Cylindrical"]');
```

### 1c. Link the properties to the type

`display_order` is the order the catalog returns them in, and the order they render if you skip
step 3.

```sql
WITH g(prop, ord) AS (VALUES
    ('canopy_height', 1), ('leaf_count', 2),
    ('position_x', 3), ('position_y', 4), ('position_z', 5)
)
INSERT OR IGNORE INTO object_property_type (object_type_id, property_type_id, display_order)
SELECT (SELECT id FROM object_types WHERE object = 'Canopy'), pt.id, g.ord
FROM g JOIN property_type pt ON pt.property = g.prop;
```

Add `min_override` / `max_override` columns to the insert if this type needs a **narrower** range
than the shared property's default.

!!! tip "Follow the house style"
    Every seed in migration 017 uses this `WITH … AS (VALUES …)` + `JOIN property_type` shape, and
    `INSERT OR IGNORE` throughout, so a re-run is a no-op. Copy it rather than writing bare
    `INSERT`s with hardcoded ids — ids differ between databases.

**Verify:** restart the app and check the catalog:

```bash
curl -s localhost:8008/api/catalog/object-types | python3 -m json.tool
```

Your type should appear with its properties in `display_order`.

---

## Step 2 — Required properties

`helios-desktop-backend/app/services/eav_validation.py`

There is **no `required` column** in the catalog. This dict is the single source for both the
catalog response and create-time validation.

```python
REQUIRED_OBJECT_PROPERTIES = {
    "Ground": {...},
    "Canopy": {"canopy_height", "leaf_count",
               "position_x", "position_y", "position_z"},
}
```

The key must match `object_types.object` **exactly**.

!!! warning "Omitting this is silent"
    A type with no entry requires nothing. The form will happily submit empty, and you will store
    an object with no dimensions.

If your type needs a rule spanning two properties — Ground's `texture_x ≤ resolution_x` is the
existing example — add it to `validate_cross_field()` in the same file, keyed on the object-type
name.

**Verify:** `POST` a create with a required property missing; expect **400**
`MISSING_REQUIRED_PROPERTY`.

---

## Step 3 — The form blueprint

`src/renderer/src/containers/Geometry/propertyBlueprint.ts`

The catalog gives a flat, ordered list — enough to validate, not enough to lay out. The blueprint
adds headings, short labels, fields-per-row, and the seed values a new object opens with.

```ts
export const CANOPY_FORM_BLUEPRINT: ObjectFormBlueprint = [
  {
    heading: 'Canopy',
    columns: 2,
    fields: [
      { property: 'canopy_height', label: 'Height', defaultValue: '2' },
      { property: 'leaf_count', label: 'Leaves', defaultValue: '100' }
    ]
  },
  {
    heading: 'Position',
    columns: 3,
    fields: [
      { property: 'position_x', label: 'X', defaultValue: '0' },
      { property: 'position_y', label: 'Y', defaultValue: '0' },
      { property: 'position_z', label: 'Z', defaultValue: '0' }
    ]
  }
]

export const OBJECT_FORM_BLUEPRINTS: Record<string, ObjectFormBlueprint> = {
  Ground: GROUND_FORM_BLUEPRINT,
  Canopy: CANOPY_FORM_BLUEPRINT      // ← keyed by the catalog `object` name
}
```

!!! note "This step is optional — and degrades safely"
    `resolveObjectForm` joins blueprint against catalog and tolerates gaps in both directions:

    | Situation | Result |
    |---|---|
    | Blueprint names a property the catalog lacks | Field skipped |
    | Catalog property the blueprint misses | Rendered anyway, in a trailing 2-column group, label humanized (`canopy_height` → "Canopy Height"), in catalog order |

    So skipping this step costs you **layout and seed values**, not the fields. `defaultValue` is
    the real loss: without it the create form opens blank and the user must type every value.

**Verify:** the right panel shows your groups and headings, pre-filled with the defaults.

---

## Step 4 — The build path

`helios-desktop-backend/app/services/scene_object_service.py` → `_build()`

This is where the object becomes real geometry. **Today it is hardcoded to Ground:**

> *"Geometry is ALWAYS a TileObject (decision #1) — even untextured — so a stable `ctx_object_id`
> exists for in-place edits."*

`_build` reads the intrinsic properties, resolves the winning material surface, calls
`ctx.addTileObject(...)`, captures the compound-object id, and tags it with the DB row id so
hydration can re-map it after a `loadXML`.

For a new type you need a branch on `so.object_type_id` (or the type name) that calls the right
PyHelios constructor. Preserve the contract the Ground path establishes:

- Capture a **stable `ctx_object_id`** so in-place edits work.
- Persist the primitive UUIDs onto the row.
- Tag with `ctx.setObjectDataUInt(ctx_object_id, _SO_ID_TAG, so.id)` — object data survives a
  `loadXML`, object ids and UUIDs do not.
- On engine failure leave the row consistent (`helios_uuids=[]`, `ctx_object_id=None`) and raise
  `BUILD_FAILED`; the caller compensates.

!!! danger "Skipping this step creates a ghost"
    Without a branch, your type is created as a database row and builds a **Ground tile** from
    properties that probably do not exist — or fails and is rolled back. There is no
    "unsupported type" error, because nothing checks.

See [Scene build & hydration](../arch/scene-build.md) for the full lifecycle, including when a
property change rebuilds the object versus patches it in place.

**Verify:** create one and confirm it appears in the viewport with a sensible primitive count in
the log line:

```
[geometry] created scenario=… object=… name='Canopy.001' N primitives
```

---

## Step 5 — The UI entry point

`src/renderer/src/containers/Geometry/index.tsx`

The buttons that create objects are **hardcoded**, not catalog-driven:

```ts
const onAddGround = (): void => {
  const ground = objectTypes.find((o) => o.object === 'Ground')
  if (!projectId || !scenarioId || !ground || writeInFlight) return
  dispatch(createObjectRequested(projectId, scenarioId, ground.id, ground.object, nextGroundName))
}

// Crop and Import-from-file are separate flows (deferred) — buttons shown,
// but only Ground actually creates for now.
const onAddCrop = (): void => {}
```

Add the equivalent handler for your type, and wire it to a button. Note the write guard: the
button is disabled while a write is in flight, the handler returns early anyway, and the saga's
`takeLeading` is the last line of defence. Keep all three.

**Verify:** click the button; an object appears in the tree with an auto-numbered name
(`Canopy.001`), and the properties form opens in the right panel.

---

## Common mistakes

| Symptom | Missed step |
|---|---|
| `404 OBJECT_TYPE_NOT_FOUND` on create | Step 1a — the type row |
| `400 UNKNOWN_PROPERTY: "… has no property catalog yet"` | Step 1c — no property links. `create_object` refuses a type with an empty catalog |
| The form submits empty and stores a dimensionless object | Step 2 — no `REQUIRED_*` entry |
| Fields render, but ungrouped with clumsy labels and no defaults | Step 3 — no blueprint |
| A field silently missing from the form | Blueprint names a property the catalog does not link |
| Object row exists but nothing in the viewport, or a Ground-shaped thing appears | Step 4 — no build branch |
| No way to create one from the UI | Step 5 — no button handler |
| Works on your machine, not a colleague's | Your migration ran only locally — make sure it is committed **in the submodule repo** |

## Remember it spans two repositories

Steps 1, 2 and 4 are in `helios-desktop-backend/`, which is a **git submodule with its own
history**. Steps 3 and 5 are in this repo. They need two commits and two merge requests, and the
submodule pointer must be updated here. See [Backend submodule](../../git-submodule-setup.md).

## A worked example already in the tree

`Crop` is seeded in `object_types` and stops there — migration 017 says so explicitly:

```sql
-- ── Seeds: object types (Crop has no property links yet — TBD) ──
```

It has no property links, no `REQUIRED_OBJECT_PROPERTIES` entry, no blueprint, no build branch,
and `onAddCrop` is an empty function. It is step 1a and nothing else — a useful thing to diff your
own work against.

## Related

- [The property system](../arch/properties.md) — the mechanism behind steps 1–3.
- [Add a property to a type](add-property.md) — when the type already exists.
- [Database & migrations](../arch/database.md) — writing the migration safely.
