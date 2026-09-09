# Dormant surface

Code that exists, builds, and is mounted — but nothing reaches. It looks like a feature and is
not one.

This page exists so nobody spends a day extending something the UI cannot call, or debugging a
route that has never run.

!!! warning "Verified by measurement, not by reading"
    The router list below comes from counting references to each prefix across
    `src/renderer/src/`, excluding tests. A count of zero means the renderer contains no call
    site.

---

## Seven mounted routers the UI never calls

All are registered in `app/main.py` and appear in `/docs`.

| Prefix | Router | Frontend references |
|---|---|---|
| `/api/objects` | `objects` | **0** |
| `/api/tree` | `tree` | **0** |
| `/api/plantarch` | `plantarch` | **0** |
| `/api/timeseries` | `timeseries` | **0** |
| `/api/script` | `scripting` | **0** |
| `/api/data-units` | `data_unit` | **0** |
| `/api` (import/export) | `import_export` | **0** |

For contrast, the live surface:

| Prefix | References |
|---|---|
| `/api/geometry` | 23 |
| `/api/weather` | 19 |
| `/api/materials` | 12 |
| `/api/project` | 10 |
| `/api/catalog` | 9 |
| `/api/textures` | 6 |
| `/api/data-types` | 2 |

Reproduce it:

```bash
for r in /api/objects /api/tree /api/plantarch /api/timeseries /api/script /api/data-units; do
  echo "$r $(grep -rn -- "$r" src/renderer/src --include='*.ts' --include='*.tsx' \
    | grep -v '/tests/' | wc -l)"
done
```

### `import_export` is not merely unused — it would fail

`import_service.import_obj()` and `import_ply()` call:

```python
ctx = get_context()
```

The current signature is `get_context(pctx)` — it takes the project or scenario context. Calling
it with no argument raises `TypeError`, which the router turns into a **500**.

So OBJ/PLY import is dead code, not a dormant-but-working feature. Import from file is also stubbed
on the UI side: `onImportFromFile` in `containers/Geometry/index.tsx` is an empty function.

### `canopy`

`app/routers/canopy.py` exists but declares **no routes** and is not imported by `main.py`.
`canopy_service.py` (124 lines) is likewise unreferenced.

---

## Half-added things

### The `Crop` object type

Seeded in `object_types` and stopping there. Migration 017 says so in its own comment:

```sql
-- ── Seeds: object types (Crop has no property links yet — TBD) ──
```

It has no `object_property_type` links, no `REQUIRED_OBJECT_PROPERTIES` entry, no form blueprint,
no `_build` branch, and `onAddCrop` is an empty function. Creating one returns
**400 `UNKNOWN_PROPERTY`** — *"Object type Crop has no property catalog yet"*.

Useful as a diff target when following [Add an object type](../dev/recipes/add-object-type.md).

---

## A latent migration hazard

**Two migration files share version 031:**

```
031_photosynthesis_submodel_selector.sql
031_radiation_spectrum_labels.sql
```

Both parse as version `31`.

### Why it has not broken anything yet

In `run_migrations()`, `applied` is read **once before the loop** and never updated inside it. On a
fresh database neither file short-circuits the other, both run, and the second version stamp is an
`INSERT OR IGNORE` no-op.

### Why it is still a hazard

On a database where **31 was already stamped**, `if version in applied: continue` skips **both**
files. So shipping a second file at an existing number means every machine that already applied
the first will *never* run yours — with no error and no log line.

Check a given machine:

```bash
sqlite3 "$HOME/Library/Application Support/Helios/backend-data/heliosgui.db" \
  "SELECT COUNT(*) FROM material_property_type WHERE visibility='superseded';"
```

`superseded` rows are created only by `031_radiation_spectrum_labels.sql`. **`0` means that
machine missed it** — its Radiation material will still show the broadband fields that migration
supersedes, in the read-only popup on a geometry.

The fix for an affected database is a **new migration at the next free number** re-applying the
changes idempotently — never renumbering the existing file, which would re-run it on machines that
already have it.

See [Add a migration](../dev/recipes/add-migration.md).

---

## What to do with this list

Each entry is one of three things, and only the team can say which:

| | Action |
|---|---|
| **Planned** | Leave it, and say so in a comment on the router |
| **Superseded** | Delete it — `scene_objects` replaced the legacy `objects` routes, and the docstring for the v2 GPU route already calls the old one *"the never-working legacy route in objects.py"* |
| **Broken** | Fix or remove — `import_export` is here |

Dead routes are not free: they appear in `/docs`, they widen the API surface a reader has to
understand, and they are indistinguishable from working features until someone tries one.

## Related

- [Backend API](../dev/api/http.md) — the live surface.
- [Add a migration](../dev/recipes/add-migration.md) — numbering rules.
- [Add an object type](../dev/recipes/add-object-type.md) — finishing something like `Crop`.
