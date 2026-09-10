<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `import` endpoints

*Generated 2026-09-10.*

2 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `POST /api/import/obj` {#op-post-api-import-obj}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Import Obj

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "file_path": "textures/soil.jpg",
  "origin": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "scale": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "rotation": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  }
}
```

Fields — [`ImportRequest`](#importrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `file_path` | string | **yes** |  |  |
| `origin` | [`Vec3Model`](#vec3model) \| null | no |  |  |
| `scale` | [`Vec3Model`](#vec3model) \| null | no |  |  |
| `rotation` | [`Vec3Model`](#vec3model) \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "uuids": [
    0,
    1
  ],
  "object_id": 5,
  "name": "mesh"
}
```

BROKEN: import_service calls get_context() with no argument against a signature that requires one — this raises TypeError and returns 500.

*Built by `import_service.import_obj` · confidence: **unsure**.*

---

### `POST /api/import/ply` {#op-post-api-import-ply}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Import Ply

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "file_path": "textures/soil.jpg",
  "origin": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "scale": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "rotation": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  }
}
```

Fields — [`ImportRequest`](#importrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `file_path` | string | **yes** |  |  |
| `origin` | [`Vec3Model`](#vec3model) \| null | no |  |  |
| `scale` | [`Vec3Model`](#vec3model) \| null | no |  |  |
| `rotation` | [`Vec3Model`](#vec3model) \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "uuids": [
    0,
    1
  ],
  "object_id": 5,
  "name": "mesh"
}
```

BROKEN: same TypeError as /api/import/obj.

*Built by `import_service.import_ply` · confidence: **unsure**.*

---

## Schemas

### `ImportRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `file_path` | string | **yes** |  |  |
| `origin` | [`Vec3Model`](#vec3model) \| null | no |  |  |
| `scale` | [`Vec3Model`](#vec3model) \| null | no |  |  |
| `rotation` | [`Vec3Model`](#vec3model) \| null | no |  |  |

### `Vec3Model`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `x` | number | no | `0.0` |  |
| `y` | number | no | `0.0` |  |
| `z` | number | no | `0.0` |  |

