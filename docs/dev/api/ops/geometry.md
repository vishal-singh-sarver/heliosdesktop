<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `geometry` endpoints

*Generated 2026-09-10.*

12 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/geometry/all/binary` {#op-get-api-geometry-all-binary}

Get All Geometry Binary

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v1. See [Geometry & primitives](../../../concepts/primitives.md).

*Built by `geometry_service.get_all_geometry_binary`.*

---

### `GET /api/geometry/all/gpu` {#op-get-api-geometry-all-gpu}

Get All Geometry Gpu

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v2 (`packGPUBuffers`). See [Geometry & primitives](../../../concepts/primitives.md).

*Built by `geometry_service.get_all_geometry_gpu`.*

---

### `POST /api/geometry/binary` {#op-post-api-geometry-binary}

Get Geometry Binary Subset

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v1. See [Geometry & primitives](../../../concepts/primitives.md).

*Built by `geometry_service.get_geometry_binary_subset`.*

---

### `GET /api/geometry/count` {#op-get-api-geometry-count}

Get Geometry Count

**Response** — `200`, `application/json`

```json
{
  "count": 40000
}
```

*Built by `geometry_service.get_geometry_count`.*

---

### `POST /api/geometry/delete-batch` {#op-post-api-geometry-delete-batch}

Delete Primitives Batch

**Request body** — `application/json`

A free-form JSON object.

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `geometry_service.delete_primitives_batch`.*

---

### `DELETE /api/geometry/object/{object_id}` {#op-delete-api-geometry-object-object-id}

Delete Object

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `geometry_service.delete_object`.*

---

### `GET /api/geometry/objects` {#op-get-api-geometry-objects}

Get Objects

**Response** — `200`, `application/json`

```json
{
  "objects": [
    {
      "object_id": 1,
      "name": "Ground.001",
      "type": "ground",
      "primitive_uuids": [
        0,
        1
      ],
      "visible": true
    }
  ]
}
```

*Built by `geometry.get_objects`.*

---

### `POST /api/geometry/patch` {#op-post-api-geometry-patch}

Add Patch

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "center": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "size": {
    "x": 1.0,
    "y": 1.0
  },
  "color": {
    "r": 0.5,
    "g": 0.5,
    "b": 0.5
  }
}
```

Fields — [`PatchRequest`](#patchrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `size` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `color` | [`RGBColorModel`](#rgbcolormodel) | no | `{"r": 0.5, "g": 0.5, "b": 0.5}` |  |

**Response** — `200`, `application/json`

```json
{
  "uuid": 0,
  "object_id": 1
}
```

*Built by `geometry_service.add_patch`.*

---

### `POST /api/geometry/tile` {#op-post-api-geometry-tile}

Add Tile

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "center": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "size": {
    "x": 1.0,
    "y": 1.0
  },
  "subdivisions": {
    "x": 1,
    "y": 1
  },
  "color": {
    "r": 0.5,
    "g": 0.5,
    "b": 0.5
  }
}
```

Fields — [`TileRequest`](#tilerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `size` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `subdivisions` | [`Int2Model`](#int2model) | no | `{"x": 1, "y": 1}` |  |
| `color` | [`RGBColorModel`](#rgbcolormodel) | no | `{"r": 0.5, "g": 0.5, "b": 0.5}` |  |

**Response** — `200`, `application/json`

```json
{
  "uuids": [
    0,
    1,
    2,
    3
  ],
  "object_id": 1
}
```

*Built by `geometry_service.add_tile`.*

---

### `POST /api/geometry/tile/textured` {#op-post-api-geometry-tile-textured}

Add Textured Tile

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "center": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "size": {
    "x": 1.0,
    "y": 1.0
  },
  "rotation": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "subdivisions": {
    "x": 1,
    "y": 1
  },
  "texture_file": "textures/soil.jpg",
  "texture_repeat": {
    "x": 1,
    "y": 1
  },
  "color": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  }
}
```

Fields — [`TexturedTileRequest`](#texturedtilerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `size` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `rotation` | [`Vec3Model`](#vec3model) \| null | no |  |  |
| `subdivisions` | [`Int2Model`](#int2model) | no | `{"x": 1, "y": 1}` |  |
| `texture_file` | string | **yes** |  |  |
| `texture_repeat` | [`Int2Model`](#int2model) \| null | no |  |  |
| `color` | [`Vec3Model`](#vec3model) \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "object_id": 1,
  "uuids": [
    0,
    1
  ],
  "material_label": "mat_1"
}
```

*Built by `geometry_service.add_textured_tile`.*

---

### `POST /api/geometry/triangle/textured` {#op-post-api-geometry-triangle-textured}

Add Textured Triangle

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "v0": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "v1": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "v2": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "texture_file": "textures/soil.jpg",
  "uv0": {
    "x": 1.0,
    "y": 1.0
  },
  "uv1": {
    "x": 1.0,
    "y": 1.0
  },
  "uv2": {
    "x": 1.0,
    "y": 1.0
  }
}
```

Fields — [`TexturedTriangleRequest`](#texturedtrianglerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `v0` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `v1` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `v2` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `texture_file` | string | **yes** |  |  |
| `uv0` | [`Vec2Model`](#vec2model) | **yes** |  |  |
| `uv1` | [`Vec2Model`](#vec2model) | **yes** |  |  |
| `uv2` | [`Vec2Model`](#vec2model) | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "uuid": 0,
  "object_id": 1
}
```

*Built by `geometry_service.add_textured_triangle`.*

---

### `DELETE /api/geometry/{uuid}` {#op-delete-api-geometry-uuid}

Delete Primitive

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `uuid` | path | integer | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `geometry_service.delete_primitive`.*

---

## Schemas

### `Int2Model`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `x` | integer | no | `1` |  |
| `y` | integer | no | `1` |  |

### `PatchRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `size` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `color` | [`RGBColorModel`](#rgbcolormodel) | no | `{"r": 0.5, "g": 0.5, "b": 0.5}` |  |

### `RGBColorModel`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `r` | number | no | `0.5` |  |
| `g` | number | no | `0.5` |  |
| `b` | number | no | `0.5` |  |

### `TexturedTileRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `size` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `rotation` | [`Vec3Model`](#vec3model) \| null | no |  |  |
| `subdivisions` | [`Int2Model`](#int2model) | no | `{"x": 1, "y": 1}` |  |
| `texture_file` | string | **yes** |  |  |
| `texture_repeat` | [`Int2Model`](#int2model) \| null | no |  |  |
| `color` | [`Vec3Model`](#vec3model) \| null | no |  |  |

### `TexturedTriangleRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `v0` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `v1` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `v2` | [`Vec3Model`](#vec3model) | **yes** |  |  |
| `texture_file` | string | **yes** |  |  |
| `uv0` | [`Vec2Model`](#vec2model) | **yes** |  |  |
| `uv1` | [`Vec2Model`](#vec2model) | **yes** |  |  |
| `uv2` | [`Vec2Model`](#vec2model) | **yes** |  |  |

### `TileRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `size` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `subdivisions` | [`Int2Model`](#int2model) | no | `{"x": 1, "y": 1}` |  |
| `color` | [`RGBColorModel`](#rgbcolormodel) | no | `{"r": 0.5, "g": 0.5, "b": 0.5}` |  |

### `Vec2Model`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `x` | number | no | `1.0` |  |
| `y` | number | no | `1.0` |  |

### `Vec3Model`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `x` | number | no | `0.0` |  |
| `y` | number | no | `0.0` |  |
| `z` | number | no | `0.0` |  |

