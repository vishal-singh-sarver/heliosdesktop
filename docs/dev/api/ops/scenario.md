<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `scenario` endpoints

*Generated 2026-09-10.*

5 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/project/{project_id}/scenarios` {#op-get-api-project-project-id-scenarios}

List all scenarios for this project.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "scenarios": [
    {
      "id": "s_41bd90",
      "name": "main",
      "has_weather": true,
      "created_at": "2026-01-31 09:00:00",
      "updated_at": "2026-01-31 09:30:00"
    }
  ]
}
```

*Built by `scenario_service.list_scenarios`.*

---

### `POST /api/project/{project_id}/scenarios/create` {#op-post-api-project-project-id-scenarios-create}

Create a new scenario for this project. If source_scenario_id is
provided, the new scenario is a fork — its weather CSV is copied from
the source. Otherwise the new scenario starts empty.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "name": "Ground.001",
  "source_scenario_id": "s_41bd90"
}
```

Fields — [`ScenarioCreateRequest`](#scenariocreaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |
| `source_scenario_id` | string \| null | no |  |  |

**Response** — `201`, `application/json`

```json
{
  "success": true,
  "scenario_id": "s_9c22ef",
  "name": "high-res"
}
```

*Built by `scenario_service.create_scenario`.*

---

### `DELETE /api/project/{project_id}/scenarios/{scenario_id}` {#op-delete-api-project-project-id-scenarios-scenario-id}

Delete a scenario: DB row, in-memory context, and on-disk folder.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "scenario_id": "s_9c22ef"
}
```

*Built by `scenario_service.delete_scenario`.*

---

### `POST /api/project/{project_id}/scenarios/{scenario_id}/discard` {#op-post-api-project-project-id-scenarios-scenario-id-discard}

Autosave this scenario's context, then release it from memory.

Call when the user switches away. Idempotent — discarding a scenario with no
live context succeeds with discarded=false.

`?save=false` is the CANCEL path. A load the user walked away from leaves a
half-hydrated context; saving that would overwrite the scenario's real
context.xml and rotate the good copy into archives, so cancelling a load
would corrupt the saved scene. Because the only release available always
wrote, the client could not free a cancelled load at all and its memory
stayed resident. Nothing is lost by skipping the write: geometry lives in
the DB, and a half-hydrated context holds nothing the DB does not.

Run off the event loop: the autosave inside serialises the whole scene via
PyHelios and gzips the previous snapshot, both blocking. Called directly from
an `async def` it froze the entire backend for the duration — every request,
not just this one. /init suffered worst: its work runs in an executor thread
and keeps going, but the coroutine that DELIVERS its progress events is on
the loop, so nothing reached the browser until the freeze ended and then the
whole queue drained at once — the client saw no loading, then an immediate
"Scenario ready". Same treatment /init and the geometry routes already get.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `save` | query | boolean | no | false = release WITHOUT writing context.xml |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "scenario_id": "s_41bd90",
  "discarded": true,
  "saved": true
}
```

`discarded` is false when no live context existed — the call is idempotent. `?save=false` releases WITHOUT writing context.xml.

*Built by `scenario_service.discard_scenario`.*

---

### `GET /api/project/{project_id}/scenarios/{scenario_id}/init` {#op-get-api-project-project-id-scenarios-scenario-id-init}

Create + hydrate this scenario's context, streaming progress as SSE.

NOTE: this is the ONE endpoint that takes session_id as a QUERY PARAM rather
than the `session-id` header every other route uses — the browser's
EventSource API cannot set request headers. Everything else, including
/discard below, keeps the header convention.

Emits {"stage", "progress", "message"} events and terminates on either
{"stage": "done"} or {"error": ...}. `done` means hydration finished, so
every other scenario-scoped endpoint is safe to call.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session_id` | query | string | **yes** | session id (EventSource cannot set headers) |

**Response** — `200`, `text/event-stream`

Server-Sent Events. Each event is `data: {"stage": "...", "progress": 0-100, "message": "..."}`,
terminating on `{"stage": "done"}` or `{"error": "..."}`.

```
data: {"stage": "context", "progress": 10, "message": "Loading scene"}

data: {"stage": "hydrate", "progress": 60, "message": "Building 3 objects"}

data: {"stage": "done", "progress": 100}

```

`done` means hydration finished, so every other scenario-scoped endpoint is now safe to call.

*Built by `scenario_service.init_scenario`.*

---

## Schemas

### `ScenarioCreateRequest`

POST /api/project/{project_id}/scenarios/create.

- name: required user-given label. Non-empty, <=30 chars, unique per project.
- source_scenario_id: optional. If given, the new scenario is a fork —
  its weather CSV is copied from the source. If omitted, the new
  scenario starts empty.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |
| `source_scenario_id` | string \| null | no |  |  |

