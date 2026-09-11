<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `project` endpoints

*Generated 2026-09-11.*

5 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `POST /api/project/create` {#op-post-api-project-create}

Create Project

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "name": "Ground.001",
  "latitude": 0.0,
  "longitude": 0.0
}
```

Fields — [`ProjectCreateRequest`](#projectcreaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |
| `latitude` | number | **yes** |  |  |
| `longitude` | number | **yes** |  |  |

**Response** — `201`, `application/json`

```json
{
  "success": true,
  "project_id": "p_8f3a2c",
  "main_scenario_id": "s_41bd90",
  "name": "My Project",
  "latitude": 38.5,
  "longitude": -121.7,
  "utc_offset": "-08:00",
  "session_id": "3f2a9c14e8b0"
}
```

Every project is created with a `main` scenario.

*Built by `project_service.create_project`.*

---

### `GET /api/project/recent` {#op-get-api-project-recent}

List Recent Projects

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "projects": [
    {
      "id": "p_8f3a2c",
      "name": "My Project",
      "latitude": 38.5,
      "longitude": -121.7,
      "utc_offset": "-08:00",
      "created_at": "2026-01-31 09:00:00",
      "updated_at": "2026-01-31 09:30:00"
    }
  ]
}
```

*Built by `project_service.list_recent_projects`.*

---

### `DELETE /api/project/{project_id}` {#op-delete-api-project-project-id}

Delete Project

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "project_id": "p_8f3a2c"
}
```

*Built by `project_service.delete_project`.*

---

### `GET /api/project/{project_id}` {#op-get-api-project-project-id}

Project + its scenarios + each scenario's weather_data_headers.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "project": {
    "id": "p_8f3a2c",
    "name": "My Project",
    "latitude": 38.5,
    "longitude": -121.7,
    "utc_offset": "-08:00",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:30:00",
    "scenarios": [
      {
        "id": "s_41bd90",
        "name": "main",
        "has_weather": true,
        "weather_data_headers": [
          {
            "id": 5,
            "scenario_id": "s_41bd90",
            "name": "Tair",
            "helios_data_type_id": 2,
            "unit_id": 4,
            "status": true,
            "display_order": 1,
            "created_at": "2026-01-31 09:00:00",
            "updated_at": "2026-01-31 09:00:00"
          }
        ]
      }
    ]
  }
}
```

The boot saga's first call — it is what tells the app which scenario to initialise.

*Built by `project_service.get_project_with_scenarios`.*

---

### `PATCH /api/project/{project_id}` {#op-patch-api-project-project-id}

Partial update of a project. Editable: name, latitude, longitude.
When latitude or longitude changes, utc_offset is recomputed.

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
  "latitude": 0.0,
  "longitude": 0.0
}
```

Fields — [`ProjectUpdateRequest`](#projectupdaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `latitude` | number \| null | no |  |  |
| `longitude` | number \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "project": {
    "id": "p_8f3a2c",
    "name": "Renamed",
    "latitude": 38.5,
    "longitude": -121.7,
    "utc_offset": "-08:00",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:45:00"
  }
}
```

*Built by `project_service.update_project`.*

---

## Schemas

### `ProjectCreateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |
| `latitude` | number | **yes** |  |  |
| `longitude` | number | **yes** |  |  |

### `ProjectUpdateRequest`

Partial-update payload for PATCH /api/project/{id}. All fields
optional — an unset field means leave unchanged.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `latitude` | number \| null | no |  |  |
| `longitude` | number \| null | no |  |  |

