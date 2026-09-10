<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `catalog` endpoints

*Generated 2026-09-10.*

10 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

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

### `GET /api/data-units/` {#op-get-api-data-units}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

List Data Units

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `data_type_id` | query | integer \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "data_units": [
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
```

*Built by `data_unit_service.list_data_units`.*

---

### `POST /api/data-units/` {#op-post-api-data-units}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Create Data Unit

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "unit": "Celsius",
  "alias": "string",
  "data_type_id": 1,
  "min": 0.0,
  "max": 0.0,
  "to_base_factor": 1.0,
  "to_base_offset": 0.0,
  "is_base": false
}
```

Fields — [`DataUnitCreateRequest`](#dataunitcreaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `unit` | string | **yes** |  |  |
| `alias` | string \| null | no |  |  |
| `data_type_id` | integer | **yes** |  |  |
| `min` | number \| null | no |  |  |
| `max` | number \| null | no |  |  |
| `to_base_factor` | number | no | `1.0` |  |
| `to_base_offset` | number | no | `0.0` |  |
| `is_base` | boolean | no | `false` |  |

**Response** — `201`, `application/json`

```json
{
  "success": true,
  "data_unit": {
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
}
```

*Built by `data_unit_service.create_data_unit`.*

---

### `DELETE /api/data-units/{data_unit_id}` {#op-delete-api-data-units-data-unit-id}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Delete Data Unit

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `data_unit_id` | path | integer | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "data_unit_id": 4
}
```

*Built by `data_unit_service.delete_data_unit`.*

---

### `GET /api/data-units/{data_unit_id}` {#op-get-api-data-units-data-unit-id}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Data Unit

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `data_unit_id` | path | integer | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "data_unit": {
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
}
```

*Built by `data_unit_service.get_data_unit`.*

---

### `PATCH /api/data-units/{data_unit_id}` {#op-patch-api-data-units-data-unit-id}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Update Data Unit

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `data_unit_id` | path | integer | **yes** |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "unit": "Celsius",
  "alias": "string",
  "min": 0.0,
  "max": 0.0,
  "to_base_factor": 0.0,
  "to_base_offset": 0.0,
  "is_base": true
}
```

Fields — [`DataUnitUpdateRequest`](#dataunitupdaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `unit` | string \| null | no |  |  |
| `alias` | string \| null | no |  |  |
| `min` | number \| null | no |  |  |
| `max` | number \| null | no |  |  |
| `to_base_factor` | number \| null | no |  |  |
| `to_base_offset` | number \| null | no |  |  |
| `is_base` | boolean \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "data_unit": {
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
}
```

*Built by `data_unit_service.update_data_unit`.*

---

## Schemas

### `DataUnitCreateRequest`

POST /api/data-units

Conversion fields (`to_base_factor`, `to_base_offset`, `is_base`) describe
the affine map back to the data type's canonical unit:
    value_in_base = value * to_base_factor + to_base_offset
Only one unit per data_type may have is_base=True (enforced by a
partial unique index in migration 009).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `unit` | string | **yes** |  |  |
| `alias` | string \| null | no |  |  |
| `data_type_id` | integer | **yes** |  |  |
| `min` | number \| null | no |  |  |
| `max` | number \| null | no |  |  |
| `to_base_factor` | number | no | `1.0` |  |
| `to_base_offset` | number | no | `0.0` |  |
| `is_base` | boolean | no | `false` |  |

### `DataUnitUpdateRequest`

PATCH /api/data-units/{id} — partial update.

`data_type_id` is intentionally absent: a unit's parent type is immutable.

The bounds validator mirrors the one on Create — required by the doc's
test list (Section 8: "PATCH min > max -> 422"). Without it, a PATCH that
inverts min/max would succeed silently.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `unit` | string \| null | no |  |  |
| `alias` | string \| null | no |  |  |
| `min` | number \| null | no |  |  |
| `max` | number \| null | no |  |  |
| `to_base_factor` | number \| null | no |  |  |
| `to_base_offset` | number \| null | no |  |  |
| `is_base` | boolean \| null | no |  |  |

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

