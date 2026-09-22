# Error & exit codes

Two independent code systems: **API error codes** returned in a response body, and **process exit
codes** the backend dies with.

---

## API error codes

Every deliberate backend error uses the house shape:

```json
{ "detail": { "error": "Geometry name already exists", "code": "GEOMETRY_NAME_EXISTS" } }
```

!!! important "Branch on `code`, never on `error`"
    The English message is free to be reworded at any time. The code is the contract. The
    renderer surfaces `error` to the user and switches on `code`.

FastAPI's own validation failures arrive in the standard `detail: [{loc, msg}]` shape instead, and
`utils/api.ts` maps those to per-field errors.

There are **40** codes. Grouped by what they mean:

### Scope — the thing you named does not exist

| Status | Code |
|---|---|
| 404 | `PROJECT_NOT_FOUND` |
| 404 | `SCENARIO_NOT_FOUND` |
| 404 | `GEOMETRY_NOT_FOUND` |
| 404 | `GROUP_NOT_FOUND` |
| 404 | `OBJECT_TYPE_NOT_FOUND` |
| 404 | `MATERIAL_TYPE_NOT_FOUND` |
| 404 | `MATERIAL_GROUP_NOT_FOUND` |
| 404 | `MATERIAL_TYPE_NOT_IN_GROUP` |
| 404 | `MODEL_TYPE_NOT_FOUND` |
| 404 | `ASSIGNMENT_NOT_FOUND` |
| 404 | `FILE_NOT_FOUND` |

!!! warning "Two of these drive a blocking dialog"
    `PROJECT_NOT_FOUND` and `SCENARIO_NOT_FOUND` — and **any 404 carrying no code at all** — are
    read by `utils/scopeError.ts` as "the project or scenario on screen is gone", usually because
    it was deleted in the other window. It latches on the first such failure and raises one
    dialog rather than ten.

    An endpoint that can 404 about something *inside* a healthy scenario must opt out with
    `{ skipScopeCheck: true }` — and then handle the error itself. See
    [Add an API endpoint](../dev/recipes/add-endpoint.md).

### Property validation

All from the EAV layer — see [The property system](../dev/arch/properties.md).

| Status | Code | Meaning |
|---|---|---|
| 400 | `UNKNOWN_PROPERTY` | Not a property of this object type |
| 400 | `MATERIAL_TYPE_MISMATCH` | Not a property of this **material** type — a separate code by design |
| 400 | `DATATYPE_MISMATCH` | Wrong JSON type |
| 400 | `MISSING_REQUIRED_PROPERTY` | Required property absent or cleared |
| 400 | `VALUE_OUT_OF_RANGE` | Outside min/max; the message quotes both bounds |
| 400 | `ENUM_INVALID_OPTION` | Not a token in `enum_values` |
| 400 | `TOO_MANY_DECIMALS` | More than 7 decimal places — rejected, not rounded |
| 400 | `INVALID_NUMBER` | Non-finite or unrepresentable |
| 500 | `UNKNOWN_DATATYPE` | The catalog names a datatype the code cannot handle |

### Names

| Status | Code |
|---|---|
| 400 | `NAME_REQUIRED` |
| 400 | `NAME_TOO_LONG` — 20 characters maximum |
| 400 | `NAME_INVALID` — contains control characters |
| 409 | `GEOMETRY_NAME_EXISTS` |
| 409 | `GROUP_NAME_EXISTS` |
| 409 | `MATERIAL_GROUP_NAME_EXISTS` |

### Materials & assignment

| Status | Code | Meaning |
|---|---|---|
| 409 | `MATERIAL_GROUP_ALREADY_ASSIGNED` | This group is already on this geometry |
| 409 | `DUPLICATE_MATERIAL_TYPE_ASSIGNMENT` | Another assigned group already carries this material type |
| 400 / 409 | `DUPLICATE_MATERIAL_TYPE_IN_GROUP` | One member per material type per group |
| 400 | `CANNOT_EDIT_SYNCED` | The assignment is synced to the library |
| 400 | `GROUP_MIN_MEMBERS` | A group cannot go below its minimum |
| 500 | `MATERIAL_CREATE_FAILED` | |

### Files

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_FILE_FORMAT` | |
| 400 | `INVALID_PATH` | |
| 409 | `FILE_IN_USE` | A material or a frozen snapshot still references it — save first, then delete |

### Visibility & build

| Status | Code | Meaning |
|---|---|---|
| 400 | `NO_VISIBILITY_FIELDS` | An empty visibility object |
| 400 | `VISUALISER_MODE_CONFLICT` | A colour field in texture mode, or vice versa |
| 422 | `RESOLUTION_TOO_HIGH` | Above the ground texture's pixel cap. **The one build failure a user can act on** |
| 500 | `BUILD_FAILED` | The engine refused the geometry |
| 503 | `PYHELIOS_UNAVAILABLE` | The native library did not load — geometry endpoints are down |

---

## Backend exit codes

When startup fails, the backend logs one structured line and exits with a **distinct code**, so
the Electron manager can show a targeted remedy instead of a generic failure:

```
[startup-fatal] code=12 step=migrations reason='database is locked: ...' remedy='...'
```

| Code | Step | Meaning | Remedy shown to the user |
|---|---|---|---|
| **10** | migrations | Migration failed for some other reason | Restart; if it persists, send `backend.log` |
| **11** | data-dir | Cannot create or write the data directory | Check folder permissions |
| **12** | migrations | The database file is locked | Another copy of Helios may be running — close all windows |
| **13** | migrations | The database is malformed | Restart; if it persists, reset Helios data |
| **14** | migrations | The packaged bundle is incomplete (no migrations folder) | Reinstall Helios |

!!! note "Why `os._exit`"
    `_abort()` uses `os._exit` so the exact code reaches the parent process. A `SystemExit` raised
    inside the async lifespan is caught by uvicorn and re-reported as a **generic exit 3** —
    precisely what these codes exist to avoid.

Genuinely unexpected errors are deliberately **not** caught, so real bugs still fail loudly with a
traceback.

`3` on its own is uvicorn's generic failure and means the classification did not fire — treat it
as an unclassified crash and read the traceback in `backend.log`.

---

## Keeping this page honest

This list was extracted from `api_error(...)` call sites across `app/`. Regenerate it after adding
codes:

```bash
cd helios-desktop-backend
grep -rEoh 'api_error\(\s*[0-9]+,\s*"[A-Z_]+"' app/ --include="*.py" | sort -u
```

That misses calls split across lines, so prefer a small script if you automate it.

## Related

- [The property system](../dev/arch/properties.md) — where most 400s come from.
- [Backend sidecar](../dev/arch/backend.md) — what the manager does with an exit code.
- [Troubleshooting](../dev/troubleshooting.md) — symptoms and fixes.
