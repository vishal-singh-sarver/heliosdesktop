<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `scripting` endpoints

*Generated 2026-09-10.*

1 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `POST /api/script/execute` {#op-post-api-script-execute}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Execute Script

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "code": "string",
  "timeout": 30.0
}
```

Fields — [`ScriptExecuteRequest`](#scriptexecuterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `code` | string | **yes** |  |  |
| `timeout` | number | no | `30.0` |  |

**Response** — `200`, `application/json`

```json
{
  "stdout": "",
  "stderr": "",
  "error": null,
  "duration": 0.42,
  "new_object": null,
  "deleted_uuids": []
}
```

*Built by `scripting_service.execute_script`.*

---

## Schemas

### `ScriptExecuteRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `code` | string | **yes** |  |  |
| `timeout` | number | no | `30.0` |  |

