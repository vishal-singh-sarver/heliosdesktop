<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `tree` endpoints

*Generated 2026-09-10.*

3 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `POST /api/tree/build` {#op-post-api-tree-build}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Build Tree

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "type": "Almond",
  "origin": {
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "scale": 1.0
}
```

Fields — [`TreeBuildRequest`](#treebuildrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `type` | string | no | `"Almond"` |  |
| `origin` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `scale` | number | no | `1.0` |  |

**Response** — `200`, `application/json`

```json
{
  "tree_id": 0,
  "trunk_uuids": [
    0
  ],
  "branch_uuids": [
    1,
    2
  ],
  "leaf_uuids": [
    3,
    4
  ],
  "all_uuids": [
    0,
    1,
    2,
    3,
    4
  ],
  "object_id": 2
}
```

*Built by `tree_service.build_tree`.*

---

### `GET /api/tree/types` {#op-get-api-tree-types}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Tree Types

**Response** — `200`, `application/json`

```json
{
  "types": [
    "Almond",
    "Apple",
    "Avocado",
    "Lemon",
    "Olive",
    "Orange",
    "Peach",
    "Pistachio",
    "Walnut"
  ]
}
```

*Built by `tree_service.get_tree_types`.*

---

### `GET /api/tree/{tree_id}/parts` {#op-get-api-tree-tree-id-parts}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Tree Parts

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `tree_id` | path | integer | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "trunk_uuids": [
    0
  ],
  "branch_uuids": [
    1,
    2
  ],
  "leaf_uuids": [
    3,
    4
  ]
}
```

*Built by `tree_service.get_tree_parts`.*

---

## Schemas

### `TreeBuildRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `type` | string | no | `"Almond"` |  |
| `origin` | [`Vec3Model`](#vec3model) | no | `{"x": 0.0, "y": 0.0, "z": 0.0}` |  |
| `scale` | number | no | `1.0` |  |

### `Vec3Model`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `x` | number | no | `0.0` |  |
| `y` | number | no | `0.0` |  |
| `z` | number | no | `0.0` |  |

