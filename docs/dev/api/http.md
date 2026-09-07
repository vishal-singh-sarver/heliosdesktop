# Backend API — HTTP endpoints

The backend is a FastAPI app (`app/main.py`) exposing roughly **130 endpoints** across 20 routers.
It listens on `127.0.0.1` at the port the Electron main process chose — 8008 unless it was busy.

!!! tip "The live schema is always correct"
    While the backend is running:

    - **`/docs`** — Swagger UI, interactive
    - **`/openapi.json`** — the machine-readable schema

    Prefer those over any hand-written list, including the one on this page.

## Conventions

**Every request carries a `session-id` header.** `get_session_id` rejects a missing or blank one
with **400**. Routes that operate on a loaded project also take a `project-id` header and return
**404** if that project is not in memory.

**Scoping is in the path.** Most routes are scoped to a project and scenario:

```
/api/geometry/project/{project_id}/scenario/{scenario_id}/objects
```

!!! warning "`scenario` and `scenarios` are both real, and different"
    Scenario lifecycle routes use the **plural** segment
    (`/api/project/{id}/scenarios/{sid}/init`), while weather and geometry routes use the
    **singular** (`/api/weather/project/{id}/scenario/{sid}/…`). They are not interchangeable.

**Errors** use the house shape:

```json
{ "detail": { "error": "Geometry name already exists", "code": "NAME_CONFLICT" } }
```

The renderer surfaces `error` to the user and branches on `code` — never on the English text,
which is free to be reworded. FastAPI's own validation errors arrive as the standard
`detail: [{loc, msg}]` array and are mapped to per-field errors.

**Every response carries `X-PyHelios-Stale: true`** when the native library is older than its
sources and the automatic rebuild failed.

## Routers

| Prefix | Router | Endpoints | Covers |
|---|---|---|---|
| *(none)* | `system` | 4 | `/`, `/health`, `/version`, `/api/pyhelios-info` |
| `/api/project` | `project` | 5 | Create, list recent, get, update, delete |
| `/api/project` | `scenario` | 5 | Scenario CRUD, plus `init` (SSE) and `discard` |
| `/api/geometry` | `geometry` | 12 | Live geometry in the context |
| `/api/geometry` | `scene_objects` | 24 | Persisted objects, groups, visibility, material assignment |
| `/api/geometry` | `transforms` | 4 | Translate / rotate / scale |
| `/api/objects` | `objects` | 5 | Object primitives |
| `/api/materials` | `materials` | 12 | Material types and applied materials |
| `/api/materials` | `material_library` | 15 | Global material groups, members, file uploads |
| `/api/textures` | `textures` | 2 | `serve`, `defaults` |
| `/api/weather` | `weather` | 15 | Weather tables — rows, columns, upload, clear |
| `/api/timeseries` | `timeseries` | 3 | Time-series data |
| `/api/tree` | `tree` | 3 | Weber-Penn trees |
| `/api/plantarch` | `plantarch` | 4 | Plant architecture models |
| `/api/catalog` | `catalog` | 4 | Object / material / model type catalogs |
| `/api/data-types` | `helios_data_type` | 5 | Data types with their units inline |
| `/api/data-units` | `data_unit` | 5 | Unit definitions and conversion factors |
| `/api` | `import_export` | 2 | Import and export |
| `/api/script` | `scripting` | 1 | Scripting |

The complete list of paths the renderer calls is `API_ROUTES` in
`src/renderer/src/utils/constants.ts` — a single source of truth, with scoped routes exposed as
builder functions so a caller cannot forget an id.

## System endpoints

```http
GET /health
```

```json
{
  "status": "ok",
  "version": "1.0.0",
  "env": "development",
  "pyhelios_available": true,
  "session_id": "3f2a…"
}
```

This is what the Electron main process polls during startup, every 250 ms until it answers. The
`session_id` changes on every backend restart, which is how the frontend detects that its cached
state belongs to a backend that is no longer there.

`GET /api/pyhelios-info` reports whether PyHelios is loaded from source or a pip wheel, its path,
its version, whether it is stale, and whether the PlantArchitecture plugin is available.

## Scenario init is Server-Sent Events

```http
POST /api/project/{project_id}/scenarios/{scenario_id}/init
```

This is the one slow call. It creates the scenario's PyHelios context and rebuilds the saved scene
into memory, streaming progress as SSE. Every other scenario-scoped call is fast once it has
finished — which is why the boot saga runs it first and alone.

`POST …/discard` autosaves and releases the context. See
[The Helios context](../../concepts/context.md).

## Timeouts

The renderer sets **none**, deliberately — saving a high-resolution textured geometry legitimately
runs for minutes. See [State management](../arch/state.md#http).

## Making this page generated

!!! note "Planned"
    Hand-written endpoint documentation for 130 endpoints across 20 routers would go stale within
    a sprint. The plan is to generate it at docs build time:

    1. Boot the app and dump `openapi.json`.
    2. Render it into this page (`neoteroi-mkdocs`, or an embedded Redoc/Swagger page).
    3. Run the dump in CI so the page can never drift from the code.

    Until then, use `/docs` on a running backend.
