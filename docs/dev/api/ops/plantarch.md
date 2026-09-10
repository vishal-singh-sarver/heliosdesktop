<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `plantarch` endpoints

*Generated 2026-09-10.*

4 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/plantarch/canopy` {#op-get-api-plantarch-canopy}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Alias kept for frontend compatibility.

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "species": "string",
  "canopy_center": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "plant_spacing": {
    "x": 1.0,
    "y": 1.0
  },
  "plant_count_x": 3,
  "plant_count_y": 3,
  "age": 30.0
}
```

Fields — [`CanopyBuildRequest`](#canopybuildrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `species` | string | **yes** |  |  |
| `canopy_center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `plant_spacing` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `plant_count_x` | integer | no | `3` |  |
| `plant_count_y` | integer | no | `3` |  |
| `age` | number | no | `30.0` |  |

**Response** — `200`, `application/json`

```json
{
  "plant_ids": [
    0,
    1
  ],
  "uuids": [
    0,
    1,
    2
  ],
  "object_id": 3
}
```

*Built by `canopy_service.build_canopy` · confidence: **likely**.*

---

### `POST /api/plantarch/canopy` {#op-post-api-plantarch-canopy}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Build Canopy

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "species": "string",
  "canopy_center": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "plant_spacing": {
    "x": 1.0,
    "y": 1.0
  },
  "plant_count_x": 3,
  "plant_count_y": 3,
  "age": 30.0
}
```

Fields — [`CanopyBuildRequest`](#canopybuildrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `species` | string | **yes** |  |  |
| `canopy_center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `plant_spacing` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `plant_count_x` | integer | no | `3` |  |
| `plant_count_y` | integer | no | `3` |  |
| `age` | number | no | `30.0` |  |

**Response** — `200`, `application/json`

```json
{
  "plant_ids": [
    0,
    1
  ],
  "uuids": [
    0,
    1,
    2
  ],
  "object_id": 3
}
```

*Built by `canopy_service.build_canopy` · confidence: **likely**.*

---

### `POST /api/plantarch/canopy/stream` {#op-post-api-plantarch-canopy-stream}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Build Canopy Stream

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "species": "string",
  "canopy_center": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "plant_spacing": {
    "x": 1.0,
    "y": 1.0
  },
  "plant_count_x": 3,
  "plant_count_y": 3,
  "age": 30.0
}
```

Fields — [`CanopyBuildRequest`](#canopybuildrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `species` | string | **yes** |  |  |
| `canopy_center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `plant_spacing` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `plant_count_x` | integer | no | `3` |  |
| `plant_count_y` | integer | no | `3` |  |
| `age` | number | no | `30.0` |  |

**Response** — `200`, `text/event-stream`

Server-Sent Events reporting build progress, terminating on a `done` event.

*Built by `plantarch.build_canopy_stream`.*

---

### `GET /api/plantarch/species` {#op-get-api-plantarch-species}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Plant Species

**Response** — `200`, `application/json`

```json
{
  "species": [
    "almond",
    "bean",
    "cowpea",
    "maize"
  ]
}
```

*Built by `canopy_service.get_plant_species`.*

---

## Schemas

### `CanopyBuildRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `species` | string | **yes** |  |  |
| `canopy_center` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `plant_spacing` | [`Vec2Model`](#vec2model) | no | `{"x": 1.0, "y": 1.0}` |  |
| `plant_count_x` | integer | no | `3` |  |
| `plant_count_y` | integer | no | `3` |  |
| `age` | number | no | `30.0` |  |

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

