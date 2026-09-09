# Add a migration

Every schema and seed change goes through a numbered `.sql` file in
`helios-desktop-backend/app/db/migrations/`, applied at startup by `run_migrations()`.

There are 32 of them today. Most of what looks like application behaviour — object types,
material properties, ranges, units, form grouping — is seeded by these files. See
[The property system](../arch/properties.md).

---

## Step 1 — Pick a free number

```bash
ls helios-desktop-backend/app/db/migrations/ | tail -5
```

The version is the integer prefix: `031_radiation_spectrum_labels.sql` → `31`.

!!! danger "Check the number is genuinely free — two files share 031 today"
    `031_photosynthesis_submodel_selector.sql` and `031_radiation_spectrum_labels.sql` both parse
    as version 31.

    On a **fresh** database both run: `applied` is read once *before* the loop and never updated
    inside it, so neither short-circuits the other, and the second stamp is an
    `INSERT OR IGNORE` no-op. That is why this has not caused visible damage — this machine has
    both, confirmed by the presence of `visibility='superseded'` rows.

    But on a database where **31 was already stamped**, `if version in applied: continue` skips
    *both* files. Ship a second file at an existing number and every machine that already had the
    first will **silently never run yours**. There is no error and no log line.

    Take the next free number. Do not reuse.

If you must jump a number, say why in the header — migration 026 does:

> *"Numbered 026, not 024: migrations 024/025 (visualiser material type) are in flight on
> feature/material-type-response and are not on M2 yet."*

Name the file `NNN_snake_case_description.sql`.

---

## Step 2 — Write the header

Every migration in this project opens with a comment block explaining **what changes and why**.
That is the house style and it has repeatedly been the only record of a decision.

```sql
-- Migration 032 — SOIL MOISTURE material type.
--
-- Story: <the user-facing reason this exists>.
--
-- Changes:
--   (a) INSERT the Soil Moisture material_type.
--   (b) INSERT two new property_type rows.
--   (c) Map them onto the type, display_order 1-2.
--
-- Additive only — no schema change. Idempotent: INSERT OR IGNORE throughout,
-- safe to re-run.
```

`022_material_groups.sql` and `024_visualiser_material_type.sql` are the reference examples.

---

## Step 3 — Write idempotent statements

Assume your migration will run twice. It should be a no-op the second time.

| Statement | Idempotent form |
|---|---|
| Create a table or index | `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` |
| Seed a row | `INSERT OR IGNORE` — relies on a `UNIQUE` constraint |
| Insert where uniqueness is a `COLLATE NOCASE` index | `INSERT … SELECT … WHERE NOT EXISTS (…)` |
| Change a value | A deterministic `UPDATE` |
| Add a column | Plain `ALTER TABLE ADD COLUMN` — the runner tolerates a re-run |

Look up ids by name in subqueries. **Never hardcode an integer id** — they differ between
databases:

```sql
INSERT OR IGNORE INTO material_property_type (material_type_id, property_type_id, display_order)
SELECT (SELECT id FROM material_type WHERE materialtype = 'Soil Moisture'), pt.id, m.ord
FROM m JOIN property_type pt ON pt.property = m.prop;
```

### The runner already forgives two errors

`_ALREADY_APPLIED_ERRORS` treats these as no-ops and still stamps the version, so a database whose
schema is ahead of its recorded versions rolls forward instead of crashing:

| SQLite error | From |
|---|---|
| `duplicate column name` | `ALTER TABLE … ADD COLUMN` |
| `already exists` | `CREATE TABLE` / `INDEX` / `TRIGGER` |

Anything else raises and fails startup with exit code **10**.

---

## Step 4 — Respect the file parser

`_split_statements()` strips full-line `--` comments, then splits on `;`. That is the whole
parser, and it constrains what you can write:

!!! danger "Three hard rules"
    - **No semicolon inside a statement** — not in a string literal, not anywhere.
    - **No trailing comments on a code line.** Only whole-line `--` comments are stripped.
    - **No triggers.** Their bodies contain semicolons.

Each migration file runs inside **one transaction** (`with engine.begin()`), independent of the
next.

---

## Step 5 — Does it need a probe?

Only for a **destructive rebuild** — the create-new / copy / drop / rename pattern.

Re-running one of those on a database that already has the finished shape is not a harmless
no-op; it is damage. Three migrations already carry probes in `run_migrations()`:

| Version | Probe | Damage avoided |
|---|---|---|
| 010 | `projects.utc_offset` is already `TEXT` | Re-converting `REAL → TEXT` mangles half-hour offsets (`+05:30 → +05:00`) |
| 019 | `project_material.project_id` nullable **or** `material_group_id` present | The rebuild DROPs the table, firing `ON DELETE CASCADE` |
| 022 | `project_material.material_group_id` present | Re-running crashes on a column that no longer exists |

If your migration rebuilds a table, add a probe alongside those in `app/db/database.py`: detect
the finished state, stamp the version, and skip.

!!! note "Probes can need more than one condition"
    The 019 probe checks two, because the schema has three eras: post-022 the `project_id` column
    is gone entirely, so the nullable check returns `None`. Without the `material_group_id`
    fallback, 019 would re-run and crash-loop at startup.

**Prefer additive migrations.** Every migration since 022 has been additive precisely to avoid
this.

---

## Step 6 — Update the ORM

`app/db/models.py` — add or adjust the SQLAlchemy model so it matches. The migration changes the
database; the model is how the code sees it. They drift silently.

---

## Optional — the self-registration line

Several migrations end with:

```sql
INSERT OR IGNORE INTO schema_migrations(version) VALUES (31);
```

This is **redundant** — the runner stamps the version centrally after applying each file — but it
is harmless and it is the local convention in the later files. Match the neighbours.

---

## Verify

1. Restart the backend and watch for `[db] applied migration 0NN_….sql`.
2. **Run it twice.** Restart again; it must be skipped cleanly with no errors.
3. Query the result:
   ```bash
   sqlite3 "$HOME/Library/Application Support/Helios/backend-data/heliosgui.db" \
     "SELECT MAX(version) FROM schema_migrations;"
   ```
4. Test on a **fresh** database too — delete `backend-data/` (or point `HELIOS_DATA_DIR` at a temp
   directory) and confirm a from-scratch run works. Fresh and upgrade paths fail differently.
5. Check the API surface the change feeds — `/api/catalog/...` for catalog changes.

---

## There is no way back

!!! warning "Migrations are forward-only"
    There is no down-migration mechanism and no rollback path. A released migration is permanent;
    correcting it means writing another one.

    Migration 026 is the pattern: a one-digit typo in 017 (`272` instead of `273`) was fixed by a
    new migration nine versions later, not by editing 017.

**Never edit a migration that has shipped.** Any database that already stamped its version will
never re-run it, so your edit reaches new installs only — and the two populations diverge
permanently.

---

## Common mistakes

| Symptom | Cause |
|---|---|
| Migration never runs on a colleague's machine | Reused an existing number — see step 1 |
| Startup fails, exit code 10 | A statement raised something outside the tolerated pair |
| Startup fails, exit code 14 | Not your migration — the PyInstaller bundle is missing the migrations folder |
| Fails partway through the file | A semicolon inside a statement, or a trailing `--` comment |
| Works on your machine, not on a fresh install | Depends on data an earlier local run created — test on an empty DB |
| Works fresh, fails on upgrade | Assumed a table shape only a fresh install has |
| Crash-loop at startup after a rebuild migration | Needs a probe — step 5 |
| Data silently wrong after an upgrade | A destructive rebuild re-ran. Probe it |
| Code can't see the new column | Step 6 — `models.py` not updated |
| Ids resolve to the wrong rows | Hardcoded integer ids instead of name subqueries |

## Related

- [Database & migrations](../arch/database.md) — the runner in detail.
- [The property system](../arch/properties.md) — what most migrations are actually seeding.
- [Add a property to a type](add-property.md), [Add an object type](add-object-type.md),
  [Add a material type](add-material-type.md) — the recipes that produce migrations.
