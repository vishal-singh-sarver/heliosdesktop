<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `transforms` endpoints

*Generated 2026-09-11.*

4 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/geometry/object/{object_id}/centroid` {#op-get-api-geometry-object-object-id-centroid}

Get Object Centroid

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "centroid": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  }
}
```

*Built by `transform_service.get_object_centroid`.*

---

### `POST /api/geometry/rotate` {#op-post-api-geometry-rotate}

Rotate Object

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "object_id": 1,
  "angle": 0.0,
  "axis": "string",
  "primitive_uuids": [
    0
  ]
}
```

Fields — [`RotateRequest`](#rotaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `object_id` | integer | **yes** |  |  |
| `angle` | number | **yes** |  |  |
| `axis` | string | **yes** |  |  |
| `primitive_uuids` | integer[] \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `transform_service.rotate_object`.*

---

### `POST /api/geometry/scale` {#op-post-api-geometry-scale}

Scale Object

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "object_id": 1,
  "scale": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "primitive_uuids": [
    0
  ]
}
```

Fields — [`ScaleRequest`](#scalerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `object_id` | integer | **yes** |  |  |
| `scale` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `primitive_uuids` | integer[] \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `transform_service.scale_object`.*

---

### `POST /api/geometry/translate` {#op-post-api-geometry-translate}

Translate Object

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "object_id": 1,
  "shift": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "primitive_uuids": [
    0
  ]
}
```

Fields — [`TranslateRequest`](#translaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `object_id` | integer | **yes** |  |  |
| `shift` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `primitive_uuids` | integer[] \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `transform_service.translate_object`.*

---

## Schemas

### `RotateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `object_id` | integer | **yes** |  |  |
| `angle` | number | **yes** |  |  |
| `axis` | string | **yes** |  |  |
| `primitive_uuids` | integer[] \| null | no |  |  |

### `ScaleRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `object_id` | integer | **yes** |  |  |
| `scale` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `primitive_uuids` | integer[] \| null | no |  |  |

### `TranslateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `object_id` | integer | **yes** |  |  |
| `shift` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `primitive_uuids` | integer[] \| null | no |  |  |

### `Vec3Model`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `x` | number | no | `0.0` |  |
| `y` | number | no | `0.0` |  |
| `z` | number | no | `0.0` |  |

