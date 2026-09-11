<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `catalog` endpoints

*Generated 2026-09-11.*

5 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/data-types/` {#op-get-api-data-types}

Return all data types with their data_units nested under each.

**Response** — `200`, `application/json`

```json
{
  "data_types": [
    {
      "id": 2,
      "data_type": "Temperature",
      "description": "Air or surface temperature",
      "created_at": "2026-01-31 09:00:00",
      "updated_at": "2026-01-31 09:00:00",
      "units": [
        {
          "id": 4,
          "unit": "Celsius",
          "alias": "C",
          "data_type_id": 2,
          "min": -90,
          "max": 60,
          "to_base_factor": 1.0,
          "to_base_offset": 273.15,
          "is_base": false,
          "created_at": "2026-01-31 09:00:00",
          "updated_at": "2026-01-31 09:00:00"
        }
      ]
    }
  ]
}
```

*Built by `data_type_service.list_data_types`.*

---

### `POST /api/data-types/` {#op-post-api-data-types}

Create Data Type

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "data_type": "string",
  "description": "string"
}
```

Fields — [`HeliosDataTypeCreateRequest`](#heliosdatatypecreaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `data_type` | string | **yes** |  |  |
| `description` | string \| null | no |  |  |

**Response** — `201`, `application/json`

```json
{
  "success": true,
  "data_type": {
    "id": 9,
    "data_type": "Soil moisture",
    "description": null,
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00"
  }
}
```

*Built by `data_type_service.create_data_type`.*

---

### `DELETE /api/data-types/{data_type_id}` {#op-delete-api-data-types-data-type-id}

Delete Data Type

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `data_type_id` | path | integer | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "data_type_id": 9
}
```

*Built by `data_type_service.delete_data_type`.*

---

### `GET /api/data-types/{data_type_id}` {#op-get-api-data-types-data-type-id}

Get Data Type

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `data_type_id` | path | integer | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "data_type": {
    "id": 2,
    "data_type": "Temperature",
    "description": null,
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00"
  }
}
```

*Built by `data_type_service.get_data_type`.*

---

### `PATCH /api/data-types/{data_type_id}` {#op-patch-api-data-types-data-type-id}

Update Data Type

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `data_type_id` | path | integer | **yes** |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "data_type": "string",
  "description": "string"
}
```

Fields — [`HeliosDataTypeUpdateRequest`](#heliosdatatypeupdaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `data_type` | string \| null | no |  |  |
| `description` | string \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "data_type": {
    "id": 2,
    "data_type": "Temperature",
    "description": "updated",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 10:00:00"
  }
}
```

*Built by `data_type_service.update_data_type`.*

---

## Schemas

### `HeliosDataTypeCreateRequest`

POST /api/data-types

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `data_type` | string | **yes** |  |  |
| `description` | string \| null | no |  |  |

### `HeliosDataTypeUpdateRequest`

PATCH /api/data-types/{id} — partial update.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `data_type` | string \| null | no |  |  |
| `description` | string \| null | no |  |  |

