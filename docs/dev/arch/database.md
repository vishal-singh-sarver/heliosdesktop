# Database & migrations

The backend persists structured data to a single **SQLite** file, `heliosgui.db`, under the data
directory the Electron main process supplies. Bulk scene data does not live here — see
[Projects & storage](../../concepts/projects.md).

## Connection

`app/db/database.py` creates one SQLAlchemy engine with two pragmas applied on every connect:

```python
PRAGMA journal_mode=WAL     # concurrent readers alongside a writer
PRAGMA foreign_keys=ON      # SQLite does NOT enforce FKs by default
```

`check_same_thread=False` is set because FastAPI serves requests on a thread pool. Routes take a
session through the `get_db` dependency, which closes it on exit.

## Tables

Roughly thirty tables in five families (`app/db/models.py`):

| Family | Tables |
|---|---|
| **Projects** | `projects`, `project_versions`, `scenarios`, `project_objects` |
| **Catalog** | `helios_data_types`, `data_units`, `datatype`, `property_type`, `object_types`, `object_property_type`, `model_type` |
| **Scene** | `object_group`, `scenario_object`, `scenario_object_model`, `scenario_model`, `object_property_data` |
| **Materials** | `material_type`, `material_property_type`, `material_group`, `project_material`, `material_data`, `object_material`, `object_material_group` |
| **Weather** | `weather_data_headers` |

A large amount of what looks like application logic is **data in the catalog tables** — which
object types exist, which properties they carry, their display order, their min/max validation
ranges, their units. Adding an object type or re-ranging a property is a migration, not a code
change.

## The migration runner

Migrations are ordered `.sql` files in `app/db/migrations/`, named `NNN_description.sql`. The
version is the integer prefix. `run_migrations()` is called once at startup from `lifespan.py`,
before anything else touches the database.

The mechanism itself is ordinary — create `schema_migrations` if absent, read applied versions,
apply each pending file **in its own transaction**, stamp the version. What is unusual is how
defensive it is, and every piece of that defensiveness is a scar.

### It fails fast on an incomplete bundle

A missing migrations folder or zero `.sql` files raises immediately.

!!! danger "The failure this prevents"
    A PyInstaller build without `--add-data app/db/migrations:app/db/migrations` silently produced
    an empty `schema_migrations` table and no real schema. The binary looked healthy right up
    until the first query crashed with `no such table: projects`. Loud at startup is far easier to
    debug than a stale binary that appears to work.

### It tolerates a schema that is ahead of its recorded versions

This is the state left by an app update, or a reinstall that kept an existing `backend-data/`
directory. Structural DDL that is already satisfied is treated as a no-op and the version is still
stamped, so the next launch skips it instead of crashing:

| SQLite error | Meaning |
|---|---|
| `duplicate column name` | `ALTER TABLE … ADD COLUMN` already applied |
| `already exists` | `CREATE TABLE` / `INDEX` / `TRIGGER` already applied |

### Three migrations are reconciled explicitly

Re-running these would be **destructive**, not merely redundant, so the runner probes for the
finished state and stamps them applied without executing:

| Version | Probe | Damage avoided |
|---|---|---|
| **010** | `projects.utc_offset` is already `TEXT` | The rebuild converts `REAL → TEXT` and would mangle half-hour offsets (`+05:30 → +05:00`) |
| **019** | `project_material.project_id` is nullable, **or** `material_group_id` exists | The rebuild DROPs the table, and its `ON DELETE CASCADE` would fire on a finished DB |
| **022** | `project_material.material_group_id` exists | Re-running crashes at the first `SELECT … project_id FROM project_material` — the column is gone |

The 019 probe checks *two* conditions because the schema has three eras. Post-022 the
`project_id` column is gone entirely, so the nullable probe returns `None`; without the
`material_group_id` fallback, 019 would re-run and crash-loop at startup.

## Adding a migration

1. Create `app/db/migrations/NNN_short_description.sql` with the next free number.
2. Write a header comment saying **what changes and why** — the existing files do, and migration
   022's header is the reference example.
3. Prefer `IF NOT EXISTS` / `INSERT OR IGNORE` so a re-run is a no-op.
4. If your migration rebuilds a table (create-new, copy, drop, rename), consider whether re-running
   it on a finished database would be destructive. If so, add a probe to `run_migrations()`
   alongside the 010/019/022 ones.
5. Update `app/db/models.py` to match.

!!! warning "There is no down-migration"
    Migrations are forward-only. There is no rollback path, so a released migration is permanent.

## Related

- [Projects & storage](../../concepts/projects.md) — what SQLite holds versus the filesystem.
- [Materials & textures](../../concepts/materials.md) — the schema migration 022 produced.
- [Backend sidecar](backend.md) — the startup exit codes migrations can produce.
